// Inglês no Paulus (v0.19.0): reconhece o idioma da mensagem, responde no mesmo idioma, traduz a pergunta para a BUSCA
// (a base de normas está em português) e responde NO APARELHO, sem IA e sem rede, a pedidos de vocabulário e frases.
// Roda no navegador e no Worker. Nada aqui lê dado de pessoa.

import { ING_GLOSSARIO, ING_PALAVRAS_BUSCA, ING_FALSOS_AMIGOS, ING_FRASES, ING_GUIANA } from './ingles-dados.mjs';

export const AVISO_PESSOAL_EN = 'To protect families, I cannot analyze messages with a name, document, phone number or home address. Please rewrite the question without identifying anyone.';

function ingSa(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function ingPalavras(texto) { return ingSa(texto).replace(/['’‘`]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); }

// Palavras que existem em inglês e NÃO existem (com esse sentido) em português nem em espanhol.
const EN_EXCL = new Set(('the and is are was were am be been being i im ive id he she his her him himself herself myself yourself you your yours my mine we our ours they them their theirs it its ' +
  'this that these those with from at by on in of to into about after before when where what which who whom whose why how can could will would should shall may might must ' +
  'have has had having not dont doesnt didnt cant cannot wont isnt arent wasnt need needs want wants wanted help helps please thanks thank hello hi hey good morning afternoon evening ' +
  'there here very much many some any more most than then also just only if but or because too yes ' +
  'apply register benefit benefits child children daughter mother father wife husband family school documents document passport birth certificate pregnant ' +
  'live lives living work works working get gets getting go goes going know knows tell tells say says make makes take takes give gives find ' +
  'does did doing done anyone someone everyone nothing anything something nearest open closed office phone number address money free cost').split(' '));
// Marcas de português/espanhol (sem acento). "do", "no", "me", "a", "as" ficam de fora de propósito: também existem em inglês ou são ambíguas.
const PTES_MARCAS = new Set(('nao voce voces sao tambem obrigado obrigada filho filha filhos filhas preciso precisamos quero queremos onde quando quanto qual quais ajuda escola ele ela eles elas meu minha meus minhas seu sua seus suas ' +
  'os um uma em na nas pelo pela dos das de que como com para por mais mas se ola oi bom boa dia hola necesito necesitamos quiero tengo tenemos hijo hija hijos hijas gracias ayuda el los las del una al donde mi mis sus esta estoy ' +
  'muito tem tenho vou vamos pode posso preciso aqui isso esse essa quem porque').split(' '));

// 'en' | 'nao' | 'indef'
export function ingDetectarIdioma(texto) {
  // o que está entre aspas é o termo em discussão ("como se diz 'help' em inglês?"), não o idioma de quem escreve
  const t = String(texto == null ? '' : texto).replace(/["“«][^"”»]{1,80}["”»]/g, ' ');
  const ws = ingPalavras(t);
  let en = 0, ptes = 0;
  if (/[ãõçñ¿¡]/i.test(t)) ptes += 2;
  for (const w of ws) {
    if (EN_EXCL.has(w)) en++;
    if (PTES_MARCAS.has(w)) ptes++;
  }
  if (en >= 1 && ptes === 0) return 'en';
  if (en >= 2 && en > ptes) return 'en';
  // mensagem de até duas palavras e sem marca de português/espanhol ("ok", "👍") é neutra e herda o idioma da conversa
  return (ws.length <= 2 && ptes === 0) ? 'indef' : 'nao';
}

// Pedido de TEXTO em inglês (escrito em português): "escreva um e-mail em inglês", "como se diz ... em inglês"
const RE_TEXTO_EN = /\b(?:em|para o|pro|no) ingles\b|\bpara (?:uma?|o|a) (?:familia|mae|pai|pessoa|migrante|guianens\w+|guiane\w+) (?:em )?ingles\b|\bversao em ingles\b|\btraduz\w* (?:para|pro|ao) (?:o )?ingles\b|\bin english\b/;
export function ingTextoEmIngles(texto) {
  const n = ingSa(texto);
  return ingDetectarIdioma(texto) !== 'en' && RE_TEXTO_EN.test(n);
}

// ------------------------------------------------------------------ busca: inglês -> termos em português

function ingNorm(s) { return ingSa(s).replace(/\(.*?\)/g, ' ').replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

function ingLinhasDoGlossario() {
  const out = [];
  for (const grupo of Object.keys(ING_GLOSSARIO)) for (const e of ING_GLOSSARIO[grupo]) out.push({ grupo: grupo, pt: e[0], en: e[1], nota: e[2] || '' });
  return out;
}
const ING_LINHAS = ingLinhasDoGlossario();
const ING_FRASES_BUSCA = [];
for (const l of ING_LINHAS) {
  const ptn = ingNorm(l.pt);
  if (!ptn) continue;
  for (const v of l.en.replace(/\(.*?\)/g, ' ').split(' / ')) {
    const enn = ingNorm(v);
    if (enn.length >= 6 && enn.split(' ').length <= 5) ING_FRASES_BUSCA.push([enn, ptn]);
  }
}
ING_FRASES_BUSCA.sort(function (a, b) { return b[0].length - a[0].length; });

// Texto em português para ANEXAR à busca de normas. Vazio se a pergunta não está em inglês.
export function ingParaBusca(texto) {
  if (ingDetectarIdioma(texto) !== 'en') return '';
  let n = ' ' + ingPalavras(texto).join(' ') + ' ';
  const out = [];
  for (const par of ING_FRASES_BUSCA) {
    if (n.indexOf(' ' + par[0] + ' ') >= 0) { out.push(par[1]); n = n.replace(' ' + par[0] + ' ', ' '); }
  }
  for (const w of n.trim().split(' ')) if (Object.prototype.hasOwnProperty.call(ING_PALAVRAS_BUSCA, w)) out.push(ING_PALAVRAS_BUSCA[w]);
  return Array.from(new Set(out.join(' ').split(' ').filter(Boolean))).join(' ');
}

// Termos do glossário que aparecem no pedido (em PT ou EN), para o prompt: ajuda a IA a usar o nome certo.
export function ingTermosDoGlossario(textos, max) {
  const n = ' ' + ingPalavras((textos || []).join(' ')).join(' ') + ' ';
  const ach = [];
  for (const l of ING_LINHAS) {
    const p = ingNorm(l.pt);
    const achouPt = p.length >= 3 && n.indexOf(' ' + p + ' ') >= 0;
    const achouEn = l.en.replace(/\(.*?\)/g, ' ').split(' / ').some(function (v) { const e = ingNorm(v); return e.length >= 6 && n.indexOf(' ' + e + ' ') >= 0; });
    if (achouPt || achouEn) ach.push({ pt: [l.pt], en: l.en, nota: l.nota });
  }
  return ach.slice(0, max || 8);
}

// Bloco curto que o Worker acrescenta ao prompt quando o pedido é em inglês ou pede texto em inglês.
export function ingInstrucaoParaIA(info, pergunta, historico) {
  if (!info || (info.resposta !== 'en' && !info.textoEn)) return '';
  const termos = ingTermosDoGlossario([pergunta].concat((historico || []).slice(-2).map(function (h) { return h && h.texto; })), 8);
  const gl = termos.length ? '\nTermos do glossário (use estes nomes): ' + termos.map(function (t) { return t.pt[0] + ' = ' + t.en.replace(/\s*\(.*?\)\s*/g, ' ').trim(); }).join('; ') + '.' : '';
  const base = '\nIDIOMA: ' + (info.resposta === 'en'
    ? 'o(a) profissional escreveu em INGLÊS. Responda em inglês claro e simples (frases curtas, sem gíria), mantendo em português os NOMES OFICIAIS de serviços, siglas e normas (CRAS, CREAS, Bolsa Família, CadÚnico, BPC, Conselho Tutelar) e, na primeira vez, explique cada um em inglês em poucas palavras. Os números de emergência do Brasil continuam 192, 190, 188, 180 e 100.'
    : 'a pergunta está em português, mas o texto pedido deve estar em INGLÊS para a família. Escreva em inglês simples e acolhedor; ponha antes um aviso curto em português de que a revisão por quem fala inglês é recomendada; mantenha nomes oficiais de serviços em português.')
    + ' Atenção: quem vem da Guiana pode falar crioulo guianense e quem vem do Haiti costuma falar crioulo haitiano ou francês, então inglês simples nem sempre basta. Falsos amigos: "attend" não é "atender"; "parents" são pai e mãe; "actually" é "na verdade". Na dúvida sobre o sentido de uma palavra, peça para confirmar com a pessoa. Não invente telefone, endereço nem prazo.';
  return base + gl;
}

// ------------------------------------------------------------------ respostas locais (sem IA, sem rede)

function ingFmtGlossario(l) { return '- ' + l.pt + ' → ' + l.en + (l.nota ? '\n  Nota: ' + l.nota : ''); }
const ING_AVISO_NOME = '\n\nO nome oficial do serviço fica em português; o inglês serve para explicar. Revise antes de usar em texto para a família.';

function ingAcharNoGlossario(termo) {
  const t = ingNorm(termo);
  if (!t || t.length < 2) return [];
  const exato = [], parcial = [];
  for (const l of ING_LINHAS) {
    const p = ingNorm(l.pt);
    const ps = ingSa(l.pt).replace(/[^a-z0-9\s,]/g, ' ').split(/[,\s]+/).filter(Boolean);
    const en = l.en.replace(/\(.*?\)/g, ' ').split(' / ').map(ingNorm);
    if (p === t || en.indexOf(t) >= 0 || (ps.indexOf(t) >= 0 && t.length >= 3 && ps.length <= 2)) exato.push(l);
    else if (t.length >= 4 && (p.indexOf(t) >= 0 || en.some(function (v) { return v.indexOf(t) >= 0; }))) parcial.push(l);
  }
  return exato.length ? exato : parcial.slice(0, 4);
}

function ingLimparTermo(x) { return String(x).replace(/^[\s"'“”«»]+|[\s"'“”«»?.!¿¡]+$/g, '').trim(); }

export function ingFalsosAmigosTexto() {
  return 'Falsos amigos entre português e inglês que mais atrapalham no atendimento e na leitura de textos (confira sempre com a pessoa):\n' +
    ING_FALSOS_AMIGOS.map(function (f) { return '- ' + f[0] + ': em inglês é ' + f[1] + (f[2] ? '. ' + f[2] : ''); }).join('\n');
}
export function ingGuianaTexto() {
  return 'Expressões do inglês e do crioulo da Guiana que aparecem no atendimento de quem vem da fronteira (uso informal; confirme o sentido com a pessoa):\n' +
    ING_GUIANA.map(function (v) { return '- ' + v[0] + ': ' + v[1] + (v[2] ? '. ' + v[2] : ''); }).join('\n');
}

function ingQualFrases(n) {
  const mapa = { acolhida: /acolh|recep|boas.?vindas|inicio|primeir|greet|welcome/, documentos: /document|cadastro|cadunico|identific/, saude: /saude|encaminh|medic|caps|ubs|gravid/, violencia: /violenc|prote|agress|abuso|denunc/, beneficios: /benefic|bolsa|bpc|renda/, telefone: /telefone|ligac|agend|marcar|alo/, despedida: /despedid|fecham|encerr|final/ };
  for (const k of Object.keys(mapa)) if (mapa[k].test(n)) return k;
  return '';
}
function ingFmtFrases(chave) {
  const g = ING_FRASES[chave];
  return 'Frases em inglês: ' + g[0] + '\n' + g[1].map(function (f) { return '- ' + f[0] + '\n  ' + f[1]; }).join('\n') + '\n\nUse como modelo e revise: o tom muda conforme a pessoa. Se a conversa for complexa, peça intérprete.';
}

// Devolve { tipoLocal, texto } ou null. Só responde o que dá para afirmar com os dados do arquivo.
export function ingRespostaLocal(pergunta) {
  const orig = String(pergunta == null ? '' : pergunta).trim();
  const n = ingSa(orig).replace(/[¿¡]/g, '').replace(/[?!.\s]+$/, '');
  if (!n || n.length > 200) return null;

  if (/\bfalsos? (?:amigos?|cognatos?)\b/.test(n) && /\bingles\b|\benglish\b/.test(n)) return { tipoLocal: 'falsos_amigos', texto: ingFalsosAmigosTexto() };
  if (/\b(?:vocabulario|palavras|girias?|expressoes|jeito de falar|ingles|crioulo)\b[^.?]{0,40}\b(?:guiana|guianens\w+|guyan\w+)\b|\b(?:guiana|guianens\w+|guyan\w+)\b[^.?]{0,20}\b(?:vocabulario|palavras|girias?|expressoes|crioulo)\b/.test(n)) return { tipoLocal: 'guiana', texto: ingGuianaTexto() };

  // frases por situação
  if (/\bfrases?\b|\bcomo (?:eu )?(?:falo|digo|dizer|falar)\b[^.?]*(?:acolh|atend)/.test(n) && /\bingles\b/.test(n)) {
    const k = ingQualFrases(n);
    if (k) return { tipoLocal: 'frases', texto: ingFmtFrases(k) };
    return { tipoLocal: 'frases', texto: 'Tenho frases em inglês prontas para: acolhida, documentos e cadastro, saúde e encaminhamento, violência e proteção, benefícios, telefone e agendamento, e fechamento. Peça, por exemplo, "frases em inglês para acolhida".' };
  }

  // PT -> EN: "como se diz X em inglês", "X em inglês"
  let m = /^(?:como (?:se )?(?:diz|fala|escreve|traduz)|qual (?:e )?(?:a )?(?:traducao|palavra)(?: de| para)?|traduza|traducao de|traduzir)\s+(.+?)\s+(?:em|para o|para|pro|no) ingles$/.exec(n)
    || /^(.+?)\s+(?:em|no) ingles$/.exec(n);
  if (m) {
    const termo = ingLimparTermo(orig.replace(/^(?:como (?:se )?(?:diz|fala|escreve|traduz)|qual (?:é )?(?:a )?(?:tradução|palavra)(?: de| para)?|traduza|tradução de|traduzir)\s+/i, '').replace(/\s+(?:em|para o|para|pro|no) ingl[eê]s\??$/i, ''));
    const ach = ingAcharNoGlossario(termo);
    if (ach.length) return { tipoLocal: 'glossario', texto: ach.map(ingFmtGlossario).join('\n') + ING_AVISO_NOME };
    return null;
  }
  // EN -> PT: "how do you say X in Portuguese?", "what does X mean in Portuguese"
  m = /^(?:how (?:do you|do i|can i|to) (?:say|write|translate)|what (?:is|s) the (?:word|translation) for|translate|what does)\s+(.+?)\s+(?:mean )?(?:in|into|to) portuguese$/.exec(n.replace(/['’]/g, ''));
  if (m) {
    const termo = ingLimparTermo(orig.replace(/^(?:how (?:do you|do i|can i|to) (?:say|write|translate)|what(?:'s| is) the (?:word|translation) for|translate|what does)\s+/i, '').replace(/\s+(?:mean )?(?:in|into|to) portuguese\??$/i, ''));
    const ach = ingAcharNoGlossario(termo);
    if (ach.length) return { tipoLocal: 'glossario', texto: ach.map(function (l) { return '- In Brazilian Portuguese: ' + l.pt + ' (in English: ' + l.en.split(' / ')[0].replace(/\s*\(.*?\)\s*/g, '') + ')'; }).join('\n') };
    return null;
  }
  return null;
}
