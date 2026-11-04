// Sugestões de continuação. O modelo termina a resposta com uma linha "SUGESTÕES: a | b | c".
// Isso vira botões no mascote e NUNCA aparece no texto. Funciona no navegador e no Worker (sem DOM).

// O rótulo só vale no começo de uma linha ('Sugestões:'); uma frase como 'a sugestão do CRAS' não conta.
const RE_SUG = /(?:^|\n)[ \t]*(?:\*\*)?sugest(?:õ|o)es(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*([\s\S]*)$/i;

export function separarSugestoes(texto) {
  const t = String(texto == null ? '' : texto);
  const m = t.match(RE_SUG);
  if (!m) return { texto: t.trim(), sugestoes: [] };
  const vistos = new Set();
  const sugestoes = m[1].split(/\s*\|\s*|\n\s*(?:[-•*]|\d+[.)])\s*/)
    .map(function (x) { return x.replace(/^[\s\-•*"“]+|[\s"”]+$/g, '').trim(); })
    .filter(function (x) { return x.length >= 6 && x.length <= 70 && /[a-zà-ú]/i.test(x) && /[?a-zà-ú]$/i.test(x); })
    .filter(function (x) { const k = x.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 3);
  return { texto: t.slice(0, m.index).trim(), sugestoes: sugestoes };
}

// Durante o streaming: esconde o rótulo (inclusive parcial, "SUG", "**Suges") e tudo que vem depois.
export function ocultarSugestoes(parcial) {
  const t = String(parcial == null ? '' : parcial);
  const m = RE_SUG.exec(t);
  if (m) return t.slice(0, m.index).replace(/\s+$/, '');
  const nl = t.lastIndexOf('\n');
  const ult = nl > -1 ? t.slice(nl + 1) : '';
  const alvo = ult.replace(/[*\s]/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (alvo.length >= 3 && 'sugestoes:'.indexOf(alvo) === 0) return t.slice(0, nl).replace(/\s+$/, '');
  return t;
}

// ---------------------------------------------------------------- ações propostas pela IA
// Quando o app informa o que sabe abrir ou fazer, o modelo pode terminar a resposta com UMA linha
// "AÇÕES NO APP: id1 | id2". Isso vira botões (a pessoa decide tocar) e NUNCA aparece no texto.
// A IA só escolhe ids que o app mandou: o que não estiver na lista é descartado aqui.
// O rótulo é composto de propósito ("ações no app"): "Ações:" sozinho aparece em respostas normais.

const RE_ACOES = /(?:^|\n)[ \t]*(?:\*\*)?a(?:ç|c)(?:õ|o)es[ \t]+no[ \t]+app[ \t]*(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*([^\n]*)/i;
export const RE_ID_ACAO = /^[a-z0-9_-]{1,40}$/i;
export const MAX_ACOES_PROPOSTAS = 2;

export function separarAcoes(texto, permitidas) {
  const t = String(texto == null ? '' : texto);
  const m = RE_ACOES.exec(t);
  if (!m) return { texto: t.trim(), acoes: [] };
  const validas = {};
  (Array.isArray(permitidas) ? permitidas : []).forEach(function (id) { validas[String(id).toLowerCase()] = String(id); });
  const vistos = {};
  const acoes = [];
  m[1].split(/\s*[|,;]\s*/).forEach(function (bruto) {
    const id = bruto.replace(/^[\s`*"'“”(\[]+|[\s`*"'“”.)\]]+$/g, '').toLowerCase();
    if (!RE_ID_ACAO.test(id) || !validas[id] || vistos[id]) return;
    vistos[id] = true;
    acoes.push(validas[id]);
  });
  // Tira só a linha da marcação; o resto do texto (inclusive as SUGESTÕES depois dela) fica.
  const semLinha = t.slice(0, m.index) + t.slice(m.index + m[0].length);
  return { texto: semLinha.replace(/\n{3,}/g, '\n\n').trim(), acoes: acoes.slice(0, MAX_ACOES_PROPOSTAS) };
}

// Durante o streaming: esconde o rótulo (inclusive parcial, "AÇ", "**Ações no a") e tudo que vem depois.
export function ocultarAcoes(parcial) {
  const t = String(parcial == null ? '' : parcial);
  const m = RE_ACOES.exec(t);
  if (m) return t.slice(0, m.index).replace(/\s+$/, '');
  const nl = t.lastIndexOf('\n');
  const ult = nl > -1 ? t.slice(nl + 1) : t;
  const alvo = ult.replace(/[*\s]/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (alvo.length >= 3 && 'acoesnoapp:'.indexOf(alvo) === 0) return (nl > -1 ? t.slice(0, nl) : '').replace(/\s+$/, '');
  return t;
}

// Os dois rótulos de uma vez (a ordem em que o modelo os escreve não importa).
export function ocultarControles(parcial) { return ocultarAcoes(ocultarSugestoes(parcial)); }

export function separarControles(texto, permitidas) {
  const a = separarAcoes(texto, permitidas);
  const s = separarSugestoes(a.texto);
  return { texto: s.texto, sugestoes: s.sugestoes, acoes: a.acoes };
}
