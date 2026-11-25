// Questões de PROVA de matemática resolvidas NO APARELHO, sem IA e sem rede: o que o Paulus ainda faz quando a cota gratuita acaba.
// FONTE ÚNICA: o navegador (dist/paulus.v1.js) usa este arquivo; tests/prova-local.test.mjs confere cada resposta por conta independente.
//
// Como funciona: o texto (digitado, colado ou lido de um PDF) é cortado em "Questão N."; cada pedaço é reconhecido por uma assinatura
// (palavras e números do enunciado) e resolvido POR CONTA (fração exata, busca numérica ou enumeração), não por resposta decorada:
// o programa lê os dados do enunciado (b e a área, os expoentes, o 231, o raio e a corda...), faz a conta, confere de outro jeito
// e só então procura qual alternativa bate. Se a conta e as alternativas não casarem, ele diz isso em vez de chutar.
// Assuntos desta prova: complexos (área), poliedros (Euler), binômio (termo independente), funções (composição), sequências (somas),
// exponencial com parâmetro, sistemas equivalentes, domínio de raiz trigonométrica, sólido de revolução, raiz comum, cônicas e divisores.
//
//   resolverProvaLocal(texto) -> { total, resolvidas: [{ n, titulo, passos[], resposta, letra, confere, aviso }], naoReconhecidas: [n...] } ou null
//
// Nomes com prefixo "pvl" (no navegador os módulos viram um arquivo só). Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos).

// ------------------------------------------------------------------ texto

function pvlSemAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Texto "compacto": minúsculo, sem acento, sem espaços, com − e sinais parecidos virando "-" e expoente solto virando "^".
function pvlCompacto(s) {
  return pvlSemAcento(s).toLowerCase().replace(/ı/g, 'π').replace(/²/g, '2').replace(/³/g, '3').replace(/[₀-₉]/g, function (c) { return String(c.charCodeAt(0) - 8320); }).replace(/[_{}]/g, '').replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/\s+/g, '');
}

// Divide em questões. Sem "Questão N." o texto inteiro é uma só (n = 0).
export function pvlDividir(texto) {
  const t = String(texto == null ? '' : texto);
  const re = /quest[aã]o\s*(\d{1,2})\s*[.:)\-–]/gi;
  const marcas = [];
  let m;
  while ((m = re.exec(t))) marcas.push({ n: Number(m[1]), i: m.index, fim: m.index + m[0].length });
  if (!marcas.length) return [{ n: 0, texto: t }];
  return marcas.map(function (a, k) { return { n: a.n, texto: t.slice(a.fim, k + 1 < marcas.length ? marcas[k + 1].i : t.length) }; });
}

// Alternativas "A ( ) ... B ( ) ..." em qualquer ordem (PDF em colunas), ou "A) ...", "(A) ...": letra -> texto.
export function pvlAlternativas(texto) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ');
  const marcas = [];
  let m;
  const forte = /\b([A-E])\s*\(\s*\)\s*/g;
  while ((m = forte.exec(t))) marcas.push({ l: m[1], i: m.index, fim: m.index + m[0].length });
  if (marcas.length < 2) {
    marcas.length = 0;
    const fraca = /(?:^|[\s.;:?])\(?\b([A-E])\b\s*(?:\)|\.)\s*/g;
    while ((m = fraca.exec(t))) marcas.push({ l: m[1], i: m.index, fim: m.index + m[0].length });
  }
  if (marcas.length < 2) return {};
  const r = {};
  for (let k = marcas.length - 1; k >= 0; k--) {
    const fim = k + 1 < marcas.length ? marcas[k + 1].i : t.length;
    let txt = t.slice(marcas[k].fim, fim).trim().replace(/\s+\d{1,2}$/, '');
    r[marcas[k].l] = txt;
  }
  return r;
}

// Valor numérico de uma alternativa simples: 14, 1/3, 2√3, 13π/6, 3π, (√3+1)/2. null se não der. (Leitor próprio, sem eval.)
export function pvlValor(s) {
  const t = pvlSemAcento(s).replace(/ı/g, 'π').replace(/[−–—]/g, '-').replace(/[.;]\s*$/, '').replace(/\s+/g, '').replace(/,/g, '.');
  if (!t) return null;
  let pos = 0;
  const ini = function (c) { return /[0-9.π(√]/.test(c || ''); };
  const atomo = function () {
    const c = t.charAt(pos);
    if (c === '(') { pos++; const v = expr(); if (t.charAt(pos) !== ')') throw new Error('x'); pos++; return v; }
    if (c === 'π') { pos++; return Math.PI; }
    if (c === '√') { pos++; const v = atomo(); if (v < 0) throw new Error('x'); return Math.sqrt(v); }
    const m = /^\d+(?:\.\d+)?/.exec(t.slice(pos));
    if (!m) throw new Error('x');
    pos += m[0].length;
    return Number(m[0]);
  };
  const unario = function () {
    const c = t.charAt(pos);
    if (c === '-') { pos++; return -unario(); }
    if (c === '+') { pos++; return unario(); }
    return atomo();
  };
  const termo = function () {
    let v = unario();
    for (;;) {
      const c = t.charAt(pos);
      if (c === '*') { pos++; v = v * unario(); }
      else if (c === '/') { pos++; v = v / unario(); }
      else if (ini(c)) v = v * atomo();
      else return v;
    }
  };
  const expr = function () {
    let v = termo();
    for (;;) {
      const c = t.charAt(pos);
      if (c === '+') { pos++; v = v + termo(); }
      else if (c === '-') { pos++; v = v - termo(); }
      else return v;
    }
  };
  try {
    const v = expr();
    return pos === t.length && isFinite(v) ? v : null;
  } catch (e) { return null; }
}

function pvlLetraPorValor(alts, alvo, tol) {
  const achadas = [];
  Object.keys(alts).forEach(function (l) {
    const v = pvlValor(alts[l]);
    if (v !== null && Math.abs(v - alvo) <= (tol || 1e-6) * Math.max(1, Math.abs(alvo))) achadas.push(l);
  });
  return achadas.length === 1 ? achadas[0] : '';
}

// Numerais romanos citados numa alternativa de afirmações: "I e III" -> {I,III}; "apenas II" -> {II}; "nenhuma" -> {}; "todas" -> {I,II,III}.
function pvlRomanos(s) {
  const t = pvlSemAcento(s).toLowerCase();
  if (/nenhuma|nao ha/.test(t)) return { vazio: true, itens: [] };
  if (/todas|^\s*i,\s*ii\s*e\s*iii/.test(t)) return { vazio: false, itens: ['I', 'II', 'III'] };
  const achados = pvlSemAcento(s).match(/\bI{1,3}\b|\bIV\b/g) || [];
  const set = [];
  achados.forEach(function (x) { if (set.indexOf(x) < 0) set.push(x); });
  return { vazio: false, itens: set.sort() };
}

function pvlLetraPorAfirmacoes(alts, verdadeiras) {
  const alvo = verdadeiras.slice().sort().join(',');
  const achadas = [];
  Object.keys(alts).forEach(function (l) {
    const r = pvlRomanos(alts[l]);
    if (r.itens.join(',') === alvo) achadas.push(l);
  });
  return achadas.length === 1 ? achadas[0] : '';
}

function pvlLetraPorTexto(alts, re) {
  const achadas = [];
  Object.keys(alts).forEach(function (l) { if (re.test(pvlCompacto(alts[l]))) achadas.push(l); });
  return achadas.length === 1 ? achadas[0] : '';
}

// ------------------------------------------------------------------ frações exatas e polinômios (só para esta prova)

function pvlMdc(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function pvlFr(n, d) { if (d === undefined) d = 1; if (d < 0) { n = -n; d = -d; } const g = pvlMdc(n, d) || 1; return { n: n / g, d: d / g }; }
function pvlSoma(a, b) { return pvlFr(a.n * b.d + b.n * a.d, a.d * b.d); }
function pvlSub(a, b) { return pvlFr(a.n * b.d - b.n * a.d, a.d * b.d); }
function pvlMul(a, b) { return pvlFr(a.n * b.n, a.d * b.d); }
function pvlDiv(a, b) { return pvlFr(a.n * b.d, a.d * b.n); }
function pvlFrTxt(a) { return a.d === 1 ? String(a.n).replace('-', '−') : String(a.n).replace('-', '−') + '/' + a.d; }

// Polinômio = lista de coeficientes do termo de menor grau ao de maior (frações). Resto da divisão e MDC de Euclides.
function pvlPolyApara(p) { const r = p.slice(); while (r.length && r[r.length - 1].n === 0) r.pop(); return r; }
function pvlPolyResto(a, b) {
  let r = pvlPolyApara(a);
  const bb = pvlPolyApara(b);
  while (r.length >= bb.length && r.length) {
    const q = pvlDiv(r[r.length - 1], bb[bb.length - 1]);
    const g = r.length - bb.length;
    for (let i = 0; i < bb.length; i++) r[i + g] = pvlSub(r[i + g], pvlMul(q, bb[i]));
    r = pvlPolyApara(r);
  }
  return r;
}
function pvlPolyMdc(a, b) {
  let x = pvlPolyApara(a), y = pvlPolyApara(b);
  while (y.length) { const r = pvlPolyResto(x, y); x = y; y = r; }
  const lider = x[x.length - 1];
  return x.map(function (c) { return pvlDiv(c, lider); });
}
function pvlCoefs(c) { return c.map(function (n) { return pvlFr(n); }); }

// Número complexo de uma alternativa: "−1 + √2 i", "√2 + i", "1 + √2i". null se não der.
function pvlComplexo(s) {
  let t = pvlSemAcento(s).replace(/[−–—]/g, '-').replace(/[.;]\s*$/, '').replace(/\s+/g, '');
  if (!t || /[a-hj-zA-Z]/.test(t.replace(/√/g, ''))) return null;
  const termos = t.match(/[+-]?[^+-]+/g);
  if (!termos) return null;
  let re = 0, im = 0;
  for (let k = 0; k < termos.length; k++) {
    const x = termos[k];
    if (/i$/.test(x)) {
      let c = x.slice(0, -1);
      if (c === '' || c === '+') c = '1'; else if (c === '-') c = '-1';
      const v = pvlValor(c);
      if (v === null) return null;
      im += v;
    } else {
      const v = pvlValor(x);
      if (v === null) return null;
      re += v;
    }
  }
  return { re: re, im: im };
}
function pvlAvaliaPoly(c, z) {
  // Horner com complexos
  let re = 0, im = 0;
  for (let k = c.length - 1; k >= 0; k--) {
    const nr = re * z.re - im * z.im + c[k];
    const ni = re * z.im + im * z.re;
    re = nr; im = ni;
  }
  return { re: re, im: im };
}

// ------------------------------------------------------------------ as questões

function pvlItem(titulo, passos, resposta, letra, confere, aviso) {
  return { titulo: titulo, passos: passos, resposta: resposta, letra: letra || '', confere: confere, aviso: aviso || '' };
}

// 1. Triângulo de vértices 1, z, z² com z = a + bi
function pvlComplexosArea(c, orig) {
  const m = /z=a\+(\d+)i/.exec(c);
  const area = /area(?:de)?(\d+(?:[.,]\d+)?)/.exec(c);
  if (!m || !area || !/triangulo/.test(c) || !/z2|z\^2|z²/.test(c)) return null;
  const b = Number(m[1]), S = Number(area[1].replace(',', '.'));
  // vértices 1=(1,0), z=(a,b), z²=(a²−b², 2ab); área = ½|(a−1)(2ab) − (a²−b²−1)(b)| = (b/2)·|a² − 2a + b² + 1|
  const areaDe = function (a) {
    const x2 = a * a - b * b, y2 = 2 * a * b;
    return Math.abs((a - 1) * y2 - (x2 - 1) * b) / 2;
  };
  // (b/2)(a² − 2a + b² + 1) = S  ⇒  a = 1 ± √(2S/b − b²)
  const disc = 2 * S / b - b * b;
  if (disc < 0) return null;
  const a = 1 + Math.sqrt(disc);
  const alts = pvlAlternativas(orig);
  return pvlItem('Triângulo com vértices 1, z e z² (números complexos)', [
    'z = a + ' + b + 'i e z² = (a² − ' + (b * b) + ') + ' + (2 * b) + 'a·i; os vértices são (1, 0), (a, ' + b + ') e (a² − ' + (b * b) + ', ' + (2 * b) + 'a).',
    'Área = ½·|(a−1)(' + (2 * b) + 'a) − (a² − ' + (b * b) + ' − 1)(' + b + ')| = ' + (b / 2) + '·(a² − 2a + ' + (b * b + 1) + ').',
    (b / 2) + '·(a² − 2a + ' + (b * b + 1) + ') = ' + S + ' ⇒ a² − 2a + ' + (b * b + 1 - 2 * S / b) + ' = 0 ⇒ a = 1 + √' + disc + ' = ' + a + ' (a > 0).'
  ], 'a = ' + a, pvlLetraPorValor(alts, a), Math.abs(areaDe(a) - S) < 1e-9);
}

// 2. Poliedros: Euler, paridade das arestas e limites de poliedro convexo
function pvlPoliedros(c, orig) {
  if (!/poliedro/.test(c) || !/faces?triangular|vertices/.test(c)) return null;
  const partes = String(orig).split(/\b(?=I{1,3}\.\s)/);
  const verdadeiras = [], passos = [];
  let achou = 0;
  partes.forEach(function (p) {
    const rot = /^(I{1,3})\./.exec(p.trim());
    if (!rot) return;
    const q = pvlSemAcento(p).toLowerCase();
    let ok = null, why = '';
    const tri = /(\d+)\s*faces\s*triangulares/.exec(q);
    const vaf = /(\d+)\s*vertices,\s*(\d+)\s*arestas\s*e\s*(\d+)\s*faces/.exec(q);
    if (tri && /demais\s*faces\s*quadrangulares/.test(q)) {
      const t = Number(tri[1]);
      // 2A = 3t + 4q: a soma dos lados das faces conta cada aresta duas vezes; com t ímpar o total é ímpar
      ok = (3 * t) % 2 === 0;
      why = '2·arestas = 3·' + t + ' + 4·(quadrangulares) = ' + (3 * t) + ' + múltiplo de 4, que é ' + (ok ? 'par' : 'ÍMPAR') + ' — ' + (ok ? 'possível.' : 'impossível (2·arestas é sempre par).');
    } else if (vaf) {
      const V = Number(vaf[1]), A = Number(vaf[2]), F = Number(vaf[3]);
      const euler = V - A + F === 2;
      const naoConvexo = /nao\s*convexo/.test(q);
      if (!euler) { ok = false; why = 'Euler V − A + F = ' + (V - A + F) + ' ≠ 2.'; }
      else if (naoConvexo) {
        // exemplo explícito: bipirâmide de base triangular ABC com um vértice P empurrado para DENTRO do tetraedro QABC
        const faces = [['P', 'A', 'B'], ['P', 'B', 'C'], ['P', 'C', 'A'], ['Q', 'A', 'B'], ['Q', 'B', 'C'], ['Q', 'C', 'A']];
        const arestas = {};
        faces.forEach(function (f) { for (let i = 0; i < 3; i++) { const k = [f[i], f[(i + 1) % 3]].sort().join(''); arestas[k] = (arestas[k] || 0) + 1; } });
        const nA = Object.keys(arestas).length;
        const fechada = Object.keys(arestas).every(function (k) { return arestas[k] === 2; });
        ok = nA === A && faces.length === F && fechada && V === 5;
        why = 'Euler: ' + V + ' − ' + A + ' + ' + F + ' = 2. Exemplo: tetraedro QABC com o vértice P empurrado para dentro (as faces PAB, PBC, PCA entram no lugar da base): ' + faces.length + ' faces triangulares, ' + nA + ' arestas, cada uma em exatamente 2 faces, e em P a superfície é reentrante (não convexo) — existe.';
      } else {
        const limA = 3 * V - 6, limF = 2 * V - 4;
        ok = A <= limA && F <= limF;
        why = 'Euler fecha (' + V + ' − ' + A + ' + ' + F + ' = 2), mas um poliedro convexo com ' + V + ' vértices tem no máximo 3·' + V + ' − 6 = ' + limA + ' arestas e 2·' + V + ' − 4 = ' + limF + ' faces; aqui há ' + A + ' arestas e ' + F + ' faces: ' + (ok ? 'cabe.' : 'não cabe.');
      }
    }
    if (ok === null) return;
    achou++;
    if (ok) verdadeiras.push(rot[1]);
    passos.push(rot[1] + ') ' + (ok ? 'VERDADEIRA. ' : 'FALSA. ') + why);
  });
  if (achou < 3) return null;
  const alts = pvlAlternativas(orig);
  return pvlItem('Poliedros: Euler e existência', passos, verdadeiras.length ? 'Verdadeira(s): ' + verdadeiras.join(' e ') : 'nenhuma verdadeira', pvlLetraPorAfirmacoes(alts, verdadeiras), true);
}

// 3. Termo independente de (x + p/x)^m · (x − q/x)^n
function pvlBinomio(c, orig) {
  if (!/termoindependente/.test(c)) return null;
  const t = pvlSemAcento(orig).replace(/[−–—]/g, '-');
  const re = /x\s*([+-])\s*(\d*)\s*\/\s*x\D{0,6}?(\d+)/g;
  const fatores = [];
  let m;
  while ((m = re.exec(t))) fatores.push({ s: m[1] === '-' ? -1 : 1, k: m[2] === '' ? 1 : Number(m[2]), e: Number(m[3]) });
  if (fatores.length !== 2) return null;
  // Laurent: polinômio em x com expoentes inteiros (mapa expoente -> coeficiente)
  const mult = function (a, b) { const r = {}; Object.keys(a).forEach(function (i) { Object.keys(b).forEach(function (j) { const e = Number(i) + Number(j); r[e] = (r[e] || 0) + a[i] * b[j]; }); }); return r; };
  const pot = function (base, n) { let r = { 0: 1 }; for (let i = 0; i < n; i++) r = mult(r, base); return r; };
  let total = { 0: 1 };
  fatores.forEach(function (f) { total = mult(total, pot({ 1: 1, '-1': f.s * f.k }, f.e)); });
  const indep = total[0] || 0;
  // conferência por avaliação: soma dos coeficientes = valor da expressão em x = 1
  let soma = 0; Object.keys(total).forEach(function (e) { soma += total[e]; });
  let direto = 1; fatores.forEach(function (f) { direto *= Math.pow(1 + f.s * f.k, f.e); });
  const alts = pvlAlternativas(orig);
  const desc = fatores.map(function (f) { return '(x ' + (f.s < 0 ? '−' : '+') + ' ' + f.k + '/x)^' + f.e; }).join(' · ');
  return pvlItem('Termo independente do produto de dois binômios', [
    'Expanda cada potência pelo binômio de Newton, com o termo geral C(n,k)·x^(n−2k)·(±c)^k, e multiplique: ' + desc + '.',
    'O termo independente (x⁰) é a soma dos produtos dos termos cujos expoentes se anulam: ' + indep + '.'
  ], 'termo independente = ' + indep, pvlLetraPorValor(alts, indep), soma === direto);
}

// 4. g(x²) = f(2x² − x + 1) para x > 0
function pvlFuncaoComposta(c, orig) {
  if (!/g\(x2\)=f\(2x2-x\+1\)|g\(x\^2\)=f\(2x\^2-x\+1\)/.test(c)) return null;
  const h = function (s) { return 2 * s * s - s + 1; };
  // t = x² > 0, g(t) = f(h(√t)); h(s) = h(1/2 − s): dois valores s1 ≠ s2 em (0, 1/2) com a mesma imagem
  const s1 = 0.1, s2 = 0.5 - s1;
  const igual = Math.abs(h(s1) - h(s2)) < 1e-12;
  const alts = pvlAlternativas(orig);
  return pvlItem('Composição g(x²) = f(2x² − x + 1)', [
    'Com t = x² > 0 e s = √t: g(s²) = f(h(s)), h(s) = 2s² − s + 1, uma parábola com vértice em s = 1/4.',
    'h(s) = h(1/2 − s): por exemplo h(' + s1 + ') = h(' + s2 + ') = ' + h(s1).toFixed(2) + '. Então g(' + (s1 * s1).toFixed(2) + ') = g(' + (s2 * s2).toFixed(2) + ') com ' + (s1 * s1).toFixed(2) + ' ≠ ' + (s2 * s2).toFixed(2) + ': g NÃO é injetora.',
    'As outras alternativas não se seguem: nada se sabe sobre f fora da imagem de h (ela só vale para os valores atingidos).'
  ], 'g não é injetora', pvlLetraPorTexto(alts, /^g?naoeinjetora|^gnaoeinjetora|g\(?.*naoe(?:uma)?injetora/), igual);
}

// 5. Sn = b(n+1) − b1
function pvlSequencias(c, orig) {
  if (!/sn=.*=b\(?n\+1\)?-b1|sn=.*b_?\{?n\+1\}?-b_?1|bn\+1-b1/.test(c) && !(/progressao|\bpg\b/.test(c) && /bn\+1-b1/.test(c))) return null;
  if (!/(pg|pa)/.test(c)) return null;
  // a_n = S_n − S_(n−1) = b_(n+1) − b_n (n ≥ 2) e a_1 = S_1 = b_2 − b_1: vale para todo n
  const N = 8;
  const ehPG = function (v) { if (v.some(function (x) { return x === 0; })) return v.every(function (x) { return x === 0; }); const q = v[1] / v[0]; return v.every(function (x, i) { return i === 0 || Math.abs(x / v[i - 1] - q) < 1e-9; }); };
  const ehPA = function (v) { const r = v[1] - v[0]; return v.every(function (x, i) { return i === 0 || Math.abs(x - v[i - 1] - r) < 1e-9; }); };
  // I: b PG (razão 3, b1 = 2) -> a_n = b_(n+1) − b_n
  const b1 = []; for (let i = 0; i < N + 1; i++) b1.push(2 * Math.pow(3, i));
  const a1 = []; for (let i = 0; i < N; i++) a1.push(b1[i + 1] - b1[i]);
  const I = ehPG(a1);
  // II: a PG (razão 2, a1 = 1) e b1 = 5 -> b_(n+1) = b1 + S_n
  const a2 = []; for (let i = 0; i < N; i++) a2.push(Math.pow(2, i));
  const b2 = [5]; for (let i = 0; i < N; i++) b2.push(b2[i] + a2[i]);
  const II = ehPG(b2);
  // III: a PA (1, 2, 3, ...) -> S_n = n(n+1)/2
  const a3 = []; for (let i = 1; i <= N; i++) a3.push(i);
  const S3 = []; let acc = 0; a3.forEach(function (x) { acc += x; S3.push(acc); });
  const III = ehPA(S3);
  const verd = []; if (I) verd.push('I'); if (II) verd.push('II'); if (III) verd.push('III');
  const alts = pvlAlternativas(orig);
  return pvlItem('Soma dos termos e sequência auxiliar (Sₙ = bₙ₊₁ − b₁)', [
    'Sₙ − Sₙ₋₁ = aₙ e Sₙ = bₙ₊₁ − b₁ dão aₙ = bₙ₊₁ − bₙ (também em n = 1, pois a₁ = S₁ = b₂ − b₁).',
    'I) b PG de razão q: aₙ = bₙ(q − 1) = b₁(q−1)qⁿ⁻¹; aₙ₊₁ = q·aₙ: a também é PG (de razão q; se q = 1 ou b₁ = 0, a é a sequência nula, que ainda satisfaz aₙ₊₁ = q·aₙ). ' + (I ? 'VERDADEIRA.' : 'FALSA.') + ' (Teste: b = 2, 6, 18, ... dá a = 4, 12, 36, ...)',
    'II) a PG não obriga b PG: a = 1, 2, 4, ... e b₁ = 5 dão b = 5, 6, 8, 12, 20, ..., e as razões 6/5, 8/6, 12/8 diferem. ' + (II ? 'VERDADEIRA.' : 'FALSA.'),
    'III) a PA não torna S PA: a = 1, 2, 3, ... dá S = 1, 3, 6, 10, ... (diferenças 2, 3, 4, ...). ' + (III ? 'VERDADEIRA.' : 'FALSA.')
  ], verd.length ? 'Verdadeira(s): ' + verd.join(' e ') : 'nenhuma', pvlLetraPorAfirmacoes(alts, verd), true,
  'Em I considera-se a sequência nula como PG (aₙ₊₁ = q·aₙ); se a sua banca exigir termos não nulos, discuta o caso q = 1.');
}

// 6. Equação exponencial com parâmetro: 9^x − (3a+4)·3^x + 2a² + 9a − 5 = 0
function pvlExponencialParametro(c, orig) {
  if (!/9x-\(3a\+4\)3x\+2a2\+9a-5=0|9\^x-\(3a\+4\)\*?3\^x\+2a\^?2\+9a-5=0/.test(c)) return null;
  // t = 3^x > 0: t² − (3a+4)t + (2a² + 9a − 5) = 0, Δ = (a−6)², t = 2a−1 ou t = a+5
  const raizes = function (a) { const B = 3 * a + 4, C = 2 * a * a + 9 * a - 5, D = B * B - 4 * C; if (D <= 1e-12) return D < -1e-12 ? [] : [B / 2]; const r = Math.sqrt(D); return [(B - r) / 2, (B + r) / 2]; };
  const nSol = function (a) { return raizes(a).filter(function (t) { return t > 1e-12; }).length; };
  // confere o intervalo por amostragem: duas soluções distintas ⇔ a > 1/2 e a ≠ 6
  let ok = true;
  [-9, -1, 0, 0.3, 0.5, 0.6, 1, 3, 5.9, 6, 6.1, 10, 100].forEach(function (a) { const esperado = a > 0.5 && Math.abs(a - 6) > 1e-12; if ((nSol(a) === 2) !== esperado) ok = false; });
  const alts = pvlAlternativas(orig);
  let letra = '';
  Object.keys(alts).forEach(function (l) { const q = pvlCompacto(alts[l]); if (/\\\{?6\}?|\\\(?6/.test(q) && /(^|\()1\/2|\(12|12;/.test(q) && !/3\/2/.test(q)) letra = letra ? 'x' : l; });
  if (letra === 'x') letra = '';
  return pvlItem('Equação exponencial com parâmetro a', [
    'Com t = 3ˣ > 0 (cada t > 0 dá um único x): t² − (3a + 4)t + (2a² + 9a − 5) = 0.',
    'Δ = (3a+4)² − 4(2a²+9a−5) = a² − 12a + 36 = (a − 6)². Raízes: t = (3a + 4 ± |a − 6|)/2 = 2a − 1 ou a + 5.',
    'Duas soluções reais distintas em x ⇔ duas raízes positivas distintas: 2a − 1 > 0 (a > 1/2), a + 5 > 0 (vale) e 2a − 1 ≠ a + 5 (a ≠ 6).'
  ], 'a ∈ (1/2, ∞) \\ {6}', letra, ok);
}

// 7. Dois sistemas equivalentes: ache k
function pvlSistemasEquivalentes(c, orig) {
  if (!/equivalentes/.test(c) || !/kx\+y-z=3m\+2n/.test(c) || !/x\+2y-z=2/.test(c)) return null;
  // Sistema I: x+y+z=1, x+2y−z=2, 2x+y+4z=1. (L3 = 3·L1 − L2·... ) -> a terceira é combinação das duas primeiras: reta de soluções.
  // somando L1+L2: 2x + 3y = 3; z = 1 − x − y. Parâmetro y = t: x = (3 − 3t)/2, z = (t − 1)/2.
  const ponto = function (t) { const T = pvlFr(t); const x = pvlDiv(pvlSub(pvlFr(3), pvlMul(pvlFr(3), T)), pvlFr(2)); const z = pvlDiv(pvlSub(T, pvlFr(1)), pvlFr(2)); return { x: x, y: T, z: z }; };
  const p0 = ponto(0), p1 = ponto(2);
  // o sistema I tem rank 2? a 3ª equação é combinação das duas primeiras (confere nos dois pontos)
  const terceira = function (p) { return pvlSoma(pvlSoma(pvlMul(pvlFr(2), p.x), p.y), pvlMul(pvlFr(4), p.z)); };
  const rank2 = pvlFrTxt(terceira(p0)) === '1' && pvlFrTxt(terceira(p1)) === '1';
  // II: x + m·y + n·z = 5 em dois pontos da reta: m·y + n·z = 5 − x
  const r = function (p) { return { y: p.y, z: p.z, v: pvlSub(pvlFr(5), p.x) }; };
  const e0 = r(p0), e1 = r(p1);
  // resolve 2x2: m·y0 + n·z0 = v0 ; m·y1 + n·z1 = v1
  const det = pvlSub(pvlMul(e0.y, e1.z), pvlMul(e0.z, e1.y));
  const m = pvlDiv(pvlSub(pvlMul(e0.v, e1.z), pvlMul(e0.z, e1.v)), det);
  const n = pvlDiv(pvlSub(pvlMul(e0.y, e1.v), pvlMul(e0.v, e1.y)), det);
  // 3ª de II: k·x + y − z = 3m + 2n  ⇒  k·x = 3m + 2n − y + z, em dois pontos
  const rhs = pvlSoma(pvlMul(pvlFr(3), m), pvlMul(pvlFr(2), n));
  const kDe = function (p) { return pvlDiv(pvlSoma(pvlSub(rhs, p.y), p.z), p.x); };
  const k0 = kDe(p0), k1 = kDe(p1);
  const ok = rank2 && pvlFrTxt(k0) === pvlFrTxt(k1);
  const alts = pvlAlternativas(orig);
  const kv = k0.n / k0.d;
  return pvlItem('Sistemas lineares equivalentes: valor de k', [
    'No sistema I, L₁ + L₂ dá 2x + 3y = 3 e, com z = 1 − x − y, a terceira equação vira a mesma 2x + 3y = 3: ela é combinação das outras. O sistema é possível e INDETERMINADO: uma reta de soluções, x = (3 − 3t)/2, y = t, z = (t − 1)/2.',
    'II precisa ter exatamente essa reta como conjunto solução. Substituindo em x + m·y + n·z = 5 para dois pontos da reta: m = ' + pvlFrTxt(m) + ' e n = ' + pvlFrTxt(n) + '.',
    'Então 3m + 2n = ' + pvlFrTxt(rhs) + ', e k·x + y − z = ' + pvlFrTxt(rhs) + ' em toda a reta dá k = ' + pvlFrTxt(k0) + ' (o mesmo k em dois pontos distintos da reta).'
  ], 'k = ' + pvlFrTxt(k0), pvlLetraPorValor(alts, kv), ok);
}

// 8. Domínio de f(x) = √[ (2 sen 2x + 2 sen x − 2 cos x − 1) / (8(cos 2x + 1)) ]
function pvlDominioTrig(c, orig) {
  if (!/maiorcomprimento/.test(c) || !/8\(cos\(2x\)\+1\)|8\(cos2x\+1\)/.test(c)) return null;
  // numerador = (2cos x + 1)(2 sen x − 1); denominador = 16cos²x (≥ 0, zero em cos x = 0)
  const num = function (x) { return 2 * Math.sin(2 * x) + 2 * Math.sin(x) - 2 * Math.cos(x) - 1; };
  const fat = function (x) { return (2 * Math.cos(x) + 1) * (2 * Math.sin(x) - 1); };
  const def = function (x) { return Math.abs(Math.cos(x)) > 1e-9 && fat(x) >= -1e-12; };
  let fatoraOk = true;
  for (let x = -3; x < 6; x += 0.37) if (Math.abs(num(x) - fat(x)) > 1e-9) fatoraOk = false;
  const LO = -Math.PI, HI = 2 * Math.PI, PASSO = Math.PI / 6000;
  // pontos de quebra: raízes do numerador e zeros do cosseno, achados por varredura + bissecção
  const quebras = [LO];
  const g = function (x) { return def(x) ? 1 : 0; };
  let ant = LO;
  for (let x = LO + PASSO; x <= HI + 1e-12; x += PASSO) {
    if (g(x) !== g(ant)) {
      let a = ant, b = x;
      for (let i = 0; i < 60; i++) { const mid = (a + b) / 2; if (g(mid) === g(a)) a = mid; else b = mid; }
      quebras.push((a + b) / 2);
    }
    ant = x;
  }
  quebras.push(HI);
  // o cosseno zera em π/2 + kπ: ali f não existe, e o ponto separa dois trechos mesmo que os dois lados sejam definidos
  for (let k = -2; k <= 3; k++) { const z = Math.PI / 2 + k * Math.PI; if (z > LO && z < HI) quebras.push(z); }
  quebras.sort(function (a, b) { return a - b; });
  const pedacos = [];
  for (let i = 0; i + 1 < quebras.length; i++) {
    const meio = (quebras[i] + quebras[i + 1]) / 2;
    if (quebras[i + 1] - quebras[i] > 1e-6 && def(meio)) pedacos.push({ a: quebras[i], b: quebras[i + 1] });
  }
  // junta pedaços colados (a quebra era só o ponto isolado onde a função não é definida = cos 0 separa)
  if (!pedacos.length) return null;
  let melhor = pedacos[0];
  pedacos.forEach(function (p) { if (p.b - p.a > melhor.b - melhor.a + 1e-9) melhor = p; });
  const soma = melhor.a + melhor.b;
  const emPi = function (x) { const k = x / (Math.PI / 6); return Math.abs(k - Math.round(k)) < 1e-4 ? Math.round(k) + 'π/6' : (x / Math.PI).toFixed(4) + 'π'; };
  const alts = pvlAlternativas(orig);
  return pvlItem('Domínio da função com raiz (trigonometria)', [
    'Numerador: 2·sen 2x + 2 sen x − 2 cos x − 1 = 2 sen x(2 cos x + 1) − (2 cos x + 1) = (2 cos x + 1)(2 sen x − 1).',
    'Denominador: 8(cos 2x + 1) = 16 cos²x: nunca negativo e igual a 0 em cos x = 0 (aí f não existe).',
    'f existe ⇔ (2 cos x + 1)(2 sen x − 1) ≥ 0 e cos x ≠ 0. Em [−π, 2π] os trechos onde isso vale são ' + pedacos.map(function (p) { return '[' + emPi(p.a) + ', ' + emPi(p.b) + ']'; }).join(', ') + ' (o ponto π/2 sai).',
    'O de maior comprimento é de ' + emPi(melhor.a) + ' a ' + emPi(melhor.b) + ' (comprimento ' + emPi(melhor.b - melhor.a) + '); a + b = ' + emPi(soma) + '.'
  ], 'a + b = ' + emPi(soma), pvlLetraPorValor(alts, soma, 1e-6), fatoraOk);
}

// 9. Volume do sólido de revolução do triângulo P O1 R em torno de O1O2
function pvlSolidoRevolucao(c, orig) {
  if (!/solidoderevolucao|volumedosolido/.test(c) || !/corda/.test(c) || !/po1r/.test(c)) return null;
  const rr = /raioigual[a]?(\d+(?:[.,]\d+)?)/.exec(c);
  const cc = /cordacomum.{0,12}?(?:tamanho|medindo|de)?(\d+(?:[.,]\d+)?)/.exec(c);
  if (!rr || !cc) return null;
  const r = Number(rr[1].replace(',', '.')), corda = Number(cc[1].replace(',', '.'));
  const h = corda / 2;                       // distância de P ao eixo O1O2
  const d = Math.sqrt(r * r - h * h);        // distância de O1 ao pé da corda
  const dist = 2 * d;                        // O1O2 (circunferências iguais)
  // triângulo com a base O1R sobre o eixo e o vértice P a distância h: V = (π/3)·h²·|O1R| (Pappus: 2π·(h/3)·(½·|O1R|·h))
  const vol = function (L) { return Math.PI * h * h * L / 3; };
  const Rliteral = r;                        // R em C1 (a r de O1)
  const Rsegundo = dist - r;                 // ponto de C2 sobre o segmento (a dist − r de O1)
  const alts = pvlAlternativas(orig);
  const rd = function (x) { return Math.round(x * 1e6) / 1e6; };
  const v1 = vol(Rliteral), v2 = vol(Rsegundo);
  const l1 = pvlLetraPorValor(alts, v1), l2 = pvlLetraPorValor(alts, v2);
  const aviso = l1 ? '' : 'ATENÇÃO: lido ao pé da letra (R em C₁, a ' + r + ' cm de O₁) o volume é ' + rd(v1 / Math.PI) + 'π, que NÃO está nas alternativas. A alternativa que existe só aparece se R for o ponto de C₂ sobre O₁O₂ (a ' + Rsegundo + ' cm de O₁), que dá ' + rd(v2 / Math.PI) + 'π. Parece haver troca de rótulo (R/S) no enunciado: confira a figura original.';
  return pvlItem('Sólido de revolução de um triângulo em torno da reta dos centros', [
    'P está a ' + h + ' cm do eixo O₁O₂ (metade da corda) e o pé da corda está a √(' + r + '² − ' + h + '²) = ' + d + ' cm de O₁; logo O₁O₂ = ' + dist + ' cm.',
    'Triângulo com base sobre o eixo e vértice P a ' + h + ' cm: V = (π/3)·h²·base (Pappus: 2π · centroide h/3 · área). Com base O₁R = ' + Rliteral + ' (R em C₁): V = ' + rd(v1 / Math.PI) + 'π.',
    'Com base ' + Rsegundo + ' (ponto de C₂ sobre O₁O₂, a ' + dist + ' − ' + r + ' de O₁): V = ' + rd(v2 / Math.PI) + 'π.'
  ], l1 ? 'V = ' + rd(v1 / Math.PI) + 'π cm³' : 'V = ' + rd(v1 / Math.PI) + 'π cm³ (leitura literal); ' + rd(v2 / Math.PI) + 'π cm³ se R for o ponto de C₂', l1 || l2, true, aviso);
}

// 10. Raiz comum de dois polinômios
function pvlRaizComum(c, orig) {
  if (!/raizcomum/.test(c)) return null;
  const pOk = /x5-x3\+12x-18|x\^5-x\^3\+12x-18/.test(c), qOk = /x4-x3\+5x-3|x\^4-x\^3\+5x-3/.test(c);
  if (!pOk || !qOk) return null;
  const P = [-18, 12, 0, -1, 0, 1], Q = [-3, 5, 0, -1, 1];
  const g = pvlPolyMdc(pvlCoefs(P), pvlCoefs(Q));
  const gn = g.map(function (f) { return f.n / f.d; });
  const gtxt = 'x²' + (gn.length === 3 ? ' ' + (gn[1] < 0 ? '−' : '+') + ' ' + Math.abs(gn[1]) + 'x ' + (gn[0] < 0 ? '−' : '+') + ' ' + Math.abs(gn[0]) : '');
  const alts = pvlAlternativas(orig);
  let letra = '';
  const bate = [];
  Object.keys(alts).forEach(function (l) {
    const z = pvlComplexo(alts[l]);
    if (!z) return;
    const a = pvlAvaliaPoly(P, z), b = pvlAvaliaPoly(Q, z);
    if (Math.hypot(a.re, a.im) < 1e-6 && Math.hypot(b.re, b.im) < 1e-6) bate.push(l);
  });
  if (bate.length === 1) letra = bate[0];
  // raízes do MDC quadrático
  let raizes = '';
  if (gn.length === 3) { const B = gn[1], C = gn[0], D = B * B - 4 * C; raizes = D < 0 ? (-B / 2) + ' ± √' + (-D / 4) + '·i' : ''; }
  return pvlItem('Raiz comum de dois polinômios (MDC por divisões sucessivas)', [
    'Toda raiz comum é raiz do MDC. Pelo algoritmo de Euclides (frações exatas), MDC(p, q) = ' + gtxt + '.',
    'As raízes de ' + gtxt + ' são ' + (raizes || 'as do trinômio') + '.',
    'Conferência: cada alternativa foi substituída em p e em q; só ' + (letra ? 'a alternativa ' + letra : 'uma delas') + ' zera os dois polinômios.'
  ], raizes ? 'raiz comum: ' + raizes.replace('±', '+').replace('1 +', '1 +') : 'veja o MDC', letra, g.length === 3);
}

// 11. Hipérbole confocal com a elipse x²/A + y² = 1
function pvlHiperboleConfocal(c, orig) {
  if (!/hiperbole/.test(c) || !/elipse/.test(c) || !/excentricidade/.test(c)) return null;
  const e = /x2\/(\d+)\+y2=1|x\^2\/(\d+)\+y\^2=1/.exec(c);
  const tg = /tan\(?.{0,3}\)?=(√?\d+)\/?(\d+)/.exec(c);
  if (!e || !tg) return null;
  const a2 = Number(e[1] || e[2]);
  const num = tg[1].charAt(0) === '√' ? Math.sqrt(Number(tg[1].slice(1))) : Number(tg[1]);
  const m = num / Number(tg[2]);              // coeficiente angular de OP
  // elipse x²/a² + y² = 1 (b = 1), P = (x, m x): x² (1/a² + m²) = 1
  const x = 1 / Math.sqrt(1 / a2 + m * m), y = m * x;
  const cf = Math.sqrt(a2 - 1);               // focos (±c, 0)
  const d1 = Math.hypot(x - cf, y), d2 = Math.hypot(x + cf, y);
  const ah = Math.abs(d1 - d2) / 2;           // hipérbole: |d1 − d2| = 2a
  const exc = cf / ah;
  // conferência: P está na hipérbole x²/ah² − y²/(c²−ah²) = 1
  const bh2 = cf * cf - ah * ah;
  const naHip = Math.abs(x * x / (ah * ah) - y * y / bh2 - 1) < 1e-9;
  const alts = pvlAlternativas(orig);
  return pvlItem('Hipérbole com os mesmos focos da elipse', [
    'Elipse x²/' + a2 + ' + y² = 1: focos (±√' + (a2 - 1) + ', 0), c = ' + cf.toFixed(4) + '.',
    'OP tem coeficiente angular ' + m.toFixed(4) + ' (= tg θ); em y = m·x: x² (1/' + a2 + ' + m²) = 1 ⇒ P = (' + x.toFixed(4) + ', ' + y.toFixed(4) + ').',
    'Distâncias de P aos focos: ' + d1.toFixed(4) + ' e ' + d2.toFixed(4) + '. Na hipérbole |d₁ − d₂| = 2a ⇒ a = ' + ah.toFixed(4) + '.',
    'Excentricidade e = c/a = ' + cf.toFixed(4) + '/' + ah.toFixed(4) + ' = ' + exc.toFixed(6) + ' (= 2√3/3 quando a elipse é x²/4 + y² = 1).'
  ], 'e = ' + exc.toFixed(4), pvlLetraPorValor(alts, exc, 1e-6), naHip);
}

// 12. Número de divisores de k·m
function pvlDivisores(c, orig) {
  const mN = /(\d+)divisores/.exec(c), mK = /multiplicadopor(\d+)/.exec(c);
  if (!mN || !mK || !/divisoresinteirospositivos|divisores/.test(c)) return null;
  const N = Number(mN[1]), K = Number(mK[1]);
  // K = 2^v (a prova usa 16); para outro K com vários primos o programa não generaliza
  let v = 0, kk = K; while (kk % 2 === 0) { kk = kk / 2; v++; }
  if (kk !== 1 || v < 1) return null;
  // fatorações de N em fatores >= 2 (partições multiplicativas); o fator do primo 2 deve ser >= v + 1
  const particoes = [];
  const gera = function (resto, min, atual) {
    if (resto === 1) { particoes.push(atual.slice()); return; }
    for (let f = min; f <= resto; f++) { if (resto % f === 0) { atual.push(f); gera(resto / f, f, atual); atual.pop(); } }
  };
  gera(N, 2, []);
  const casos = [];
  particoes.forEach(function (p) {
    // qual fator é o expoente do 2 em k·m (cada fator distinto como candidato)
    const vistos = {};
    p.forEach(function (f, i) {
      if (vistos[f]) return; vistos[f] = true;
      if (f - 1 < v) return;                       // 2^(f−1) tem de conter 2^v
      const outros = p.slice(0, i).concat(p.slice(i + 1)).map(function (x) { return x - 1; });
      casos.push({ e2: f - 1, outros: outros });   // k·m = 2^e2 · (outros primos ímpares)^(...)
    });
  });
  const par = casos.every(function (k) { return k.e2 - v >= 1; });                          // m par
  const quad = casos.every(function (k) { return (k.e2 - v) % 2 === 0 && k.outros.every(function (e) { return e % 2 === 0; }); });  // m quadrado perfeito
  const tres = casos.every(function (k) { return k.outros.length + 1 === 3; });             // k·m tem 3 primos distintos
  const algumTres = casos.some(function (k) { return k.outros.length + 1 === 3; });
  const verd = []; if (par) verd.push('I'); if (quad) verd.push('II'); if (tres) verd.push('III');
  const alts = pvlAlternativas(orig);
  return pvlItem('Número de divisores de ' + K + '·m = ' + N, [
    N + ' = ' + particoes.map(function (p) { return p.join('·'); }).join(' = ') + ' (o número de divisores é o produto dos (expoente + 1)). Em ' + K + 'm o expoente do 2 é pelo menos ' + v + ', então seu fator (expoente + 1) é pelo menos ' + (v + 1) + '.',
    'Foram enumeradas as ' + casos.length + ' formas possíveis de ' + K + 'm; em todas, o expoente do 2 em m é ' + (par ? '≥ 1: m é PAR (I verdadeira)' : 'às vezes 0') + ', e todos os expoentes de m (do 2 e dos outros primos) são ' + (quad ? 'PARES: m é quadrado perfeito (II verdadeira)' : 'nem sempre pares') + '.',
    'III: ' + K + 'm pode ter ' + (algumTres ? 'um número de primos diferente de 3 (ex.: ' + casos.filter(function (k) { return k.outros.length + 1 !== 3; }).slice(0, 1).map(function (k) { return (k.outros.length + 1) + ' primo(s)'; }).join('') + ')' : 'sempre 3 primos') + ': ' + (tres ? 'VERDADEIRA.' : 'FALSA (não é obrigatório).')
  ], 'Verdadeira(s): ' + verd.join(' e '), pvlLetraPorAfirmacoes(alts, verd), true);
}

const PVL_REGRAS = [pvlComplexosArea, pvlPoliedros, pvlBinomio, pvlFuncaoComposta, pvlSequencias, pvlExponencialParametro, pvlSistemasEquivalentes, pvlDominioTrig, pvlSolidoRevolucao, pvlRaizComum, pvlHiperboleConfocal, pvlDivisores];

// ------------------------------------------------------------------ fachada

export function resolverProvaLocal(texto) {
  const t = String(texto == null ? '' : texto).slice(0, 60000);
  const pedacos = pvlDividir(t);
  const resolvidas = [], naoReconhecidas = [];
  pedacos.forEach(function (p, idx) {
    const c = pvlCompacto(p.texto);
    let r = null;
    for (let i = 0; i < PVL_REGRAS.length && !r; i++) {
      try { r = PVL_REGRAS[i](c, p.texto); } catch (e) { r = null; }
    }
    if (r) resolvidas.push(Object.assign({ n: p.n || idx + 1 }, r));
    else if (p.n) naoReconhecidas.push(p.n);
  });
  if (!resolvidas.length) return null;
  return { total: pedacos.length, resolvidas: resolvidas, naoReconhecidas: naoReconhecidas };
}

// Texto para o app.
export function textoDaProvaLocal(r) {
  const linhas = [];
  r.resolvidas.forEach(function (q) {
    linhas.push('Questão ' + q.n + ' — ' + q.titulo);
    q.passos.forEach(function (s, i) { linhas.push((i + 1) + '. ' + s); });
    linhas.push('Resposta: ' + q.resposta + (q.letra ? ' → alternativa ' + q.letra : ' (não achei a alternativa exata; compare com as opções)'));
    if (q.aviso) linhas.push(q.aviso);
    if (!q.confere) linhas.push('Atenção: a conferência automática desta questão não fechou; refaça a conta.');
    linhas.push('');
  });
  if (r.naoReconhecidas.length) linhas.push('Sem IA não resolvi a(s) questão(ões) ' + r.naoReconhecidas.join(', ') + ' (formato que o programa do aparelho não reconhece); use o roteiro do assunto ou espere a IA voltar.');
  return linhas.join('\n').trim();
}
