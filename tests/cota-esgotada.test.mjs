// Cota da IA esgotada: o Worker reconhece o erro 4006 e responde 503 com a hora da renovação (sem gastar o modelo reserva),
// e o app para de insistir na IA e responde com a base de normas, dizendo quando a IA volta.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { montarBase } from '../scripts/build-knowledge.mjs';
import { juntar } from '../scripts/build.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { ehErroDeCota, marcarCotaEsgotada, cotaMarcadaEsgotada, limparMarcaEsgotada, corpoCotaEsgotada, proximaRenovacao } from '../worker/cota.mjs';

const base = montarBase();
const ORIGEM = 'https://paulusxavier.github.io';
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';
const ERRO_4006 = '4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare\'s Workers Paid plan if you would like to continue usage.';
const semEspera = { minIntervaloMs: 0 };

function pedido(pergunta, extra) {
  return new Request('https://x/', { method: 'POST', headers: { Origin: ORIGEM, 'Content-Type': 'application/json', 'CF-Connecting-IP': '8.8.' + Math.floor(Math.random() * 250) + '.1' }, body: JSON.stringify(Object.assign({ app: 'argo', pergunta: pergunta }, extra || {})) });
}

test('ehErroDeCota: reconhece a mensagem da Cloudflare e não confunde com outras falhas', () => {
  assert.equal(ehErroDeCota(new Error(ERRO_4006)), true);
  assert.equal(ehErroDeCota(Object.assign(new Error('x'), { code: 4006 })), true);
  assert.equal(ehErroDeCota('AiError: 4006: you have used up your daily free allocation'), true);
  assert.equal(ehErroDeCota(new Error('timeout')), false);
  assert.equal(ehErroDeCota(new Error('3040: Capacity temporarily exceeded')), false);
  assert.equal(ehErroDeCota(null), false);
});

test('marca de cota esgotada: vale poucos minutos e nunca passa da renovação', () => {
  limparMarcaEsgotada();
  const t = Date.UTC(2026, 10, 24, 15, 0);
  marcarCotaEsgotada(t);
  assert.equal(cotaMarcadaEsgotada(t + 5 * 60000), true);
  assert.equal(cotaMarcadaEsgotada(t + 11 * 60000), false);
  // 5 minutos antes da meia-noite UTC: a marca acaba na renovação, não depois
  const quase = Date.UTC(2026, 10, 24, 23, 55);
  marcarCotaEsgotada(quase);
  assert.equal(cotaMarcadaEsgotada(proximaRenovacao(quase) - 1), true);
  assert.equal(cotaMarcadaEsgotada(proximaRenovacao(quase)), false);
  const c = corpoCotaEsgotada(quase);
  assert.equal(c.cota, true);
  assert.equal(c.renova, '2026-11-25T00:00:00.000Z');
  assert.equal(c.esperaSeg, 300);
  limparMarcaEsgotada();
});

test('Worker: cota esgotada vira 503 com a renovação, sem tentar o modelo reserva e sem chamar a IA de novo', async () => {
  limparMarcaEsgotada();
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(m) { chamadas.push(m); throw new Error(ERRO_4006); } } };
  const m = criarManipulador({ base, apps: APPS });
  const r1 = await m(pedido('Quem gere o Cadastro Único no município?'), env);
  assert.equal(r1.status, 503);
  const j = await r1.json();
  assert.equal(j.cota, true);
  assert.match(j.renova, /T00:00:00\.000Z$/);
  assert.ok(j.esperaSeg > 0);
  assert.equal(chamadas.length, 1, 'o modelo reserva usa a mesma franquia: não vale tentar');
  // segunda pergunta: a marca faz o Worker responder na hora, sem nenhuma chamada à IA
  const r2 = await m(pedido('E o CRAS, quem coordena?'), env);
  assert.equal(r2.status, 503);
  assert.equal((await r2.json()).cota, true);
  assert.equal(chamadas.length, 1);
  limparMarcaEsgotada();
});

test('Worker: falha que não é de cota continua 502 e o modelo reserva continua sendo tentado', async () => {
  limparMarcaEsgotada();
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(m) { chamadas.push(m); throw new Error('capacidade temporariamente esgotada'); } } };
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido('Quem gere o Cadastro Único no município?'), env);
  assert.equal(r.status, 502);
  assert.ok((await r.json()).erro);
  assert.ok(chamadas.length >= 2, 'principal e reserva');
  assert.equal(cotaMarcadaEsgotada(), false);
});

test('Worker: se o modelo grande falha por outro motivo e o reserva esbarra na cota, também vira 503', async () => {
  limparMarcaEsgotada();
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(m) { throw new Error(/70b/.test(m) ? 'timeout' : ERRO_4006); } } };
  const r = await criarManipulador({ base, apps: APPS })(pedido('Quem gere o Cadastro Único no município?'), env);
  assert.equal(r.status, 503);
  limparMarcaEsgotada();
});

test('Worker: interpretação também responde 503 de cota (o app não cai)', async () => {
  limparMarcaEsgotada();
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { throw new Error(ERRO_4006); } } };
  const r = await criarManipulador({ base, apps: APPS })(pedido('quem coordena o CRAS?', { modo: 'interpretar' }), env);
  assert.equal(r.status, 503);
  limparMarcaEsgotada();
});

test('Worker: o que não usa IA segue funcionando com a cota esgotada (socorro e consulta direta de ficha)', async () => {
  limparMarcaEsgotada();
  marcarCotaEsgotada();
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { throw new Error('não deveria chamar'); } } };
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido('quero morrer'), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).crise, true);
  limparMarcaEsgotada();
});

// ---------------------------------------------------------------- app (o arquivo do navegador contra o Worker de verdade)

function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

function fetchSemCota(contador) {
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { throw new Error(ERRO_4006); } } };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => {
    contador.n++;
    return manipular(new Request(url, { method: init.method, headers: Object.assign({}, init.headers, { Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }), body: init.body }), env);
  };
}

test('app: com a cota esgotada responde com vários trechos da base, avisa quando a IA volta e para de insistir', async () => {
  limparMarcaEsgotada();
  const c = { n: 0 };
  const P = carregar(fetchSemCota(c));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  assert.equal(P.ia.estado().pausada, false);

  const r = await P.perguntar('Quem gere o Cadastro Único no município?');
  assert.equal(r.tipo, 'norma');
  assert.equal(r.semIA, true);
  assert.equal(r.cotaEsgotada, true);
  assert.match(r.texto, /sem a IA agora/);
  assert.ok(r.fontes.length >= 1);
  assert.ok(r.avisos.some(a => /cota gratuita da IA acabou/.test(a) && /renova às \d{2}:\d{2}/.test(a)), 'diz quando renova: ' + JSON.stringify(r.avisos));
  const e = P.ia.estado();
  assert.equal(e.pausada, true);
  assert.match(e.renovaEm, /^\d{2}:\d{2}$/);
  assert.equal(c.n, 1);

  // segunda pergunta: nem vai à rede
  const r2 = await P.perguntar('E quem coordena o CRAS?');
  assert.equal(c.n, 1, 'com a IA em pausa o app não chama o Worker');
  assert.ok(r2.semIA === true || r2.tipo === 'sem_resposta');

  // forçar nova tentativa
  P.ia.retomar();
  assert.equal(P.ia.estado().pausada, false);
  await P.perguntar('Quem gere o Cadastro Único no município?');
  assert.equal(c.n, 2);
  limparMarcaEsgotada();
});

test('app: com a cota esgotada a prova de matemática é resolvida no aparelho (alternativa incluída), sem gastar a IA de novo', async () => {
  limparMarcaEsgotada();
  const c = { n: 0 };
  const P = carregar(fetchSemCota(c));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  await P.perguntar('Quem gere o Cadastro Único no município?');   // a primeira chamada descobre que a cota acabou
  assert.equal(P.ia.estado().pausada, true);
  const antes = c.n;
  const prova = 'Questão 1. Seja z = a + 2i um número complexo, em que a ∈ R é positivo. O valor de a para que as representações de 1, z e z² no plano de Argand-Gauss formem um triângulo de área 200 é A ( ) 14. B ( ) 15. C ( ) 16. D ( ) 17. E ( ) 18. ' +
    'Questão 7. Sejam m, n e k números reais. Considere os sistemas abaixo: I: x + y + z = 1, x + 2y − z = 2, 2x + y + 4z = 1; II: x + y + z = 1, x + my + nz = 5, kx + y − z = 3m + 2n. Sabendo-se que os dois sistemas são equivalentes, o valor de k é A ( ) 1/3. B ( ) 1/2. C ( ) 1. D ( ) 2. E ( ) 3.';
  const r = await P.perguntar(prova);
  assert.equal(c.n, antes, 'com a IA em pausa o app não chama o Worker');
  assert.equal(r.tipo, 'matematica');
  assert.equal(r.resolvida, true);
  assert.match(r.texto, /Questão 1[\s\S]*alternativa B/); assert.match(r.texto, /Questão 7[\s\S]*alternativa A/);
  assert.ok(r.avisos.some(a => /sem IA e sem rede/.test(a)));
  limparMarcaEsgotada();
});

test('app: cumprimento e "mais curto" com a cota esgotada explicam em vez de dar trecho de norma', async () => {
  limparMarcaEsgotada();
  const c = { n: 0 };
  const P = carregar(fetchSemCota(c));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  await P.perguntar('Quem gere o Cadastro Único no município?');
  const oi = await P.perguntar('oi');
  assert.equal(oi.tipo, 'sem_resposta');
  assert.equal(oi.semIA, true);
  assert.match(oi.texto, /renova às/);
  limparMarcaEsgotada();
});

test('app: foto com a cota esgotada diz que precisa da IA e quando volta', async () => {
  limparMarcaEsgotada();
  const c = { n: 0 };
  const P = carregar(fetchSemCota(c));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  await P.perguntar('Quem gere o Cadastro Único no município?');
  const r = await P.perguntar('o que diz essa imagem?', { imagem: { nome: 'a.png', dados: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.equal(r.tipo, 'erro');
  assert.match(r.texto, /IA/);
  limparMarcaEsgotada();
});
