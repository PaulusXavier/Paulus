// Lógica do Worker (sem nada específico da Cloudflare, para poder ser testada no Node).
//   criarManipulador({ base, apps, indice? }) devolve  async (request, env) => Response
//
// env:
//   AI               binding do Workers AI (obrigatório)
//   ALLOWED_ORIGINS  endereços dos apps, separados por vírgula, sem barra no fim
//                    (aceita também o nome antigo ALLOWED_ORIGIN)
//   MODELO           opcional. Padrão: @cf/meta/llama-3.3-70b-instruct-fp8-fast
//   MODELO_RESERVA   opcional. Padrão: @cf/meta/llama-3.1-8b-instruct. Usado se o MODELO falhar (ex.: capacidade temporária). Com a cota gratuita do dia esgotada ele NÃO é tentado (mesma franquia): o Worker responde 503 { cota, renova } e o app usa a base de normas.
//   MODELO_INTERPRETE opcional. Modelo do passo de interpretação (padrão: o mesmo MODELO).
//   MODELO_RACIOCINIO opcional. Modelo do passo que monta o esqueleto de análise de perguntas de análise (padrão: o mesmo MODELO). RACIOCINIO="desligado" pula o passo (poupa cota).
//   COTA_CF_CONTA / COTA_CF_TOKEN  opcionais (segredos). Ligam a rota /cota ao consumo do dia (worker/cota.mjs). COTA_NEURONS muda a franquia (padrão 10000).
//   IA_EXTERNA_URL / IA_EXTERNA_MODELO / IA_EXTERNA_CHAVE  opcionais. IA de reserva de outro provedor (API compatível com OpenAI), usada só depois que a cota da Cloudflare recusa (worker/reserva-externa.mjs).
//                    A chave é segredo. Nunca recebe foto, PDF escaneado, documento anexado nem conversa sobre suicídio. IA_EXTERNA="desligado" desliga.
//   MODELO_CALCULO   opcional. Modelo do passo que escreve as contas de uma pergunta de cálculo (padrão: o mesmo MODELO). Quem faz a conta é o programa (shared/calculo.mjs).
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
//   imagem (opcional): { nome, dados:"data:image/jpeg|png|webp;base64,..." } foto já reduzida no aparelho. Um modelo de visão (MODELO_VISAO, MODELO_VISAO_RESERVA) copia o texto e descreve a imagem;
//   só essa leitura, SEM as linhas com dado pessoal, chega ao Paulus (worker/visao.mjs). VISAO="desligado" recusa imagem. A leitura volta em { imagem:{nome,texto,perdidos} } para as próximas perguntas.
//   habilidades (opcional em criarManipulador): roteiros de trabalho carregados de knowledge/habilidades.json (ver docs/HABILIDADES.md).
// Resposta com stream:true  -> text/event-stream:  data: {"fontes":[...]}  data: {"habilidades":["nome"]}  data: {"citaveis":{"a":[...],"l":[...],"v":["600","218.5"]}}  data: {"t":"..."}  data: [DONE]
// Resposta sem stream       -> JSON { resposta, fontes, habilidades, citaveis }
// Pergunta sobre o próprio Paulus ("o que você sabe fazer?"): responde com a ficha de si (<voce>), montada do repositório (shared/autoconhecimento.mjs).
//   autoconhecimento (opcional em criarManipulador): { versao, catalogo } (package.json e knowledge/catalogo.json). Sem ele, a ficha sai da própria base.
// O Worker lê o tipo do pedido (shared/pedido.mjs): cumprimento (prompt mínimo, modelo pequeno), ajuste da resposta anterior, seguimento, consulta ou normal;
// o tipo escolhe quantos trechos buscar, o tamanho da resposta e a temperatura.
// O Worker não grava nada: nem pergunta, nem resposta, nem IP (o IP só fica na memória, por um minuto).

import { firebaseLigado, verificarFirebase } from './firebase.mjs';
import { loginLigado, entrar, criarSessao, verificarSessao, tokenDoPedido, criarFreio, normalizarUsuario, MAX_SENHA, MAX_USUARIO } from './auth.mjs';
import { temDadoPessoal, temIdentificacaoPessoal, limparMarcacao } from '../shared/pii.mjs';
import { docSaneado } from '../shared/documento.mjs';
import { normalizar, criarIndice, buscarFontes, fonteDe, K_PADRAO } from '../shared/busca.mjs';
import { numerosCitaveis, citacoesSemFonte } from '../shared/verificacao.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { idiomaDoPedido, paraBusca, instrucaoDeIdioma, avisoPessoalNoIdioma } from '../shared/idioma.mjs';
import { trechosDaRota, combinarComBusca } from '../shared/suicidio.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { classificarPedido, consultaDoPedido, trechosParaOPedido, perfilDaIA, ehSaudacao, ehSeguimento, partesDaPergunta, pedidoDeDesenho, pedidoDeMatematica } from '../shared/pedido.mjs';
import { sanearEstado } from '../shared/conversa.mjs';
import { escopoDaConversa } from '../shared/escopo.mjs';
import { respostaDiretaDaFicha } from '../shared/consulta-direta.mjs';
import { respostaDeContagem, respostaDeFatoBoaVista, respostaDePolitica, respostaDaBase } from '../shared/resposta-local.mjs';
import { ehPerguntaSobreSi, temasDaPergunta, montarAutoconhecimento, fichaComoTexto } from '../shared/autoconhecimento.mjs';
import { montarMensagens, montarMensagensSaudacao, preferenciasValidas, fichasComoTexto, baseAppComoTexto, panoramaComoTexto } from './prompt.mjs';
import { montarMensagensInterpretacao, lerInterpretacao } from './interpretar.mjs';
import { pareceProblemaDeCalculo, temNumeroPorExtenso } from '../shared/calculo.mjs';
import { contasDoPedido, contasDeProva } from '../shared/calculo-mais.mjs';
import { pedeAnalise, montarMensagensRaciocinio, lerRaciocinio, raciocinioComoTexto, buscaDoRaciocinio, completarAchados, conferirRaciocinio, calibrarSeguranca, tipoDeAnalise, disseSemAnalise, montarMensagensReformatar, limparPensamento } from './raciocinar.mjs';
import { tratarVoz } from './voz.mjs';
import { externaLigada, chamarExterna, conversaSensivel } from './reserva-externa.mjs';
import { consultarCota, ehErroDeCota, marcarCotaEsgotada, cotaMarcadaEsgotada, corpoCotaEsgotada } from './cota.mjs';
import { imagemSaneada, lerImagem, lerImagens, sanearLeitura, CORPO_MAX_COM_IMAGEM, MAX_IMAGENS_POR_PEDIDO } from './visao.mjs';
import { montarMensagensPlano, lerPlano, executarPlano, calculosDiretos, numerosAbonados, valoresDosCalculos, mesclarValores } from './planejar.mjs';
import { buscarWeb, lerPaginaWeb, baixarPdfPublico } from './pesquisa-web.mjs';
import { tratarVozIA } from './voz-ia.mjs';

// Padrão: modelo grande (raciocina e segue as regras muito melhor) e, se ele falhar (ex.: cota gratuita do dia),
// o pequeno assume sozinho.
const MODELO_PADRAO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MODELO_RESERVA_PADRAO = '@cf/meta/llama-3.1-8b-instruct';
const MAX_PERGUNTA = 1200;
const MAX_CORPO = 64000;
// Cada pergunta usa até 2 chamadas (interpretar + responder), por isso o limite é o dobro do antigo.
const LIMITE_POR_MINUTO = 16;
const LIMITE_LOGIN_POR_MINUTO = 20;   // tentativas de /login por IP (qualquer usuário)
const AVISO_PESSOAL = 'Para proteger as famílias, não consigo analisar mensagens com nome, documento, telefone ou endereço residencial. Reescreva a pergunta sem identificar ninguém.';

// Texto dos trechos de norma, só para conferir de onde vieram os números das contas.
function normasComoTextoPlano(achados) {
  return (Array.isArray(achados) ? achados : []).map(function (a) { const t = a && a.trecho; return t ? [t.referencia, t.titulo, t.texto].join(' ') : ''; }).join(' \n ');
}

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
  if (msg && typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim();
  // Modelos de raciocínio (ex.: gpt-oss) podem devolver uma lista "output" com itens de pensamento e de mensagem: só a mensagem vale.
  if (Array.isArray(saida.output)) {
    const partes = [];
    saida.output.forEach(function (item) {
      if (!item || item.type !== 'message' || !Array.isArray(item.content)) return;
      item.content.forEach(function (c) { if (c && typeof c.text === 'string') partes.push(c.text); });
    });
    if (partes.length) return partes.join('').trim();
  }
  return '';
}

function extrairPedaco(ev) {
  if (!ev) return '';
  if (typeof ev.response === 'string') return ev.response;
  const c = ev.choices && ev.choices[0];
  if (c && c.delta && typeof c.delta.content === 'string') return c.delta.content;
  if (c && typeof c.text === 'string') return c.text;
  return '';
}

// Autocorreção de citações. O prompt proíbe citar artigo, lei ou valor que não esteja nas fontes, mas modelo erra, e o navegador só AVISA.
// Quando a resposta pronta cita algo fora do que a IA leu (shared/verificacao.mjs), a IA é chamada UMA vez para reescrever sem a citação.
// A reescrita só vale se tiver MENOS citações sem fonte, não for curta demais e não trouxer dado pessoal; senão fica a resposta original.
// CORRECAO="desligado" (wrangler.toml) pula o passo. Falha ou demora: a resposta segue como estava (o aviso do navegador continua).
const TEMPO_CORRECAO_MS = 9000;

// A correção só TIRA citações: não precisa do prompt de sistema inteiro (~6 mil tokens) nem das fontes de novo.
// Vai uma instrução curta, a pergunta e o rascunho. Sem pergunta legível, mantém a conversa como estava.
export function basEnxutaDaCorrecao(mensagens) {
  const lista = Array.isArray(mensagens) ? mensagens : [];
  const ultima = lista.length ? lista[lista.length - 1] : null;
  const texto = ultima && ultima.role === 'user' ? String(ultima.content || '') : '';
  const m = /<pergunta>([\s\S]*?)<\/pergunta>/.exec(texto);
  const pergunta = (m ? m[1] : '').trim().slice(0, 700);
  if (!pergunta) return lista;
  return [
    { role: 'system', content: 'Você é o Paulus, copiloto de IA do SUAS. Tarefa: revisar uma resposta que você já escreveu, tirando citações (artigo, lei, valor) que não constam das fontes consultadas. Não acrescente fato, número, artigo, nome de unidade, telefone nem dado de pessoa. Mantenha o tom, o formato e as linhas SUGESTÕES e AÇÕES NO APP, se houver.' },
    { role: 'user', content: '<pergunta>\n' + pergunta + '\n</pergunta>' }
  ];
}

export function montarMensagensCorrecao(mensagens, rascunho, sem) {
  return (Array.isArray(mensagens) ? mensagens : []).concat([
    { role: 'assistant', content: String(rascunho || '').slice(0, 6000) },
    { role: 'user', content: 'Conferência automática: sua resposta cita ' + sem.slice(0, 5).join(', ') + ', que NÃO aparece nas fontes consultadas para esta pergunta. ' +
      'Reescreva a resposta inteira, no mesmo tom e no mesmo formato, sem essas citações: tire o artigo, a lei ou o valor, ou diga que não consta nas fontes e que é preciso conferir o normativo vigente. ' +
      'Não troque por outro número ou artigo de cabeça. Mantenha o resto, inclusive as linhas SUGESTÕES e AÇÕES NO APP, se houver. Responda só com o texto reescrito, sem comentar a correção.' }
  ]);
}

// Texto corrigido, ou '' quando não há o que corrigir ou a reescrita não serve.
// ctx: { env, mensagens, ajuste, citaveis, fontes, vistos }
export async function corrigirCitacoes(ctx, rascunho) {
  const { env, mensagens, ajuste, citaveis, fontes, vistos } = ctx;
  try {
    if (!citaveis || !rascunho || String(env.CORRECAO || '').toLowerCase() === 'desligado') return '';
    const sem = citacoesSemFonte(rascunho, citaveis, fontes, vistos);
    if (!sem.length) return '';
    let temporizador;
    const limite = new Promise(function (_, rej) { temporizador = setTimeout(function () { rej(new Error('tempo')); }, TEMPO_CORRECAO_MS); });
    let novo;
    try {
      novo = extrairTexto(await Promise.race([
        chamarIA(env, montarMensagensCorrecao(basEnxutaDaCorrecao(mensagens), rascunho, sem), false, { modelo: ajuste && ajuste.modelo, max_tokens: (ajuste && ajuste.max_tokens) || 900, temperature: 0 }),
        limite
      ]));
    } finally { clearTimeout(temporizador); }
    novo = limparPensamento(novo || '');
    if (!novo || novo.length < 40 || novo.length < rascunho.length * 0.4) return '';
    if (temDadoPessoal(novo)) return '';
    if (citacoesSemFonte(novo, citaveis, fontes, vistos).length >= sem.length) return '';
    // Quem tinha linha de sugestões ou de ações no rascunho não pode perdê-la na reescrita.
    if (/SUGEST[ÕO]ES:/.test(rascunho) && !/SUGEST[ÕO]ES:/.test(novo)) return '';
    if (/A[ÇC][ÕO]ES NO APP:/.test(rascunho) && !/A[ÇC][ÕO]ES NO APP:/.test(novo)) return '';
    return novo;
  } catch (e) { return ''; }
}

// Converte o fluxo do Workers AI no formato simples que o navegador lê: data: {"t":"..."}
// recuperar (opcional): função async que devolve a resposta inteira pelo modelo de reserva. Se o fluxo do modelo principal
// falhar ou terminar sem nenhum texto ANTES de qualquer pedaço sair, a resposta vem da reserva (a pessoa não vê erro).
// Se o fluxo cair no meio, o texto parcial não é completado por outro modelo (viraria uma resposta emendada): vai o aviso de erro.
function normalizarFluxo(upstream, fontes, habilidades, citaveis, recuperar, imagemLida, corrigir, externa) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let leitor = null, cancelado = false;
  return new ReadableStream({
    async start(ctl) {
      const emitir = function (obj) { if (!cancelado) ctl.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n')); };
      let buf = '', enviou = false, falhou = false, acumulado = '';
      const tratarLinha = function (linha) {
        const t = linha.trim();
        if (t.indexOf('data:') !== 0) return;
        const corpo = t.slice(5).trim();
        if (!corpo || corpo === '[DONE]') return;
        try {
          const p = extrairPedaco(JSON.parse(corpo));
          if (p) { enviou = true; acumulado += p; emitir({ t: p }); }
        } catch (e) { /* linha incompleta ou de controle: ignora */ }
      };
      if (fontes.length) emitir({ fontes: fontes });
      if (habilidades.length) emitir({ habilidades: habilidades });
      if (citaveis) emitir({ citaveis: citaveis });
      if (imagemLida) emitir({ imagem: imagemLida });
      if (externa) emitir({ externa: true });
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
          if (texto) { enviou = true; falhou = false; acumulado = texto; emitir({ t: texto }); }
        } catch (e) { /* sem reserva: segue para o aviso de erro */ }
      }
      // Resposta inteira já na tela e com citação sem fonte: a versão corrigida substitui a primeira (o navegador troca o texto).
      if (enviou && !falhou && !cancelado && typeof corrigir === 'function') {
        const novo = await corrigir(acumulado);
        if (novo) emitir({ corrigido: novo });
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

// Cache de prefixo do Workers AI: o começo do prompt de sistema (regras e normas fixas, milhares de tokens) é igual em
// todas as perguntas; o cabeçalho x-session-affinity leva as chamadas ao mesmo servidor, que já tem esse começo
// processado. Fica mais rápido e gasta menos da cota. O valor é só um rótulo de roteamento (nada da pessoa nem da conversa):
// Uso de uma pessoa só: um rótulo fixo leva todas as chamadas ao servidor que já tem o prefixo pronto (antes, 8 rótulos
// sorteados reprocessavam o mesmo prefixo em até 8 servidores). Se muita gente passar a usar junto, aumente BALDES.
const BALDES = 1;
const AFINIDADE = 'paulus-' + (BALDES > 1 ? Math.floor(Math.random() * BALDES) : 0);
const OPCOES_IA = { extraHeaders: { 'x-session-affinity': AFINIDADE } };

// IA de reserva externa (worker/reserva-externa.mjs): só quando a cota da Cloudflare recusa, e nunca nos casos em que o pedido marcou
// env.__semExterna (imagem, documento anexado, conversa sobre suicídio). Falhou ou não está ligada: sobe o erro de cota de antes (503).
function externaPossivel(env) { return externaLigada(env) && !env.__semExterna; }

function fluxoDeTexto(textoPronto) {
  const enc = new TextEncoder();
  const fluxo = new ReadableStream({ start(ctl) { ctl.enqueue(enc.encode('data: ' + JSON.stringify({ response: textoPronto }) + '\n\n')); ctl.close(); } });
  fluxo.externa = true;
  return fluxo;
}

async function viaExterna(env, mensagens, stream, ajuste, erroCota) {
  if (!externaPossivel(env)) throw erroCota;
  let r;
  try { r = await chamarExterna(env, mensagens, ajuste); } catch (e) { throw erroCota; }
  return stream ? fluxoDeTexto(r.response) : r;
}

async function chamarIA(env, mensagens, stream, extra) {
  const ajuste = extra || {};
  const { principal, reserva } = resolverModelos(env, ajuste);
  const params = parametrosDaIA(mensagens, ajuste, stream);
  // Cota do dia já esgotada (marcada há pouco): nem tenta. Os dois modelos gastam da mesma franquia, então falhariam igual e a pessoa esperaria à toa.
  if (cotaMarcadaEsgotada()) { const e = new Error('4006: daily free allocation used up'); e.code = 4006; return viaExterna(env, mensagens, stream, ajuste, e); }
  let saida;
  try {
    saida = await env.AI.run(principal, params, OPCOES_IA);
  } catch (e) {
    // Cota acabou: o modelo reserva usa a mesma franquia e também falharia; o erro sobe para virar a resposta de cota esgotada.
    if (ehErroDeCota(e)) { marcarCotaEsgotada(); return viaExterna(env, mensagens, stream, ajuste, e); }
    if (reserva === principal) throw e;
    try {
      return await env.AI.run(reserva, params, OPCOES_IA);
    } catch (e2) {
      if (ehErroDeCota(e2)) { marcarCotaEsgotada(); return viaExterna(env, mensagens, stream, ajuste, e2); }
      throw e2;
    }
  }
  if (!stream && !extrairTexto(saida) && reserva !== principal) {
    try { return await env.AI.run(reserva, params, OPCOES_IA); } catch (e) { return saida; }
  }
  return saida;
}

// A conversa vem falando do próprio Paulus? Olha a pergunta-raiz (pula "oi", "mais curto" e os seguimentos em cadeia):
// "o que você sabe fazer?" seguida de "e quais normas?" continua sendo sobre ele.
function conversaSobreSi(hist) {
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (!h || h.papel !== 'usuario' || !h.texto) continue;
    const t = String(h.texto).slice(0, 300);
    if (ehPerguntaSobreSi(t)) return true;
    if (ehSaudacao(t) || ehSeguimento(t)) continue;
    return false;
  }
  return false;
}

// O navegador manda o histórico, mas o Worker não confia em quem chama: só entram itens { papel: string, texto: string }, no máximo 40,
// cada texto com até 4000 caracteres. Antes de cortar, o filtro de dados pessoais rodava no texto inteiro (até 64 KB), e um "texto" que não
// era string (ex.: {"toString":1}) derrubava o Worker com exceção.
function historicoSaneado(h) {
  if (!Array.isArray(h)) return [];
  const saida = [];
  for (const x of h.slice(-40)) {
    if (!x || typeof x !== 'object') continue;
    const papel = typeof x.papel === 'string' ? x.papel : '';
    const texto = typeof x.texto === 'string' ? x.texto.slice(0, 4000) : '';
    if (papel && texto) saida.push({ papel: papel, texto: texto });
  }
  return saida;
}

// Fichas, base do app e panorama vêm do app e deveriam ser só dado PÚBLICO (diretório de unidades, verbetes). O Worker não confia nisso:
// item que identifica uma pessoa (e-mail, documento, nome depois de gatilho) é descartado antes de chegar ao prompt.
// Telefone e endereço não entram na checagem: são justamente o que o diretório de unidades traz.
function textoDoItem(x) {
  if (typeof x === 'string') return x;
  if (!x || typeof x !== 'object') return '';
  return Object.keys(x).map(function (k) { return typeof x[k] === 'string' ? x[k] : ''; }).join(' \n ');
}
function itensPublicos(lista) {
  return Array.isArray(lista) ? lista.filter(function (x) { return !temIdentificacaoPessoal(textoDoItem(x).slice(0, 6000)); }) : lista;
}

// Catálogo mínimo (um item por documento) tirado da própria base, para quando o index.mjs não manda o knowledge/catalogo.json.
function catalogoDaBase(base) {
  const docs = new Map();
  for (const c of base) {
    if (!c || !c.doc) continue;
    if (!docs.has(c.doc)) docs.set(c.doc, { doc: c.doc, titulo: c.titulo || c.doc, norma: c.norma, ano: c.ano, tipo: c.tipo || 'norma', trechos: 0 });
    docs.get(c.doc).trechos++;
  }
  return Array.from(docs.values());
}

// autoconhecimento (opcional): { versao, catalogo } para o Paulus saber o que tem (shared/autoconhecimento.mjs). Sem ele, usa a própria base.
export function criarManipulador({ base, apps, indice: indicePronto, habilidades: listaHabilidades = [], autoconhecimento: dadosAuto = {} }) {
  const ficha = montarAutoconhecimento({
    versao: (dadosAuto && dadosAuto.versao) || '',
    catalogo: (dadosAuto && Array.isArray(dadosAuto.catalogo) && dadosAuto.catalogo.length) ? dadosAuto.catalogo : catalogoDaBase(base),
    habilidades: listaHabilidades,
    apps: apps
  });
  // indicePronto (opcional): índice pré-calculado em build-knowledge; sem ele (ou se não bater com a base), calcula aqui.
  const indice = criarIndice(base, indicePronto);
  // doc -> título, para validar as preferências que o navegador manda (só entram documentos que existem na própria base)
  const titulosPorDoc = new Map();
  for (const c of base) if (c && c.doc && !titulosPorDoc.has(c.doc)) titulosPorDoc.set(c.doc, c.titulo || c.doc);
  const recentes = new Map(); // limite simples por IP (vale por instância do Worker)
  const freio = criarFreio();   // bloqueio crescente de tentativas de login (por IP + usuário)

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

  const tentativasLogin = new Map();
  function estourouLimiteLogin(ip) {
    const agora = Date.now();
    const lista = (tentativasLogin.get(ip) || []).filter(function (t) { return agora - t < 60000; });
    lista.push(agora);
    tentativasLogin.set(ip, lista);
    if (tentativasLogin.size > 500) {
      for (const [k, v] of tentativasLogin) if (!v.some(function (t) { return agora - t < 60000; })) tentativasLogin.delete(k);
    }
    return lista.length > LIMITE_LOGIN_POR_MINUTO;
  }

  async function tratar(request, env) {
    const origem = request.headers.get('Origin') || '';
    const permitidas = origensPermitidas(env);
    if (!origem || !permitidas.includes(origem)) return new Response('Origem não permitida', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origem,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = function (obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' }) });
    };
    // Falha da IA: cota do dia esgotada vira 503 com a hora da renovação (o navegador passa a responder com a base de normas e para de insistir);
    // qualquer outra falha segue como 502 com a mensagem de antes.
    const falhaDaIA = function (e, textoPadrao) {
      if (ehErroDeCota(e)) { marcarCotaEsgotada(); return json(corpoCotaEsgotada(), 503); }
      return json({ erro: textoPadrao }, 502);
    };
    const sse = function (corpo) {
      return new Response(corpo, { headers: Object.assign({}, cors, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }) });
    };

    const rota = new URL(request.url).pathname.replace(/\/+$/, '');
    const consultaEstadoWorkflow = request.method === 'GET' && /^\/investigacao\/[A-Za-z0-9_-]{1,128}$/.test(rota);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' && !consultaEstadoWorkflow) return json({ erro: 'Use POST.' }, 405);

    // Login (worker/auth.mjs). Só existe com AUTH_SEGREDO e USUARIOS configurados; sem eles o Worker segue aberto, como antes.
    const ipDoPedido = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    const senhaLigada = loginLigado(env);
    const fbLigado = firebaseLigado(env);
    const exigeLogin = senhaLigada || fbLigado;
    // Sessão do login por senha (worker/auth.mjs) ou ID token do Firebase (worker/firebase.mjs): vale qualquer um dos dois que estiver ligado.
    const sessaoDoPedido = async function () {
      const tk = tokenDoPedido(request);
      if (senhaLigada) { const v = await verificarSessao(env, tk); if (v) return v; }
      if (fbLigado) { const v = await verificarFirebase(env, tk); if (v) return v; }
      return null;
    };
    if (rota === '/login' || rota === '/sessao') {
      if (!exigeLogin) return json({ login: false, erro: 'Login não está ativado neste Worker.' }, rota === '/login' ? 404 : 200);
      if (rota === '/sessao') {
        const v = await sessaoDoPedido();
        return v ? json({ ok: true, usuario: v.usuario, expira: v.expira }) : json({ erro: 'Sessão inválida ou vencida.', metodo: fbLigado && !senhaLigada ? 'firebase' : 'senha' }, 401);
      }
      if (!senhaLigada) return json({ erro: 'Este Worker usa o login do Firebase.', metodo: 'firebase' }, 404);
      if (Number(request.headers.get('Content-Length')) > 2000) return json({ erro: 'Pedido grande demais.' }, 413);
      // Teto por IP em qualquer usuário: o freio abaixo é por IP + usuário, e trocar de usuário a cada tentativa o contornaria
      // (cada tentativa também gasta uma derivação PBKDF2). Vale só por instância do Worker, como o limite de perguntas.
      if (estourouLimiteLogin(ipDoPedido)) return json({ erro: 'Muitas tentativas. Aguarde para tentar de novo.', espera: 60 }, 429);
      const bruto = await request.text();
      if (bruto.length > 2000) return json({ erro: 'Pedido grande demais.' }, 413);
      let dados;
      try { dados = JSON.parse(bruto); } catch (e) { dados = null; }
      if (!dados || typeof dados.usuario !== 'string' || typeof dados.senha !== 'string' || !dados.usuario.trim() || !dados.senha) return json({ erro: 'Informe usuário e senha.' }, 400);
      if (dados.senha.length > MAX_SENHA || dados.usuario.length > MAX_USUARIO) return json({ erro: 'Informe usuário e senha.' }, 400);
      const nome = normalizarUsuario(dados.usuario);
      const espera = Math.ceil(freio.espera(ipDoPedido, nome) / 1000);
      if (espera > 0) return json({ erro: 'Muitas tentativas. Aguarde para tentar de novo.', espera: espera }, 429);
      const conta = await entrar(env, dados.usuario, dados.senha);
      if (!conta) {
        freio.errou(ipDoPedido, nome);
        const depois = Math.ceil(freio.espera(ipDoPedido, nome) / 1000);
        return depois > 0 ? json({ erro: 'Usuário ou senha incorretos. Acesso bloqueado por alguns instantes.', espera: depois }, 401) : json({ erro: 'Usuário ou senha incorretos.' }, 401);
      }
      freio.acertou(ipDoPedido, nome);
      const sessao = await criarSessao(env, conta, { lembrar: dados.lembrar === true });
      return json({ ok: true, token: sessao.token, usuario: sessao.usuario, expira: sessao.expira });
    }
    if (exigeLogin && !(await sessaoDoPedido())) return json({ erro: 'Entre para usar o Paulus.' }, 401);
    // Rotas de pesquisa externa têm os mesmos controlos de origem, autenticação e limite por IP do chat.
    // A página/PDF é sempre recolhida como dado público, nunca como instrução para executar.
    if (rota === '/pesquisa' || rota === '/pesquisa/pagina' || rota === '/pesquisa/pdf' || rota === '/investigacao' || rota === '/voz-ia' || consultaEstadoWorkflow) {
      if (estourouLimite(ipDoPedido)) return json({ erro: 'Muitos pedidos. Aguarde para tentar de novo.' }, 429);
    }
    if (rota === '/voz-ia') return tratarVozIA(request, env, json, cors);
    if (rota === '/pesquisa/pdf') {
      if (Number(request.headers.get('Content-Length')) > 2048) return json({ erro: 'Pedido grande demais.' }, 413);
      let dados;
      try { const cru = await request.text(); if (cru.length > 2048) return json({ erro: 'Pedido grande demais.' }, 413); dados = JSON.parse(cru); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
      if (!dados || typeof dados.url !== 'string') return json({ erro: 'Informe a URL do PDF público.' }, 400);
      try {
        const pdf = await baixarPdfPublico(dados.url);
        return new Response(pdf.bytes, { status: 200, headers: Object.assign({}, cors, { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.bytes.byteLength), 'Content-Disposition': 'inline; filename="documento-publico.pdf"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }) });
      } catch (e) { return json({ erro: 'Não foi possível baixar um PDF público válido dentro do limite de 1 MB.' }, 400); }
    }
    if (rota === '/pesquisa' || rota === '/pesquisa/pagina') {
      if (Number(request.headers.get('Content-Length')) > 4096) return json({ erro: 'Pedido grande demais.' }, 413);
      let dados;
      try { const cru = await request.text(); if (cru.length > 4096) return json({ erro: 'Pedido grande demais.' }, 413); dados = JSON.parse(cru); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return json({ erro: 'JSON inválido.' }, 400);
      if (rota === '/pesquisa') {
        const consulta = typeof dados.query === 'string' ? dados.query.trim().slice(0, 500) : '';
        if (!consulta) return json({ erro: 'Informe uma pesquisa.' }, 400);
        if (temDadoPessoal(consulta)) return json({ erro: AVISO_PESSOAL }, 400);
        try { return json({ results: await buscarWeb(consulta, { limit: 8 }) }); }
        catch (e) { return json({ erro: 'A pesquisa Web não está disponível neste momento.' }, 502); }
      }
      if (typeof dados.url !== 'string') return json({ erro: 'Informe a URL pública HTTPS.' }, 400);
      try { return json(await lerPaginaWeb(dados.url, { maxChars: 18000 })); }
      catch (e) { return json({ erro: 'Não foi possível ler esta página pública. Confirme a URL HTTPS e tente outra fonte.' }, 400); }
    }
    if (rota === '/investigacao') {
      if (Number(request.headers.get('Content-Length')) > 2048) return json({ erro: 'Pedido grande demais.' }, 413);
      let dados;
      try { const cru = await request.text(); if (cru.length > 2048) return json({ erro: 'Pedido grande demais.' }, 413); dados = JSON.parse(cru); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
      const pergunta = dados && (typeof dados.query === 'string' ? dados.query : dados.question);
      if (typeof pergunta !== 'string' || !pergunta.trim()) return json({ erro: 'Informe a pergunta de investigação.' }, 400);
      if (temDadoPessoal(pergunta)) return json({ erro: AVISO_PESSOAL }, 400);
      if (!env.INVESTIGACAO || typeof env.INVESTIGACAO.create !== 'function') return json({ erro: 'O Workflow de investigação não está configurado neste Worker.' }, 503);
      try {
        const instancia = await env.INVESTIGACAO.create({ params: { query: pergunta.trim().slice(0, 400) } });
        return json({ id: instancia.id, status: 'queued' }, 202);
      } catch (e) { return json({ erro: 'Não foi possível iniciar a investigação durável.' }, 503); }
    }
    if (consultaEstadoWorkflow) {
      if (!env.INVESTIGACAO || typeof env.INVESTIGACAO.get !== 'function') return json({ erro: 'O Workflow de investigação não está configurado neste Worker.' }, 503);
      const id = rota.slice('/investigacao/'.length);
      try {
        const instancia = await env.INVESTIGACAO.get(id);
        const estadoWorkflow = await instancia.status();
        return json({ id: id, status: estadoWorkflow.status || 'unknown', output: estadoWorkflow.status === 'complete' ? (estadoWorkflow.output || null) : null, erro: estadoWorkflow.status === 'errored' ? 'A investigação falhou.' : undefined });
      } catch (e) { return json({ erro: 'Investigação não encontrada ou estado indisponível.' }, 404); }
    }
    // Voz própria (worker/voz.mjs): só repassa o texto ao servidor de voz; não usa a IA nem o corpo de pergunta abaixo.
    if (rota === '/voz') return tratarVoz(request, env, json, cors);
    // Cota da IA (worker/cota.mjs): quanto da franquia diária do Workers AI já foi usado, quando acaba e quando renova.
    // Só números agregados (neurons por hora e por modelo); não usa a IA nem lê pergunta, resposta ou conversa. Exige o mesmo login das demais rotas.
    if (rota === '/cota') return json(await consultarCota(env));
    if (!env.AI || typeof env.AI.run !== 'function') return json({ erro: 'Workers AI não está ligado a este Worker.' }, 500);

    // Pedido só de texto: até 64 KB. Com foto ou até cinco páginas escaneadas, já reduzidas no aparelho, o teto sobe.
    if (Number(request.headers.get('Content-Length')) > CORPO_MAX_COM_IMAGEM) return json({ erro: 'Pedido grande demais.' }, 413);
    const texto = await request.text();
    if (texto.length > CORPO_MAX_COM_IMAGEM || (texto.length > MAX_CORPO && texto.indexOf('"imagem"') < 0 && texto.indexOf('"imagens"') < 0)) return json({ erro: 'Pedido grande demais.' }, 413);
    let corpo;
    // Chaves que redefinem a conversão para texto (ex.: {"toString":1}) fazem String()/join() estourarem em qualquer campo: saem na leitura.
    try { corpo = JSON.parse(texto, function (k, v) { return (k === 'toString' || k === 'valueOf' || k === 'toJSON') ? undefined : v; }); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return json({ erro: 'JSON inválido.' }, 400);

    corpo.historico = historicoSaneado(corpo.historico);
    corpo.fichas = itensPublicos(corpo.fichas);
    corpo.contexto = itensPublicos(corpo.contexto);
    corpo.baseApp = itensPublicos(corpo.baseApp);
    if (typeof corpo.panorama === 'string' && temIdentificacaoPessoal(corpo.panorama.slice(0, 6000))) corpo.panorama = '';
    const nomeApp = String(corpo.app || 'argo').toLowerCase();
    const app = Object.prototype.hasOwnProperty.call(apps, nomeApp) ? apps[nomeApp] : null;
    if (!app) return json({ erro: 'App desconhecido.' }, 400);

    const pergunta = limparMarcacao(String(corpo.pergunta || '')).replace(/\s+/g, ' ').slice(0, MAX_PERGUNTA);
    if (!pergunta) return json({ erro: 'Pergunta vazia.' }, 400);
    const interpretar = corpo.modo === 'interpretar';
    const querStream = corpo.stream === true && !interpretar;
    const documento = !interpretar && corpo.documento ? docSaneado(corpo.documento) : null;

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
      const avisoP = avisoPessoalNoIdioma(idiomaDoPedido(pergunta, corpo.historico), AVISO_PESSOAL);
      if (!querStream) return json({ resposta: avisoP, fontes: [] });
      return sse('data: ' + JSON.stringify({ t: avisoP }) + '\n\ndata: [DONE]\n\n');
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    // Limitador da Cloudflare (opcional, vale para todas as instâncias; veja wrangler.toml). Se não existir ou falhar, vale só o limite local abaixo.
    if (env.LIMITADOR && typeof env.LIMITADOR.limit === 'function') {
      try {
        const r = await env.LIMITADOR.limit({ key: ip });
        if (r && r.success === false) return json({ erro: 'Muitas perguntas seguidas. Aguarde um minuto.' }, 429);
      } catch (e) { /* sem o limitador global: segue com o local */ }
    }
    if (estourouLimite(ip)) return json({ erro: 'Muitas perguntas seguidas. Aguarde um minuto.' }, 429);

    // O que a conversa já firmou (unidade, bairro, município, assunto): campos fechados, validados aqui de novo.
    const estadoDaConversa = sanearEstado(corpo.estado);

    // Documento anexado sem nenhum trecho aproveitável (dado pessoal ou vazio): não responde como se o tivesse lido.
    if (corpo.documento && !interpretar && (!documento || !documento.n)) {
      const avisoD = 'Não consegui usar o documento: os trechos têm dados pessoais (nome, CPF, e-mail...) ou não há texto. Anexe uma versão sem identificação das pessoas.';
      if (!querStream) return json({ resposta: avisoD, fontes: [] });
      return sse('data: ' + JSON.stringify({ t: avisoD }) + '\n\ndata: [DONE]\n\n');
    }

    // Imagem ou página escaneada (worker/visao.mjs): a visão vê o arquivo antes do filtro; só o texto saneado segue ao Paulus.
    // Fica depois do socorro, do filtro da pergunta e do limite por minuto: a leitura gasta uma chamada de IA a mais.
    let imagemLida = null;
    const imagensDoPedido = Array.isArray(corpo.imagens) ? corpo.imagens : (corpo.imagem ? [corpo.imagem] : []);
    // Foto, PDF escaneado, documento anexado e conversa sobre suicídio ou autolesão nunca vão à IA de reserva externa (worker/reserva-externa.mjs).
    if (imagensDoPedido.length || corpo.documento || conversaSensivel(pergunta, corpo.historico)) env = Object.assign({}, env, { __semExterna: true });
    if (imagensDoPedido.length && !interpretar) {
      const recusa = function (texto) {
        if (!querStream) return json({ resposta: texto, fontes: [] });
        return sse('data: ' + JSON.stringify({ t: texto }) + '\n\ndata: [DONE]\n\n');
      };
      if (String(env.VISAO || '').toLowerCase() === 'desligado') return recusa('A leitura de imagens está desligada neste Worker. Descreva o que a imagem mostra, sem dados de pessoas, ou anexe um documento de texto.');
      if (imagensDoPedido.length > MAX_IMAGENS_POR_PEDIDO) return recusa('Posso ler até cinco páginas escaneadas por vez. Divida o PDF e tente novamente.');
      const imagens = imagensDoPedido.map(imagemSaneada);
      if (imagens.some(function (x) { return !x; })) return recusa('Não consegui usar a imagem: aceito JPG, PNG ou WebP, de tamanho moderado. Tire outra foto ou reduza a imagem.');
      const pdfEscaneado = corpo.pdfEscaneado === true || Array.isArray(corpo.imagens);
      let bruto;
      if (cotaMarcadaEsgotada()) return json(corpoCotaEsgotada(), 503);
      try {
        bruto = pdfEscaneado ? await lerImagens(env, imagens, pergunta) : await lerImagem(env, imagens[0], pergunta);
      } catch (e) {
        return falhaDaIA(e, 'Não consegui ler a imagem ou o PDF escaneado agora (a cota gratuita do dia pode ter acabado).');
      }
      const leitura = sanearLeitura(bruto);
      if (!leitura.n) return recusa('Não consegui usar a imagem: não achei nela texto nem conteúdo que eu possa usar sem dados pessoais (nome, CPF, telefone, endereço). Anexe outra foto, sem identificação das pessoas.');
      const paginas = pdfEscaneado ? imagens.length : 1;
      imagemLida = { nome: pdfEscaneado ? 'PDF escaneado' : imagens[0].nome, texto: leitura.texto, perdidos: leitura.perdidos, paginas: paginas, paginasTotal: Math.max(paginas, Math.min(10000, Number(corpo.paginasTotal) || paginas)), pdfEscaneado: pdfEscaneado };
    }

    // Interpretação: só reescreve e classifica a pergunta (nada de busca nem resposta). Falha da IA não derruba o app.
    if (interpretar) {
      let texto;
      if (cotaMarcadaEsgotada() && !externaPossivel(env)) return json(corpoCotaEsgotada(), 503);
      try {
        texto = extrairTexto(await chamarIA(env, montarMensagensInterpretacao({ app: app, historico: corpo.historico, pergunta: pergunta, estado: estadoDaConversa }), false,
          { modelo: env.MODELO_INTERPRETE, max_tokens: 260, temperature: 0 }));
      } catch (e) {
        return falhaDaIA(e, 'A IA não respondeu agora.');
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
    // Com imagem, "oi" não é só cumprimento: a pessoa quer que eu olhe a foto.
    const modoBruto = classificarPedido(pergunta, hist, { temFichas: temFichas, temPanorama: temPanorama });
    const modo = (imagemLida && modoBruto === 'saudacao') ? 'normal' : modoBruto;

    // Consulta de UMA unidade (só telefone, endereço ou horário) com a ficha na mão: o programa copia a ficha e a IA não é chamada
    // (shared/consulta-direta.mjs). Qualquer dúvida (várias unidades, palavra a mais, pedido de explicação) segue o caminho normal.
    // CONSULTA_DIRETA="desligado" (wrangler.toml) manda toda consulta para a IA, como antes.
    if (modo === 'consulta' && !imagemLida && !documento && String(env.CONSULTA_DIRETA || '').toLowerCase() !== 'desligado') {
      const direta = respostaDiretaDaFicha(pergunta, fichasRecebidas);
      if (direta) {
        if (!querStream) return json({ resposta: direta.texto, fontes: [], direta: true });
        return sse('data: ' + JSON.stringify({ t: direta.texto }) + '\n\ndata: [DONE]\n\n');
      }
    }

    // Resposta local (shared/resposta-local.mjs): contagem e lista de equipamentos por bairro ("quantas escolas tem no Centro?") sai do diretório
    // de Boa Vista, sem IA. RESPOSTA_LOCAL="desligado" (wrangler.toml) manda tudo para a IA, como antes.
    const respostaLocalLigada = String(env.RESPOSTA_LOCAL || '').toLowerCase() !== 'desligado';
    const responderLocal = function (texto, fontesLocais) {
      if (!querStream) return json({ resposta: texto, fontes: fontesLocais || [], direta: true, local: true });
      return sse((fontesLocais && fontesLocais.length ? 'data: ' + JSON.stringify({ fontes: fontesLocais }) + '\n\n' : '') + 'data: ' + JSON.stringify({ t: texto }) + '\n\ndata: [DONE]\n\n');
    };
    if (respostaLocalLigada && !imagemLida && !documento && (modo === 'normal' || modo === 'consulta')) {
      const contagem = respostaDeContagem(pergunta);
      if (contagem) return responderLocal(contagem.texto, contagem.fontes);
    }

    // Cota do dia esgotada (marcada há pouco): não monta busca, raciocínio nem prompt para uma chamada que vai falhar. O navegador responde com a base de normas.
    if (cotaMarcadaEsgotada() && !externaPossivel(env)) return json(corpoCotaEsgotada(), 503);

    let comMatematica = false, idiomaExtra = '', leitura = '', raciocinio = '', tipoAnalise = '', achados = [], fontes = [], habilidades = [], tema = false, sobreSi = false, partesDaMsg = [], voce = '', mensagens, pref = null, calculos = null, quantitativo = false, textosDaPessoa = [];
    if (modo === 'saudacao') {
      // Só cumprimento: prompt mínimo, sem busca de norma e no modelo pequeno (o grande fica de reserva). Poupa a cota gratuita.
      mensagens = montarMensagensSaudacao({ app: app, historico: hist, pergunta: pergunta, idioma: idiomaDoPedido(pergunta, hist).resposta });
    } else {
      const infoIdioma = idiomaDoPedido(pergunta, hist);
      // Pergunta em espanhol ou inglês: a base de normas está em português, então a busca recebe também os termos em português (shared/espanhol.mjs e shared/ingles.mjs).
      const consulta = (consultaDoPedido(pergunta, hist, modo) + ' ' + paraBusca(pergunta)).trim();
      idiomaExtra = instrucaoDeIdioma(infoIdioma, pergunta, hist);
      const partes = partesDaMsg = (modo === 'normal' || modo === 'seguimento') ? partesDaPergunta(pergunta) : [];
      pref = preferenciasValidas(corpo.preferencias, titulosPorDoc);
      const preferir = pref ? Object.fromEntries(pref.temas.map(function (t) { return [t.doc, 1.15]; })) : null;
      // Pergunta técnica sobre suicídio: a rota puxa o conjunto certo da cartilha e a busca completa as vagas.
      // Pergunta sobre o próprio Paulus ("o que você sabe fazer?", "de onde vêm suas respostas?"): ele responde com a ficha de si
      // (<voce>), sem buscar norma, roteiro nem conta, para não citar artigo ao falar de si. Pedido de ajuste só reescreve a resposta anterior.
      sobreSi = modo !== 'refinamento' && modo !== 'continuar' && modo !== 'porque' && modo !== 'contestacao' && (ehPerguntaSobreSi(pergunta) || (modo === 'seguimento' && temasDaPergunta(pergunta).length > 0 && conversaSobreSi(hist)));
      const rota = sobreSi ? [] : trechosDaRota(indice, consulta);
      const k = trechosParaOPedido(modo, pergunta, K_PADRAO);
      // buscarFontes (shared/busca.mjs) escolhe QUAIS trechos valem para esta pergunta: artigo pedido primeiro, fonte fraca fora, aderência marcada.
      const opcoesBusca = { k: k, preferir: preferir, modo: modo, temDiretorio: temFichas || temPanorama };
      achados = sobreSi ? [] : rota.length
        ? combinarComBusca(rota, buscarFontes(indice, consulta, opcoesBusca))
        : buscarFontes(indice, consulta, opcoesBusca);
      // Várias perguntas na mesma mensagem: cada uma ganha a sua busca (até 3 trechos novos no total), senão só a primeira teria fonte.
      if (!sobreSi && !rota.length && partes.length >= 2) {
        for (const parte of partes.slice(0, 3)) if (achados.length < k + 3) achados = completarAchados(achados, buscarFontes(indice, parte, { k: 2 })).achados;
      }
      fontes = achados.map(function (a) { return fonteDe(a.trecho, a); });
      // Dado de Boa Vista, pergunta frequente de política (Bolsa Família, CadÚnico) ou definição de sigla ("o que é o PAIF?"): o programa mostra
      // a seção da base com a fonte e a IA não é chamada. Análise, caso, texto pedido, conta, outro idioma e tema sensível seguem para a IA.
      if (respostaLocalLigada && modo === 'normal' && !imagemLida && !documento && !idiomaExtra && !sobreSi && !rota.length
          && !contasDoPedido(pergunta, { hoje: 0 }) && !pareceProblemaDeCalculo(pergunta) && !pedidoDeDesenho(pergunta) && !pedidoDeMatematica(pergunta)) {
        const daBase = respostaDeFatoBoaVista(pergunta, base) || respostaDePolitica(pergunta, base) || respostaDaBase(pergunta, achados, { analise: pedeAnalise(pergunta, modo, hist), partes: partes.length, sobreSi: sobreSi, rota: rota.length > 0 });
        if (daBase) return responderLocal(daBase.texto, daBase.escolhidos.map(function (a) { return fonteDe(a.trecho, a); }));
      }
      // Compreensão: quando a busca por palavras não achou nada que responda (a pessoa falou "o bolsa caiu pra vizinha" e a norma escreve
      // "bloqueio do benefício"), a IA relê a pergunta com a conversa inteira, diz o que a pessoa quer e quais palavras técnicas a norma usaria,
      // e a busca roda de novo com isso. Só roda quando a primeira busca falhou (uma chamada a mais só nesses casos).
      // COMPREENSAO="desligado" pula o passo. Falha ou lixo da IA: a resposta segue como antes.
      const buscaFraca = !achados.length || achados.every(function (a) { return a.aderencia === 'baixa'; });
      if (!sobreSi && !rota.length && buscaFraca && (modo === 'normal' || modo === 'seguimento') && String(env.COMPREENSAO || '').toLowerCase() !== 'desligado' && !contasDoPedido(pergunta, { hoje: 0 }) && !pareceProblemaDeCalculo(pergunta, hist) && normalizar(pergunta).split(' ').filter(Boolean).length >= 3) {
        try {
          const leit = lerInterpretacao(extrairTexto(await chamarIA(env, montarMensagensInterpretacao({ app: app, historico: hist, pergunta: pergunta, estado: estadoDaConversa }), false,
            { modelo: env.MODELO_INTERPRETE, max_tokens: 320, temperature: 0 })), pergunta, { estado: estadoDaConversa, historico: hist });
          if (leit) {
            const nova = [leit.pergunta, leit.termos].filter(Boolean).join(' ').trim();
            if (nova && normalizar(nova) !== normalizar(pergunta)) {
              const novos = buscarFontes(indice, nova, opcoesBusca);
              if (novos.some(function (a) { return a.aderencia !== 'baixa'; })) {
                achados = novos;
                fontes = achados.map(function (a) { return fonteDe(a.trecho, a); });
              }
            }
            const reescrita = leit.pergunta && normalizar(leit.pergunta) !== normalizar(pergunta) ? leit.pergunta : '';
            if (reescrita || leit.sentido) leitura = (leit.sentido ? 'O que a pessoa quer resolver: ' + leit.sentido + (/[.!?]$/.test(leit.sentido) ? '' : '.') + ' ' : '') + (reescrita ? 'Em outras palavras: ' + reescrita : '');
          }
        } catch (e) { /* sem a releitura a resposta segue como antes */ }
      }
      tema = !sobreSi && (rota.length > 0 || /suicid|ideacao|autolesao|automutil/.test(normalizar(consulta)));
      if (tema) env = Object.assign({}, env, { __semExterna: true });
      // Habilidades (roteiros de trabalho): só quando a pergunta combina. Em tema de suicídio a resposta é só cuidado e rede, sem roteiro.
      // Seguimento e ajuste herdam o assunto da pergunta anterior ("deixe mais formal" continua no ofício).
      const herda = modo === 'seguimento' || modo === 'refinamento' || modo === 'continuar' || modo === 'porque' || modo === 'contestacao';
      habilidades = (tema || sobreSi) ? [] : (herda ? escolherHabilidades(listaHabilidades, consulta, [], nomeApp) : escolherHabilidades(listaHabilidades, (pergunta + ' ' + paraBusca(pergunta)).trim(), anteriores, nomeApp));
      // Pergunta de conta: o programa calcula (shared/calculo.mjs), a IA só explica. Falha aqui nunca derruba a resposta.
      // Questão de matemática de prova (na mensagem ou na foto): resolve-se por raciocínio em passos (prompt de matemática), sem o passo de contas do SUAS.
      comMatematica = !tema && !sobreSi && (pedidoDeMatematica(pergunta) || (!!imagemLida && pedidoDeMatematica(imagemLida.texto)));
      if (!tema && !sobreSi && modo !== 'refinamento' && modo !== 'continuar' && modo !== 'porque') {
        textosDaPessoa = [pergunta].concat(anteriores.map(function (h) { return String(h.texto || ''); }));
        // Questão ou prova de matemática (texto ou foto): o programa só confere o que a IA erra com frequência e que outras questões vizinhas não confundem
        // (bijeções com ordem e logaritmos com dados aproximados); as regras do SUAS olhariam várias questões como se fossem uma só.
        const diretas = (comMatematica ? contasDeProva(String(pergunta || '') + ' ' + (imagemLida ? imagemLida.texto : '')) : null) || contasDoPedido(pergunta, { hoje: Math.floor((Date.now() - 4 * 3600000) / 86400000) }); // dia de Boa Vista (UTC-4)
        const problema = !comMatematica && pareceProblemaDeCalculo(pergunta, hist);
        quantitativo = !!diretas || problema;
        if (diretas && diretas.soConta) {
          calculos = calculosDiretos(diretas);
        } else if (problema) {
          try {
            const abonados = numerosAbonados(textosDaPessoa.concat([normasComoTextoPlano(achados), fichasComoTexto(fichasRecebidas), baseAppComoTexto(corpo.baseApp), panoramaComoTexto(corpo.panorama)]));
            const textoPlano = extrairTexto(await chamarIA(env, montarMensagensPlano({ app: app, historico: hist, pergunta: pergunta, achados: achados, fichas: fichasRecebidas, baseApp: corpo.baseApp, habilidades: habilidades }), false,
              { modelo: env.MODELO_CALCULO, max_tokens: 420, temperature: 0 }));
            const plano = lerPlano(textoPlano);
            if (plano.contas.length || plano.faltas.length) calculos = executarPlano(plano, abonados, { extenso: temNumeroPorExtenso(pergunta) });
          } catch (e) { /* sem o passo de cálculo a IA responde como antes, sem inventar número (regras do prompt) */ }
        }
        if ((!calculos || (!calculos.itens.length && !calculos.faltas.length)) && diretas) calculos = calculosDiretos(diretas);
      }
      // Pergunta de análise (posso/devo, elegibilidade, caso pensado junto): a IA monta antes o esqueleto (fato, regra, exceção, o que falta, caminho).
      // Falha ou fora do formato: a resposta segue como antes. Fora de tema de suicídio e de pedido de conta resolvido só pelo programa.
      if (!tema && !sobreSi && String(env.RACIOCINIO || '').toLowerCase() !== 'desligado' && !comMatematica && !(calculos && !calculos.faltas.length && quantitativo) && pedeAnalise(pergunta, modo, hist)) {
        try {
          tipoAnalise = tipoDeAnalise(pergunta, hist);
          const mensagensRac = montarMensagensRaciocinio({ app: app, historico: hist, pergunta: pergunta, achados: achados, fichas: fichasRecebidas, baseApp: corpo.baseApp, habilidades: habilidades, panorama: corpo.panorama, tipo: tipoAnalise, partes: partes, modo: modo });
          // 1000 tokens: o caderno PENSAR e as 11 linhas cabem sem cortar o fim (SEGURANCA). Modelo que pensa em voz alta (<think>) tem o pensamento removido antes da leitura.
          const ajusteRac = { modelo: env.MODELO_RACIOCINIO, max_tokens: 1000, temperature: 0.2 };
          let textoRac = limparPensamento(extrairTexto(await chamarIA(env, mensagensRac, false, ajusteRac)));
          let lido = lerRaciocinio(textoRac);
          // Fora do formato (e não foi "SEM ANALISE"): uma segunda tentativa, só pedindo as linhas rotuladas.
          if (!lido && textoRac && !disseSemAnalise(textoRac)) {
            textoRac = limparPensamento(extrairTexto(await chamarIA(env, montarMensagensReformatar(mensagensRac, textoRac), false, Object.assign({}, ajusteRac, { temperature: 0 }))));
            lido = lerRaciocinio(textoRac);
          }
          if (lido) {
            // Segunda busca: o que a primeira não cobriu e o raciocínio pediu (ex.: "benefício eventual critério renda"). Até 2 trechos novos.
            const termos = buscaDoRaciocinio(lido);
            if (termos) {
              const extra = completarAchados(achados, buscarFontes(indice, termos, { k: 3 }));
              if (extra.novos) { achados = extra.achados; fontes = achados.map(function (a) { return fonteDe(a.trecho, a); }); }
            }
            lido = conferirRaciocinio(lido, achados, [fichasComoTexto(fichasRecebidas), baseAppComoTexto(corpo.baseApp), panoramaComoTexto(corpo.panorama), pergunta].concat(hist.map(function (x) { return String((x && x.texto) || ''); })));
            lido = calibrarSeguranca(lido, achados);
            raciocinio = raciocinioComoTexto(lido);
          }
        } catch (e) { /* sem o esqueleto a IA responde como antes */ }
      }
      if (sobreSi) {
        // Os temas saem da pergunta; se ela não diz o que quer saber ("e as normas?" já diz, "e aí?" não), vale a conversa.
        const textoSi = temasDaPergunta(pergunta).length ? pergunta : consulta;
        voce = fichaComoTexto(ficha, textoSi, { app: app, pagina: corpo.pagina, modelos: resolverModelos(env, {}) });
      }
      // Prompt enxuto: só os blocos opcionais que a pergunta pede (regras de mapa/rota, de PDF, visão dos outros apps) e, no pedido de ajuste
      // ("mais curto"), só o essencial para reescrever. PROMPT_ENXUTO="desligado" (wrangler.toml) volta ao texto inteiro em toda pergunta.
      const dieta = String(env.PROMPT_ENXUTO || '').toLowerCase() === 'desligado' ? null : Object.assign(escopoDaConversa(pergunta, hist), { enxuto: modo === 'refinamento' });
      mensagens = montarMensagens({ leitura: leitura, documento: documento ? documento.texto : '',
        imagem: imagemLida ? imagemLida.texto : '',
        idiomaExtra: idiomaExtra,
        dieta: dieta,
        voce: voce,
        raciocinio: raciocinio,
        tipoAnalise: raciocinio ? tipoAnalise : '',
        calculos: calculos,
        quantitativo: quantitativo,
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
        modo: modo,
        partes: partes
      });
    }
    const nomesHabilidades = habilidades.map(function (h) { return h.nome; });
    // Artigos e leis que a IA tinha nos trechos que leu: o navegador compara com o que ela citar e avisa se citou algo de fora (shared/verificacao.mjs).
    // Valores em R$ que a IA tinha diante de si (normas, fichas, base do app, panorama) ou que a própria pessoa escreveu.
    let citaveis = modo === 'saudacao' ? null : numerosCitaveis(achados, [
      fichasComoTexto(fichasRecebidas), baseAppComoTexto(corpo.baseApp), panoramaComoTexto(corpo.panorama), pergunta
    ].concat(hist.filter(function (h) { return h && h.papel === 'usuario'; }).map(function (h) { return String(h.texto || ''); })));
    // Resultado conferido pelo programa e número que a própria pessoa escreveu não são "valor sem fonte".
    if (citaveis && quantitativo) citaveis = mesclarValores(citaveis, valoresDosCalculos(calculos, textosDaPessoa));

    let saida, ajuste;
    try {
      // Parâmetros por situação (shared/pedido.mjs): texto pronto e ajuste precisam de mais espaço; consulta de unidade, de menos criatividade;
      // quem prefere respostas curtas (memória do aparelho) recebe um teto menor.
      ajuste = perfilDaIA({ quantitativo: quantitativo, modo: modo, tema: tema, comTextoPronto: habilidades.some(function (h) { return h.texto; }), pref: tema ? null : pref, partes: partesDaMsg.length, comDesenho: !tema && pedidoDeDesenho(pergunta), comMatematica: comMatematica });
      if (comMatematica && (env.MODELO_MATEMATICA || env.MODELO_RACIOCINIO)) ajuste.modelo = env.MODELO_MATEMATICA || env.MODELO_RACIOCINIO;
      if (sobreSi) ajuste.temperature = Math.min(ajuste.temperature != null ? ajuste.temperature : 0.4, 0.3);
      // Com o esqueleto de análise pronto, a resposta final só precisa redigi-lo com fidelidade: menos criatividade, menos desvio da conclusão.
      if (raciocinio) ajuste.temperature = Math.min(ajuste.temperature != null ? ajuste.temperature : 0.4, 0.3);
      if (modo === 'saudacao') { ajuste.modelo = env.MODELO_RESERVA || MODELO_RESERVA_PADRAO; ajuste.reserva = env.MODELO || MODELO_PADRAO; }
      saida = await chamarIA(env, mensagens, querStream, ajuste);
    } catch (e) {
      return falhaDaIA(e, 'A IA não respondeu agora (a cota gratuita do dia pode ter acabado).');
    }

    const ctxCorrecao = { env: env, mensagens: mensagens, ajuste: ajuste, citaveis: citaveis, fontes: fontes, vistos: hist.filter(function (h) { return h && h.papel !== 'usuario'; }).map(function (h) { return String(h.texto || ''); }) };
    if (querStream && saida && typeof saida.getReader === 'function') {
      // Se o fluxo do modelo grande falhar ou vier vazio antes de sair texto, o modelo pequeno responde (sem stream) no lugar.
      const { principal, reserva } = resolverModelos(env, ajuste);
      const recuperar = (reserva !== principal && !saida.externa)
        ? async function () { return extrairTexto(await env.AI.run(reserva, parametrosDaIA(mensagens, ajuste, false), OPCOES_IA)); }
        : null;
      return sse(normalizarFluxo(saida, fontes, nomesHabilidades, citaveis, recuperar, imagemLida, function (texto) { return corrigirCitacoes(ctxCorrecao, texto); }, !!saida.externa));
    }

    let resposta = extrairTexto(saida);
    if (!resposta) return json({ erro: 'Resposta vazia.' }, 502);
    resposta = (await corrigirCitacoes(ctxCorrecao, resposta)) || resposta;
    return json({ resposta: resposta, fontes: fontes, habilidades: nomesHabilidades, citaveis: citaveis, imagem: imagemLida || undefined, externa: saida && saida.externa ? true : undefined });
  }

  // Rede de segurança: qualquer exceção que escape vira 500 em JSON COM os cabeçalhos de CORS. Sem isso o Workers devolve a página de erro
  // 1101 sem CORS e o navegador mostra só "falha de rede", sem o app saber que o Worker é que falhou.
  return async function manipular(request, env) {
    try {
      return await tratar(request, env);
    } catch (e) {
      const origem = request.headers.get('Origin') || '';
      const cabecalhos = { 'Content-Type': 'application/json; charset=utf-8' };
      if (origem && origensPermitidas(env).includes(origem)) { cabecalhos['Access-Control-Allow-Origin'] = origem; cabecalhos['Vary'] = 'Origin'; }
      return new Response(JSON.stringify({ erro: 'Erro interno. Tente de novo em instantes.' }), { status: 500, headers: cabecalhos });
    }
  };
}
