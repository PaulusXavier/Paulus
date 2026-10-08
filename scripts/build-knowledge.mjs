// Lê knowledge/documentos/*.md e gera knowledge/conhecimento.json (a base de normas do Paulus).
//
// Formato de cada .md:
//   ---
//   doc: nob-suas-2012                  (identificador curto, sem espaços)
//   titulo: NOB/SUAS 2012               (nome para mostrar)
//   norma: Resolução CNAS nº 33, ...    (a norma, por extenso)
//   ano: 2012
//   ---
//   ## art. 17, XV                       (a referência que será citada)
//   Texto do trecho, copiado da norma.   (um ou mais parágrafos; viram um texto só)
//
// Comentários <!-- ... --> são ignorados. Uso: npm run build:conhecimento

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'knowledge', 'documentos');
const SAIDA = join(RAIZ, 'knowledge', 'conhecimento.json');

export function lerDocumento(markdown, nomeArquivo) {
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
  if (!/^[a-z0-9][a-z0-9-]*$/.test(meta.doc)) throw new Error(nomeArquivo + ': "doc" só pode ter letras minúsculas, números e hífen.');
  const ano = Number(meta.ano);
  if (!Number.isInteger(ano)) throw new Error(nomeArquivo + ': "ano" precisa ser um número.');

  const corpo = m[2].replace(/<!--[\s\S]*?-->/g, '');
  const trechos = [];
  for (const bloco of corpo.split(/^##[ \t]+/m).slice(1)) {
    const quebra = bloco.indexOf('\n');
    const referencia = (quebra === -1 ? bloco : bloco.slice(0, quebra)).trim();
    const texto = (quebra === -1 ? '' : bloco.slice(quebra + 1)).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).join(' ');
    if (!referencia) throw new Error(nomeArquivo + ': há um "##" sem referência.');
    if (!texto) throw new Error(nomeArquivo + ': o trecho "' + referencia + '" está sem texto.');
    trechos.push({
      id: meta.doc + '#' + (trechos.length + 1),
      doc: meta.doc,
      titulo: meta.titulo,
      norma: meta.norma,
      ano: ano,
      referencia: referencia,
      texto: texto
    });
  }
  if (!trechos.length) throw new Error(nomeArquivo + ': nenhum trecho ("## referência") encontrado.');
  return trechos;
}

export function montarBase() {
  const arquivos = readdirSync(PASTA).filter(function (f) { return f.endsWith('.md') && !f.startsWith('_'); }).sort();
  const todos = [];
  const docs = new Set();
  for (const f of arquivos) {
    const trechos = lerDocumento(readFileSync(join(PASTA, f), 'utf8'), f);
    if (docs.has(trechos[0].doc)) throw new Error(f + ': o identificador "' + trechos[0].doc + '" já foi usado em outro arquivo.');
    docs.add(trechos[0].doc);
    todos.push.apply(todos, trechos);
  }
  return todos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = montarBase();
  writeFileSync(SAIDA, JSON.stringify(base, null, 2) + '\n');
  console.log(base.length + ' trecho(s) em ' + new Set(base.map(function (x) { return x.doc; })).size + ' documento(s) → knowledge/conhecimento.json');
}
