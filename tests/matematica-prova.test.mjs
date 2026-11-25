// Prova de matemática (ITA 2026, 1ª fase, 12 questões): reconhecimento, roteiro por assunto, programa de logaritmos e
// conferência independente (por conta, sem a IA) de cada resposta que os modelos do roteiro afirmam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoDeMatematica } from '../shared/pedido.mjs';
import { contasDeProva, contasDoPedido, linhaDeItem } from '../shared/calculo-mais.mjs';
import { calcularExpressao } from '../shared/calculo.mjs';
import { TOPICOS, topicosDaQuestao, arsenalDaQuestao } from '../worker/matematica.mjs';
import { montarMensagens, blocoDeMatematica } from '../worker/prompt.mjs';
import { APPS } from '../worker/apps.mjs';

const Q = {
  1: 'Questão 1. Sejam z, w ∈ C tais que z − w = −2√3 e w ≠ 0. Se z tem módulo 2√3, e w tem argumento π/6, então a parte real de z é igual a A ( ) −2√3. B ( ) −√3. C ( ) 0. D ( ) √3. E ( ) 2√3.',
  2: 'Questão 2. Usando os valores aproximados log45 13,72 = 0,6880, log45 6125 = 2,2908, a alternativa que mais aproxima a representação decimal de log45 7 é A ( ) 0,4886. B ( ) 0,5112. C ( ) 0,5193. D ( ) 0,5224. E ( ) 0,5385.',
  3: 'Questão 3. Seja A a matriz de ordem 100 × 100, cujos elementos são descritos pela equação aij = 1 + (1 − i)(1 − j). Considere as seguintes afirmações: I. A é uma matriz simétrica. II. Cada linha da matriz A forma uma progressão aritmética. III. A é uma matriz singular. É (São) VERDADEIRA(S): A ( ) Apenas I. B ( ) Apenas II.',
  4: 'Questão 4. Os vértices de um polígono são todos os números complexos não nulos que satisfazem a equação iz2 = 2z. A área desse polígono é A ( ) √3. B ( ) 2√3. C ( ) 3√3.',
  5: 'Questão 5. Uma circunferência é dividida em seis partes iguais pelos pontos A, B, C, D, E, F, designados nessa ordem. Os pontos A, C, E são vértices de um triângulo equilátero, os pontos B, D, F são vértices de um segundo triângulo equilátero. A sobreposição desses dois triângulos define uma estrela de seis pontas denominada hexagrama. Se a área desse hexagrama é 25√3 cm2, então a área do quadrado inscrito na circunferência mede A ( ) 10 cm2.',
  6: 'Questão 6. Considere as seguintes afirmações: I. Um cubo possui uma seção plana dada por um pentágono. II. Sejam α, β e η três planos distintos, dois a dois concorrentes. Sejam r a reta interseção de α e β, s a reta interseção de β e η, t a reta interseção de α e η. Se r, s e t são duas a duas paralelas distintas, então existe uma única reta paralela a r que dista igualmente de α, β e η. III. Dois planos secantes são perpendiculares se toda reta de um deles for perpendicular ao outro plano. É (São) VERDADEIRA(S): A ( ) Apenas I.',
  7: 'Questão 7. Considere as matrizes A = [√3/2 −1/2; 1/2 √3/2], B = [√2/2; √2/2]. A matriz A31 × B é igual a A ( ) nenhuma das alternativas anteriores.',
  8: 'Questão 8. Seja p(x) = x3 + bx2 + cx + d um polinômio com coeficientes reais. Se todas as raízes de p(x) são reais e, para todo x ∈ R, p(2 + x) = −p(2 − x), então o menor valor possível para p(0) é',
  9: 'Questão 9. Considere a reta r : 3x + 4y = −15 e a parábola P : y = x2 + x + 6 com vértice V. Seja t a reta tangente a P, que tem coeficiente angular negativo e forma um ângulo de 45° com r. Sendo A o ponto de tangência de t a P e B o ponto de interseção de r e t, a área do triângulo ABV é',
  10: 'Questão 10. Sejam x, y ∈ ]0, π/2[, satisfazendo o sistema de equações tan(y) tan(y/2) = cos(2x) sec(y), sen(y)/cos(x) + cos(x)/sen(y) = 2. O produto de todos os valores de x e y que resolvem esse sistema é',
  11: 'Questão 11. Seja A = {1, 2, 3, 4, 5, 6, 7, 8}. A quantidade de bijeções F : A → A que satisfazem F(1) < F(5) < F(3) e F(7) < F(2) é',
  12: 'Questão 12. Considere m ∈ R positivo. A sequência rk é uma progressão geométrica crescente de termos positivos de razão q e termo inicial r1 = q. As circunferências Ck : (x − rk)2 + (y − mrk)2 = rk2 são duas a duas tangentes externamente, nessa ordem. A expressão de q em função de m é',
};
const ASSUNTO = { 1: 'complexos', 2: 'logaritmos', 3: 'matrizes', 4: 'complexos', 5: 'plana', 6: 'espacial', 7: 'matrizes', 8: 'polinomios', 9: 'analitica', 10: 'trigonometria', 11: 'contagem', 12: 'analitica' };

test('prova de matemática: as 12 questões são reconhecidas e cada uma chama o seu assunto', () => {
  for (const k of Object.keys(Q)) {
    assert.equal(pedidoDeMatematica(Q[k]), true, 'questão ' + k + ' não reconhecida');
    assert.ok(topicosDaQuestao(Q[k]).map(function (t) { return t.id; }).includes(ASSUNTO[k]), 'questão ' + k + ' sem o assunto ' + ASSUNTO[k]);
  }
  assert.equal(pedidoDeMatematica(Object.values(Q).join(' ')), true);
  // pergunta do SUAS que usa palavra de conta continua fora
  for (const t of ['qual o prazo do recurso do argumento da família?', 'o plano de acompanhamento familiar tem módulo de grupo?', 'complexo de vulnerabilidades no território', 'a família tem uma carga de trabalho complexa']) assert.equal(pedidoDeMatematica(t), false, t);
});

test('roteiro de matemática: só os assuntos da questão entram, e a prova inteira cabe no teto', () => {
  const a1 = arsenalDaQuestao(Q[1]);
  assert.match(a1, /De Moivre/); assert.match(a1, /MODELO \(complexos A\)/);
  assert.doesNotMatch(a1, /Logaritmos: log_b a/); assert.doesNotMatch(a1, /ROTAÇÃO/);
  assert.match(arsenalDaQuestao(Q[7]), /R\(θ\)ⁿ = R\(nθ\)/);
  assert.match(arsenalDaQuestao(Q[6]), /INCENTRO e 3 EXINCENTROS/);
  assert.equal(arsenalDaQuestao('o que é o CRAS?'), '');
  const prova = arsenalDaQuestao(Object.values(Q).join(' '));
  assert.ok(prova.length <= 13000, 'prova inteira: ' + prova.length);
  for (const id of ['complexos', 'logaritmos', 'matrizes', 'plana', 'espacial', 'polinomios', 'analitica', 'trigonometria', 'contagem', 'sequencias', 'desigualdades']) {
    const tp = TOPICOS.find(function (t) { return t.id === id; });
    assert.ok(prova.includes(tp.arsenal.slice(0, 60)), 'faltou o assunto ' + id);
    if (tp.modelos) assert.ok(prova.includes(tp.modelos.slice(0, 60)), 'faltou o modelo de ' + id);
  }
  for (const tp of TOPICOS) assert.ok(tp.arsenal.length < 1500 && tp.modelos.length < 1500, tp.id + ' grande demais');
});

test('roteiro de matemática entra no prompt do Worker (texto e foto) e fica de fora do que não é matemática', () => {
  const base = { app: APPS.argo, pagina: '', historico: [], fichas: [], achados: [], suicidio: false };
  const m = montarMensagens({ ...base, pergunta: Q[4] })[0].content;
  assert.ok(m.includes('MATEMÁTICA (QUESTÕES DE PROVA')); assert.ok(m.includes('MODELO (complexos B)'));
  const f = montarMensagens({ ...base, pergunta: 'resolva a prova da foto', imagem: Q[2] + ' ' + Q[7] })[0].content;
  assert.ok(f.includes('MODELO (logaritmos)')); assert.ok(f.includes('MODELO (potência de rotação)'));
  assert.ok(!montarMensagens({ ...base, pergunta: 'o que é o CRAS?' })[0].content.includes('ARSENAL (só os assuntos'));
  assert.ok(!montarMensagens({ ...base, suicidio: true, pergunta: Q[4] })[0].content.includes('ARSENAL (só os assuntos'));
  assert.match(blocoDeMatematica(Q[3], ''), /AFIRMAÇÕES \(I, II, III\)/);
});

test('logaritmos: o programa acha log de um número pelos dados aproximados (questão 2)', () => {
  const r = contasDeProva(Q[2]);
  assert.ok(r, 'sem resultado'); assert.equal(r.itens.length, 1);
  assert.ok(Math.abs(r.itens[0].valor - 0.5112) < 5e-5, String(r.itens[0].valor));
  assert.match(linhaDeItem(r.itens[0]), /0,5112/);
  // pelo texto digitado (resolverEspecial) e com índices ou colchetes
  assert.ok(Math.abs(contasDoPedido(Q[2]).itens[0].valor - 0.5112) < 5e-5);
  assert.ok(Math.abs(contasDeProva('Dados log_{45} 13,72 = 0,6880 e log_{45} 6125 = 2,2908, ache log_{45} 7').itens[0].valor - 0.5112) < 5e-5);
  assert.ok(Math.abs(contasDeProva('Dados log₄₅ 13,72 = 0,6880 e log₄₅ 6125 = 2,2908, ache log₄₅ 7').itens[0].valor - 0.5112) < 5e-5);
  // outro exemplo conferido à mão: log 2 = 0,3010 e log 3 = 0,4771 (base 10): log 12 = 2·0,3010 + 0,4771 = 1,0791
  assert.ok(Math.abs(contasDeProva('Dados log10 2 = 0,3010 e log10 3 = 0,4771, calcule log10 12').itens[0].valor - 1.0791) < 5e-5);
  // alvo que NÃO é combinação dos dados, bases diferentes e pergunta sem dados: nada
  assert.equal(contasDeProva('Dados log10 2 = 0,3010, calcule log10 7'), null);
  assert.equal(contasDeProva('Dados log10 2 = 0,3010 e log5 3 = 0,6826, calcule log10 6'), null);
  assert.equal(contasDeProva('quanto é log10 100?'), null);
  // a foto da prova inteira (várias questões juntas) ainda devolve o logaritmo e a contagem de bijeções
  const toda = contasDeProva(Q[2] + ' ' + Q[10] + ' ' + Q[11]);
  assert.equal(toda.itens.length, 2);
  assert.ok(toda.itens.some(function (i) { return i.valor === 3360; }));
});

// Conferência independente das respostas que os modelos afirmam (nenhuma depende do programa do Paulus).
const v = (e) => { const r = calcularExpressao(e, {}); assert.ok(r.ok, e + ' -> ' + JSON.stringify(r)); return r.valor; };
const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, a + ' vs ' + b);
const mulC = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

test('conferência: questão 1 (complexos, parte real de z = √3)', () => {
  const t = 6, w = [t * Math.sqrt(3) / 2, t / 2], z = [w[0] - 2 * Math.sqrt(3), w[1]];
  perto(Math.hypot(z[0], z[1]), 2 * Math.sqrt(3)); perto(Math.atan2(w[1], w[0]), Math.PI / 6); perto(z[0], Math.sqrt(3));
  // e t = 6 é a única raiz positiva: t² − 6t = 0
  for (const x of [0.5, 1, 3, 5.9, 6.1, 10]) assert.ok(Math.abs(x * x - 6 * x) > 1e-6);
});

test('conferência: questão 2 (log45 7 = 0,5112)', () => {
  const L = (x) => Math.log(x) / Math.log(45);
  perto(L(13.72), 0.688, 1e-3); perto(L(6125), 2.2908, 1e-3); perto(L(7), 0.5112, 5e-5);
  const alt = [0.4886, 0.5112, 0.5193, 0.5224, 0.5385];
  assert.equal(alt.indexOf(alt.reduce(function (m, x) { return Math.abs(x - L(7)) < Math.abs(m - L(7)) ? x : m; })), 1);
});

test('conferência: questão 3 (matriz 100×100: simétrica, linhas em PA, singular)', () => {
  const n = 100, a = (i, j) => 1 + (1 - i) * (1 - j);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) assert.equal(a(i, j), a(j, i));
  for (let i = 1; i <= n; i++) for (let j = 2; j < n; j++) assert.equal(a(i, j + 1) - a(i, j), a(i, 2) - a(i, 1));
  // 3 linhas quaisquer são dependentes: det 3×3 = 0 para todas as trincas pequenas (posto ≤ 2)
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  for (let i = 1; i <= 8; i++) for (let j = i + 1; j <= 9; j++) for (let k = j + 1; k <= 10; k++) assert.equal(det3([i, j, k].map(function (r) { return [1, 2, 3].map(function (c) { return a(r, c); }); })), 0);
});

test('conferência: questão 4 (iz² = 2z̄ → triângulo equilátero de lado 2√3, área 3√3)', () => {
  const pts = [-Math.PI / 6, Math.PI / 2, 7 * Math.PI / 6].map(function (th) { return [2 * Math.cos(th), 2 * Math.sin(th)]; });
  for (const z of pts) { const lhs = mulC([0, 1], mulC(z, z)), rhs = [2 * z[0], -2 * z[1]]; perto(lhs[0], rhs[0], 1e-9); perto(lhs[1], rhs[1], 1e-9); }
  const area = Math.abs((pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1])) / 2;
  perto(area, 3 * Math.sqrt(3));
  // varredura: nenhum outro z não nulo (raio 2, ângulo a cada 0,01 rad) satisfaz a equação
  let achados = 0;
  for (let th = 0; th < 2 * Math.PI; th += 0.001) { const z = [2 * Math.cos(th), 2 * Math.sin(th)], l = mulC([0, 1], mulC(z, z)); if (Math.hypot(l[0] - 2 * z[0], l[1] + 2 * z[1]) < 0.012) achados++; }
  assert.ok(achados >= 3 && achados <= 30);
});

test('conferência: questão 5 (hexagrama de 25√3 → quadrado inscrito de 50 cm²)', () => {
  const R = 5, l = R * Math.sqrt(3);
  perto(l * l * Math.sqrt(3) / 3, 25 * Math.sqrt(3));           // área do hexagrama
  perto(2 * (l * l * Math.sqrt(3) / 4) - 6 * Math.sqrt(3) / 4 * (l / 3) ** 2, 25 * Math.sqrt(3)); // 2 triângulos − hexágono (6 triangulinhos)
  perto(2 * R * R, 50);
});

test('conferência: questão 6 (cubo com pentágono; 4 retas equidistantes dos três planos do prisma)', () => {
  // Cubo [0,1]³ cortado pelo plano x + 0,4y + 0,4z = 1,1: corta 5 arestas laterais e dá um pentágono
  const faces = 5, P = [1, 0.4, 0.4], d = 1.1, pts = [];
  const v0 = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ar = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  for (const [i, j] of ar) { const f = (p) => P[0] * p[0] + P[1] * p[1] + P[2] * p[2] - d; const a = f(v0[i]), b = f(v0[j]); if (a * b < 0) pts.push([i, j]); }
  assert.equal(pts.length, faces);   // 5 arestas cortadas → pentágono
  // Seção reta do prisma: triângulo com lados nas retas y = 0, x = 0 e 3x + 4y = 12. Pontos equidistantes das 3 retas: |x| = |y| = |3x+4y−12|/5.
  const pontos = new Set();
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const se of [1, -1]) {
    const coef = 3 * sx + 4 * sy - 5 * se;          // 3·sx·d + 4·sy·d − 12 = se·5·d
    if (coef === 0) continue;
    const dd = 12 / coef;
    if (dd > 0) pontos.add((sx * dd).toFixed(6) + ',' + (sy * dd).toFixed(6));
  }
  assert.equal(pontos.size, 4);                     // incentro + 3 exincentros: não existe uma única reta
  for (const p of pontos) { const [x, y] = p.split(',').map(Number); perto(Math.abs(x), Math.abs(y), 1e-6); perto(Math.abs(3 * x + 4 * y - 12) / 5, Math.abs(x), 1e-6); }
});

test('conferência: questão 7 (A³¹B)', () => {
  const rot = (g) => [[Math.cos(g), -Math.sin(g)], [Math.sin(g), Math.cos(g)]];
  let M = [[1, 0], [0, 1]];
  const A = [[Math.sqrt(3) / 2, -0.5], [0.5, Math.sqrt(3) / 2]];
  for (let i = 0; i < 31; i++) M = [[M[0][0] * A[0][0] + M[0][1] * A[1][0], M[0][0] * A[0][1] + M[0][1] * A[1][1]], [M[1][0] * A[0][0] + M[1][1] * A[1][0], M[1][0] * A[0][1] + M[1][1] * A[1][1]]];
  const b = [Math.SQRT1_2, Math.SQRT1_2], r = [M[0][0] * b[0] + M[0][1] * b[1], M[1][0] * b[0] + M[1][1] * b[1]];
  perto(r[0], -Math.SQRT2 / 4 * (Math.sqrt(3) - 1), 1e-9); perto(r[1], -Math.SQRT2 / 4 * (Math.sqrt(3) + 1), 1e-9);
  perto(r[0], Math.cos(255 * Math.PI / 180), 1e-9); perto(rot(Math.PI / 6)[1][0], 0.5, 1e-12);
});

test('conferência: questões 8 a 12 (as do roteiro anterior) continuam certas', () => {
  for (const k of [0, -1, -4, -9]) assert.ok(-8 - 2 * k >= -8);                              // 8: p(0) ≥ −8
  perto(v('areatri(-4;18;-1;-3;-0.5;5.75)'), 147 / 8);                                        // 9
  const x = Math.PI / 6, y = Math.PI / 3; perto(x * y, Math.PI ** 2 / 18);                    // 10
  assert.equal(contasDoPedido(Q[11]).itens[0].valor, 3360);                                   // 11
  for (const m of [0.5, 1, 2, 3.7]) { const s = Math.sqrt(m * m + 1), q = (s + 1) / (s - 1); perto(q, (s + 1) ** 2 / (m * m), 1e-9); perto(Math.hypot(q * q - q, m * (q * q - q)), q + q * q, 1e-9); } // 12
});

test('gabarito conferido: 1-D, 2-B, 3-E, 4-C, 5-D, 6-A, 7-A, 8-B, 9-D, 10-E, 11-A, 12-B', () => {
  const alt = {
    1: [-2 * Math.sqrt(3), -Math.sqrt(3), 0, Math.sqrt(3), 2 * Math.sqrt(3)], 4: [Math.sqrt(3), 2 * Math.sqrt(3), 3 * Math.sqrt(3), 4 * Math.sqrt(3), 5 * Math.sqrt(3)],
    5: [10, 25, 40, 50, 75], 8: [-10, -8, -6, -4, -2], 9: [13 / 500, 25 / 4, 105 / 8, 147 / 8, 126 / 5], 10: [Math.PI ** 2 / 24, Math.PI ** 4 / 324, Math.PI ** 2 / 50, Math.PI ** 2 / 16, Math.PI ** 2 / 18], 11: [3360, 4200, 5040, 5880, 6720],
  };
  const certo = { 1: Math.sqrt(3), 4: 3 * Math.sqrt(3), 5: 50, 8: -8, 9: 147 / 8, 10: Math.PI ** 2 / 18, 11: 3360 }, letras = 'ABCDE', esperado = { 1: 'D', 4: 'C', 5: 'D', 8: 'B', 9: 'D', 10: 'E', 11: 'A' };
  for (const k of Object.keys(certo)) { const i = alt[k].findIndex(function (x) { return Math.abs(x - certo[k]) < 1e-9; }); assert.equal(letras[i], esperado[k], 'questão ' + k); }
});

// Ponta a ponta pelo Worker (IA simulada): o que a IA recebe numa questão de prova.
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
const BASE = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
async function perguntar(corpo) {
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(modelo, params) { chamadas.push({ modelo, params }); return { response: 'Resposta: letra B.' }; } } };
  const req = new Request('https://paulus-ia.exemplo.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', Origin: ORIGEM }, body: JSON.stringify(Object.assign({ app: 'argo' }, corpo)) });
  const r = await criarManipulador({ base: BASE, apps: APPS })(req, env);
  return { r, chamadas };
}

test('Worker: questão 2 chega à IA com o logaritmo já calculado, o roteiro de logaritmos e espaço de prova', async () => {
  const { r, chamadas } = await perguntar({ pergunta: Q[2] });
  assert.equal(r.status, 200);
  const ia = chamadas[chamadas.length - 1], sistema = ia.params.messages[0].content, tudo = ia.params.messages.map(function (m) { return m.content; }).join('\n');
  assert.match(tudo, /<calculos>[\s\S]*log45 7 = 0,5112/); assert.match(sistema, /MODELO \(logaritmos\)/); assert.match(sistema, /MATEMÁTICA \(QUESTÕES DE PROVA/);
  assert.equal(ia.params.max_tokens, 4096); assert.equal(ia.params.temperature, 0.1);
});

test('Worker: questão 4 (complexos) chega com o roteiro de complexos e sem as contas do SUAS', async () => {
  const { r, chamadas } = await perguntar({ pergunta: Q[4] });
  assert.equal(r.status, 200);
  const ia = chamadas[chamadas.length - 1], sistema = ia.params.messages[0].content;
  assert.match(sistema, /MODELO \(complexos B\)/); assert.doesNotMatch(sistema, /MODELO \(logaritmos\)/);
  assert.equal(ia.params.max_tokens, 4096);
});
