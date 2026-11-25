// Matemática NO APARELHO, sem IA e sem rede: o que o Paulus ainda resolve quando a cota gratuita da IA acaba (ou a internet cai).
// FONTE ÚNICA: o navegador (dist/paulus.v1.js) usa este arquivo; os testes conferem cada resolução por conta independente.
//
// O que resolve, com passos e conferência (tudo em frações exatas; raiz irracional ou complexa sai em forma fechada e em decimal):
//   · equação e raízes de polinômio de qualquer grau (fatores, Briot-Ruffini, Bhaskara, biquadrada, complexas, Girard);
//   · função do 2º grau: vértice, máximo/mínimo, raízes, f(k);
//   · sistema linear (2 a 3 incógnitas, escalonamento: possível determinado, indeterminado ou impossível);
//   · matriz: determinante, inversa, transposta, soma, produto, potência, posto e traço;
//   · números complexos: expressão, módulo, conjugado, forma polar, potência;
//   · derivada e integral de polinômio (indefinida e definida), reta tangente;
//   · trigonometria: sen, cos, tg, sec, cossec, cotg de ângulos notáveis (múltiplos de 15°) e valor aproximado dos demais.
// O que NÃO faz: interpretar enunciado em linguagem corrente. Quando não reconhece uma conta escrita em símbolos, entrega o ROTEIRO do assunto
// (fórmulas e modelos resolvidos de shared/matematica.mjs) e diz com franqueza que a resolução completa precisa da IA.
//
//   resolverMatematicaLocal(texto)      -> { titulo, passos[], resposta, conferencia, aproximado } ou null
//   respostaDeMatematicaLocal(texto)    -> { texto, itens, resolvida, topicos[], avisos[] } ou null (nem resolve nem tem roteiro para o assunto)
//
// Nomes com prefixo "mtl" (no navegador os módulos viram um arquivo só). Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos).

import { formatarNumero } from './calculo.mjs';
import { topicosDaQuestao, arsenalDaQuestao } from './matematica.mjs';

// ------------------------------------------------------------------ frações exatas

const MTL_LIM = 9007199254740991;

function mtlMdc(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

function mtlFr(n, d) {
  if (d === undefined) d = 1;
  if (d === 0) throw new Error('div0');
  if (d < 0) { n = -n; d = -d; }
  const g = mtlMdc(n, d) || 1;
  n = n / g; d = d / g;
  if (Math.abs(n) > MTL_LIM || d > MTL_LIM) throw new Error('grande');
  return { n: n === 0 ? 0 : n, d: d };
}

function mtlSoma(a, b) { return mtlFr(a.n * b.d + b.n * a.d, a.d * b.d); }
function mtlSub(a, b) { return mtlFr(a.n * b.d - b.n * a.d, a.d * b.d); }
function mtlMul(a, b) { return mtlFr(a.n * b.n, a.d * b.d); }
function mtlDiv(a, b) { return mtlFr(a.n * b.d, a.d * b.n); }
function mtlNeg(a) { return mtlFr(-a.n, a.d); }
function mtlZero(a) { return a.n === 0; }
function mtlIgual(a, b) { return a.n === b.n && a.d === b.d; }
function mtlVal(a) { return a.n / a.d; }
function mtlPotF(a, k) { let r = mtlFr(1); for (let i = 0; i < k; i++) r = mtlMul(r, a); return r; }

// Texto de uma fração com o sinal de menos verdadeiro: "−3", "1/2".
function mtlTxt(a) {
  const s = Math.abs(a.n) + (a.d === 1 ? '' : '/' + a.d);
  return a.n < 0 ? '−' + s : s;
}

// Número aproximado no formato do app ("≈ 1,4142").
function mtlAprox(x) { return formatarNumero(x, { casas: 4 }).replace('-', '−'); }

// Decimal ou fração escrita ("2,5", "0.25") para fração exata.
function mtlLerNumero(s) {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!m) throw new Error('numero');
  const dec = m[2] || '';
  if (dec.length > 9) throw new Error('longo');
  return mtlFr(Number(m[1] + dec), Math.pow(10, dec.length));
}

// ------------------------------------------------------------------ texto

function mtlNorm(t) {
  return String(t == null ? '' : t).slice(0, 4000).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
    .replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/∙/g, '*')
    .replace(/\s+/g, ' ');
}

const MTL_SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function mtlSup(k) { return String(k).split('').map(function (c) { return MTL_SUP[c]; }).join(''); }

// Maiores trechos de texto feitos só de caracteres permitidos. Trecho que encosta em letra (o "x" de "texto") não vale.
function mtlTrechos(n, permitidos) {
  const lista = [];
  let i = 0;
  while (i < n.length) {
    if (permitidos.indexOf(n.charAt(i)) < 0) { i++; continue; }
    let j = i;
    while (j < n.length && permitidos.indexOf(n.charAt(j)) >= 0) j++;
    let a = i, b = j;
    while (a < b && n.charAt(a) === ' ') a++;
    while (b > a && n.charAt(b - 1) === ' ') b--;
    const txt = n.slice(a, b);
    const antes = a > 0 ? n.charAt(a - 1) : ' ';
    const depois = b < n.length ? n.charAt(b) : ' ';
    const colaAntes = /[a-z]/.test(antes) && /^[a-z]/.test(txt);
    const colaDepois = /[a-z]/.test(depois) && /[a-z]$/.test(txt);
    if (txt && !colaAntes && !colaDepois) lista.push({ ini: a, fim: b, txt: txt });
    i = j;
  }
  return lista;
}

// ------------------------------------------------------------------ analisador de expressões (uma gramática, várias álgebras)

// alg: { vars: 'x', num(fr), variavel(letra), soma, sub, neg, mul, div, pot(a, k) }. Multiplicação implícita ("2x", "(x-1)(x+2)", "3i").
function mtlAnalisar(str, alg) {
  const s = str;
  let p = 0, ultimoNumero = false;
  function espiar() { while (s.charAt(p) === ' ') p++; return s.charAt(p); }
  function falha() { throw new Error('sintaxe'); }
  function expressao() {
    let v = termo();
    for (;;) {
      const c = espiar();
      if (c === '+') { p++; v = alg.soma(v, termo()); }
      else if (c === '-') { p++; v = alg.sub(v, termo()); }
      else return v;
    }
  }
  function comecaFator(c) { return /[0-9(]/.test(c) || (c !== '' && alg.vars.indexOf(c) >= 0); }
  function termo() {
    let v = unario();
    for (;;) {
      const c = espiar();
      if (c === '*') { p++; v = alg.mul(v, unario()); }
      else if (c === '/') { p++; v = alg.div(v, unario()); }
      else if (comecaFator(c)) {
        if (ultimoNumero && /[0-9]/.test(c)) falha();
        v = alg.mul(v, potencia());
      } else return v;
    }
  }
  function unario() {
    const c = espiar();
    if (c === '-') { p++; return alg.neg(unario()); }
    if (c === '+') { p++; return unario(); }
    return potencia();
  }
  function potencia() {
    const b = atomo();
    if (espiar() === '^') {
      p++;
      let k = '', sinal = 1;
      if (espiar() === '(') { p++; if (espiar() === '-') { sinal = -1; p++; } }
      else if (espiar() === '-') { sinal = -1; p++; }
      while (/[0-9]/.test(s.charAt(p))) { k += s.charAt(p); p++; }
      if (!k) falha();
      if (s.charAt(p) === ')' && /\(\s*-?$/.test(s.slice(0, p - k.length))) p++;
      ultimoNumero = false;
      return alg.pot(b, sinal * Number(k));
    }
    return b;
  }
  function atomo() {
    const c = espiar();
    if (c === '(') {
      p++;
      const v = expressao();
      if (espiar() !== ')') falha();
      p++; ultimoNumero = false;
      return v;
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(?:[.,]\d+)?/.exec(s.slice(p));
      p += m[0].length; ultimoNumero = true;
      return alg.num(mtlLerNumero(m[0]));
    }
    if (c !== '' && alg.vars.indexOf(c) >= 0) { p++; ultimoNumero = false; return alg.variavel(c); }
    return falha();
  }
  const r = expressao();
  if (espiar() !== '') falha();
  return r;
}

function mtlTenta(f) { try { return f(); } catch (e) { return null; } }

// ------------------------------------------------------------------ polinômios em x (vetor de frações, grau crescente)

function mtlPAparar(a) {
  const r = a.slice();
  while (r.length > 1 && mtlZero(r[r.length - 1])) r.pop();
  return r;
}
function mtlPSoma(a, b) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(mtlSoma(a[i] || mtlFr(0), b[i] || mtlFr(0))); return mtlPAparar(r); }
function mtlPNeg(a) { return a.map(mtlNeg); }
function mtlPMul(a, b) {
  const r = [];
  for (let i = 0; i < a.length + b.length - 1; i++) r.push(mtlFr(0));
  a.forEach(function (x, i) { b.forEach(function (y, j) { r[i + j] = mtlSoma(r[i + j], mtlMul(x, y)); }); });
  return mtlPAparar(r);
}

const MTL_ALG_X = {
  vars: 'x',
  num: function (f) { return [f]; },
  variavel: function () { return [mtlFr(0), mtlFr(1)]; },
  soma: mtlPSoma,
  sub: function (a, b) { return mtlPSoma(a, mtlPNeg(b)); },
  neg: mtlPNeg,
  mul: mtlPMul,
  div: function (a, b) { if (b.length !== 1 || mtlZero(b[0])) throw new Error('div'); return mtlPAparar(a.map(function (c) { return mtlDiv(c, b[0]); })); },
  pot: function (a, k) {
    if (k < 0 || k > 12) throw new Error('pot');
    let r = [mtlFr(1)];
    for (let i = 0; i < k; i++) { r = mtlPMul(r, a); if (r.length > 14) throw new Error('grau'); }
    return r;
  }
};

function mtlLerPoli(s) { return mtlTenta(function () { return mtlAnalisar(s, MTL_ALG_X); }); }
function mtlGrau(p) { return mtlPAparar(p).length - 1; }

// "x³ − 6x² + 11x − 6"
function mtlPoliTxt(p, v) {
  v = v || 'x';
  let s = '';
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (mtlZero(c)) continue;
    const neg = c.n < 0, abs = mtlFr(Math.abs(c.n), c.d);
    const unit = mtlIgual(abs, mtlFr(1));
    let corpo;
    if (k === 0) corpo = mtlTxt(abs);
    else corpo = (unit ? '' : (abs.d === 1 ? mtlTxt(abs) : '(' + mtlTxt(abs) + ')')) + v + (k > 1 ? mtlSup(k) : '');
    s += s ? (neg ? ' − ' : ' + ') + corpo : (neg ? '−' : '') + corpo;
  }
  return s || '0';
}

function mtlPAval(p, x) { let r = mtlFr(0); for (let k = p.length - 1; k >= 0; k--) r = mtlSoma(mtlMul(r, x), p[k]); return r; }

// ------------------------------------------------------------------ raízes: radicais, 2º grau, racionais, numéricas

function mtlRadical(m) {
  let k = 1, r = m;
  for (let f = Math.floor(Math.sqrt(m)); f > 1; f--) { if (m % (f * f) === 0) { k = f; r = m / (f * f); break; } }
  return { k: k, r: r };
}

// (B ± K√R)/D em texto; para raiz complexa, imag = true troca √R por i√R.
function mtlRaizTxt(B, K, R, D, imag, sinal) {
  const raiz = imag ? (R === 1 ? 'i' : 'i√' + R) : '√' + R;
  const parte = (K === 1 ? '' : K) + raiz;
  const num = (B !== 0 ? (B < 0 ? '−' + (-B) : String(B)) + (sinal === 0 ? ' ± ' : sinal > 0 ? ' + ' : ' − ') : (sinal === 0 ? '±' : sinal > 0 ? '' : '−')) + parte;
  if (D === 1) return num;
  return B !== 0 ? '(' + num + ')/' + D : num + '/' + D;
}

// Equação a·x² + b·x + c = 0 com a, b, c inteiros. Devolve { passos, raizes:[{txt, re, im, exata}] }.
function mtlBhaskara(a, b, c, rotuloX) {
  rotuloX = rotuloX || 'x';
  const passos = [];
  const delta = b * b - 4 * a * c;
  passos.push('a = ' + mtlTxt(mtlFr(a)) + ', b = ' + mtlTxt(mtlFr(b)) + ', c = ' + mtlTxt(mtlFr(c)) + '. Δ = b² − 4ac = ' + (b < 0 ? '(' + mtlTxt(mtlFr(b)) + ')' : b) + '² − 4·' + (a < 0 ? '(' + a + ')' : a) + '·' + (c < 0 ? '(' + c + ')' : c) + ' = ' + mtlTxt(mtlFr(delta)) + '.');
  const raizes = [];
  if (delta === 0) {
    const x = mtlFr(-b, 2 * a);
    passos.push('Δ = 0: raiz dupla, ' + rotuloX + ' = −b/2a = ' + mtlTxt(x) + '.');
    raizes.push({ txt: mtlTxt(x), re: mtlVal(x), im: 0, exata: true });
    raizes.push({ txt: mtlTxt(x), re: mtlVal(x), im: 0, exata: true });
    return { passos: passos, raizes: raizes, delta: delta };
  }
  const raizDelta = Math.sqrt(Math.abs(delta));
  const quadrado = Math.round(raizDelta) * Math.round(raizDelta) === Math.abs(delta);
  if (delta > 0 && quadrado) {
    const s = Math.round(raizDelta);
    const x1 = mtlFr(-b + s, 2 * a), x2 = mtlFr(-b - s, 2 * a);
    passos.push('√Δ = ' + s + ', então ' + rotuloX + ' = (−b ± √Δ)/2a = (' + mtlTxt(mtlFr(-b)) + ' ± ' + s + ')/' + (2 * a) + '.');
    raizes.push({ txt: mtlTxt(x1), re: mtlVal(x1), im: 0, exata: true, fr: x1 });
    raizes.push({ txt: mtlTxt(x2), re: mtlVal(x2), im: 0, exata: true, fr: x2 });
    return { passos: passos, raizes: raizes, delta: delta };
  }
  const rad = mtlRadical(Math.abs(delta));
  let g = mtlMdc(mtlMdc(b, rad.k), 2 * a) || 1;
  let B = -b / g, K = rad.k / g, D = (2 * a) / g;
  if (D < 0) { B = -B; D = -D; }
  const forma = mtlRaizTxt(B, K, rad.r, D, delta < 0, 0);
  if (delta > 0) {
    passos.push('Δ não é quadrado perfeito: √Δ = ' + (rad.k > 1 ? rad.k : '') + '√' + rad.r + (rad.k > 1 ? ' (simplificado)' : '') + '. ' + rotuloX + ' = ' + forma + '.');
    const re = B / D, im = (K * Math.sqrt(rad.r)) / D;
    raizes.push({ txt: mtlRaizTxt(B, K, rad.r, D, false, 1) + ' ' + '(' + mtlAprox(re + im) + ')', re: re + im, im: 0, exata: false });
    raizes.push({ txt: mtlRaizTxt(B, K, rad.r, D, false, -1) + ' ' + '(' + mtlAprox(re - im) + ')', re: re - im, im: 0, exata: false });
  } else {
    passos.push('Δ < 0: não há raízes reais; no conjunto dos complexos, √Δ = ' + (rad.k > 1 ? rad.k : '') + (rad.r === 1 ? '' : '√' + rad.r) + 'i. ' + rotuloX + ' = ' + forma + '.');
    const re = B / D, im = (K * Math.sqrt(rad.r)) / D;
    raizes.push({ txt: mtlRaizTxt(B, K, rad.r, D, true, 1), re: re, im: im, exata: false });
    raizes.push({ txt: mtlRaizTxt(B, K, rad.r, D, true, -1), re: re, im: -im, exata: false });
  }
  return { passos: passos, raizes: raizes, delta: delta };
}

// Polinômio de frações para coeficientes inteiros (multiplica pelo mmc e divide pelo mdc). Devolve { inteiros:[...], fator }.
function mtlInteiros(p) {
  let mmc = 1;
  p.forEach(function (c) { mmc = mmc / mtlMdc(mmc, c.d) * c.d; if (mmc > 1e12) throw new Error('grande'); });
  let r = p.map(function (c) { return c.n * (mmc / c.d); });
  let g = 0;
  r.forEach(function (x) { g = mtlMdc(g, x); });
  if (g > 1) r = r.map(function (x) { return x / g; });
  return { inteiros: r, fator: mmc / (g || 1) };
}

function mtlDivisores(n) {
  n = Math.abs(n);
  const d = [];
  for (let i = 1; i * i <= n; i++) { if (n % i === 0) { d.push(i); if (i * i !== n) d.push(n / i); } }
  return d.sort(function (a, b) { return a - b; });
}

// Briot-Ruffini: divide p (grau crescente) por (x − r). Devolve { q, resto }.
function mtlBriot(p, r) {
  const n = p.length - 1;
  const q = new Array(n);
  let acc = p[n];
  for (let k = n - 1; k >= 0; k--) { q[k] = acc; acc = mtlSoma(mtlMul(acc, r), p[k]); }
  return { q: q, resto: acc };
}

function mtlComplexoPoli(p, re, im) {
  let a = 0, b = 0;
  for (let k = p.length - 1; k >= 0; k--) { const na = a * re - b * im + mtlVal(p[k]); b = a * im + b * re; a = na; }
  return Math.sqrt(a * a + b * b);
}

// Durand-Kerner: raízes (complexas) aproximadas de um polinômio sem raízes racionais.
function mtlRaizesNumericas(p) {
  const n = p.length - 1;
  const lider = mtlVal(p[n]);
  const c = p.map(function (x) { return mtlVal(x) / lider; });
  let raio = 0;
  for (let k = 0; k < n; k++) raio = Math.max(raio, Math.abs(c[k]));
  raio = 1 + raio;
  let z = [];
  for (let k = 0; k < n; k++) { const ang = 2 * Math.PI * k / n + 0.4; z.push({ re: raio * 0.7 * Math.cos(ang), im: raio * 0.7 * Math.sin(ang) }); }
  for (let it = 0; it < 500; it++) {
    let maior = 0;
    for (let i = 0; i < n; i++) {
      let pr = 1, pi = 0;
      for (let k = n - 1; k >= 0; k--) { const nr = pr * z[i].re - pi * z[i].im + c[k]; pi = pr * z[i].im + pi * z[i].re; pr = nr; }
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; const ar = z[i].re - z[j].re, ai = z[i].im - z[j].im; const nr = dr * ar - di * ai; di = dr * ai + di * ar; dr = nr; }
      const den = dr * dr + di * di || 1e-300;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      z[i] = { re: z[i].re - qr, im: z[i].im - qi };
      maior = Math.max(maior, Math.abs(qr) + Math.abs(qi));
    }
    if (maior < 1e-13) break;
  }
  return z.map(function (w) { return { re: Math.abs(w.re) < 1e-9 ? 0 : w.re, im: Math.abs(w.im) < 1e-9 ? 0 : w.im }; });
}

function mtlNumeroComplexoTxt(re, im) {
  const a = mtlAprox(re), b = mtlAprox(Math.abs(im));
  if (im === 0) return a;
  return (re === 0 ? '' : a + ' ') + (im < 0 ? '− ' : (re === 0 ? '' : '+ ')) + (Math.abs(im) === 1 ? '' : b.replace('≈ ', '')) + 'i';
}

// Resolve p(x) = 0. Devolve { passos, raizes:[{txt, re, im, exata, mult}], todasRacionais, aproximado }.
function mtlResolverPoli(p) {
  p = mtlPAparar(p);
  const grau = p.length - 1;
  const passos = [];
  const raizes = [];
  let aproximado = false;
  if (grau === 1) {
    const x = mtlDiv(mtlNeg(p[0]), p[1]);
    passos.push('Equação do 1º grau: ' + mtlPoliTxt(p) + ' = 0 ⇒ x = −b/a = ' + mtlTxt(x) + '.');
    return { passos: passos, raizes: [{ txt: mtlTxt(x), re: mtlVal(x), im: 0, exata: true, fr: x }], todasRacionais: true, aproximado: false };
  }
  const conv = mtlInteiros(p);
  let c = conv.inteiros;
  if (conv.fator !== 1 || c.some(function (x, i) { return !mtlIgual(mtlFr(x), mtlMul(p[i], mtlFr(conv.fator))); })) {
    passos.push('Coeficientes inteiros (multiplicando por ' + mtlTxt(mtlFr(conv.fator)) + ' ou dividindo pelo fator comum): ' + mtlPoliTxt(c.map(function (x) { return mtlFr(x); })) + ' = 0.');
  }
  let atual = c.map(function (x) { return mtlFr(x); });
  // fator x (raiz zero)
  let zeros = 0;
  while (atual.length > 1 && mtlZero(atual[0])) { atual = atual.slice(1); zeros++; }
  if (zeros) {
    passos.push('O termo independente é 0: x é fator ' + (zeros > 1 ? zeros + ' vezes' : '') + ', logo x = 0 é raiz' + (zeros > 1 ? ' de multiplicidade ' + zeros : '') + '. Sobra ' + mtlPoliTxt(atual) + ' = 0.');
    raizes.push({ txt: '0', re: 0, im: 0, exata: true, fr: mtlFr(0), mult: zeros });
  }
  // raízes racionais (teorema das raízes racionais + Briot-Ruffini)
  let teste = 0;
  let procurar = atual.length > 3;
  let candidatasMostradas = false;
  while (procurar && atual.length > 3) {
    const ints = mtlTenta(function () { return mtlInteiros(atual).inteiros; });
    if (!ints) break;
    const a0 = Math.abs(ints[0]), an = Math.abs(ints[ints.length - 1]);
    if (a0 > 1e9 || an > 1e9) break;
    const dp = mtlDivisores(a0), dq = mtlDivisores(an);
    if (dp.length * dq.length > 4000) break;   // número grande demais para testar um a um: segue para o método numérico
    const cands = [];
    dp.forEach(function (pp) { dq.forEach(function (qq) { if (mtlMdc(pp, qq) === 1) { cands.push(mtlFr(pp, qq)); cands.push(mtlFr(-pp, qq)); } }); });
    cands.sort(function (u, v) { return Math.abs(mtlVal(u)) - Math.abs(mtlVal(v)) || mtlVal(v) - mtlVal(u); });
    if (!candidatasMostradas) {
      passos.push('Raízes racionais possíveis: ±(divisores de ' + a0 + ') ÷ (divisores de ' + an + ') = ' + cands.slice(0, 14).map(mtlTxt).join(', ') + (cands.length > 14 ? ', …' : '') + '.');
      candidatasMostradas = true;
    }
    let achou = null;
    for (let i = 0; i < cands.length && i < 400; i++) {
      teste++;
      const r = mtlTenta(function () { return mtlBriot(atual, cands[i]); });
      if (r && mtlZero(r.resto)) { achou = { r: cands[i], q: r.q }; break; }
    }
    if (!achou) break;
    passos.push('Teste: p(' + mtlTxt(achou.r) + ') = 0, então ' + mtlTxt(achou.r) + ' é raiz. Briot-Ruffini por (x ' + (achou.r.n < 0 ? '+ ' + mtlTxt(mtlNeg(achou.r)) : '− ' + mtlTxt(achou.r)) + '): quociente ' + mtlPoliTxt(achou.q) + '.');
    const existente = raizes.filter(function (z) { return z.fr && mtlIgual(z.fr, achou.r); })[0];
    if (existente) existente.mult = (existente.mult || 1) + 1;
    else raizes.push({ txt: mtlTxt(achou.r), re: mtlVal(achou.r), im: 0, exata: true, fr: achou.r, mult: 1 });
    atual = achou.q;
  }
  // o que sobrou
  const m = atual.length - 1;
  if (m === 2) {
    const ints = mtlInteiros(atual).inteiros;
    const q = mtlBhaskara(ints[2], ints[1], ints[0]);
    passos.push('Resta ' + mtlPoliTxt(atual) + ' = 0 (2º grau). ' + q.passos.join(' '));
    q.raizes.forEach(function (z) { raizes.push(z); });
    if (q.raizes.some(function (z) { return !z.exata; })) aproximado = aproximado || false;
  } else if (m === 1) {
    const x = mtlDiv(mtlNeg(atual[0]), atual[1]);
    passos.push('Resta ' + mtlPoliTxt(atual) + ' = 0 ⇒ x = ' + mtlTxt(x) + '.');
    const ex = raizes.filter(function (z) { return z.fr && mtlIgual(z.fr, x); })[0];
    if (ex) ex.mult = (ex.mult || 1) + 1; else raizes.push({ txt: mtlTxt(x), re: mtlVal(x), im: 0, exata: true, fr: x, mult: 1 });
  } else if (m >= 3) {
    const par = atual.every(function (c2, k) { return k % 2 === 0 || mtlZero(c2); });
    if (m === 4 && par) {
      const ints = mtlInteiros([atual[0], atual[2], atual[4]]).inteiros;
      const q = mtlBhaskara(ints[2], ints[1], ints[0], 't');
      passos.push('Biquadrada: com t = x², ' + mtlPoliTxt(ints.map(function (x) { return mtlFr(x); }), 't') + ' = 0. ' + q.passos.join(' '));
      q.raizes.forEach(function (tz) {
        if (tz.im === 0) {
          if (tz.re > 1e-12) {
            const rt = Math.sqrt(tz.re);
            const exato = tz.exata && Math.round(rt) * Math.round(rt) === Math.round(tz.re) && Number.isInteger(tz.re);
            const txtR = exato ? String(Math.round(rt)) : (tz.fr ? '√(' + tz.txt + ')' : '√t');
            passos.push('x² = ' + tz.txt.replace(/\s*\(.*$/, '') + ' ⇒ x = ±' + txtR + (exato ? '' : ' (≈ ±' + mtlAprox(rt).replace('≈ ', '') + ')') + '.');
            raizes.push({ txt: (exato ? '' : '') + txtR, re: rt, im: 0, exata: exato });
            raizes.push({ txt: '−' + txtR, re: -rt, im: 0, exata: exato });
          } else if (Math.abs(tz.re) <= 1e-12) { raizes.push({ txt: '0', re: 0, im: 0, exata: true }); raizes.push({ txt: '0', re: 0, im: 0, exata: true }); }
          else {
            const rt = Math.sqrt(-tz.re);
            passos.push('x² = ' + tz.txt.replace(/\s*\(.*$/, '') + ' < 0: x = ±i√' + mtlAprox(-tz.re).replace('≈ ', '') + ' (complexas).');
            raizes.push({ txt: mtlNumeroComplexoTxt(0, rt), re: 0, im: rt, exata: false });
            raizes.push({ txt: mtlNumeroComplexoTxt(0, -rt), re: 0, im: -rt, exata: false });
          }
        } else {
          mtlRaizesNumericas(atual).forEach(function (w) { raizes.push({ txt: mtlNumeroComplexoTxt(w.re, w.im), re: w.re, im: w.im, exata: false }); });
          aproximado = true;
        }
      });
    } else {
      passos.push('Sem mais raízes racionais: o fator ' + mtlPoliTxt(atual) + ' não se resolve por fórmula simples. Raízes aproximadas (método numérico de Durand-Kerner):');
      mtlRaizesNumericas(atual).forEach(function (w) { raizes.push({ txt: mtlNumeroComplexoTxt(w.re, w.im), re: w.re, im: w.im, exata: false }); });
      aproximado = true;
    }
  }
  // expande multiplicidade em lista final
  const lista = [];
  raizes.forEach(function (z) { const mult = z.mult || 1; for (let k = 0; k < mult; k++) lista.push(z); });
  lista.sort(function (a, b) { return (a.im !== 0) - (b.im !== 0) || a.re - b.re || a.im - b.im; });
  const todasRacionais = lista.length === grau && lista.every(function (z) { return z.fr; });
  return { passos: passos, raizes: lista, todasRacionais: todasRacionais, aproximado: aproximado, testes: teste };
}

// Confere as raízes no polinômio original e, se todas são racionais, por Girard.
function mtlConferirRaizes(p, r) {
  const grau = p.length - 1;
  const partes = [];
  let ok = true;
  r.raizes.forEach(function (z) {
    const erro = mtlComplexoPoli(p, z.re, z.im);
    const esc = Math.max(1, Math.abs(z.re) + Math.abs(z.im));
    if (!(erro <= 1e-6 * Math.pow(esc, grau) * (1 + p.reduce(function (a, c) { return a + Math.abs(mtlVal(c)); }, 0)))) ok = false;
  });
  partes.push(ok ? 'cada raiz, posta no polinômio, dá 0 (conferido por substituição)' : 'verifique: alguma raiz não zerou o polinômio na conferência numérica');
  if (r.todasRacionais && r.raizes.length === grau) {
    let soma = mtlFr(0), prod = mtlFr(1);
    r.raizes.forEach(function (z) { soma = mtlSoma(soma, z.fr); prod = mtlMul(prod, z.fr); });
    const esperadaSoma = mtlNeg(mtlDiv(p[grau - 1], p[grau]));
    const esperadoProd = mtlDiv(p[0], p[grau]);
    const prodCorreto = grau % 2 === 0 ? esperadoProd : mtlNeg(esperadoProd);
    partes.push('Girard: soma ' + mtlTxt(soma) + (mtlIgual(soma, esperadaSoma) ? ' = −' + 'b/a' : ' ≠ −b/a') + ', produto ' + mtlTxt(prod) + (mtlIgual(prod, prodCorreto) ? ' = (−1)ⁿ·a₀/aₙ' : ' ≠ (−1)ⁿ·a₀/aₙ'));
  }
  return partes.join('; ') + '.';
}

function mtlFatorado(p, raizes) {
  const an = p[p.length - 1];
  const partes = raizes.map(function (z) { return '(x ' + (z.fr.n < 0 ? '+ ' + mtlTxt(mtlNeg(z.fr)) : '− ' + mtlTxt(z.fr)) + ')'; });
  const lider = mtlIgual(an, mtlFr(1)) ? '' : (an.d === 1 ? mtlTxt(an) : '(' + mtlTxt(an) + ')') + '·';
  const cont = {};
  const ordem = [];
  partes.forEach(function (s) { if (!cont[s]) { cont[s] = 0; ordem.push(s); } cont[s]++; });
  return lider + ordem.map(function (s) { return s + (cont[s] > 1 ? mtlSup(cont[s]) : ''); }).join('');
}

// ------------------------------------------------------------------ localizar equação e função no texto

const MTL_PERM_X = '0123456789x^+-*/.,() ';

// Equações "esq = dir" (só em x). Devolve { esq, dir } do primeiro par que lê como polinômio, ou null.
function mtlAcharEquacaoX(n) {
  const trechos = mtlTrechos(n, MTL_PERM_X + '=');
  for (let i = 0; i < trechos.length; i++) {
    const t = trechos[i].txt;
    if (t.indexOf('=') < 0 || t.split('=').length !== 2) continue;
    if (/^\(\s*x\s*\)/.test(t)) continue;   // "f(x) = ..." é definição de função, não equação
    const lados = t.split('=');
    // vírgula que separa frases ("x²−4=0, ache...") não é decimal
    const esq = mtlLerPoli(lados[0].replace(/,\s*$/, '')), dir = mtlLerPoli(lados[1].replace(/[,.]\s*$/, ''));
    if (esq && dir && (esq.length > 1 || dir.length > 1)) return { esq: esq, dir: dir };
  }
  return null;
}

// Definições de função: "f(x) = ...", "p(x) = ...", "y = ..." (nome de uma letra). Devolve { nome, poli, total } da primeira, com o total de nomes
// diferentes definidos no texto (mais de um: a pergunta pode ser sobre outra função), ou null.
function mtlAcharFuncao(n) {
  const re = /(?:^|[^a-z0-9])([a-z])\s*(?:\(\s*x\s*\))?\s*=\s*/g;
  let m;
  let primeira = null;
  const nomes = [];
  while ((m = re.exec(n))) {
    if (m[1] === 'x') continue;
    const resto = n.slice(m.index + m[0].length);
    const tr = mtlTrechos(' ' + resto, MTL_PERM_X);
    if (!tr.length || tr[0].ini > 1) continue;
    const txt = tr[0].txt.replace(/[.,]\s*$/, '');
    const poli = mtlLerPoli(txt);
    if (poli && poli.length > 1) {
      if (nomes.indexOf(m[1]) < 0) nomes.push(m[1]);
      if (!primeira) primeira = { nome: m[1], poli: poli };
    }
  }
  return primeira ? { nome: primeira.nome, poli: primeira.poli, total: nomes.length } : null;
}

// Qualquer polinômio em x que apareça no texto (o mais longo que se lê); para "derivada de x^3 - 4x".
function mtlAcharPoliQualquer(n) {
  const trechos = mtlTrechos(n, MTL_PERM_X).filter(function (t) { return t.txt.indexOf('x') >= 0; });
  trechos.sort(function (a, b) { return b.txt.length - a.txt.length; });
  for (let i = 0; i < trechos.length; i++) {
    const limpo = trechos[i].txt.replace(/[.,]\s*$/, '');
    const p = mtlLerPoli(limpo);
    if (p && p.length >= 1) return { poli: p, ini: trechos[i].ini, fim: trechos[i].fim };
  }
  return null;
}

const MTL_FUNCAO_ESTRANHA = /\b(sen|cos|tg|tan|sec|cossec|cotg|log|ln|sqrt|exp|mod|lim|sen[oh])\b|\braiz (?:quadrada|cubica|de)\b|\||∑|∫/;

// ------------------------------------------------------------------ solvers: polinômios e funções

function mtlSolverEquacao(n) {
  if (MTL_FUNCAO_ESTRANHA.test(n)) return null;
  let p = null, titulo = '';
  const eq = mtlAcharEquacaoX(n);
  const fn = mtlAcharFuncao(n);
  const pedeRaiz = /\b(raiz|raizes|zero|zeros|resolva|resolver|equacao|solucao|conjunto|determine as|encontre as|ache as)\b/.test(n);
  if (fn && fn.total === 1 && mtlGrau(fn.poli) >= 2 && /\braiz|zeros?\b/.test(n) && !/=\s*[-0-9x(]*\s*=/.test(n)) { p = fn.poli; titulo = 'Raízes de ' + fn.nome + '(x) = ' + mtlPoliTxt(fn.poli); }
  else if (eq) {
    p = mtlPSoma(eq.esq, mtlPNeg(eq.dir));
    if (mtlGrau(p) < 1) return null;
    titulo = 'Equação ' + mtlPoliTxt(eq.esq) + ' = ' + mtlPoliTxt(eq.dir);
  } else if (fn && fn.total === 1 && pedeRaiz) { p = fn.poli; titulo = 'Raízes de ' + fn.nome + '(x) = ' + mtlPoliTxt(fn.poli); }
  if (!p) return null;
  const grau = mtlGrau(p);
  if (grau < 1 || grau > 8) return null;
  const r = mtlTenta(function () { return mtlResolverPoli(p); });
  if (!r || !r.raizes.length) return null;
  const passos = [];
  if (eq) passos.push('Passando tudo para um lado: ' + mtlPoliTxt(p) + ' = 0 (grau ' + grau + ').');
  r.passos.forEach(function (s) { passos.push(s); });
  const reais = r.raizes.filter(function (z) { return z.im === 0; });
  const dist = [];
  r.raizes.forEach(function (z) { if (!dist.some(function (w) { return w.txt === z.txt; })) dist.push(z); });
  let resposta = 'x ∈ {' + dist.map(function (z) { return z.txt; }).join('; ') + '}';
  const mult = r.raizes.length - dist.length;
  if (r.todasRacionais) resposta += '. Forma fatorada: p(x) = ' + mtlFatorado(p, r.raizes);
  if (mult > 0) resposta += ' (há raiz repetida: ' + r.raizes.length + ' raízes contando multiplicidade)';
  if (reais.length < r.raizes.length) resposta += '. Raízes reais: ' + (reais.length ? Array.from(new Set(reais.map(function (z) { return z.txt; }))).join('; ') : 'nenhuma');
  return { titulo: titulo, passos: passos, resposta: resposta, conferencia: mtlConferirRaizes(p, r), aproximado: r.aproximado || r.raizes.some(function (z) { return !z.exata; }) };
}

function mtlSolverFuncao2(n) {
  if (MTL_FUNCAO_ESTRANHA.test(n)) return null;
  const fn = mtlAcharFuncao(n);
  if (!fn) return null;
  const p = fn.poli;
  const semDef = n.replace(/(?:^|[^a-z0-9])[a-z]\s*\(\s*x\s*\)/g, ' ');
  const reK = /(?:^|[^a-z0-9])([a-z])\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)/g;
  let pontual = null, mk;
  while ((mk = reK.exec(semDef))) { if (mk[1] === fn.nome) { pontual = [mk[0], mk[2]]; break; } }
  const quer = /\b(vertice|maximo|minimo|ponto de maximo|ponto de minimo|eixo de simetria|valor maximo|valor minimo|imagem)\b/.test(n);
  const passos = [];
  const respostas = [];
  let titulo = 'Função ' + fn.nome + '(x) = ' + mtlPoliTxt(p);
  let feito = false;
  if (pontual && !/vertice/.test(n)) {
    const k = mtlLerNumero(pontual[1].replace('-', ''));
    const kk = pontual[1].charAt(0) === '-' ? mtlNeg(k) : k;
    const v = mtlPAval(p, kk);
    passos.push('Substituindo x = ' + mtlTxt(kk) + ': ' + fn.nome + '(' + mtlTxt(kk) + ') = ' + mtlPoliTxt(p).replace(/x/g, '(' + mtlTxt(kk) + ')') + ' = ' + mtlTxt(v) + '.');
    respostas.push(fn.nome + '(' + mtlTxt(kk) + ') = ' + mtlTxt(v));
    feito = true;
  }
  const analise = /\b(raiz|raizes|zero|zeros|grafico|parabola|concavidade|estude|analise|discuta|sinal)\b/.test(n);
  if (mtlGrau(p) === 2 && (quer || (analise && !feito))) {
    const a = p[2], b = p[1] || mtlFr(0), c = p[0] || mtlFr(0);
    const xv = mtlDiv(mtlNeg(b), mtlMul(mtlFr(2), a));
    const yv = mtlPAval(p, xv);
    const delta = mtlSub(mtlMul(b, b), mtlMul(mtlFr(4), mtlMul(a, c)));
    passos.push('a = ' + mtlTxt(a) + ', b = ' + mtlTxt(b) + ', c = ' + mtlTxt(c) + '. Concavidade para ' + (a.n > 0 ? 'cima (a > 0): tem MÍNIMO' : 'baixo (a < 0): tem MÁXIMO') + '.');
    passos.push('Vértice: xᵥ = −b/2a = ' + mtlTxt(xv) + ' e yᵥ = ' + fn.nome + '(xᵥ) = ' + mtlTxt(yv) + ' (também yᵥ = −Δ/4a = ' + mtlTxt(mtlDiv(mtlNeg(delta), mtlMul(mtlFr(4), a))) + ' com Δ = ' + mtlTxt(delta) + ').');
    respostas.push('vértice V(' + mtlTxt(xv) + '; ' + mtlTxt(yv) + '), ' + (a.n > 0 ? 'valor mínimo ' : 'valor máximo ') + mtlTxt(yv) + ', eixo de simetria x = ' + mtlTxt(xv) + ', corta o eixo y em ' + mtlTxt(c));
    const r = mtlTenta(function () { return mtlResolverPoli(p); });
    if (r && r.raizes.every(function (z) { return z.im === 0; })) respostas.push('raízes ' + Array.from(new Set(r.raizes.map(function (z) { return z.txt; }))).join('; '));
    else if (r) respostas.push('sem raízes reais (Δ < 0), a parábola não toca o eixo x');
    feito = true;
  }
  if (!feito) return null;
  if (fn.total > 1 && !pontual) return null;
  return { titulo: titulo, passos: passos, resposta: respostas.join('; '), conferencia: 'o vértice é o ponto onde f deixa de crescer e passa a decrescer (ou o contrário); yᵥ foi calculado de duas formas e coincide.', aproximado: false };
}

// ------------------------------------------------------------------ derivada e integral de polinômio

function mtlDerivada(p) { const r = []; for (let k = 1; k < p.length; k++) r.push(mtlMul(p[k], mtlFr(k))); return r.length ? mtlPAparar(r) : [mtlFr(0)]; }
function mtlPrimitiva(p) { const r = [mtlFr(0)]; for (let k = 0; k < p.length; k++) r.push(mtlDiv(p[k], mtlFr(k + 1))); return r; }

function mtlSolverCalculo(n) {
  const deriv = /\b(deriv\w*|taxa de variacao|reta tangente|tangente a)\b/.test(n);
  const integ = /\b(integra\w*|primitiva|antiderivada|area sob|area abaixo)\b/.test(n);
  if (!deriv && !integ) return null;
  if (MTL_FUNCAO_ESTRANHA.test(n)) return null;
  const fn = mtlAcharFuncao(n);
  let limpo = n;
  // limites "de 0 a 2" / "entre 0 e 3" saem do texto antes de procurar o polinômio
  let lim = null;
  let mm = /\b(?:de|entre|no intervalo de)\s*\[?\s*(-?\d+(?:[.,]\d+)?(?:\/\d+)?)\s*(?:a|ate|e|,|;)\s*(-?\d+(?:[.,]\d+)?(?:\/\d+)?)\s*\]?/.exec(n);
  if (integ && mm) { lim = [mm[1], mm[2]]; limpo = n.replace(mm[0], ' '); }
  let ponto = null;
  const mp = /\b(?:em|no ponto|para|quando|se)\s*x\s*=\s*(-?\d+(?:[.,]\d+)?(?:\/\d+)?)/.exec(n);
  if (mp) ponto = mp[1];
  let poli = null;
  if (fn && mtlGrau(fn.poli) >= 1) poli = fn.poli;
  else {
    const t = mtlAcharPoliQualquer(limpo.replace(/\bx\s*=\s*-?\d+(?:[.,]\d+)?/, ' '));
    if (t) poli = t.poli;
  }
  if (!poli) return null;
  const lerFr = function (s) { const m = /^(-?)(\d+(?:[.,]\d+)?)(?:\/(\d+))?$/.exec(s); if (!m) throw new Error('n'); let v = mtlLerNumero(m[2]); if (m[3]) v = mtlDiv(v, mtlFr(Number(m[3]))); return m[1] ? mtlNeg(v) : v; };
  const passos = [];
  if (deriv) {
    const d = mtlDerivada(poli);
    const termos = [];
    poli.forEach(function (c, k) { if (k >= 1 && !mtlZero(c)) termos.push('(' + mtlPoliTxt([].concat(new Array(k).fill(mtlFr(0)), [c])) + ')′ = ' + mtlPoliTxt([].concat(new Array(k - 1).fill(mtlFr(0)), [mtlMul(c, mtlFr(k))]))); });
    passos.push('Regra do tombo, (c·xⁿ)′ = c·n·xⁿ⁻¹, termo a termo (constante deriva para 0): ' + (termos.length ? termos.join('; ') : 'só constante') + '.');
    let resposta = 'f′(x) = ' + mtlPoliTxt(d);
    if (ponto) {
      const a = mtlTenta(function () { return lerFr(ponto); });
      if (a) {
        const fa = mtlPAval(poli, a), da = mtlPAval(d, a);
        passos.push('Em x = ' + mtlTxt(a) + ': f(' + mtlTxt(a) + ') = ' + mtlTxt(fa) + ' e f′(' + mtlTxt(a) + ') = ' + mtlTxt(da) + '.');
        resposta += '; f′(' + mtlTxt(a) + ') = ' + mtlTxt(da);
        if (/tangente/.test(n)) {
          // y = f'(a)(x − a) + f(a) = f'(a)·x + (f(a) − f'(a)·a)
          const b0 = mtlSub(fa, mtlMul(da, a));
          passos.push('Reta tangente: y − f(a) = f′(a)(x − a) ⇒ y = ' + mtlPoliTxt([b0, da]) + '.');
          resposta += '; reta tangente: y = ' + mtlPoliTxt([b0, da]) + ' (coeficiente angular ' + mtlTxt(da) + ')';
        }
      }
    }
    return { titulo: 'Derivada de f(x) = ' + mtlPoliTxt(poli), passos: passos, resposta: resposta, conferencia: 'a derivada de um polinômio de grau ' + mtlGrau(poli) + ' tem grau ' + Math.max(0, mtlGrau(poli) - 1) + '; derivando o resultado de uma primitiva volta ao original.', aproximado: false };
  }
  const F = mtlPrimitiva(poli);
  passos.push('Regra da potência, ∫c·xⁿ dx = c·xⁿ⁺¹/(n+1), termo a termo: F(x) = ' + mtlPoliTxt(F) + (lim ? '' : ' + C') + '.');
  if (lim) {
    const a = mtlTenta(function () { return lerFr(lim[0].replace(',', '.')); }), b = mtlTenta(function () { return lerFr(lim[1].replace(',', '.')); });
    if (a && b) {
      const Fb = mtlPAval(F, b), Fa = mtlPAval(F, a);
      const v = mtlSub(Fb, Fa);
      passos.push('Teorema fundamental: ∫ de ' + mtlTxt(a) + ' a ' + mtlTxt(b) + ' = F(' + mtlTxt(b) + ') − F(' + mtlTxt(a) + ') = ' + mtlTxt(Fb) + ' − (' + mtlTxt(Fa) + ') = ' + mtlTxt(v) + '.');
      return { titulo: 'Integral definida de ' + mtlPoliTxt(poli), passos: passos, resposta: mtlTxt(v) + (v.d !== 1 ? ' (≈ ' + mtlAprox(mtlVal(v)).replace('≈ ', '') + ')' : ''), conferencia: 'derivar F devolve o integrando; o valor é a área com sinal entre o gráfico e o eixo x (negativa onde f < 0).', aproximado: false };
    }
  }
  return { titulo: 'Integral indefinida de ' + mtlPoliTxt(poli), passos: passos, resposta: '∫ ' + mtlPoliTxt(poli) + ' dx = ' + mtlPoliTxt(F) + ' + C', conferencia: 'derivando F(x) obtém-se ' + mtlPoliTxt(mtlDerivada(F)) + ', o integrando.', aproximado: false };
}

// ------------------------------------------------------------------ sistemas lineares

const MTL_ALG_LIN = {
  vars: 'xyz',
  num: function (f) { return { c: f, x: mtlFr(0), y: mtlFr(0), z: mtlFr(0), cte: true }; },
  variavel: function (v) { const r = { c: mtlFr(0), x: mtlFr(0), y: mtlFr(0), z: mtlFr(0), cte: false }; r[v] = mtlFr(1); return r; },
  soma: function (a, b) { return { c: mtlSoma(a.c, b.c), x: mtlSoma(a.x, b.x), y: mtlSoma(a.y, b.y), z: mtlSoma(a.z, b.z), cte: a.cte && b.cte }; },
  sub: function (a, b) { return MTL_ALG_LIN.soma(a, MTL_ALG_LIN.neg(b)); },
  neg: function (a) { return { c: mtlNeg(a.c), x: mtlNeg(a.x), y: mtlNeg(a.y), z: mtlNeg(a.z), cte: a.cte }; },
  mul: function (a, b) {
    if (a.cte) return { c: mtlMul(a.c, b.c), x: mtlMul(a.c, b.x), y: mtlMul(a.c, b.y), z: mtlMul(a.c, b.z), cte: b.cte };
    if (b.cte) return { c: mtlMul(b.c, a.c), x: mtlMul(b.c, a.x), y: mtlMul(b.c, a.y), z: mtlMul(b.c, a.z), cte: a.cte };
    throw new Error('nao-linear');
  },
  div: function (a, b) { if (!b.cte || mtlZero(b.c)) throw new Error('div'); return MTL_ALG_LIN.mul(a, { c: mtlDiv(mtlFr(1), b.c), x: mtlFr(0), y: mtlFr(0), z: mtlFr(0), cte: true }); },
  pot: function (a, k) { if (k === 1) return a; if (a.cte) return { c: mtlPotF(a.c, k), x: mtlFr(0), y: mtlFr(0), z: mtlFr(0), cte: true }; throw new Error('nao-linear'); }
};

// Equações lineares em x, y, z. Devolve { eqs:[{x,y,z,c}], vars:['x','y'] } ou null.
function mtlLerSistema(n) {
  // separadores: ";", ", ", " e ", e a quebra implícita "10 x-y" (dois operandos sem operador no meio)
  const base = ' ' + n.replace(/\be\b/g, ' ; ').replace(/;/g, ' ; ').replace(/,\s/g, ' ; ').replace(/[{}]/g, ' ') + ' ';
  const trechos = mtlTrechos(base, '0123456789xyz^+-*/.,() =;');
  const eqs = [];
  trechos.forEach(function (t) {
    t.txt.split(';').forEach(function (seg) {
      seg = seg.replace(/^[\s,.]+|[\s,.]+$/g, '');
      if (seg.indexOf('=') < 0) return;
      // dois "=" no mesmo segmento: o que vem depois do 1º lado direito é outra equação
      let partes = seg.split('=');
      if (partes.length > 2) {
        const novas = [partes[0]];
        for (let i = 1; i < partes.length; i++) {
          if (i === partes.length - 1) { novas.push(partes[i]); break; }
          const tok = partes[i].trim().split(' ');
          const corte = tok.findIndex ? tok.findIndex(function (w, j) { return j > 0 && /^[0-9xyz(]/.test(w) && /[0-9xyz)]$/.test(tok[j - 1]); }) : -1;
          if (corte < 0) throw new Error('fronteira');
          novas.push(tok.slice(0, corte).join(' '));
          novas.push('#');
          novas.push(tok.slice(corte).join(' '));
        }
        let atual = [];
        const grupos = [];
        novas.forEach(function (x) { if (x === '#') { grupos.push(atual.join('=')); atual = []; } else atual.push(x); });
        grupos.push(atual.join('='));
        grupos.forEach(function (g) { eqs.push(g); });
      } else eqs.push(seg);
    });
  });
  const lidas = [];
  for (let i = 0; i < eqs.length; i++) {
    const lados = eqs[i].split('=');
    if (lados.length !== 2) return null;
    const e = mtlTenta(function () { return mtlAnalisar(lados[0], MTL_ALG_LIN); });
    const d = mtlTenta(function () { return mtlAnalisar(lados[1], MTL_ALG_LIN); });
    if (!e || !d) return null;
    const dif = MTL_ALG_LIN.sub(e, d);
    lidas.push({ x: dif.x, y: dif.y, z: dif.z, c: mtlNeg(dif.c), txt: eqs[i].trim() });
  }
  if (lidas.length < 2) return null;
  const usa = ['x', 'y', 'z'].filter(function (v) { return lidas.some(function (e) { return !mtlZero(e[v]); }); });
  if (usa.length < 2) return null;
  return { eqs: lidas, vars: usa };
}

function mtlLinhaEq(e, vars) {
  let s = '';
  vars.forEach(function (v) {
    const c = e[v];
    if (mtlZero(c)) return;
    const neg = c.n < 0, ab = mtlFr(Math.abs(c.n), c.d);
    const corpo = (mtlIgual(ab, mtlFr(1)) ? '' : (ab.d === 1 ? mtlTxt(ab) : '(' + mtlTxt(ab) + ')')) + v;
    s += s ? (neg ? ' − ' : ' + ') + corpo : (neg ? '−' : '') + corpo;
  });
  return (s || '0') + ' = ' + mtlTxt(e.c);
}

function mtlSolverSistema(n) {
  if (MTL_FUNCAO_ESTRANHA.test(n)) return null;
  const S = mtlTenta(function () { return mtlLerSistema(n); });
  if (!S) return null;
  const vars = S.vars, nv = vars.length;
  let M = S.eqs.map(function (e) { return vars.map(function (v) { return e[v]; }).concat([e.c]); });
  const passos = [];
  passos.push('Sistema: ' + S.eqs.map(function (e) { return mtlLinhaEq(e, vars); }).join('; ') + '.');
  // Gauss-Jordan
  let linha = 0;
  const pivos = [];
  for (let col = 0; col < nv && linha < M.length; col++) {
    let sel = -1;
    for (let i = linha; i < M.length; i++) { if (!mtlZero(M[i][col])) { sel = i; break; } }
    if (sel < 0) continue;
    if (sel !== linha) { const t = M[sel]; M[sel] = M[linha]; M[linha] = t; passos.push('Troca L' + (linha + 1) + ' ↔ L' + (sel + 1) + '.'); }
    const pv = M[linha][col];
    if (!mtlIgual(pv, mtlFr(1))) { M[linha] = M[linha].map(function (x) { return mtlDiv(x, pv); }); passos.push('L' + (linha + 1) + ' ← L' + (linha + 1) + ' ÷ ' + mtlTxt(pv) + '.'); }
    for (let i = 0; i < M.length; i++) {
      if (i === linha || mtlZero(M[i][col])) continue;
      const f = M[i][col];
      M[i] = M[i].map(function (x, j) { return mtlSub(x, mtlMul(f, M[linha][j])); });
      passos.push('L' + (i + 1) + ' ← L' + (i + 1) + (f.n > 0 ? ' − ' : ' + ') + (mtlIgual(mtlFr(Math.abs(f.n), f.d), mtlFr(1)) ? '' : mtlTxt(mtlFr(Math.abs(f.n), f.d)) + '·') + 'L' + (linha + 1) + '.');
    }
    pivos.push(col);
    linha++;
  }
  // impossível: linha 0 = c ≠ 0
  const impossivel = M.some(function (r) { return r.slice(0, nv).every(mtlZero) && !mtlZero(r[nv]); });
  passos.push('Forma escalonada: ' + M.filter(function (r) { return !r.every(mtlZero); }).map(function (r) { return '[' + r.slice(0, nv).map(mtlTxt).join(' ') + ' | ' + mtlTxt(r[nv]) + ']'; }).join(' '));
  if (impossivel) {
    return { titulo: 'Sistema linear', passos: passos, resposta: 'sistema impossível (SI): uma linha ficou 0 = ' + 'número diferente de 0; não há solução', conferencia: 'duas equações se contradizem.', aproximado: false };
  }
  if (pivos.length === nv) {
    const sol = {};
    pivos.forEach(function (col, k) { sol[vars[col]] = M[k][nv]; });
    // conferência em todas as equações originais
    const ok = S.eqs.every(function (e) { let t = mtlFr(0); vars.forEach(function (v) { t = mtlSoma(t, mtlMul(e[v], sol[v])); }); return mtlIgual(t, e.c); });
    return { titulo: 'Sistema linear ' + nv + '×' + nv, passos: passos, resposta: 'sistema possível e determinado (SPD): ' + vars.map(function (v) { return v + ' = ' + mtlTxt(sol[v]); }).join(', '), conferencia: ok ? 'substituindo nas equações originais, todas se verificam.' : 'atenção: a substituição não fechou; revise os dados.', aproximado: false };
  }
  // indeterminado: variáveis livres como parâmetros
  const livres = vars.filter(function (v, i) { return pivos.indexOf(i) < 0; });
  const param = ['t', 's', 'u'];
  const expr = vars.map(function (v, i) {
    const k = pivos.indexOf(i);
    if (k < 0) return v + ' = ' + param[livres.indexOf(v)];
    let s = mtlTxt(M[k][nv]);
    livres.forEach(function (lv, j) { const c = M[k][vars.indexOf(lv)]; if (!mtlZero(c)) s += (c.n > 0 ? ' − ' : ' + ') + (mtlIgual(mtlFr(Math.abs(c.n), c.d), mtlFr(1)) ? '' : mtlTxt(mtlFr(Math.abs(c.n), c.d)) + '·') + param[j]; });
    return v + ' = ' + s;
  });
  return { titulo: 'Sistema linear', passos: passos, resposta: 'sistema possível e indeterminado (SPI), infinitas soluções com ' + livres.length + ' parâmetro(s): ' + expr.join(', '), conferencia: 'o posto (' + pivos.length + ') é menor que o número de incógnitas (' + nv + ').', aproximado: false };
}

// ------------------------------------------------------------------ matrizes

function mtlLerMatrizes(t) {
  // [[1,2],[3,4]]  [1 2; 3 4]  (1 2; 3 4); entradas com ponto decimal
  const s = String(t).replace(/−/g, '-');
  const achadas = [];
  const re = /\[\s*\[[^\]]*\](?:\s*,?\s*\[[^\]]*\])*\s*\]|\[[^\[\]]*;[^\[\]]*\]|\([^()]*;[^()]*\)/g;
  let m;
  while ((m = re.exec(s))) {
    let corpo = m[0];
    let linhas;
    if (/^\[\s*\[/.test(corpo)) linhas = (corpo.match(/\[[^\[\]]*\]/g) || []).map(function (x) { return x.slice(1, -1); });
    else linhas = corpo.slice(1, -1).split(';');
    const M = [];
    for (let i = 0; i < linhas.length; i++) {
      const ent = linhas[i].trim().split(/[\s,]+/).filter(Boolean);
      if (!ent.length) return null;
      const row = [];
      for (let j = 0; j < ent.length; j++) {
        const q = /^(-?)(\d+(?:\.\d+)?)(?:\/(\d+))?$/.exec(ent[j]);
        if (!q) return null;
        let v = mtlLerNumero(q[2]);
        if (q[3]) v = mtlDiv(v, mtlFr(Number(q[3])));
        row.push(q[1] ? mtlNeg(v) : v);
      }
      M.push(row);
    }
    if (M.some(function (r) { return r.length !== M[0].length; }) || M.length > 6 || M[0].length > 6) return null;
    achadas.push({ M: M, ini: m.index, fim: m.index + m[0].length });
  }
  return achadas;
}

function mtlMatTxt(M) {
  const cel = M.map(function (r) { return r.map(mtlTxt); });
  const larg = [];
  for (let j = 0; j < cel[0].length; j++) larg.push(Math.max.apply(null, cel.map(function (r) { return r[j].length; })));
  return cel.map(function (r) { return '[ ' + r.map(function (x, j) { return new Array(larg[j] - x.length + 1).join(' ') + x; }).join('  ') + ' ]'; }).join('\n');
}

function mtlMatMul(A, B) {
  const R = [];
  for (let i = 0; i < A.length; i++) { R.push([]); for (let j = 0; j < B[0].length; j++) { let s = mtlFr(0); for (let k = 0; k < B.length; k++) s = mtlSoma(s, mtlMul(A[i][k], B[k][j])); R[i].push(s); } }
  return R;
}

function mtlTransp(A) { return A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); }); }
function mtlIdent(k) { const I = []; for (let i = 0; i < k; i++) { I.push([]); for (let j = 0; j < k; j++) I[i].push(mtlFr(i === j ? 1 : 0)); } return I; }

// determinante e posto por eliminação (frações exatas)
function mtlEliminar(A) {
  const M = A.map(function (r) { return r.slice(); });
  let det = mtlFr(1), posto = 0;
  const linhas = M.length, cols = M[0].length;
  let l = 0;
  for (let c = 0; c < cols && l < linhas; c++) {
    let s = -1;
    for (let i = l; i < linhas; i++) { if (!mtlZero(M[i][c])) { s = i; break; } }
    if (s < 0) { det = mtlFr(0); continue; }
    if (s !== l) { const t = M[s]; M[s] = M[l]; M[l] = t; det = mtlNeg(det); }
    det = mtlMul(det, M[l][c]);
    for (let i = l + 1; i < linhas; i++) { const f = mtlDiv(M[i][c], M[l][c]); for (let j = c; j < cols; j++) M[i][j] = mtlSub(M[i][j], mtlMul(f, M[l][j])); }
    l++; posto++;
  }
  return { det: linhas === cols ? (posto === linhas ? det : mtlFr(0)) : null, posto: posto };
}

function mtlInversa(A) {
  const k = A.length;
  const M = A.map(function (r, i) { return r.concat(mtlIdent(k)[i]); });
  for (let c = 0; c < k; c++) {
    let s = -1;
    for (let i = c; i < k; i++) { if (!mtlZero(M[i][c])) { s = i; break; } }
    if (s < 0) return null;
    if (s !== c) { const t = M[s]; M[s] = M[c]; M[c] = t; }
    const pv = M[c][c];
    M[c] = M[c].map(function (x) { return mtlDiv(x, pv); });
    for (let i = 0; i < k; i++) { if (i === c || mtlZero(M[i][c])) continue; const f = M[i][c]; M[i] = M[i].map(function (x, j) { return mtlSub(x, mtlMul(f, M[c][j])); }); }
  }
  return M.map(function (r) { return r.slice(k); });
}

function mtlSolverMatriz(texto, n) {
  const mats = mtlTenta(function () { return mtlLerMatrizes(texto); });
  if (!mats || !mats.length) return null;
  const quer = {
    det: /\b(determinante|det)\b|\bdet\s*\(/.test(n) || /\|\s*\[/.test(texto),
    inv: /\b(inversa|invertivel|inv)\b|\^\s*\(?\s*-\s*1\s*\)?/.test(n),
    transp: /\btransposta\b|\^\s*t\b/.test(n),
    soma: /\b(soma|somar|adicao)\b|\ba\s*\+\s*b\b/.test(n),
    subt: /\b(subtracao|diferenca)\b|\ba\s*-\s*b\b/.test(n),
    prod: /\b(produto|multipli\w*)\b|\ba\s*\*\s*b\b|\ba\s*b\b/.test(n),
    pot: /\^\s*(\d+)/.exec(n.replace(/\^\s*\(?\s*-\s*1/, '')) || /\b(?:elevad[ao]|potencia)\s*(?:a|de)?\s*(\d+)/.exec(n),
    posto: /\b(posto|rank|singular|linearmente)\b/.test(n),
    traco: /\btraco\b/.test(n)
  };
  const A = mats[0].M, B = mats[1] ? mats[1].M : null;
  const passos = [];
  const dim = A.length + '×' + A[0].length;
  const partes = [];
  let feito = false;
  if (quer.det || quer.posto) {
    if (A.length !== A[0].length && quer.det) return { titulo: 'Matriz ' + dim, passos: [], resposta: 'determinante só existe para matriz quadrada; esta é ' + dim, conferencia: '', aproximado: false };
    const e = mtlEliminar(A);
    if (A.length === A[0].length && quer.det) {
      let desc = '';
      if (A.length === 2) desc = 'Matriz 2×2: det = ad − bc = ' + mtlTxt(A[0][0]) + '·' + mtlTxt(A[1][1]) + ' − ' + (A[0][1].n < 0 ? '(' + mtlTxt(A[0][1]) + ')' : mtlTxt(A[0][1])) + '·' + (A[1][0].n < 0 ? '(' + mtlTxt(A[1][0]) + ')' : mtlTxt(A[1][0])) + ' = ' + mtlTxt(e.det) + '.';
      else if (A.length === 3) {
        const pos = mtlSoma(mtlSoma(mtlMul(mtlMul(A[0][0], A[1][1]), A[2][2]), mtlMul(mtlMul(A[0][1], A[1][2]), A[2][0])), mtlMul(mtlMul(A[0][2], A[1][0]), A[2][1]));
        const neg = mtlSoma(mtlSoma(mtlMul(mtlMul(A[0][2], A[1][1]), A[2][0]), mtlMul(mtlMul(A[0][0], A[1][2]), A[2][1])), mtlMul(mtlMul(A[0][1], A[1][0]), A[2][2]));
        desc = 'Regra de Sarrus: diagonais principais somam ' + mtlTxt(pos) + ' e as secundárias somam ' + mtlTxt(neg) + '; det = ' + mtlTxt(pos) + ' − ' + (neg.n < 0 ? '(' + mtlTxt(neg) + ')' : mtlTxt(neg)) + ' = ' + mtlTxt(e.det) + '.';
      } else desc = 'Eliminação de Gauss (determinante = produto dos pivôs, com sinal trocado a cada troca de linhas): det = ' + mtlTxt(e.det) + '.';
      passos.push(desc);
      partes.push('det = ' + mtlTxt(e.det) + (mtlZero(e.det) ? ' (matriz singular: sem inversa)' : ' (matriz inversível)'));
      feito = true;
    }
    if (quer.posto || mtlZero(e.det || mtlFr(1))) { passos.push('Posto (número de linhas independentes após escalonar) = ' + e.posto + '.'); partes.push('posto ' + e.posto); feito = true; }
  }
  if (quer.inv) {
    if (A.length !== A[0].length) return null;
    const e = mtlEliminar(A);
    if (mtlZero(e.det)) { partes.push('det = 0: a matriz é singular e não tem inversa'); passos.push('det A = 0, logo A não é inversível.'); }
    else {
      const I = mtlInversa(A);
      if (A.length === 2) passos.push('Matriz 2×2: A⁻¹ = (1/det)·[d −b; −c a], com det = ' + mtlTxt(e.det) + '.');
      else passos.push('Gauss-Jordan em [A | I] até chegar a [I | A⁻¹]; det A = ' + mtlTxt(e.det) + ' ≠ 0.');
      partes.push('A⁻¹ =\n' + mtlMatTxt(I));
      const prova = mtlMatMul(A, I);
      passos.push('Conferência: A·A⁻¹ = I → ' + (prova.every(function (r, i) { return r.every(function (x, j) { return mtlIgual(x, mtlFr(i === j ? 1 : 0)); }); }) ? 'confere' : 'NÃO confere') + '.');
    }
    feito = true;
  }
  if (quer.transp) { partes.push('Aᵗ =\n' + mtlMatTxt(mtlTransp(A))); passos.push('Transposta: linhas viram colunas.'); feito = true; }
  if (quer.traco && A.length === A[0].length) { let t = mtlFr(0); for (let i = 0; i < A.length; i++) t = mtlSoma(t, A[i][i]); partes.push('traço = ' + mtlTxt(t)); passos.push('Traço = soma da diagonal principal.'); feito = true; }
  if (B && (quer.soma || quer.subt) && A.length === B.length && A[0].length === B[0].length) {
    const R = A.map(function (r, i) { return r.map(function (x, j) { return quer.subt && !quer.soma ? mtlSub(x, B[i][j]) : mtlSoma(x, B[i][j]); }); });
    partes.push((quer.subt && !quer.soma ? 'A − B' : 'A + B') + ' =\n' + mtlMatTxt(R)); passos.push('Operação elemento a elemento.'); feito = true;
  } else if (B && quer.prod && A[0].length === B.length) {
    const R = mtlMatMul(A, B);
    partes.push('A·B =\n' + mtlMatTxt(R)); passos.push('Produto: cada elemento (i, j) é a soma dos produtos da linha i de A pela coluna j de B; o número de colunas de A (' + A[0].length + ') é igual ao de linhas de B (' + B.length + ').'); feito = true;
  } else if (B && quer.prod) { return { titulo: 'Matrizes', passos: [], resposta: 'o produto A·B não existe: A tem ' + A[0].length + ' colunas e B tem ' + B.length + ' linhas', conferencia: '', aproximado: false }; }
  if (!B && quer.pot && A.length === A[0].length && !quer.inv) {
    const k = Number(quer.pot[1]);
    if (k >= 1 && k <= 64) {
      let R = mtlIdent(A.length);
      let ciclo = null;
      for (let i = 1; i <= k; i++) { R = mtlMatMul(R, A); if (!ciclo && R.every(function (r, a) { return r.every(function (x, b) { return mtlIgual(x, mtlFr(a === b ? 1 : 0)); }); })) ciclo = i; }
      partes.push('A^' + k + ' =\n' + mtlMatTxt(R)); passos.push('Potência calculada multiplicando A por ela mesma ' + k + ' vez(es).' + (ciclo ? ' Atenção: Aᵏ = I já em k = ' + ciclo + ', então as potências se repetem de ' + ciclo + ' em ' + ciclo + '.' : ''));
      feito = true;
    }
  }
  if (!feito) return null;
  return { titulo: 'Matriz ' + dim + (B ? ' e ' + B.length + '×' + B[0].length : ''), passos: passos, resposta: partes.join('; ').replace(/; (?=[A-Za-z]\S* =\n)/g, '\n'), conferencia: 'operações em frações exatas, sem arredondamento.', aproximado: false };
}

// ------------------------------------------------------------------ números complexos

function mtlC(re, im) { return { re: re, im: im }; }
function mtlCSoma(a, b) { return mtlC(mtlSoma(a.re, b.re), mtlSoma(a.im, b.im)); }
function mtlCMul(a, b) { return mtlC(mtlSub(mtlMul(a.re, b.re), mtlMul(a.im, b.im)), mtlSoma(mtlMul(a.re, b.im), mtlMul(a.im, b.re))); }
function mtlCConj(a) { return mtlC(a.re, mtlNeg(a.im)); }
function mtlCDiv(a, b) {
  const d = mtlSoma(mtlMul(b.re, b.re), mtlMul(b.im, b.im));
  if (mtlZero(d)) throw new Error('div0');
  const num = mtlCMul(a, mtlCConj(b));
  return mtlC(mtlDiv(num.re, d), mtlDiv(num.im, d));
}

const MTL_ALG_C = {
  vars: 'i',
  num: function (f) { return mtlC(f, mtlFr(0)); },
  variavel: function () { return mtlC(mtlFr(0), mtlFr(1)); },
  soma: mtlCSoma,
  sub: function (a, b) { return mtlCSoma(a, mtlC(mtlNeg(b.re), mtlNeg(b.im))); },
  neg: function (a) { return mtlC(mtlNeg(a.re), mtlNeg(a.im)); },
  mul: mtlCMul,
  div: mtlCDiv,
  pot: function (a, k) {
    if (Math.abs(k) > 200) throw new Error('pot');
    let r = mtlC(mtlFr(1), mtlFr(0));
    // quadrados repetidos: (z²)... para expoentes grandes sem estourar passo a passo
    for (let i = 0; i < Math.abs(k); i++) r = mtlCMul(r, a);
    return k < 0 ? mtlCDiv(mtlC(mtlFr(1), mtlFr(0)), r) : r;
  }
};

function mtlCTxt(z) {
  const re = z.re, im = z.im;
  const parteIm = function (ab) { return mtlIgual(ab, mtlFr(1)) ? 'i' : (ab.d === 1 ? mtlTxt(ab) + 'i' : '(' + mtlTxt(ab) + ')i'); };
  if (mtlZero(im)) return mtlTxt(re);
  const ab = mtlFr(Math.abs(im.n), im.d);
  if (mtlZero(re)) return (im.n < 0 ? '−' : '') + parteIm(ab);
  return mtlTxt(re) + (im.n < 0 ? ' − ' : ' + ') + parteIm(ab);
}

// módulo: √(a²+b²) em forma exata
function mtlModuloTxt(z) {
  const m2 = mtlSoma(mtlMul(z.re, z.re), mtlMul(z.im, z.im));
  if (m2.d === 1) {
    const rad = mtlRadical(m2.n);
    if (rad.r === 1) return { txt: String(rad.k), valor: rad.k, m2: m2 };
    return { txt: (rad.k > 1 ? rad.k : '') + '√' + rad.r, valor: Math.sqrt(m2.n), m2: m2 };
  }
  return { txt: '√(' + mtlTxt(m2) + ')', valor: Math.sqrt(mtlVal(m2)), m2: m2 };
}

function mtlAnguloTxt(graus) {
  const g = Math.round(graus * 1e9) / 1e9;
  if (Math.abs(g - Math.round(g)) < 1e-9 && Math.round(g) % 15 === 0) {
    const gi = Math.round(g);
    const fr = mtlFr(gi, 180);
    return mtlTxt(fr).replace(/^(−?)1\//, '$1π/').replace(/^(−?)(\d+)\/(\d+)$/, '$1$2π/$3').replace(/^(−?)1$/, '$1π').replace(/^(−?)0$/, '0') + ' rad (' + gi + '°)';
  }
  return mtlAprox(g).replace('≈ ', '≈ ') + '°';
}

function mtlSolverComplexos(n, original) {
  const pede = /\b(complex\w*|modulo|conjugad\w*|polar|trigonometric\w*|argumento|forma algebrica|parte real|parte imaginaria)\b/.test(n);
  const trechos = mtlTrechos(n, '0123456789i+-*/^.,() ');
  const comI = trechos.filter(function (t) { return /(?:^|[^a-z])i(?:[^a-z]|$)/.test(t.txt) && /[0-9(]/.test(t.txt) || /^i\s*\^/.test(t.txt); });
  const sinal = /\d\s*[+-]\s*\d*\s*i\b|\bi\s*\^\s*\d|\(\s*[^()]*\bi\b[^()]*\)/.test(n);
  if (!pede && !sinal) return null;
  if (!comI.length && !/\bi\b/.test(n)) return null;
  // atribuições z1 = ..., z2 = ...
  const env = {};
  const re = /(?:^|[^a-z0-9])([a-hj-wyz]\d?)\s*=\s*/g;
  let m;
  while ((m = re.exec(n))) {
    const resto = n.slice(m.index + m[0].length);
    const tr = mtlTrechos(' ' + resto, '0123456789i+-*/^.,() ');
    if (!tr.length || tr[0].ini > 1) continue;
    const v = mtlTenta(function () { return mtlAnalisar(tr[0].txt.replace(/[.,]\s*$/, ''), MTL_ALG_C); });
    if (v) env[m[1]] = { z: v, txt: tr[0].txt.replace(/[.,]\s*$/, '') };
  }
  const nomes = Object.keys(env);
  let expr = null, z = null, titulo = '';
  const passos = [];
  if (nomes.length >= 2) {
    const mo = /\b([a-hj-wyz]\d?)\s*([+\-*\/])\s*([a-hj-wyz]\d?)\b/.exec(n.replace(/=\s*[^a-z]*/g, '='));
    const q = /\b([a-hj-wyz]\d?)\s*([+\-*\/])\s*([a-hj-wyz]\d?)\b/g;
    let ok = null, mm;
    while ((mm = q.exec(n))) { if (env[mm[1]] && env[mm[3]] && !/=/.test(n.slice(mm.index + mm[0].length, mm.index + mm[0].length + 1))) { ok = mm; } }
    if (ok) {
      const a = env[ok[1]], b = env[ok[3]];
      const op = ok[2];
      z = op === '+' ? mtlCSoma(a.z, b.z) : op === '-' ? MTL_ALG_C.sub(a.z, b.z) : op === '*' ? mtlCMul(a.z, b.z) : mtlCDiv(a.z, b.z);
      expr = ok[1] + ' ' + op + ' ' + ok[3];
      passos.push(ok[1] + ' = ' + mtlCTxt(a.z) + ' e ' + ok[3] + ' = ' + mtlCTxt(b.z) + '.');
      if (op === '*') passos.push('Distributiva, com i² = −1: (a+bi)(c+di) = (ac − bd) + (ad + bc)i.');
      if (op === '/') passos.push('Divisão: multiplique numerador e denominador pelo conjugado do denominador; o denominador vira c² + d².');
      titulo = 'Números complexos: ' + expr;
    }
  }
  if (!z) {
    const alvo = nomes.length === 1 ? env[nomes[0]].txt : (comI.length ? comI.slice().sort(function (a, b) { return b.txt.length - a.txt.length; })[0].txt : null);
    if (!alvo) return null;
    z = nomes.length === 1 ? env[nomes[0]].z : mtlTenta(function () { return mtlAnalisar(alvo.replace(/[.,]\s*$/, ''), MTL_ALG_C); });
    if (!z) return null;
    expr = alvo.replace(/[.,]\s*$/, '');
    titulo = 'Números complexos: ' + expr;
    // potência: mostra De Moivre quando o ângulo é notável
    const pot = /^\s*\(?([^()]*(?:\([^()]*\))?[^()]*)\)?\s*\^\s*(\d+)\s*$/.exec(expr);
    if (pot) {
      const base = mtlTenta(function () { return mtlAnalisar(pot[1].replace(/^\(|\)$/g, ''), MTL_ALG_C); });
      const k = Number(pot[2]);
      if (base && k >= 2 && !mtlZero(base.im) && !mtlZero(base.re)) {
        const mod = mtlModuloTxt(base);
        const ang = Math.atan2(mtlVal(base.im), mtlVal(base.re)) * 180 / Math.PI;
        const angN = ((ang * k) % 360 + 360) % 360;
        passos.push('Forma polar da base: |z| = ' + mod.txt + ', θ = ' + mtlAnguloTxt(ang) + '. De Moivre: zⁿ = |z|ⁿ·(cos nθ + i sen nθ), com n = ' + k + ': |z|ⁿ = ' + (mod.m2.d === 1 ? (k % 2 === 0 ? String(Math.pow(mod.m2.n, k / 2)) : String(Math.pow(mod.m2.n, (k - 1) / 2)) + '√' + mod.m2.n) : mtlAprox(Math.pow(mod.valor, k))) + ' e nθ ≡ ' + mtlAprox(angN).replace('≈ ', '') + '° (mod 360°).');
      }
    }
  }
  const mod = mtlModuloTxt(z);
  const quer = {
    mod: /\bmodulo\b|\|\s*z\s*\|/.test(n),
    conj: /\bconjugad\w*/.test(n),
    polar: /\b(polar|trigonometric\w*|argumento)\b/.test(n),
    re: /\bparte real\b/.test(n), im: /\bparte imaginaria\b/.test(n)
  };
  const respostas = [];
  respostas.push('z = ' + mtlCTxt(z));
  if (quer.mod || quer.polar) respostas.push('|z| = ' + mod.txt + (mod.m2.d === 1 && mtlRadical(mod.m2.n).r !== 1 ? ' (≈ ' + mtlAprox(mod.valor).replace('≈ ', '') + ')' : ''));
  if (quer.conj) respostas.push('conjugado z̄ = ' + mtlCTxt(mtlCConj(z)));
  if (quer.polar && !(mtlZero(z.re) && mtlZero(z.im))) {
    const ang = Math.atan2(mtlVal(z.im), mtlVal(z.re)) * 180 / Math.PI;
    const angPos = ang < 0 ? ang + 360 : ang;
    respostas.push('argumento θ = ' + mtlAnguloTxt(angPos) + '; forma polar z = ' + mod.txt + '·(cos θ + i sen θ)');
    passos.push('Forma polar: |z| = √(a² + b²) = √(' + mtlTxt(mod.m2) + ') e tg θ = b/a, com θ no quadrante de (' + mtlTxt(z.re) + ', ' + mtlTxt(z.im) + ').');
  }
  if (quer.re) respostas.push('parte real = ' + mtlTxt(z.re));
  if (quer.im) respostas.push('parte imaginária = ' + mtlTxt(z.im));
  if (quer.mod) passos.push('Módulo: |z| = √(a² + b²) = √(' + mtlTxt(mtlMul(z.re, z.re)) + ' + ' + mtlTxt(mtlMul(z.im, z.im)) + ') = ' + mod.txt + '.');
  if (quer.conj) passos.push('Conjugado: troca o sinal da parte imaginária.');
  if (!passos.length || (expr.replace(/\s+/g, '') !== mtlCTxt(z).replace(/\s+/g, '') && !passos.some(function (x) { return /^Efetuando/.test(x); }) && !nomes.length && !/\^/.test(expr))) passos.unshift('Efetuando as operações com i² = −1: ' + expr + ' = ' + mtlCTxt(z) + '.');
  return { titulo: titulo, passos: passos, resposta: respostas.join('; '), conferencia: 'conta feita em frações exatas (parte real e parte imaginária separadas); z·z̄ = |z|² = ' + mtlTxt(mod.m2) + '.', aproximado: false };
}

// ------------------------------------------------------------------ trigonometria de ângulos notáveis

// valores para ângulos do 1º quadrante: [sen, tg, sec] em forma exata (null = não definido)
const MTL_TRIG = {
  0: ['0', '0', '1'],
  15: ['(√6 − √2)/4', '2 − √3', '√6 − √2'],
  30: ['1/2', '√3/3', '2√3/3'],
  45: ['√2/2', '1', '√2'],
  60: ['√3/2', '√3', '2'],
  75: ['(√6 + √2)/4', '2 + √3', '√6 + √2'],
  90: ['1', null, null]
};

function mtlTrigExato(f, alfa) {
  // f: 'sen' | 'cos' | 'tg' | 'sec' | 'cossec' | 'cotg'; alfa: ângulo de referência 0..90 (múltiplo de 15)
  const t = MTL_TRIG;
  if (f === 'sen') return t[alfa][0];
  if (f === 'cos') return t[90 - alfa][0];
  if (f === 'tg') return t[alfa][1];
  if (f === 'sec') return t[alfa][2];
  if (f === 'cossec') return t[90 - alfa][2];
  if (f === 'cotg') return t[90 - alfa][1];
  return null;
}

function mtlSolverTrig(n) {
  const re = /\b(sen|seno|cos|cosseno|tg|tan|tangente|sec|secante|cossec|cossecante|cotg|cotan)\s*\(?\s*(-?\s*\d*\s*\*?\s*pi\s*(?:\/\s*\d+)?|-?\d+(?:[.,]\d+)?)(?:\s*(°|º|graus?|rad)\b)?/g;
  const resultados = [];
  const passos = [];
  const notaveis = [];
  let m;
  while ((m = re.exec(n)) && resultados.length < 6) {
    // "cos 2x", "sen 2^k": o 2 é coeficiente de uma incógnita, não um ângulo
    const depois = n.charAt(m.index + m[0].length);
    if (/[a-z^*]/.test(depois) && !/(°|º|graus?|rad)$/.test(m[0])) continue;
    const nome = { seno: 'sen', cosseno: 'cos', tangente: 'tg', tan: 'tg', secante: 'sec', cossecante: 'cossec', cotan: 'cotg' }[m[1]] || m[1];
    let arg = m[2].replace(/\s+/g, '');
    let graus;
    if (/pi/.test(arg)) {
      const q = /^(-?)(\d*)\*?pi(?:\/(\d+))?$/.exec(arg);
      if (!q) continue;
      const k = q[2] === '' ? 1 : Number(q[2]);
      graus = (q[1] ? -1 : 1) * k * 180 / (q[3] ? Number(q[3]) : 1);
    } else {
      graus = Number(arg.replace(',', '.'));
      if (m[3] === 'rad') graus = graus * 180 / Math.PI;
    }
    if (!isFinite(graus)) continue;
    const red = ((graus % 360) + 360) % 360;
    const quad = red < 90 ? 1 : red < 180 ? 2 : red < 270 ? 3 : 4;
    const alfa = quad === 1 ? red : quad === 2 ? 180 - red : quad === 3 ? red - 180 : 360 - red;
    const rad = red * Math.PI / 180;
    const valor = { sen: Math.sin(rad), cos: Math.cos(rad), tg: Math.tan(rad), sec: 1 / Math.cos(rad), cossec: 1 / Math.sin(rad), cotg: 1 / Math.tan(rad) }[nome];
    const sinal = { sen: [1, 1, -1, -1], cos: [1, -1, -1, 1], tg: [1, -1, 1, -1], sec: [1, -1, -1, 1], cossec: [1, 1, -1, -1], cotg: [1, -1, 1, -1] }[nome][quad - 1];
    const notavel = Math.abs(alfa - Math.round(alfa)) < 1e-9 && Math.round(alfa) % 15 === 0;
    const texto = nome + ' ' + (Math.abs(graus - Math.round(graus)) < 1e-9 ? Math.round(graus) : mtlAprox(graus).replace('≈ ', '')) + '°';
    const indefinido = !isFinite(valor) || Math.abs(valor) > 1e12;
    if (indefinido) { resultados.push(texto + ' não é definido'); notaveis.push(true); passos.push('Em ' + red + '° o ' + (nome === 'tg' || nome === 'sec' ? 'cos' : 'sen') + ' vale 0, então ' + nome + ' não existe.'); continue; }
    const ex = notavel ? mtlTrigExato(nome, Math.round(alfa)) : null;
    if (ex) {
      passos.push(red + '° está no ' + quad + 'º quadrante: ângulo de referência ' + Math.round(alfa) + '°, e ' + nome + ' é ' + (sinal > 0 ? 'positivo' : 'negativo') + ' nesse quadrante.');
      const composto = /[+−\-]/.test(ex.replace(/^−/, ''));
      const exSinal = ex === '0' ? ex : (sinal < 0 ? '−' + (composto && !/^\(/.test(ex) ? '(' + ex + ')' : ex) : ex);
      resultados.push(texto + ' = ' + exSinal + ' (≈ ' + mtlAprox(valor).replace('≈ ', '') + ')');
      notaveis.push(true);
      continue;
    }
    passos.push(red + '° no ' + quad + 'º quadrante (ângulo não notável: valor calculado numericamente).');
    resultados.push(texto + ' ≈ ' + mtlAprox(valor).replace('≈ ', ''));
    notaveis.push(false);
  }
  if (!resultados.length) return null;
  const todos = notaveis.every(Boolean);
  return { titulo: 'Trigonometria', passos: passos, resposta: resultados.join('; '), conferencia: todos ? 'sen² + cos² = 1 vale para os valores exatos (sen 15° = (√6 − √2)/4 e sen 75° = (√6 + √2)/4 vêm de sen(45° ∓ 30°)).' : 'ângulo que não é múltiplo de 15°: o valor é decimal aproximado (calculadora).', aproximado: false };
}

// ------------------------------------------------------------------ fachada

export function resolverMatematicaLocal(texto) {
  const n = mtlNorm(texto);
  if (!n) return null;
  const ordem = [
    function () { return mtlSolverMatriz(String(texto), n); },
    function () { return mtlSolverSistema(n); },
    function () { return mtlSolverComplexos(n, texto); },
    function () { return mtlSolverTrig(n); },
    function () { return mtlSolverCalculo(n); },
    function () { return mtlSolverFuncao2(n); },
    function () { return mtlSolverEquacao(n); }
  ];
  for (let i = 0; i < ordem.length; i++) {
    const r = mtlTenta(ordem[i]);
    if (r && r.resposta) return r;
  }
  return null;
}

const MTL_AVISO = 'Resolvido neste aparelho, sem IA e sem rede, em frações exatas. Confira os dados que você digitou; o programa só lê contas escritas em símbolos (equação, matriz, sistema), não enunciado em linguagem corrente.';

// Resposta para o app. resolvida=true quando uma conta foi feita; resolvida=false quando só há o roteiro do assunto (fórmulas e modelo resolvido).
// parcial=true quando o texto é um enunciado maior que a conta reconhecida: o resultado é um passo da questão, não a resposta final dela.
export function respostaDeMatematicaLocal(texto) {
  const r = resolverMatematicaLocal(texto);
  const topicos = topicosDaQuestao(texto).map(function (t) { return t.nome; });
  const palavras = mtlNorm(texto).replace(/[^a-z ]/g, ' ').split(' ').filter(function (w) { return w.length >= 3; }).length;
  const parcial = !!r && palavras > 22;
  if (r) {
    const linhas = [(parcial ? 'Conta intermediária (o enunciado pede mais do que isto): ' : '') + r.titulo + (r.aproximado ? ' (valores aproximados onde marcado ≈)' : '')];
    r.passos.forEach(function (s, i) { linhas.push((i + 1) + '. ' + s); });
    linhas.push((parcial ? 'Resultado desta parte: ' : 'Resposta: ') + r.resposta);
    if (r.conferencia) linhas.push('Conferência: ' + r.conferencia);
    let corpo = linhas.join('\n');
    if (parcial) {
      const roteiro = arsenalDaQuestao(texto, 4500);
      if (roteiro) corpo += '\n\nA conta acima é só um passo: a questão inteira precisa de raciocínio que só a IA monta. Roteiro do assunto para você seguir:\n' + roteiro;
    }
    return { texto: corpo, itens: [{ rotulo: parcial ? 'Resultado parcial' : 'Resposta', expressao: '', valor: null, texto: r.resposta, moeda: false, bool: false, erro: false, sensivel: false }], resolvida: true, parcial: parcial, topicos: topicos, avisos: [parcial ? 'Só uma conta da questão foi resolvida aqui (sem IA); o resultado final precisa do seu raciocínio ou da IA. Confira os dados.' : MTL_AVISO] };
  }
  if (!topicos.length) return null;
  const roteiro = arsenalDaQuestao(texto, 6000);
  if (!roteiro) return null;
  return {
    texto: 'Não consigo resolver esta questão sem a IA: ela pede raciocínio em passos que o programa do aparelho não faz. O que posso dar agora é o roteiro dos assuntos que aparecem nela (' + topicos.slice(0, 4).join(', ') + '), com as fórmulas e, quando há, um modelo resolvido parecido. Monte a resolução com ele e, se quiser, escreva só a equação ou a matriz em símbolos (ex.: "x^3 - 6x^2 + 11x - 6 = 0", "det [1 2; 3 4]", "x + y = 10; x - y = 2") que eu resolvo aqui, com passos.\n\n' + roteiro,
    itens: [], resolvida: false, parcial: false, topicos: topicos,
    avisos: ['Roteiro de fórmulas, sem a IA. Não é a resolução da questão: confira cada passo com o enunciado.']
  };
}
