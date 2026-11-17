// Espanhol no Paulus (v0.18.0): reconhece o idioma da mensagem, responde no mesmo idioma, traduz a pergunta para a BUSCA
// (a base de normas está em português) e responde NO APARELHO, sem IA e sem rede, a pedidos de vocabulário e frases.
// Roda no navegador e no Worker. Nada aqui lê dado de pessoa.

import { ESP_GLOSSARIO, ESP_PALAVRAS_BUSCA, ESP_FALSOS_AMIGOS, ESP_FRASES, ESP_VENEZUELA } from './espanhol-dados.mjs';

export const AVISO_PESSOAL_ES = 'Para proteger a las familias, no puedo analizar mensajes con nombre, documento, teléfono o dirección de residencia. Reescriba la pregunta sin identificar a nadie.';

function sa(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function palavras(texto) { return sa(texto).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean); }

// Palavras que só (ou quase só) existem no espanhol / só no português. Peso 2 = palavra forte.
const ES_FORTES = new Set('hola necesito necesitamos necesita quiero quisiera tengo tenemos tiene donde cuando cuanto cuantos cuantas gracias ayuda ayudar ayudarme hijo hija hijos hijas esposo esposa trabajo vivo vivimos puedo puede pueden hay estoy estamos muy tambien ninos ninas nino nina cual cuales porque ahorita pregunta preguntas duda dudas escuela mi mis su sus un una el los las del al con y que como esta pasa va vas van voy'.split(' ').filter(function (w) { return !['que', 'como', 'con', 'esta', 'va', 'mi', 'al', 'tambem', 'porque'].includes(w); }));
const ES_FRACAS = new Set('el los las del un una con y mi mis su sus al por para que'.split(' '));
const PT_FORTES = new Set('nao voce voces uma sao tambem obrigado obrigada filho filha filhos filhas preciso precisamos quero queremos onde quando quanto qual quais ajuda escola trabalho olha oi ola bom boa dia tarde ele ela eles elas meu minha meus minhas seu sua seus suas os as um uma em no na nos nas do da dos das pelo pela pelos pelas que como com'.split(' '));
// Palavras exclusivas do português (não existem em espanhol com esse sentido)
const PT_EXCL = new Set('nao voce voces uma sao tambem obrigado obrigada filho filha filhos filhas preciso precisamos quero queremos quanto quais ajuda escola olha ele eles elas meu minha meus minhas seu sua seus suas os as um em na nas do da dos das pelo pela pelos pelas'.split(' '));
const ES_EXCL = new Set('hola necesito necesitamos necesita quiero quisiera tengo tenemos tiene cuando cuanto cuantos cuantas gracias ayuda ayudar ayudarme hijo hija hijos hijas esposo esposa vivo vivimos puedo puede pueden hay estoy estamos muy ninos ninas nino nina cual cuales ahorita pregunta preguntas duda dudas escuela mis sus el los las del un una y al donde queda pasa vas van voy'.split(' '));

// 'es' | 'pt' | 'indef'
export function espDetectarIdioma(texto) {
  // o que está entre aspas é o termo em discussão ("como se diz 'necesito ayuda' em espanhol?"), não o idioma de quem escreve
  const t = String(texto == null ? '' : texto).replace(/["“«][^"”»]{1,80}["”»]/g, ' ');
  let es = 0, pt = 0;
  if (/[¿¡ñ]/i.test(t)) es += 2;
  if (/[ãõç]|\b\w+ão\b/i.test(t)) pt += 2;
  for (const w of palavras(t)) {
    if (ES_EXCL.has(w)) es += 1;
    if (PT_EXCL.has(w)) pt += 1;
  }
  // "gracias" e "hola" sozinhos bastam; "ok" não é nada
  // palavra exclusiva do espanhol ("quiero", "hola") sem nenhuma marca do português já basta
  if (es >= 1 && pt === 0) return 'es';
  if (es >= 2 && es > pt) return 'es';
  return pt > 0 ? 'pt' : 'indef';
}

// Pedido de TEXTO em espanhol (escrito em português): "escreva uma carta em espanhol", "como se diz ... em espanhol"
const RE_TEXTO_ES = /\b(?:em|para o|pro|no) (?:espanhol|castelhano|portunhol)\b|\bpara (?:uma?|o|a) (?:familia|mae|pai|pessoa|migrante|venezuelan\w+) (?:em )?espanhol\b|\bversao em espanhol\b|\btraduz\w* (?:para|pro|ao) (?:o )?espanhol\b|\ben espanol\b/;
export function espIdiomaDoPedido(texto, historico) {
  const id = espDetectarIdioma(texto);
  const n = sa(texto);
  const textoEs = id !== 'es' && RE_TEXTO_ES.test(n);
  let resposta = id === 'es' ? 'es' : 'pt';
  // Mensagem curta e neutra ("ok", "gracias") herda o idioma da conversa
  if (id === 'indef' && Array.isArray(historico)) {
    for (let i = historico.length - 1; i >= 0; i--) {
      const h = historico[i];
      if (h && h.papel === 'usuario' && h.texto) { resposta = espDetectarIdioma(h.texto) === 'es' ? 'es' : 'pt'; break; }
    }
  }
  return { resposta: resposta, textoEs: textoEs, pratica: false };
}

// ------------------------------------------------------------------ busca: espanhol -> termos em português

function linhasDoGlossario() {
  const out = [];
  for (const grupo of Object.keys(ESP_GLOSSARIO)) for (const e of ESP_GLOSSARIO[grupo]) out.push({ grupo: grupo, pt: e[0], es: e[1], nota: e[2] || '' });
  return out;
}
const LINHAS = linhasDoGlossario();
const FRASES_BUSCA = [];
for (const l of LINHAS) {
  const ptn = sa(l.pt).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!ptn) continue;
  for (const v of l.es.replace(/\(.*?\)/g, ' ').split(' / ')) {
    const esn = sa(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (esn.length >= 5 && esn.split(' ').length <= 5) FRASES_BUSCA.push([esn, ptn]);
  }
}
FRASES_BUSCA.sort(function (a, b) { return b[0].length - a[0].length; });

// Texto em português para ANEXAR à busca de normas. Vazio se a pergunta não está em espanhol.
export function espParaBusca(texto) {
  if (espDetectarIdioma(texto) !== 'es') return '';
  let n = ' ' + palavras(texto).join(' ') + ' ';
  const out = [];
  for (const par of FRASES_BUSCA) {
    if (n.indexOf(' ' + par[0] + ' ') >= 0) { out.push(par[1]); n = n.replace(' ' + par[0] + ' ', ' '); }
  }
  for (const w of n.trim().split(' ')) if (ESP_PALAVRAS_BUSCA[w]) out.push(ESP_PALAVRAS_BUSCA[w]);
  return Array.from(new Set(out.join(' ').split(' ').filter(Boolean))).join(' ');
}

// Termos do glossário que aparecem no pedido (em PT ou ES), para o prompt: ajuda a IA a usar o nome certo.
export function espTermosDoGlossario(textos, max) {
  const n = ' ' + palavras((textos || []).join(' ')).join(' ') + ' ';
  const ach = [];
  for (const l of LINHAS) {
    const p = sa(l.pt).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const achouPt = p.length >= 3 && n.indexOf(' ' + p + ' ') >= 0;
    const achouEs = l.es.replace(/\(.*?\)/g, ' ').split(' / ').some(function (v) { const e = sa(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); return e.length >= 5 && n.indexOf(' ' + e + ' ') >= 0; });
    if (achouPt || achouEs) ach.push({ pt: [l.pt], es: l.es, nota: l.nota });
  }
  return ach.slice(0, max || 8);
}

// Bloco curto que o Worker acrescenta ao prompt quando o pedido é em espanhol ou pede texto em espanhol.
export function espInstrucaoParaIA(info, pergunta, historico) {
  if (!info || (info.resposta !== 'es' && !info.textoEs)) return '';
  const termos = espTermosDoGlossario([pergunta].concat((historico || []).slice(-2).map(function (h) { return h && h.texto; })), 8);
  const gl = termos.length ? '\nTermos do glossário (use estes nomes): ' + termos.map(function (t) { return t.pt[0] + ' = ' + t.es.replace(/\s*\(.*?\)\s*/g, ' ').trim(); }).join('; ') + '.' : '';
  const base = '\nIDIOMA: ' + (info.resposta === 'es'
    ? 'o(a) profissional escreveu em ESPAÑOL. Responda em espanhol claro e simples (registro neutro, sem regionalismo), mantendo em português os NOMES OFICIAIS de serviços, siglas e normas (CRAS, CREAS, Bolsa Família, CadÚnico, BPC, Conselho Tutelar) e, na primeira vez, explique cada um em espanhol em poucas palavras. Os números de emergência do Brasil continuam 192, 190, 188, 180 e 100.'
    : 'a pergunta está em português, mas o texto pedido deve estar em ESPANHOL para a família. Escreva em espanhol simples e acolhedor; ponha antes um aviso curto em português de que a revisão por quem fala espanhol é recomendada; mantenha nomes oficiais de serviços em português.')
    + ' Falsos amigos: "embarazada" é grávida; "apellido" é sobrenome; em relato de violência, "me pega" quer dizer "me bate". Na dúvida sobre o sentido de uma palavra, peça para confirmar com a pessoa. Não invente telefone, endereço nem prazo.';
  return base + gl;
}

// ------------------------------------------------------------------ respostas locais (sem IA, sem rede)

function fmtGlossario(l) {
  return '- ' + l.pt + ' → ' + l.es + (l.nota ? '\n  Nota: ' + l.nota : '');
}
const AVISO_NOME = '\n\nO nome oficial do serviço fica em português; o espanhol serve para explicar. Revise antes de usar em texto para a família.';

function acharNoGlossario(termo) {
  const t = sa(termo).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 2) return [];
  const exato = [], parcial = [];
  for (const l of LINHAS) {
    const p = sa(l.pt).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const ps = sa(l.pt).replace(/[^a-z0-9\s,]/g, ' ').split(/[,\s]{1,}/).filter(Boolean);
    const es = l.es.replace(/\(.*?\)/g, ' ').split(' / ').map(function (v) { return sa(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); });
    if (p === t || es.indexOf(t) >= 0 || ps.indexOf(t) >= 0 && t.length >= 3 && ps.length <= 2) exato.push(l);
    else if (t.length >= 4 && (p.indexOf(t) >= 0 || es.some(function (v) { return v.indexOf(t) >= 0; }))) parcial.push(l);
  }
  return exato.length ? exato : parcial.slice(0, 4);
}

function limparTermo(x) { return String(x).replace(/^[\s"'“”«»]+|[\s"'“”«»?.!¿¡]+$/g, '').trim(); }

export function espFalsosAmigosTexto() {
  return 'Falsos amigos entre português e espanhol que mais atrapalham no atendimento (confira sempre com a pessoa):\n' +
    ESP_FALSOS_AMIGOS.map(function (f) { return '- ' + f[0] + ': em espanhol é ' + f[1] + (f[2] ? '. ' + f[2] : ''); }).join('\n');
}
export function espVenezuelaTexto() {
  return 'Palavras do espanhol da Venezuela que aparecem no atendimento (uso informal; confirme o sentido com a pessoa):\n' +
    ESP_VENEZUELA.map(function (v) { return '- ' + v[0] + ': ' + v[1] + (v[2] ? '. ' + v[2] : ''); }).join('\n');
}

function qualFrases(n) {
  const mapa = { acolhida: /acolh|recep|boas.?vindas|inicio|primeir/, documentos: /document|cadastro|cadunico|identific/, saude: /saude|encaminh|medic|caps|ubs|gravid/, violencia: /violenc|prote|agress|abuso|denunc/, beneficios: /benefic|bolsa|bpc|renda/, telefone: /telefone|ligac|agend|marcar|alo/, despedida: /despedid|fecham|encerr|final/ };
  for (const k of Object.keys(mapa)) if (mapa[k].test(n)) return k;
  return '';
}
function fmtFrases(chave) {
  const g = ESP_FRASES[chave];
  return 'Frases em espanhol: ' + g[0] + '\n' + g[1].map(function (f) { return '- ' + f[0] + '\n  ' + f[1]; }).join('\n') + '\n\nUse como modelo e revise: o tom muda conforme a pessoa. Se a conversa for complexa, peça intérprete.';
}

// Devolve { tipoLocal, texto } ou null. Só responde o que dá para afirmar com os dados do arquivo.
export function espRespostaLocal(pergunta) {
  const orig = String(pergunta == null ? '' : pergunta).trim();
  const n = sa(orig).replace(/[¿¡]/g, '').replace(/[?!.\s]+$/, '');
  if (!n || n.length > 200) return null;

  if (/\bfalsos? amigos?\b|\bfalsos? cognatos?\b|falsos amigos/.test(n) && /(portugu|espanhol|espanol|castelhano|portunhol)/.test(n)) return { tipoLocal: 'falsos_amigos', texto: espFalsosAmigosTexto() };
  if (/\b(?:vocabulario|palavras|girias?|expressoes|regionalismos?|jeito de falar|gíria)\b[^.?]{0,40}\b(?:venezuel\w+|da venezuela)\b|\b(?:venezuel\w+)\b[^.?]{0,20}\b(?:vocabulario|palavras|girias?|expressoes|regionalismos?)\b/.test(n)) return { tipoLocal: 'venezuela', texto: espVenezuelaTexto() };
  const mAhorita = /^(?:o que (?:significa|quer dizer)|que significa|qué significa|que quer dizer)\s+["“']?(ahorita|chamo|chama|carajit[oa]|pana|chevere|coroto)\b/.exec(n);
  if (mAhorita) {
    const v = ESP_VENEZUELA.filter(function (x) { return sa(x[0]).split(/[\s/]+/).filter(Boolean).indexOf(mAhorita[1]) >= 0; })[0];
    if (v) return { tipoLocal: 'venezuela', texto: '"' + v[0] + '" (espanhol da Venezuela): ' + v[1] + '.' + (v[2] ? ' ' + v[2] : '') };
  }

  // frases por situação
  if (/\bfrases?\b|\bcomo (?:eu )?(?:falo|digo|dizer|falar)\b[^.?]*(?:acolh|atend)/.test(n) && /(espanhol|espanol|castelhano|em es\b)/.test(n)) {
    const k = qualFrases(n);
    if (k) return { tipoLocal: 'frases', texto: fmtFrases(k) };
    return { tipoLocal: 'frases', texto: 'Tenho frases em espanhol prontas para: acolhida, documentos e cadastro, saúde e encaminhamento, violência e proteção, benefícios, telefone e agendamento, e fechamento. Peça, por exemplo, "frases em espanhol para acolhida".' };
  }

  // PT -> ES: "como se diz X em espanhol", "X em espanhol", "tradução de X para o espanhol"
  let m = /^(?:como (?:se )?(?:diz|fala|escreve|traduz)|qual (?:e )?(?:a )?(?:traducao|palavra)(?: de| para)?|traduza|traducao de|traduzir)\s+(.+?)\s+(?:em|para o|para|pro|no) (?:espanhol|castelhano)$/.exec(n)
    || /^(.+?)\s+(?:em|no) espanhol$/.exec(n);
  if (m) {
    const ach = acharNoGlossario(limparTermo(orig.replace(/^(?:como (?:se )?(?:diz|fala|escreve|traduz)|qual (?:é )?(?:a )?(?:tradução|palavra)(?: de| para)?|traduza|tradução de|traduzir)\s+/i, '').replace(/\s+(?:em|para o|para|pro|no) (?:espanhol|castelhano)\??$/i, '')));
    if (ach.length) return { tipoLocal: 'glossario', texto: ach.map(fmtGlossario).join('\n') + AVISO_NOME };
    return null;
  }
  // ES -> PT: "¿cómo se dice X en portugués?" / "que significa X em portugues"
  m = /^(?:como se dice|como se escribe|que significa|como traduzco)\s+(.+?)\s+(?:en|al) portugues$/.exec(n);
  if (m) {
    const ach = acharNoGlossario(limparTermo(orig.replace(/^[¿¡]?\s*(?:cómo|como|qué|que)\s+(?:se dice|se escribe|significa|traduzco)\s+/i, '').replace(/\s+(?:en|al) portugu[eé]s\??$/i, '')));
    if (ach.length) return { tipoLocal: 'glossario', texto: ach.map(function (l) { return '- En portugués de Brasil: ' + l.pt + ' (en español: ' + l.es.split(' / ')[0].replace(/\s*\(.*?\)\s*/g, '') + ')'; }).join('\n') };
    return null;
  }
  return null;
}
