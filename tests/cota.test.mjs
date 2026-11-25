// Cota da IA (worker/cota.mjs): consumo do dia, hora em que acaba no ritmo atual e hora da renovação.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRANQUIA_PADRAO, inicioDoDiaUTC, proximaRenovacao, montarCota, projetarEsgotamento, montarConsulta,
  consultarCota, limparCache, cotaLigada, franquiaDoAmbiente
} from '../worker/cota.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const AGORA = Date.UTC(2026, 10, 24, 15, 30);          // 24/11/2026 15:30 UTC = 11:30 em Boa Vista
const MODELO_GRANDE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MODELO_PEQUENO = '@cf/meta/llama-3.1-8b-instruct';

function linha(hora, modelo, neurons, count) {
  return { count: count || 1, dimensions: { datetimeHour: '2026-11-24T' + String(hora).padStart(2, '0') + ':00:00Z', modelId: modelo }, sum: { totalNeurons: neurons, totalInputTokens: neurons * 10, totalOutputTokens: neurons } };
}

test('cota: a renovação é 00:00 UTC do dia seguinte (20:00 em Boa Vista)', () => {
  assert.equal(new Date(proximaRenovacao(AGORA)).toISOString(), '2026-11-25T00:00:00.000Z');
  assert.equal(new Date(inicioDoDiaUTC(AGORA)).toISOString(), '2026-11-24T00:00:00.000Z');
  // exatamente à meia-noite UTC já é o dia novo: a próxima renovação é daqui a 24 h
  const meiaNoite = Date.UTC(2026, 10, 25, 0, 0);
  assert.equal(new Date(proximaRenovacao(meiaNoite)).toISOString(), '2026-11-26T00:00:00.000Z');
  // um instante antes da meia-noite UTC ainda é o dia velho
  assert.equal(new Date(proximaRenovacao(meiaNoite - 1)).toISOString(), '2026-11-25T00:00:00.000Z');
});

test('cota: soma neurons do dia, separa por modelo e por hora e calcula o que resta', () => {
  const r = montarCota([linha(9, MODELO_GRANDE, 2000, 10), linha(10, MODELO_GRANDE, 1500, 8), linha(10, MODELO_PEQUENO, 300, 5)], AGORA, FRANQUIA_PADRAO);
  assert.equal(r.leitura, true);
  assert.equal(r.usados, 3800);
  assert.equal(r.restam, 6200);
  assert.equal(r.percentual, 38);
  assert.equal(r.esgotada, false);
  assert.equal(r.chamadas, 23);
  assert.equal(r.porHora.length, 24);
  assert.equal(r.porHora[9], 2000);
  assert.equal(r.porHora[10], 1800);
  assert.deepEqual(r.modelos.map(m => m.modelo), ['llama-3.3-70b-instruct-fp8-fast', 'llama-3.1-8b-instruct']);
  assert.equal(r.modelos[0].neurons, 3500);
  assert.equal(r.renova, '2026-11-25T00:00:00.000Z');
});

test('cota: linha de outro dia UTC e lixo da resposta não entram na conta', () => {
  const ontem = { count: 3, dimensions: { datetimeHour: '2026-11-23T23:00:00Z', modelId: MODELO_GRANDE }, sum: { totalNeurons: 999 } };
  const r = montarCota([ontem, null, 'x', { sum: { totalNeurons: 'abc' }, dimensions: {} }, { sum: { totalNeurons: -5 }, dimensions: {} }, linha(8, MODELO_GRANDE, 100)], AGORA, FRANQUIA_PADRAO);
  assert.equal(r.usados, 100);
  assert.equal(montarCota(null, AGORA, FRANQUIA_PADRAO).usados, 0);
});

test('cota: franquia estourada marca esgotada e estima o custo só do que passou', () => {
  const r = montarCota([linha(10, MODELO_GRANDE, 15000)], AGORA, FRANQUIA_PADRAO);
  assert.equal(r.esgotada, true);
  assert.equal(r.restam, 0);
  assert.equal(r.percentual, 100);
  assert.equal(r.acima, 5000);
  assert.ok(Math.abs(r.custoExcedenteUSD - 0.06) < 0.011, 'US$ 0,011 por mil neurons, só do excedente: ' + r.custoExcedenteUSD);
  assert.equal(r.esgotaEm, null, 'já esgotou: não há hora futura para projetar');
  assert.equal(montarCota([linha(10, MODELO_GRANDE, 100)], AGORA, FRANQUIA_PADRAO).custoExcedenteUSD, undefined);
  // exatamente no limite também conta como esgotada
  assert.equal(montarCota([linha(10, MODELO_GRANDE, 10000)], AGORA, FRANQUIA_PADRAO).esgotada, true);
});

test('cota: projeta a hora em que acaba usando o ritmo recente', () => {
  // 12h, 13h e 14h UTC com 1.000 cada e 500 na meia hora de 15h: 1.000 neurons por hora
  const porHora = new Array(24).fill(0); porHora[12] = 1000; porHora[13] = 1000; porHora[14] = 1000; porHora[15] = 500;
  const quando = projetarEsgotamento(porHora, 3500, FRANQUIA_PADRAO, AGORA);
  assert.equal(quando, '2026-11-24T22:00:00.000Z');   // faltam 6.500 a 1.000 por hora = 6 h 30 min depois das 15:30
});

test('cota: sem consumo, no começo do dia ou em ritmo que dura até renovar, não projeta esgotamento', () => {
  const vazio = new Array(24).fill(0);
  assert.equal(projetarEsgotamento(vazio, 0, FRANQUIA_PADRAO, AGORA), null);
  const lento = new Array(24).fill(0); lento[12] = 100; lento[13] = 100; lento[14] = 100;
  assert.equal(projetarEsgotamento(lento, 300, FRANQUIA_PADRAO, AGORA), null, 'a 86 por hora a franquia sobra até a meia-noite');
  const cedo = Date.UTC(2026, 10, 24, 0, 2);
  const umaHora = new Array(24).fill(0); umaHora[0] = 50;
  assert.equal(projetarEsgotamento(umaHora, 50, FRANQUIA_PADRAO, cedo), null, 'dois minutos de dia não bastam para estimar');
});

test('cota: rajada antiga não engana a projeção (o ritmo vale o das últimas horas)', () => {
  // 6.000 gastos de manhã cedo e quase nada depois: sobra até a renovação
  const porHora = new Array(24).fill(0); porHora[1] = 6000; porHora[14] = 20;
  assert.equal(projetarEsgotamento(porHora, 6020, FRANQUIA_PADRAO, AGORA), null);
});

test('cota: a consulta GraphQL pede só o dia UTC de hoje e só os campos de neurons', () => {
  const q = montarConsulta(AGORA);
  assert.match(q, /aiInferenceAdaptiveGroups/);
  assert.match(q, /datetime_geq: "2026-11-24T00:00:00\.000Z"/);
  assert.match(q, /datetime_lt: "2026-11-25T00:00:00\.000Z"/);
  assert.match(q, /totalNeurons/);
  assert.ok(!/pergunta|resposta|prompt/i.test(q));
});

test('cota: sem os segredos não consulta ninguém e ainda informa a renovação', async () => {
  limparCache();
  let chamou = 0;
  const r = await consultarCota({}, { agora: AGORA, fetch: async () => { chamou++; return null; } });
  assert.equal(chamou, 0);
  assert.equal(r.leitura, false);
  assert.equal(r.motivo, 'nao-configurado');
  assert.equal(r.renova, '2026-11-25T00:00:00.000Z');
  assert.equal(r.franquia, FRANQUIA_PADRAO);
  assert.equal(cotaLigada({ COTA_CF_CONTA: 'a' }), false);
  assert.equal(cotaLigada({ COTA_CF_CONTA: 'a', COTA_CF_TOKEN: 'b' }), true);
  assert.equal(franquiaDoAmbiente({ COTA_NEURONS: '25000' }), 25000);
  assert.equal(franquiaDoAmbiente({ COTA_NEURONS: 'xx' }), FRANQUIA_PADRAO);
});

const ENV = { COTA_CF_CONTA: 'conta123', COTA_CF_TOKEN: 'token-secreto-abc' };
const respostaOk = (linhas) => ({ ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: linhas }] } } }) });

test('cota: consulta a Cloudflare com o token, devolve o resumo e não vaza token nem conta', async () => {
  limparCache();
  const chamadas = [];
  const fake = async (url, init) => { chamadas.push({ url, init }); return respostaOk([linha(9, MODELO_GRANDE, 4200, 30)]); };
  const r = await consultarCota(ENV, { agora: AGORA, fetch: fake });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://api.cloudflare.com/client/v4/graphql');
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer token-secreto-abc');
  assert.equal(JSON.parse(chamadas[0].init.body).variables.conta, 'conta123');
  assert.equal(r.leitura, true);
  assert.equal(r.usados, 4200);
  assert.equal(r.restam, 5800);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('token-secreto-abc') && !texto.includes('conta123'), 'nada de segredo na resposta');
});

test('cota: a segunda consulta no mesmo minuto sai do cache, e depois de um minuto consulta de novo', async () => {
  limparCache();
  let n = 0;
  const fake = async () => { n++; return respostaOk([linha(9, MODELO_GRANDE, 100)]); };
  await consultarCota(ENV, { agora: AGORA, fetch: fake });
  await consultarCota(ENV, { agora: AGORA + 30000, fetch: fake });
  assert.equal(n, 1);
  await consultarCota(ENV, { agora: AGORA + 61000, fetch: fake });
  assert.equal(n, 2);
});

test('cota: erro da Cloudflare vira aviso para o painel, nunca exceção', async () => {
  const motivo = async (fake, env) => { limparCache(); return (await consultarCota(env || ENV, { agora: AGORA, fetch: fake })).motivo; };
  assert.equal(await motivo(async () => ({ ok: false, status: 403, json: async () => ({}) })), 'sem-permissao');
  assert.equal(await motivo(async () => ({ ok: false, status: 401, json: async () => ({}) })), 'sem-permissao');
  assert.equal(await motivo(async () => ({ ok: false, status: 429, json: async () => ({}) })), 'muitas-consultas');
  assert.equal(await motivo(async () => ({ ok: false, status: 500, json: async () => ({}) })), 'sem-resposta');
  assert.equal(await motivo(async () => { throw new Error('rede'); }), 'sem-resposta');
  assert.equal(await motivo(async () => ({ ok: true, status: 200, json: async () => { throw new Error('json'); } })), 'resposta-invalida');
  assert.equal(await motivo(async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: 'does not have access to the path' }] }) })), 'sem-permissao');
  assert.equal(await motivo(async () => ({ ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [] } } }) })), 'sem-permissao');
  assert.equal(await motivo(async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: 'boom' }] }) })), 'resposta-invalida');
});

// ---- rota /cota do Worker
const ORIGEM = 'https://paulusxavier.github.io';
const pedirCota = (m, env, extra) => m(new Request('https://x/cota', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Origin: ORIGEM }, extra || {}), body: '{}' }), env);

test('rota /cota: responde sem a IA ligada e sem segredos, com a hora da renovação', async () => {
  limparCache();
  const m = criarManipulador({ base: [], apps: APPS });
  const r = await pedirCota(m, { ALLOWED_ORIGINS: ORIGEM });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.leitura, false);
  assert.equal(j.motivo, 'nao-configurado');
  assert.match(j.renova, /T00:00:00\.000Z$/);
});

test('rota /cota: com os segredos devolve o consumo vindo da Cloudflare', async () => {
  limparCache();
  const antes = globalThis.fetch;
  // a rota usa o relógio real, então a linha precisa cair no dia UTC de hoje (não no dia fixo dos outros testes)
  const hoje = new Date().toISOString().slice(0, 13) + ':00:00Z';
  globalThis.fetch = async () => respostaOk([{ count: 7, dimensions: { datetimeHour: hoje, modelId: MODELO_GRANDE }, sum: { totalNeurons: 1234 } }]);
  try {
    const m = criarManipulador({ base: [], apps: APPS });
    const j = await (await pedirCota(m, Object.assign({ ALLOWED_ORIGINS: ORIGEM }, ENV))).json();
    assert.equal(j.leitura, true);
    assert.equal(j.usados, 1234);
    assert.equal(j.franquia, FRANQUIA_PADRAO);
  } finally { globalThis.fetch = antes; limparCache(); }
});

test('rota /cota: com login ligado exige sessão, como as outras rotas', async () => {
  limparCache();
  const m = criarManipulador({ base: [], apps: APPS });
  const r = await pedirCota(m, { ALLOWED_ORIGINS: ORIGEM, FIREBASE_PROJECT_ID: 'projeto-teste' });
  assert.equal(r.status, 401);
});

test('rota /cota: origem não permitida continua barrada', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const r = await m(new Request('https://x/cota', { method: 'POST', headers: { Origin: 'https://outro.exemplo' }, body: '{}' }), { ALLOWED_ORIGINS: ORIGEM });
  assert.equal(r.status, 403);
});

test('cota: dados derivados (gasto por chamada, quantas cabem, fim do dia, pico e até quando há dados)', () => {
  // 3 chamadas em 3 horas: 2000 + 1500 + 300 = 3800 neurons
  const r = montarCota([linha(9, MODELO_GRANDE, 2000, 10), linha(10, MODELO_GRANDE, 1500, 8), linha(10, MODELO_PEQUENO, 300, 2)], AGORA, FRANQUIA_PADRAO);
  assert.equal(r.usados, 3800);
  assert.equal(r.neuronsPorChamada, 190);                       // 3800 / 20
  assert.equal(r.chamadasRestantes, Math.floor(6200 / 190));    // 32
  assert.equal(new Date(r.horaDePico.hora).toISOString(), '2026-11-24T09:00:00.000Z');
  assert.equal(r.horaDePico.neurons, 2000);
  assert.equal(r.dadosAte, '2026-11-24T11:00:00.000Z');         // última hora com consumo termina às 11:00
  assert.ok(r.ritmoPorHora > 0);
  assert.ok(r.projecaoDoDia >= r.usados);
  // por modelo: percentual, gasto por chamada e tokens
  const grande = r.modelos.find(m => m.modelo === 'llama-3.3-70b-instruct-fp8-fast');
  assert.equal(grande.percentual, Math.round(3500 / 3800 * 1000) / 10);
  assert.equal(grande.neuronsPorChamada, Math.round(3500 / 18 * 10) / 10);
  assert.equal(grande.tokensSaida, 3500);
  assert.equal(grande.tokensEntrada, 35000);
});

test('cota: sem consumo ou esgotada, os dados derivados não inventam número', () => {
  const vazio = montarCota([], AGORA, FRANQUIA_PADRAO);
  assert.equal(vazio.neuronsPorChamada, null);
  assert.equal(vazio.chamadasRestantes, null);
  assert.equal(vazio.ritmoPorHora, null);
  assert.equal(vazio.projecaoDoDia, null);
  assert.equal(vazio.horaDePico, null);
  assert.equal(vazio.dadosAte, null);
  const esgotada = montarCota([linha(10, MODELO_GRANDE, 12000, 40)], AGORA, FRANQUIA_PADRAO);
  assert.equal(esgotada.chamadasRestantes, 0);
  assert.equal(esgotada.projecaoDoDia, null);                  // já acabou: não projeta
});
