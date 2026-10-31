// Gera knowledge/documentos/paulus-roteiros-paf.md a partir das habilidades do PAF (habilidades/paf-*.md,
// plano-acompanhamento-familiar.md e paif-acompanhamento-familiar.md).
// Para quê: o Worker do Paulus usa as habilidades direto; os apps com IA própria (Umbrella) e o modo offline usam a base de
// conhecimento. Este documento põe os mesmos roteiros na base, com a etiqueta "prática sugerida", sem duplicar no Worker do Paulus
// (worker: nao). Rode de novo sempre que mudar uma dessas habilidades:  node scripts/gerar-roteiros-paf.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lerHabilidade } from '../shared/habilidades.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'habilidades');
const SAIDA = join(RAIZ, 'knowledge', 'documentos', 'paulus-roteiros-paf.md');
const MAX = 900;

const arquivos = readdirSync(PASTA)
  .filter(f => /^paf-.*\.md$/.test(f) || f === 'plano-acompanhamento-familiar.md' || f === 'paif-acompanhamento-familiar.md')
  .sort();

let md = `---
doc: paulus-roteiros-paf
titulo: Roteiros de trabalho do Paulus sobre o PAF (prática sugerida)
norma: Roteiros de trabalho do Paulus sobre o Plano de Acompanhamento Familiar no PAIF. Prática sugerida, não é norma: reflete orientações técnicas (MDS, CFP/CREPOP) e a prática de quem os escreveu. Gerado de habilidades/*.md por scripts/gerar-roteiros-paf.mjs
ano: 2026
tipo: apoio
revisao: pendente
worker: nao
---

<!-- GERADO por scripts/gerar-roteiros-paf.mjs. Não edite: mude a habilidade e rode o script. -->
`;
for (const f of arquivos) {
  const h = lerHabilidade(readFileSync(join(PASTA, f), 'utf8'), f);
  const linhas = h.instrucoes.split(/\r?\n/).map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  const partes = []; let atual = '';
  for (const l of linhas) {
    if (atual && (atual + ' ' + l).length > MAX) { partes.push(atual); atual = l; } else atual = atual ? atual + ' ' + l : l;
  }
  if (atual) partes.push(atual);
  partes.forEach((p, i) => { md += `\n## Roteiro: ${h.nome}${partes.length > 1 ? ' (parte ' + (i + 1) + ')' : ''}\n\n${p}\n`; });
}
writeFileSync(SAIDA, md);
console.log(arquivos.length + ' roteiros em ' + SAIDA);
