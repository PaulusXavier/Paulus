// Lê knowledge/documentos/*.md e gera knowledge/conhecimento.json (a base de normas do Paulus).
//
// Formato de cada .md:
//   ---
//   doc: nob-suas-2012                  (identificador curto, sem espaços)
//   titulo: NOB/SUAS 2012               (nome para mostrar)
//   norma: Resolução CNAS nº 33, ...    (a norma, por extenso)
//   ano: 2012
//   tipo: norma                         (opcional: norma | referencia | apoio; padrão norma)
//   pacote: psicologia                  (opcional: agrupa documentos; gera conhecimento-<pacote>.json no build)
//   url: https://...                    (opcional: endereço do documento oficial)
//   revisao: pendente                   (opcional: pendente | conferido; os importadores escrevem pendente)
//   ---
//   ## art. 17, XV                       (a referência que será citada)
//   Texto do trecho, copiado da norma.   (um ou mais parágrafos; viram um texto só)
//
// Comentários <!-- ... --> são ignorados. Gera também knowledge/catalogo.json. Uso: npm run build:conhecimento

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'knowledge', 'documentos');
const SAIDA = join(RAIZ, 'knowledge', 'conhecimento.json');
const SAIDA_CATALOGO = join(RAIZ, 'knowledge', 'catalogo.json');
const ID = /^[a-z0-9][a-z0-9-]*$/;
const TIPOS = ['norma', 'referencia', 'apoio'];
const REVISOES = ['pendente', 'conferido'];

// Devolve { meta, trechos }. "tipo" e "pacote" só entram nos trechos quando não são o padrão (norma / sem pacote),
// para a base de leis continuar do mesmo tamanho de sempre.
export function lerDocumentoCompleto(markdown, nomeArquivo) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown.replace(/^\uFEFF/, ''));
  if (!m) throw new Error(nomeArquivo + ': falta o bloco "---" no começo (doc, titulo, norma, ano).');
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(':');
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  for (const campo of ['doc', 'titulo', 'norma', 'ano']) {
    if (!meta[campo]) throw new Error(nomeArquivo + ': falta "' + campo + '" no começo do arquivo.');
  }
  if (!ID.test(meta.doc)) throw new Error(nomeArquivo + ': "doc" só pode ter letras minúsculas, números e hífen.');
  const ano = Number(meta.ano);
  if (!Number.isInteger(ano)) throw new Error(nomeArquivo + ': "ano" precisa ser um número.');
  if (meta.tipo && !TIPOS.includes(meta.tipo)) throw new Error(nomeArquivo + ': "tipo" deve ser norma, referencia ou apoio.');
  if (meta.pacote && !ID.test(meta.pacote)) throw new Error(nomeArquivo + ': "pacote" só pode ter letras minúsculas, números e hífen.');
  if (meta.revisao && !REVISOES.includes(meta.revisao)) throw new Error(nomeArquivo + ': "revisao" deve ser pendente ou conferido.');
  if (meta.url && !/^https?:\/\//.test(meta.url)) throw new Error(nomeArquivo + ': "url" deve começar com http:// ou https:// (ou apague a linha).');
  meta.tipo = meta.tipo || 'norma';

  const corpo = m[2].replace(/<!--[\s\S]*?-->/g, '');
  const trechos = [];
  for (const bloco of corpo.split(/^##[ \t]+/m).slice(1)) {
    const quebra = bloco.indexOf('\n');
    const referencia = (quebra === -1 ? bloco : bloco.slice(0, quebra)).trim();
    const texto = (quebra === -1 ? '' : bloco.slice(quebra + 1)).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).join(' ');
    if (!referencia) throw new Error(nomeArquivo + ': há um "##" sem referência.');
    if (!texto) throw new Error(nomeArquivo + ': o trecho "' + referencia + '" está sem texto.');
    const t = {
      id: meta.doc + '#' + (trechos.length + 1),
      doc: meta.doc,
      titulo: meta.titulo,
      norma: meta.norma,
      ano: ano,
      referencia: referencia,
      texto: texto
    };
    if (meta.tipo !== 'norma') t.tipo = meta.tipo;
    if (meta.pacote) t.pacote = meta.pacote;
    trechos.push(t);
  }
  if (!trechos.length) throw new Error(nomeArquivo + ': nenhum trecho ("## referência") encontrado.');
  return { meta: meta, trechos: trechos };
}

export function lerDocumento(markdown, nomeArquivo) {
  return lerDocumentoCompleto(markdown, nomeArquivo).trechos;
}

function lerPasta(pasta) {
  const arquivos = readdirSync(pasta).filter(function (f) { return f.endsWith('.md') && !f.startsWith('_'); }).sort();
  const docs = new Set();
  return arquivos.map(function (f) {
    const d = lerDocumentoCompleto(readFileSync(join(pasta, f), 'utf8'), f);
    if (docs.has(d.meta.doc)) throw new Error(f + ': o identificador "' + d.meta.doc + '" já foi usado em outro arquivo.');
    docs.add(d.meta.doc);
    return d;
  });
}

export function montarBase(pasta) {
  const todos = [];
  for (const d of lerPasta(pasta || PASTA)) todos.push.apply(todos, d.trechos);
  return todos;
}

// Lista do que está carregado (um item por documento).
export function montarCatalogo(pasta) {
  return lerPasta(pasta || PASTA).map(function (d) {
    const c = { doc: d.meta.doc, titulo: d.meta.titulo, norma: d.meta.norma, ano: Number(d.meta.ano), tipo: d.meta.tipo };
    if (d.meta.pacote) c.pacote = d.meta.pacote;
    if (d.meta.url) c.url = d.meta.url;
    if (d.meta.revisao) c.revisao = d.meta.revisao;
    c.trechos = d.trechos.length;
    c.caracteres = d.trechos.reduce(function (n, t) { return n + t.texto.length; }, 0);
    return c;
  });
}

// Coisas que não impedem o build, mas que alguém precisa olhar.
export function avisosDaBase(pasta) {
  const avisos = [];
  for (const d of lerPasta(pasta || PASTA)) {
    if (d.meta.revisao === 'pendente') avisos.push(d.meta.doc + ': aguardando conferência (troque "revisao: pendente" por "conferido" depois de comparar com o original; veja npm run conferir).');
    const vistas = new Set(), repetidas = new Set();
    for (const t of d.trechos) { if (vistas.has(t.referencia)) repetidas.add(t.referencia); vistas.add(t.referencia); }
    if (repetidas.size) avisos.push(d.meta.doc + ': referência repetida (' + Array.from(repetidas).slice(0, 3).join('; ') + '): duas fontes iguais não se distinguem na resposta.');
  }
  return avisos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = montarBase();
  writeFileSync(SAIDA, JSON.stringify(base, null, 2) + '\n');
  writeFileSync(SAIDA_CATALOGO, JSON.stringify(montarCatalogo(), null, 2) + '\n');
  console.log(base.length + ' trecho(s) em ' + new Set(base.map(function (x) { return x.doc; })).size + ' documento(s) → knowledge/conhecimento.json e catalogo.json');
  avisosDaBase().forEach(function (a) { console.log('ATENÇÃO: ' + a); });
}
