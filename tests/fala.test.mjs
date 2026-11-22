import test from 'node:test';
import assert from 'node:assert/strict';
import { falaTexto, falaDividir, falaResumir } from '../shared/fala.mjs';

const RESPOSTA = `O **CRAS** é a porta de entrada da [Proteção Social Básica](https://www.gov.br/mds).

- Atende famílias do território
- Oferta o PAIF e o SCFV

| Serviço | Sigla |
|---|---|
| Proteção e Atendimento Integral à Família | PAIF |

\`\`\`
const x = 1;
\`\`\`

Fonte: Tipificação Nacional, Resolução CNAS nº 109/2009, art. 6º-C, § 1º
Fonte: LOAS · Lei nº 8.742/1993
Resposta gerada por IA. Confira antes de usar em atendimento.`;

test('fala: tira fontes, aviso de IA, link, código e marcas de Markdown', () => {
  const t = falaTexto(RESPOSTA);
  assert.ok(!/Fonte|gerada por IA|https|const x|\*\*|\||---/.test(t), t);
  assert.ok(t.startsWith('O CRAS é a porta de entrada da Proteção Social Básica.'), t);
  assert.ok(t.includes('Atende famílias do território.'), t);
  assert.ok(t.includes('Serviço, Sigla.') && t.includes('Proteção e Atendimento Integral à Família, páif.'), t);
  assert.ok(t.includes('Oferta o páif e o ésse cê éfe vê.'), t);
});

test('fala: fontes em lista, tags HTML e emojis não são lidos', () => {
  const t = falaTexto('Resposta curta ✅\n\n<script>alert(1)</script><img src=x onerror=alert(2)>Texto.\n\nFontes:\n- Norma um\n- Norma dois\n\nDepois das fontes.');
  assert.ok(!/script|onerror|alert|Norma|✅/.test(t), t);
  assert.ok(t.startsWith('Resposta curta.'), t);
  assert.ok(t.includes('Depois das fontes.'), t);
});

test('fala: símbolos, números e siglas por extenso', () => {
  const t = falaTexto('Benefício de R$ 1.518,00 e R$ 600,50, 15% do BPC (art. 6º-C, § 1º, nº 109, 3ª edição, p. 88). CPF e NIS.');
  assert.ok(t.startsWith('Benefício de 1.518 reais e 600 reais e 50 centavos,'), t);   // "00" centavos não é falado
  assert.ok(t.includes('15 por cento do bê pê cê'), t);
  assert.ok(t.includes('artigo sexto C, parágrafo primeiro, número 109, terceira edição, página 88'), t);
  assert.ok(t.includes('cê pê éfe e NIS.'), t);
});

test('fala: dinheiro no singular, centavos e valores grandes', () => {
  assert.equal(falaTexto('R$ 1,00'), '1 real.');
  assert.equal(falaTexto('R$ 0,50'), '50 centavos.');
  assert.equal(falaTexto('R$ 2 mil'), '2 mil reais.');
  assert.equal(falaTexto('R$ 1,5 milhão'), '1,5 milhão de reais.');
});

test('fala: datas, horas e siglas sem vogal', () => {
  const t = falaTexto('Atendimento em 01/03/2026 às 14h30, em BV (RR).');
  assert.ok(t.includes('primeiro de março de 2026'), t);
  assert.ok(t.includes('14 horas e 30 minutos'), t);
  assert.ok(t.includes('bê vê (érre érre)'), t);
});

test('fala: CadÚnico, barras e travessões não são lidos como símbolo', () => {
  const t = falaTexto('O CadÚnico — base do Bolsa Família e/ou do BPC — integra CRAS/CREAS. Lei 8.742/1993; leia/escreva → ok.');
  assert.ok(!/[—/→]/.test(t), t);
  assert.ok(t.includes('Cadastro Único, base do Bolsa Família e ou do bê pê cê, integra CRAS e CREAS.'), t);
  assert.ok(t.includes('8.742 de 1993'), t);
  assert.ok(t.includes('leia ou escreva, ok'), t);
});

test('fala: resumo pega as primeiras frases e avisa que o resto está na tela', () => {
  const longo = Array.from({ length: 12 }, (_, i) => 'Esta é a frase número ' + (i + 1) + ' da resposta sobre o território do CRAS.').join(' ');
  const r = falaResumir(longo);
  assert.ok(r.startsWith('Esta é a frase número 1 '), r);
  assert.ok(r.includes('frase número 4 ') && !r.includes('frase número 5 '), r);
  assert.ok(r.endsWith('O restante está na tela.'), r);
  assert.equal(falaResumir('Resposta curta. Só isso.'), 'Resposta curta. Só isso.');
});

test('fala: dividir em trechos curtos cortados no fim da frase', () => {
  const t = 'Primeira frase curta. Segunda frase um pouco maior que a primeira, para encher o trecho. Terceira frase. '.repeat(6).trim();
  const trechos = falaDividir(t, { max: 160, primeiro: 80 });
  assert.ok(trechos.length > 3, String(trechos.length));
  assert.ok(trechos[0].length <= 100, trechos[0]);
  trechos.forEach(function (c) { assert.ok(c.length <= 160, c); assert.ok(/[.!?]$/.test(c), c); });
  assert.equal(trechos.join(' '), t);
});

test('fala: frase gigante sem ponto é quebrada em vírgulas e depois nas palavras', () => {
  const frase = Array.from({ length: 80 }, (_, i) => 'palavra' + i).join(' ') + '.';
  const trechos = falaDividir(frase, { max: 100 });
  assert.ok(trechos.length > 5);
  trechos.forEach(function (c) { assert.ok(c.length <= 100, c); });
  assert.equal(trechos.join(' '), frase);
});

test('fala: entradas estranhas não quebram', () => {
  [null, undefined, '', '   ', 42, {}, '```\nsó código\n```', '| | |\n|-|-|', '\u0000\u0001', 'a'.repeat(50000)].forEach(function (x) {
    assert.equal(typeof falaTexto(x), 'string');
    assert.ok(Array.isArray(falaDividir(falaTexto(x))));
    assert.equal(typeof falaResumir(x), 'string');
  });
  assert.equal(falaTexto('```\nsó código\n```'), '');
  assert.deepEqual(falaDividir(''), []);
});

test('fala: telefone, CEP, CPF e NIS não viram "menos" nem número gigante', () => {
  const t = falaTexto('Ligue 3623-1234. CEP 69301-000. CPF 123.456.789-00. NIS 12345678901.');
  assert.ok(!/3623-1234|69301-000|\d{9}/.test(t), t);
  assert.match(t, /3623, 1234/);
  assert.match(t, /6 9 3 0 1, 0 0 0/);
});

test('fala: fração, temperatura, unidades e e-mail', () => {
  const t = falaTexto('Renda de 1/4 do salário, 25°C, 5 km, 1 kg, 100m² e a@b.gov.br, de seg. a sex.');
  assert.match(t, /um quarto/); assert.match(t, /25 graus Celsius/); assert.match(t, /5 quilômetros/);
  assert.match(t, /1 quilo\b/); assert.match(t, /100 metros quadrados/); assert.match(t, /a arroba b ponto gôv ponto bê érre/);
  assert.match(t, /segunda a sexta/);
  assert.ok(!/vigésimo/.test(t), t);
});

import { falaTrechos, falaAprender, falaDicionario } from '../shared/fala.mjs';

test('fala: siglas que se leem como palavra ganham pronúncia, mas o pronome "suas" não muda', () => {
  const t = falaTexto('O SUAS e o CRAS atendem suas famílias pelo PAIF.');
  assert.match(t, /súas/); assert.match(t, /páif/);
  assert.match(t, /suas famílias/);
});

test('fala: o que o Paulus aprende vale na fala, sem mexer no dicionário original', () => {
  const d0 = {}, d1 = falaAprender(d0, 'Pacaraima', 'pacaraíma');
  assert.deepEqual(d0, {});
  assert.match(falaTexto('Moro em Pacaraima.', { dicionario: d1 }), /pacaraíma/);
  assert.ok(!/pacaraíma/.test(falaTexto('Moro em Pacaraima.')));
  assert.deepEqual(falaAprender(d1, 'pacaraima', ''), {});              // vazio esquece
  assert.deepEqual(falaDicionario({ x: '<script>' }), {});             // símbolo estranho não entra
});

test('fala: prosódia — pergunta sobe o tom, aviso vai mais devagar, pausa maior depois de dois-pontos', () => {
  const tr = falaTrechos('Atenção: confira o prazo. Você já tem o cadastro? Ótimo. Então siga em frente com o atendimento.');
  assert.ok(tr.length >= 3);
  assert.ok(tr[0].taxa < 1 && tr[0].pausa >= 300, JSON.stringify(tr[0]));
  const perg = tr.find(x => /\?$/.test(x.t)); assert.ok(perg && perg.tom > 1);
  assert.equal(tr[tr.length - 1].pausa, 0);
  assert.ok(tr.every(x => x.t && x.tom > 0 && x.taxa > 0));
});
