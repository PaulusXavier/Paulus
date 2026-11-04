// Memória do Paulus: ele aprende com o uso, SÓ NO APARELHO. O Worker continua sem gravar nada.
//
// O que aprende (tudo vem de pergunta que já passou pelo filtro de dados pessoais):
//   estilo      respostas mais curtas / mais detalhadas / com exemplos (botões 👍 👎 "mais curto" "explicar de outro jeito")
//   temas       documentos da base que a pessoa mais consulta (favorecem a ordem da busca e escolhem exemplos)
//   perguntas   as que se repetem viram sugestões do mascote
//   apelidos    "abrir cadunico" -> a tela que a pessoa disse ser essa (ensinado uma vez, vale sempre)
//   aprovadas   respostas que a pessoa aprovou com 👍; servem quando a IA ou a internet falham
//   acoes       telas que a pessoa mais abre
//
// Regras: nada aqui contém dado de pessoa (cada texto passa de novo por temDadoPessoal ao gravar, ao ler e ao importar);
// tudo envelhece (a meia-vida faz o Paulus "esquecer" o que a pessoa deixou de usar); é pequeno (limites fixos);
// pode ser visto (resumo), levado (exportar/importar) e apagado (esquecer). Pergunta sobre suicídio/autolesão nunca é guardada.
//
// Este arquivo é concatenado por scripts/build.mjs: imports em UMA linha, nomes de função únicos (prefixo "mem").

import { temDadoPessoal } from '../shared/pii.mjs';
import { normalizar, criarIndice, buscar } from '../shared/busca.mjs';

const MEM_VERSAO = 1;
const MEM_CHAVE = 'paulus:memoria:v' + MEM_VERSAO;
const MEM_DIA = 86400000;
const MEM_MEIA_VIDA_ESTILO = 60 * MEM_DIA;   // o estilo muda devagar
const MEM_MEIA_VIDA_TEMAS = 45 * MEM_DIA;
const MEM_MEIA_VIDA_PERGUNTAS = 90 * MEM_DIA;
const MEM_VALIDADE_APROVADA = 180 * MEM_DIA; // resposta aprovada antiga pode ter perdido a validade (norma muda)
const MEM_LIM = { perguntas: 150, temas: 40, acoes: 40, apelidos: 40, aprovadas: 30, textoPergunta: 140, textoResposta: 1800, apelido: 40 };
const MEM_LIMIAR_ESTILO = 1.5;               // pontos (com decaimento) para o estilo mudar
const MEM_SINAIS = ['bom', 'ruim', 'mais_curto', 'mais_detalhe', 'outro_jeito', 'copiou'];
const MEM_RE_SENSIVEL = /suicid|ideacao|autolesao|automutil|me matar|tirar a propria vida/;
const MEM_RE_ID = /^[a-z0-9_-]{1,40}$/i;
const MEM_RE_DOC = /^[a-z0-9_.-]{1,100}$/i;
const MEM_RE_CHAVE_ACAO = /^[a-z0-9_-]{1,20}\/[a-z0-9_-]{1,40}$/i;

function memVazia() {
  return { v: MEM_VERSAO, criadoEm: 0, estilo: { curto: [0, 0], detalhe: [0, 0], exemplos: [0, 0] }, temas: {}, perguntas: {}, acoes: {}, apelidos: {}, aprovadas: [] };
}

// ------------------------------------------------------------------ peso com decaimento
// Um peso é [valor, quando]. O valor "de agora" é valor * 0.5^(dias / meia-vida).

function memPeso(par, agora, meiaVida) {
  if (!Array.isArray(par) || typeof par[0] !== 'number' || typeof par[1] !== 'number') return 0;
  const dt = Math.max(0, agora - par[1]);
  return par[0] * Math.pow(0.5, dt / meiaVida);
}

function memSomar(par, delta, agora, meiaVida) {
  return [Math.round((memPeso(par, agora, meiaVida) + delta) * 1000) / 1000, agora];
}

// ------------------------------------------------------------------ limpeza (usada ao ler, ao importar e ao gravar)

function memNum(v, min, max, padrao) {
  return typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
}

function memPar(p) {
  return Array.isArray(p) ? [memNum(p[0], -20, 20, 0), memNum(p[1], 0, 4102444800000, 0)] : [0, 0];
}

// Texto livre só entra se for curto, sem dado pessoal e sem marcação.
function memTextoLimpo(v, max) {
  const t = String(v == null ? '' : v).replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t && !temDadoPessoal(t) ? t : '';
}

function memLista(a) { return Array.isArray(a) ? a : []; }
function memObj(o) { return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }

// Reconstrói a memória campo a campo: nada do que vem de fora (armazenamento adulterado, arquivo importado) passa sem conferência.
function memSanear(bruto) {
  const b = memObj(bruto);
  const m = memVazia();
  if (b.v !== MEM_VERSAO) return m;
  m.criadoEm = memNum(b.criadoEm, 0, 4102444800000, 0);
  ['curto', 'detalhe', 'exemplos'].forEach(function (k) { m.estilo[k] = memPar(memObj(b.estilo)[k]); });
  Object.keys(memObj(b.temas)).slice(0, MEM_LIM.temas).forEach(function (doc) {
    if (MEM_RE_DOC.test(doc)) m.temas[doc] = memPar(b.temas[doc]);
  });
  Object.keys(memObj(b.perguntas)).slice(0, MEM_LIM.perguntas).forEach(function (k) {
    const p = memObj(b.perguntas[k]);
    const t = memTextoLimpo(p.t, MEM_LIM.textoPergunta);
    const app = String(k).split('|')[0];
    if (!t || !MEM_RE_ID.test(app) || MEM_RE_SENSIVEL.test(normalizar(t))) return;
    m.perguntas[app + '|' + normalizar(t)] = { t: t, n: memNum(p.n, 1, 9999, 1), p: memPar(p.p) };
  });
  Object.keys(memObj(b.acoes)).slice(0, MEM_LIM.acoes).forEach(function (k) {
    if (MEM_RE_CHAVE_ACAO.test(k)) m.acoes[k] = memPar(b.acoes[k]);
  });
  Object.keys(memObj(b.apelidos)).slice(0, MEM_LIM.apelidos).forEach(function (k) {
    const i = String(k).lastIndexOf('|');
    const alvo = String(b.apelidos[k] || '');
    const frase = i > 0 ? memTextoLimpo(String(k).slice(0, i), MEM_LIM.apelido) : '';
    if (frase && MEM_RE_CHAVE_ACAO.test(alvo) && String(k).slice(i + 1) === alvo) m.apelidos[normalizar(frase) + '|' + alvo] = alvo;
  });
  memLista(b.aprovadas).slice(0, MEM_LIM.aprovadas).forEach(function (x) {
    const a = memObj(x);
    const q = memTextoLimpo(a.q, MEM_LIM.textoPergunta);
    const r = String(a.r == null ? '' : a.r).replace(/[<>]/g, ' ').trim().slice(0, MEM_LIM.textoResposta);
    if (!q || !r || MEM_RE_SENSIVEL.test(normalizar(q))) return;
    const fontes = memLista(a.f).slice(0, 4).map(function (f) {
      const o = memObj(f);
      return { documento: memTextoLimpo(o.documento, 160), norma: memTextoLimpo(o.norma, 240), ano: memNum(o.ano, 0, 3000, 0) || undefined, referencia: memTextoLimpo(o.referencia, 200) };
    });
    m.aprovadas.push({ q: q, r: r, f: fontes, d: memLista(a.d).filter(function (d) { return MEM_RE_DOC.test(String(d)); }).slice(0, 6).map(String), app: MEM_RE_ID.test(String(a.app || '')) ? String(a.app) : '', ts: memNum(a.ts, 0, 4102444800000, 0) });
  });
  return m;
}

// ------------------------------------------------------------------ armazenamento

// Guarda em localStorage (por origem). Se não houver (modo privativo, bloqueio), a memória vale só enquanto a página está aberta.
function memArmazenamentoPadrao() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('paulus:teste', '1');
      localStorage.removeItem('paulus:teste');
      return localStorage;
    }
  } catch (e) { /* bloqueado */ }
  const volatil = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(volatil, k) ? volatil[k] : null; }, setItem: function (k, v) { volatil[k] = String(v); }, removeItem: function (k) { delete volatil[k]; } };
}

// criarMemoria({ app, perfil?, armazenamento?, agora?, ativa? }) -> objeto com a API. Uma por init().
export function criarMemoria(cfgMem) {
  const o = cfgMem || {};
  const app = String(o.app || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'app';
  const agora = typeof o.agora === 'function' ? o.agora : function () { return Date.now(); };
  const depositos = o.armazenamento || memArmazenamentoPadrao();
  // perfil: identificador opaco da conta no app (nunca e-mail ou nome), para duas pessoas no mesmo navegador terem memórias separadas.
  const perfil = String(o.perfil || 'local').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'local';
  const chave = MEM_CHAVE + ':' + perfil;
  const chaveAtiva = chave + ':ativa';
  let dados = null;
  let ativa = true;

  function carregar() {
    if (dados) return dados;
    try { ativa = depositos.getItem(chaveAtiva) !== '0' && o.ativa !== false; } catch (e) { ativa = o.ativa !== false; }
    try { dados = memSanear(JSON.parse(depositos.getItem(chave) || 'null')); } catch (e) { dados = memVazia(); }
    if (!dados.criadoEm) dados.criadoEm = agora();
    return dados;
  }

  function gravar() {
    try { depositos.setItem(chave, JSON.stringify(dados)); } catch (e) { /* cota cheia: segue só em memória */ }
  }

  // Mantém a memória pequena: o que tem menos peso hoje sai primeiro.
  function podar() {
    const t = agora();
    const cortar = function (mapa, max, valor) {
      const chaves = Object.keys(mapa);
      if (chaves.length <= max) return;
      chaves.sort(function (x, y) { return valor(mapa[y]) - valor(mapa[x]); }).slice(max).forEach(function (k) { delete mapa[k]; });
    };
    cortar(dados.temas, MEM_LIM.temas, function (p) { return memPeso(p, t, MEM_MEIA_VIDA_TEMAS); });
    cortar(dados.perguntas, MEM_LIM.perguntas, function (p) { return p.n * Math.max(0.01, memPeso([1, p.p[1]], t, MEM_MEIA_VIDA_PERGUNTAS)); });
    cortar(dados.acoes, MEM_LIM.acoes, function (p) { return memPeso(p, t, MEM_MEIA_VIDA_TEMAS); });
    Object.keys(dados.temas).forEach(function (k) { if (memPeso(dados.temas[k], t, MEM_MEIA_VIDA_TEMAS) < 0.05) delete dados.temas[k]; });
    dados.aprovadas = dados.aprovadas.filter(function (a) { return t - a.ts < MEM_VALIDADE_APROVADA; }).slice(-MEM_LIM.aprovadas);
  }

  function mexer(fn) {
    carregar();
    if (!ativa) return;
    fn(carregar(), agora());
    podar();
    gravar();
  }

  const chaveAcao = function (id) { return app + '/' + id; };

  // ---------------------------------------------------------------- o que se aprende

  // Uma pergunta respondida (qualquer tipo). docs = ids dos documentos que a busca achou.
  function aprenderPergunta(texto, docs) {
    const t = memTextoLimpo(texto, MEM_LIM.textoPergunta);
    if (!t || MEM_RE_SENSIVEL.test(normalizar(t))) return;
    mexer(function (m, agoraMs) {
      const k = app + '|' + normalizar(t);
      const antiga = m.perguntas[k];
      m.perguntas[k] = { t: t, n: Math.min(9999, (antiga ? antiga.n : 0) + 1), p: [1, agoraMs] };
      memLista(docs).slice(0, 3).forEach(function (d) {
        if (MEM_RE_DOC.test(String(d))) m.temas[d] = memSomar(m.temas[d], 0.3, agoraMs, MEM_MEIA_VIDA_TEMAS);
      });
    });
  }

  function aprenderAcao(id) {
    if (!MEM_RE_ID.test(String(id || ''))) return;
    mexer(function (m, agoraMs) { m.acoes[chaveAcao(id)] = memSomar(m.acoes[chaveAcao(id)], 1, agoraMs, MEM_MEIA_VIDA_TEMAS); });
  }

  // Ensina "quando eu digitar esta frase, é esta tela".
  function vincular(frase, idAcao) {
    const f = memTextoLimpo(frase, MEM_LIM.apelido);
    const k = normalizar(f);
    if (!k || k.length < 2 || !MEM_RE_ID.test(String(idAcao || ''))) return false;
    mexer(function (m) {
      Object.keys(m.apelidos).forEach(function (x) { if (x.indexOf(k + '|' + app + '/') === 0) delete m.apelidos[x]; });
      m.apelidos[k + '|' + chaveAcao(idAcao)] = chaveAcao(idAcao);
    });
    return true;
  }

  function apelidoDe(textoNormalizado) {
    const m = carregar();
    if (!ativa) return '';
    const prefixo = textoNormalizado + '|' + app + '/';
    for (const k of Object.keys(m.apelidos)) {
      if (k.indexOf(prefixo) === 0) return k.slice(prefixo.length);
    }
    return '';
  }

  // Sinal da pessoa sobre uma resposta. r = { pergunta, texto, fontes, docs } (o resultado de Paulus.perguntar já traz isso).
  function avaliar(r, sinal) {
    if (MEM_SINAIS.indexOf(sinal) === -1) return false;
    const x = r || {};
    mexer(function (m, agoraMs) {
      const st = m.estilo;
      // Um sinal contrário só esfria o outro (até zero): não conta como ponto a favor do lado oposto.
      const somar = function (campo, d) { const n = memSomar(st[campo], d, agoraMs, MEM_MEIA_VIDA_ESTILO); st[campo] = [Math.max(0, n[0]), n[1]]; };
      const docs = memLista(x.docs).filter(function (d) { return MEM_RE_DOC.test(String(d)); }).slice(0, 3);
      const temas = function (d) { docs.forEach(function (doc) { m.temas[doc] = memSomar(m.temas[doc], d, agoraMs, MEM_MEIA_VIDA_TEMAS); }); };
      if (sinal === 'mais_curto') { somar('curto', 1); somar('detalhe', -0.5); }
      else if (sinal === 'mais_detalhe') { somar('detalhe', 1); somar('curto', -0.5); }
      else if (sinal === 'outro_jeito') { somar('exemplos', 1); }
      else if (sinal === 'copiou') { temas(0.5); }
      else if (sinal === 'bom') { temas(1.5); guardarAprovada(m, x, docs, agoraMs); }
      else if (sinal === 'ruim') { temas(-1); esquecerAprovada(m, x.pergunta); }
    });
    return true;
  }

  function guardarAprovada(m, x, docs, agoraMs) {
    const q = memTextoLimpo(x.pergunta, MEM_LIM.textoPergunta);
    const r = String(x.texto || '').slice(0, MEM_LIM.textoResposta);
    if (!q || !r || x.deMemoria || MEM_RE_SENSIVEL.test(normalizar(q))) return;
    const limpa = memSanear({ v: MEM_VERSAO, aprovadas: [{ q: q, r: r, f: memLista(x.fontes), d: docs, app: app, ts: agoraMs }] }).aprovadas[0];
    if (!limpa) return;
    m.aprovadas = m.aprovadas.filter(function (a) { return normalizar(a.q) !== normalizar(q) || a.app !== app; });
    m.aprovadas.push(limpa);
  }

  function esquecerAprovada(m, pergunta) {
    const k = normalizar(memTextoLimpo(pergunta, MEM_LIM.textoPergunta));
    if (k) m.aprovadas = m.aprovadas.filter(function (a) { return normalizar(a.q) !== k || a.app !== app; });
  }

  // ---------------------------------------------------------------- o que se usa do que foi aprendido

  function estilo() {
    const m = carregar();
    if (!ativa) return { tamanho: 'normal', exemplos: false };
    const t = agora();
    const saldo = memPeso(m.estilo.curto, t, MEM_MEIA_VIDA_ESTILO) - memPeso(m.estilo.detalhe, t, MEM_MEIA_VIDA_ESTILO);
    return {
      tamanho: saldo >= MEM_LIMIAR_ESTILO ? 'curto' : saldo <= -MEM_LIMIAR_ESTILO ? 'detalhado' : 'normal',
      exemplos: memPeso(m.estilo.exemplos, t, MEM_MEIA_VIDA_ESTILO) >= MEM_LIMIAR_ESTILO
    };
  }

  // Documentos preferidos, do mais ao menos consultado (só os que já têm peso de verdade).
  function temasTop(n) {
    const m = carregar();
    if (!ativa) return [];
    const t = agora();
    return Object.keys(m.temas)
      .map(function (d) { return { doc: d, peso: memPeso(m.temas[d], t, MEM_MEIA_VIDA_TEMAS) }; })
      .filter(function (x) { return x.peso >= 1; })
      .sort(function (x, y) { return y.peso - x.peso; })
      .slice(0, n || 3);
  }

  // { doc: fator } para buscar({ preferir }): de 1,0 a 1,3 conforme o peso.
  function preferencias() {
    const f = {};
    temasTop(5).forEach(function (x) { f[x.doc] = 1 + Math.min(0.3, x.peso * 0.06); });
    return f;
  }

  // O que vai ao Worker: códigos de uma lista fechada e ids públicos de documentos. Nenhum texto livre, nenhuma pergunta.
  function paraEnvio() {
    if (!ativa) return null;
    const e = estilo();
    const temas = temasTop(3).map(function (x) { return x.doc; });
    if (e.tamanho === 'normal' && !e.exemplos && !temas.length) return null;
    return { tamanho: e.tamanho, exemplos: e.exemplos, temas: temas };
  }

  // Sugestões personalizadas para o mascote: perguntas que se repetem (neste app) e telas mais abertas.
  function frequentes(n) {
    const m = carregar();
    if (!ativa) return [];
    const t = agora();
    return Object.keys(m.perguntas)
      .filter(function (k) { return k.indexOf(app + '|') === 0 && m.perguntas[k].n >= 2; })
      .map(function (k) { return { texto: m.perguntas[k].t, n: m.perguntas[k].n, peso: m.perguntas[k].n * Math.max(0.01, memPeso([1, m.perguntas[k].p[1]], t, MEM_MEIA_VIDA_PERGUNTAS)) }; })
      .sort(function (x, y) { return y.peso - x.peso; })
      .slice(0, n || 3);
  }

  function acoesFrequentes(n) {
    const m = carregar();
    if (!ativa) return [];
    const t = agora();
    return Object.keys(m.acoes)
      .filter(function (k) { return k.indexOf(app + '/') === 0; })
      .map(function (k) { return { id: k.slice(app.length + 1), peso: memPeso(m.acoes[k], t, MEM_MEIA_VIDA_TEMAS) }; })
      .filter(function (x) { return x.peso >= 2; })
      .sort(function (x, y) { return y.peso - x.peso; })
      .slice(0, n || 3);
  }

  // Resposta aprovada que combina com a pergunta (para quando a IA/internet falham). null se nada serve.
  function aprovadaPara(pergunta) {
    const m = carregar();
    if (!ativa) return null;
    const t = agora();
    const validas = m.aprovadas.filter(function (a) { return a.app === app && t - a.ts < MEM_VALIDADE_APROVADA; });
    if (!validas.length) return null;
    // A pergunta aprovada pesa mais que o texto da resposta: repetida três vezes no texto indexado.
    const trechos = validas.map(function (a, i) { return { id: 'ap' + i, doc: 'aprovada-' + i, titulo: a.q, norma: '', ano: 0, referencia: '', texto: a.q + ' ' + a.q + ' ' + a.q + ' ' + a.r }; });
    const achou = buscar(criarIndice(trechos), pergunta, { k: 1, minScore: 1.2, minCobertura: 0.6 });
    if (!achou.length) return null;
    return validas[Number(achou[0].trecho.id.slice(2))];
  }

  // ---------------------------------------------------------------- ver, levar, apagar

  function nomeDoc(doc, base) {
    const c = memLista(base).filter(function (x) { return x && x.doc === doc; })[0];
    return c ? String(c.titulo || doc) : doc;
  }

  // Texto em português do que o Paulus aprendeu (para uma tela "O que o Paulus aprendeu sobre mim").
  function resumo(base) {
    const m = carregar();
    const e = estilo();
    const linhas = [];
    if (e.tamanho === 'curto') linhas.push('Você costuma preferir respostas curtas.');
    if (e.tamanho === 'detalhado') linhas.push('Você costuma preferir respostas mais detalhadas.');
    if (e.exemplos) linhas.push('Você costuma pedir para explicar de outro jeito, então incluo exemplos práticos.');
    const temas = temasTop(3).map(function (x) { return nomeDoc(x.doc, base); });
    if (temas.length) linhas.push('Documentos que você mais consulta: ' + temas.join('; ') + '.');
    const freq = frequentes(3).map(function (x) { return '"' + x.texto + '"'; });
    if (freq.length) linhas.push('Perguntas que você repete: ' + freq.join('; ') + '.');
    const apelidos = Object.keys(m.apelidos).filter(function (k) { return m.apelidos[k].indexOf(app + '/') === 0; }).map(function (k) { return '"' + k.split('|')[0] + '"'; });
    if (apelidos.length) linhas.push('Apelidos que você me ensinou para telas: ' + apelidos.join(', ') + '.');
    const aprovadas = m.aprovadas.filter(function (a) { return a.app === app; }).length;
    if (aprovadas) linhas.push('Guardo ' + aprovadas + ' resposta(s) que você aprovou, para uso sem internet.');
    return { ativa: ativa, linhas: linhas, vazia: !linhas.length, estilo: e, desde: m.criadoEm };
  }

  function exportar() { return JSON.stringify(carregar()); }

  // Aceita só o que passa pela limpeza; o que o arquivo trouxer de fora dela é descartado.
  function importar(json) {
    let bruto;
    try { bruto = JSON.parse(String(json)); } catch (e) { return false; }
    if (memObj(bruto).v !== MEM_VERSAO) return false;
    const limpo = memSanear(bruto);
    dados = limpo;
    if (!dados.criadoEm) dados.criadoEm = agora();
    gravar();
    return true;
  }

  // esquecer() apaga tudo; esquecer('estilo'|'temas'|'perguntas'|'apelidos'|'aprovadas'|'acoes') apaga só aquela parte.
  function esquecer(parte) {
    const m = carregar();
    const vazia = memVazia();
    if (!parte) dados = vazia;
    else if (Object.prototype.hasOwnProperty.call(vazia, parte) && parte !== 'v' && parte !== 'criadoEm') m[parte] = vazia[parte];
    else return false;
    if (!dados.criadoEm) dados.criadoEm = agora();
    gravar();
    return true;
  }

  // Desligar não apaga o que já foi aprendido, só para de aprender e de usar. Fica salvo para o próximo carregamento.
  function ligar(sim) {
    carregar();
    ativa = !!sim;
    try { depositos.setItem(chaveAtiva, ativa ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
  }

  return {
    aprenderPergunta: aprenderPergunta, aprenderAcao: aprenderAcao, vincular: vincular, apelidoDe: apelidoDe, avaliar: avaliar,
    estilo: estilo, temasTop: temasTop, preferencias: preferencias, paraEnvio: paraEnvio, frequentes: frequentes, acoesFrequentes: acoesFrequentes,
    aprovadaPara: aprovadaPara, resumo: resumo, exportar: exportar, importar: importar, esquecer: esquecer, ligar: ligar,
    ativa: function () { carregar(); return ativa; }
  };
}

// Pergunta que nunca deve virar memória nem sugestão (a regra é a mesma usada ao gravar).
export function memEhSensivel(texto) { return MEM_RE_SENSIVEL.test(normalizar(texto)); }
