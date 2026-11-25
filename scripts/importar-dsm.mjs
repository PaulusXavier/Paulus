// Importa o texto (pdftotext) do DSM-5-TR em português como documento da base, por TRANSTORNO e por SEÇÃO,
// guardando só o que o Paulus usa para estudo, e cortando o resto para poupar o limite de tamanho do Worker.
//
//   node scripts/importar-dsm.mjs dsm.txt [--secoes criterios,diferencial,diagnosticas,comorbidade,curso,prevalencia]
//                                         [--max 680] [--worker] [--saida knowledge/documentos/dsm5tr-completo.md]
//
// Padrão: --secoes criterios,diferencial (o essencial; ~40% do texto do capítulo de transtornos).
// Sem --worker o documento sai com "worker: nao" (fica só nos pacotes offline, fora do Worker).
// ATENÇÃO: o DSM-5-TR é obra protegida. Mantenha o resultado fora de repositório público e fora do dist/ (não use "pacote").

import { readFileSync, writeFileSync } from 'node:fs';

const NOMES = {
  criterios: /^Critérios Diagnósticos( [A-Z][0-9A-Z.]+)?$/,
  diagnosticas: /^Características Diagnósticas$/,
  associadas: /^Características Associadas[\s\S]*$/,
  prevalencia: /^Prevalência$/,
  curso: /^Desenvolvimento e Curso$/,
  risco: /^Fatores de Risco e Prognóstico$/,
  cultura: /^Questões Diagnósticas Relativas à Cultura$/,
  genero: /^Questões Diagnósticas Relativas ao Sexo e ao Gênero$/,
  marcadores: /^Marcadores Diagnósticos$/,
  consequencias: /^Consequências Funcionais.*$/,
  diferencial: /^Diagnóstico Diferencial$/,
  comorbidade: /^Comorbidade$/,
};
const ROTULO = { criterios: 'Critérios', diagnosticas: 'Características diagnósticas', diferencial: 'Diagnóstico diferencial', comorbidade: 'Comorbidade', curso: 'Desenvolvimento e curso', prevalencia: 'Prevalência', associadas: 'Características associadas', risco: 'Risco e prognóstico', cultura: 'Cultura', genero: 'Sexo e gênero', marcadores: 'Marcadores', consequencias: 'Consequências funcionais' };

const args = process.argv.slice(2);
const arquivo = args[0];
const opc = (nome, padrao) => { const i = args.indexOf('--' + nome); return i >= 0 && args[i + 1] ? args[i + 1] : padrao; };
const secoes = opc('secoes', 'criterios,diferencial').split(',').map((s) => s.trim());
const MAX = Number(opc('max', 680));
const saida = opc('saida', 'knowledge/documentos/dsm5tr-completo.md');
const noWorker = !args.includes('--worker');

const linhas = readFileSync(arquivo, 'utf8').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
const ehCriterio = (l) => NOMES.criterios.test(l);

// 1) acha cada início "Critérios Diagnósticos" e o título (1 ou 2 linhas curtas antes dele)
const inicios = [];
for (let i = 0; i < linhas.length; i++) {
  if (!ehCriterio(linhas[i]) || i < 4000) continue;
  let j = i - 1;
  while (j >= 0 && !linhas[j]) j--;
  const partes = [linhas[j]];
  let k = j - 1;
  while (k >= 0 && !linhas[k]) k--;
  if (k >= 0 && linhas[k].length < 70 && !/[.;:,]$/.test(linhas[k]) && linhas[j].length < 70 && !/^(Critérios|Características|Prevalência|Comorbidade|Diagnóstico)/.test(linhas[k])) partes.unshift(linhas[k]);
  inicios.push({ linha: i, titulo: partes.join(' ').replace(/\s+/g, ' ').trim(), tituloDe: k >= 0 && partes.length === 2 ? k : j });
}
if (!inicios.length) { console.error('Não achei "Critérios Diagnósticos". O arquivo é o texto do DSM-5-TR em português?'); process.exit(1); }

// 2) fim do capítulo de transtornos (último bloco não pode engolir a seção III e os apêndices)
let fimGeral = linhas.length;
for (let i = inicios[inicios.length - 1].linha; i < linhas.length; i++) {
  if (/^(Transtornos do Movimento Induzidos por Medicamentos|Outras Condições que Podem ser Foco)/.test(linhas[i])) { fimGeral = i; break; }
}

// 3) para cada transtorno, separa as seções e guarda as pedidas
const paragrafos = (texto) => {
  const out = [];
  let atual = '';
  for (const l of texto) {
    if (!l) { if (atual) { out.push(atual); atual = ''; } continue; }
    if (/^([A-H]|\d{1,2}|[a-h])\.\s/.test(l) || /^(Especificar|Nota|Determinar|Subtipos|Procedimentos)/.test(l)) { if (atual) out.push(atual); atual = l; continue; }
    atual += (atual && !atual.endsWith('-') ? ' ' : '') + l;
  }
  if (atual) out.push(atual);
  return out;
};
const dividir = (p) => {
  if (p.length <= MAX) return [p];
  const frases = p.split(/(?<=[.;:])\s+/);
  const out = [];
  let a = '';
  for (const f of frases) {
    if (f.length > MAX) { if (a) { out.push(a); a = ''; } for (let i = 0; i < f.length; i += MAX) out.push(f.slice(i, i + MAX)); continue; }
    if ((a + ' ' + f).trim().length > MAX) { out.push(a); a = f; } else a = (a + ' ' + f).trim();
  }
  if (a) out.push(a);
  return out;
};
const empacotar = (texto) => {
  const chunks = [];
  let a = '';
  for (const p of paragrafos(texto).flatMap(dividir)) {
    if ((a + '\n' + p).trim().length > MAX) { if (a) chunks.push(a); a = p; } else a = (a ? a + '\n' : '') + p;
  }
  if (a) chunks.push(a);
  return chunks;
};

const saidaMd = [];
let total = 0;
const porDisturbio = new Map();
inicios.forEach((ini, n) => {
  const fim = n + 1 < inicios.length ? inicios[n + 1].tituloDe : fimGeral;
  const bloco = linhas.slice(ini.linha, fim);
  const cortes = [];
  bloco.forEach((l, i) => { for (const [nome, re] of Object.entries(NOMES)) if (re.test(l) && (i === 0 || !bloco[i - 1] || nome !== 'criterios')) { cortes.push({ i, nome }); break; } });
  cortes.forEach((c, k) => {
    if (!secoes.includes(c.nome)) return;
    const texto = bloco.slice(c.i + 1, k + 1 < cortes.length ? cortes[k + 1].i : bloco.length);
    const trechos = empacotar(texto);
    trechos.forEach((t, m) => {
      const cod = (ini.linha && /\b([A-Z]\d{2}(?:\.[0-9A-Z]+)?)$/.exec(linhas[ini.linha])) || null;
      const rotulo = ini.titulo + (cod ? ' ' + cod[1] : '') + ' · ' + ROTULO[c.nome] + (trechos.length > 1 ? ' (parte ' + (m + 1) + ')' : '');
      saidaMd.push('## ' + rotulo + '\n' + t + '\n');
      total += t.length;
    });
    porDisturbio.set(ini.titulo, (porDisturbio.get(ini.titulo) || 0) + trechos.length);
  });
});

const cab = [
  '---', 'doc: dsm5tr-completo', 'titulo: DSM-5-TR (seções escolhidas: ' + secoes.join(', ') + ')',
  'norma: American Psychiatric Association. Manual Diagnóstico e Estatístico de Transtornos Mentais, 5ª ed., texto revisado (DSM-5-TR), versão em português. Uso interno; obra protegida.',
  'ano: 2022', 'tipo: referencia', noWorker ? 'worker: nao' : null, 'revisao: pendente', '---', '',
  '<!-- Gerado por scripts/importar-dsm.mjs. Não publique em repositório aberto nem em dist/. -->', '',
].filter((x) => x !== null);
writeFileSync(saida, cab.join('\n') + saidaMd.join('\n'));
console.log('Transtornos: ' + inicios.length + ' · trechos: ' + saidaMd.length + ' · ' + Math.round(total / 1024) + ' KB de texto · seções: ' + secoes.join(', ') + (noWorker ? ' · worker: nao' : ' · vai para o Worker'));
console.log('Exemplos:\n' + saidaMd.slice(0, 3).map((s) => s.split('\n')[0]).join('\n'));
