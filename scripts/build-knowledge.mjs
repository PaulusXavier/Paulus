// Gera a base de conhecimento a partir de knowledge/documentos/*.md:
//   knowledge/conhecimento.json  todos os trechos (navegador e apps)
//   knowledge/indice.json        índice de busca pré-calculado, só da base do Worker
//   knowledge/worker-base.json   base compacta do Worker (sem os documentos com "worker: nao")
//   knowledge/catalogo.json      lista do que está carregado (versionada; a ficha do Paulus sobre si mesmo usa)
//
// Uso: npm run build:conhecimento   (o pretest, o build e o wrangler também rodam)
// Formato dos documentos: docs/CONHECIMENTO.md. Este arquivo também exporta o leitor usado por conferir.mjs e pelos testes.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { criarIndice, serializarIndice } from '../shared/busca.mjs';
import { compactarBase, expandirBase } from '../shared/base-compacta.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_DOCUMENTOS = join(RAIZ, 'knowledge', 'documentos');
const SAIDA = join(RAIZ, 'knowledge');

const TIPOS = ['norma', 'referencia', 'apoio'];
const REVISOES = ['pendente', 'conferido'];
const RE_ID = /^[a-z0-9][a-z0-9-]*$/;

// Lê um documento .md e devolve { meta, trechos }. Lança erro claro quando o arquivo está errado.
export function lerDocumentoCompleto(md, arquivo) {
  const nome = arquivo || 'documento.md';
  const texto = String(md == null ? '' : md).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(texto);
  if (!m) throw new Error(nome + ': falta `doc` no começo do arquivo (bloco "---" com doc, titulo, norma e ano). Roteiros ficam em habilidades/, não aqui.');
  const campos = {};
  for (const linha of m[1].split('\n')) {
    const c = /^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(linha);
    if (c) campos[c[1].toLowerCase()] = c[2];
  }
  if (!campos.doc) throw new Error(nome + ': falta `doc` no começo do arquivo.');
  if (!RE_ID.test(campos.doc)) throw new Error(nome + ': doc "' + campos.doc + '" inválido (use minúsculas, números e hífen).');
  for (const k of ['titulo', 'norma']) if (!campos[k]) throw new Error(nome + ': falta `' + k + '` no começo do arquivo.');
  const ano = Number(campos.ano);
  if (!campos.ano || !Number.isInteger(ano) || ano < 1000 || ano > 3000) throw new Error(nome + ': `ano` inválido ("' + (campos.ano || '') + '").');
  if (campos.tipo !== undefined && TIPOS.indexOf(campos.tipo) < 0) throw new Error(nome + ': tipo "' + campos.tipo + '" inválido (use ' + TIPOS.join(', ') + ').');
  if (campos.pacote !== undefined && !RE_ID.test(campos.pacote)) throw new Error(nome + ': pacote "' + campos.pacote + '" inválido (minúsculas, números e hífen).');
  if (campos.revisao !== undefined && REVISOES.indexOf(campos.revisao) < 0) throw new Error(nome + ': revisao "' + campos.revisao + '" inválida (use ' + REVISOES.join(' ou ') + ').');
  if (campos.url !== undefined && !/^https?:\/\/\S+$/.test(campos.url)) throw new Error(nome + ': url "' + campos.url + '" inválida (precisa começar com http:// ou https://).');
  if (campos.worker !== undefined && ['sim', 'nao'].indexOf(campos.worker) < 0) throw new Error(nome + ': worker "' + campos.worker + '" inválido (use sim ou nao).');

  const meta = { doc: campos.doc, titulo: campos.titulo, norma: campos.norma, ano: ano, tipo: campos.tipo || 'norma' };
  if (campos.pacote) meta.pacote = campos.pacote;
  if (campos.url) meta.url = campos.url;
  if (campos.worker) meta.worker = campos.worker;
  if (campos.revisao) meta.revisao = campos.revisao;

  const corpo = texto.slice(m[0].length).replace(/<!--[\s\S]*?-->/g, '');
  const trechos = [];
  let atual = null;
  function fechar() {
    if (!atual) return;
    const t = atual.linhas.join(' ').replace(/\s+/g, ' ').trim();
    if (t) {
      const c = { id: meta.doc + '#' + (trechos.length + 1), doc: meta.doc, titulo: meta.titulo, norma: meta.norma, ano: meta.ano, referencia: atual.ref, texto: t };
      if (campos.tipo && campos.tipo !== 'norma') c.tipo = campos.tipo;
      if (meta.pacote) c.pacote = meta.pacote;
      trechos.push(c);
    }
    atual = null;
  }
  for (const linha of corpo.split('\n')) {
    const h = /^##[ \t]+(\S.*?)[ \t]*$/.exec(linha);
    if (h) { fechar(); atual = { ref: h[1], linhas: [] }; continue; }
    if (atual) atual.linhas.push(linha);
  }
  fechar();
  if (!trechos.length) throw new Error(nome + ': nenhum trecho (use "## referência" antes de cada texto).');
  return { meta: meta, trechos: trechos };
}

export function lerDocumento(md, arquivo) {
  return lerDocumentoCompleto(md, arquivo).trechos;
}

function arquivosDe(pasta) {
  return readdirSync(pasta).filter(function (f) { return f.endsWith('.md') && f[0] !== '_'; }).sort();
}

function lerPasta(pasta) {
  return arquivosDe(pasta).map(function (f) { return lerDocumentoCompleto(readFileSync(join(pasta, f), 'utf8'), f); });
}

// Todos os trechos, na ordem dos arquivos.
export function montarBase(pasta) {
  const base = [];
  for (const d of lerPasta(pasta || PASTA_DOCUMENTOS)) for (const t of d.trechos) base.push(t);
  return base;
}

// Um item por documento (ordem do nome do arquivo): o que está carregado e o que ainda falta conferir.
export function montarCatalogo(pasta) {
  return lerPasta(pasta || PASTA_DOCUMENTOS).map(function (d) {
    const c = { doc: d.meta.doc, titulo: d.meta.titulo, norma: d.meta.norma, ano: d.meta.ano, tipo: d.meta.tipo };
    if (d.meta.pacote) c.pacote = d.meta.pacote;
    if (d.meta.url) c.url = d.meta.url;
    if (d.meta.worker) c.worker = d.meta.worker;
    if (d.meta.revisao) c.revisao = d.meta.revisao;
    c.trechos = d.trechos.length;
    c.caracteres = d.trechos.reduce(function (s, t) { return s + t.texto.length; }, 0);
    return c;
  });
}

// Avisos para quem mantém a base: conferência pendente e referências repetidas dentro do mesmo documento.
export function avisosDaBase(pasta) {
  const avisos = [];
  for (const d of lerPasta(pasta || PASTA_DOCUMENTOS)) {
    if (d.meta.revisao === 'pendente') avisos.push(d.meta.doc + ': aguardando conferência com o documento oficial (npm run conferir -- ' + d.meta.doc + ').');
    const vistas = new Set(), repetidas = new Set();
    for (const t of d.trechos) { if (vistas.has(t.referencia)) repetidas.add(t.referencia); vistas.add(t.referencia); }
    if (repetidas.size) avisos.push(d.meta.doc + ': referência repetida (' + Array.from(repetidas).slice(0, 5).join('; ') + (repetidas.size > 5 ? '; …' : '') + '). Citar fica ambíguo.');
  }
  return avisos;
}

// Gera os quatro arquivos. Os documentos com "worker: nao" ficam só no conhecimento.json (pacotes offline).
export function construirConhecimento(pasta, saida) {
  const origem = pasta || PASTA_DOCUMENTOS;
  const destino = saida || SAIDA;
  const docs = lerPasta(origem);
  const base = [];
  const paraWorker = [];
  for (const d of docs) for (const t of d.trechos) { base.push(t); if (d.meta.worker !== 'nao') paraWorker.push(t); }
  const compacta = compactarBase(paraWorker);
  // o índice é calculado sobre a base como o Worker a enxerga (textos cortados em MAX_TEXTO_TRECHO), senão a assinatura não bate
  const indice = serializarIndice(criarIndice(expandirBase(compacta)));
  const catalogo = montarCatalogo(origem);
  writeFileSync(join(destino, 'conhecimento.json'), JSON.stringify(base));
  writeFileSync(join(destino, 'worker-base.json'), JSON.stringify(compacta));
  writeFileSync(join(destino, 'indice.json'), JSON.stringify(indice));
  writeFileSync(join(destino, 'catalogo.json'), JSON.stringify(catalogo, null, 2) + '\n');
  return { documentos: docs.length, trechos: base.length, trechosWorker: paraWorker.length, avisos: avisosDaBase(origem) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(PASTA_DOCUMENTOS)) { console.error('Não achei ' + PASTA_DOCUMENTOS); process.exit(1); }
  const r = construirConhecimento();
  console.log('Base: ' + r.documentos + ' documentos, ' + r.trechos + ' trechos (' + r.trechosWorker + ' no Worker).');
  for (const a of r.avisos) console.log('ATENÇÃO: ' + a);
}
