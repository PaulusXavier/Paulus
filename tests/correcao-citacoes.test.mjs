// Autocorreção de citações: o Worker reescreve a resposta quando ela cita artigo, lei ou valor que a IA não leu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarManipulador, montarMensagensCorrecao, corrigirCitacoes } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const RUIM = 'O CRAS faz o acompanhamento das famílias conforme o art. 9999 da Lei 99.999, que garante o atendimento a todas as pessoas do território.';
const BOA = 'O CRAS faz o acompanhamento das famílias do território e a pessoa deve conferir o normativo vigente, pois a fonte não traz esse artigo.';

function ambiente(respostas, extra = {}) {
  const chamadas = [];
  const env = Object.assign({ ALLOWED_ORIGINS: ORIGEM, RACIOCINIO: 'desligado', COMPREENSAO: 'desligado',
    AI: { async run(modelo, params) {
      chamadas.push({ modelo, params });
      const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
      if (r instanceof Error) throw r;
      if (params.stream) return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ response: r }) + '\n\ndata: [DONE]\n\n')); c.close(); } });
      return { response: r };
    } } }, extra);
  return { env, chamadas };
}
function pedido(corpo) {
  return new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': '2.2.2.' + Math.floor(Math.random() * 200) }, body: JSON.stringify(corpo) });
}
const PERGUNTA = 'o que o CRAS faz com as famílias do território?';

test('sem stream: resposta com citação sem fonte é reescrita e só a versão corrigida sai', async () => {
  const { env, chamadas } = ambiente([RUIM, BOA]);
  const r = await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA }), env);
  const j = await r.json();
  assert.equal(j.resposta, BOA);
  assert.equal(chamadas.length, 2);
  assert.match(chamadas[1].params.messages.at(-1).content, /Conferência automática/);
});

test('reescrita que continua citando fora das fontes é descartada', async () => {
  const { env } = ambiente([RUIM, RUIM + ' Veja também o art. 8888.']);
  const j = await (await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA }), env)).json();
  assert.equal(j.resposta, RUIM);
});

test('falha da IA na correção mantém a resposta original', async () => {
  const { env } = ambiente([RUIM, new Error('cota')], { MODELO_RESERVA: '' });
  const j = await (await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA }), env)).json();
  assert.equal(j.resposta, RUIM);
});

test('CORRECAO="desligado" não faz a segunda chamada', async () => {
  const { env, chamadas } = ambiente([RUIM, BOA], { CORRECAO: 'desligado' });
  const j = await (await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA }), env)).json();
  assert.equal(j.resposta, RUIM);
  assert.equal(chamadas.length, 1);
});

test('resposta sem citação sem fonte não gasta chamada extra', async () => {
  const { env, chamadas } = ambiente(['O CRAS acompanha as famílias do território.']);
  await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA }), env);
  assert.equal(chamadas.length, 1);
});

test('stream: o texto sai e depois chega o evento "corrigido"', async () => {
  const { env } = ambiente([RUIM, BOA]);
  const r = await criarManipulador({ base, apps: APPS })(pedido({ pergunta: PERGUNTA, stream: true }), env);
  const txt = await r.text();
  assert.ok(txt.includes('"t":'), txt);
  assert.ok(txt.includes('"corrigido":'), txt);
  assert.ok(txt.indexOf('"t":') < txt.indexOf('"corrigido":'));
  assert.ok(txt.trim().endsWith('[DONE]'));
});

test('reescrita sem a linha SUGESTÕES do original é descartada', async () => {
  const comSug = RUIM + '\nSUGESTÕES: Quais serviços? | Onde fica o CRAS?';
  const { env } = ambiente([BOA]);
  const novo = await corrigirCitacoes({ env, mensagens: [], ajuste: {}, citaveis: { a: [], l: [], v: [] }, fontes: [], vistos: [] }, comSug);
  assert.equal(novo, '');
});

test('montarMensagensCorrecao acrescenta o rascunho e o pedido', () => {
  const m = montarMensagensCorrecao([{ role: 'system', content: 's' }], 'texto', ['art. 5']);
  assert.equal(m.length, 3);
  assert.match(m[2].content, /art\. 5/);
});
