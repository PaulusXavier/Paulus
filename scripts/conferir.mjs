// Ajuda a conferir um documento importado: mostra trechos espalhados (começo, meio e fim) para comparar com o PDF.
//
//   npm run conferir -- cfp-ref-cras               mostra 8 trechos com a referência (página) de cada um
//   npm run conferir -- cfp-ref-cras --quantos 12  mostra 12
//   npm run conferir -- cfp-ref-cras --conferido   troca "revisao: pendente" por "revisao: conferido" no .md
//
// Estando tudo certo na amostra, marque como conferido: o aviso "aguardando conferência" do build some.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lerDocumentoCompleto } from './build-knowledge.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Índices de `quantos` itens espalhados de 0 a total-1, sempre com o primeiro e o último.
export function amostrar(total, quantos) {
  if (!(total > 0) || !(quantos > 0)) return [];
  if (quantos >= total) return Array.from({ length: total }, function (_, i) { return i; });
  if (quantos === 1) return [0];
  const idx = [];
  for (let i = 0; i < quantos; i++) idx.push(Math.round(i * (total - 1) / (quantos - 1)));
  return Array.from(new Set(idx));
}

// Devolve { md, mudou }. Sem a linha "revisao:", acrescenta; se já está conferido, não muda nada.
export function marcarConferido(md) {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(md.replace(/^﻿/, ''));
  if (!m) throw new Error('O arquivo não começa com o bloco "---".');
  const linhas = m[2].split(/\r?\n/);
  const i = linhas.findIndex(function (l) { return /^revisao\s*:/.test(l); });
  if (i >= 0) {
    if (/^revisao\s*:\s*conferido\s*$/.test(linhas[i])) return { md: md, mudou: false };
    linhas[i] = 'revisao: conferido';
  } else linhas.push('revisao: conferido');
  const inicio = md.indexOf(m[0]);
  return { md: md.slice(0, inicio) + m[1] + linhas.join('\n') + m[3] + md.slice(inicio + m[0].length), mudou: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const doc = args.find(function (a) { return a.indexOf('--') !== 0 && args[args.indexOf(a) - 1] !== '--quantos'; });
  if (!doc || !/^[a-z0-9][a-z0-9-]*$/.test(doc)) { console.error('Uso: npm run conferir -- <doc> [--quantos 8] [--conferido]'); process.exit(1); }
  const caminho = join(RAIZ, 'knowledge', 'documentos', doc + '.md');
  if (!existsSync(caminho)) { console.error('Não achei ' + caminho); process.exit(1); }
  const md = readFileSync(caminho, 'utf8');
  if (args.includes('--conferido')) {
    const r = marcarConferido(md);
    if (r.mudou) writeFileSync(caminho, r.md);
    console.log(doc + (r.mudou ? ': marcado como conferido. Rode npm run build:conhecimento.' : ': já estava conferido.'));
  } else {
    const d = lerDocumentoCompleto(md, doc + '.md');
    const q = Number(args[args.indexOf('--quantos') + 1]) || 8;
    console.log(d.meta.titulo + ' (' + d.trechos.length + ' trechos; revisão: ' + (d.meta.revisao || 'sem marcação') + ')\n');
    for (const i of amostrar(d.trechos.length, q)) {
      const t = d.trechos[i];
      console.log('[' + (i + 1) + '/' + d.trechos.length + '] ' + t.referencia + '\n' + t.texto.slice(0, 400) + (t.texto.length > 400 ? ' […]' : '') + '\n');
    }
    console.log('Compare com o original (a página citada, o começo e o fim do trecho). Estando certo: npm run conferir -- ' + doc + ' --conferido');
  }
}
