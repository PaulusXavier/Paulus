// Preparação do texto para a VOZ do Paulus (v0.23.0).
// A tela mostra Markdown, tabelas, links, fontes e avisos; a voz não deve ler nada disso. Aqui o texto vira fala:
//   falaTexto(bruto)       texto limpo, com símbolos, números, ordinais e siglas por extenso
//   falaDividir(texto)     trechos curtos, cortados no fim da frase (a voz começa logo e o navegador não corta falas longas)
//   falaResumir(bruto)     as primeiras frases + "O restante está na tela." (leitura automática de respostas longas)
// Sem dependências e sem lookbehind (Safari antigo): o build junta este arquivo ao paulus.v1.js.

const FL_LETRAS = { a: 'á', b: 'bê', c: 'cê', d: 'dê', e: 'é', f: 'éfe', g: 'gê', h: 'agá', i: 'i', j: 'jota', k: 'cá', l: 'éle', m: 'ême', n: 'ene', o: 'ó', p: 'pê', q: 'quê', r: 'érre', s: 'ésse', t: 'tê', u: 'u', v: 'vê', w: 'dáblio', x: 'xis', y: 'ípsilon', z: 'zê' };
// Siglas lidas letra por letra. As que se leem como palavra (CRAS, CREAS, PAIF, SUAS, LOAS, CAPS, NIS) ficam de fora.
const FL_SOLETRA = { BPC: 1, CPF: 1, RG: 1, CNPJ: 1, CNAS: 1, CNH: 1, LGPD: 1, SCFV: 1, MDS: 1, INSS: 1, CID: 1, CFP: 1, CRP: 1, TDAH: 1, TEA: 1, TCLE: 1, IA: 1, UBS: 1, UPA: 1, CMAS: 1, CGU: 1, PBF: 1, PIA: 1, PTA: 1, SMS: 1, DF: 1, UF: 1, TI: 1, IBGE: 1, EJA: 1 };
const FL_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const FL_UNID = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const FL_DEZ = ['', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo', 'septuagésimo', 'octogésimo', 'nonagésimo'];

function flOrdinal(n, fem) {
  const num = Number(n);
  if (!(num >= 1 && num <= 99)) return String(n);
  const palavras = [];
  if (num >= 10) palavras.push(FL_DEZ[Math.floor(num / 10)]);
  if (num % 10) palavras.push(FL_UNID[num % 10]);
  return palavras.map(function (p) { return fem ? p.replace(/o$/, 'a') : p; }).join(' ');
}

function flSoletrar(sigla) {
  return sigla.toLowerCase().split('').map(function (c) { return FL_LETRAS[c] || c; }).join(' ');
}

function flDinheiro(t) {
  return t.replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(\s*(?:milh(?:ão|ões)|bilh(?:ão|ões)|mil(?![a-zà-ú])))?/gi, function (_, reais, cent, grande) {
    const r = Number(reais.replace(/\./g, ''));
    if (grande) {
      const g = grande.trim().toLowerCase();
      return reais + (cent ? ',' + cent : '') + ' ' + g + (g === 'mil' ? ' reais' : ' de reais');
    }
    const c = cent ? Number(cent.length === 1 ? cent + '0' : cent) : 0;   // "R$ 1,5" = 1 real e 50 centavos; "00" não é falado
    if (r === 0 && c > 0) return c + (c === 1 ? ' centavo' : ' centavos');
    const parteReais = reais + (r === 1 ? ' real' : ' reais');
    return c > 0 ? parteReais + ' e ' + c + (c === 1 ? ' centavo' : ' centavos') : parteReais;
  });
}

function flDatasEHoras(t) {
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, function (m, d, mes, a) {
    const dia = Number(d), mm = Number(mes);
    if (dia < 1 || dia > 31 || mm < 1 || mm > 12) return m;
    return (dia === 1 ? 'primeiro' : String(dia)) + ' de ' + FL_MESES[mm - 1] + ' de ' + a;
  });
  t = t.replace(/\b(\d{1,2})h(\d{2})\b/g, function (m, h, min) { return h + (Number(h) === 1 ? ' hora' : ' horas') + (Number(min) ? ' e ' + Number(min) + (Number(min) === 1 ? ' minuto' : ' minutos') : ''); });
  t = t.replace(/\b(\d{1,2})h\b/g, function (m, h) { return h + (Number(h) === 1 ? ' hora' : ' horas'); });
  return t;
}

// Abreviações, símbolos e números que a voz lê errado ou não lê.
function flSimbolos(t) {
  t = flDinheiro(t);
  t = flDatasEHoras(t);
  t = t.replace(/(\d+(?:,\d+)?)\s*%/g, '$1 por cento').replace(/%/g, ' por cento ');
  t = t.replace(/(\d{1,2})\s*ª/g, function (m, n) { return flOrdinal(n, true); });
  t = t.replace(/(\d{1,2})\s*[º°]/g, function (m, n) { return flOrdinal(n, false); });
  t = t.replace(/\bn\.?\s?[º°](s?)\s*/gi, function (m, s) { return s ? 'números ' : 'número '; });
  t = t.replace(/§§\s*/g, 'parágrafos ').replace(/§\s*/g, 'parágrafo ');
  t = t.replace(/\barts\.\s*/gi, 'artigos ').replace(/\bart\.\s*/gi, 'artigo ');
  t = t.replace(/\binc\.\s*/gi, 'inciso ').replace(/\bcap\.\s*/gi, 'capítulo ');
  t = t.replace(/\bpp\.\s*(?=\d)/gi, 'páginas ').replace(/\bp\.\s*(?=\d)/gi, 'página ');
  t = t.replace(/\bpágs\.\s*/gi, 'páginas ').replace(/\bpág\.\s*/gi, 'página ');
  t = t.replace(/\bobs\.\s*:?/gi, 'observação:').replace(/\bex\.\s*:?/gi, 'por exemplo, ').replace(/\bi\.e\./gi, 'isto é,').replace(/\be\.g\./gi, 'por exemplo,');
  t = t.replace(/\betc\./gi, 'etcétera').replace(/\bmáx\./gi, 'máximo').replace(/\bmín\./gi, 'mínimo').replace(/\btel\.\s*/gi, 'telefone ');
  t = t.replace(/\bDra\.\s*/g, 'doutora ').replace(/\bDr\.\s*/g, 'doutor ').replace(/\bSra\.\s*/g, 'senhora ').replace(/\bSr\.\s*/g, 'senhor ');
  t = t.replace(/\bCad[ÚU]nico\b/g, 'Cadastro Único');
  // "6º-C" já virou "sexto-C": a letra do artigo fica separada
  t = t.replace(/\b(primeiro|segundo|terceiro|quarto|quinto|sexto|sétimo|oitavo|nono|décimo)-([A-Z])\b/g, '$1 $2');
  // barras e travessões: nunca lidos como símbolo
  t = t.replace(/\be\/ou\b/gi, 'e ou');
  t = t.replace(/(\d)\/(\d{4})\b/g, '$1 de $2');
  t = t.replace(/\b([A-Z]{2,})\/([A-Z]{2,})\b/g, '$1 e $2').replace(/\s*\/\s*/g, ' ou ');
  t = t.replace(/\s+[—–-]\s+/g, ', ').replace(/[—–]/g, ', ').replace(/\s*[→➜➔]\s*/g, ', ').replace(/\s*-+>\s*/g, ', ');
  t = t.replace(/\s*[·•]\s*/g, ', ').replace(/&/g, ' e ').replace(/\s\+\s/g, ' mais ').replace(/\s=\s/g, ' igual a ');
  // siglas letra por letra: as da lista e qualquer sigla curta sem vogal (BV, RR, SCFV)
  t = t.replace(/\b[A-Z]{2,5}\b/g, function (s) { return FL_SOLETRA[s] || !/[AEIOU]/.test(s) ? flSoletrar(s) : s; });
  return t;
}

// ---------------------------------------------------------------- Markdown -> frases
function flLinhaDeFonte(l) { return /^(fontes?|refer[êe]ncias?)\s*[:：]/i.test(l); }
function flLinhaDeAviso(l) { return /gerada por (ia|intelig[êe]ncia artificial)/i.test(l) || /^confira antes de usar/i.test(l); }

function flInline(l) {
  l = l.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');                       // imagem: fica o texto alternativo
  l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');   // link: fica o texto
  l = l.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
  l = l.replace(/\[\^?\w{1,6}\]/g, ' ');                                 // marcas de nota [1], [^a]
  l = l.replace(/`([^`]*)`/g, '$1').replace(/\*+|~~|_+/g, ' ');
  l = l.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ');
  return l;
}

function flLimpar(t) {
  t = t.replace(/\s+([.,;:!?])/g, '$1').replace(/([.!?…])\s*[,;]\s*/g, '$1 ').replace(/,\s*,+/g, ',').replace(/([,;:])\s*\./g, '.');
  t = t.replace(/\(\s*\)/g, ' ').replace(/\.{4,}/g, '...').replace(/([.!?])\1+/g, '$1');
  return t.replace(/\s+/g, ' ').replace(/^[\s.,;:]+/, '').trim();
}

export function falaTexto(bruto) {
  let t = String(bruto == null ? '' : bruto).replace(/\r/g, '').slice(0, 12000);
  t = t.replace(/```[\s\S]*?(?:```|$)/g, '\n').replace(/~~~[\s\S]*?(?:~~~|$)/g, '\n');
  t = t.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<\/?[a-zA-Z][^>\n]{0,200}>/g, ' ');
  const unidades = [];   // { texto, solta } — "solta" = linha de lista, título ou tabela (sempre fecha com ponto)
  let emFontes = false;
  t.split('\n').forEach(function (linha) {
    let l = linha.trim();
    if (!l) { emFontes = false; if (unidades.length) unidades[unidades.length - 1].fim = true; return; }
    if (/^(?:[-*_]\s*){3,}$/.test(l) || /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?$/.test(l)) return;   // régua e separador de tabela
    if (/^(fontes?|refer[êe]ncias?)\s*:?\s*$/i.test(l)) { emFontes = true; return; }
    if (emFontes || flLinhaDeFonte(l) || flLinhaDeAviso(l)) return;
    let solta = false;
    if (/^#{1,6}\s/.test(l)) { l = l.replace(/^#{1,6}\s+/, ''); solta = true; }
    if (/^>+\s?/.test(l)) { l = l.replace(/^(?:>\s?)+/, ''); }
    if (/^(?:[-*+•]|\d{1,3}[.)])\s+/.test(l)) { l = l.replace(/^(?:[-*+•]|\d{1,3}[.)])\s+/, '').replace(/^\[[ xX]\]\s*/, ''); solta = true; }
    if (/^\|.*\|/.test(l) || (l.match(/\|/g) || []).length >= 2) { l = l.split('|').map(function (c) { return c.trim(); }).filter(Boolean).join(', '); solta = true; }
    l = flInline(l).replace(/\s+/g, ' ').trim();
    if (!l) return;
    unidades.push({ texto: l, solta: solta, fim: false });
  });
  let saida = '';
  unidades.forEach(function (u, i) {
    const prox = unidades[i + 1];
    const fecha = u.solta || u.fim || !prox || prox.solta;   // linha comum seguida de outra linha comum continua a mesma frase
    let x = u.texto;
    if (fecha && !/[.!?…:;]$/.test(x)) x += '.';
    saida += (saida ? ' ' : '') + x;
  });
  return flLimpar(flSimbolos(saida));
}

// ---------------------------------------------------------------- trechos
function flFrases(t) {
  return String(t || '').replace(/([.!?…]+)\s+/g, '$1\n').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

// Quebra uma frase longa em vírgulas, ponto e vírgula e dois-pontos; se ainda passar do limite, nas palavras.
function flQuebrar(frase, max) {
  const partes = [];
  let atual = '';
  const empurrar = function (p) {
    if (atual && (atual + ' ' + p).length > max) { partes.push(atual); atual = p; } else atual = atual ? atual + ' ' + p : p;
  };
  (frase.match(/[^,;:]+[,;:]?\s*/g) || [frase]).forEach(function (pedaco) {
    pedaco = pedaco.trim();
    if (!pedaco) return;
    if (pedaco.length <= max) { empurrar(pedaco); return; }
    pedaco.split(' ').forEach(empurrar);
  });
  if (atual) partes.push(atual);
  return partes;
}

export function falaDividir(texto, opc) {
  const o = opc || {}, max = o.max || 240, primeiro = o.primeiro || 130;
  const frases = flFrases(texto);
  const trechos = [];
  let atual = '';
  frases.forEach(function (frase) {
    (frase.length > max ? flQuebrar(frase, max) : [frase]).forEach(function (p) {
      const limite = trechos.length === 0 ? primeiro : max;
      if (atual && (atual + ' ' + p).length > limite) { trechos.push(atual); atual = p; } else atual = atual ? atual + ' ' + p : p;
    });
  });
  if (atual) trechos.push(atual);
  return trechos;
}

// Leitura automática: respostas longas viram as primeiras frases + aviso de que o resto está na tela (o botão Ouvir lê tudo).
export function falaResumir(bruto, opc) {
  const o = opc || {}, nFrases = o.frases || 4, maxChars = o.chars || 500;
  const t = falaTexto(bruto);
  const frases = flFrases(t);
  if (frases.length <= nFrases + 1 && t.length <= maxChars * 1.25) return t;
  const ficam = [];
  let n = 0;
  for (let i = 0; i < frases.length; i++) {
    if (ficam.length >= nFrases || (ficam.length && n + frases[i].length > maxChars)) break;
    ficam.push(frases[i]);
    n += frases[i].length + 1;
  }
  return ficam.join(' ') + ' O restante está na tela.';
}
