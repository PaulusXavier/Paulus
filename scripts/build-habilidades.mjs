// Lê habilidades/*.md e gera knowledge/habilidades.json (usado pelo Worker). Uso: npm run build:habilidades
// Para ensinar uma habilidade nova ao Paulus, crie um arquivo em habilidades/ (veja docs/HABILIDADES.md) e rode este script.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lerHabilidade } from '../shared/habilidades.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'habilidades');
const SAIDA = join(RAIZ, 'knowledge', 'habilidades.json');

export function lerTodas() {
  const arquivos = readdirSync(PASTA).filter(function (f) { return f.endsWith('.md') && f !== 'LEIA-ME.md'; }).sort();
  const lista = arquivos.map(function (f) {
    const h = lerHabilidade(readFileSync(join(PASTA, f), 'utf8'), f);
    if (f !== h.id + '.md') throw new Error(f + ': o nome do arquivo deve ser "' + h.id + '.md" (igual ao id).');
    return h;
  });
  const vistos = new Set();
  for (const h of lista) {
    if (vistos.has(h.id)) throw new Error('id repetido: ' + h.id);
    vistos.add(h.id);
  }
  return lista;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lista = lerTodas();
  writeFileSync(SAIDA, JSON.stringify(lista));
  console.log(lista.length + ' habilidades em knowledge/habilidades.json:');
  for (const h of lista) console.log('  - ' + h.id + ' (' + h.nome + ')' + (h.apps.length ? ' [' + h.apps.join(', ') + ']' : ''));
}
