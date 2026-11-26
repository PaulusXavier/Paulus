// Resposta por extração de frases (sem IA): só frases copiadas da base, cada uma com a fonte; sem frase que cubra a pergunta, null.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { montarBase } from '../scripts/build-knowledge.mjs';
import { juntar } from '../scripts/build.mjs';
import { criarIndice, buscarFontes } from '../shared/busca.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { limparMarcaEsgotada } from '../worker/cota.mjs';
import { tipoDaPergunta, dividirEmFrases, responderPorExtracao } from '../shared/resposta-extrativa.mjs';

const base = montarBase();
const indice = criarIndice(base);
const achar = (q) => buscarFontes(indice, q, { k: 4 });
const ORIGEM = 'https://paulusxavier.github.io';
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';
const ERRO_4006 = '4006: you have used up your daily free allocation of 10,000 neurons';

const trecho = (doc, titulo, texto, extra) => ({ trecho: Object.assign({ doc, titulo, referencia: '', texto }, extra || {}), aderencia: 'alta' });

test('tipoDaPergunta: reconhece o que a pessoa quer saber', () => {
  assert.equal(tipoDaPergunta('Qual o valor da linha de pobreza do Bolsa Família?'), 'valor');
  assert.equal(tipoDaPergunta('Qual a renda per capita do Bolsa Família?'), 'valor');
  assert.equal(tipoDaPergunta('Qual o prazo para a revisão cadastral?'), 'prazo');
  assert.equal(tipoDaPergunta('Quais documentos para fazer o CadÚnico?'), 'documentos');
  assert.equal(tipoDaPergunta('Quem tem direito ao BPC?'), 'direito');
  assert.equal(tipoDaPergunta('Quem é responsável pelo CRAS?'), 'quem');
  assert.equal(tipoDaPergunta('O que é o PAIF?'), 'definicao');
  assert.equal(tipoDaPergunta('Fale sobre a política de assistência'), null);
});

test('dividirEmFrases: não corta em "Art. 5º" nem em valor como R$ 1.518,00', () => {
  const f = dividirEmFrases('Conforme o Art. 5º desta Lei, a renda é de R$ 1.518,00 por mês. A família deve atualizar o cadastro. Veja gov.br para mais.\n- Item de lista um com texto suficiente.');
  assert.equal(f.length, 4);
  assert.match(f[0], /^Conforme o Art\. 5º desta Lei, a renda é de R\$ 1\.518,00 por mês\.$/);
  assert.equal(f[1], 'A família deve atualizar o cadastro.');
  assert.match(f[2], /gov\.br/);
});

test('frases escolhidas são cópia literal da base (nada é inventado) e cada uma aponta para a fonte certa', () => {
  for (const q of ['Quais documentos para fazer o CadÚnico?', 'Qual a renda per capita do Bolsa Família?', 'O que é o PAIF?', 'Quais famílias são elegíveis ao Bolsa Família?']) {
    const achados = achar(q);
    const r = responderPorExtracao(q, achados);
    assert.ok(r, q);
    for (const f of r.frases) {
      const t = achados[f.achado].trecho.texto.replace(/\s+/g, ' ');
      const literal = f.texto.replace(/ \[\.\.\.\]$/, '');
      assert.ok(t.includes(literal), 'a frase tem de estar no trecho: ' + literal);
      assert.ok(r.texto.includes('[' + f.fonte + ']'));
    }
    assert.match(r.texto, /\*\*Fontes\*\*\n- \[1\] /);
  }
});

test('pergunta de valor traz a frase com o número e o aviso de que valor muda com o tempo', () => {
  const r = responderPorExtracao('Qual a renda per capita do Bolsa Família?', achar('Qual a renda per capita do Bolsa Família?'));
  assert.match(r.texto, /R\$ 218,00/);
  assert.ok(r.avisos.some((a) => /Valores e limites mudam/.test(a)));
});

test('só entram trechos de aderência ALTA: frase solta de trecho fraco pode ser o contrário do que o texto defende', () => {
  const t = trecho('bolsa-familia-2026', 'Bolsa Família', 'A renda per capita do Bolsa Família é de R$ 218,00 por pessoa.');
  assert.ok(responderPorExtracao('Qual a renda per capita do Bolsa Família?', [t]));
  t.aderencia = 'media';
  assert.equal(responderPorExtracao('Qual a renda per capita do Bolsa Família?', [t]), null);
});

test('ficha de ferramenta do app, tabela despejada e lista de palavras-chave não viram resposta', () => {
  const ficha = trecho('argo-cards-abas', 'Cards do Argo', 'Renda per capita é uma ferramenta da aba Ferramentas do Argo, com valor de R$ 218,00 na comparação.');
  assert.equal(responderPorExtracao('Qual a renda per capita do Bolsa Família?', [ficha]), null);
  const lista = trecho('x', 'Bolsa Família', 'Palavras-chave da busca: valor renda per capita bolsa familia R$ 218,00 salario minimo.');
  assert.equal(responderPorExtracao('Qual a renda per capita do Bolsa Família?', [lista]), null);
});

test('valores diferentes em normas diferentes geram aviso de conferência', () => {
  const a = trecho('lei-a', 'Lei A do Bolsa Família', 'A renda familiar per capita do Bolsa Família é de até R$ 218,00 por mês.');
  const b = trecho('dec-b', 'Decreto B do Bolsa Família', 'A renda familiar per capita do Bolsa Família é de até R$ 250,00 por mês.');
  const r = responderPorExtracao('Qual a renda per capita do Bolsa Família?', [a, b]);
  assert.ok(r.avisos.some((x) => /Normas diferentes trazem valores diferentes \(R\$218,00, R\$250,00\)/.test(x)), JSON.stringify(r.avisos));
});

test('o fecho avisa que a extração não decide o caso concreto (posso/devo e quem tem direito)', () => {
  const r = responderPorExtracao('Quem tem direito ao Benefício de Prestação Continuada?', achar('Quem tem direito ao Benefício de Prestação Continuada?'));
  assert.ok(r.avisos.some((a) => /não análise do caso concreto/.test(a)));
  assert.ok(!r.frases.some((f) => /^Compete\b/.test(f.texto)), 'frase de competência de órgão não responde "quem tem direito"');
});

test('sem frase que cubra a pergunta devolve null (o app mostra os trechos inteiros, como antes)', () => {
  assert.equal(responderPorExtracao('Fale sobre a política de assistência', achar('Fale sobre a política de assistência')), null);
  assert.equal(responderPorExtracao('Qual o valor da passagem de ônibus em Marte?', achar('Qual o valor da passagem de ônibus em Marte?')), null);
  assert.equal(responderPorExtracao('Qual o valor?', []), null);
});

// ---------------------------------------------------------------- app

function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}
function fetchSemCota() {
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { throw new Error(ERRO_4006); } } };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => manipular(new Request(url, { method: init.method, headers: Object.assign({}, init.headers, { Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }), body: init.body }), env);
}

test('app: com a cota esgotada a resposta traz as frases certas, as fontes numeradas e os trechos na íntegra', async () => {
  limparMarcaEsgotada();
  const P = carregar(fetchSemCota());
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, minIntervaloMs: 0 });
  await P.perguntar('Quem gere o Cadastro Único no município?');   // a primeira chamada descobre que a cota acabou
  assert.equal(P.ia.estado().pausada, true);
  const r = await P.perguntar('Qual o valor da linha de pobreza do Bolsa Família?');
  assert.equal(r.tipo, 'norma');
  assert.equal(r.extrativa, true);
  assert.equal(r.semIA, true);
  assert.match(r.texto, /R\$ 218,00/);
  assert.match(r.texto, /\*\*Fontes\*\*\n- \[1\]/);
  assert.match(r.texto, /Os trechos completos, para dar contexto/);
  assert.ok(r.fontes.length >= 1);
  assert.ok(r.avisos.some((a) => /cota gratuita da IA acabou/.test(a)));
  assert.ok(r.avisos.some((a) => /Valores e limites mudam/.test(a)));
  limparMarcaEsgotada();
});

test('app: pergunta que a extração não cobre continua mostrando os trechos como antes', async () => {
  limparMarcaEsgotada();
  const P = carregar(fetchSemCota());
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, minIntervaloMs: 0 });
  await P.perguntar('Quem gere o Cadastro Único no município?');
  const r = await P.perguntar('Quem gere o Cadastro Único no município? Explique.');
  assert.equal(r.tipo, 'norma');
  assert.ok(!r.extrativa);
  assert.match(r.texto, /trechos da base de normas mais ligados/);
  limparMarcaEsgotada();
});
