// Núcleo numérico de estatística no aparelho (sem IA, sem rede): amplitude studentizada (Tukey) e comparações múltiplas.
import { psiNormCdf } from './psicometria.mjs';

// ------------------------------------------------------------------ quadratura de Gauss-Legendre
const EST_GL = {};
function estNosGL(n) {
  if (EST_GL[n]) return EST_GL[n];
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const dz = p1 / pp; z -= dz; if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
  }
  return (EST_GL[n] = { x: x, w: w });
}
// Integra f em [a, b] com `paineis` subintervalos de n nós cada.
export function estIntegrar(f, a, b, paineis, n) {
  const g = estNosGL(n || 32), h = (b - a) / paineis; let s = 0;
  for (let p = 0; p < paineis; p++) {
    const lo = a + p * h, m = lo + h / 2, r = h / 2;
    for (let i = 0; i < g.x.length; i++) s += g.w[i] * f(m + r * g.x[i]);
  }
  return s * h / 2;
}

// ------------------------------------------------------------------ distribuição da amplitude studentizada
export function estPhi(z) { return psiNormCdf(z); }
const EST_RAIZ2PI = Math.sqrt(2 * Math.PI);
function estLgamma(x) { // Lanczos
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
// P(amplitude de k normais padrão <= w)
function estAmplitudeNormal(w, k) {
  if (w <= 0) return 0;
  const f = function (z) { const d = psiNormCdf(z) - psiNormCdf(z - w); return Math.exp(-z * z / 2) / EST_RAIZ2PI * Math.pow(d, k - 1); };
  return Math.min(1, k * estIntegrar(f, -8, 8 + w, 4, 24));
}
// Função de distribuição de Q = amplitude / (s) com gl graus de liberdade (equivale a ptukey do R / studentized_range.cdf do scipy).
export function estPTukey(q, k, gl) {
  if (!(q > 0)) return 0;
  if (k < 2) return NaN;
  if (gl >= 1e5 || gl === Infinity) return estAmplitudeNormal(q, k);
  const lc = Math.log(2) + (gl / 2) * Math.log(gl / 2) - estLgamma(gl / 2);
  const dens = function (s) { return s <= 0 ? 0 : Math.exp(lc + (gl - 1) * Math.log(s) - gl * s * s / 2); };
  const topo = 1 + 9 / Math.sqrt(gl);
  const v = estIntegrar(function (s) { const d = dens(s); return d === 0 ? 0 : d * estAmplitudeNormal(q * s, k); }, 0, topo, 6, 24);
  return Math.min(1, Math.max(0, v));
}
export function estQTukey(p, k, gl) {
  let lo = 0, hi = 1; while (estPTukey(hi, k, gl) < p && hi < 1e4) hi *= 2;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (estPTukey(m, k, gl) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
