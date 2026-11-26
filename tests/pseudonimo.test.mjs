import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { criarRegistro, cpfValido, cpfsNoTexto } from '../shared/pseudonimo.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { juntar } from '../scripts/build.mjs';

const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';

test('CPF: dígitos verificadores e formatos', () => {
  assert.equal(cpfValido('123.456.789-09'), true);
  assert.equal(cpfValido('11144477735'), true);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('123.456.789-10'), false);
  assert.deepEqual(cpfsNoTexto('CPF 123.456.789-10 e 95981234567'), ['123.456.789-10']); // formatado vale; 11 dígitos colados sem rótulo e sem DV certo, não
  assert.deepEqual(cpfsNoTexto('cpf: 11144477735'), ['11144477735']);
});

test('troca nome e CPF por marcadores, o texto fica limpo para o filtro e volta na tela', () => {
  const r = criarRegistro();
  const p = r.proteger('A Maria Souza, CPF 123.456.789-09, faltou ao CRAS Cristiana Vicente Nunes');
  assert.ok(p);
  assert.ok(!/Maria|Souza|123\.456/.test(p.texto), p.texto);
  assert.match(p.texto, /PESSOA_1/); assert.match(p.texto, /CPF_1/);
  assert.match(p.texto, /Cristiana Vicente Nunes/); // instituição não vira pessoa
  assert.equal(temDadoPessoal(p.texto + p.nota), false);
  assert.match(p.nota, /CPF_1 tem dígitos verificadores válidos/);
  assert.equal(r.restaurar('PESSOA_1 (CPF_1) está em dia.'), 'Maria Souza (123.456.789-09) está em dia.');
  assert.equal(r.restaurar('pessoa_1 e PESSOA_7'), 'Maria Souza e PESSOA_7');
});

test('a mesma pessoa mantém o marcador nas mensagens seguintes, mesmo só pelo primeiro nome', () => {
  const r = criarRegistro();
  r.proteger('Dona Maria Souza recebe bolsa');
  const p2 = r.proteger('e a Maria, pode incluir o filho? João Pedro Alves faltou');
  assert.match(p2.texto, /PESSOA_1/); assert.match(p2.texto, /PESSOA_2/);
  assert.ok(!/Maria|João|Alves/.test(p2.texto), p2.texto);
  assert.equal(r.ocultar('Maria Souza e João Pedro Alves'), 'PESSOA_1 e PESSOA_2');
  r.limpar(); assert.equal(r.vazio(), true); assert.equal(r.ocultar('Maria Souza'), 'Maria Souza');
});

test('sem nome nem CPF não faz nada; telefone continua sem ser lido', () => {
  const r = criarRegistro();
  assert.equal(r.proteger('o que é o CadÚnico?'), null);
  const p = r.proteger('A Maria Souza, CPF 123.456.789-09, tel (95) 98123-4567');
  assert.ok(p); assert.equal(temDadoPessoal(p.texto), true); // sobrou telefone: o cliente bloqueia
});

function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, TextEncoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}
function fetchIA(corpos, resposta) {
  return async (url, init) => {
    corpos.push(String(init.body));
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ resposta, fontes: [] }) };
  };
}

test('cliente: a IA só recebe marcadores; a resposta volta com o nome e o CPF reais', async () => {
  const corpos = [];
  const P = carregar(fetchIA(corpos, 'Confira se PESSOA_1 (CPF_1) está com a frequência em dia.'));
  P.init({ app: 'argo', endpoint: ENDPOINT, minIntervaloMs: 0 });
  const r = await P.perguntar('A Maria Souza, CPF 123.456.789-09, faltou. O que faço?');
  assert.equal(r.tipo, 'ia');
  assert.equal(r.texto, 'Confira se Maria Souza (123.456.789-09) está com a frequência em dia.');
  assert.equal(corpos.length, 1);
  assert.ok(!/Maria|Souza|123\.456|12345678909/.test(corpos[0]), corpos[0]);
  assert.match(corpos[0], /PESSOA_1/); assert.match(corpos[0], /CPF_1/);
  assert.equal(r.pergunta, ''); assert.equal(r.sensivel, true);
  // segunda pergunta: o histórico que vai à IA também só tem marcadores
  const r2 = await P.perguntar('E a Maria, o que mais devo fazer?');
  assert.equal(r2.tipo, 'ia');
  assert.equal(corpos.length, 2);
  assert.ok(!/Maria|Souza|123\.456/.test(corpos[1]), corpos[1]);
});

test('cliente: sem IA não envia nada e diz que o dado ficou no aparelho; com telefone, bloqueia', async () => {
  const corpos = [];
  const P = carregar(fetchIA(corpos, 'x'));
  P.init({ app: 'argo', endpoint: '' });
  const r = await P.perguntar('A Maria Souza, CPF 123.456.789-09, faltou');
  assert.equal(r.tipo, 'bloqueio'); assert.match(r.texto, /não saiu daqui/);
  const Q = carregar(fetchIA(corpos, 'x'));
  Q.init({ app: 'argo', endpoint: ENDPOINT, minIntervaloMs: 0 });
  const b = await Q.perguntar('A Maria Souza, tel (95) 98123-4567, faltou');
  assert.equal(b.tipo, 'bloqueio');
  assert.equal(corpos.length, 0);
});

test('cliente: pseudonimizar:false volta a bloquear', async () => {
  const corpos = [];
  const P = carregar(fetchIA(corpos, 'x'));
  P.init({ app: 'argo', endpoint: ENDPOINT, minIntervaloMs: 0, pseudonimizar: false });
  assert.equal((await P.perguntar('A Maria Souza, CPF 123.456.789-09, faltou')).tipo, 'bloqueio');
  assert.equal(corpos.length, 0);
});
