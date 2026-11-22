// Busca por palavras (BM25) na base de conhecimento. Roda no navegador (offline) e no Worker.
// Sem dependências. Cada "trecho" da base tem: { id, doc, titulo, norma, ano, referencia, texto }.

const STOP = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre e ou que se ao aos ' +
  'qual quais como quem onde quando ser sao foi ha pelo pela pelos pelas seu sua seus suas ele ela eles elas isso essa esse este esta ' +
  'meu minha eu voce nos eh mais muito sao tem ter pode podem deve devem fazer faz quanto quanta quantos quantas fica ficam').split(' '));

// Siglas comuns viram também a forma por extenso (a base costuma escrever por extenso).
export const SIGLAS = {
  cadunico: ['cadastro', 'unico'],
  pbf: ['programa', 'bolsa', 'familia'],
  bpc: ['beneficio', 'prestacao', 'continuada'],
  loas: ['lei', 'organica', 'assistencia', 'social'],
  cnas: ['conselho', 'nacional', 'assistencia', 'social'],
  cmas: ['conselho', 'municipal', 'assistencia', 'social'],
  cit: ['comissao', 'intergestores', 'tripartite'],
  cib: ['comissao', 'intergestores', 'bipartite'],
  igd: ['indice', 'gestao', 'descentralizada'],
  brc: ['beneficio', 'renda', 'cidadania'],
  bpi: ['beneficio', 'primeira', 'infancia'],
  bvf: ['beneficio', 'variavel', 'familiar'],
  bco: ['beneficio', 'complementar'],
  sicon: ['sistema', 'condicionalidades'],
  eca: ['estatuto', 'crianca', 'adolescente'],
  paif: ['protecao', 'atendimento', 'integral', 'familia'],
  paefi: ['protecao', 'atendimento', 'especializado', 'familias', 'individuos'],
  scfv: ['servico', 'convivencia', 'fortalecimento', 'vinculos'],
  cfp: ['conselho', 'federal', 'psicologia'],
  crp: ['conselho', 'regional', 'psicologia'],
  cid: ['classificacao', 'internacional', 'doencas'],
  cif: ['classificacao', 'internacional', 'funcionalidade', 'incapacidade', 'saude'],
  oms: ['organizacao', 'mundial', 'saude'],
  cras: ['centro', 'referencia', 'assistencia', 'social'],
  creas: ['centro', 'referencia', 'especializado', 'assistencia', 'social'],
  suas: ['sistema', 'unico', 'assistencia', 'social'],
  pnas: ['politica', 'nacional', 'assistencia', 'social'],
  peti: ['programa', 'erradicacao', 'trabalho', 'infantil'],
  nob: ['norma', 'operacional', 'basica'],
  fnas: ['fundo', 'nacional', 'assistencia', 'social'],
  fmas: ['fundo', 'municipal', 'assistencia', 'social'],
  caps: ['centro', 'atencao', 'psicossocial'],
  raps: ['rede', 'atencao', 'psicossocial'],
  pcd: ['pessoa', 'deficiencia'],
  mds: ['ministerio', 'desenvolvimento', 'social'],
  paf: ['plano', 'acompanhamento', 'familiar'],
  tsft: ['trabalho', 'social', 'familias', 'territorios'],
  rma: ['relatorio', 'mensal', 'atendimentos'],
  gpte: ['grupos', 'populacionais', 'tradicionais', 'especificos'],
  spsbd: ['servico', 'protecao', 'social', 'basica', 'domicilio']
};

// Quantos trechos da base vão para a IA e para a resposta offline.
export const K_PADRAO = 4;

// Do texto de cada trecho, a IA só recebe os primeiros caracteres (worker/prompt.mjs). O Worker, por isso, guarda só esse começo
// (limite de tamanho do plano gratuito), e a assinatura do índice conta só até aqui para valer nas duas versões da base.
export const MAX_TEXTO_TRECHO = 700;

// Na hora de ordenar, lei e decreto valem um pouco mais que orientação técnica, e esta mais que material de apoio
// (para "o que é o BPC?" a lei vem antes de um caderno de orientação). Só muda a ordem, não quem entra.
const PESO_TIPO = { norma: 1.2, referencia: 1, apoio: 0.85 };
// Evita as 4 fontes serem do mesmo documento (ex.: 4 incisos do mesmo artigo).
const MAX_POR_DOC = 3;

export function normalizar(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Formas de "gerir" que as pessoas digitam; a norma costuma usar o infinitivo.
const ALIAS = { gere: 'gerir', gerem: 'gerir', gerencia: 'gerir', gerenciar: 'gerir', gerencie: 'gerir' };

// Raiz simples: tira o plural (-s, -es, -ões), as terminações de verbo e de substantivo (-ar, -er, -ir, -ção, -mento),
// a vogal final e corta em 6 letras. Assim "atuar", "atua" e "atuação" se encontram, "acolher" acha "acolhimento"
// e "município" e "municipal" também.
const CACHE_RAIZ = new Map();
function raiz(t) {
  // O vocabulário é pequeno (~12 mil palavras) e os trechos repetem as mesmas palavras centenas de milhares de vezes:
  // guardar o resultado corta o tempo de montar o índice (importante no Worker, que tem limite de partida).
  let r = CACHE_RAIZ.get(t);
  if (r === undefined) {
    if (CACHE_RAIZ.size > 60000) CACHE_RAIZ.clear();
    r = calcularRaiz(t);
    CACHE_RAIZ.set(t, r);
  }
  return r;
}

function calcularRaiz(t) {
  if (ALIAS[t]) t = ALIAS[t];
  if (t.length > 4) {
    if (t.endsWith('oes')) t = t.slice(0, -3) + 'ao';          // decisoes -> decisao
    else if (/(?:or|ar|er|ur)es$/.test(t)) t = t.slice(0, -2);  // valores -> valor, mulheres -> mulher
    else if (t.endsWith('s')) t = t.slice(0, -1);
  }
  const m = /^(.{3,}?)(?:acao|icao|amento|imento|ar|er|ir)$/.exec(t);
  if (m) t = m[1];
  else if (t.length > 3 && /[aeo]$/.test(t)) t = t.slice(0, -1);
  return t.length > 6 ? t.slice(0, 6) : t;
}

export function tokenizar(s, { expandir = false } = {}) {
  const base = normalizar(s).split(' ').filter(Boolean);
  const saida = [];
  for (const t of base) {
    if (STOP.has(t)) continue;
    saida.push(raiz(t));
    if (expandir && SIGLAS[t]) for (const x of SIGLAS[t]) saida.push(raiz(x));
  }
  return saida;
}

// Termos da pergunta com peso: o que a pessoa escreveu vale 1; a forma por extenso de uma sigla vale PESO_EXTENSO
// (senão "BPC" favorece qualquer trecho que repita "Benefício de Prestação Continuada", mesmo sem falar do assunto).
const PESO_EXTENSO = 0.35;
// Quanto vale a sigla quando o trecho a traz só por extenso (em relação a ela aparecer escrita).
const PESO_SIGLA_POR_EXTENSO = 0.8;
function termosDaConsulta(consulta) {
  const pesos = new Map();
  const siglas = []; // { t: raiz da sigla, exp: raízes da forma por extenso }
  for (const t of tokenizar(consulta)) pesos.set(t, 1);
  for (const t of normalizar(consulta).split(' ')) {
    if (STOP.has(t) || !SIGLAS[t]) continue;
    const exp = SIGLAS[t].map(raiz);
    for (const r of exp) if (!pesos.has(r)) pesos.set(r, PESO_EXTENSO);
    siglas.push({ t: raiz(t), exp: exp });
  }
  return { pesos, siglas };
}

function trechosValidos(trechos) {
  return (Array.isArray(trechos) ? trechos : []).filter(function (c) { return c && c.texto; });
}

// Assinatura simples da base (quantidade de trechos e de caracteres): serve para saber se um índice
// pré-calculado ainda corresponde à base que está sendo usada.
function assinatura(validos) {
  let chars = 0;
  for (const c of validos) chars += Math.min(c.texto.length, MAX_TEXTO_TRECHO);
  return validos.length + ':' + chars;
}

// "pre" (opcional) é um índice já calculado por serializarIndice(). Montar o índice de uma base grande leva
// centenas de milissegundos; o Worker tem limite de partida, então ele recebe o índice pronto no pacote.
// Se "pre" não corresponder à base (assinatura diferente), o índice é calculado do zero.
// Parágrafo, inciso e alínea ("art. 20, § 3º") quase nunca repetem o assunto do artigo ("benefício de prestação continuada"):
// quem pergunta pelo assunto não os encontrava. Para a busca (e só para ela), o trecho "filho" herda o começo do texto do artigo (caput).
const MAX_HERANCA = 300;
const REF_FILHO = /^(art\. [0-9]+[º°o]?(?:-[A-Z])?),\s*\S/;
function mapaDeCaput(validos) {
  const m = new Map();
  for (const c of validos) {
    const r = String(c.referencia || '').trim();
    if (/^art\. [0-9]+[º°o]?(?:-[A-Z])?(?:, caput)?$/.test(r)) m.set(c.doc + '|' + r.replace(/, caput$/, ''), c);
  }
  return m;
}
function textoHerdado(c, caputs) {
  const f = REF_FILHO.exec(String(c.referencia || '').trim());
  const pai = f && caputs.get(c.doc + '|' + f[1]);
  return pai && pai !== c ? ' ' + pai.texto.slice(0, MAX_HERANCA) : '';
}

export function criarIndice(trechos, pre) {
  const validos = trechosValidos(trechos);
  if (pre && pre.f === 2 && pre.sig === assinatura(validos) && Array.isArray(pre.v) && Array.isArray(pre.d) && pre.d.length === validos.length) {
    return restaurarIndice(validos, pre);
  }
  const docs = [];
  const df = Object.create(null);
  let soma = 0;
  const caputs = mapaDeCaput(validos);
  for (const c of validos) {
    // a referência ("art. 17, XV") e o título pesam o dobro
    const toks = tokenizar((c.referencia || '') + ' ' + (c.referencia || '') + ' ' + (c.titulo || '') + ' ' + c.texto + textoHerdado(c, caputs));
    const tf = Object.create(null);
    for (const t of toks) tf[t] = (tf[t] || 0) + 1;
    for (const t in tf) df[t] = (df[t] || 0) + 1;
    docs.push({ c, tf, len: toks.length });
    soma += toks.length;
  }
  return { docs, df, post: listasDeOcorrencia(docs), N: docs.length, avg: docs.length ? soma / docs.length : 0 };
}

// Termo -> posições (em ordem crescente) dos trechos que o contêm. A busca só pontua trechos que têm ao menos um termo da pergunta:
// os demais teriam nota 0 e nunca passariam do corte, então pular esses trechos não muda o resultado, só o tempo.
function listasDeOcorrencia(docs) {
  const post = Object.create(null);
  for (let i = 0; i < docs.length; i++) {
    for (const t in docs[i].tf) (post[t] || (post[t] = [])).push(i);
  }
  return post;
}

// Índice em forma compacta, para guardar em arquivo: { f:2, sig, v:[termos], d:[[len, delta, vezes, delta, vezes, ...], ...] }
// O vocabulário vai ordenado do termo mais comum para o mais raro e os ids de cada trecho vão em ordem crescente, só pela
// diferença para o anterior: números pequenos e repetidos comprimem muito mais (importa porque o Worker tem limite de tamanho).
export function serializarIndice(indice) {
  const termos = Object.keys(indice.df);
  termos.sort(function (a, b) { return indice.df[b] - indice.df[a]; }); // estável: empate mantém a ordem de inserção
  const id = new Map(termos.map(function (t, i) { return [t, i]; }));
  const d = indice.docs.map(function (x) {
    const pares = Object.keys(x.tf).map(function (t) { return [id.get(t), x.tf[t]]; });
    pares.sort(function (a, b) { return a[0] - b[0]; });
    const linha = [x.len];
    let ant = 0;
    for (const p of pares) { linha.push(p[0] - ant, p[1]); ant = p[0]; }
    return linha;
  });
  return { f: 2, sig: assinatura(indice.docs.map(function (x) { return x.c; })), v: termos, d: d };
}

function restaurarIndice(validos, pre) {
  const docs = [];
  const df = Object.create(null);
  // As listas de ocorrência são montadas pelo número do termo (vetor, bem mais rápido que pelo texto) e só no fim ganham o nome do termo.
  const porId = new Array(pre.v.length);
  let soma = 0;
  for (let i = 0; i < validos.length; i++) {
    const linha = pre.d[i];
    const tf = Object.create(null);
    let idTermo = 0;
    for (let j = 1; j < linha.length; j += 2) {
      idTermo += linha[j];
      const t = pre.v[idTermo];
      tf[t] = linha[j + 1];
      df[t] = (df[t] || 0) + 1;
      const l = porId[idTermo];
      if (l) l.push(i); else porId[idTermo] = [i];
    }
    docs.push({ c: validos[i], tf, len: linha[0] });
    soma += linha[0];
  }
  const post = Object.create(null);
  for (let id = 0; id < porId.length; id++) if (porId[id]) post[pre.v[id]] = porId[id];
  return { docs, df, post, N: docs.length, avg: docs.length ? soma / docs.length : 0 };
}

function fatorPreferido(preferir, doc) {
  const f = preferir && preferir[doc];
  return typeof f === 'number' && f > 1 ? Math.min(f, 1.3) : 1;
}

// Devolve [{ trecho, score, cobertura }] do melhor para o pior.
// cobertura = fração dos termos da pergunta que aparecem no trecho (filtra resultados "de sorte").
// preferir (opcional): { [doc]: fator } leve favorecimento dos documentos que a pessoa mais consulta (memória do Paulus).
// Só desempata a ORDEM entre trechos que já passaram nos cortes; nunca traz resultado que a busca não traria. Fator limitado a 1,3.
// "O que é o BPC?": o trecho que DEFINE a coisa ("O benefício de prestação continuada é a garantia de...") deve vir antes dos que só a citam.
const RE_PERGUNTA_DEFINICAO = /^(?:o que e|o que sao|que e|oq e|defina|definicao de|conceito de|significado de|o que significa)\b/;
const PESO_DEFINICAO = 1.5;
function defineASigla(textoNormalizado, expansao) {
  // as palavras da forma por extenso, em ordem e perto do começo, seguidas de "e"/"sao"/"consiste" ("o beneficio de prestacao continuada e a garantia...")
  const p = textoNormalizado.split(' ', 24);
  let i = 0;
  for (const alvo of expansao) {
    const j = p.indexOf(alvo, i);
    if (j < 0 || j - i > 3) return false;
    i = j + 1;
  }
  return i < p.length - 1 && p.slice(i, i + 3).some(function (w) { return w === 'e' || w === 'sao' || w === 'consiste'; });
}


// ------------------------------------------------------------------ gíria do trabalho -> termo da norma
// Quem pergunta escreve "cesta básica", "pai bate nos filhos", "morador de rua"; a norma escreve "benefício eventual",
// "violência" e "situação de rua". Cada conceito abaixo liga a fala do dia a dia às palavras técnicas (só para a BUSCA; a IA não vê isto).
// O trecho que traz pelo menos metade dos termos técnicos conta a frase da pessoa como encontrada, como acontece com as siglas.
const CONCEITOS = [
  { re: /\b(?:cestas? basicas?|auxilio alimentacao|auxilio alimento|ajuda de alimento|vale alimento)\b/, exp: ['beneficio', 'eventual', 'seguranca', 'alimentar'] },
  { re: /\b(?:aluguel social|auxilio aluguel|bolsa aluguel|ajuda de aluguel|pagar o aluguel)\b/, exp: ['beneficio', 'eventual', 'vulnerabilidade', 'temporaria', 'moradia'] },
  { re: /\b(?:auxilio funeral|auxilio funerario|enterro|sepultamento|velorio|caixao)\b/, exp: ['beneficio', 'eventual', 'funeral', 'morte'] },
  { re: /\b(?:auxilio natalidade|enxoval|nascimento do bebe)\b/, exp: ['beneficio', 'eventual', 'natalidade', 'nascimento'] },
  { re: /\b(?:bate|batem|bateu|apanha|apanham|apanhou|espanca\w*|surra\w*|agride|agridem|agrediu|agressao|agressoes|maus tratos|castigo fisico|palmada)\b/, exp: ['violencia', 'maus', 'tratos', 'agressao', 'protecao'] },
  { re: /\b(?:abandono|abandonad[oa]s?|largad[oa]s?|jogad[oa]s? de lado)\b/, exp: ['negligencia', 'abandono'] },
  { re: /\b(?:morador(?:es)? de rua|mendig\w+|sem teto|dormindo na rua|vive na rua|vivem na rua)\b/, exp: ['situacao', 'rua', 'populacao'] },
  { re: /\b(?:drogad[oa]s?|viciad[oa]s?|crack|craqueir\w+|usuarios? de drogas|cheirando|bebe demais|alcoolatra)\b/, exp: ['uso', 'alcool', 'outras', 'drogas'] },
  { re: /\b(?:lou[ck][oa]s?|doid[oa]s?|surto|surtou|surtando|crise nervosa|crise de nervos|perturbad[oa]s?)\b/, exp: ['saude', 'mental', 'sofrimento', 'psiquico'] },
  { re: /\b(?:laudos?|pareceres?|atestados? psicologic\w+|declaracao psicologica)\b/, exp: ['documento', 'psicologico', 'relatorio', 'parecer', 'declaracao'] },
  { re: /\b(?:indios?|aldeias?|aldeados?|tribo|tribos)\b/, exp: ['indigena', 'povos', 'comunidade', 'tradicional'] },
  { re: /\b(?:venezuelan\w+|imigrantes?|estrangeir\w+|haitian\w+|refugiad\w+)\b/, exp: ['migrante', 'refugio', 'acolhida', 'migracao'] },
  { re: /\b(?:cortaram|cortado|cortou|suspenderam|suspenso|suspensa|travado|travada|bloqueado|bloqueada|bloquearam)\b.*\b(?:bolsa|beneficio|auxilio|pbf)\b|\b(?:bolsa|beneficio|auxilio|pbf)\b.*\b(?:cortaram|cortado|cortou|suspenderam|suspenso|suspensa|travado|travada|bloqueado|bloqueada|bloquearam)\b/, exp: ['bloqueio', 'suspensao', 'cancelamento', 'repercussao'] },
  { re: /\b(?:deficientes?|cadeirantes?|aleijad[oa]s?|invalid[oa]s?)\b/, exp: ['pessoa', 'deficiencia', 'bpc'] },
  { re: /\b(?:velhos?|velhinh[oa]s?|terceira idade|anciao|anciaos|melhor idade)\b/, exp: ['pessoa', 'idosa', 'idoso'] },
  { re: /\b(?:menores? de idade|menorzinho|pivetes?|meninos? de rua)\b/, exp: ['crianca', 'adolescente', 'estatuto'] },
  { re: /\b(?:passando fome|fome|sem comida|sem ter o que comer)\b/, exp: ['inseguranca', 'alimentar', 'seguranca', 'alimentacao'] },
  { re: /\b(?:desempregad[oa]s?|desemprego|sem emprego|sem trabalho|sem renda)\b/, exp: ['trabalho', 'renda', 'inclusao', 'produtiva'] },
  { re: /\b(?:briga em casa|brigas em casa|briga de familia|conflito familiar|conflitos familiares|familia brigando)\b/, exp: ['conflito', 'familiar', 'vinculos', 'familia'] },
  { re: /\b(?:menina gravida|gravidez na adolescencia|adolescente gravida|gravidez precoce)\b/, exp: ['gravidez', 'adolescencia', 'adolescente'] },
  { re: /\b(?:crianca trabalhando|menor trabalhando|trabalho de crianca|criancas trabalhando)\b/, exp: ['trabalho', 'infantil', 'erradicacao'] }
];
const PESO_CONCEITO = 0.6;

function conceitosDaConsulta(consultaNorm) {
  const saida = [];
  for (const c of CONCEITOS) {
    const m = c.re.exec(consultaNorm);
    if (!m) continue;
    const frase = tokenizar(m[0]);
    saida.push({ exp: c.exp.map(raiz), frase: frase, pesoFrase: Math.max(1, frase.length) });
  }
  return saida;
}

// ------------------------------------------------------------------ onde: município da pergunta x município do trecho
// A base tem um diagnóstico por município (e o Censo SUAS tem uma seção por município). Sem isto, "quantos CRAS tem em Boa Vista?"
// trazia o diagnóstico de Pacaraima. Regras: pergunta que cita município favorece os trechos dele e rebaixa os de outros;
// pergunta sem município assume Boa Vista (onde o Paulus trabalha) e rebaixa os dos outros municípios.
const MUNICIPIOS = ['boa vista', 'alto alegre', 'amajari', 'bonfim', 'canta', 'caracarai', 'caroebe', 'iracema', 'mucajai', 'normandia', 'pacaraima', 'rorainopolis', 'sao joao da baliza', 'sao luiz', 'uiramuta'];
const RE_DOC_LOCAL = /^(?:.*diagnostico-socioterritorial.*|censo-suas-2025-roraima-psicologos)$/;
const RE_DOC_DIAGNOSTICO = /diagnostico-socioterritorial/;
// "Quantas famílias..., renda, habitação, território": a pergunta quer dado do território. Sem isso o diagnóstico só atrapalha ("relatório de visita domiciliar").
// O Censo SUAS (equipes, unidades) só ajuda quando a pergunta fala de equipe, unidade ou psicólogo do SUAS.
const RE_QUER_CENSO = /\b(?:psicolog\w+|cras|creas|centro pop|censo|equipe|equipes|rh|profissionais|unidades?|capacidade|implantacao|equipamentos?|carga horaria|servidores?|trabalhadores?)\b/;
const RE_QUER_DADO_LOCAL = /\b(?:quantos|quantas|quantidade|numero|numeros|dados|diagnostico|setor|setores|indicador|indicadores|percentual|porcentagem|populacao|habitantes|censo|ivcad|estatistica|estatisticas|total|perfil|cadastrad\w+|renda|pobreza|vulnerabilidade|habitacao|habitacionais|territorio|territorial|bairros?|domicilios|moradia|alfabetizacao|escolaridade|equipe|equipes|psicolog\w+|capacidade|implantacao|cras|creas)\b/;

export function municipiosEm(textoNormalizado) {
  const t = ' ' + textoNormalizado + ' ';
  return MUNICIPIOS.filter(function (m) { return t.indexOf(' ' + m + ' ') >= 0; });
}

function fatorLocal(trecho, municipiosPergunta, querDado, querCenso) {
  if (!RE_DOC_LOCAL.test(trecho.doc || '')) return 1;
  const quer = RE_DOC_DIAGNOSTICO.test(trecho.doc) ? querDado : querCenso;
  let f = quer ? 1 : 0.5;
  const doTrecho = municipiosEm(normalizar(trecho.referencia));
  if (!doTrecho.length) return f;
  // Citar o município só favorece o trecho dele quando a pergunta pede dado do território; fora disso, só rebaixa os de outros municípios.
  if (municipiosPergunta.length) return f * (doTrecho.some(function (m) { return municipiosPergunta.indexOf(m) >= 0; }) ? (quer ? 1.3 : 1) : 0.6);
  return f * (doTrecho.indexOf('boa vista') >= 0 ? (quer ? 1.25 : 1) : 0.65);
}

// Chave do assunto de um trecho de diagnóstico, sem o nome do município: os três diagnósticos que incluem Boa Vista repetem o mesmo assunto.
function assuntoDoDiagnostico(trecho) {
  let t = ' ' + normalizar(trecho.referencia) + ' ';
  for (const m of MUNICIPIOS) t = t.split(' ' + m + ' ').join(' ');
  // "Cantá, Boa Vista e Bonfim" deixa um "e" solto: sai de todas as chaves, para as chaves continuarem comparáveis
  return t.replace(/ e /g, ' ').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------ pistas por documento
// Pergunta que só um documento da base responde bem: ele sobe na ordem (nunca entra se a busca não o trouxe).
const PISTAS = [
  { todas: [/psicolog/, /\b(?:quantos|quantas|quantidade|equipe|equipes|rh|profissionais|censo|carga horaria|vinculo|vinculos|contratad\w+|concursad\w+|efetiv\w+|cobertura|lotad\w+)\b/], doc: 'censo-suas-2025-roraima-psicologos', fator: 1.6 },
  { todas: [/\bcenso suas\b/], doc: 'censo-suas-2025-roraima-psicologos', fator: 1.8 },
  { todas: [/\b(?:cras|creas)\b/, /\b(?:quantos|quantas|equipe|equipes|capacidade|implantacao|equipamentos?|unidades|estrutura)\b/], doc: 'censo-suas-2025-roraima-psicologos', fator: 1.4 },
  { todas: [/\bvenezuel\w+|\bacolhida\b|\bmigrantes?\b|\brefugi\w+/], doc: 'roraima-operacao-acolhida-2026', fator: 1.3 },
  // "Quem pode receber cesta básica / aluguel social" é pergunta sobre benefício eventual: o decreto sobe, senão os cadernos longos do PAIF, que repetem "cesta básica", ocupam todas as vagas.
  { todas: [/\b(?:cestas? basicas?|aluguel social|auxilio aluguel|auxilio funeral|auxilio natalidade|beneficios? eventua(?:l|is))\b/], doc: 'decreto-6307-2007', fator: 1.6 }
];

function fatorPista(doc, consultaNorm) {
  let f = 1;
  for (const p of PISTAS) if (p.doc === doc && p.todas.every(function (r) { return r.test(consultaNorm); })) f = Math.max(f, p.fator);
  return f;
}

// Posições dos trechos que têm ao menos um termo da pergunta (ou da forma técnica de uma gíria), em ordem crescente: é a ordem em que a
// busca sempre percorreu a base, então desempates e arredondamentos ficam exatamente como eram. Sem as listas de ocorrência
// (índice montado à mão), percorre a base inteira, como antes.
function candidatos(indice, termos, conceitos) {
  const post = indice.post;
  if (!post) return indice.docs.map(function (_, i) { return i; });
  const marca = new Uint8Array(indice.docs.length);
  const marcar = function (t) { const l = post[t]; if (l) for (let j = 0; j < l.length; j++) marca[l[j]] = 1; };
  for (const t of termos) marcar(t);
  for (const g of conceitos) for (const e of g.exp) marcar(e);
  const saida = [];
  for (let i = 0; i < marca.length; i++) if (marca[i]) saida.push(i);
  return saida;
}

function notasPorTermo(indice, termos, pesos, idfDe, k1, b) {
  const post = indice.post;
  if (!post) return null;
  const n = indice.docs.length;
  const score = new Float64Array(n), achou = new Float64Array(n);
  for (const t of termos) {
    const lista = post[t];
    if (!lista) continue;
    const w = pesos.get(t), idf = idfDe(t);
    for (let j = 0; j < lista.length; j++) {
      const i = lista[j], d = indice.docs[i], f = d.tf[t];
      achou[i] += w;
      score[i] += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (indice.avg || 1)));
    }
  }
  return { score, achou };
}

// ------------------------------------------------------------------ cobertura por raridade
function coberturaPorRaridade(d, termos, pesos, siglas, conceitos, idfDe, total, doDocumento) {
  if (!total) return { cob: 1, ancora: true };
  let achou = 0;
  const creditados = new Set();
  for (const t of termos) {
    // o nome do documento que a pergunta cita ("Decreto 6.214") vale para todos os trechos DELE, mesmo que o texto não o repita
    if (d.tf[t] || (doDocumento && doDocumento.has(t))) { achou += pesos.get(t) * idfDe(t); creditados.add(t); }
  }
  // sigla que o trecho traz só por extenso e gíria achada pelos termos técnicos contam como encontradas (como na cobertura comum)
  for (const g of siglas) {
    if (creditados.has(g.t)) continue;
    let menor = Infinity;
    for (const e of g.exp) menor = Math.min(menor, d.tf[e] || 0);
    if (menor && menor !== Infinity) { achou += (pesos.get(g.t) || 1) * idfDe(g.t); creditados.add(g.t); }
  }
  for (const g of conceitos) {
    let achados = 0;
    for (const e of g.exp) if (d.tf[e]) achados++;
    if (achados / g.exp.length < 0.5) continue;
    for (const t of g.frase) if (!creditados.has(t) && pesos.has(t)) { achou += pesos.get(t) * idfDe(t); creditados.add(t); }
  }
  // termo âncora: o de maior peso de assunto da pergunta ("sigilo" em "como funciona o sigilo no registro?")
  let ancora = null, melhor = -1;
  for (const t of termos) { const v = pesos.get(t) * idfDe(t); if (v > melhor) { melhor = v; ancora = t; } }
  return { cob: Math.min(1, achou / total), ancora: ancora === null || creditados.has(ancora) };
}

// ------------------------------------------------------------------ "art. 17 da NOB/SUAS": pedido de referência explícita
// Quem cita o artigo e o documento quer ESSE artigo, não os trechos que mais repetem as palavras dele. O documento é reconhecido pelo
// nome (LOAS, NOB/SUAS, PNAS, Tipificação, Constituição) ou pelo número (Lei 8.742, Decreto 6.214, Resolução CNAS 109), que a própria base traz.
const PESO_DOC_CITADO = 1.5;
const APELIDOS_DOCS = {
  'loas-1993': ['loas', 'lei organica da assistencia social'],
  'nob-suas-2012': ['nob suas', 'norma operacional basica do suas'],
  'nob-rh-suas-anotada-2011': ['nob rh', 'nob rh suas'],
  'pnas-2004': ['pnas', 'politica nacional de assistencia social'],
  'tipificacao-2009': ['tipificacao', 'tipificacao nacional'],
  'cf-1988-extratos': ['constituicao federal', 'constituicao', 'cf 88', 'cf 1988'],
  'decreto-6214-2007': ['regulamento do bpc'],
  'lei-14601-2023': ['lei do bolsa familia']
};
const RE_NUMERO_NORMA = /\b(Lei|Decreto|Resolu[cç][aã]o(?:\s+(?:CNAS\/MDS|CNAS|CFP|CNJ|CNS))?|Portaria(?:\s+Interministerial)?(?:\s+(?:MDS\/MS|MEC\/MDS|MDS|GM\/MS))?)\s+(?:n[ºo°.]*\s*)?(\d[\d.]*)/i;

function normalizarRef(s) {
  return normalizar(String(s == null ? '' : s).replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1')).replace(/\b(?:n|no|num|numero)\s+(?=\d)/g, '');
}

const CACHE_DESIGNADORES = new WeakMap();
function designadoresDosDocs(indice) {
  let m = CACHE_DESIGNADORES.get(indice);
  if (m) return m;
  m = new Map();
  for (const d of indice.docs) {
    const c = d.c;
    if (!c.doc || m.has(c.doc)) continue;
    const frases = new Set((APELIDOS_DOCS[c.doc] || []).map(normalizarRef));
    const n = RE_NUMERO_NORMA.exec(String(c.norma || '').slice(0, 140));
    if (n) {
      const numero = normalizarRef(n[2].replace(/\.+$/, ''));
      const tipo = normalizarRef(n[1]);
      if (numero) { frases.add(tipo + ' ' + numero); frases.add(tipo.split(' ')[0] + ' ' + numero); }
    }
    m.set(c.doc, Array.from(frases).filter(function (f) { return f.length >= 3; }));
  }
  CACHE_DESIGNADORES.set(indice, m);
  return m;
}

// O índice parte "14.601" em "14" e "601"; o designador ("lei 14601") vem sem o ponto. Os dois jeitos valem.
function tokensDoDesignador(frase) {
  const toks = new Set(tokenizar(frase));
  for (const t of Array.from(toks)) {
    if (/^\d{4,}$/.test(t)) { tokenizar(t.slice(0, -3)).forEach(function (x) { toks.add(x); }); tokenizar(t.slice(-3)).forEach(function (x) { toks.add(x); }); }
  }
  return toks;
}

// Documentos que a pergunta nomeia: Map(id do documento -> a frase que o designou) ou null.
export function docsDaPergunta(indice, consulta) {
  const q = ' ' + normalizarRef(consulta) + ' ';
  let achou = null;
  for (const [doc, frases] of designadoresDosDocs(indice)) {
    const f = frases.find(function (x) { return q.indexOf(' ' + x + ' ') >= 0; });
    if (f) (achou || (achou = new Map())).set(doc, f);
  }
  return achou;
}

const RE_PEDIDO_ARTIGO = /\b(?:artigos?|arts?)\s+(\d{1,4})(?:\s+(?:e|a|ao)\s+(\d{1,4}))?\b/;
const RE_REFERENCIA_ARTIGO = /^art\. (\d+)[º°o]?(-[A-Z])?(?=,|\s|$)/;
const CACHE_ARTIGOS = new WeakMap();
function trechosPorArtigo(indice) {
  let m = CACHE_ARTIGOS.get(indice);
  if (m) return m;
  m = new Map();
  for (const d of indice.docs) {
    const r = RE_REFERENCIA_ARTIGO.exec(String(d.c.referencia || '').trim());
    if (!r || r[2]) continue; // "art. 17-A" é outro artigo que não o 17
    const chave = d.c.doc + '|' + r[1];
    (m.get(chave) || m.set(chave, []).get(chave)).push(d.c);
  }
  CACHE_ARTIGOS.set(indice, m);
  return m;
}

// { docs:Set, exatos:[resultado] } quando a pergunta pede um artigo de um documento que a base tem; senão null.
export function referenciaExata(indice, consulta, max = 4) {
  if (!indice || !indice.N) return null;
  const docs = docsDaPergunta(indice, consulta);
  if (!docs) return { docs: null, exatos: [], pediuArtigo: false };
  const pedido = RE_PEDIDO_ARTIGO.exec(normalizarRef(consulta));
  if (!pedido) return { docs: docs, exatos: [], pediuArtigo: false };
  const paragrafo = /(?:§|par[aá]grafo)\s*(\d{1,2})/i.exec(String(consulta));
  const marcaParagrafo = paragrafo ? '§ ' + paragrafo[1] : '';
  // "art. 17, XV" (algarismo romano em maiúscula logo depois do artigo) ou "art. 17 inciso xv"
  const inciso = /\binciso\s+([ivxlcdm]{1,6})\b/i.exec(String(consulta)) || /\bart[^\d]{0,8}\d+[º°o]?\s*,?\s*([IVXLCDM]{1,6})\b/.exec(String(consulta));
  const marcaInciso = inciso ? ', ' + inciso[1].toUpperCase() : '';
  const artigos = pedido[2] && Number(pedido[2]) - Number(pedido[1]) <= 1 ? [pedido[1], pedido[2]] : [pedido[1]];
  const porArtigo = trechosPorArtigo(indice);
  const exatos = [];
  for (const art of artigos) {
    for (const doc of docs.keys()) {
      const lista = (porArtigo.get(doc + '|' + art) || []).slice();
      const peso = function (t) {
        const ref = String(t.referencia || '');
        if (/^art\. \d+[º°o]?(?:, caput)?$/.test(ref.trim())) return 0;      // o próprio artigo (caput) vem primeiro
        if (marcaParagrafo && ref.indexOf(marcaParagrafo) >= 0) return 1;       // o parágrafo pedido, logo depois
        if (marcaInciso && (ref.endsWith(marcaInciso) || ref.indexOf(marcaInciso + ',') >= 0)) return 1; // ou o inciso pedido
        return 2;                                                                // incisos e demais parágrafos, na ordem da norma
      };
      lista.map(function (t, i) { return { t: t, i: i, p: peso(t) }; }).sort(function (a, b) { return a.p - b.p || a.i - b.i; })
        .forEach(function (x) { exatos.push({ trecho: x.t, score: 99, cobertura: 1, coberturaIdf: 1, ancora: true, ordem: 99 - exatos.length * 0.01, exata: true }); });
    }
  }
  return { docs: docs, exatos: exatos.slice(0, max), pediuArtigo: true };
}

export function buscar(indice, consulta, { k = 3, minScore = 1.2, minCobertura = 0.5, preferir = null } = {}) {
  if (!indice || !indice.N) return [];
  const { pesos, siglas } = termosDaConsulta(consulta);
  const termos = Array.from(pesos.keys());
  if (!termos.length) return [];
  let pesoTotal = 0;
  for (const p of pesos.values()) pesoTotal += p;
  const k1 = 1.4, b = 0.75;
  // Pergunta de definição com sigla: formas por extenso (palavras normalizadas) cujo trecho de definição ganha prioridade.
  const consultaNorm = normalizar(consulta);
  const expansoesDefinicao = RE_PERGUNTA_DEFINICAO.test(consultaNorm)
    ? consultaNorm.split(' ').filter(function (t) { return SIGLAS[t] && !STOP.has(t); }).map(function (t) { return SIGLAS[t]; })
    : [];
  const conceitos = conceitosDaConsulta(consultaNorm);
  const municipiosPergunta = municipiosEm(consultaNorm);
  const querDado = RE_QUER_DADO_LOCAL.test(consultaNorm);
  const querCenso = RE_QUER_CENSO.test(consultaNorm);
  const res = [];
  // O peso de raridade (idf) de um termo é o mesmo para todos os trechos: calcula uma vez por termo, não uma vez por trecho.
  const idfs = new Map();
  const idfDe = function (t) {
    let v = idfs.get(t);
    if (v === undefined) {
      const n = indice.df[t] || 0;
      v = Math.log(1 + (indice.N - n + 0.5) / (n + 0.5));
      idfs.set(t, v);
    }
    return v;
  };
  // Nota dos termos da pergunta de todos os trechos de uma vez, andando só pelas listas de ocorrência (em vez de perguntar a cada trecho
  // candidato, termo por termo, se o termo está lá). Cada trecho soma os termos na mesma ordem de antes, então a nota sai idêntica.
  const previa = notasPorTermo(indice, termos, pesos, idfDe, k1, b);
  // Cobertura por RARIDADE: o termo raro da pergunta ("sigilo") diz mais sobre o assunto do que o comum ("funciona", "registro").
  // A cobertura comum conta quantos termos o trecho tem; esta conta quanto do "peso de assunto" da pergunta ele cobre.
  let pesoIdfTotal = 0;
  for (const t of termos) pesoIdfTotal += pesos.get(t) * idfDe(t);
  const docsCitados = docsDaPergunta(indice, consulta);
  const tokensDoDoc = docsCitados ? new Map(Array.from(docsCitados, function (e) { return [e[0], tokensDoDesignador(e[1])]; })) : null;
  for (const i of candidatos(indice, termos, conceitos)) {
    const d = indice.docs[i];
    let score = 0, achou = 0;
    if (previa) { score = previa.score[i]; achou = previa.achou[i]; }
    else for (const t of termos) {
      const f = d.tf[t];
      if (!f) continue;
      const w = pesos.get(t);
      achou += w;
      const idf = idfDe(t);
      score += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (indice.avg || 1)));
    }
    // Lei escreve "benefício de prestação continuada" por extenso e quem pergunta digita "BPC": quando o trecho traz TODAS as palavras
    // da forma por extenso, a sigla conta como encontrada (senão o artigo que define o BPC perde para quem só repete a sigla).
    for (const g of siglas) {
      if (d.tf[g.t]) continue;
      let menor = Infinity;
      for (const e of g.exp) menor = Math.min(menor, d.tf[e] || 0);
      if (!menor || menor === Infinity) continue;
      const idf = idfDe(g.t);
      score += PESO_SIGLA_POR_EXTENSO * idf * (menor * (k1 + 1)) / (menor + k1 * (1 - b + b * d.len / (indice.avg || 1)));
      achou += pesos.get(g.t) || 1; // a sigla vale 1 na cobertura
    }
    // Gíria do trabalho ("cesta básica") achada pelos termos técnicos da norma ("benefício eventual"): ver CONCEITOS.
    for (const g of conceitos) {
      let achados = 0, s = 0;
      for (const e of g.exp) {
        const f = d.tf[e];
        if (!f) continue;
        achados++;
        const idf = idfDe(e);
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (indice.avg || 1)));
      }
      if (achados / g.exp.length < 0.5) continue;
      score += PESO_CONCEITO * s;
      let jaAchou = 0;
      for (const t of g.frase) if (d.tf[t]) jaAchou += pesos.get(t) || 1;
      achou += Math.max(0, g.pesoFrase - jaAchou);
    }
    const cobertura = Math.min(1, achou / pesoTotal);
    if (score >= minScore && cobertura >= minCobertura) {
      let ordem = score * (PESO_TIPO[d.c.tipo || 'norma'] || 1) * fatorPreferido(preferir, d.c.doc) * fatorLocal(d.c, municipiosPergunta, querDado, querCenso) * fatorPista(d.c.doc, consultaNorm);
      if (docsCitados && docsCitados.has(d.c.doc)) ordem *= PESO_DOC_CITADO;
      if (expansoesDefinicao.length) {
        const inicio = normalizar(String(d.c.texto).slice(0, 220));
        if (expansoesDefinicao.some(function (e) { return defineASigla(inicio, e); })) ordem *= PESO_DEFINICAO;
      }
      const rar = coberturaPorRaridade(d, termos, pesos, siglas, conceitos, idfDe, pesoIdfTotal, tokensDoDoc && tokensDoDoc.get(d.c.doc) || null);
      res.push({ trecho: d.c, score, cobertura, coberturaIdf: rar.cob, ancora: rar.ancora, ordem });
    }
  }
  res.sort((x, y) => y.ordem - x.ordem);
  // O mesmo assunto de diagnóstico repetido em vários documentos (Boa Vista aparece em três): fica só o melhor.
  const assuntosVistos = new Set();
  for (let i = 0; i < res.length; i++) {
    if (!RE_DOC_DIAGNOSTICO.test(res[i].trecho.doc || '')) continue;
    const chave = assuntoDoDiagnostico(res[i].trecho);
    if (!chave) continue;
    if (assuntosVistos.has(chave)) { res.splice(i, 1); i--; } else assuntosVistos.add(chave);
  }
  // No máximo MAX_POR_DOC trechos do mesmo documento; se faltar resultado, completa com os que ficaram de fora.
  const escolhidos = [], sobras = [], porDoc = Object.create(null);
  for (const r of res) {
    if (escolhidos.length >= k) break;
    const n = porDoc[r.trecho.doc] || 0;
    if (n < MAX_POR_DOC) { porDoc[r.trecho.doc] = n + 1; escolhidos.push(r); } else sobras.push(r);
  }
  while (escolhidos.length < k && sobras.length) escolhidos.push(sobras.shift());
  escolhidos.sort((x, y) => y.ordem - x.ordem);
  return escolhidos;
}

// Pergunta curta de seguimento ("e o horário?", "e para adolescente?") sozinha não acha norma:
// junta a pergunta anterior do usuário (sem dado pessoal, o chamador já filtrou) para a busca.
export function consultaComContexto(pergunta, historico) {
  if (tokenizar(pergunta).length > 2 || !Array.isArray(historico)) return pergunta;
  for (let i = historico.length - 1; i >= 0; i--) {
    const h = historico[i];
    if (h && h.papel === 'usuario' && h.texto) return String(h.texto).slice(0, 300) + ' ' + pergunta;
  }
  return pergunta;
}

// Como a fonte aparece para a pessoa (e como o Worker a devolve). "tipo" só vai quando NÃO é norma
// (orientação técnica e material de apoio não obrigam, e o app precisa poder dizer isso).
export function fonteDe(trecho, achado) {
  const f = { documento: trecho.titulo || trecho.doc, norma: trecho.norma, ano: trecho.ano, referencia: trecho.referencia };
  if (trecho.tipo && trecho.tipo !== 'norma') f.tipo = trecho.tipo;
  // aderencia (só quando a seleção a calculou): o quanto o trecho responde ESTA pergunta (alta, media, baixa)
  if (achado && achado.aderencia) f.aderencia = achado.aderencia;
  return f;
}

// "Qual a diferença entre CRAS e CREAS?": uma busca só mistura os dois assuntos e acaba trazendo trechos que citam um deles de passagem.
// Aqui cada lado é buscado separado (como pergunta de definição) e os resultados se alternam, para a IA receber os dois.
const RE_COMPARACAO = /\b(?:diferenca|diferencas|diferenciar|diferencia|difere|distincao|comparar|comparacao|compare)\s+(?:entre\s+|de\s+|do\s+|da\s+)?(.+?)\s+(?:e|x|vs|versus|ou|com|para)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/;

export function ladosDaComparacao(consulta) {
  const m = RE_COMPARACAO.exec(normalizar(consulta));
  if (!m) return null;
  const limpar = function (t) { return t.replace(/^(?:o|a|os|as)\s+/, '').trim(); };
  const lados = [limpar(m[1]), limpar(m[2])];
  // cada lado precisa ter assunto próprio, e os dois têm de ser diferentes
  if (lados.some(function (l) { return tokenizar(l).length === 0 || l.split(' ').length > 6; })) return null;
  if (lados[0] === lados[1]) return null;
  return lados;
}

export function buscarPergunta(indice, consulta, opcoes = {}) {
  const lados = ladosDaComparacao(consulta);
  const k = opcoes.k || 3;
  if (!lados || k < 2) return buscar(indice, consulta, opcoes);
  const metade = Math.ceil(k / 2);
  const listas = lados.map(function (l) { return buscar(indice, 'o que e ' + l, Object.assign({}, opcoes, { k: metade })); });
  if (listas.some(function (l) { return !l.length; })) return buscar(indice, consulta, opcoes);
  const saida = [], vistos = new Set();
  for (let i = 0; saida.length < k && i < metade; i++) {
    for (const l of listas) {
      const r = l[i];
      if (r && !vistos.has(r.trecho) && saida.length < k) { vistos.add(r.trecho); saida.push(r); }
    }
  }
  // sobrou vaga (lados repetidos): completa com a busca da pergunta inteira
  if (saida.length < k) for (const r of buscar(indice, consulta, opcoes)) if (saida.length < k && !vistos.has(r.trecho)) { vistos.add(r.trecho); saida.push(r); }
  return saida;
}

// ------------------------------------------------------------------ seleção das fontes
// buscarPergunta traz os "k melhores" por nota, mesmo quando só o primeiro responde: o resto é ruído que vai para a IA (que pode citá-lo)
// e para a pessoa (que lê "Fonte:" de algo que nada tem a ver com a pergunta). buscarFontes escolhe QUAIS trechos valem, em quatro passos:
//   1. pergunta que cita artigo e documento ("art. 17 da NOB/SUAS"): o artigo pedido vem primeiro, e só ele (e o documento citado) completa as vagas;
//   2. descarta o trecho que cobre pouco do que a pergunta tem de raro (cobertura por raridade) ou que está muito abaixo do melhor;
//   3. tira repetição (a mesma página em "parte 1" e "parte 2");
//   4. marca a aderência de cada trecho à pergunta (alta, media, baixa), para a IA e o rodapé saberem o quanto confiar.
// Só ENCOLHE ou reordena o que buscarPergunta já traria (a exceção é o artigo pedido por nome, que entra mesmo sem bater palavras).
export const MIN_COBERTURA_RARIDADE = 0.33;
export const CORTE_RELATIVO = 0.45;
const PISO_COBERTURA_CONTAGEM = 0.35;

function chaveDeRepeticao(t) {
  return (t.doc || '') + '|' + String(t.referencia || '').replace(/\s*\(parte \d+(?: de \d+)?\)/g, '').trim();
}

// opcoes: { k, preferir, modo, temDiretorio } (modo 'consulta' com diretório do app: a pergunta é de unidade, e norma só entra se for forte).
export function buscarFontes(indice, consulta, opcoes = {}) {
  if (!indice || !indice.N) return [];
  const k = Math.max(1, opcoes.k || K_PADRAO);
  const deUnidade = opcoes.modo === 'consulta' && opcoes.temDiretorio === true;
  const alvo = deUnidade ? Math.min(k, 3) : k;
  const ref = referenciaExata(indice, consulta, alvo);
  const lados = ladosDaComparacao(consulta);
  // Pergunta longa dilui a cobertura por contagem ("posso dar cesta básica para família que recebe bolsa família?" perdia o decreto dos benefícios
  // eventuais): aqui o piso por contagem é mais baixo, e quem decide são a cobertura por raridade, o termo âncora e a distância do melhor.
  const bruto = buscarPergunta(indice, consulta, { k: alvo + 4, preferir: opcoes.preferir || null, minCobertura: PISO_COBERTURA_CONTAGEM });
  // Termo âncora: se algum trecho traz o termo mais característico da pergunta, os que não o trazem ficam de fora.
  const comAncora = bruto.filter(function (r) { return r.ancora; });
  const pool = comAncora.length ? comAncora : bruto;
  const maxOrdem = pool.reduce(function (m, r) { return Math.max(m, r.ordem); }, 0);
  const corte = deUnidade ? 0.7 : CORTE_RELATIVO;
  let lista = pool.filter(function (r) {
    if (r.coberturaIdf < MIN_COBERTURA_RARIDADE) return false;
    if (!lados && r.ordem < maxOrdem * corte) return false; // na comparação cada lado tem o seu melhor: a régua do melhor geral não vale
    return true;
  });
  const rotular = function (r, maximo) {
    const rel = maximo > 0 ? r.ordem / maximo : 1;
    r.aderencia = r.exata || (rel >= 0.7 && r.coberturaIdf >= 0.75) ? 'alta' : (rel >= 0.45 && r.coberturaIdf >= 0.5) ? 'media' : 'baixa';
    return r;
  };
  let saida;
  if (ref && ref.exatos.length) {
    // O artigo pedido, e só depois o que a busca achou DENTRO do documento citado.
    saida = ref.exatos.slice();
    if (saida.length < 2) for (const r of lista) if (ref.docs.has(r.trecho.doc) && r.aderencia !== 'baixa') saida.push(r);
  } else if (ref && ref.pediuArtigo) {
    // Pediu um artigo de um documento que a base tem, mas esse artigo não está na base (ex.: art. 5 da CF, que só tem extratos): nada de
    // trecho de outro documento fingindo ser resposta. O que for do documento citado vai como aproximação, marcado de aderência baixa.
    saida = lista.filter(function (r) { return ref.docs.has(r.trecho.doc); }).slice(0, 2).map(function (r) { r.limiteDeAderencia = 'baixa'; return r; });
  } else {
    saida = lista;
  }
  const vistos = new Set();
  const unicos = [];
  for (const r of saida) {
    const chave = chaveDeRepeticao(r.trecho);
    if (vistos.has(chave) || vistos.has(r.trecho)) continue;
    vistos.add(chave); vistos.add(r.trecho);
    unicos.push(r);
  }
  const maxFinal = unicos.reduce(function (m, r) { return Math.max(m, r.exata ? 0 : r.ordem); }, 0);
  unicos.forEach(function (r) { rotular(r, maxFinal); if (r.limiteDeAderencia) r.aderencia = r.limiteDeAderencia; });
  // Com ao menos duas fontes que respondem de verdade, as de aderência baixa saem. Sem isso (a base não tem o assunto), ficam no máximo 3,
  // marcadas como baixa: a IA e a pessoa sabem que é o mais próximo, não uma resposta.
  const boas = unicos.filter(function (r) { return r.aderencia !== 'baixa'; });
  const final = boas.length >= 2 ? boas : unicos.slice(0, Math.max(boas.length, Math.min(alvo, 3)));
  return final.slice(0, alvo);
}
