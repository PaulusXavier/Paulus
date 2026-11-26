// Gera shared/mapa-bairros.mjs: contagem de lugares por bairro e por categoria, tirada de knowledge/documentos/mapa-boa-vista-osm.md.
// O documento fica fora da base do Worker ("worker: nao", é grande); o Worker só precisa dos números, que cabem em poucos KB.
//   node scripts/gerar-mapa-bairros.mjs
// Rode de novo sempre que o documento do mapa for atualizado (scripts/importar-mapa.mjs).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(RAIZ, 'knowledge/documentos/mapa-boa-vista-osm.md'), 'utf8');

const chave = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const dataMapa = (/tirada do OpenStreetMap em (\d{4}-\d{2}-\d{2})/.exec(md) || [])[1] || '';
const resumo = /## Resumo do mapa\n([^\n]+)/.exec(md);
if (!resumo) throw new Error('Resumo do mapa não encontrado.');
const totalMapa = Number((/^(\d+) lugares/.exec(resumo[1]) || [])[1]);
const categorias = {};
const porCategoria = /Por categoria: ([^.]+)\./.exec(resumo[1]);
if (porCategoria) for (const par of porCategoria[1].split(';')) { const m = /^\s*(.+?)\s+(\d+)\s*$/.exec(par); if (m) categorias[m[1]] = Number(m[2]); }

// bairros: junta as grafias que só diferem em acento ou caixa (31 de março / 31 DE MARÇO; Caçari / Cacari) somando os lugares.
const bairros = new Map();
const re = /## Resumo do bairro (.+)\nO que tem no bairro .+? \((\d+) lugares? no mapa\): ([^\n]+)/g;
let m;
while ((m = re.exec(md))) {
  const nome = m[1].trim();
  const k = chave(nome);
  const cats = {};
  for (const par of m[3].replace(/\.$/, '').split(';')) { const x = /^\s*(.+?)\s+(\d+)\s*$/.exec(par); if (x) cats[x[1]] = Number(x[2]); }
  const b = bairros.get(k) || { nome, total: 0, cats: {}, grafias: [] };
  // prefere a grafia com acento e sem maiúsculas gritadas
  if (nome !== nome.toUpperCase() && /[À-ÿ]/.test(nome) && !/[À-ÿ]/.test(b.nome)) b.nome = nome;
  b.total += Number(m[2]);
  for (const [c, n] of Object.entries(cats)) b.cats[c] = (b.cats[c] || 0) + n;
  b.grafias.push(nome);
  bairros.set(k, b);
}
if (bairros.size < 50) throw new Error('Poucos bairros lidos (' + bairros.size + '): o formato do documento mudou?');

const saida = {};
for (const b of Array.from(bairros.values()).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))) saida[b.nome] = { t: b.total, c: b.cats };

const texto = '// GERADO por scripts/gerar-mapa-bairros.mjs a partir de knowledge/documentos/mapa-boa-vista-osm.md. Não edite à mão.\n' +
  '// Lugares com nome no OpenStreetMap, por bairro e categoria (mapa colaborativo: incompleto e pode estar desatualizado; não é cadastro oficial).\n' +
  'export const MAPA_BAIRROS = ' + JSON.stringify({ data: dataMapa, total: totalMapa, categorias: categorias, bairros: saida }) + ';\n';
writeFileSync(join(RAIZ, 'shared/mapa-bairros.mjs'), texto);
console.log('mapa-bairros.mjs:', bairros.size, 'bairros,', totalMapa, 'lugares,', Object.keys(categorias).length, 'categorias,', dataMapa);
