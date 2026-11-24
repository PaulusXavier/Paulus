// Paulus: copiloto do navegador. SEM DOM: quem desenha o chat/mascote é cada app.
//
// Ordem de cada pergunta (tudo no aparelho, exceto o passo 7):
//   1. dado pessoal na pergunta  -> bloqueia, nada sai do aparelho
//   2. pedido de socorro         -> telefones de emergência na hora
//   3. "abrir ..."               -> ação registrada pelo app (pede confirmação se mexe em dados)
//   4. "buscar ..."              -> busca registrada pelo app, executada AQUI; o resultado NÃO vai para a IA
//      (passos 3 e 4 são pulados com { semAcoes: true }, para apps que já tratam isso antes)
//   4c. pedido de geografia     -> coordenadas, "perto de", distância entre dois lugares, bairro, endereço no padrão (shared/geo.mjs), sem IA.
//   4a. pedido de modelo 3D      -> entrega o modelo-base (shared/modelos.mjs), sem IA
//   4b. pedido de rota          -> ordem, km e tempo calculados no aparelho (shared/rota.mjs), sem IA
//   0b. pedido de edição de PDF  -> editado no aparelho com pdf-lib (shared/pdf.mjs); o arquivo NUNCA sai do aparelho. Roda logo após o socorro,
//      antes do filtro de dado pessoal, porque preencher uma ficha exige nome e o texto não vai a servidor nenhum.
//   5. normas (base offline)     -> trechos com citação
//   6. (reservado para provedores locais do app, ver docs/INTEGRACAO.md)
//   7. IA (Worker), em streaming, só com: pergunta filtrada, últimas mensagens e fichas PÚBLICAS
//   8. se a IA falhar ou estiver offline -> resposta da base de normas ou "não encontrei"
//
// Este arquivo é concatenado com shared/*.mjs por scripts/build.mjs (dist/paulus.v1.js).
// Por isso: imports em UMA linha, e nomes de função sem repetir entre os módulos.

import { temDadoPessoal } from '../shared/pii.mjs';
import { docPreparar } from '../shared/documento.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { respostaLocalDeIdioma, paraBusca, idiomaDoPedido, avisoPessoalNoIdioma } from '../shared/idioma.mjs';
import { normalizar, criarIndice, buscarFontes, fonteDe, K_PADRAO } from '../shared/busca.mjs';
import { classificarPedido, ehRefinamento, pedidoSobreResposta, consultaDoPedido, trechosParaOPedido } from '../shared/pedido.mjs';
import { marcarFontesUsadas, citacoesSemFonte } from '../shared/verificacao.mjs';
import { respostaDoPedido } from '../shared/calculo-mais.mjs';
import { respostaDeRota, lerPedidoDeRota } from '../shared/rota.mjs';
import { respostaDeModelo, lerPedidoDeModelo, urlDoModelo, MODELOS_3D } from '../shared/modelos.mjs';
import { respostaDeGeo, geoTipoDePedido, geoLerCoordenadas, geoFormatarCoordenadas, geoNormalizarEndereco, geoMontarEndereco, geoPerto, geoFontes, geoLinksDeRota, geoParaGpx, geoParaKml, geoDistanciaKm } from '../shared/geo.mjs';
import { respostaDeTerritorioCT, territoriosCT } from '../shared/territorio-ct.mjs';
import { respostaDeDistritoPolicial, distritosPoliciais } from '../shared/distrito-policial.mjs';
import { respostaDeSaudeMentalTerritorio, territoriosSaudeMental } from '../shared/saude-mental-territorio.mjs';
import { respostaDeEquipeCras, equipeCrasCristiana } from '../shared/equipe-cras-cristiana.mjs';
import { revisarTexto, respostaDeRevisao } from '../shared/revisao-texto.mjs';
import { respostaDePdf, lerPedidoDePdf, editarPdf, listaPaginasPdf, resolverPaginasPdf } from '../shared/pdf.mjs';
import { lerPedidoDeCentral, instrucaoDeCentral, textoDeCentral } from '../shared/pdf-central.mjs';
import { ordenarVisitas, analisarEnderecoVisita, EXPLICACAO_VISITAS, ordenarComSugestao, ruasDasVisitas, aprenderVizinhanca, vizinhancaVazia, resumoVizinhanca, explicacaoDaOrdem } from '../shared/visitas.mjs';
import { compactarHistorico, sanearEstado, mesclarEstado, estadoComoTexto, deveEsclarecer, soPerguntou } from '../shared/conversa.mjs';
import { separarControles, ocultarControles, RE_ID_ACAO } from '../shared/sugestoes.mjs';
import { falaTexto, falaDividir, falaResumir, falaTrechos, falaAprender, falaDicionario } from '../shared/fala.mjs';
import { SKINS } from './skins.mjs';
import { criarMemoria, memEhSensivel } from './memoria.mjs';

const AVISO_PESSOAL = 'Para proteger as famílias, não consigo analisar mensagens com nome, documento, telefone ou endereço residencial. Reescreva a pergunta sem identificar ninguém.';

// Igual ao limite do Worker (worker/prompt.mjs). Antes eram 5 aqui, e o Argo mandava até 10 (lista de bairros, "liste todos").
const MAX_FICHAS = 10;
const MAX_ACOES_ENVIADAS = 20;

const PADRAO = {
  app: '',
  endpoint: '',            // endereço do Worker; vazio = IA desligada
  maxPergunta: 1200,
  modelosUrl: '',          // pasta dos modelos 3D didáticos (padrão: modelos/, ao lado da página); o arquivo só é baixado quando a pessoa clica
  centralPdf: false,       // true no app que TEM a Central de PDF (Argo SUAS): o texto diz "faço pela Central"; nos outros, "no Argo SUAS peça..."
  pdfLibUrl: '',           // onde está o pdf-lib.min.js (padrão: na mesma pasta do paulus.v1.js); carregado só no primeiro pedido de PDF
  cidade: '',              // 'Boa Vista, RR': acrescentada ao nome nos links de rota feitos só com texto
  maxHistorico: 10,        // últimas mensagens (5 trocas) que vão inteiras à IA; as perguntas mais antigas vão num resumo curto (shared/conversa.mjs)
  porMinuto: 8,            // limite local (o Worker também limita)
  minIntervaloMs: 1200,
  primeiroByteMs: 20000,
  silencioMs: 15000,
  memoria: true,           // aprende com o uso, só no aparelho (veja client/memoria.mjs); false = desligada
  aoNegar: null,           // chamada quando o Worker responde 401 (sessão vencida ou sem login): o app volta à tela de login
  token: null,             // sessão do login (texto ou função que devolve o texto); vai no cabeçalho Authorization
  perfil: ''               // id opaco da conta no app (nunca e-mail/nome): memórias separadas por pessoa no mesmo navegador
};

let cfg = Object.assign({}, PADRAO);
const estado = {
  base: [],
  indice: null,
  acoes: [],
  buscas: [],
  historico: [],
  envios: [],
  fichas: null,
  pontos: null,
  lugares: null,
  bairros: null,
  ruas: null,
  lugaresUrl: '',
  lugaresPronto: null,
  aparelho: null,
  mem: criarMemoria({ app: '' }),
  pronto: Promise.resolve()
};

// ------------------------------------------------------------------ configuração

function definirBase(lista) {
  estado.base = Array.isArray(lista) ? lista : [];
  estado.indice = criarIndice(estado.base);
}

// token: texto, função ou função assíncrona (ex.: () => firebase.auth().currentUser.getIdToken()); vale o que ela devolver na hora do pedido.
async function cabecalhosDoPedido() {
  const h = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' };
  let t = cfg.token;
  try { if (typeof t === 'function') t = await t(); } catch (e) { t = ''; }
  if (t && typeof t === 'string') h.Authorization = 'Bearer ' + t;
  return h;
}

// Voz própria (v0.22.0): pede ao Worker (rota /voz) o áudio do texto na voz clonada e devolve um Blob de áudio.
// Devolve null quando a voz própria não está ligada, o servidor está fora do ar ou a rede falhou: quem chamou fala com a voz do navegador.
// Depois de um 404/503 não insiste por 5 minutos, para a conversa não esperar à toa.
let vozIndisponivelAte = 0;
async function vozDoServidor(texto, sinal) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t || !cfg.endpoint || Date.now() < vozIndisponivelAte) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const resp = await fetch(cfg.endpoint + '/voz', { method: 'POST', headers: await cabecalhosDoPedido(), body: JSON.stringify({ texto: t.slice(0, 1500) }), signal: sinal });
    if (!resp.ok) { if (resp.status === 404 || resp.status >= 500) vozIndisponivelAte = Date.now() + 300000; return null; }
    const b = await resp.blob();
    return b && b.size > 100 && /^audio\//.test(b.type || '') ? b : null;
  } catch (e) {
    return null;
  }
}

function init(opcoes) {
  const o = opcoes || {};
  cfg = Object.assign({}, PADRAO, o);
  cfg.app = String(o.app || '').toLowerCase();
  cfg.endpoint = String(o.endpoint || '').replace(/\/+$/, '');
  estado.fichas = typeof o.fichas === 'function' ? o.fichas : null;
  // Rotas (shared/rota.mjs): diretório de unidades com coordenadas ([{nome, lat, lng}] ou função) e posição de quem pergunta (função ou {lat, lng}). O Paulus nunca pede o GPS.
  estado.pontos = Array.isArray(o.pontos) || typeof o.pontos === 'function' ? o.pontos : null;
  // Geografia (shared/geo.mjs): mapa de lugares (arquivo do importar-mapa, ou lista), bairros e ruas, todos PÚBLICOS. lugaresUrl baixa o JSON uma vez, sob demanda.
  estado.lugares = o.lugares && (typeof o.lugares === 'object' || typeof o.lugares === 'function') ? o.lugares : null;
  estado.bairros = Array.isArray(o.bairros) || typeof o.bairros === 'function' ? o.bairros : null;
  estado.ruas = Array.isArray(o.ruas) || typeof o.ruas === 'function' ? o.ruas : null;
  estado.lugaresUrl = !estado.lugares && o.lugaresUrl ? String(o.lugaresUrl) : '';
  estado.lugaresPronto = null;
  estado.aparelho = o.aparelho || null;
  estado.historico = [];
  estado.envios = [];
  estado.mem = criarMemoria({ app: cfg.app, perfil: o.perfil, armazenamento: o.armazenamento, agora: o.agora, ativa: o.memoria !== false });
  if (Array.isArray(o.conhecimento)) {
    definirBase(o.conhecimento);
  } else if (o.conhecimentoUrl && typeof fetch === 'function') {
    estado.pronto = fetch(o.conhecimentoUrl, { credentials: 'omit', cache: 'no-cache' }) // revalida a cada abertura: base nova chega sozinha, e sem mudança o servidor responde 304 (não baixa de novo)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(definirBase)
      .catch(function () { definirBase([]); });
  }
  return Paulus;
}

// Ação de navegação. { id, rotulos:['mapa','mapa de unidades'], titulo?:'Mapa de unidades', descricao?, executar(), confirmar?:true }
// Além de "abrir ...", a IA pode PROPOR a ação como botão (r.acoes); quem toca é a pessoa.
// Ações que alteram ou apagam dados DEVEM ter confirmar:true.
function registrarAcao(a) {
  if (!a || !a.id || typeof a.executar !== 'function' || !Array.isArray(a.rotulos) || !a.rotulos.length) {
    throw new Error('Paulus.registrarAcao: use { id, rotulos:[...], executar() }');
  }
  estado.acoes = estado.acoes.filter(function (x) { return x.id !== a.id; });
  estado.acoes.push({ id: a.id, titulo: String(a.titulo || a.rotulos[0] || a.id), rotulos: a.rotulos.map(normalizar).filter(Boolean), descricao: a.descricao || '', executar: a.executar, confirmar: !!a.confirmar, fechar: !!a.fechar });
}

// Busca dentro do app. { id, rotulos:['unidade','equipamento'], buscar(consulta) -> [{titulo, detalhe?, abrir?()}] }
// Roda no aparelho; o que ela devolve nunca é enviado à IA.
function registrarBusca(b) {
  if (!b || !b.id || typeof b.buscar !== 'function') throw new Error('Paulus.registrarBusca: use { id, rotulos:[...], buscar(consulta) }');
  estado.buscas = estado.buscas.filter(function (x) { return x.id !== b.id; });
  estado.buscas.push({ id: b.id, rotulos: (b.rotulos || []).map(normalizar).filter(Boolean), buscar: b.buscar });
}

function limpar() { estado.historico = []; }
function skin(app) { return SKINS[String(app || cfg.app).toLowerCase()] || null; }
function iaLigada() {
  return !!cfg.endpoint && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

// ------------------------------------------------------------------ ações e buscas

const REG_ACAO = /^(abrir|abra|abre|ir para|ir pra|va para|va pra|me leve|leve me|mostrar|mostre|navegar)\b\s*(.*)$/;
// Verbos de fechar: só valem se o app registrou uma ação com esse rótulo; senão a frase segue para a IA.
// Verbos mais soltos ("chama o sibec", "acessar o cadunico", "entrar no drive"): só valem se a frase for SÓ o pedido
// (verbo + nome de uma ação registrada + palavras de ligação). Qualquer outra palavra manda a frase para a IA,
// para "chamar o conselho tutelar, como faço?" ou "acessar o PAIF para quê?" não virarem abertura de tela.
const REG_ACAO_SOLTO = /^(chamar|chame|chama|acessar|acesse|acessa|entrar no|entrar na|entrar nos|entrar nas|entrar em|entre no|entre na|entre nos|entre nas|entre em|iniciar|inicie|lancar|lance|carregar|carregue|vai para|vai pra|ir ao|ir a|va ao|va a)\b\s*(.*)$/;
const REG_FECHAR = /^(fechar|feche|encerrar|encerre|sair|saia)\b\s*(.*)$/;
const REG_BUSCA = /^(buscar|busque|procurar|procure|achar|ache|encontrar|encontre)\b\s*(.*)$/;

function acharPorRotulo(lista, alvo) {
  const texto = ' ' + alvo + ' ';
  let melhor = null, tam = 0;
  for (const item of lista) {
    for (const r of item.rotulos) {
      if (r.length > tam && texto.indexOf(' ' + r + ' ') !== -1) { melhor = item; tam = r.length; }
    }
  }
  return melhor;
}

// Palavras de ligação que podem sobrar numa frase que é só o pedido de abrir.
const LIGACAO = { e: 1, o: 1, a: 1, os: 1, as: 1, tambem: 1, depois: 1, mais: 1, um: 1, uma: 1, app: 1, apps: 1, aplicativo: 1, aplicativos: 1, aba: 1, abas: 1, site: 1, sites: 1, sistema: 1, pagina: 1, link: 1, por: 1, favor: 1, pra: 1, para: 1, mim: 1, agora: 1, pelo: 1, pela: 1, no: 1, na: 1, nos: 1, nas: 1, do: 1, da: 1, dos: 1, das: 1, de: 1 };

// "abrir o Argo e o Anona": várias ações de uma vez, só se TODAS as partes forem reconhecidas e nenhuma pedir confirmação.
function tratarVariasAcoes(resto, fechando) {
  if (fechando) return null;
  let sobra = ' ' + resto + ' ';
  const achadas = [];
  // rótulos mais longos primeiro, para "argo suas" não ser comido por "argo"
  const pares = [], posicao = new Map();
  estado.acoes.forEach(function (a) { if (!a.fechar) a.rotulos.forEach(function (r) { pares.push([r, a]); }); });
  pares.sort(function (x, y) { return y[0].length - x[0].length; });
  for (const par of pares) {
    const chave = ' ' + par[0] + ' ';
    if (sobra.indexOf(chave) !== -1 && achadas.indexOf(par[1]) === -1) {
      achadas.push(par[1]); posicao.set(par[1], (' ' + resto + ' ').indexOf(chave));
      sobra = sobra.split(chave).join(' ');
    }
  }
  if (achadas.length < 2 || achadas.length > 6) return null;
  achadas.sort(function (x, y) { return posicao.get(x) - posicao.get(y); });
  // só vale se o resto da frase for ligação ("e", "o", "tambem"...): qualquer palavra estranha cancela o lote
  if (sobra.split(/\s+/).filter(Boolean).some(function (w) { return !LIGACAO[w]; })) return null;
  if (achadas.some(function (a) { return a.confirmar; })) return null;
  achadas.forEach(function (a) { a.executar(); estado.mem.aprenderAcao(a.id); });
  return { tipo: 'acao', acao: achadas.map(function (a) { return a.id; }).join(','), texto: 'Pronto: ' + achadas.map(function (a) { return a.titulo; }).join(', ') + '.', executada: true };
}

// Verbo solto: devolve a resposta só se TODA a frase for o pedido; senão null (e a frase segue para a IA).
function tratarAcaoSolta(resto) {
  const varias = tratarVariasAcoes(resto, false);
  if (varias) return varias;
  const a = acharPorRotulo(estado.acoes.filter(function (x) { return !x.fechar; }), resto);
  if (!a) return null;
  let sobra = ' ' + resto + ' ';
  a.rotulos.slice().sort(function (x, y) { return y.length - x.length; }).forEach(function (r) { sobra = sobra.split(' ' + r + ' ').join(' '); });
  if (sobra.split(/\s+/).filter(Boolean).some(function (w) { return !LIGACAO[w]; })) return null;
  return tratarAcao(resto);
}

function tratarAcao(resto, fechando) {
  const varias = tratarVariasAcoes(resto, fechando);
  if (varias) return varias;
  // Apelido que a pessoa ensinou ("cadunico" -> tela X) vale antes do rótulo cadastrado pelo app.
  const idApelido = estado.mem.apelidoDe(resto.trim());
  const doVerbo = estado.acoes.filter(function (x) { return !!x.fechar === !!fechando; });
  const a = (idApelido && doVerbo.filter(function (x) { return x.id === idApelido; })[0]) || acharPorRotulo(doVerbo, resto);
  if (!a) {
    return {
      tipo: 'acao_desconhecida',
      texto: 'Não encontrei essa tela ou função neste app.',
      opcoes: doVerbo.map(function (x) { return x.rotulos[0]; }),
      // Para o app oferecer "era esta?": ao tocar numa opção, aprender(id) grava o apelido e da próxima vez o Paulus já sabe.
      opcoesAcoes: doVerbo.map(function (x) { return { id: x.id, rotulo: x.titulo }; }),
      aprender: function (id) { return estado.mem.vincular(resto, id); }
    };
  }
  if (a.confirmar) {
    return { tipo: 'acao', acao: a.id, texto: 'Posso fazer isso, mas preciso da sua confirmação.', pedeConfirmacao: true, confirmar: function () { estado.mem.aprenderAcao(a.id); return a.executar(); } };
  }
  a.executar();
  estado.mem.aprenderAcao(a.id);
  return { tipo: 'acao', acao: a.id, texto: 'Pronto.', executada: true };
}

async function tratarBusca(resto) {
  const escolhidas = [];
  const alvo = acharPorRotulo(estado.buscas, resto);
  if (alvo) escolhidas.push(alvo); else Array.prototype.push.apply(escolhidas, estado.buscas);
  if (!escolhidas.length) return { tipo: 'sem_resposta', texto: 'Este app ainda não tem buscas ligadas ao Paulus.' };
  const itens = [];
  for (const b of escolhidas) {
    try {
      const r = await Promise.resolve(b.buscar(resto));
      if (Array.isArray(r)) Array.prototype.push.apply(itens, r);
    } catch (e) { /* uma busca com problema não derruba as outras */ }
  }
  const lista = itens.slice(0, 20);
  return {
    tipo: 'busca',
    texto: lista.length ? 'Encontrei ' + lista.length + ' resultado(s) neste aparelho.' : 'Não encontrei nada para essa busca.',
    itens: lista
  };
}

// ------------------------------------------------------------------ IA

function estourouLimiteLocal() {
  const agora = Date.now();
  estado.envios = estado.envios.filter(function (t) { return agora - t < 60000; });
  if (estado.envios.length >= cfg.porMinuto) return 'Muitas perguntas seguidas. Aguarde um minuto.';
  const ultimo = estado.envios[estado.envios.length - 1] || 0;
  if (agora - ultimo < cfg.minIntervaloMs) return 'Calma, uma pergunta de cada vez.';
  estado.envios.push(agora);
  return '';
}

// A conversa inteira conta: as últimas mensagens vão inteiras e as perguntas mais antigas vão só como pergunta (curtas),
// para o Worker montar o resumo "o que já foi perguntado". Em pedido de ajuste ("mais curto"), a ÚLTIMA resposta vai maior (até 3000),
// senão a IA reescreve só o começo dela.
function historicoParaEnvio(externo, ajuste) {
  const c = compactarHistorico(Array.isArray(externo) ? externo : estado.historico, { recentes: cfg.maxHistorico });
  const lista = c.antigas.map(function (t) { return { papel: 'usuario', texto: t }; }).concat(c.recentes);
  let ultima = -1;
  lista.forEach(function (h, i) { if (h && h.papel !== 'usuario') ultima = i; });
  return lista.map(function (h, i) {
    return { papel: h.papel, texto: String(h.texto).slice(0, ajuste && i === ultima ? 3000 : 1200) };
  });
}

function fichasPublicas(texto, aba, externas) {
  if (Array.isArray(externas)) return externas.slice(0, MAX_FICHAS);
  if (!estado.fichas) return [];
  try {
    const r = estado.fichas(texto, aba);
    return Array.isArray(r) ? r.slice(0, MAX_FICHAS) : [];
  } catch (e) { return []; }
}

function telefonesConhecidos(fichas) {
  const set = {};
  for (const f of fichas) {
    const t = String((f && f.telefones) || '');
    (t.match(/\d[\d\s().-]{6,}\d/g) || []).forEach(function (n) { set[n.replace(/\D/g, '').slice(-8)] = 1; });
  }
  return set;
}

// Telefone no texto da IA: com ou sem DDD, fixo (8 dígitos), celular (9) e 0800. Não casa dentro de número maior
// (protocolo, CPF). Sem lookbehind (Safari antigo): o caractere antes do número entra no padrão e é descartado.
const RE_TELEFONE = /(^|[^\d])(0800[\s.-]?\d{3}[\s.-]?\d{3,4}|(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4})(?!\d)/g;

function telefonesNoTexto(texto) {
  const achados = [];
  const t = String(texto);
  let m;
  RE_TELEFONE.lastIndex = 0;
  while ((m = RE_TELEFONE.exec(t)) !== null) {
    achados.push(m[2]);
    RE_TELEFONE.lastIndex = m.index + m[0].length; // o caractere seguinte (não-dígito) pode abrir o próximo
  }
  return achados;
}

// Confere se a IA citou telefone que não veio das fichas. Devolve a lista dos desconhecidos.
function telefonesDesconhecidos(texto, fichas) {
  const conhecidos = telefonesConhecidos(fichas);
  return telefonesNoTexto(texto).filter(function (n) {
    if (/^(?:19|20)\d{2}[-\s.]+(?:19|20)\d{2}$/.test(n.trim())) return false; // "2023-2026" é intervalo de anos
    return !conhecidos[n.replace(/\D/g, '').slice(-8)];
  });
}

// Ações que a IA pode PROPOR neste app: as registradas ou as passadas na chamada (opcoes.acoes, para apps com o próprio cérebro).
// Cada uma: { id, rotulo|titulo, descricao?, confirmar?, executar? }. Só id, nome e descrição vão ao Worker; nada executa sozinho.
function acoesDisponiveis(externas) {
  const lista = Array.isArray(externas) ? externas : estado.acoes;
  const saida = [];
  for (const a of lista) {
    if (!a || !RE_ID_ACAO.test(String(a.id || ''))) continue;
    const rotulo = String(a.rotulo || a.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!rotulo) continue;
    saida.push({ id: String(a.id), rotulo: rotulo, descricao: String(a.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 100), confirmar: !!a.confirmar, executar: a.executar });
  }
  return saida.slice(0, MAX_ACOES_ENVIADAS);
}

function lerSSE(resp, ganchos, controle) {
  return new Promise(function (resolve, reject) {
    const leitor = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '', acumulado = '', fontes = [], habilidades = [], citaveis = null, imagem = null, recebeu = false, fim = false;
    function ler() {
      leitor.read().then(function (r) {
        controle.tique();
        if (r.done) { fim = true; }
        else buf += dec.decode(r.value, { stream: true });
        const linhas = buf.split('\n');
        buf = fim ? '' : linhas.pop();
        for (const l of linhas) {
          const t = l.trim();
          if (t.indexOf('data:') !== 0) continue;
          const corpo = t.slice(5).trim();
          if (!corpo || corpo === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(corpo); } catch (e) { continue; }
          if (ev.erro) { reject(new Error(String(ev.erro))); return; }
          if (Array.isArray(ev.fontes)) { fontes = ev.fontes; if (ganchos.onFontes) ganchos.onFontes(fontes); }
          if (Array.isArray(ev.habilidades)) { habilidades = ev.habilidades.map(String).slice(0, 3); if (ganchos.onHabilidades) ganchos.onHabilidades(habilidades); }
          if (ev.citaveis && typeof ev.citaveis === 'object') citaveis = ev.citaveis;
          if (ev.imagem && typeof ev.imagem === 'object') imagem = ev.imagem;
          // Resposta reescrita pelo Worker (citação sem fonte tirada): substitui o texto já mostrado.
          if (typeof ev.corrigido === 'string' && ev.corrigido.trim()) {
            acumulado = ev.corrigido;
            if (ganchos.onToken) ganchos.onToken('', ocultarControles(acumulado));
          }
          if (typeof ev.t === 'string') {
            recebeu = true;
            acumulado += ev.t;
            // Os rótulos "AÇÕES NO APP:" e "SUGESTÕES:" (e o que vem depois) nunca chegam à tela.
            if (ganchos.onToken) ganchos.onToken(ev.t, ocultarControles(acumulado));
          }
        }
        if (fim) {
          if (!recebeu) reject(new Error('Resposta vazia.')); else resolve({ texto: acumulado, fontes: fontes, habilidades: habilidades, citaveis: citaveis, imagem: imagem });
        } else ler();
      }).catch(reject);
    }
    ler();
  });
}

// Imagem que o app manda ler: data URI JPEG, PNG ou WebP, já reduzida (console/docs.js). O Worker confere de novo (assinatura do arquivo e tamanho).
const IMAGEM_MAX_ENVIO = 1200000;
function imagemValida(img) {
  return !!img && typeof img === 'object' && typeof img.dados === 'string' && img.dados.length <= IMAGEM_MAX_ENVIO && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img.dados);
}

// Leitura da imagem que o Worker devolve ({ nome, texto, perdidos }): o app a mantém "em uso" e as próximas perguntas seguem como documento anexado.
function imagemLidaSaneada(l) {
  if (!l || typeof l !== 'object' || typeof l.texto !== 'string' || !l.texto.trim()) return null;
  return { nome: String(l.nome || 'imagem').replace(/[\r\n\t]+/g, ' ').slice(0, 120), texto: l.texto.slice(0, 8000), perdidos: Math.max(0, Math.min(999, Number(l.perdidos) || 0)) };
}

async function pedirIA(texto, opcoes) {
  const bloqueio = estourouLimiteLocal();
  if (bloqueio) return { tipo: 'erro', texto: bloqueio };

  // Documento anexado: só trechos escolhidos e sem dado pessoal saem do aparelho.
  let documento = null;
  if (opcoes.documento) {
    documento = docPreparar(opcoes.documento, texto);
    if (!documento || !documento.trechos.length) return { tipo: 'bloqueio', texto: 'Não consegui usar o documento: os trechos têm dados pessoais (nome, CPF, e-mail...) ou não há texto. Anexe uma versão sem identificação das pessoas.', fontes: [], avisos: [] };
  }
  const fichas = fichasPublicas(texto, opcoes.aba, opcoes.fichas);
  const corpo = {
    app: cfg.app,
    pergunta: texto,
    pagina: String(opcoes.aba || '').slice(0, 80),
    historico: historicoParaEnvio(opcoes.historico, (function (h) { return ehRefinamento(texto, h) || !!pedidoSobreResposta(texto, h); })(Array.isArray(opcoes.historico) ? opcoes.historico : estado.historico)),
    fichas: fichas,
    documento: documento ? { nome: documento.nome, trechos: documento.trechos } : undefined,
    // Foto já reduzida no aparelho (console/docs.js): o Worker a lê com um modelo de visão e só o texto lido, sem dado pessoal, segue adiante.
    imagem: imagemValida(opcoes.imagem) ? { nome: String(opcoes.imagem.nome || 'imagem').slice(0, 120), dados: opcoes.imagem.dados } : undefined,
    stream: true
  };
  // O que a conversa já firmou (unidade, bairro, município, assunto), montado pelo app. Só campos fechados e curtos.
  const firmado = sanearEstado(opcoes.estado);
  if (firmado) corpo.estado = firmado;
  // Segunda tentativa depois de uma resposta que só perguntou: a IA assume a premissa mais provável e responde.
  if (opcoes.semPerguntar === true) corpo.semPerguntar = true;
  // O que o app sabe abrir/fazer: a IA só pode propor ids desta lista.
  const acoes = acoesDisponiveis(opcoes.acoes);
  if (acoes.length) corpo.acoes = acoes.map(function (a) { return { id: a.id, rotulo: a.rotulo, descricao: a.descricao }; });
  // O que o Paulus aprendeu sobre o estilo da pessoa: só códigos de lista fechada e ids públicos de documentos (nunca texto livre).
  const prefs = memEhSensivel(texto) ? null : estado.mem.paraEnvio();
  if (prefs) corpo.preferencias = prefs;
  // Visão geral do diretório (totais por grupo), montada pelo app. Só vai quando o app a manda.
  if (typeof opcoes.panorama === 'string' && opcoes.panorama.trim()) corpo.panorama = opcoes.panorama.trim().slice(0, 3000);

  // Base do app (verbetes, valores de referência, calendários): só texto público do próprio app, até 4 itens.
  if (Array.isArray(opcoes.baseApp) && opcoes.baseApp.length) {
    const base = opcoes.baseApp.slice(0, 4).map(function (b) {
      return { titulo: String((b && b.titulo) || '').slice(0, 100), texto: String((b && b.texto) || '').slice(0, 1500), origem: String((b && b.origem) || '').slice(0, 200) };
    }).filter(function (b) { return b.titulo && b.texto; });
    if (base.length) corpo.baseApp = base;
  }

  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const armar = function (ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
  };
  const controle = { tique: function () { armar(cfg.silencioMs); } };
  armar(cfg.primeiroByteMs);
  if (opcoes.sinal && ctrl) {
    if (opcoes.sinal.aborted) ctrl.abort();
    else opcoes.sinal.addEventListener('abort', function () { ctrl.abort(); });
  }

  try {
    const resp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: await cabecalhosDoPedido(),
      body: JSON.stringify(corpo),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!resp.ok) {
      // O Worker explica a falha em { erro } (limite por minuto, cota do dia...). Guarda o motivo para o app poder mostrá-lo.
      let motivo = '';
      try { const j = await resp.json(); motivo = j && j.erro ? String(j.erro).slice(0, 200) : ''; } catch (e) { /* corpo sem JSON */ }
      const falha = new Error('IA indisponível (' + resp.status + ').');
      falha.status = resp.status;
      falha.motivo = motivo;
      if (resp.status === 401 && typeof cfg.aoNegar === 'function') { try { cfg.aoNegar(falha); } catch (e) { /* o app decide */ } }
      throw falha;
    }
    const tipo = String(resp.headers.get('Content-Type') || '');
    let saida;
    if (tipo.indexOf('event-stream') !== -1 && resp.body && resp.body.getReader) {
      saida = await lerSSE(resp, opcoes, controle);
    } else {
      const j = await resp.json();
      if (!j || typeof j.resposta !== 'string' || !j.resposta) throw new Error(j && j.erro ? String(j.erro) : 'Resposta vazia.');
      saida = { texto: j.resposta, fontes: Array.isArray(j.fontes) ? j.fontes : [], habilidades: Array.isArray(j.habilidades) ? j.habilidades.map(String).slice(0, 3) : [], citaveis: j.citaveis && typeof j.citaveis === 'object' ? j.citaveis : null, imagem: j.imagem && typeof j.imagem === 'object' ? j.imagem : null };
      if (opcoes.onToken) opcoes.onToken(saida.texto, ocultarControles(saida.texto));
    }
    const partes = separarControles(saida.texto, acoes.map(function (a) { return a.id; }));
    saida.texto = partes.texto || saida.texto;
    const propostas = partes.acoes.map(function (id) {
      const a = acoes.filter(function (x) { return x.id === id; })[0];
      return { id: a.id, rotulo: a.rotulo, confirmar: a.confirmar, executar: a.executar };
    });
    const avisos = ['Resposta gerada por IA. Confira antes de usar em atendimento.'];
    const lida = imagemLidaSaneada(saida.imagem);
    if (lida) avisos.push('Imagem "' + lida.nome + '": lida por um programa de visão, que pode errar letras e números. Confira no original.' + (lida.perdidos ? ' ' + lida.perdidos + ' linha(s) com dados pessoais ficaram de fora da leitura.' : ''));
    if (telefonesDesconhecidos(saida.texto, fichas).length) {
      avisos.push('A IA citou um telefone que não consta no diretório. Confirme com a unidade antes de passar adiante.');
    }
    // Artigo ou lei na resposta que não estava nos trechos que a IA leu: avisa (o texto não é alterado).
    const vistos = (Array.isArray(opcoes.historico) ? opcoes.historico : estado.historico).filter(function (h) { return h && h.papel !== 'usuario'; }).map(function (h) { return String(h.texto); });
    const semFonte = citacoesSemFonte(saida.texto, saida.citaveis, saida.fontes, vistos);
    if (semFonte.length) {
      avisos.push('A IA citou ' + semFonte.slice(0, 3).join(', ') + ', que não aparece nas normas consultadas. Confira no texto oficial antes de usar.');
    }
    return { tipo: 'ia', texto: saida.texto, fontes: marcarFontesUsadas(saida.texto, saida.fontes), sugestoes: partes.sugestoes, acoes: propostas, avisos: avisos, habilidades: saida.habilidades || [], geradoPorIA: true, imagemLida: imagemLidaSaneada(saida.imagem) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ resposta offline

// Corta no fim de uma frase para o trecho caber numa resposta (a fonte completa segue citada).
function resumirTrecho(texto, max) {
  const t = String(texto || '');
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('; '));
  return (fim > max * 0.5 ? corte.slice(0, fim + 1) : corte.replace(/\s+\S*$/, '')) + ' [...]';
}

function respostaDasNormas(achados) {
  const melhor = achados[0].trecho;
  return {
    tipo: 'norma',
    texto: resumirTrecho(melhor.texto, 900),
    fontes: achados.map(function (a) { return fonteDe(a.trecho, a); }),
    avisos: [melhor.tipo && melhor.tipo !== 'norma'
      ? 'Trecho de ' + (melhor.tipo === 'apoio' ? 'material de apoio' : 'orientação técnica') + ' (não é norma legal: orienta, não obriga). Confira o documento original.'
      : 'Trecho da base de normas do Paulus. Confira o texto oficial vigente.']
  };
}

// Mesmo formato de uma resposta da IA (os apps já sabem mostrar), marcada como vinda da memória e com a data.
function respostaAprovada(a, pergunta) {
  let quando = '';
  try { quando = ' em ' + new Date(a.ts).toLocaleDateString('pt-BR'); } catch (e) { /* sem data */ }
  return {
    tipo: 'ia', texto: a.r, fontes: a.f, sugestoes: [], acoes: [], geradoPorIA: true, deMemoria: true, pergunta: pergunta, docs: a.d,
    avisos: ['Resposta que você aprovou' + quando + ', mostrada porque a IA não respondeu agora. Pode estar desatualizada: confira a norma antes de usar em atendimento.']
  };
}

// ------------------------------------------------------------------ memória (o que o Paulus aprende com o uso)

// O app chama quando a pessoa reage a uma resposta: 'bom' (👍), 'ruim' (👎), 'mais_curto', 'mais_detalhe', 'outro_jeito', 'copiou'.
// r é o resultado de perguntar() (ele já traz pergunta e docs). Para apps com o próprio cérebro: avaliar({ pergunta, texto, fontes }, sinal).
function avaliar(r, sinal) { return estado.mem.avaliar(r, sinal); }

// Sugestões para o mascote: o que a pessoa mais pergunta e abre, completado com as sugestões padrão do app.
function sugestoesPessoais(n) {
  const max = n || 3;
  const lista = estado.mem.frequentes(max).map(function (x) { return x.texto; });
  estado.mem.acoesFrequentes(max).forEach(function (x) {
    const a = estado.acoes.filter(function (y) { return y.id === x.id; })[0];
    if (a) lista.push('abrir ' + a.titulo.toLowerCase());
  });
  const padrao = (skin() || {}).sugestoes || [];
  padrao.forEach(function (p) { if (lista.indexOf(p) === -1) lista.push(p); });
  return lista.slice(0, max);
}

const memoria = {
  resumo: function () { return estado.mem.resumo(estado.base); },
  ativa: function () { return estado.mem.ativa(); },
  ligar: function (sim) { estado.mem.ligar(sim); },
  esquecer: function (parte) { return estado.mem.esquecer(parte); },
  exportar: function () { return estado.mem.exportar(); },
  importar: function (json) { return estado.mem.importar(json); },
  vincular: function (frase, idAcao) { return estado.mem.vincular(frase, idAcao); },
  registrarUsoAcao: function (id) { estado.mem.aprenderAcao(id); },
  frequentes: function (n) { return estado.mem.frequentes(n); }
};

// ------------------------------------------------------------------ PDF

// Endereço padrão do pdf-lib: a mesma pasta de onde veio este script (capturado na carga, quando document.currentScript existe).
const PDF_URL_PADRAO = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^\/]*([?#].*)?$/, 'pdf-lib.min.js') : '';
let pdfLibPromessa = null;

function pdfCarregarLib() {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  if (cfg.PDFLib && cfg.PDFLib.PDFDocument) return Promise.resolve(cfg.PDFLib);
  if (g.PDFLib && g.PDFLib.PDFDocument) return Promise.resolve(g.PDFLib);
  if (pdfLibPromessa) return pdfLibPromessa;
  const url = cfg.pdfLibUrl || PDF_URL_PADRAO;
  if (!url || typeof document === 'undefined') return Promise.reject(new Error('pdf-lib indisponível'));
  pdfLibPromessa = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = function () { g.PDFLib && g.PDFLib.PDFDocument ? resolve(g.PDFLib) : reject(new Error('pdf-lib não carregou')); };
    s.onerror = function () { reject(new Error('pdf-lib não carregou')); };
    document.head.appendChild(s);
  }).catch(function (e) { pdfLibPromessa = null; throw e; });
  return pdfLibPromessa;
}

// Aceita File/Blob do navegador ou { nome, bytes }.
async function pdfLerArquivos(lista) {
  const saida = [];
  for (let i = 0; i < (lista || []).length; i++) {
    const a = lista[i];
    if (!a) continue;
    // Navegadores atuais dão a File/Blob um MÉTODO bytes(): só vale como bytes se NÃO for função (senão cai no arrayBuffer()).
    if (a.bytes && typeof a.bytes !== 'function') saida.push({ nome: a.nome || a.name || 'documento', bytes: a.bytes });
    else if (typeof a.arrayBuffer === 'function') saida.push({ nome: a.name || a.nome || 'documento', bytes: new Uint8Array(await a.arrayBuffer()) });
  }
  return saida;
}

// Foto em outro formato (WebP, HEIC que o navegador abre...) vira PNG para entrar no PDF.
async function pdfImagemParaPng(bytes) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bmp = await createImageBitmap(new Blob([bytes]));
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

async function pdfEditarNoAparelho(operacoes, arquivos, opcoes) {
  const lidos = await pdfLerArquivos(arquivos);
  const PDFLib = await pdfCarregarLib();
  return editarPdf(operacoes, lidos, Object.assign({ PDFLib: PDFLib, converterImagem: pdfImagemParaPng }, opcoes || {}));
}

function pdfBlob(arquivo) { return new Blob([arquivo.bytes], { type: 'application/pdf' }); }

// Baixa o arquivo editado (o app pode preferir mostrar um botão e chamar isto no clique).
function pdfBaixar(arquivo) {
  const url = URL.createObjectURL(pdfBlob(arquivo));
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

// Pedido de edição de PDF ("juntar", "remover a página 2", "preencher o campo X com Y"): feito no aparelho, sem IA e sem rede para o arquivo.
function respostaDeCentral(t, central, temArq, o) {
  const comCentral = !!cfg.centralPdf;
  if (!Array.isArray(o.historico)) {
    estado.historico.push({ papel: 'usuario', texto: '[pedido para a Central de PDF, lido no aparelho]' }, { papel: 'paulus', texto: '[resposta sobre a Central de PDF, feita no aparelho]' });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  return { tipo: 'pdf', ok: !!(central.etapas && central.etapas.length), texto: textoDeCentral(central, { temArquivo: temArq, comCentral: comCentral }), arquivos: [], precisaArquivo: false, campos: [], naoSuporta: [], central: central, avisos: [], fontes: [], pergunta: '', docs: [] };
}
// Nada do pedido entra no histórico que vai à IA (pode ter nome e dado de família): fica só uma marca neutra.
async function tratarPdf(t, o) {
  const arquivos = Array.isArray(o.arquivos) ? o.arquivos : [];
  const temArq = arquivos.length > 0;
  const proprio = lerPedidoDePdf(t, { temArquivo: temArq });
  // Reduzir, recortar, dados ocultos, texto, PDF ↔ Word/JPG, senha, tarja, assinatura...: quem faz é a Central de PDF do app (Argo SUAS).
  // O Paulus só entende o pedido e responde com o que a Central fará (ou aponta o caminho); o arquivo não é lido nem enviado.
  const central = lerPedidoDeCentral(t, { temArquivo: temArq });
  if (central && !(proprio && (proprio.operacoes || []).length)) return respostaDeCentral(t, central, temArq, o);
  if (!proprio) return null;
  let r = null;
  try {
    const lidos = await pdfLerArquivos(arquivos);
    let PDFLib = null;
    if (lidos.length) { try { PDFLib = await pdfCarregarLib(); } catch (e) { PDFLib = null; } }
    r = await respostaDePdf(t, lidos, { PDFLib: PDFLib, converterImagem: pdfImagemParaPng });
  } catch (e) { r = null; }
  if (!r) return null;
  if (!Array.isArray(o.historico)) {
    estado.historico.push({ papel: 'usuario', texto: '[pedido de edição de PDF, feito no aparelho]' }, { papel: 'paulus', texto: '[resposta sobre o PDF, feita no aparelho]' });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  return { tipo: 'pdf', ok: !!r.ok, texto: r.texto, arquivos: r.arquivos || [], precisaArquivo: !!r.precisaArquivo, campos: r.campos || [], naoSuporta: r.naoSuporta || [], avisos: r.arquivos && r.arquivos.length ? ['Editado neste aparelho: o PDF não foi enviado a nenhum servidor. Confira o resultado antes de usar.'] : [], fontes: [], pergunta: '', docs: [] };
}

// ------------------------------------------------------------------ rota

async function tratarRota(t, o) {
  if (!lerPedidoDeRota(t)) return null;
  let aparelho = o.aparelho !== undefined ? o.aparelho : estado.aparelho;
  try { if (typeof aparelho === 'function') aparelho = await aparelho(); } catch (e) { aparelho = null; }
  let rota = null;
  await geoCarregarLugares();
  try { rota = respostaDeRota(t, { pontos: o.pontos || estado.pontos, aparelho: aparelho, cidade: o.cidade || cfg.cidade, lugares: o.lugares || estado.lugares, bairros: o.bairros || estado.bairros, ruas: o.ruas || estado.ruas }); } catch (e) { rota = null; }
  if (!rota) return null;
  if (!Array.isArray(o.historico) && !rota.semHistorico) {
    estado.historico.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: rota.texto });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  const avisos = rota.estimativa ? ['Rota estimada no aparelho, sem IA e sem trânsito. Confira no app de mapas.'] : rota.aproximada ? ['Sem coordenadas, o link do mapa segue a ordem que você escreveu.'] : [];
  return { tipo: 'rota', destino: rota.destino || null, texto: rota.texto, links: rota.links, svg: rota.svg, geojson: rota.geojson, gpx: rota.gpx || '', kml: rota.kml || '', paradas: rota.paradas, km: rota.km, minutos: rota.minutos, modo: rota.modo || '', volta: !!rota.volta, bloqueio: !!rota.bloqueio, fontes: [], avisos: avisos, pergunta: t, docs: [] };
}

// ------------------------------------------------------------------ modelos 3D didáticos

// Pedido de modelo 3D ("me manda o modelo 3D do sistema solar"): o programa reconhece no aparelho e devolve o arquivo-base para baixar. Sem IA e sem rede para decidir.
function tratarModelo(t, o) {
  const m = respostaDeModelo(t);
  if (!m) return null;
  if (!Array.isArray(o.historico)) {
    estado.historico.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: m.texto });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  return { tipo: 'modelo', texto: m.texto, modelo: m.modelo, novoTema: m.novoTema, arquivos: [{ nome: m.modelo.arquivo, rotulo: m.modelo.nome, url: urlDoModelo(m.modelo, cfg.modelosUrl) }], fontes: [], avisos: m.avisos, pergunta: t, docs: [] };
}

// Baixa o arquivo do modelo. Se o navegador não deixar baixar por script, abre o arquivo numa aba nova.
function modeloBaixar(modelo) {
  const url = urlDoModelo(modelo, cfg.modelosUrl);
  const abrir = function () { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* segue */ } };
  if (typeof fetch !== 'function' || typeof document === 'undefined') { abrir(); return Promise.resolve(false); }
  return fetch(url, { credentials: 'omit' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  }).then(function (blob) {
    const u = URL.createObjectURL(new Blob([blob], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = u; a.download = modelo.arquivo; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    return true;
  }).catch(function () { abrir(); return false; });
}

// ------------------------------------------------------------------ geografia

// Baixa o mapa de lugares uma vez, só quando a pergunta é de geografia ou rota. Falha de rede = segue sem o mapa (só o diretório do app).
function geoCarregarLugares() {
  if (!estado.lugaresUrl || typeof fetch !== 'function') return Promise.resolve();
  if (!estado.lugaresPronto) {
    estado.lugaresPronto = fetch(estado.lugaresUrl, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && typeof j === 'object') estado.lugares = j; })
      .catch(function () { estado.lugaresPronto = null; });
  }
  return estado.lugaresPronto;
}

async function tratarGeo(t, o, tipo) {
  await geoCarregarLugares();
  let aparelho = o.aparelho !== undefined ? o.aparelho : estado.aparelho;
  try { if (typeof aparelho === 'function') aparelho = await aparelho(); } catch (e) { aparelho = null; }
  let g = null;
  try { g = respostaDeGeo(t, { pontos: o.pontos || estado.pontos, lugares: o.lugares || estado.lugares, bairros: o.bairros || estado.bairros, ruas: o.ruas || estado.ruas, aparelho: aparelho, cidade: o.cidade || cfg.cidade }); } catch (e) { g = null; }
  if (!g) return null;
  // Conversão, endereço digitado e "perto daqui" podem apontar uma casa ou a pessoa: ficam no aparelho e não entram no histórico.
  if (!g.sensivel && !Array.isArray(o.historico)) {
    estado.historico.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: g.texto });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  const avisos = g.sensivel ? ['Feito neste aparelho, sem IA e sem rede. Não foi guardado no histórico.'] : ['Resposta calculada no aparelho, sem IA. Distâncias em linha reta; o mapa colaborativo pode estar desatualizado.'];
  return { tipo: 'geo', tipoGeo: g.tipoGeo, texto: g.texto, links: g.links, lugares: g.lugares, geojson: g.geojson, km: g.km, kmRuas: g.kmRuas, minutos: g.minutos, endereco: g.endereco || null, lat: g.lat, lng: g.lng, naoAchou: !!g.naoAchou, ambiguo: !!g.ambiguo, sensivel: !!g.sensivel, fontes: [], avisos: avisos, pergunta: g.sensivel ? '' : t, docs: [] };
}

// ------------------------------------------------------------------ pergunta


// Resposta de conta feita no aparelho. Idade e nascimento (sensivel) nunca entram no histórico.
function respostaDeCalculo(t, o, conta) {
  if (!conta.sensivel && !Array.isArray(o.historico)) {
    estado.historico.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: conta.texto });
    estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
  }
  return {
    tipo: 'calculo', texto: conta.texto, itens: conta.itens, sensivel: !!conta.sensivel, fontes: [],
    avisos: [conta.sensivel ? 'Conta feita no aparelho, sem IA. Não foi guardada no histórico. Confira as datas que você digitou.' : 'Conta feita no aparelho, sem IA. Confira os números que você digitou.'],
    pergunta: conta.sensivel ? '' : t, docs: []
  };
}

async function perguntar(texto, opcoes) {
  let o = opcoes || {};
  // Com imagem anexada o pedido é "olhe esta foto": nenhum atalho local (PDF, conta, idioma, rota, busca...) responde no lugar da leitura.
  // O socorro e o filtro de dado pessoal continuam valendo sobre o texto da pergunta.
  const comImagem = imagemValida(o.imagem);
  if (comImagem) o = Object.assign({}, o, { semPdf: true, semGeo: true, semRevisao: true, semCalculo: true, semEspanhol: true, semAcoes: true, semModelos: true, semRota: true, arquivos: [] });
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, cfg.maxPergunta);
  if (!t) return { tipo: 'erro', texto: 'Escreva uma pergunta.' };

  // Socorro vem ANTES do filtro: "Maria Souza quer se matar" precisa mostrar os telefones, não só pedir para reescrever.
  // (Nada sai do aparelho neste passo.)
  const crise = detectarCrise(t);
  if (crise) return crise;

  // Edição de PDF: tudo no aparelho, por isso vem antes do filtro (preencher uma ficha exige nome e documento no texto do pedido).
  if (!o.semPdf) {
    const pdf = await tratarPdf(t, o);
    if (pdf) return pdf;
  }

  // Conversão de coordenada e padronização de endereço: no aparelho, antes do filtro (o texto do pedido traz o endereço e não vai a servidor nenhum).
  if (!o.semGeo) {
    const tg = geoTipoDePedido(t);
    if (tg === 'endereco' || tg === 'conversao') {
      const g0 = await tratarGeo(t, o, tg);
      if (g0) return g0;
    }
  }

  // Pedido de correção de ortografia ("corrija a ortografia e a gramática: ..."): feito no aparelho, sem IA e sem rede, antes do filtro de dado pessoal
  // (o texto a corrigir pode ter nome). Não entra no histórico.
  if (!o.semRevisao) {
    const rev = respostaDeRevisao(t);
    if (rev) return { tipo: 'revisao', texto: rev.texto, apontamentos: rev.apontamentos, corrigido: rev.corrigido, sensivel: true, fontes: [], avisos: ['Correção feita neste aparelho, sem IA e sem rede. Não foi guardada no histórico. Só pega erros comuns: leia o resultado.'], pergunta: '', docs: [] };
  }

  // Datas e prazos ("30 dias úteis a partir de 02/12/2026", "idade de quem nasceu em 15/05/1990"): no aparelho, antes do filtro, porque a data de
  // nascimento faz o filtro bloquear. Idade é dado sensível: a resposta não entra no histórico.
  if (!o.semCalculo) {
    const dt = respostaDoPedido(t);
    if (dt && dt.origem === 'datas') return respostaDeCalculo(t, o, dt);
  }

  if (temDadoPessoal(t)) return { tipo: 'bloqueio', texto: avisoPessoalNoIdioma(idiomaDoPedido(t, o.historico || estado.historico), AVISO_PESSOAL) };

  // Vocabulário, frases e falsos amigos PT↔ES e PT↔EN (shared/espanhol.mjs e shared/ingles.mjs): no aparelho, sem IA e sem rede. Não entra no histórico.
  if (!o.semEspanhol) {
    const esp = respostaLocalDeIdioma(t);
    if (esp) return { tipo: esp.idioma === 'en' ? 'ingles' : 'espanhol', tipoLocal: esp.tipoLocal, texto: esp.texto, fontes: [], avisos: ['Resposta feita neste aparelho, sem IA e sem rede. Confira o sentido com a pessoa atendida.'], pergunta: '', docs: [] };
  }

  // Mensagem que É só uma conta ("quanto é 15% de 1200?", "mediana de 3, 5 e 9", "IMC de 70 kg e 1,75 m", "30 dias úteis a partir de 02/12/2026"):
  // o programa resolve no aparelho, exato, sem rede e sem gastar a cota da IA. Datas e idade já foram tratadas antes do filtro de dado pessoal.
  // Pergunta com mais assunto ("renda per capita de 3200 / 4, posso incluir no BPC?") segue para a IA, que recebe a conta já feita.
  if (!o.semCalculo) {
    const conta = respostaDoPedido(t);
    if (conta) return respostaDeCalculo(t, o, conta);
  }

  if (!o.semAcoes) {
    const alvo = normalizar(t);
    let m = REG_ACAO.exec(alvo);
    if (m) return tratarAcao(m[2]);
    m = REG_ACAO_SOLTO.exec(alvo);
    if (m) { const solta = tratarAcaoSolta(m[2]); if (solta) return solta; }
    m = REG_FECHAR.exec(alvo);
    if (m && acharPorRotulo(estado.acoes.filter(function (x) { return x.fechar; }), m[2])) return tratarAcao(m[2], true);
    m = REG_BUSCA.exec(alvo);
    if (m) return tratarBusca(m[2]);
  }

  // Pedido de modelo 3D didático ("me manda o modelo 3D do sistema solar"): entrega o modelo-base no aparelho, sem IA.
  if (!o.semModelos) {
    const mod = tratarModelo(t, o);
    if (mod) return mod;
  }

  // Pedido de rota ("traçar rota saindo do CRAS X: A, B e C, voltando ao CRAS X"): o programa ordena e mede no aparelho; endereço de residência é recusado.
  if (!o.semRota) {
    const rota = await tratarRota(t, o);
    if (rota) return rota;
  }

  // Referências territoriais de CAPS e UBS com psicólogo, conforme macroáreas explícitas do Argo.
  if (!o.semGeo) {
    const sm = respostaDeSaudeMentalTerritorio(t);
    if (sm) return { tipo: 'saude-mental-territorio', tipoSaude: sm.tipoSaude, texto: sm.texto, fontes: [], avisos: ['Baseado nas listas do Argo SUAS; a disponibilidade atual de profissional/agenda deve ser confirmada com a unidade.'], pergunta: '', docs: [] };
  }
  // Equipe técnica do CRAS Cristiana Vicente Nunes e o território dividido por técnico(a): diretório local do Argo, sem IA/rede.
  if (!o.semGeo) {
    const eq = respostaDeEquipeCras(t);
    if (eq) return { tipo: 'equipe-cras', tipoEquipe: eq.tipoEquipe, texto: eq.texto, fontes: [], avisos: ['Divisão por técnico(a) do diretório do Argo SUAS (só existe para o CRAS Cristiana Vicente Nunes); confirme com a unidade, pois a equipe pode mudar.'], pergunta: '', docs: [] };
  }
  // Circunscrições dos Distritos Policiais: diretório local do Argo, sem IA/rede e sem inferência por proximidade.
  if (!o.semGeo) {
    const dp = respostaDeDistritoPolicial(t);
    if (dp) return { tipo: 'territorio-dp', tipoTerritorio: dp.tipoTerritorio, texto: dp.texto, fontes: [], avisos: ['Consulta baseada no diretório do Argo SUAS; confirme a circunscrição com a Polícia Civil.'], pergunta: '', docs: [] };
  }
  // Territórios dos Conselhos Tutelares de Boa Vista: diretório local do Argo, sem IA/rede e sem inferir por CRAS.
  if (!o.semGeo) {
    const ct = respostaDeTerritorioCT(t);
    if (ct) return { tipo: 'territorio-ct', tipoTerritorio: ct.tipoTerritorio, texto: ct.texto, fontes: [], avisos: ['Consulta local baseada no diretório do Argo SUAS; confirme limites e encaminhamentos com o Conselho Tutelar.'], pergunta: '', docs: [] };
  }
  // Coordenadas, "perto de", distância e bairro de lugares públicos: o programa responde com o que o app passou, sem chutar.
  if (!o.semGeo) {
    const tg = geoTipoDePedido(t);
    if (tg) {
      const g = await tratarGeo(t, o, tg);
      if (g) return g;
    }
  }

  await estado.pronto;
  // O tipo do pedido (shared/pedido.mjs) decide a busca offline: cumprimento não busca norma; ajuste ("mais curto") e seguimento herdam o assunto anterior.
  const hist = Array.isArray(o.historico) ? o.historico : estado.historico;
  const modo = classificarPedido(t, hist);
  const achados = estado.indice && modo !== 'saudacao' ? buscarFontes(estado.indice, (consultaDoPedido(t, hist, modo) + ' ' + paraBusca(t)).trim(), { k: trechosParaOPedido(modo, t, K_PADRAO), preferir: estado.mem.preferencias(), modo: modo }) : [];
  // Cumprimento, ajuste e seguimento não dizem nada sobre o assunto: não entram nas "perguntas frequentes" nem nos temas aprendidos.
  const aprende = modo === 'normal' || modo === 'consulta';
  const docs = achados.map(function (a) { return a.trecho.doc; }).filter(function (d, i, l) { return d && l.indexOf(d) === i; });

  let motivo = '';
  if (comImagem && !iaLigada()) return { tipo: 'erro', texto: 'Para ler a imagem preciso da IA, que não está ligada agora (sem internet ou sem login).' };
  if (iaLigada()) {
    try {
      const r = await pedirIA(t, o);
      if (r.tipo === 'ia' && !Array.isArray(o.historico)) {
        estado.historico.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: r.texto });
        estado.historico = estado.historico.slice(-cfg.maxHistorico * 4);
      }
      // pergunta e docs ficam no resultado para o app devolver em Paulus.avaliar(r, 'bom'|'ruim'|...)
      r.pergunta = t; r.docs = docs;
      if (o.documento) { const dp = docPreparar(o.documento, t); if (dp) r.avisos = (r.avisos || []).concat(['Documento "' + dp.nome + '": ' + dp.trechos.length + ' trecho(s) lido(s)' + (dp.parcial ? ' (os mais ligados à pergunta)' : '') + (dp.omitidosPessoais ? '; ' + dp.omitidosPessoais + ' com dados pessoais ficaram de fora' : '') + '.']); }
      if (aprende) estado.mem.aprenderPergunta(t, docs);
      return r;
    } catch (e) {
      // Quem apertou "Parar" não quer resposta nenhuma (nem a da base offline).
      if (o.sinal && o.sinal.aborted) return { tipo: 'erro', texto: 'Interrompido.' };
      // Limite de perguntas: a norma offline não resolve e o motivo importa (é só esperar).
      if (e && e.status === 429) return { tipo: 'erro', texto: e.motivo || 'Muitas perguntas seguidas. Aguarde um minuto.', limite: true };
      // Foto que não foi lida: um trecho de norma no lugar dela não responderia o que a pessoa quis saber.
      if (comImagem) return { tipo: 'erro', texto: (e && e.motivo) || 'Não consegui ler a imagem agora. Tente de novo em instantes.' };
      motivo = (e && e.motivo) || '';
      /* senão, cai para a base offline */
    }
  }

  // Sem IA, cumprimento e pedido de ajuste não têm o que responder da base de normas (um trecho de norma no lugar de "mais curto" confundiria).
  if (modo === 'saudacao' || modo === 'refinamento' || modo === 'continuar' || modo === 'porque' || modo === 'contestacao') {
    return { tipo: 'sem_resposta', texto: modo === 'saudacao' ? 'Oi! Estou sem a IA agora, mas a base de normas continua disponível: pergunte pelo assunto.' : modo === 'refinamento' ? 'Não consegui ajustar a resposta agora. Tente de novo em instantes ou copie o texto e edite à mão.' : 'Não consegui retomar a resposta anterior agora (preciso da IA para isso). Tente de novo em instantes ou pergunte pelo assunto, que a base de normas continua disponível.', motivo: motivo };
  }

  // Sem IA: primeiro a resposta que a própria pessoa aprovou antes (se combina), depois o trecho da norma.
  const aprovada = estado.mem.aprovadaPara(t);
  if (aprovada) {
    estado.mem.aprenderPergunta(t, aprovada.d);
    return respostaAprovada(aprovada, t);
  }
  if (achados.length) {
    const rn = respostaDasNormas(achados);
    rn.pergunta = t; rn.docs = docs;
    estado.mem.aprenderPergunta(t, docs);
    return rn;
  }
  return {
    tipo: 'sem_resposta',
    texto: iaLigada()
      ? 'Não consegui responder agora e não encontrei isso na base de normas. Tente de novo em instantes.' + (motivo ? ' (' + motivo + ')' : '')
      : 'Sem internet ou sem IA ligada, e não encontrei isso na base de normas.',
    motivo: motivo
  };
}

// Consulta SÓ a base de normas, no aparelho: sem IA, sem rede, sem ação/busca do app.
// Para apps que têm o próprio fluxo e só querem a norma quando não há IA (ex.: Argo, offline).
// Devolve o mesmo formato de perguntar() com tipo 'norma', ou null se nada na base sustenta a pergunta.
// Dado pessoal na pergunta → null (a norma não depende de identificar ninguém).
// opcoes.historico: conversa do app ({papel:'usuario'|..., texto}); sem ela usa a do Paulus.
async function consultarNormas(texto, opcoes) {
  const o = opcoes || {};
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, cfg.maxPergunta);
  if (!t || temDadoPessoal(t)) return null;
  await estado.pronto;
  if (!estado.indice) return null;
  const hist = Array.isArray(o.historico) ? o.historico : estado.historico;
  const modo = classificarPedido(t, hist);
  if (modo === 'saudacao') return null;
  const achados = buscarFontes(estado.indice, (consultaDoPedido(t, hist, modo) + ' ' + paraBusca(t)).trim(), { k: trechosParaOPedido(modo, t, K_PADRAO), preferir: estado.mem.preferencias(), modo: modo });
  return achados.length ? respostaDasNormas(achados) : null;
}

const Paulus = { init, perguntar, rota: { ler: lerPedidoDeRota, responder: respostaDeRota },
  // Modelos 3D didáticos (v0.20.0; mapa de Roraima v0.21.0): ler(texto) -> pedido ou null; responder(texto) -> resultado ou null; catalogo; url(modelo); baixar(modelo)
  modelos: { ler: lerPedidoDeModelo, responder: respostaDeModelo, catalogo: MODELOS_3D, url: function (m) { return urlDoModelo(m, cfg.modelosUrl); }, baixar: modeloBaixar },
  // Geografia no aparelho (v0.16.0): responder(texto, { pontos, lugares, bairros, ruas, aparelho }) -> resultado ou null; coordenadas/formatar/endereco/perto/distancia/gpx/kml para o app usar direto.
  territorioCT: { responder: respostaDeTerritorioCT, lista: territoriosCT },
  distritosPoliciais: { responder: respostaDeDistritoPolicial, lista: distritosPoliciais },
  saudeMentalTerritorio: { responder: respostaDeSaudeMentalTerritorio, dados: territoriosSaudeMental },
  equipeCras: { responder: respostaDeEquipeCras, dados: equipeCrasCristiana },
  geo: { responder: respostaDeGeo, tipo: geoTipoDePedido, coordenadas: geoLerCoordenadas, formatar: geoFormatarCoordenadas, endereco: geoNormalizarEndereco, montarEndereco: geoMontarEndereco, perto: function (centro, opcoes, o) { return geoPerto(centro, geoFontes(opcoes || {}), o); }, distanciaKm: geoDistanciaKm, links: geoLinksDeRota, gpx: geoParaGpx, kml: geoParaKml },
  // PDF no aparelho (v0.14.0): ler(texto, { temArquivo }) -> pedido ou null; responder(texto, arquivos) -> resultado; editar(operacoes, arquivos); baixar(arquivo)
  pdf: { central: lerPedidoDeCentral, centralInstrucao: instrucaoDeCentral, centralTexto: textoDeCentral, ler: lerPedidoDePdf, responder: function (t, arquivos, opc) { return pdfLerArquivos(arquivos).then(function (l) { return (l.length ? pdfCarregarLib() : Promise.resolve(null)).then(function (PDFLib) { return respostaDePdf(t, l, Object.assign({ PDFLib: PDFLib, converterImagem: pdfImagemParaPng }, opc || {})); }); }); }, editar: pdfEditarNoAparelho, baixar: pdfBaixar, blob: pdfBlob, paginas: resolverPaginasPdf, lista: listaPaginasPdf }, visitas: { ordenar: ordenarVisitas, analisar: analisarEnderecoVisita, explicacao: EXPLICACAO_VISITAS, comSugestao: ordenarComSugestao, ruas: ruasDasVisitas, aprender: aprenderVizinhanca, vizinhancaVazia: vizinhancaVazia, resumoVizinhanca: resumoVizinhanca, explicar: explicacaoDaOrdem }, consultarNormas, registrarAcao, registrarBusca, avaliar, sugestoesPessoais, memoria, limpar, skin, iaLigada, voz: vozDoServidor,
  // Texto para a voz (v0.23.0): texto(bruto) limpa Markdown, fontes, links e símbolos; dividir(texto) -> trechos curtos; resumir(bruto) -> primeiras frases + "O restante está na tela."
  fala: { texto: falaTexto, dividir: falaDividir, resumir: falaResumir, trechos: falaTrechos, aprender: falaAprender, dicionario: falaDicionario }, temDadoPessoal, detectarCrise, revisao: { revisar: revisarTexto, responder: respostaDeRevisao }, versao: '0.23.0',
  // Memória da conversa inteira (estado, resumo do que já foi perguntado e regra do esclarecimento), para os apps usarem do mesmo jeito.
  conversa: { sanearEstado, mesclarEstado, estadoComoTexto, deveEsclarecer, compactarHistorico, soPerguntou },
  // Para apps com cérebro próprio (Argo): reconhece "continue", "tem certeza?" e "de onde tirou isso?" ANTES de reescrever a pergunta,
  // porque esses pedidos só funcionam com as palavras da pessoa. Devolve 'continuar' | 'contestacao' | 'porque' | '' (sem resposta anterior no histórico, sempre '').
  pedido: { sobreResposta: pedidoSobreResposta } };

export default Paulus;
