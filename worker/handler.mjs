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
//   preferencias (opcional): { tamanho:"curto"|"detalhado", exemplos:true, temas:[idDoDocumento] } aprendidas no aparelho; só códigos de lista fechada e ids de documentos da própria base (worker/prompt.mjs). Ignoradas em tema de suicídio.
//   baseApp (opcional): [{ titulo, texto, origem }] verbetes e valores do próprio app (até 4).
//   panorama (opcional): texto com os totais do diretório por grupo, montado pelo app (até 3000 caracteres).
//   acoes (opcional): [{ id, rotulo, descricao? }] o que o app sabe abrir/fazer; a IA pode PROPOR até 2 (linha "AÇÕES NO APP: id"), o navegador valida e vira botão.
//   Aceita também o formato antigo do Argo: sem "app" (vale "argo") e "contexto" no lugar de "fichas".
//   semPerguntar (opcional): true na segunda tentativa, depois de uma resposta que só perguntou; a IA responde com a premissa mais provável.
//   estado (opcional): { unidade, bairro, municipio, assunto, intencao } o que a conversa já firmou; vira bloco no prompt e evita pedir de novo o que já foi dito (shared/conversa.mjs).
//   modo: 'interpretar'  (opcional): em vez de responder, devolve { interpretacao: { pergunta, intencao, bairro, unidade, esclarecer } | null }
//   (a pergunta reescrita de forma completa, usando a conversa; ver worker/interpretar.mjs).
//   habilidades (opcional em criarManipulador): roteiros de trabalho carregados de knowledge/habilidades.json (ver docs/HABILIDADES.md).
// Resposta com stream:true  -> text/event-stream:  data: {"fontes":[...]}  data: {"habilidades":["nome"]}  data: {"citaveis":{"a":[...],"l":[...],"v":["600","218.5"]}}  data: {"t":"..."}  data: [DONE]
// Resposta sem stream       -> JSON { resposta, fontes, habilidades, citaveis }
// O Worker lê o tipo do pedido (shared/pedido.mjs): cumprimento (prompt mínimo, modelo pequeno), ajuste da resposta anterior, seguimento, consulta ou normal;
// o tipo escolhe quantos trechos buscar, o tamanho da resposta e a temperatura.
// O Worker não grava nada: nem pergunta, nem resposta, nem IP (o IP só fica na memória, por um minuto).

import { temDadoPessoal, limparMarcacao } from '../shared/pii.mjs';
import { normalizar, criarIndice, buscarPergunta, fonteDe, K_PADRAO } from '../shared/busca.mjs';
import { numerosCitaveis } from '../shared/verificacao.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { trechosDaRota, combinarComBusca } from '../shared/suicidio.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { classificarPedido, consultaDoPedido, trechosParaOPedido, perfilDaIA } from '../shared/pedido.mjs';
import { sanearEstado } from '../shared/conversa.mjs';
import { montarMensagens, montarMensagensSaudacao, preferenciasValidas, fichasComoTexto, baseAppComoTexto, panoramaComoTexto } from './prompt.mjs';
import { montarMensagensInterpretacao, lerInterpretacao } from './interpretar.mjs';

// Padrão: modelo grande (raciocina e segue as regras muito melhor) e, se ele falhar (ex.: cota gratuita do dia),
// o pequeno assume sozinho.
const MODELO_PADRAO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MODELO_RESERVA_PADRAO = '@cf/meta/llama-3.1-8b-instruct';
const MAX_PERGUNTA = 1200;
const MAX_CORPO = 64000;
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
// recuperar (opcional): função async que devolve a resposta inteira pelo modelo de reserva. Se o fluxo do modelo principal
// falhar ou terminar sem nenhum texto ANTES de qualquer pedaço sair, a resposta vem da reserva (a pessoa não vê erro).
// Se o fluxo cair no meio, o texto parcial não é completado por outro modelo (viraria uma resposta emendada): vai o aviso de erro.
function normalizarFluxo(upstream, fontes, habilidades, citaveis, recuperar) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let leitor = null, cancelado = false;
  return new ReadableStream({
    async start(ctl) {
      const emitir = function (obj) { if (!cancelado) ctl.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n')); };
      let buf = '', enviou = false, falhou = false;
      const tratarLinha = function (linha) {
        const t = linha.trim();
        if (t.indexOf('data:') !== 0) return;
        const corpo = t.slice(5).trim();
        if (!corpo || corpo === '[DONE]') return;
        try {
          const p = extrairPedaco(JSON.parse(corpo));
          if (p) { enviou = true; emitir({ t: p }); }
        } catch (e) { /* linha incompleta ou de controle: ignora */ }
      };
      if (fontes.length) emitir({ fontes: fontes });
      if (habilidades.length) emitir({ habilidades: habilidades });
      if (citaveis) emitir({ citaveis: citaveis });
      try {
        leitor = upstream.getReader();
        for (;;) {
          const r = await leitor.read();
          if (r.done || cancelado) break;
          buf += typeof r.value === 'string' ? r.value : dec.decode(r.value, { stream: true });
          const linhas = buf.split('\n');
          buf = linhas.pop();
          for (const l of linhas) tratarLinha(l);
        }
        if (buf) tratarLinha(buf);
      } catch (e) { falhou = true; }
      if (!enviou && !cancelado && typeof recuperar === 'function') {
        try {
          const texto = await recuperar();
          if (texto) { enviou = true; falhou = false; emitir({ t: texto }); }
        } catch (e) { /* sem reserva: segue para o aviso de erro */ }
      }
      if (!enviou) emitir({ erro: 'Resposta vazia.' });
      else if (falhou) emitir({ erro: 'A resposta foi interrompida.' });
      if (!cancelado) { ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close(); }
    },
    cancel(motivo) {
      cancelado = true;
      if (leitor) { try { leitor.cancel(motivo); } catch (e) { /* já encerrado */ } }
    }
  });
}

// ajuste: { modelo, reserva, max_tokens, temperature }. A reserva assume se o principal falhar OU devolver texto vazio.
function resolverModelos(env, ajuste) {
  return { principal: ajuste.modelo || env.MODELO || MODELO_PADRAO, reserva: ajuste.reserva || env.MODELO_RESERVA || MODELO_RESERVA_PADRAO };
}

function parametrosDaIA(mensagens, ajuste, stream) {
  return { messages: mensagens, max_tokens: ajuste.max_tokens || 900, temperature: ajuste.temperature != null ? ajuste.temperature : 0.4, stream: !!stream };
}

async function chamarIA(env, mensagens, stream, extra) {
  const ajuste = extra || {};
  const { principal, reserva } = resolverModelos(env, ajuste);
  const params = parametrosDaIA(mensagens, ajuste, stream);
  let saida;
  try {
    saida = await env.AI.run(principal, params);
  } catch (e) {
    if (reserva === principal) throw e;
    return await env.AI.run(reserva, params);
  }
  if (!stream && !extrairTexto(saida) && reserva !== principal) {
    try { return await env.AI.run(reserva, params); } catch (e) { return saida; }
  }
  return saida;
}

export function criarManipulador({ base, apps, indice: indicePronto, habilidades: listaHabilidades = [] }) {
  // indicePronto (opcional): índice pré-calculado em build-knowledge; sem ele (ou se não bater com a base), calcula aqui.
  const indice = criarIndice(base, indicePronto);
  // doc -> título, para validar as preferências que o navegador manda (só entram documentos que existem na própria base)
  const titulosPorDoc = new Map();
  for (const c of base) if (c && c.doc && !titulosPorDoc.has(c.doc)) titulosPorDoc.set(c.doc, c.titulo || c.doc);
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

    // O que a conversa já firmou (unidade, bairro, município, assunto): campos fechados, validados aqui de novo.
    const estadoDaConversa = sanearEstado(corpo.estado);

    // Interpretação: só reescreve e classifica a pergunta (nada de busca nem resposta). Falha da IA não derruba o app.
    if (interpretar) {
      let texto;
      try {
        texto = extrairTexto(await chamarIA(env, montarMensagensInterpretacao({ app: app, historico: corpo.historico, pergunta: pergunta, estado: estadoDaConversa }), false,
          { modelo: env.MODELO_INTERPRETE, max_tokens: 260, temperature: 0 }));
      } catch (e) {
        return json({ erro: 'A IA não respondeu agora.' }, 502);
      }
      return json({ interpretacao: lerInterpretacao(texto, pergunta, { estado: estadoDaConversa, historico: corpo.historico }) });
    }

    // Histórico sem mensagem do(a) profissional que traga dado pessoal (o filtro roda aqui de novo: o Worker não confia em quem chama).
    const hist = Array.isArray(corpo.historico) ? corpo.historico.filter(function (h) { return h && (h.papel !== 'usuario' || !temDadoPessoal(String(h.texto || ''))); }) : [];
    const anteriores = hist.filter(function (h) { return h.papel === 'usuario'; });
    const fichasRecebidas = Array.isArray(corpo.fichas) ? corpo.fichas : corpo.contexto;
    const temFichas = Array.isArray(fichasRecebidas) && fichasRecebidas.length > 0;
    const temPanorama = (typeof corpo.panorama === 'string' && corpo.panorama.trim().length > 0) || (Array.isArray(corpo.baseApp) && corpo.baseApp.length > 0);
    // O Paulus lê o TIPO do pedido sem gastar IA (shared/pedido.mjs): cumprimento, ajuste da resposta anterior, seguimento, consulta ou normal.
    const modo = classificarPedido(pergunta, hist, { temFichas: temFichas, temPanorama: temPanorama });

    let achados = [], fontes = [], habilidades = [], tema = false, mensagens, pref = null;
    if (modo === 'saudacao') {
      // Só cumprimento: prompt mínimo, sem busca de norma e no modelo pequeno (o grande fica de reserva). Poupa a cota gratuita.
      mensagens = montarMensagensSaudacao({ app: app, historico: hist, pergunta: pergunta });
    } else {
      const consulta = consultaDoPedido(pergunta, hist, modo);
      pref = preferenciasValidas(corpo.preferencias, titulosPorDoc);
      const preferir = pref ? Object.fromEntries(pref.temas.map(function (t) { return [t.doc, 1.15]; })) : null;
      // Pergunta técnica sobre suicídio: a rota puxa o conjunto certo da cartilha e a busca completa as vagas.
      const rota = trechosDaRota(indice, consulta);
      const k = trechosParaOPedido(modo, pergunta, K_PADRAO);
      achados = rota.length
        ? combinarComBusca(rota, buscarPergunta(indice, consulta, { k: k, preferir: preferir }))
        : buscarPergunta(indice, consulta, { k: k, preferir: preferir });
      fontes = achados.map(function (a) { return fonteDe(a.trecho); });
      tema = rota.length > 0 || /suicid|ideacao|autolesao|automutil/.test(normalizar(consulta));
      // Habilidades (roteiros de trabalho): só quando a pergunta combina. Em tema de suicídio a resposta é só cuidado e rede, sem roteiro.
      // Seguimento e ajuste herdam o assunto da pergunta anterior ("deixe mais formal" continua no ofício).
      const herda = modo === 'seguimento' || modo === 'refinamento';
      habilidades = tema ? [] : (herda ? escolherHabilidades(listaHabilidades, consulta, [], nomeApp) : escolherHabilidades(listaHabilidades, pergunta, anteriores, nomeApp));
      mensagens = montarMensagens({
        suicidio: tema,
        habilidades: habilidades,
        app: app,
        pagina: corpo.pagina,
        historico: hist,
        estado: estadoDaConversa,
        semPerguntar: corpo.semPerguntar === true,
        fichas: fichasRecebidas,
        panorama: corpo.panorama,
        baseApp: corpo.baseApp,
        // Em tema de suicídio a resposta é só cuidado e rede de apoio: nada de botões de navegação.
        acoes: tema ? [] : corpo.acoes,
        // Em tema de suicídio a resposta segue o protocolo de cuidado, sem ajuste de estilo.
        preferencias: tema ? null : pref,
        achados: achados,
        pergunta: pergunta,
        modo: modo
      });
    }
    const nomesHabilidades = habilidades.map(function (h) { return h.nome; });
    // Artigos e leis que a IA tinha nos trechos que leu: o navegador compara com o que ela citar e avisa se citou algo de fora (shared/verificacao.mjs).
    // Valores em R$ que a IA tinha diante de si (normas, fichas, base do app, panorama) ou que a própria pessoa escreveu.
    const citaveis = modo === 'saudacao' ? null : numerosCitaveis(achados, [
      fichasComoTexto(fichasRecebidas), baseAppComoTexto(corpo.baseApp), panoramaComoTexto(corpo.panorama), pergunta
    ].concat(hist.filter(function (h) { return h && h.papel === 'usuario'; }).map(function (h) { return String(h.texto || ''); })));

    let saida, ajuste;
    try {
      // Parâmetros por situação (shared/pedido.mjs): texto pronto e ajuste precisam de mais espaço; consulta de unidade, de menos criatividade;
      // quem prefere respostas curtas (memória do aparelho) recebe um teto menor.
      ajuste = perfilDaIA({ modo: modo, tema: tema, comTextoPronto: habilidades.some(function (h) { return h.texto; }), pref: tema ? null : pref });
      if (modo === 'saudacao') { ajuste.modelo = env.MODELO_RESERVA || MODELO_RESERVA_PADRAO; ajuste.reserva = env.MODELO || MODELO_PADRAO; }
      saida = await chamarIA(env, mensagens, querStream, ajuste);
    } catch (e) {
      return json({ erro: 'A IA não respondeu agora (a cota gratuita do dia pode ter acabado).' }, 502);
    }

    if (querStream && saida && typeof saida.getReader === 'function') {
      // Se o fluxo do modelo grande falhar ou vier vazio antes de sair texto, o modelo pequeno responde (sem stream) no lugar.
      const { principal, reserva } = resolverModelos(env, ajuste);
      const recuperar = reserva !== principal
        ? async function () { return extrairTexto(await env.AI.run(reserva, parametrosDaIA(mensagens, ajuste, false))); }
        : null;
      return sse(normalizarFluxo(saida, fontes, nomesHabilidades, citaveis, recuperar));
    }

    const resposta = extrairTexto(saida);
    if (!resposta) return json({ erro: 'Resposta vazia.' }, 502);
    return json({ resposta: resposta, fontes: fontes, habilidades: nomesHabilidades, citaveis: citaveis });
  };
}
