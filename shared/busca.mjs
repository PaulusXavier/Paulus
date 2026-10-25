// Busca por palavras (BM25) na base de conhecimento. Roda no navegador (offline) e no Worker.
// Sem dependências. Cada "trecho" da base tem: { id, doc, titulo, norma, ano, referencia, texto }.

const STOP = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre e ou que se ao aos ' +
  'qual quais como quem onde quando ser sao foi ha pelo pela pelos pelas seu sua seus suas ele ela eles elas isso essa esse este esta ' +
  'meu minha eu voce nos eh mais muito sao tem ter pode podem deve devem fazer faz quanto quanta fica ficam').split(' '));

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
  return { docs, df, N: docs.length, avg: docs.length ? soma / docs.length : 0 };
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
    }
    docs.push({ c: validos[i], tf, len: linha[0] });
    soma += linha[0];
  }
  return { docs, df, N: docs.length, avg: docs.length ? soma / docs.length : 0 };
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
  const res = [];
  for (const d of indice.docs) {
    let score = 0, achou = 0;
    for (const t of termos) {
      const f = d.tf[t];
      if (!f) continue;
      const w = pesos.get(t);
      achou += w;
      const idf = Math.log(1 + (indice.N - (indice.df[t] || 0) + 0.5) / ((indice.df[t] || 0) + 0.5));
      score += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (indice.avg || 1)));
    }
    // Lei escreve "benefício de prestação continuada" por extenso e quem pergunta digita "BPC": quando o trecho traz TODAS as palavras
    // da forma por extenso, a sigla conta como encontrada (senão o artigo que define o BPC perde para quem só repete a sigla).
    for (const g of siglas) {
      if (d.tf[g.t]) continue;
      let menor = Infinity;
      for (const e of g.exp) menor = Math.min(menor, d.tf[e] || 0);
      if (!menor || menor === Infinity) continue;
      const idf = Math.log(1 + (indice.N - (indice.df[g.t] || 0) + 0.5) / ((indice.df[g.t] || 0) + 0.5));
      score += PESO_SIGLA_POR_EXTENSO * idf * (menor * (k1 + 1)) / (menor + k1 * (1 - b + b * d.len / (indice.avg || 1)));
      achou += pesos.get(g.t) || 1; // a sigla vale 1 na cobertura
    }
    const cobertura = Math.min(1, achou / pesoTotal);
    if (score >= minScore && cobertura >= minCobertura) {
      let ordem = score * (PESO_TIPO[d.c.tipo || 'norma'] || 1) * fatorPreferido(preferir, d.c.doc);
      if (expansoesDefinicao.length) {
        const inicio = normalizar(String(d.c.texto).slice(0, 220));
        if (expansoesDefinicao.some(function (e) { return defineASigla(inicio, e); })) ordem *= PESO_DEFINICAO;
      }
      res.push({ trecho: d.c, score, cobertura, ordem });
    }
  }
  res.sort((x, y) => y.ordem - x.ordem);
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
export function fonteDe(trecho) {
  const f = { documento: trecho.titulo || trecho.doc, norma: trecho.norma, ano: trecho.ano, referencia: trecho.referencia };
  if (trecho.tipo && trecho.tipo !== 'norma') f.tipo = trecho.tipo;
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
