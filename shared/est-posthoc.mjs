// Comparações múltiplas (post hoc) no aparelho: Tukey HSD/Kramer, Bonferroni e Games-Howell, com pedido em português.
import { psiNorm, psiMencoes, psiNumericasUteis, psiPoucas, psiGrupos, psiMedia, psiVar, psiSoma, psiF, psiSemZero, psiP, psiPc, psiTabela, psiTSf2, psiTInv } from './psicometria.mjs';
import { estPTukey, estQTukey } from './est-nucleo.mjs';

const EST_NOMES = { tukey: 'Tukey HSD', bonferroni: 'Bonferroni', gameshowell: 'Games-Howell' };

// v: coluna numérica; g: coluna de grupos. metodo: 'tukey' | 'bonferroni' | 'gameshowell'
export function estPostHoc(v, g, metodo) {
  const gr = psiGrupos(v.valores, g);
  const idx = []; gr.dados.forEach(function (a, i) { if (a.length >= 2) idx.push(i); });
  const nomes = idx.map(function (i) { return gr.nomes[i]; }), gs = idx.map(function (i) { return gr.dados[i]; }), k = gs.length;
  if (k < 3) return '### Comparações múltiplas: ' + v.nome + ' por ' + g.nome + '\n\nO post hoc só faz sentido com 3 ou mais grupos (cada um com 2 casos ou mais). Com 2 grupos use o teste t.';
  const ns = gs.map(function (a) { return a.length; }), med = gs.map(psiMedia), vars = gs.map(psiVar), N = psiSoma(ns), glw = N - k;
  const msw = psiSoma(gs.map(function (a, i) { return (ns[i] - 1) * vars[i]; })) / glw;
  const m = k * (k - 1) / 2, alfa = 0.05;
  let qcrit = 0, tcrit = 0;
  if (metodo === 'tukey') qcrit = estQTukey(1 - alfa, k, glw);
  if (metodo === 'bonferroni') tcrit = psiTInv(alfa / m, glw);
  const linhas = [];
  for (let i = 0; i < k - 1; i++) for (let j = i + 1; j < k; j++) {
    const d = med[i] - med[j]; let ep, p, ic;
    if (metodo === 'gameshowell') {
      const a = vars[i] / ns[i], b = vars[j] / ns[j], gl = (a + b) * (a + b) / (a * a / (ns[i] - 1) + b * b / (ns[j] - 1));
      ep = Math.sqrt((a + b) / 2); p = 1 - estPTukey(Math.abs(d) / ep, k, gl); const qc = estQTukey(1 - alfa, k, gl); ic = [d - qc * ep, d + qc * ep];
    } else if (metodo === 'bonferroni') {
      ep = Math.sqrt(msw * (1 / ns[i] + 1 / ns[j])); p = Math.min(1, psiTSf2(Math.abs(d) / ep, glw) * m); ic = [d - tcrit * ep, d + tcrit * ep];
    } else {
      ep = Math.sqrt(msw / 2 * (1 / ns[i] + 1 / ns[j])); p = 1 - estPTukey(Math.abs(d) / ep, k, glw); ic = [d - qcrit * ep, d + qcrit * ep];
    }
    if (p < 0) p = 0;
    const dp = Math.sqrt(metodo === 'gameshowell' ? (vars[i] + vars[j]) / 2 : msw);
    linhas.push([nomes[i] + ' − ' + nomes[j], psiF(d), psiF(ic[0]), psiF(ic[1]), psiPc(p) + estSig(p), psiF(dp > 0 ? d / dp : NaN)]);
  }
  const sig = linhas.filter(function (l) { return /\*$/.test(l[4]); }).map(function (l) { return l[0]; });
  let t = '### Comparações múltiplas (' + EST_NOMES[metodo] + '): ' + v.nome + ' por ' + g.nome + '\n\n';
  t += psiTabela(['Grupo', 'n', 'Média', 'DP'], gs.map(function (a, i) { return [nomes[i], String(ns[i]), psiF(med[i]), psiF(Math.sqrt(vars[i]))]; }));
  t += '\n\n' + psiTabela(['Par', 'Diferença', 'IC95% inf.', 'IC95% sup.', 'p ajustado', 'd'], linhas);
  t += '\n\n' + (sig.length ? 'Diferenças significativas (p < ,05): ' + sig.join('; ') + '.' : 'Nenhum par difere de forma significativa (p ≥ ,05).');
  t += ' ' + (metodo === 'gameshowell' ? 'Games-Howell não supõe variâncias iguais nem n iguais (gl de Welch).' : metodo === 'bonferroni' ? 'Bonferroni multiplica o p de cada teste t por ' + m + ' (número de pares), com variância combinada (gl = ' + glw + ').' : 'Tukey-Kramer controla o erro tipo I nos ' + m + ' pares (variância combinada, gl = ' + glw + '; q crítico = ' + psiF(qcrit, 3) + ').');
  t += ' d = diferença ÷ desvio-padrão (' + (metodo === 'gameshowell' ? 'médio dos dois grupos' : 'combinado') + '). * p < ,05, ** p < ,01, *** p < ,001.';
  return t;
}
function estSig(p) { return p < 0.001 ? ' ***' : p < 0.01 ? ' **' : p < 0.05 ? ' *' : ''; }

const EST_POSTHOC = /\bpost.?hoc\b|\btukey\b|\bbonferroni\b|games.?howell|comparac\w+ (multiplas|par a par|dois a dois)|\bpar a par\b|dois a dois/;

// Pedido em português + tabela -> { texto, analise, avisos } ou null (quando não é post hoc ou falta informação).
export function estRespostaDoPedido(texto, tabela) {
  if (!tabela) return null;
  const n = psiNorm(texto).replace(/\s+/g, ' ');
  if (!EST_POSTHOC.test(n)) return null;
  const metodo = /games.?howell/.test(n) ? 'gameshowell' : /bonferroni/.test(n) ? 'bonferroni' : 'tukey';
  const men = psiMencoes(n, tabela), nums = psiNumericasUteis(tabela);
  const gm = men.filter(function (m) { return m.grupo; })[0];
  let g = gm ? gm.c : null;
  if (!g) { const c = men.map(function (m) { return m.c; }).filter(function (c) { return c.tipo === 'cat' || (psiPoucas(c) && c.nUnicos <= 8 && c.tipo === 'num'); }); g = c[0] || null; }
  if (!g) { const c = tabela.colunas.filter(function (c) { return c.tipo === 'cat' && psiPoucas(c); }); if (c.length === 1) g = c[0]; }
  const cab = 'Calculado neste aparelho, sem IA e sem rede: não gastou cota e a base não saiu daqui.';
  if (!g) return { texto: 'Para o post hoc preciso saber qual coluna define os grupos, ex.: "Tukey de ' + (nums[0] ? nums[0].nome : 'x') + ' por grupo".', analise: 'posthoc', avisos: [cab] };
  let vs = men.map(function (m) { return m.c; }).filter(function (c) { return c.tipo === 'num' && c !== g; });
  if (!vs.length) vs = nums.filter(function (c) { return c !== g && !psiPoucas(c); });
  if (!vs.length) return { texto: 'Não achei variável numérica para comparar entre os grupos de ' + g.nome + '. Cite a variável.', analise: 'posthoc', avisos: [cab] };
  if (vs.length > 6) return { texto: 'São muitas variáveis (' + vs.length + '); cite até 6.', analise: 'posthoc', avisos: [cab] };
  const ng = psiGrupos(vs[0].valores, g).nomes.length;
  if (ng > 10) return { texto: 'A coluna ' + g.nome + ' tem ' + ng + ' valores: parece contínua, não um grupo.', analise: 'posthoc', avisos: [cab] };
  return { texto: vs.map(function (v) { return estPostHoc(v, g, metodo); }).join('\n\n'), analise: 'posthoc', avisos: [cab].concat(tabela.avisos || []) };
}
