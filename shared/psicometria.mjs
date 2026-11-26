// Análises psicométricas e estatísticas "estilo SPSS", feitas inteiramente no aparelho: sem IA, sem rede, sem gastar cota.
// FONTE ÚNICA: navegador (via build) e testes. Nomes com prefixo "psi" (no navegador os módulos viram um arquivo só).
//
//   psiLerTabela(texto)                 -> { colunas:[{nome,tipo,valores,...}], n, avisos } ou null (o texto não parece uma tabela de dados)
//   psiRespostaDoPedido(texto, tabela)  -> { texto, analise, avisos } ou null (o pedido não é uma análise de dados)
//   psiMenu(tabela)                     -> texto com o resumo da base e o que dá para pedir
//
// Cobre: descritivas e normalidade (Shapiro-Wilk), frequências, confiabilidade (alfa de Cronbach, ômega, item-total, alfa se excluído,
// metades), correlação (Pearson, Spearman), teste t (independente com Levene, Welch, pareado), ANOVA com Bonferroni, Mann-Whitney,
// Kruskal-Wallis, Wilcoxon, qui-quadrado (V de Cramér), regressão linear múltipla (beta, VIF) e análise fatorial exploratória
// (KMO, Bartlett, análise paralela, componentes principais ou eixos principais, rotação varimax).
// Dados ausentes: exclusão listwise dentro de cada análise (como o SPSS). Base lida em memória; nada é guardado nem enviado.

// ------------------------------------------------------------------ distribuições

export function psiLgamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - psiLgamma(1 - x);
  x -= 1;
  let a = c[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function psiBetaCf(a, b, x) {
  const TINY = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 400; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}

// Beta incompleta regularizada I_x(a,b)
export function psiBetaInc(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(psiLgamma(a + b) - psiLgamma(a) - psiLgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * psiBetaCf(a, b, x) / a : 1 - bt * psiBetaCf(b, a, 1 - x) / b;
}

// Gama incompleta regularizada superior Q(a,x)
export function psiGamQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - psiLgamma(a));
  }
  const TINY = 1e-300; let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY; c = b + an / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - psiLgamma(a)) * h;
}

export function psiNormCdf(z) { const q = 0.5 * psiGamQ(0.5, z * z / 2); return z >= 0 ? 1 - q : q; }
export function psiNormSf(z) { return psiNormCdf(-z); }
export function psiNormInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 2; i++) { const e = psiNormCdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); }
  return x;
}
export function psiTSf2(t, df) { return psiBetaInc(df / 2, 0.5, df / (df + t * t)); }                 // p bilateral
export function psiFSf(f, d1, d2) { return f <= 0 ? 1 : psiBetaInc(d2 / 2, d1 / 2, d2 / (d2 + d1 * f)); }
export function psiChiSf(x, k) { return psiGamQ(k / 2, x / 2); }
export function psiTInv(p2, df) {                                                                          // t crítico bilateral (p2 = alfa bilateral), por bisseção
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (psiTSf2(m, df) > p2) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------ estatística básica

export function psiSoma(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
export function psiMedia(a) { return psiSoma(a) / a.length; }
export function psiVar(a) { const m = psiMedia(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? s / (a.length - 1) : NaN; }
export function psiDp(a) { return Math.sqrt(psiVar(a)); }
export function psiOrdena(a) { return a.slice().sort(function (x, y) { return x - y; }); }
export function psiMediana(a) { const s = psiOrdena(a), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
export function psiAssimetria(a) {
  const n = a.length; if (n < 3) return NaN; const m = psiMedia(a), s = psiDp(a); if (!(s > 0)) return NaN;
  let t = 0; for (let i = 0; i < n; i++) t += Math.pow((a[i] - m) / s, 3);
  return n / ((n - 1) * (n - 2)) * t;
}
export function psiCurtose(a) {
  const n = a.length; if (n < 4) return NaN; const m = psiMedia(a), s = psiDp(a); if (!(s > 0)) return NaN;
  let t = 0; for (let i = 0; i < n; i++) t += Math.pow((a[i] - m) / s, 4);
  return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * t - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
}
export function psiEpAssimetria(n) { return Math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3))); }
export function psiEpCurtose(n) { return 2 * psiEpAssimetria(n) * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5))); }
export function psiRanks(a) {
  const idx = a.map(function (v, i) { return i; }).sort(function (i, j) { return a[i] - a[j]; }), r = new Array(a.length);
  let i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = rk; i = j + 1; }
  return r;
}
export function psiTies(a) { const c = {}; a.forEach(function (v) { c[v] = (c[v] || 0) + 1; }); return Object.keys(c).map(function (k) { return c[k]; }); }
export function psiCov(x, y) { const mx = psiMedia(x), my = psiMedia(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my); return s / (x.length - 1); }
export function psiCorr(x, y) { const d = psiDp(x) * psiDp(y); return d > 0 ? psiCov(x, y) / d : NaN; }
export function psiPCorr(r, n) { if (!isFinite(r) || n < 3) return NaN; if (Math.abs(r) >= 1) return 0; return psiTSf2(r * Math.sqrt((n - 2) / (1 - r * r)), n - 2); }

// Shapiro-Wilk (Royston, 1995; n de 3 a 5000)
export function psiPoly(cc, x) { let r = cc[0]; if (cc.length > 1) { let p = x * cc[cc.length - 1]; for (let j = cc.length - 2; j >= 1; j--) p = (p + cc[j]) * x; r += p; } return r; }
export function psiShapiro(dados) {
  const n = dados.length; if (n < 3 || n > 5000) return null;
  const x = psiOrdena(dados), rango = x[n - 1] - x[0]; if (!(rango > 1e-19)) return null;
  const nn2 = Math.floor(n / 2), m = [];
  for (let i = 1; i <= nn2; i++) m[i] = psiNormInv((i - 0.375) / (n + 0.25));
  let w;
  if (n === 3) {
    const a = Math.SQRT1_2, xx = (x[0] + x[1] + x[2]) / 3; let ss = 0; for (let i = 0; i < 3; i++) ss += (x[i] - xx) * (x[i] - xx);
    const num = a * (x[2] - x[0]); w = num * num / ss;
    const pi6 = 1.90985931710274, stqr = 1.04719755119660; let p = pi6 * (Math.asin(Math.sqrt(w)) - stqr); if (p < 0) p = 0;
    return { W: w, p: p };
  }
  let summ2 = 0; for (let i = 1; i <= nn2; i++) summ2 += m[i] * m[i]; summ2 *= 2;
  const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n), a = [];
  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  a[1] = psiPoly(c1, rsn) - m[1] / ssumm2;
  let i1, fac;
  if (n > 5) { i1 = 3; a[2] = -m[2] / ssumm2 + psiPoly(c2, rsn); fac = Math.sqrt((summ2 - 2 * m[1] * m[1] - 2 * m[2] * m[2]) / (1 - 2 * a[1] * a[1] - 2 * a[2] * a[2])); }
  else { i1 = 2; fac = Math.sqrt((summ2 - 2 * m[1] * m[1]) / (1 - 2 * a[1] * a[1])); }
  for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac;
  const xm = psiMedia(x); let sa = 0, ssq = 0, num = 0;
  for (let i = 0; i < n; i++) ssq += (x[i] - xm) * (x[i] - xm);
  for (let i = 1; i <= nn2; i++) num += a[i] * (x[n - i] - x[i - 1]);
  w = num * num / ssq; if (w > 1) w = 1;
  const an = n; let y = Math.log(1 - w), mm, s;
  if (n <= 11) {
    const gamma = psiPoly([-2.273, 0.459], an); if (y >= gamma) return { W: w, p: 1e-99 };
    y = -Math.log(gamma - y); mm = psiPoly([0.544, -0.39978, 0.025054, -6.714e-4], an); s = Math.exp(psiPoly([1.3822, -0.77857, 0.062767, -0.0020322], an));
  } else {
    const xx = Math.log(an); mm = psiPoly([-1.5861, -0.31082, -0.083751, 0.0038915], xx); s = Math.exp(psiPoly([-0.4803, -0.082676, 0.0030302], xx));
  }
  void sa;
  return { W: w, p: psiNormSf((y - mm) / s) };
}

// ------------------------------------------------------------------ álgebra linear

export function psiInversa(A) {
  const n = A.length, M = A.map(function (r, i) { const l = r.slice(); for (let j = 0; j < n; j++) l.push(i === j ? 1 : 0); return l; });
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    const t = M[c]; M[c] = M[p]; M[p] = t;
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(function (r) { return r.slice(n); });
}
export function psiDet(A) {
  const n = A.length, M = A.map(function (r) { return r.slice(); }); let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return 0;
    if (p !== c) { const t = M[c]; M[c] = M[p]; M[p] = t; det = -det; }
    det *= M[c][c];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j < n; j++) M[r][j] -= f * M[c][j]; }
  }
  return det;
}
// Autovalores e autovetores de matriz simétrica (Jacobi). Devolve { valores (decrescente), vetores[j] = autovetor j }.
export function psiAutoSim(S) {
  const n = S.length, A = S.map(function (r) { return r.slice(); }), V = []; for (let i = 0; i < n; i++) { V.push(new Array(n).fill(0)); V[i][i] = 1; }
  for (let it = 0; it < 100; it++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const ord = A.map(function (r, i) { return i; }).sort(function (i, j) { return A[j][j] - A[i][i]; });
  return { valores: ord.map(function (i) { return A[i][i]; }), vetores: ord.map(function (i) { return V.map(function (r) { return r[i]; }); }) };
}
export function psiMatrizCorr(cols) { const k = cols.length; return cols.map(function (a, i) { return cols.map(function (b, j) { return i === j ? 1 : psiCorr(a, b); }); }); }

// ------------------------------------------------------------------ leitura da tabela

const PSI_PII = /^(nome|name|cpf|rg|nis|nit|cns|telefone|fone|celular|email|e-mail|endereco|logradouro|mae|pai|nome_completo|sobrenome|rua|cep)$|^(nome|cpf|nis|telefone|email|endereco)[ _]/;
const PSI_ID = /^(id|codigo|cod|n|no|numero|num|participante|sujeito|caso|linha|registro|protocolo)$/;

export function psiSemAcentos(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function psiNorm(s) { return psiSemAcentos(s).toLowerCase().trim(); }
export function psiEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function psiDividirLinha(l, d) {
  const out = []; let cur = '', asp = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (asp && l[i + 1] === '"') { cur += '"'; i++; } else asp = !asp; }
    else if (ch === d && !asp) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out.map(function (c) { return c.trim(); });
}
export function psiNumero(s, virgula) {
  let t = String(s).trim(); if (!t) return NaN;
  if (virgula) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return parseFloat(t);
}

export function psiLerTabela(texto) {
  const linhas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  if (linhas.length < 4) return null;
  const amostra = linhas.slice(0, 12);
  let d = null, melhor = 0;
  [';', '\t', ',', '|'].forEach(function (c) {
    const cs = amostra.map(function (l) { return psiDividirLinha(l, c).length; });
    const moda = cs[0]; if (moda < 2) return;
    const ok = cs.filter(function (x) { return x === moda; }).length;
    if (ok >= Math.ceil(amostra.length * 0.8) && moda > melhor) { melhor = moda; d = c; }
  });
  if (!d) return null;
  const linhasCels = linhas.map(function (l) { return psiDividirLinha(l, d); });
  const k = linhasCels[0].length;
  const virgula = d !== ',' && linhasCels.slice(0, 40).some(function (r) { return r.some(function (c) { return /^[-+]?\d+,\d+$/.test(c); }); });
  const ehNum = function (c) { return c === '' || isFinite(psiNumero(c, virgula)); };
  const temCab = linhasCels[0].some(function (c) { return !ehNum(c); }) || linhasCels[0].every(function (c) { return c !== '' && !isFinite(psiNumero(c, virgula)); });
  const nomes = temCab ? linhasCels[0].map(function (c, i) { return c || ('v' + (i + 1)); }) : linhasCels[0].map(function (c, i) { return 'v' + (i + 1); });
  const corpo = linhasCels.slice(temCab ? 1 : 0).filter(function (r) { return r.length === k; });
  if (corpo.length < 3) return null;
  const AUS = /^(|na|n\/a|nan|null|-|--|\.|ns|nr)$/i;
  const avisos = [], colunas = [];
  for (let j = 0; j < k; j++) {
    const brutos = corpo.map(function (r) { return r[j]; });
    const preenchidos = brutos.filter(function (c) { return !AUS.test(c); });
    const nums = preenchidos.map(function (c) { return psiNumero(c, virgula); });
    const numerica = preenchidos.length > 0 && nums.every(function (x) { return isFinite(x); });
    const nome = nomes[j], nnorm = psiNorm(nome);
    const col = { nome: nome, norm: nnorm, indice: j, pii: PSI_PII.test(nnorm), id: PSI_ID.test(nnorm) };
    if (numerica) {
      col.tipo = 'num'; col.valores = brutos.map(function (c) { return AUS.test(c) ? NaN : psiNumero(c, virgula); });
      const unicos = {}; nums.forEach(function (x) { unicos[x] = 1; }); col.nUnicos = Object.keys(unicos).length;
    } else {
      col.tipo = 'cat'; col.valores = brutos.map(function (c) { return AUS.test(c) ? null : c; });
      const unicos = {}; col.valores.forEach(function (x) { if (x != null) unicos[x] = 1; }); col.nUnicos = Object.keys(unicos).length;
    }
    colunas.push(col);
  }
  if (!colunas.some(function (c) { return c.tipo === 'num' && !c.pii; })) return null;
  if (!temCab) avisos.push('Não achei linha de títulos: chamei as colunas de v1, v2...');
  colunas.filter(function (c) { return c.pii; }).forEach(function (c) { avisos.push('A coluna "' + c.nome + '" parece identificar pessoas: não entra em nenhuma análise.'); });
  return { colunas: colunas.filter(function (c) { return !c.pii; }), n: corpo.length, avisos: avisos };
}

// ------------------------------------------------------------------ formatação

export function psiF(x, d) {
  if (x == null || !isFinite(x)) return '–';
  d = d == null ? 2 : d; let s = Math.abs(x) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : x.toFixed(d);
  return s.replace('.', ',').replace('-0,' + '0'.repeat(d), '0,' + '0'.repeat(d));
}
export function psiSemZero(x, d) { return psiF(x, d == null ? 2 : d).replace(/^(-?)0,/, '$1,'); }   // APA: r, p, alfa sem o zero antes da vírgula
export function psiP(p) { if (p == null || !isFinite(p)) return '–'; return p < 0.001 ? '< ,001' : '= ' + psiSemZero(p, 3); }
export function psiPc(p) { if (p == null || !isFinite(p)) return '–'; return p < 0.001 ? '< ,001' : psiSemZero(p, 3); }
export function psiTabela(cab, linhas) {
  return '| ' + cab.join(' | ') + ' |\n|' + cab.map(function (c, i) { return i === 0 ? ' --- ' : ' ---: '; }).join('|') + '|\n' + linhas.map(function (l) { return '| ' + l.join(' | ') + ' |'; }).join('\n');
}
export function psiSig(p) { return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : ''; }

// ------------------------------------------------------------------ análises

export function psiCompletas(cols) {                                                                       // exclusão listwise entre colunas numéricas
  const n = cols[0].valores.length, ok = [];
  for (let i = 0; i < n; i++) if (cols.every(function (c) { return isFinite(c.valores[i]); })) ok.push(i);
  return { idx: ok, dados: cols.map(function (c) { return ok.map(function (i) { return c.valores[i]; }); }) };
}
export function psiNivelR(r) { const a = Math.abs(r); return a < 0.1 ? 'desprezível' : a < 0.3 ? 'pequena' : a < 0.5 ? 'moderada' : 'grande'; }
export function psiNivelD(d) { const a = Math.abs(d); return a < 0.2 ? 'desprezível' : a < 0.5 ? 'pequeno' : a < 0.8 ? 'moderado' : 'grande'; }
export function psiNivelEta(e) { return e < 0.01 ? 'desprezível' : e < 0.06 ? 'pequeno' : e < 0.14 ? 'moderado' : 'grande'; }
export function psiNivelAlfa(a) { return a < 0.6 ? 'inadequada' : a < 0.7 ? 'limítrofe' : a < 0.8 ? 'aceitável' : a < 0.9 ? 'boa' : 'excelente'; }
export function psiNivelKMO(k) { return k < 0.5 ? 'inaceitável' : k < 0.6 ? 'ruim' : k < 0.7 ? 'medíocre' : k < 0.8 ? 'mediano' : k < 0.9 ? 'bom' : 'ótimo'; }

export function psiDescritivas(cols) {
  const linhas = [], notas = [];
  cols.forEach(function (c) {
    const v = c.valores.filter(function (x) { return isFinite(x); }), n = v.length, perdidos = c.valores.length - n;
    if (n < 2) { linhas.push([c.nome, String(n), '–', '–', '–', '–', '–', '–', '–']); return; }
    const m = psiMedia(v), dp = psiDp(v), sw = psiShapiro(v), as = psiAssimetria(v), cu = psiCurtose(v);
    linhas.push([c.nome, String(n) + (perdidos ? ' (' + perdidos + ' ausentes)' : ''), psiF(m), psiF(dp), psiF(Math.min.apply(null, v)) + ' a ' + psiF(Math.max.apply(null, v)), psiF(psiMediana(v)), psiF(as), psiF(cu), sw ? 'W = ' + psiSemZero(sw.W, 3) + ', p ' + psiP(sw.p) : '–']);
    if (sw && sw.p < 0.05) notas.push(c.nome);
  });
  let t = '### Estatísticas descritivas\n\n' + psiTabela(['Variável', 'n', 'Média', 'DP', 'Mín. a máx.', 'Mediana', 'Assimetria', 'Curtose', 'Shapiro-Wilk'], linhas);
  t += '\n\nAssimetria e curtose próximas de 0 indicam distribuição simétrica; valores entre −1 e +1 são comuns em escalas bem comportadas, e valores acima de |2| (assimetria) ou |7| (curtose) sugerem desvio sério da normalidade.';
  if (notas.length) t += '\n\nShapiro-Wilk com p < ,05 em: ' + notas.slice(0, 12).join(', ') + (notas.length > 12 ? '...' : '') + '. Com amostras grandes o teste acusa desvios pequenos; olhe também a assimetria e a curtose. Para escalas Likert o desvio é esperado: prefira correlação de Spearman ou testes não paramétricos quando for o caso.';
  return t;
}

export function psiFrequencias(cols) {
  return cols.map(function (c) {
    const cont = {}; let n = 0;
    c.valores.forEach(function (x) { if (x == null || (typeof x === 'number' && !isFinite(x))) return; cont[x] = (cont[x] || 0) + 1; n++; });
    let ch = Object.keys(cont); if (c.tipo === 'num') ch.sort(function (a, b) { return a - b; }); else ch.sort(function (a, b) { return cont[b] - cont[a]; });
    const ausentes = c.valores.length - n; let ac = 0;
    const linhas = ch.slice(0, 30).map(function (k) { ac += cont[k]; return [k, String(cont[k]), psiF(cont[k] / n * 100, 1) + '%', psiF(ac / n * 100, 1) + '%']; });
    return '### Frequências: ' + c.nome + '\n\n' + psiTabela(['Categoria', 'n', '%', '% acumulado'], linhas) + (ch.length > 30 ? '\n\n(mostrei as 30 primeiras de ' + ch.length + ' categorias)' : '') + '\n\nn válido = ' + n + (ausentes ? '; ausentes = ' + ausentes : '') + '.';
  }).join('\n\n');
}

// Cargas de um fator pelo método dos eixos principais (usado no ômega)
export function psiPAF(R, nf, iter) {
  const p = R.length;
  const Ri = psiInversa(R);
  let h = R.map(function (r, i) { return Ri ? 1 - 1 / Ri[i][i] : 0.5; });
  let carg = null, auto = null;
  for (let it = 0; it < (iter || 200); it++) {
    const Rr = R.map(function (r, i) { return r.map(function (v, j) { return i === j ? h[i] : v; }); });
    auto = psiAutoSim(Rr);
    carg = []; for (let i = 0; i < p; i++) { carg.push([]); for (let f = 0; f < nf; f++) carg[i].push(auto.vetores[f][i] * Math.sqrt(Math.max(auto.valores[f], 0))); }
    const novo = carg.map(function (r) { return psiSoma(r.map(function (x) { return x * x; })); });
    const dif = Math.max.apply(null, novo.map(function (x, i) { return Math.abs(x - h[i]); }));
    h = novo.map(function (x) { return Math.min(x, 0.995); });
    if (dif < 1e-6) break;
  }
  return { cargas: carg, comunalidades: h, autovalores: auto.valores };
}

export function psiAlfaDe(cols) {
  const k = cols.length, n = cols[0].length, tot = [];
  for (let i = 0; i < n; i++) { let s = 0; cols.forEach(function (c) { s += c[i]; }); tot.push(s); }
  const somaVar = psiSoma(cols.map(psiVar)), vt = psiVar(tot);
  return { alfa: k / (k - 1) * (1 - somaVar / vt), tot: tot, vt: vt };
}

export function psiConfiabilidade(cols) {
  const comp = psiCompletas(cols), D = comp.dados, k = cols.length, n = comp.idx.length;
  if (k < 2) return 'Para o alfa de Cronbach preciso de pelo menos 2 itens (colunas numéricas).';
  if (n < 5) return 'Com ' + n + ' casos completos não dá para calcular a confiabilidade. Confira se há muitos valores ausentes.';
  const a = psiAlfaDe(D), R = psiMatrizCorr(D);
  let soma = 0, cnt = 0; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { soma += R[i][j]; cnt++; }
  const rm = soma / cnt, alfaPad = k * rm / (1 + (k - 1) * rm);
  const itens = cols.map(function (c, i) {
    const resto = a.tot.map(function (t, r) { return t - D[i][r]; }), rit = psiCorr(D[i], resto);
    const outros = D.filter(function (x, j) { return j !== i; }), ad = outros.length > 1 ? psiAlfaDe(outros).alfa : NaN;
    return { nome: c.nome, media: psiMedia(D[i]), dp: psiDp(D[i]), rit: rit, ad: ad };
  });
  let omega = null;
  try {
    if (k >= 3) { const f = psiPAF(R, 1); let sl = 0, sr = 0; f.cargas.forEach(function (c, i) { sl += Math.abs(c[0]); sr += 1 - f.comunalidades[i]; }); omega = sl * sl / (sl * sl + sr); }
  } catch (e) { omega = null; }
  // metades (pares e ímpares) com Spearman-Brown
  let sb = null;
  if (k >= 4) {
    const a1 = [], a2 = [];
    for (let r = 0; r < n; r++) { let s1 = 0, s2 = 0; D.forEach(function (c, i) { if (i % 2 === 0) s1 += c[r]; else s2 += c[r]; }); a1.push(s1); a2.push(s2); }
    const r12 = psiCorr(a1, a2); sb = { r: r12, sb: 2 * r12 / (1 + r12) };
  }
  const tot = a.tot;
  let t = '### Confiabilidade: alfa de Cronbach\n\n';
  t += 'Itens: ' + k + ' (' + cols.map(function (c) { return c.nome; }).join(', ') + '). Casos completos: ' + n + (n < cols[0].valores.length ? ' de ' + cols[0].valores.length + ' (exclusão listwise)' : '') + '.\n\n';
  t += psiTabela(['Medida', 'Valor'], [
    ['Alfa de Cronbach (α)', psiSemZero(a.alfa, 3)],
    ['Alfa padronizado', psiSemZero(alfaPad, 3)],
    ['Ômega total (ω, eixos principais)', omega == null ? '–' : psiSemZero(omega, 3)],
    ['Correlação média entre itens', psiSemZero(rm, 3)],
    ['Metades (pares × ímpares), Spearman-Brown', sb ? psiSemZero(sb.sb, 3) : '–'],
    ['Média da escala (soma dos itens)', psiF(psiMedia(tot)) + ' (DP = ' + psiF(psiDp(tot)) + ')']
  ]);
  t += '\n\n**Itens**\n\n' + psiTabela(['Item', 'Média', 'DP', 'Correlação item-total corrigida', 'α se o item for excluído'], itens.map(function (x) { return [x.nome, psiF(x.media), psiF(x.dp), psiSemZero(x.rit, 3), psiSemZero(x.ad, 3)]; }));
  t += '\n\n**Leitura.** α = ' + psiSemZero(a.alfa, 2) + ' indica consistência interna ' + psiNivelAlfa(a.alfa) + ' (referência usual: ≥ ,70 aceitável; ≥ ,80 boa).';
  if (a.alfa > 0.95) t += ' Valores acima de ,95 podem indicar itens redundantes.';
  const neg = itens.filter(function (x) { return x.rit < 0; }), fracos = itens.filter(function (x) { return x.rit >= 0 && x.rit < 0.3; }), melhora = itens.filter(function (x) { return x.ad > a.alfa + 0.005; });
  if (neg.length) t += '\n\n- Correlação item-total **negativa** em ' + neg.map(function (x) { return x.nome; }).join(', ') + ': provavelmente item de sentido invertido que ainda não foi recodificado, ou item que não pertence à escala. Inverta o item (soma do mínimo e do máximo menos o valor) antes de interpretar o alfa.';
  if (fracos.length) t += '\n- Correlação item-total abaixo de ,30 em ' + fracos.map(function (x) { return x.nome; }).join(', ') + ': contribuem pouco para a escala.';
  if (melhora.length) t += '\n- O alfa subiria se fossem excluídos: ' + melhora.map(function (x) { return x.nome + ' (→ ' + psiSemZero(x.ad, 3) + ')'; }).join(', ') + '. Decida pelo conteúdo do item, não só pelo número.';
  t += '\n\nO alfa pressupõe itens que medem uma só dimensão (confira com a análise fatorial) e tratados como numéricos; para itens com poucas categorias, o ômega (ou o alfa ordinal) costuma ser mais adequado.';
  return t;
}

export function psiParalela(n, p, reps) {                                                                  // análise paralela de Horn (gerador fixo: resultado reproduzível)
  let seed = 123456789;
  const rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const norm = function () { return Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()); };
  const acc = []; for (let i = 0; i < p; i++) acc.push([]);
  for (let r = 0; r < reps; r++) {
    const cols = []; for (let j = 0; j < p; j++) { const c = []; for (let i = 0; i < n; i++) c.push(norm()); cols.push(c); }
    const ev = psiAutoSim(psiMatrizCorr(cols)).valores; for (let i = 0; i < p; i++) acc[i].push(ev[i]);
  }
  return acc.map(function (a) { const s = psiOrdena(a); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; });
}

export function psiVarimax(L) {
  const p = L.length, m = L[0].length; if (m < 2) return { cargas: L.map(function (r) { return r.slice(); }), giros: 0 };
  const h = L.map(function (r) { return Math.sqrt(psiSoma(r.map(function (x) { return x * x; }))) || 1; });
  let A = L.map(function (r, i) { return r.map(function (x) { return x / h[i]; }); });
  for (let it = 0; it < 500; it++) {
    let mudou = 0;
    for (let a = 0; a < m - 1; a++) for (let b = a + 1; b < m; b++) {
      let sA = 0, sB = 0, sC = 0, sD = 0;
      for (let i = 0; i < p; i++) { const x = A[i][a], y = A[i][b], u = x * x - y * y, v = 2 * x * y; sA += u; sB += v; sC += u * u - v * v; sD += 2 * u * v; }
      const ang = Math.atan2(sD - 2 * sA * sB / p, sC - (sA * sA - sB * sB) / p) / 4;
      if (Math.abs(ang) > 1e-9) {
        const c = Math.cos(ang), s = Math.sin(ang); mudou = Math.max(mudou, Math.abs(ang));
        for (let i = 0; i < p; i++) { const x = A[i][a], y = A[i][b]; A[i][a] = c * x + s * y; A[i][b] = -s * x + c * y; }
      }
    }
    if (mudou < 1e-8) break;
  }
  A = A.map(function (r, i) { return r.map(function (x) { return x * h[i]; }); });
  return { cargas: A };
}

export function psiFatorial(cols, opc) {
  opc = opc || {};
  const comp = psiCompletas(cols), D = comp.dados, p = cols.length, n = comp.idx.length;
  if (p < 3) return 'A análise fatorial precisa de pelo menos 3 variáveis numéricas.';
  if (n < p + 5) return 'Tenho ' + n + ' casos completos para ' + p + ' variáveis: é pouco para uma análise fatorial (o mínimo usual é 5 a 10 casos por variável, e não menos de 100).';
  const R = psiMatrizCorr(D), det = psiDet(R), Ri = psiInversa(R);
  if (!Ri || !(det > 1e-12)) return 'A matriz de correlações é singular (variáveis repetidas ou combinações exatas de outras): remova a variável redundante e peça de novo.';
  // KMO e MSA
  let sr = 0, sp = 0; const msaN = new Array(p).fill(0), msaD = new Array(p).fill(0);
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) {
    const pij = -Ri[i][j] / Math.sqrt(Ri[i][i] * Ri[j][j]); sr += R[i][j] * R[i][j]; sp += pij * pij; msaN[i] += R[i][j] * R[i][j]; msaD[i] += pij * pij;
  }
  const kmo = sr / (sr + sp), msa = msaN.map(function (v, i) { return v / (v + msaD[i]); });
  const chi = -(n - 1 - (2 * p + 5) / 6) * Math.log(det), gl = p * (p - 1) / 2, pb = psiChiSf(chi, gl);
  const ev = psiAutoSim(R).valores, paralela = n >= 20 ? psiParalela(n, p, 100) : null;
  const kaiser = ev.filter(function (v) { return v > 1; }).length;
  let nPar = null; if (paralela) { nPar = 0; while (nPar < p && ev[nPar] > paralela[nPar]) nPar++; }
  let nf = opc.fatores || Math.max(1, kaiser);
  if (nf > p - 1) nf = p - 1;
  const metodo = opc.eixos ? 'eixos principais' : 'componentes principais';
  let cargas, comunal, ss;
  if (opc.eixos) { const f = psiPAF(R, nf); cargas = f.cargas; comunal = f.comunalidades; }
  else { const a = psiAutoSim(R); cargas = []; for (let i = 0; i < p; i++) { cargas.push([]); for (let f = 0; f < nf; f++) cargas[i].push(a.vetores[f][i] * Math.sqrt(a.valores[f])); } comunal = cargas.map(function (r) { return psiSoma(r.map(function (x) { return x * x; })); }); }
  const sem = cargas.map(function (r) { return r.slice(); });
  const rot = nf > 1 ? psiVarimax(cargas).cargas : cargas.map(function (r) { return r.slice(); });
  ss = []; for (let f = 0; f < nf; f++) ss.push(psiSoma(rot.map(function (r) { return r[f] * r[f]; })));
  const ordem = ss.map(function (v, i) { return i; }).sort(function (a, b) { return ss[b] - ss[a]; });
  const final = rot.map(function (r) { return ordem.map(function (f) { return r[f]; }); });
  for (let f = 0; f < nf; f++) { if (psiSoma(final.map(function (r) { return r[f]; })) < 0) final.forEach(function (r) { r[f] = -r[f]; }); }
  const ssO = ordem.map(function (f) { return ss[f]; });
  void sem;
  let t = '### Análise fatorial exploratória\n\n';
  t += 'Método: ' + metodo + (nf > 1 ? ', rotação varimax' : '') + '. ' + nf + ' fator(es)' + (opc.fatores ? ' (pedido por você)' : ' (critério de Kaiser: autovalor > 1)') + '. Casos completos: ' + n + '; variáveis: ' + p + '.\n\n';
  t += '**Adequação dos dados**\n\n' + psiTabela(['Teste', 'Resultado'], [
    ['KMO (Kaiser-Meyer-Olkin)', psiSemZero(kmo, 3) + ' (' + psiNivelKMO(kmo) + ')'],
    ['Esfericidade de Bartlett', 'χ²(' + gl + ') = ' + psiF(chi, 1) + ', p ' + psiP(pb)],
    ['Determinante da matriz de correlações', psiSemZero(det, 4) + (det < 1e-5 ? ' (< ,00001: possível multicolinearidade)' : '')]
  ]);
  const fracosMSA = msa.map(function (v, i) { return { nome: cols[i].nome, v: v }; }).filter(function (x) { return x.v < 0.5; });
  if (fracosMSA.length) t += '\n\nMSA individual abaixo de ,50 em: ' + fracosMSA.map(function (x) { return x.nome + ' (' + psiSemZero(x.v, 2) + ')'; }).join(', ') + '. Considere retirar essas variáveis.';
  t += '\n\n**Autovalores e variância explicada**\n\n' + psiTabela(['Componente', 'Autovalor', '% da variância', '% acumulada'].concat(paralela ? ['Autovalor aleatório (análise paralela, p95)'] : []),
    ev.slice(0, Math.min(p, Math.max(nf + 2, 6))).map(function (v, i, a) { let ac = psiSoma(ev.slice(0, i + 1)) / p * 100; return [String(i + 1), psiF(v, 3), psiF(v / p * 100, 1) + '%', psiF(ac, 1) + '%'].concat(paralela ? [psiF(paralela[i], 3)] : []); }));
  t += '\n\nCritério de Kaiser: ' + kaiser + ' fator(es).' + (nPar != null ? ' Análise paralela de Horn: ' + nPar + ' fator(es) (mais confiável que o critério de Kaiser, que tende a superestimar).' : '');
  t += ' O gráfico de declive (scree) pode ser conferido na coluna de autovalores: procure o "cotovelo".';
  const ordemItens = cols.map(function (c, i) { let mx = 0; for (let f = 1; f < nf; f++) if (Math.abs(final[i][f]) > Math.abs(final[i][mx])) mx = f; return { i: i, f: mx }; }).sort(function (a, b) { return a.f - b.f || Math.abs(final[b.i][b.f]) - Math.abs(final[a.i][a.f]); });
  const cab = ['Item'].concat(ssO.map(function (v, f) { return 'F' + (f + 1); })).concat(['Comunalidade']);
  t += '\n\n**Matriz de cargas' + (nf > 1 ? ' (rotacionada, varimax)' : '') + '** (cargas com |valor| < ,30 omitidas; negrito = maior carga do item)\n\n' + psiTabela(cab, ordemItens.map(function (o) {
    return [cols[o.i].nome].concat(final[o.i].map(function (v, f) { if (Math.abs(v) < 0.3) return ''; const s = psiSemZero(v, 3); return f === o.f ? '**' + s + '**' : s; })).concat([psiSemZero(comunal[o.i], 3)]);
  }));
  t += '\n\nVariância explicada pelos ' + nf + ' fator(es): ' + psiF(psiSoma(comunal) / p * 100, 1) + '%. ' + 'Soma dos quadrados das cargas por fator: ' + ssO.map(function (v, f) { return 'F' + (f + 1) + ' = ' + psiF(v, 2); }).join('; ') + '.';
  const cruz = cols.map(function (c, i) { const altos = final[i].filter(function (v) { return Math.abs(v) >= 0.3; }).length; return { nome: c.nome, altos: altos, max: Math.max.apply(null, final[i].map(Math.abs)) }; });
  const cruzados = cruz.filter(function (x) { return x.altos > 1; }), baixos = cruz.filter(function (x) { return x.max < 0.4; });
  if (baixos.length) t += '\n- Sem carga ≥ ,40 em nenhum fator: ' + baixos.map(function (x) { return x.nome; }).join(', ') + '.';
  if (cruzados.length) t += '\n- Cargas cruzadas (≥ ,30 em mais de um fator): ' + cruzados.map(function (x) { return x.nome; }).join(', ') + '.';
  if (kmo < 0.6 || pb >= 0.05) t += '\n\n**Atenção:** ' + (kmo < 0.6 ? 'o KMO está baixo; ' : '') + (pb >= 0.05 ? 'o teste de Bartlett não rejeita matriz identidade; ' : '') + 'os dados talvez não sejam adequados para análise fatorial.';
  t += '\n\nPara itens ordinais (Likert curto), a análise com correlações policóricas costuma recuperar melhor a estrutura; aqui uso correlações de Pearson, como o SPSS por padrão.';
  return t;
}

export function psiCorrelacoes(cols, tipo) {
  const spear = tipo === 'spearman', k = cols.length;
  if (k < 2) return 'Para correlacionar preciso de pelo menos 2 variáveis numéricas.';
  const rN = []; let nmin = Infinity;
  const dados = cols.map(function () { return null; });
  const par = function (a, b) {
    const x = [], y = [];
    for (let i = 0; i < cols[a].valores.length; i++) if (isFinite(cols[a].valores[i]) && isFinite(cols[b].valores[i])) { x.push(cols[a].valores[i]); y.push(cols[b].valores[i]); }
    return spear ? { r: psiCorr(psiRanks(x), psiRanks(y)), n: x.length } : { r: psiCorr(x, y), n: x.length };
  };
  void dados; void rN;
  const R = [], P = [], N = [];
  for (let i = 0; i < k; i++) { R.push([]); P.push([]); N.push([]); for (let j = 0; j < k; j++) { if (i === j) { R[i].push(1); P[i].push(NaN); N[i].push(cols[i].valores.filter(isFinite).length); } else if (j < i) { R[i].push(R[j][i]); P[i].push(P[j][i]); N[i].push(N[j][i]); } else { const q = par(i, j); R[i].push(q.r); P[i].push(psiPCorr(q.r, q.n)); N[i].push(q.n); nmin = Math.min(nmin, q.n); } } }
  let t = '### Correlação de ' + (spear ? 'Spearman (ρ)' : 'Pearson (r)') + '\n\n';
  if (k <= 8) {
    t += psiTabela([''].concat(cols.map(function (c) { return c.nome; })), cols.map(function (c, i) { return [c.nome].concat(cols.map(function (d, j) { return i === j ? '—' : psiSemZero(R[i][j], 2) + psiSig(P[i][j]); })); }));
    t += '\n\n* p < ,05; ** p < ,01; *** p < ,001 (bilateral). n por par: ' + (nmin === Infinity ? '–' : nmin) + (k > 2 ? ' (mínimo)' : '') + '.';
  } else {
    const lista = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) lista.push({ a: cols[i].nome, b: cols[j].nome, r: R[i][j], p: P[i][j], n: N[i][j] });
    lista.sort(function (x, y) { return Math.abs(y.r) - Math.abs(x.r); });
    t += 'Com ' + k + ' variáveis mostro os 25 maiores pares (por |r|):\n\n' + psiTabela(['Par', (spear ? 'ρ' : 'r'), 'p', 'n'], lista.slice(0, 25).map(function (x) { return [x.a + ' × ' + x.b, psiSemZero(x.r, 2), psiPc(x.p), String(x.n)]; }));
  }
  if (k === 2) t += '\n\n**Leitura.** ' + (spear ? 'ρ' : 'r') + '(' + (N[0][1] - 2) + ') = ' + psiSemZero(R[0][1], 2) + ', p ' + psiP(P[0][1]) + ': correlação ' + psiNivelR(R[0][1]) + (R[0][1] < 0 ? ' e negativa' : ' e positiva') + (P[0][1] < 0.05 ? ', estatisticamente significativa.' : ', não significativa.') + ' R² = ' + psiSemZero(R[0][1] * R[0][1], 3) + ' (proporção da variância compartilhada).';
  else t += '\n\nTamanho do efeito (Cohen): |r| ≈ ,10 pequeno; ,30 moderado; ,50 grande. Com muitos pares, parte dos "significativos" aparece por acaso: considere a correção de Bonferroni (p < ' + psiSemZero(0.05 / (k * (k - 1) / 2), 4) + ' para ' + (k * (k - 1) / 2) + ' pares). Correlação não indica causa.';
  return t;
}

export function psiGrupos(valores, grupo) {                                                                // { nomes, dados[] } só com casos completos
  const mapa = {}, nomes = [];
  for (let i = 0; i < valores.length; i++) { const g = grupo.valores[i]; if (g == null || !isFinite(valores[i])) continue; if (!mapa[g]) { mapa[g] = []; nomes.push(g); } mapa[g].push(valores[i]); }
  nomes.sort(function (a, b) { const na = parseFloat(a), nb = parseFloat(b); return isFinite(na) && isFinite(nb) ? na - nb : String(a).localeCompare(String(b), 'pt-BR'); });
  return { nomes: nomes, dados: nomes.map(function (n) { return mapa[n]; }) };
}
export function psiLevene(gs) {
  const z = gs.map(function (g) { const m = psiMedia(g); return g.map(function (x) { return Math.abs(x - m); }); });
  const N = psiSoma(z.map(function (a) { return a.length; })), k = z.length, todos = [].concat.apply([], z), mg = psiMedia(todos);
  let sb = 0, sw = 0; z.forEach(function (a) { const m = psiMedia(a); sb += a.length * (m - mg) * (m - mg); a.forEach(function (x) { sw += (x - m) * (x - m); }); });
  const F = (sb / (k - 1)) / (sw / (N - k)); return { F: F, p: psiFSf(F, k - 1, N - k), g1: k - 1, g2: N - k };
}

export function psiTeste2(v, g, opc) {
  const gr = psiGrupos(v.valores, g), a = gr.dados[0], b = gr.dados[1], n1 = a.length, n2 = b.length;
  if (n1 < 2 || n2 < 2) return '### ' + v.nome + '\n\nUm dos grupos tem menos de 2 casos: não dá para comparar.';
  const m1 = psiMedia(a), m2 = psiMedia(b), v1 = psiVar(a), v2 = psiVar(b), lev = psiLevene([a, b]);
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2)), d = sp > 0 ? (m1 - m2) / sp : NaN;
  const dif = m1 - m2, ep1 = Math.sqrt(sp * sp * (1 / n1 + 1 / n2)), t1 = dif / ep1, df1 = n1 + n2 - 2, p1 = psiTSf2(t1, df1);
  const epw = Math.sqrt(v1 / n1 + v2 / n2), tw = dif / epw, dfw = Math.pow(v1 / n1 + v2 / n2, 2) / (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1)), pw = psiTSf2(tw, dfw);
  const tc1 = psiTInv(0.05, df1), tcw = psiTInv(0.05, dfw);
  let t = '### Teste t para amostras independentes: ' + v.nome + ' por ' + g.nome + '\n\n';
  t += psiTabela(['Grupo', 'n', 'Média', 'DP'], [[gr.nomes[0], String(n1), psiF(m1), psiF(Math.sqrt(v1))], [gr.nomes[1], String(n2), psiF(m2), psiF(Math.sqrt(v2))]]);
  t += '\n\n' + psiTabela(['', 'Levene F', 'p', 't', 'gl', 'p (bilateral)', 'Diferença', 'IC 95% da diferença'], [
    ['Variâncias iguais (Student)', psiF(lev.F, 3), psiPc(lev.p), psiF(t1, 3), String(df1), psiPc(p1), psiF(dif), psiF(dif - tc1 * ep1) + ' a ' + psiF(dif + tc1 * ep1)],
    ['Variâncias diferentes (Welch)', '', '', psiF(tw, 3), psiF(dfw, 1), psiPc(pw), psiF(dif), psiF(dif - tcw * epw) + ' a ' + psiF(dif + tcw * epw)]
  ]);
  const usarW = lev.p < 0.05, tt = usarW ? tw : t1, dd = usarW ? dfw : df1, pp = usarW ? pw : p1;
  t += '\n\n**Leitura.** Levene ' + (usarW ? 'significativo (p ' + psiP(lev.p) + '): variâncias diferentes, uso Welch.' : 'não significativo (p ' + psiP(lev.p) + '): variâncias iguais, uso Student.') + ' Grupo ' + gr.nomes[0] + ' (média ' + psiF(m1) + ', DP ' + psiF(Math.sqrt(v1)) + ') contra grupo ' + gr.nomes[1] + ' (média ' + psiF(m2) + ', DP ' + psiF(Math.sqrt(v2)) + '): t(' + psiF(dd, usarW ? 1 : 0) + ') = ' + psiF(tt, 2) + ', p ' + psiP(pp) + ', d de Cohen = ' + psiF(d, 2) + ' (efeito ' + psiNivelD(d) + ')' + (pp < 0.05 ? ': diferença estatisticamente significativa.' : ': sem diferença estatisticamente significativa.');
  return t;
}

export function psiMannWhitney(v, g) {
  const gr = psiGrupos(v.valores, g), a = gr.dados[0], b = gr.dados[1], n1 = a.length, n2 = b.length, N = n1 + n2;
  const todos = a.concat(b), rk = psiRanks(todos), r1 = psiSoma(rk.slice(0, n1)), U1 = r1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1, U = Math.min(U1, U2);
  const tie = psiSoma(psiTies(todos).map(function (c) { return c * c * c - c; })), sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1))));
  const z = (U1 - n1 * n2 / 2) / sd, p = 2 * psiNormSf(Math.abs(z)), r = Math.abs(z) / Math.sqrt(N);
  return '### Mann-Whitney: ' + v.nome + ' por ' + g.nome + '\n\n' + psiTabela(['Grupo', 'n', 'Posto médio', 'Mediana'], [[gr.nomes[0], String(n1), psiF(r1 / n1), psiF(psiMediana(a))], [gr.nomes[1], String(n2), psiF((psiSoma(rk) - r1) / n2), psiF(psiMediana(b))]]) +
    '\n\nU = ' + psiF(U, 1) + ', Z = ' + psiF(z, 2) + ', p ' + psiP(p) + ' (aproximação normal, com correção de empates), r = ' + psiSemZero(r, 2) + ' (efeito ' + psiNivelR(r) + ')' + (p < 0.05 ? ': diferença significativa entre os grupos.' : ': sem diferença significativa.');
}

export function psiPareado(a, b, wil) {
  const x = [], y = []; for (let i = 0; i < a.valores.length; i++) if (isFinite(a.valores[i]) && isFinite(b.valores[i])) { x.push(a.valores[i]); y.push(b.valores[i]); }
  const n = x.length; if (n < 3) return 'Poucos casos completos (' + n + ') para o teste pareado.';
  const dif = x.map(function (v, i) { return v - y[i]; }), md = psiMedia(dif), sd = psiDp(dif), ep = sd / Math.sqrt(n), t = md / ep, p = psiTSf2(t, n - 1), tc = psiTInv(0.05, n - 1), dz = sd > 0 ? md / sd : NaN, r = psiCorr(x, y);
  let s = '### Teste t pareado: ' + a.nome + ' e ' + b.nome + '\n\n' + psiTabela(['', 'n', 'Média', 'DP'], [[a.nome, String(n), psiF(psiMedia(x)), psiF(psiDp(x))], [b.nome, String(n), psiF(psiMedia(y)), psiF(psiDp(y))], ['Diferença', String(n), psiF(md), psiF(sd)]]);
  s += '\n\nCorrelação entre as medidas: r = ' + psiSemZero(r, 2) + '. t(' + (n - 1) + ') = ' + psiF(t, 3) + ', p ' + psiP(p) + ', IC 95% da diferença: ' + psiF(md - tc * ep) + ' a ' + psiF(md + tc * ep) + ', d de Cohen (dz) = ' + psiF(dz, 2) + ' (efeito ' + psiNivelD(dz) + ')' + (p < 0.05 ? ': a mudança é estatisticamente significativa.' : ': sem mudança significativa.');
  if (wil) {
    const nz = dif.filter(function (d) { return d !== 0; }), m = nz.length;
    if (m >= 5) {
      const rk = psiRanks(nz.map(Math.abs)), wp = psiSoma(rk.filter(function (r0, i) { return nz[i] > 0; })), tie = psiSoma(psiTies(nz.map(Math.abs)).map(function (c) { return c * c * c - c; })), sdw = Math.sqrt(m * (m + 1) * (2 * m + 1) / 24 - tie / 48), z = (wp - m * (m + 1) / 4) / sdw, pw = 2 * psiNormSf(Math.abs(z));
      s += '\n\n**Wilcoxon (postos com sinal):** Z = ' + psiF(z, 2) + ', p ' + psiP(pw) + ' (aproximação normal; ' + m + ' pares com diferença), r = ' + psiSemZero(Math.abs(z) / Math.sqrt(m), 2) + '.';
    }
  }
  return s;
}

export function psiAnova(v, g, kruskal) {
  const gr = psiGrupos(v.valores, g), gs = gr.dados.filter(function (a) { return a.length >= 2; }), nomes = gr.nomes.filter(function (n, i) { return gr.dados[i].length >= 2; }), k = gs.length;
  if (k < 2) return '### ' + v.nome + '\n\nPreciso de pelo menos 2 grupos com 2 casos ou mais.';
  const N = psiSoma(gs.map(function (a) { return a.length; })), todos = [].concat.apply([], gs), mg = psiMedia(todos);
  if (kruskal) {
    const rk = psiRanks(todos); let pos = 0, H = 0; const linhas = [];
    gs.forEach(function (a, i) { const r = psiSoma(rk.slice(pos, pos + a.length)); pos += a.length; H += r * r / a.length; linhas.push([nomes[i], String(a.length), psiF(r / a.length), psiF(psiMediana(a))]); });
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1); const tie = psiSoma(psiTies(todos).map(function (c) { return c * c * c - c; })); H = H / (1 - tie / (N * N * N - N));
    const p = psiChiSf(H, k - 1), eps = H / ((N * N - 1) / (N + 1));
    return '### Kruskal-Wallis: ' + v.nome + ' por ' + g.nome + '\n\n' + psiTabela(['Grupo', 'n', 'Posto médio', 'Mediana'], linhas) + '\n\nH(' + (k - 1) + ') = ' + psiF(H, 2) + ', p ' + psiP(p) + ', ε² = ' + psiSemZero(eps, 3) + (p < 0.05 ? '. Há diferença entre os grupos; para saber quais, compare-os dois a dois com Mann-Whitney (use Bonferroni).' : '. Sem diferença significativa.');
  }
  let ssb = 0, ssw = 0; const med = gs.map(psiMedia);
  gs.forEach(function (a, i) { ssb += a.length * (med[i] - mg) * (med[i] - mg); a.forEach(function (x) { ssw += (x - med[i]) * (x - med[i]); }); });
  const dfb = k - 1, dfw = N - k, msb = ssb / dfb, msw = ssw / dfw, F = msb / msw, p = psiFSf(F, dfb, dfw), eta = ssb / (ssb + ssw), om = (ssb - dfb * msw) / (ssb + ssw + msw), lev = psiLevene(gs);
  let t = '### ANOVA de um fator: ' + v.nome + ' por ' + g.nome + '\n\n' + psiTabela(['Grupo', 'n', 'Média', 'DP'], gs.map(function (a, i) { return [nomes[i], String(a.length), psiF(med[i]), psiF(psiDp(a))]; }));
  t += '\n\n' + psiTabela(['Fonte', 'Soma de quadrados', 'gl', 'Quadrado médio', 'F', 'p'], [['Entre grupos', psiF(ssb, 2), String(dfb), psiF(msb, 2), psiF(F, 3), psiPc(p)], ['Dentro dos grupos', psiF(ssw, 2), String(dfw), psiF(msw, 2), '', ''], ['Total', psiF(ssb + ssw, 2), String(N - 1), '', '', '']]);
  t += '\n\nLevene: F(' + lev.g1 + ', ' + lev.g2 + ') = ' + psiF(lev.F, 2) + ', p ' + psiP(lev.p) + (lev.p < 0.05 ? ' (variâncias desiguais: prefira Welch ou Kruskal-Wallis; os pós-testes abaixo usam variância conjunta).' : ' (variâncias homogêneas).');
  t += '\n\n**Leitura.** F(' + dfb + ', ' + dfw + ') = ' + psiF(F, 2) + ', p ' + psiP(p) + ', η² = ' + psiSemZero(eta, 3) + ' (efeito ' + psiNivelEta(eta) + '), ω² = ' + psiSemZero(Math.max(0, om), 3) + (p < 0.05 ? '. Há diferença entre os grupos.' : '. Sem diferença significativa entre os grupos.');
  if (p < 0.05 && k >= 3) {
    const pares = []; const m = k * (k - 1) / 2;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const d = med[i] - med[j], ep = Math.sqrt(msw * (1 / gs[i].length + 1 / gs[j].length)), pr = Math.min(1, psiTSf2(d / ep, dfw) * m); pares.push([nomes[i] + ' − ' + nomes[j], psiF(d), psiF(ep, 3), psiPc(pr)]); }
    t += '\n\n**Comparações múltiplas (Bonferroni)**\n\n' + psiTabela(['Par', 'Diferença de médias', 'Erro-padrão', 'p ajustado'], pares);
  }
  return t;
}

export function psiQuiQuadrado(a, b) {
  const ca = {}, cb = {}, cel = {}; let n = 0;
  for (let i = 0; i < a.valores.length; i++) { const x = a.valores[i], y = b.valores[i]; if (x == null || y == null || (typeof x === 'number' && !isFinite(x)) || (typeof y === 'number' && !isFinite(y))) continue; ca[x] = (ca[x] || 0) + 1; cb[y] = (cb[y] || 0) + 1; cel[x + '\u0001' + y] = (cel[x + '\u0001' + y] || 0) + 1; n++; }
  const la = Object.keys(ca).sort(), lb = Object.keys(cb).sort();
  if (la.length < 2 || lb.length < 2) return 'Cada variável precisa ter pelo menos 2 categorias.';
  if (la.length > 12 || lb.length > 12) return 'Variáveis com mais de 12 categorias deixam a tabela ilegível: agrupe as categorias antes.';
  let chi = 0, baixos = 0; const res = [], exps = [];
  la.forEach(function (x) { lb.forEach(function (y) { const o = cel[x + '\u0001' + y] || 0, e = ca[x] * cb[y] / n; chi += (o - e) * (o - e) / e; if (e < 5) baixos++; exps.push({ x: x, y: y, o: o, e: e, rp: (o - e) / Math.sqrt(e * (1 - ca[x] / n) * (1 - cb[y] / n)) }); }); });
  const gl = (la.length - 1) * (lb.length - 1), p = psiChiSf(chi, gl), v = Math.sqrt(chi / (n * (Math.min(la.length, lb.length) - 1))), mk = Math.min(la.length, lb.length) - 1;
  const lim = mk === 1 ? [0.1, 0.3, 0.5] : mk === 2 ? [0.07, 0.21, 0.35] : [0.06, 0.17, 0.29], nivel = v < lim[0] ? 'desprezível' : v < lim[1] ? 'pequeno' : v < lim[2] ? 'moderado' : 'grande';
  let t = '### Qui-quadrado de independência: ' + a.nome + ' × ' + b.nome + '\n\n' + psiTabela([a.nome + ' \\ ' + b.nome].concat(lb).concat(['Total']), la.map(function (x) { return [x].concat(lb.map(function (y) { const o = cel[x + '\u0001' + y] || 0; return o + ' (' + psiF(o / ca[x] * 100, 0) + '%)'; })).concat([String(ca[x])]); }));
  t += '\n\n(% na linha.) χ²(' + gl + ') = ' + psiF(chi, 2) + ', p ' + psiP(p) + ', N = ' + n + '; V de Cramér = ' + psiSemZero(v, 3) + ' (efeito ' + nivel + ')' + (p < 0.05 ? ': há associação estatisticamente significativa.' : ': sem associação significativa.');
  if (la.length === 2 && lb.length === 2) { let yc = 0; exps.forEach(function (c) { const d = Math.max(0, Math.abs(c.o - c.e) - 0.5); yc += d * d / c.e; }); t += '\nCom correção de continuidade (Yates, tabela 2×2): χ²(1) = ' + psiF(yc, 2) + ', p ' + psiP(psiChiSf(yc, 1)) + '.'; }
  if (baixos > 0) t += '\n\n**Atenção:** ' + baixos + ' de ' + exps.length + ' células (' + psiF(baixos / exps.length * 100, 0) + '%) têm frequência esperada < 5' + (baixos / exps.length > 0.2 ? ', mais de 20%: o resultado é pouco confiável; junte categorias ou use o teste exato de Fisher (tabela 2×2).' : '.');
  const marc = exps.filter(function (c) { return Math.abs(c.rp) > 1.96; });
  if (p < 0.05 && marc.length) t += '\n\nCélulas que mais contribuem (resíduo padronizado ajustado > |1,96|): ' + marc.slice(0, 8).map(function (c) { return a.nome + ' = ' + c.x + ' e ' + b.nome + ' = ' + c.y + ' (' + (c.rp > 0 ? 'mais' : 'menos') + ' do que o esperado)'; }).join('; ') + '.';
  return t;
}

export function psiRegressao(y, xs) {
  const cols = [y].concat(xs), comp = psiCompletas(cols), n = comp.idx.length, k = xs.length;
  if (n < k + 3) return 'Só ' + n + ' casos completos para ' + k + ' preditor(es): é pouco para a regressão.';
  const Y = comp.dados[0], X = comp.dados.slice(1), M = [];
  for (let i = 0; i < n; i++) { const l = [1]; for (let j = 0; j < k; j++) l.push(X[j][i]); M.push(l); }
  const XtX = []; for (let a = 0; a <= k; a++) { XtX.push([]); for (let b = 0; b <= k; b++) { let s = 0; for (let i = 0; i < n; i++) s += M[i][a] * M[i][b]; XtX[a].push(s); } }
  const inv = psiInversa(XtX); if (!inv) return 'Os preditores são colineares (um é combinação exata de outro): remova um deles.';
  const Xty = []; for (let a = 0; a <= k; a++) { let s = 0; for (let i = 0; i < n; i++) s += M[i][a] * Y[i]; Xty.push(s); }
  const b = inv.map(function (r) { return psiSoma(r.map(function (v, j) { return v * Xty[j]; })); });
  let sse = 0; const my = psiMedia(Y); let sst = 0;
  for (let i = 0; i < n; i++) { let h = 0; for (let a = 0; a <= k; a++) h += M[i][a] * b[a]; sse += (Y[i] - h) * (Y[i] - h); sst += (Y[i] - my) * (Y[i] - my); }
  const dfe = n - k - 1, mse = sse / dfe, r2 = 1 - sse / sst, r2a = 1 - (1 - r2) * (n - 1) / dfe, F = (r2 / k) / ((1 - r2) / dfe), pF = psiFSf(F, k, dfe);
  const Rx = psiMatrizCorr(X), Rinv = k > 1 ? psiInversa(Rx) : null, sdy = psiDp(Y);
  const linhas = [['(Constante)', psiF(b[0], 3), psiF(Math.sqrt(mse * inv[0][0]), 3), '', psiF(b[0] / Math.sqrt(mse * inv[0][0]), 2), psiPc(psiTSf2(b[0] / Math.sqrt(mse * inv[0][0]), dfe)), '']];
  xs.forEach(function (c, j) { const se = Math.sqrt(mse * inv[j + 1][j + 1]), t = b[j + 1] / se, beta = b[j + 1] * psiDp(X[j]) / sdy; linhas.push([c.nome, psiF(b[j + 1], 3), psiF(se, 3), psiF(beta, 3), psiF(t, 2), psiPc(psiTSf2(t, dfe)), Rinv ? psiF(Rinv[j][j], 2) : '1,00']); });
  let t = '### Regressão linear: ' + y.nome + ' em função de ' + xs.map(function (c) { return c.nome; }).join(', ') + '\n\n';
  t += psiTabela(['Resumo do modelo', 'Valor'], [['R', psiSemZero(Math.sqrt(Math.max(r2, 0)), 3)], ['R²', psiSemZero(r2, 3)], ['R² ajustado', psiSemZero(r2a, 3)], ['Erro-padrão da estimativa', psiF(Math.sqrt(mse), 3)], ['ANOVA do modelo', 'F(' + k + ', ' + dfe + ') = ' + psiF(F, 2) + ', p ' + psiP(pF)], ['N (casos completos)', String(n)]]);
  t += '\n\n' + psiTabela(['Preditor', 'B', 'Erro-padrão', 'β', 't', 'p', 'VIF'], linhas);
  t += '\n\n**Leitura.** O modelo explica ' + psiF(r2 * 100, 1) + '% da variância de ' + y.nome + ' (R² ajustado = ' + psiSemZero(r2a, 3) + ') e é ' + (pF < 0.05 ? 'estatisticamente significativo' : 'não significativo') + '. ';
  const sig = xs.filter(function (c, j) { return psiTSf2(b[j + 1] / Math.sqrt(mse * inv[j + 1][j + 1]), dfe) < 0.05; });
  t += sig.length ? 'Preditores significativos: ' + sig.map(function (c) { return c.nome; }).join(', ') + '.' : 'Nenhum preditor é significativo isoladamente.';
  if (Rinv && Rinv.some(function (r, i) { return r[i] > 5; })) t += ' VIF acima de 5 indica colinearidade entre preditores: interprete os β com cautela.';
  t += '\n\nConfira os pressupostos (linearidade, resíduos normais e de variância constante, independência das observações); aqui não há gráficos de resíduos. Correlação e regressão não provam causa.';
  return t;
}

// ------------------------------------------------------------------ interpretar o pedido

const PSI_ACAO = /\b(calcul\w*|faca|faz|fazer|rode|rodar|execut\w*|analis\w*|compar\w*|correlacion\w*|teste|testar|verifi\w*|gere|gerar|me d[aeê]|quero|preciso|mostre|mostrar|rela[cç][aã]o|veja|ver|cruz\w*)\b/;
const PSI_CONCEITO = /\b(o que (e|significa|sao)|para que serve|explique|explica|como (se )?interpret\w*|qual (e )?a diferenca|quando (usar|uso)|defina|conceito)\b/;

export function psiTipoDoPedido(n) {
  if (/\b(analise|avaliacao) psicometric\w*|\banalise completa\b|\bpsicometria\b/.test(n)) return 'completa';
  if (/\bo que (eu )?(posso|da|d[aá]) (pra |para )?fazer com (este|esse|o|os) (arquivo|dados|base|planilha)\b|\bo que posso fazer com (este|esse) arquivo\b/.test(n)) return 'menu';
  if (/\balfa\b|cronbach|confiabilidade|consistencia interna|\bomega\b|fidedignidade|split.?half|duas metades/.test(n)) return 'confiabilidade';
  if (/fatorial|\bafe\b|\bkmo\b|bartlett|componentes principais|analise paralela|cargas fatoriais|\bpca\b|\bfatores\b|dimensionalidade|estrutura fatorial/.test(n)) return 'fatorial';
  if (/mann.?whitney|\bwilcoxon\b|kruskal/.test(n)) return /kruskal/.test(n) ? 'kruskal' : /wilcoxon/.test(n) ? 'pareado' : 'mannwhitney';
  if (/\banova\b|analise de variancia/.test(n)) return 'grupos';
  if (/teste t\b|t de student|\bt-test\b|testes? t\b|comparar medias|comparacao de medias|diferenca (de medias )?entre (os )?grupos|diferenca de medias|comparar (os )?grupos|compar\w+ .* (entre|por) /.test(n)) return /pareado|antes e depois|pre e pos|medidas repetidas|mesmos? (participantes|sujeitos)/.test(n) ? 'pareado' : 'grupos';
  if (/pareado|antes e depois|pre e pos|medidas repetidas/.test(n)) return 'pareado';
  if (/qui.?quadrado|\bchi\b|tabela cruzada|crosstab|tabulacao cruzada|associacao entre|independencia entre/.test(n)) return 'quiquadrado';
  if (/regressao|preditores|predizer|prever/.test(n)) return 'regressao';
  if (/correla\w+|spearman|pearson/.test(n)) return /spearman/.test(n) ? 'spearman' : 'pearson';
  if (/frequencia|distribuicao de frequencias|tabela de frequencias|contagem/.test(n)) return 'frequencias';
  if (/descritiva|medidas de tendencia|media e desvio|estatisticas basicas|resumo estatistico|resumo dos dados|normalidade|shapiro|assimetria|curtose|desvio padrao|desvio-padrao/.test(n)) return 'descritivas';
  return null;
}

export function psiMencoes(n, tabela) {
  const ach = [];
  tabela.colunas.forEach(function (c, i) {
    if (!c.norm) return;
    const re = new RegExp('(^|[^a-z0-9_])(' + psiEsc(c.norm) + ')(?![a-z0-9_])'); const m = re.exec(n);
    if (m) ach.push({ c: c, i: i, pos: m.index + m[1].length, fim: m.index + m[1].length + c.norm.length });
  });
  ach.sort(function (a, b) { return a.pos - b.pos; });
  const saida = [];
  ach.forEach(function (m, k) {
    const ant = ach[k - 1];
    if (ant && /^\s*(a|ate|ao)\s*$/.test(n.slice(ant.fim, m.pos))) {
      const de = Math.min(ant.i, m.i), a = Math.max(ant.i, m.i);
      saida.pop(); for (let q = de; q <= a; q++) saida.push({ c: tabela.colunas[q], pos: ant.pos, grupo: false });
      return;
    }
    const antes = n.slice(Math.max(0, m.pos - 28), m.pos);
    saida.push({ c: m.c, pos: m.pos, grupo: /(\bpor|\bentre|\bsegundo|\bconforme|\bgrupos?|\bagrupad[oa]s? por|\bde acordo com|\bem funcao d[aeo]s?|\bcomparando)\s+(o |a |os |as |d[aeo]s? )?(grupos? )?$/.test(antes) });
  });
  const vistos = {}; return saida.filter(function (m) { if (vistos[m.c.nome]) return false; vistos[m.c.nome] = 1; return true; });
}

export function psiPoucas(c) { return c.nUnicos >= 2 && c.nUnicos <= 8; }
export function psiNumericasUteis(tabela) { return tabela.colunas.filter(function (c) { return c.tipo === 'num' && !c.id && c.nUnicos > 1; }); }

export function psiMenu(tabela) {
  const nums = tabela.colunas.filter(function (c) { return c.tipo === 'num' && !c.id; }), cats = tabela.colunas.filter(function (c) { return c.tipo === 'cat'; });
  const gr = tabela.colunas.filter(function (c) { return psiPoucas(c); });
  let t = '### Sua base de dados\n\n' + tabela.n + ' linhas e ' + tabela.colunas.length + ' colunas, lidas neste aparelho (nada foi enviado a servidor nem à IA).\n\n';
  t += '- Colunas numéricas (' + nums.length + '): ' + nums.slice(0, 30).map(function (c) { return c.nome; }).join(', ') + (nums.length > 30 ? '...' : '') + '\n';
  t += '- Colunas de texto/categoria (' + cats.length + '): ' + (cats.length ? cats.slice(0, 15).map(function (c) { return c.nome; }).join(', ') : 'nenhuma') + '\n';
  t += '- Dá para usar como grupo (2 a 8 valores): ' + (gr.length ? gr.slice(0, 15).map(function (c) { return c.nome + ' (' + c.nUnicos + ')'; }).join(', ') : 'nenhuma') + '\n';
  const mis = tabela.colunas.filter(function (c) { return c.valores.some(function (x) { return x == null || (typeof x === 'number' && !isFinite(x)); }); });
  if (mis.length) t += '- Dados ausentes em ' + mis.length + ' coluna(s).\n';
  tabela.avisos.forEach(function (a) { t += '- ' + a + '\n'; });
  const ex = nums.slice(0, 2).map(function (c) { return c.nome; }), g = gr[0] ? gr[0].nome : 'grupo';
  t += '\n**O que posso calcular aqui, sem IA e sem gastar cota** (escreva do seu jeito, citando os nomes das colunas):\n\n';
  t += '- "análise psicométrica completa" (descritivas, alfa, fatorial)\n- "descritivas e normalidade de ' + (ex[0] || 'x') + '" / "frequências de ' + g + '"\n- "alfa de Cronbach dos itens ' + (nums[0] ? nums[0].nome : 'q1') + ' a ' + (nums[Math.min(nums.length - 1, 4)] ? nums[Math.min(nums.length - 1, 4)].nome : 'q10') + '"\n- "análise fatorial (KMO, Bartlett, análise paralela)" / "análise fatorial com 3 fatores por eixos principais"\n- "correlação de Pearson (ou Spearman) entre ' + (ex.join(' e ') || 'x e y') + '"\n- "teste t de ' + (ex[0] || 'x') + ' por ' + g + '", "ANOVA", "Mann-Whitney", "Kruskal-Wallis", "t pareado entre pre e pos", "Wilcoxon"\n- "qui-quadrado entre ' + g + ' e ' + (gr[1] ? gr[1].nome : 'outra variável') + '"\n- "regressão de ' + (ex[0] || 'y') + ' em função de ' + (ex[1] || 'x') + '"\n';
  t += '\nMissing: células vazias, NA, "-" e "." contam como ausentes (exclusão listwise em cada análise). Itens invertidos precisam estar recodificados antes. Aceito CSV/TSV/TXT (planilha: salve como CSV).';
  return t;
}

export function psiResolver(tipo, n, tabela) {
  const mencoes = psiMencoes(n, tabela), comGrupo = tipo === 'grupos' || tipo === 'mannwhitney' || tipo === 'kruskal';
  // "entre q1 e q6" não indica grupo: só nas comparações de grupos a preposição marca a coluna que separa os grupos.
  const grupoM = comGrupo ? mencoes.filter(function (m) { return m.grupo; })[0] : null, livres = mencoes.filter(function (m) { return !grupoM || m !== grupoM; }).map(function (m) { return m.c; });
  const nums = psiNumericasUteis(tabela), numLivres = livres.filter(function (c) { return c.tipo === 'num'; });
  const aviso = [];
  const escalas = function () { return numLivres.length ? numLivres : nums.filter(function (c) { return !grupoM || c !== grupoM.c; }); };
  if (tipo === 'descritivas') return { texto: psiDescritivas(escalas().slice(0, 40)) };
  if (tipo === 'frequencias') {
    let alvo = livres.length ? livres : tabela.colunas.filter(function (c) { return c.tipo === 'cat' || psiPoucas(c); });
    if (!alvo.length) return { texto: 'Não achei coluna categórica para tabular. Cite o nome da coluna.' };
    return { texto: psiFrequencias(alvo.slice(0, 8)) };
  }
  if (tipo === 'confiabilidade') {
    const it = escalas(); if (it.length > 60) return { texto: 'Há ' + it.length + ' colunas numéricas: cite os itens (ex.: "alfa de q1 a q20").' };
    return { texto: psiConfiabilidade(it), aviso: !numLivres.length ? ['Usei todas as ' + it.length + ' colunas numéricas como itens da escala. Para uma subescala, cite os itens ("alfa de q1 a q8").'] : [] };
  }
  if (tipo === 'fatorial') {
    const it = escalas(); if (it.length > 40) return { texto: 'Há ' + it.length + ' colunas numéricas: cite os itens (ex.: "fatorial de q1 a q30").' };
    const mf = /(\d+)\s*fatores?|fator(?:es)?\s*[:=]?\s*(\d+)|(um|dois|tres|quatro|cinco|seis)\s+fatores?/.exec(n); const ext = { um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };
    const nf = mf ? (parseInt(mf[1] || mf[2], 10) || ext[mf[3]]) : 0;
    return { texto: psiFatorial(it, { fatores: nf || 0, eixos: /eixos? principais|\bpaf\b|\bfatoracao\b|maxima verossimilhanca/.test(n) }), aviso: !numLivres.length ? ['Usei todas as ' + it.length + ' colunas numéricas. Para outro conjunto, cite os itens.'] : [] };
  }
  if (tipo === 'pearson' || tipo === 'spearman') {
    const it = numLivres.length >= 2 ? numLivres : nums; if (it.length > 30) return { texto: 'Há ' + it.length + ' colunas numéricas: cite as variáveis que quer correlacionar.' };
    return { texto: psiCorrelacoes(it, tipo), aviso: numLivres.length < 2 ? ['Correlacionei todas as colunas numéricas. Cite duas ou mais para um par específico.'] : [] };
  }
  if (tipo === 'regressao') {
    const nm = livres.concat(grupoM ? [grupoM.c] : []).filter(function (c) { return c.tipo === 'num'; });
    if (nm.length < 2) return { texto: 'Para a regressão cite a variável dependente e os preditores, ex.: "regressão de bemestar em função de idade e renda". Colunas numéricas: ' + nums.map(function (c) { return c.nome; }).join(', ') + '.' };
    return { texto: psiRegressao(nm[0], nm.slice(1)), aviso: ['Dependente: ' + nm[0].nome + ' (a primeira citada); preditores: ' + nm.slice(1).map(function (c) { return c.nome; }).join(', ') + '. Preditores categóricos precisam virar 0/1 antes.'] };
  }
  if (tipo === 'pareado') {
    const it = numLivres.length >= 2 ? numLivres : null;
    if (!it) return { texto: 'Para o teste pareado cite as duas medidas, ex.: "t pareado entre pre e pos".' };
    return { texto: psiPareado(it[0], it[1], /wilcoxon/.test(n)) };
  }
  if (tipo === 'quiquadrado') {
    const cand = livres.concat(grupoM ? [grupoM.c] : []).filter(function (c) { return c.tipo === 'cat' || psiPoucas(c); });
    if (cand.length < 2) return { texto: 'Para o qui-quadrado cite duas variáveis categóricas, ex.: "qui-quadrado entre sexo e grupo". Candidatas: ' + tabela.colunas.filter(function (c) { return c.tipo === 'cat' || psiPoucas(c); }).map(function (c) { return c.nome; }).join(', ') + '.' };
    return { texto: psiQuiQuadrado(cand[0], cand[1]) };
  }
  if (tipo === 'grupos' || tipo === 'mannwhitney' || tipo === 'kruskal') {
    let g = grupoM ? grupoM.c : null;
    if (!g) { const c2 = livres.filter(function (c) { return c.tipo === 'cat' || (psiPoucas(c) && c.tipo === 'num' && c.nUnicos <= 5); }); if (c2.length) g = c2[0]; }
    if (!g) { const c3 = tabela.colunas.filter(function (c) { return c.tipo === 'cat' && psiPoucas(c); }); if (c3.length === 1) g = c3[0]; }
    if (!g) return { texto: 'Para comparar grupos preciso saber qual coluna define os grupos, ex.: "teste t de ' + (nums[0] ? nums[0].nome : 'x') + ' por sexo". Colunas que servem: ' + (tabela.colunas.filter(psiPoucas).map(function (c) { return c.nome + ' (' + c.nUnicos + ' valores)'; }).join(', ') || 'nenhuma (precisa de 2 a 8 valores)') + '.' };
    let vs = numLivres.filter(function (c) { return c !== g; }); if (!vs.length) vs = nums.filter(function (c) { return c !== g && !psiPoucas(c); });
    if (!vs.length) return { texto: 'Não achei variável numérica para comparar entre os grupos de ' + g.nome + '. Cite a variável.' };
    if (vs.length > 12) return { texto: 'São muitas variáveis (' + vs.length + '); cite até 12.' };
    const ng = psiGrupos(vs[0].valores, g).nomes.length; if (ng < 2) return { texto: 'A coluna ' + g.nome + ' tem só ' + ng + ' grupo com dados válidos.' };
    if (ng > 10) return { texto: 'A coluna ' + g.nome + ' tem ' + ng + ' valores: parece contínua, não um grupo.' };
    const partes = vs.map(function (v) {
      if (tipo === 'kruskal') return psiAnova(v, g, true);
      if (ng === 2) return tipo === 'mannwhitney' ? psiMannWhitney(v, g) : psiTeste2(v, g);
      return tipo === 'mannwhitney' ? psiAnova(v, g, true) : psiAnova(v, g, false);
    });
    if (vs.length > 1 && ng === 2 && tipo !== 'mannwhitney') partes.push('Comparando ' + vs.length + ' variáveis ao mesmo tempo, o risco de falso positivo aumenta: use p < ' + psiSemZero(0.05 / vs.length, 4) + ' (Bonferroni).');
    return { texto: partes.join('\n\n'), aviso: (ng > 2 && tipo === 'mannwhitney') ? ['Há ' + ng + ' grupos: usei Kruskal-Wallis, o equivalente do Mann-Whitney para 3 ou mais grupos.'] : [] };
  }
  void aviso; return null;
}

export function psiRespostaDoPedido(texto, tabela) {
  if (!tabela) return null;
  const n = psiNorm(texto).replace(/\s+/g, ' ');
  const tipo = psiTipoDoPedido(n); if (!tipo) return null;
  if (tipo !== 'menu' && PSI_CONCEITO.test(n) && !PSI_ACAO.test(n) && psiMencoes(n, tabela).length === 0) return null;
  const cab = 'Calculado neste aparelho, sem IA e sem rede: não gastou cota e a base não saiu daqui.';
  if (tipo === 'menu') return { texto: psiMenu(tabela), analise: 'menu', avisos: [cab] };
  if (tipo === 'completa') {
    const it = psiNumericasUteis(tabela).filter(function (c) { return !psiPoucas(c) || c.nUnicos > 4; });
    const itens = it.length >= 3 ? it : psiNumericasUteis(tabela);
    const partes = [psiDescritivas(itens.slice(0, 40)), psiConfiabilidade(itens.slice(0, 60)), itens.length >= 3 ? psiFatorial(itens.slice(0, 40), {}) : ''].filter(Boolean);
    return { texto: partes.join('\n\n---\n\n'), analise: 'completa', avisos: [cab, 'Análise completa sobre as ' + itens.length + ' colunas numéricas. Para uma subescala, cite os itens.'].concat(tabela.avisos) };
  }
  const r = psiResolver(tipo, n, tabela); if (!r) return null;
  return { texto: r.texto, analise: tipo, avisos: [cab].concat(r.aviso || []).concat(tabela.avisos) };
}

// Há cara de pedido de análise de dados, mas sem base anexada: explica como anexar (sem IA).
export function psiSemBase(texto) {
  const n = psiNorm(texto).replace(/\s+/g, ' ');
  const tipo = psiTipoDoPedido(n); if (!tipo || tipo === 'menu') return null;
  if (PSI_CONCEITO.test(n) || !PSI_ACAO.test(n)) return null;
  if (!/\b(meus?|minha|dos|das|nos|nas|esse|este|essa|esta|desses|dessa|a base|a planilha|os dados|o arquivo)\b/.test(n)) return null;
  return 'Consigo fazer essa análise aqui no aparelho, sem IA e sem gastar cota, mas preciso da base. Anexe um arquivo **CSV, TSV ou TXT** (clipe ao lado do campo de texto; se estiver no Excel, use "Salvar como CSV"), com uma linha de títulos e uma linha por participante, e peça de novo, por exemplo: "alfa de Cronbach dos itens q1 a q10" ou "teste t de ansiedade por sexo". Não coloque nome, CPF ou telefone: colunas assim são ignoradas.';
}
