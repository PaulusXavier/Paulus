// Lógica do Worker (sem nada específico da Cloudflare, para poder ser testada no Node).
//   criarManipulador({ base, apps, indice? }) devolve  async (request, env) => Response
//
// env:
//   AI               binding do Workers AI (obrigatório)
//   ALLOWED_ORIGINS  endereços dos apps, separados por vírgula, sem barra no fim
//                    (aceita também o nome antigo ALLOWED_ORIGIN)
//   MODELO           opcional. Padrão: @cf/meta/llama-3.3-70b-instruct-fp8-fast
//   MODELO_RESERVA   opcional. Padrão: @cf/meta/llama-3.1-8b-instruct. Usado se o MODELO falhar (ex.: cota gratuita do dia acabou).
//   MODELO_INTERPRETE opcional. Modelo do passo de interpretação (padrão: o mesmo MODELO).
//
// Pedido (POST, JSON): { app, pergunta, pagina, historico:[{papel,texto}], fichas:[...], stream }
//   panorama (opcional): texto com os totais do diretório por grupo, montado pelo app (até 3000 caracteres).
//   acoes (opcional): [{ id, rotulo, descricao? }] o que o app sabe abrir/fazer; a IA pode PROPOR até 2 (linha "AÇÕES NO APP: id"), o navegador valida e vira botão.
//   Aceita também o formato antigo do Argo: sem "app" (vale "argo") e "contexto" no lugar de "fichas".
//   modo: 'interpretar'  (opcional): em vez de responder, devolve { interpretacao: { pergunta, intencao, bairro, esclarecer } | null }
//   (a pergunta reescrita de forma completa, usando a conversa; ver worker/interpretar.mjs).
//   habilidades (opcional em criarManipulador): roteiros de trabalho carregados de knowledge/habilidades.json (ver docs/HABILIDADES.md).
// Resposta com stream:true  -> text/event-stream:  data: {"fontes":[...]}  data: {"habilidades":["nome"]}  data: {"t":"..."}  data: [DONE]
// Resposta sem stream       -> JSON { resposta, fontes, habilidades }
// O Worker não grava nada: nem pergunta, nem resposta, nem IP (o IP só fica na memória, por um minuto).

import { temDadoPessoal, limparMarcacao } from '../shared/pii.mjs';
import { normalizar, criarIndice, buscar, consultaComContexto, fonteDe, K_PADRAO } from '../shared/busca.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { trechosDaRota, combinarComBusca } from '../shared/suicidio.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { montarMensagens } from './prompt.mjs';
import { montarMensagensInterpretacao, lerInterpretacao } from './interpretar.mjs';

// Padrão: modelo grande (raciocina e segue as regras muito melhor) e, se ele falhar (ex.: cota gratuita do dia),
// o pequeno assume sozinho.
const MODELO_PADRAO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MODELO_RESERVA_PADRAO = '@cf/meta/llama-3.1-8b-instruct';
const MAX_PERGUNTA = 1200;
const MAX_CORPO = 32000;
// Cada pergunta usa até 2 chamadas (interpretar + responder), por isso o limite é o dobro do antigo.
const LIMITE_POR_MINUTO = 16;
const AVISO_PESSOAL = 'Para proteger as famílias, não consigo analisar mensagens com nome, documento, telefone ou endereço residencial. Reescreva a pergunta sem identificar ninguém.';

function origensPermitidas(env) {
  return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',').map(function (o) { return o.trim().replace(/\/+$/, ''); }).filter(Boolean);
}

// Modelos diferentes devolvem o texto em formatos um pouco diferentes.
function extrairTexto(saida) {
  if (!saida) return '';
  if (typeof saida === 'string') return saida.trim();
  if (typeof saida.response === 'string') return saida.response.trim();
  const msg = saida.choices && saida.choices[0] && saida.choices[0].message;
  return msg && typeof msg.content === 'string' ? msg.content.trim() : '';
}

function extrairPedaco(ev) {
  if (!ev) return '';
  if (typeof ev.response === 'string') return ev.response;
  const c = ev.choices && ev.choices[0];
  if (c && c.delta && typeof c.delta.content === 'string') return c.delta.content;
  if (c && typeof c.text === 'string') return c.text;
  return '';
}

// Converte o fluxo do Workers AI no formato simples que o navegador lê: data: {"t":"..."}
function normalizarFluxo(upstream, fontes, habilidades) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '';
  let enviou = false;
  const emitir = function (ctl, obj) { ctl.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n')); };
  const tratarLinha = function (ctl, linha) {
    const t = linha.trim();
    if (t.indexOf('data:') !== 0) return;
    const corpo = t.slice(5).trim();
    if (!corpo || corpo === '[DONE]') return;
    try {
      const p = extrairPedaco(JSON.parse(corpo));
      if (p) { enviou = true; emitir(ctl, { t: p }); }
    } catch (e) { /* linha incompleta ou de controle: ignora */ }
  };
  return upstream.pipeThrough(new TransformStream({
    start(ctl) {
      if (fontes.length) emitir(ctl, { fontes: fontes });
      if (habilidades.length) emitir(ctl, { habilidades: habilidades });
    },
    transform(chunk, ctl) {
      buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
      const linhas = buf.split('\n');
      buf = linhas.pop();
      for (const l of linhas) tratarLinha(ctl, l);
    },
    flush(ctl) {
      if (buf) tratarLinha(ctl, buf);
      if (!enviou) emitir(ctl, { erro: 'Resposta vazia.' });
      ctl.enqueue(enc.encode('data: [DONE]\n\n'));
    }
  }));
}

async function chamarIA(env, mensagens, stream, extra) {
  const ajuste = extra || {};
  const principal = ajuste.modelo || env.MODELO || MODELO_PADRAO;
  const reserva = env.MODELO_RESERVA || MODELO_RESERVA_PADRAO;
  const params = { messages: mensagens, max_tokens: ajuste.max_tokens || 900, temperature: ajuste.temperature != null ? ajuste.temperature : 0.4, stream: !!stream };
  try {
    return await env.AI.run(principal, params);
  } catch (e) {
    if (reserva === principal) throw e;
    return await env.AI.run(reserva, params);
  }
}

export function criarManipulador({ base, apps, indice: indicePronto, habilidades: listaHabilidades = [] }) {
  // indicePronto (opcional): índice pré-calculado em build-knowledge; sem ele (ou se não bater com a base), calcula aqui.
  const indice = criarIndice(base, indicePronto);
  const recentes = new Map(); // limite simples por IP (vale por instância do Worker)

  function estourouLimite(ip) {
    const agora = Date.now();
    const lista = (recentes.get(ip) || []).filter(function (t) { return agora - t < 60000; });
    lista.push(agora);
    recentes.set(ip, lista);
    if (recentes.size > 500) {
      for (const [k, v] of recentes) if (!v.some(function (t) { return agora - t < 60000; })) recentes.delete(k);
    }
    return lista.length > LIMITE_POR_MINUTO;
  }

  return async function manipular(request, env) {
    const origem = request.headers.get('Origin') || '';
    const permitidas = origensPermitidas(env);
    if (!origem || !permitidas.includes(origem)) return new Response('Origem não permitida', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origem,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = function (obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' }) });
    };
    const sse = function (corpo) {
      return new Response(corpo, { headers: Object.assign({}, cors, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }) });
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
    if (!env.AI || typeof env.AI.run !== 'function') return json({ erro: 'Workers AI não está ligado a este Worker.' }, 500);

    const texto = await request.text();
    if (texto.length > MAX_CORPO) return json({ erro: 'Pedido grande demais.' }, 413);
    let corpo;
    try { corpo = JSON.parse(texto); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
    if (!corpo || typeof corpo !== 'object') return json({ erro: 'JSON inválido.' }, 400);

    const nomeApp = String(corpo.app || 'argo').toLowerCase();
    const app = Object.prototype.hasOwnProperty.call(apps, nomeApp) ? apps[nomeApp] : null;
    if (!app) return json({ erro: 'App desconhecido.' }, 400);

    const pergunta = limparMarcacao(String(corpo.pergunta || '')).replace(/\s+/g, ' ').slice(0, MAX_PERGUNTA);
    if (!pergunta) return json({ erro: 'Pergunta vazia.' }, 400);
    const interpretar = corpo.modo === 'interpretar';
    const querStream = corpo.stream === true && !interpretar;

    // Socorro vem antes do filtro de dados pessoais e do limite por minuto: nunca é barrado e não chama a IA.
    const crise = detectarCrise(pergunta);
    if (crise && interpretar) return json({ interpretacao: null, crise: true });
    if (crise) {
      const resposta = crise.titulo + '\n' + crise.texto + '\n' + crise.telefones.map(function (t) { return '- ' + t.numero + ' ' + t.nome; }).join('\n');
      if (!querStream) return json({ resposta: resposta, fontes: [], crise: true, subtipo: crise.subtipo });
      return sse('data: ' + JSON.stringify({ t: resposta }) + '\n\ndata: [DONE]\n\n');
    }

    // O navegador já filtrou; aqui se confere de novo, porque o Worker não pode confiar em quem chama.
    if (temDadoPessoal(pergunta)) {
      if (interpretar) return json({ interpretacao: null });
      if (!querStream) return json({ resposta: AVISO_PESSOAL, fontes: [] });
      return sse('data: ' + JSON.stringify({ t: AVISO_PESSOAL }) + '\n\ndata: [DONE]\n\n');
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    if (estourouLimite(ip)) return json({ erro: 'Muitas perguntas seguidas. Aguarde um minuto.' }, 429);

    // Interpretação: só reescreve e classifica a pergunta (nada de busca nem resposta). Falha da IA não derruba o app.
    if (interpretar) {
      let texto;
      try {
        texto = extrairTexto(await chamarIA(env, montarMensagensInterpretacao({ app: app, historico: corpo.historico, pergunta: pergunta }), false,
          { modelo: env.MODELO_INTERPRETE, max_tokens: 220, temperature: 0 }));
      } catch (e) {
        return json({ erro: 'A IA não respondeu agora.' }, 502);
      }
      return json({ interpretacao: lerInterpretacao(texto, pergunta) });
    }

    const anteriores = Array.isArray(corpo.historico) ? corpo.historico.filter(function (h) { return h && h.papel === 'usuario' && !temDadoPessoal(String(h.texto || '')); }) : [];
    const consulta = consultaComContexto(pergunta, anteriores);
    // Pergunta técnica sobre suicídio: a rota puxa o conjunto certo da cartilha e a busca completa as vagas.
    const rota = trechosDaRota(indice, consulta);
    const achados = rota.length
      ? combinarComBusca(rota, buscar(indice, consulta, { k: K_PADRAO }))
      : buscar(indice, consulta, { k: K_PADRAO });
    const fontes = achados.map(function (a) { return fonteDe(a.trecho); });
    const tema = rota.length > 0 || /suicid|ideacao|autolesao|automutil/.test(normalizar(consulta));
    // Habilidades (roteiros de trabalho): só quando a pergunta combina. Em tema de suicídio a resposta é só cuidado e rede, sem roteiro.
    const habilidades = tema ? [] : escolherHabilidades(listaHabilidades, pergunta, anteriores, nomeApp);
    const nomesHabilidades = habilidades.map(function (h) { return h.nome; });
    const mensagens = montarMensagens({
      suicidio: tema,
      habilidades: habilidades,
      app: app,
      pagina: corpo.pagina,
      historico: corpo.historico,
      fichas: Array.isArray(corpo.fichas) ? corpo.fichas : corpo.contexto,
      panorama: corpo.panorama,
      // Em tema de suicídio a resposta é só cuidado e rede de apoio: nada de botões de navegação.
      acoes: tema ? [] : corpo.acoes,
      achados: achados,
      pergunta: pergunta
    });

    let saida;
    try {
      // Habilidade que entrega texto pronto (relatório, ofício, plano...) precisa de mais espaço que a resposta de conversa.
      saida = await chamarIA(env, mensagens, querStream, habilidades.some(function (h) { return h.texto; }) ? { max_tokens: 1400 } : undefined);
    } catch (e) {
      return json({ erro: 'A IA não respondeu agora (a cota gratuita do dia pode ter acabado).' }, 502);
    }

    if (querStream && saida && typeof saida.pipeThrough === 'function') return sse(normalizarFluxo(saida, fontes, nomesHabilidades));

    const resposta = extrairTexto(saida);
    if (!resposta) return json({ erro: 'Resposta vazia.' }, 502);
    return json({ resposta: resposta, fontes: fontes, habilidades: nomesHabilidades });
  };
}
