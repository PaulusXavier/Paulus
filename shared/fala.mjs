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


// Números que a voz lê como quantia ou como "menos": documento, telefone, CEP, fração, unidade, temperatura, e-mail.
function flDigitos(s) {
  const d = String(s).replace(/\D/g, '');
  return (d.match(/\d{1,3}/g) || []).map(function (g) { return g.split('').join(' '); }).join(', ');
}
const FL_FRACOES = { '1/2': 'meio', '1/3': 'um terço', '2/3': 'dois terços', '1/4': 'um quarto', '3/4': 'três quartos', '1/5': 'um quinto', '2/5': 'dois quintos', '1/10': 'um décimo' };
const FL_UNIDADES = { km: ['quilômetro', 'quilômetros'], kg: ['quilo', 'quilos'], cm: ['centímetro', 'centímetros'], mm: ['milímetro', 'milímetros'], ml: ['mililitro', 'mililitros'], 'm²': ['metro quadrado', 'metros quadrados'], m: ['metro', 'metros'] };
function flNumerosEspeciais(t) {
  t = t.replace(/([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)/g, function (m, a, b) { return a.replace(/\./g, ' ponto ') + ' arroba ' + b.replace(/\./g, ' ponto '); });
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, flDigitos);                                   // CPF
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, flDigitos);                           // CNPJ
  t = t.replace(/\b(\d{5})-(\d{3})\b/g, function (m, a, b) { return a.split('').join(' ') + ', ' + b.split('').join(' '); });   // CEP
  t = t.replace(/\b(\d{4,5})-(\d{4})\b/g, '$1, $2');                                           // telefone: o hífen não vira "menos"
  t = t.replace(/\b\d{9,14}\b/g, flDigitos);                                                   // NIS, cartão, protocolo
  t = t.replace(/(\d+(?:,\d+)?)\s*°\s*([CF])\b/g, function (m, n, e) { return n + ' graus ' + (e === 'C' ? 'Celsius' : 'Fahrenheit'); });
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b(?![\/\d])/g, function (m, a, b) { return FL_FRACOES[a + '/' + b] || m; });
  t = t.replace(/(\d+(?:,\d+)?)\s?(km|kg|cm|mm|ml|m²|m)(?![\wà-úÀ-Ú²])/g, function (m, n, u) { return n + ' ' + FL_UNIDADES[u][n === '1' ? 0 : 1]; });
  t = t.replace(/\bseg\.\s+a\s+sex(\.?)/gi, 'segunda a sexta$1').replace(/\bseg\.\s+a\s+s[áa]b(\.?)/gi, 'segunda a sábado$1');
  return t;
}

// Abreviações, símbolos e números que a voz lê errado ou não lê.
function flSimbolos(t) {
  t = flDinheiro(t);
  t = flNumerosEspeciais(t);
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
  t = t.replace(/\s+(?:[—–-]|-{2,})\s+/g, ', ').replace(/[—–]/g, ', ').replace(/\s*[→➜➔]\s*/g, ', ').replace(/\s*-+>\s*/g, ', ');
  t = t.replace(/\s*[·•]\s*/g, ', ').replace(/&/g, ' e ').replace(/\s\+\s/g, ' mais ').replace(/\s=\s/g, ' igual a ');
  // siglas letra por letra: as da lista e qualquer sigla curta sem vogal (BV, RR, SCFV)
  t = t.replace(/\b[A-Z]{2,5}\b/g, function (s) { return FL_SOLETRA[s] || !/[AEIOU]/.test(s) ? flSoletrar(s) : s; });
  return t;
}


// ---------------------------------------------------------------- pronúncia (o que o leitor erra, e o que o Paulus aprende)
// Palavras que o leitor de voz costuma errar, escritas como se fala. Só trocam a palavra inteira (sem acento nem caixa).
const FL_PRONUNCIA = {
  pix: 'píks', whatsapp: 'uótsapi', 'wi-fi': 'uai fai', wifi: 'uai fai', email: 'imeil', 'e-mail': 'imeil', online: 'ônlaine', site: 'sáite',
  app: 'épi', apps: 'épis', pdf: 'pê dê éfe', gov: 'gôv', br: 'bê érre', cnpj: 'cê ene pê jota'
};
// Siglas que se leem como palavra: só valem escritas em MAIÚSCULAS ("suas" minúsculo é o pronome, não o SUAS).
const FL_PRON_SIGLA = { SUAS: 'súas', PAIF: 'páif', PAEFI: 'paéfi', LOAS: 'lôas', CAPS: 'cáps', SINE: 'síni', PETI: 'péti' };
function flSemAcento(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Normaliza um dicionário aprendido ({ palavra: comoFala }); descarta o que for vazio, enorme ou com símbolo estranho.
export function falaDicionario(dic) {
  const saida = {};
  if (dic && typeof dic === 'object') {
    Object.keys(dic).slice(0, 200).forEach(function (k) {
      const chave = flSemAcento(k).trim(), valor = String(dic[k] == null ? '' : dic[k]).replace(/\s+/g, ' ').trim();
      if (chave && chave.length <= 40 && valor && valor.length <= 60 && !/[<>{}\\]/.test(valor)) saida[chave] = valor;
    });
  }
  return saida;
}

// Ensina uma palavra: devolve o dicionário novo (o original não muda). comoFala vazio apaga a palavra.
export function falaAprender(dic, palavra, comoFala) {
  const novo = falaDicionario(dic), chave = flSemAcento(palavra).trim();
  if (!chave || chave.length > 40) return novo;
  const v = String(comoFala == null ? '' : comoFala).replace(/\s+/g, ' ').trim();
  if (!v) delete novo[chave]; else if (v.length <= 60 && !/[<>{}\\]/.test(v)) novo[chave] = v;
  return falaDicionario(novo);
}

function flAplicarPronuncia(t, dic) {
  const aprendido = falaDicionario(dic);
  return t.replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]*/g, function (w) {
    const k = flSemAcento(w);
    if (Object.prototype.hasOwnProperty.call(aprendido, k)) return aprendido[k];
    if (Object.prototype.hasOwnProperty.call(FL_PRON_SIGLA, w)) return FL_PRON_SIGLA[w];
    if (Object.prototype.hasOwnProperty.call(FL_PRONUNCIA, k)) return FL_PRONUNCIA[k];
    return w;
  });
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

export function falaTexto(bruto, opc) {
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
  const pronto = flLimpar(flSimbolos(saida));
  return (opc && opc.pronuncia === false) ? pronto : flAplicarPronuncia(pronto, opc && opc.dicionario);
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
  const t = falaTexto(bruto, o);
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

// ---------------------------------------------------------------- prosódia: tom, ritmo e pausa de cada trecho
// Devolve [{ t, tom, taxa, pausa }]: tom e taxa são multiplicadores (1 = como o usuário configurou); pausa é em milissegundos
// e vale DEPOIS do trecho. Pergunta sobe um pouco o tom; aviso (atenção, cuidado) vai mais devagar; fim de parágrafo respira mais;
// o último trecho desacelera, como quem conclui.
export function falaTrechos(texto, opc) {
  const o = opc || {};
  const max = o.max || 240, minimo = o.minimo || 16;
  const partes = [];
  let seguro = '';
  flFrases(texto).forEach(function (frase) {
    (frase.length > max ? flQuebrar(frase, max) : [frase]).forEach(function (p) {
      if (seguro) { p = seguro + ' ' + p; seguro = ''; }
      if (p.length < minimo && !/[?!]$/.test(p)) seguro = p; else partes.push(p);   // frase curtíssima gruda na seguinte
    });
  });
  if (seguro) { if (partes.length) partes[partes.length - 1] += ' ' + seguro; else partes.push(seguro); }
  return partes.map(function (t, i) {
    const fim = (t.match(/[.!?…:;,]+$/) || [''])[0].slice(-1);
    let tom = 1, taxa = 1, pausa = 120;
    if (fim === '?') { tom = 1.07; pausa = 260; }
    else if (fim === '!') { tom = 1.04; taxa = 1.03; pausa = 220; }
    else if (fim === ':') { pausa = 320; taxa = 0.97; }
    else if (fim === ';') { pausa = 200; }
    else if (fim === ',') { pausa = 70; }
    else if (fim === '.' || fim === '…') { pausa = 180; }
    if (/^(aten[cç][ãa]o|cuidado|importante|urgente|alerta)\b/i.test(t)) { taxa *= 0.94; tom *= 0.97; pausa = Math.max(pausa, 300); }
    if (/\b\d[\d., ]{6,}\b/.test(t)) taxa *= 0.93;   // número longo (telefone, protocolo): mais devagar para dar para anotar
    if (i === partes.length - 1) { taxa *= 0.97; pausa = 0; }
    return { t: t, tom: Math.round(tom * 100) / 100, taxa: Math.round(taxa * 100) / 100, pausa: pausa };
  });
}
