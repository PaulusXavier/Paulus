// Documento que a pessoa anexa para o Paulus ajudar: o texto é lido NO APARELHO (console/docs.js), dividido em trechos e só vão à IA os trechos
// mais ligados à pergunta, SEM os que trazem dado pessoal (e-mail, CPF/NIS/RG rotulado, nome depois de gatilho...). O Worker confere de novo.
// Nomes com prefixo "doc": este arquivo é concatenado com os demais em dist/paulus.v1.js.

import { temIdentificacaoPessoal, limparMarcacao } from './pii.mjs';

export const DOC_MAX_TRECHO = 900;
export const DOC_ORCAMENTO = 12000;   // caracteres que vão à IA por pergunta (o resto fica no aparelho)
export const DOC_MAX_TRECHOS = 60;
const DOC_SEM = ['para', 'como', 'sobre', 'qual', 'quais', 'quando', 'onde', 'este', 'esta', 'esse', 'essa', 'isso', 'isto', 'documento', 'arquivo', 'texto', 'pelo', 'pela', 'com', 'uma', 'dos', 'das', 'que', 'nos', 'nas', 'mais', 'muito', 'tem', 'ter', 'fala', 'diz', 'traz', 'resuma', 'resumo', 'explique', 'explica', 'anexo', 'anexado'];

function docSimples(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Divide em trechos de até "max" caracteres, respeitando parágrafos e frases.
export function docDividir(texto, max) {
  max = max || DOC_MAX_TRECHO;
  const pedacos = [];
  String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).forEach(function (p) {
    p = p.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
    if (!p) return;
    if (p.length <= max) { pedacos.push(p); return; }
    const frases = p.match(/[^.!?;]+[.!?;]*\s*/g) || [p];
    let atual = '';
    frases.forEach(function (f) {
      while (f.length > max) { if (atual) { pedacos.push(atual.trim()); atual = ''; } pedacos.push(f.slice(0, max)); f = f.slice(max); }
      if ((atual + f).length > max) { pedacos.push(atual.trim()); atual = f; } else atual += f;
    });
    if (atual.trim()) pedacos.push(atual.trim());
  });
  const fora = [];
  let cur = '';
  pedacos.forEach(function (p) { if (cur && cur.length + p.length + 1 > max) { fora.push(cur); cur = p; } else cur = cur ? cur + '\n' + p : p; });
  if (cur) fora.push(cur);
  return fora;
}

// Escolhe QUAIS trechos mandar (devolve índices em ordem do documento): tudo se couber; senão o começo + os que mais combinam com a pergunta.
export function docSelecionar(trechos, pergunta, orcamento) {
  orcamento = orcamento || DOC_ORCAMENTO;
  const total = trechos.reduce(function (s, t) { return s + t.length; }, 0);
  if (total <= orcamento) return trechos.map(function (_t, i) { return i; });
  const termos = (docSimples(pergunta).match(/[a-z0-9]{4,}/g) || []).filter(function (w, i, l) { return l.indexOf(w) === i && DOC_SEM.indexOf(w) < 0; });
  const pont = trechos.map(function (t, i) {
    const s = docSimples(t); let p = 0;
    termos.forEach(function (x) { const n = s.split(x).length - 1; if (n) p += 1 + Math.min(2, n - 1) * 0.3; });
    return { i: i, p: p };
  }).sort(function (a, b) { return b.p - a.p || a.i - b.i; });
  const esc = [0]; let usado = trechos[0].length;
  const cabe = function (i) { return esc.indexOf(i) < 0 && usado + trechos[i].length <= orcamento; };
  if (!pont.length || pont[0].p === 0) {
    const passo = Math.max(1, trechos.length / Math.max(1, Math.floor(orcamento / DOC_MAX_TRECHO)));
    for (let k = 0; k < trechos.length; k += passo) { const i = Math.floor(k); if (cabe(i)) { esc.push(i); usado += trechos[i].length; } }
  } else pont.forEach(function (o) { if (o.p > 0 && cabe(o.i)) { esc.push(o.i); usado += trechos[o.i].length; } });
  return esc.sort(function (a, b) { return a - b; });
}

// No navegador: { nome, texto } -> { nome, trechos, omitidosPessoais, parcial, total } ou null
export function docPreparar(doc, pergunta) {
  if (!doc || typeof doc.texto !== 'string' || !doc.texto.trim()) return null;
  const todos = docDividir(doc.texto);
  const seguros = todos.filter(function (t) { return !temIdentificacaoPessoal(t); });
  const idx = docSelecionar(seguros, pergunta);
  const trechos = idx.map(function (i) { return seguros[i]; });
  return { nome: String(doc.nome || 'documento').slice(0, 120), trechos: trechos, omitidosPessoais: todos.length - seguros.length, parcial: trechos.length < seguros.length, total: todos.length };
}

// No Worker: confere o que chegou ({ nome, trechos:[...] }) e devolve { nome, texto, n, perdidos } ou null.
export function docSaneado(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.trechos)) return null;
  const lim = function (s) { return limparMarcacao(String(s || '')).replace(/[ \t]+/g, ' ').trim(); };
  let usado = 0, perdidos = 0;
  const ok = [];
  d.trechos.slice(0, DOC_MAX_TRECHOS).forEach(function (t) {
    const x = lim(t).slice(0, 1200);
    if (!x) return;
    if (temIdentificacaoPessoal(x)) { perdidos++; return; }
    if (usado + x.length > 14000) return;
    usado += x.length; ok.push(x);
  });
  return { nome: lim(d.nome).slice(0, 120) || 'documento', texto: ok.map(function (x, i) { return '[trecho ' + (i + 1) + '] ' + x; }).join('\n\n'), n: ok.length, perdidos: perdidos };
}
