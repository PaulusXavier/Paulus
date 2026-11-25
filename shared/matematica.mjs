// Conhecimento de MATEMÁTICA de prova (ITA, IME, vestibular, concurso): arsenal por assunto + modelos resolvidos.
// Só o que combina com a questão entra no prompt (cota gratuita da IA): uma questão de polinômio não carrega complexos, e uma prova inteira
// (foto com 12 questões) carrega os assuntos de todas, cortados por um teto de caracteres. Cada modelo foi conferido por conta independente
// em tests/matematica-prova.test.mjs. Para ensinar um assunto novo: acrescente um item em TOPICOS (id, nome, detecta, arsenal, modelos).

const SEM_ACENTO = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

// detecta: expressões sobre o texto SEM acento e em minúsculas; cada acerto soma um ponto ao assunto.
export const TOPICOS = [
  {
    id: 'complexos', nome: 'Números complexos',
    detecta: [/complex/, /conjugad/, /argumento/, /\bmodulo\b/, /\bz\b/, /\bw\b/, /ℂ/, /de moivre/, /\bcis\b/, /\bi\s*z\b/, /\bz\s*\^?\s*2/],
    arsenal: '· Complexos: z = a+bi = |z|(cos θ + i sen θ) = r·cis θ; |z|² = z·z̄; z̄ tem o mesmo módulo e argumento −θ; |z₁z₂| = |z₁||z₂| e os argumentos somam; De Moivre: zⁿ = rⁿ·cis nθ; as n raízes n-ésimas de z ficam na circunferência de raio r^(1/n), com ângulos (θ+2kπ)/n, e são vértices de um polígono regular de n lados. Parte real = r cos θ, parte imaginária = r sen θ. Equação com z e z̄ (z ≠ 0): escreva z = r·cis θ, iguale MÓDULOS (acha r) e ARGUMENTOS a menos de 2kπ (acha θ, com k = 0, 1, 2... até repetir); i = cis 90°. Dados "z − w" e os argumentos/módulos: escreva w = t·cis θ (t > 0), monte z = w − d e imponha |z|. Polígono regular de n lados inscrito em raio R: área (n/2)·R²·sen(360°/n); triângulo equilátero de lado ℓ: ℓ²√3/4.',
    modelos: 'MODELO (complexos A) z − w = −2√3, |z| = 2√3, arg w = π/6, w ≠ 0: w = t(√3/2 + i/2), t > 0; z = w − 2√3 = (t√3/2 − 2√3) + i·t/2. |z|² = 12 ⇒ 3t²/4 − 6t + 12 + t²/4 = 12 ⇒ t² − 6t = 0 ⇒ t = 6. Re z = 6·√3/2 − 2√3 = √3. Confere: z = √3 + 3i, |z|² = 12. Resposta: √3.\nMODELO (complexos B) i z² = 2 z̄, z ≠ 0: z = r·cis θ ⇒ i r² cis 2θ = 2r cis(−θ). Módulos: r² = 2r ⇒ r = 2. Argumentos: π/2 + 2θ = −θ + 2kπ ⇒ θ = −π/6 + 2kπ/3 ⇒ θ = −π/6, π/2, 7π/6 (k = 0, 1, 2; depois repete). Três vértices a 120° na circunferência de raio 2: triângulo equilátero inscrito, lado 2√3, área (2√3)²√3/4 = 3√3. Confere: z = 2i dá i(2i)² = −4i = 2·conj(2i). Resposta: 3√3.',
  },
  {
    id: 'logaritmos', nome: 'Logaritmos e exponenciais',
    detecta: [/\blog/, /logaritm/, /\bln\b/, /exponencia/, /\b\d+\s*\^\s*x\b/],
    arsenal: '· Logaritmos: log_b a = ln a/ln b; log(ab) = log a + log b; log(a/b) = log a − log b; log aⁿ = n·log a; log_b b = 1; log_b 1 = 0. Existência: base > 0 e ≠ 1, logaritmando > 0. Base > 1 mantém o sentido da desigualdade; base entre 0 e 1 inverte. DADOS APROXIMADOS DE LOGARITMOS ("usando log 13,72 = 0,6880 e log 6125 = 2,2908, ache log 7"): FATORE cada número em primos (13,72 = 1372/100 = 2²·7³/(2²·5²) = 7³/5²; 6125 = 5³·7²) e a base (45 = 3²·5), escreva cada dado como combinação linear dos logaritmos dos primos, use também log_b b = 1, resolva o SISTEMA e arredonde só no fim; confira nos dados. Exponencial: iguale as bases; aˣ = b ⇒ x = log_a b; use a substituição t = aˣ (t > 0) em equações do segundo grau.',
    modelos: 'MODELO (logaritmos) log₄₅ 13,72 = 0,6880 e log₄₅ 6125 = 2,2908; achar log₄₅ 7. Com L₅ = log₄₅ 5 e L₇ = log₄₅ 7: 13,72 = 7³/5² ⇒ 3L₇ − 2L₅ = 0,6880; 6125 = 5³·7² ⇒ 3L₅ + 2L₇ = 2,2908. Elimine L₅ (×3 e ×2): 9L₇ − 6L₅ = 2,0640 e 4L₇ + 6L₅ = 4,5816; soma: 13·L₇ = 6,6456 ⇒ L₇ = 0,5112. Confere: L₅ = (2,2908 − 1,0224)/3 = 0,4228 e 3·0,5112 − 2·0,4228 = 0,6880. Resposta: 0,5112.',
  },
  {
    id: 'matrizes', nome: 'Matrizes, determinantes e sistemas',
    detecta: [/matriz/, /matrizes/, /determinante/, /\bdet\b/, /singular/, /simetric/, /\ba\s*\^\s*\d+/, /ordem\s*\d+\s*x\s*\d+/, /sistema linear/, /escalonamento/, /\bijk\b|a_?\{?ij/],
    arsenal: '· Matrizes: simétrica ⇔ aᵢⱼ = aⱼᵢ (A = Aᵗ): troque i por j na fórmula do termo geral e compare. Linha (ou coluna) é PA quando, com a linha fixa, o termo é função afim do outro índice (diferença constante, a razão pode variar de linha para linha e valer 0). Singular ⇔ det = 0 ⇔ linhas linearmente dependentes ⇔ posto < ordem. Termo aᵢⱼ = c + f(i)·g(j) é a soma de duas matrizes de posto 1 (a de 1s e a de f·g), logo tem posto ≤ 2: para ordem ≥ 3, det = 0 (confira numa 3×3). det(AB) = det A·det B; det Aᵗ = det A; det(kA) = kⁿ det A; inversa existe ⇔ det ≠ 0. ROTAÇÃO: R(θ) = [cos θ, −sen θ; sen θ, cos θ]; R(α)R(β) = R(α+β); R(θ)ⁿ = R(nθ); R(θ)·(cos φ, sen φ)ᵗ = (cos(φ+θ), sen(φ+θ))ᵗ. Reduza nθ módulo 360° antes de calcular. Reconheça a rotação pelos elementos (√3/2 e 1/2 → 30°; √2/2 → 45°); quando a matriz não é rotação, calcule A², A³ e procure o ciclo (Aᵏ = I). Cramer: det ≠ 0 dá solução única.',
    modelos: 'MODELO (matriz de termo geral) aᵢⱼ = 1 + (1−i)(1−j), ordem 100. I) trocar i por j não muda a expressão: simétrica (V). II) na linha i, aᵢⱼ = 1 + (1−i)(1−j) é afim em j com razão i−1: cada linha é PA (V; a linha 1 é constante, razão 0). III) aᵢⱼ = 1 + uᵢuⱼ, uᵢ = 1−i, é soma de duas matrizes de posto 1: posto ≤ 2 < 100, det = 0 (V). Confere em 3×3: [1 1 1; 1 2 3; 1 3 5] tem det = 1(10−9) − 1(5−3) + 1(3−2) = 0. Resposta: I, II e III.\nMODELO (potência de rotação) A = [√3/2, −1/2; 1/2, √3/2] = R(30°), B = (√2/2, √2/2)ᵗ = (cos 45°, sen 45°)ᵗ. A³¹ = R(930°) = R(210°) (930 = 2·360 + 210). A³¹B = (cos 255°, sen 255°)ᵗ; cos 255° = −cos 75° = −(√6−√2)/4 = −(√2/4)(√3−1); sen 255° = −sen 75° = −(√6+√2)/4 = −(√2/4)(√3+1). Confere: cos 255° ≈ −0,2588 e −(√2/4)(0,732) ≈ −0,2588. Resposta: o vetor com −(√2/4)(√3−1) em cima e −(√2/4)(√3+1) embaixo.',
  },
  {
    id: 'plana', nome: 'Geometria plana',
    detecta: [/triangul/, /quadrado/, /hexagon/, /hexagrama/, /poligono/, /inscrit/, /circunscrit/, /losango/, /trapezio/, /\barea\b/, /perimetro/, /apotema/, /estrela/, /setor/, /pontos a, b/, /equilater/, /\bcm\s*[²2]/],
    arsenal: '· Geometria plana: triângulo equilátero de lado ℓ: altura ℓ√3/2, área ℓ²√3/4; inscrito na circunferência de raio R: ℓ = R√3. Hexágono regular inscrito: lado = R; área 3ℓ²√3/2. Quadrado inscrito em raio R: diagonal 2R, lado R√2, área 2R² (= d²/2). Seis pontos que dividem a circunferência em partes iguais: arcos de 60°, corda = R; ligar de dois em dois dá dois triângulos equiláteros. HEXAGRAMA (estrela de seis pontas, união de dois triângulos equiláteros de lado ℓ): a interseção é um hexágono regular de lado ℓ/3 e cada ponta é um triângulo de lado ℓ/3; a estrela tem 12 triangulinhos de lado ℓ/3: área = 12·(ℓ/3)²·√3/4 = ℓ²√3/3 (com ℓ = R√3: R²√3). Polígono regular de n lados e raio R: (n/2)R² sen(360°/n). Semelhança de razão k: áreas k², volumes k³. Lei dos senos a/sen A = 2R; lei dos cossenos; Heron. Círculo πR²; setor (θ/360°)πR². Escreva tudo em função de UMA medida (R ou ℓ), resolva e só então calcule o que se pede.',
    modelos: 'MODELO (hexagrama e quadrado inscrito) Circunferência dividida em 6 partes por A..F; triângulos equiláteros ACE e BDF: lado ℓ = R√3. Hexagrama = 12 triângulos equiláteros de lado ℓ/3 = R/√3: área = 12·(R²/3)·√3/4 = R²√3. R²√3 = 25√3 ⇒ R² = 25. Quadrado inscrito: diagonal 2R, área = (2R)²/2 = 2R² = 50 cm². Confere: R = 5, ℓ = 5√3, estrela = ℓ²√3/3 = 75√3/3 = 25√3. Resposta: 50 cm².',
  },
  {
    id: 'espacial', nome: 'Geometria espacial e posições no espaço',
    detecta: [/\bcubo/, /prisma/, /piramide/, /cilindro/, /\bcone/, /esfera/, /tetraedro/, /octaedro/, /poliedro/, /\bplanos?\b/, /secao plana/, /\bvolume/, /aresta/, /retas? paralelas?/, /perpendicular/, /concorrentes/, /interse[cç]ao/, /equidist|dista igualmente/],
    arsenal: '· Espaço: dois planos são perpendiculares ⇔ um deles CONTÉM uma reta perpendicular ao outro ("existe uma reta"; "toda reta" é outra coisa e não serve de critério: num plano há retas paralelas ao outro plano). CUBO: a seção plana pode ser triângulo, quadrilátero (quadrado, retângulo, losango, trapézio, paralelogramo), PENTÁGONO (plano que corta 5 faces) e hexágono (regular pelos pontos médios de 6 arestas); como o cubo tem 6 faces, não passa de 6 lados, e o pentágono nunca é regular. Três planos dois a dois secantes com interseções r, s, t paralelas e distintas formam um PRISMA TRIANGULAR; cortando por um plano perpendicular a r, os planos viram 3 retas que formam um triângulo, e as retas paralelas a r que equidistam dos três planos correspondem aos pontos equidistantes das 3 retas: INCENTRO e 3 EXINCENTROS = 4 retas (nunca "uma única"). Se as três retas fossem concorrentes, só haveria um ponto. Distância de reta a plano paralelo = distância de qualquer ponto da reta ao plano. Volumes: prisma e cilindro = base·altura; pirâmide e cone = 1/3·base·altura; esfera 4πR³/3 e área 4πR². Diagonal do cubo a√3; do paralelepípedo √(a²+b²+c²). Afirmações em espaço: julgue cada uma com um sólido concreto (um cubo, um prisma) ou um contraexemplo.',
    modelos: 'MODELO (afirmações de geometria espacial) I) Cubo com seção pentágono: V (um plano inclinado que corta 5 faces). II) Planos α, β, η dois a dois concorrentes, r, s, t paralelas e distintas: seção reta = triângulo; os pontos equidistantes das 3 retas são incentro e 3 exincentros: 4 retas, não uma única (F). III) A caracterização é "existe uma reta de um plano perpendicular ao outro", não "toda reta" (F). Só I é verdadeira. Resposta: apenas I. Dica: se um item é duvidoso, veja qual combinação de itens existe nas alternativas.',
  },
  {
    id: 'polinomios', nome: 'Polinômios e equações',
    detecta: [/polinomi/, /\braiz/, /raizes/, /\bp\s*\(\s*x/, /\bgrau\b/, /girard/, /\bresto\b/, /coeficientes reais/, /x\s*\^\s*3/, /x\s*\^\s*4/],
    arsenal: '· Polinômios: relações de Girard (cúbica x³+bx²+cx+d: soma das raízes = −b, soma dos produtos dois a dois = c, produto = −d). Se p(a+x) = −p(a−x) para todo x, o gráfico é simétrico em relação ao ponto (a, 0): p(a) = 0 e, sendo cúbico mônico, p(x) = (x−a)³ + k(x−a). Se p(a+x) = p(a−x), a simetria é em relação à reta x = a. "Todas as raízes reais" pede discriminante ≥ 0 do fator que sobra. Teorema do resto: resto de p(x) por (x−a) é p(a). Raízes complexas vêm em pares conjugados (coeficientes reais); raízes racionais p/q: p divide o termo independente e q o coeficiente líder. Fatoração por agrupamento; substituição para biquadrada.',
    modelos: 'MODELO (polinômio) p(x) = x³+bx²+cx+d, todas as raízes reais, p(2+x) = −p(2−x): simetria no ponto (2,0), logo p(x) = (x−2)³ + k(x−2) = (x−2)[(x−2)²+k]. Raízes reais exigem k ≤ 0. p(0) = −8 − 2k = −8 + 2|k| ≥ −8, mínimo em k = 0 (raiz tripla 2, real). Resposta: −8.',
  },
  {
    id: 'analitica', nome: 'Geometria analítica',
    detecta: [/\breta\b/, /parabola/, /circunferencia/, /elipse/, /hiperbole/, /coeficiente angular/, /\bvertice/, /tangente a/, /reta tangente/, /distancia entre/, /\by\s*=/, /centro/, /tangentes externamente|tangentes internamente/],
    arsenal: '· Geometria analítica: reta ax+by+c = 0 tem coeficiente angular −a/b. Ângulo θ entre retas: tg θ = |(m₁−m₂)/(1+m₁m₂)|; com 45° resolva as duas opções do módulo e use a que satisfaz o enunciado (sinal do coeficiente). Distância ponto-reta |ax₀+by₀+c| ÷ √(a²+b²). Parábola y = ax²+bx+c: vértice (−b/2a, −Δ/4a); a reta de coeficiente angular m a tangencia no ponto de abscissa x = (m−b)/(2a) (derivada y\' = 2ax+b = m). Área do triângulo por determinante: ½|x₁(y₂−y₃)+x₂(y₃−y₁)+x₃(y₁−y₂)|. Circunferências de raios r₁, r₂: tangentes externas d = r₁+r₂, internas d = |r₁−r₂|; centros sobre y = mx: d = |Δr|·√(1+m²).',
    modelos: 'MODELO (reta, parábola e área) Reta r: 3x+4y = −15 (m = −3/4), parábola y = x²+x+6, vértice V(−1/2, 23/4). Tangente t com m < 0 a 45° de r: |(m+3/4)/(1−3m/4)| = 1 dá m = 1/7 ou m = −7; vale m = −7. 2x+1 = −7 → A(−4, 18); t: y = −7x−10. t ∩ r: B(−1, −3). Área ABV = ½|−4(−3−23/4) + (−1)(23/4−18) + (−1/2)(18+3)| = 147/8.\nMODELO (circunferências tangentes) Cₖ de centro (rₖ, m·rₖ) e raio rₖ, tangentes externas consecutivas: distância entre centros = (rₖ₊₁−rₖ)√(1+m²) = rₖ+rₖ₊₁. Com rₖ₊₁ = q·rₖ: (q−1)√(m²+1) = q+1 ⇒ q = (√(m²+1)+1)/(√(m²+1)−1) = (√(m²+1)+1)²/m².',
  },
  {
    id: 'trigonometria', nome: 'Trigonometria',
    detecta: [/\bsen\b/, /\bsin\b/, /\bcos\b/, /cosseno/, /\btg\b/, /\btan\b/, /\bsec\b/, /cossec/, /trigonom/, /\barco\b/, /π|\bpi\b/, /\bcotg\b/],
    arsenal: '· Trigonometria: sec = 1/cos, cossec = 1/sen. cos 2x = 2cos²x−1 = 1−2sen²x; sen 2x = 2 sen x cos x; tg(y/2) = (1−cos y)/sen y = sen y/(1+cos y); cos(π/2−x) = sen x; cos(π−2y) = −cos 2y. Adição: sen(a±b), cos(a±b). Valores: 15° e 75° (sen 75° = (√6+√2)/4, cos 75° = (√6−√2)/4). Lei dos senos e dos cossenos. Equação com várias razões: reduza tudo a uma só função da mesma variável e cuide do domínio dado ("x, y ∈ ]0, π/2[" corta raízes).',
    modelos: 'MODELO (sistema trigonométrico) tg y · tg(y/2) = cos 2x · sec y e sen y/cos x + cos x/sen y = 2, x, y ∈ ]0, π/2[. Segunda equação: a + 1/a = 2 com a = sen y/cos x > 0 ⇒ a = 1 ⇒ sen y = cos x ⇒ y = π/2 − x. Então cos 2x = −cos 2y e tg y tg(y/2) = (1−cos y)/cos y; com c = cos y: 1−c = −(2c²−1) ⇒ c(2c−1) = 0 ⇒ c = 1/2 ⇒ y = π/3, x = π/6. Produto xy = π²/18.',
  },
  {
    id: 'desigualdades', nome: 'Desigualdades, funções e extremos',
    detecta: [/desigualdade/, /inequacao/, /\bfuncao\b/, /dominio/, /\binversa\b/, /composta/, /\bmaximo\b/, /\bminimo\b/, /menor valor/, /maior valor/, /\bmg\b/, /modular/],
    arsenal: '· Desigualdades e extremos: MA ≥ MG (a+b ≥ 2√(ab); para a > 0, a + 1/a ≥ 2, com igualdade só em a = 1). Quando a soma de duas parcelas positivas inversas é igual a 2, as duas valem 1: a igualdade determina a incógnita. Função quadrática: extremo no vértice. Valor mínimo/máximo: escreva a expressão numa só variável e estude vértice, derivada ou desigualdade conhecida; confira o valor extremo no ponto onde ele ocorre. Função: domínio (denominador ≠ 0, radicando ≥ 0, log > 0), inversa (troque x e y e isole), composta (substitua de dentro para fora). Módulo: |x| < a ⇔ −a < x < a.',
    modelos: '',
  },
  {
    id: 'contagem', nome: 'Contagem, probabilidade e binômio',
    detecta: [/bijec/, /permut/, /combinac/, /arranjo/, /quantas/, /quantidade de/, /maneiras/, /probabilidade/, /binomio/, /anagrama/, /sorteio/, /fatorial/, /\binjetora\b/, /\bsobrejetora\b/],
    arsenal: '· Contagem: princípio multiplicativo; permutações n!; com repetição n!/(a!·b!); arranjo A(n,k) = n!/(n−k)!; combinação C(n,k). Restrições de ORDEM entre posições de uma permutação: cada grupo disjunto de k elementos com ordem fixa divide o total por k! (n!/(k₁!·k₂!)); bijeção de A em A é permutação de A. Inclusão-exclusão para "pelo menos". Complementar: total − indesejados. Probabilidade = favoráveis ÷ possíveis; eventos independentes multiplicam; condicional P(A|B) = P(A∩B)/P(B). Binômio: (a+b)ⁿ, termo geral C(n,k)·aⁿ⁻ᵏ·bᵏ; soma dos coeficientes = valor em a = b = 1.',
    modelos: 'MODELO (bijeções com ordem) Bijeções de A = {1,...,8} com F(1)<F(5)<F(3) e F(7)<F(2): grupos disjuntos de 3 e de 2 posições com ordem fixa: 8!/(3!·2!) = 40320/12 = 3360.',
  },
  {
    id: 'sequencias', nome: 'Sequências, progressões e séries',
    detecta: [/progressao/, /\bpa\b/, /\bpg\b/, /sequencia/, /termo geral/, /\brazao\b/, /soma dos/, /\bserie\b/],
    arsenal: '· Sequências: PA aₙ = a₁+(n−1)r, soma (a₁+aₙ)n/2; PG aₙ = a₁qⁿ⁻¹, soma a₁(qⁿ−1)/(q−1), infinita a₁/(1−q) se |q| < 1. PG crescente de termos positivos tem q > 1. Em figuras que se repetem (círculos tangentes, quadrados encaixados), ache a razão pela relação entre dois termos vizinhos. Recorrência: calcule os primeiros termos, ache o padrão e confirme por indução.',
    modelos: '',
  },
];

// Pontos de cada assunto no texto; os que não pontuam não entram.
export function topicosDaQuestao(texto) {
  const t = SEM_ACENTO(String(texto == null ? '' : texto).slice(0, 8000)) + ' ' + String(texto == null ? '' : texto).slice(0, 8000);
  const lista = [];
  TOPICOS.forEach(function (tp, ordem) {
    let pontos = 0;
    tp.detecta.forEach(function (re) { if (re.test(t)) pontos++; });
    if (pontos > 0) lista.push({ topico: tp, pontos: pontos, ordem: ordem });
  });
  lista.sort(function (a, b) { return b.pontos - a.pontos || a.ordem - b.ordem; });
  return lista.map(function (x) { return x.topico; });
}

// Texto do roteiro para esta questão: arsenal de todos os assuntos que combinam, depois os modelos resolvidos enquanto couberem.
// teto: caracteres no total (uma prova inteira ocupa mais que uma questão avulsa).
export function arsenalDaQuestao(texto, teto) {
  const max = teto || 13000;
  const topicos = topicosDaQuestao(texto);
  if (!topicos.length) return '';
  const partes = ['ARSENAL (só os assuntos desta questão)'];
  let usado = partes[0].length;
  const incluidos = [];
  topicos.forEach(function (tp) { if (usado + tp.arsenal.length + 1 <= max) { partes.push(tp.arsenal); usado += tp.arsenal.length + 1; incluidos.push(tp); } });
  const modelos = [];
  incluidos.forEach(function (tp) { if (tp.modelos && usado + tp.modelos.length + 1 <= max) { modelos.push(tp.modelos); usado += tp.modelos.length + 1; } });
  if (modelos.length) partes.push('MODELOS RESOLVIDOS (padrão de raciocínio e de fechamento; o enunciado pedido pode ser parecido, mas confira os dados dele)', modelos.join('\n'));
  return partes.join('\n');
}
