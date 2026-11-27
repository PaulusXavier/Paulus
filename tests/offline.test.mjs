// Uso sem internet: respostas recentes da IA guardadas no aparelho, pausa curta em falha de rede, trecho de norma escolhido pela pergunta.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { montarBase } from '../scripts/build-knowledge.mjs';
import { juntar } from '../scripts/build.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const base = montarBase();
const ORIGEM = 'https://paulusxavier.github.io';
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';
const semEspera = { minIntervaloMs: 0 };

function carregar(fetchFalso, navegador) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: navegador || { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

// Worker de verdade, com um interruptor de rede e a contagem de pedidos que chegaram a sair.
function rede(estado) {
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { return { response: 'A gestão do Cadastro Único cabe ao município.' }; } } };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => {
    estado.saiu++;
    if (estado.caida) throw new TypeError('Failed to fetch');
    return manipular(new Request(url, { method: init.method, headers: Object.assign({}, init.headers, { Origin: ORIGEM, 'CF-Connecting-IP': '7.7.7.7' }), body: init.body }), env);
  };
}

const PERGUNTA = 'Quem gere o Cadastro Único no município?';

test('offline: a resposta da IA fica guardada e a mesma pergunta é respondida sem internet, marcada como anterior', async () => {
  const e = { saiu: 0, caida: false };
  const P = carregar(rede(e));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  const ia = await P.perguntar(PERGUNTA);
  assert.equal(ia.tipo, 'ia');
  e.caida = true;
  const off = await P.perguntar(PERGUNTA);
  assert.equal(off.tipo, 'ia');
  assert.equal(off.deMemoria, true);
  assert.match(off.texto, /Cadastro Único/);
  assert.ok(off.avisos.some(a => /Resposta anterior da IA/.test(a)), JSON.stringify(off.avisos));
  assert.ok(off.avisos.some(a => /sem conexão/i.test(a)), 'diz que está sem conexão');
});

test('offline: falha de rede pausa a IA por um instante, sem esperar a rede a cada pergunta', async () => {
  const e = { saiu: 0, caida: true };
  const P = carregar(rede(e));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  const r = await P.perguntar(PERGUNTA);
  assert.equal(e.saiu, 1);
  assert.equal(r.tipo, 'norma');
  assert.equal(r.semIA, true);
  assert.equal(r.motivoSemIA, 'rede');
  assert.equal(r.cotaEsgotada, false);
  assert.match(r.texto, /sem conexão/i);
  assert.equal(P.ia.estado().motivo, 'rede');
  await P.perguntar('E quem coordena o CRAS?');
  assert.equal(e.saiu, 1, 'em pausa por rede, nem tenta');
  P.ia.retomar();
  e.caida = false;
  const volta = await P.perguntar(PERGUNTA);
  assert.equal(volta.tipo, 'ia');
});

test('offline: navegador sem internet responde pela base e diz que está sem conexão', async () => {
  const e = { saiu: 0, caida: false };
  const P = carregar(rede(e), { onLine: false });
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  const r = await P.perguntar(PERGUNTA);
  assert.equal(e.saiu, 0);
  assert.equal(r.tipo, 'norma');
  assert.equal(r.motivoSemIA, 'rede');
  const oi = await P.perguntar('oi');
  assert.equal(oi.tipo, 'saudacao', 'cumprimento tem resposta pronta no aparelho');
  assert.equal(oi.local, true);
  assert.equal(oi.semIA, true);
  assert.equal(e.saiu, 0);
});

test('offline: o trecho mostrado é o que fala da pergunta, não o começo do documento', async () => {
  const enchimento = 'Esta seção trata de disposições gerais sobre a organização administrativa e os princípios da assistência. '.repeat(14);
  const alvo = 'O benefício de prestação continuada exige renda per capita inferior a um quarto do salário mínimo.';
  const pequena = [{ id: 't1', doc: 'doc-x', titulo: 'Norma X', norma: 'Lei X', ano: 2020, referencia: 'Art. 1º', tipo: 'norma', texto: enchimento + alvo + ' ' + enchimento }];
  const P = carregar(async () => { throw new TypeError('Failed to fetch'); });
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: pequena }, semEspera));
  const r = await P.perguntar('Qual a renda per capita exigida para o benefício de prestação continuada?');
  assert.equal(r.tipo, 'norma');
  assert.match(r.texto, /um quarto do salário mínimo/);
  assert.match(r.texto, /\[\.\.\.\]/);
});

test('offline: pergunta sensível nunca vira resposta guardada', async () => {
  const e = { saiu: 0, caida: false };
  const P = carregar(rede(e));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  await P.perguntar('Como avaliar o risco de suicídio em um grupo do CRAS?');
  const guardado = JSON.parse(P.memoria.exportar());
  assert.equal(guardado.recentes.length, 0);
  await P.perguntar(PERGUNTA);
  assert.equal(JSON.parse(P.memoria.exportar()).recentes.length, 1);
  P.memoria.esquecer('recentes');
  assert.equal(JSON.parse(P.memoria.exportar()).recentes.length, 0);
});
