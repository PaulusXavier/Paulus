import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { valoresCitados, numerosCitaveis, citacoesSemFonte } from '../shared/verificacao.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const enc = new TextEncoder();

function pedido(corpo, ip = '9.9.9.9') {
  return new Request('https://paulus-ia.exemplo.workers.dev', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo)
  });
}
function fluxo(texto) {
  return new ReadableStream({ start(c) { if (texto) c.enqueue(enc.encode('data: {"response":' + JSON.stringify(texto) + '}\n\ndata: [DONE]\n\n')); c.close(); } });
}
function fluxoQueCai(antes) {
  // error() descarta o que ainda está na fila; por isso o texto sai primeiro e a queda vem só na leitura seguinte.
  let vez = 0;
  return new ReadableStream({ pull(c) { if (vez++ === 0 && antes) c.enqueue(enc.encode('data: {"response":' + JSON.stringify(antes) + '}\n\n')); else c.error(new Error('queda')); } });
}
function ambiente(principal) {
  const chamadas = [];
  return {
    chamadas,
    env: {
      ALLOWED_ORIGINS: ORIGEM,
      AI: {
        async run(modelo, params) {
          chamadas.push({ modelo, stream: params.stream });
          if (modelo.includes('70b')) return principal(params);
          return params.stream ? fluxo('Resposta da reserva.') : { response: 'Resposta da reserva.' };
        }
      }
    }
  };
}
async function textoDoSSE(r) {
  const eventos = (await r.text()).split('\n').filter(function (l) { return l.startsWith('data:'); }).map(function (l) { return l.slice(5).trim(); });
  return eventos.filter(function (e) { return e !== '[DONE]'; }).map(function (e) { return JSON.parse(e); });
}

test('stream: se o modelo grande vier vazio, o pequeno responde e a pessoa não vê erro', async () => {
  const { env, chamadas } = ambiente(function (p) { return p.stream ? fluxo('') : { response: '' }; });
  const m = criarManipulador({ base, apps: APPS });
  const ev = await textoDoSSE(await m(pedido({ app: 'argo', pergunta: 'O que é o CRAS?', stream: true }), env));
  assert.ok(ev.some(function (e) { return e.t === 'Resposta da reserva.'; }));
  assert.ok(!ev.some(function (e) { return e.erro; }));
  assert.ok(chamadas.some(function (c) { return !c.modelo.includes('70b') && c.stream === false; }));
});

test('stream: se o fluxo do modelo grande cair antes de sair texto, a reserva responde', async () => {
  const { env } = ambiente(function (p) { return p.stream ? fluxoQueCai('') : { response: 'x' }; });
  const m = criarManipulador({ base, apps: APPS });
  const ev = await textoDoSSE(await m(pedido({ app: 'argo', pergunta: 'O que é o PAIF?', stream: true }), env));
  assert.ok(ev.some(function (e) { return e.t === 'Resposta da reserva.'; }));
  assert.ok(!ev.some(function (e) { return e.erro; }));
});

test('stream: queda no meio da resposta não emenda outro modelo: avisa que foi interrompida', async () => {
  const { env, chamadas } = ambiente(function (p) { return p.stream ? fluxoQueCai('O CRAS é ') : { response: 'x' }; });
  const m = criarManipulador({ base, apps: APPS });
  const ev = await textoDoSSE(await m(pedido({ app: 'argo', pergunta: 'O que é o CRAS?', stream: true }), env));
  assert.ok(ev.some(function (e) { return e.t === 'O CRAS é '; }));
  assert.ok(ev.some(function (e) { return e.erro; }));
  assert.equal(chamadas.length, 1, 'a reserva não foi chamada');
});

test('stream normal continua igual (fontes, texto e fim)', async () => {
  const { env, chamadas } = ambiente(function (p) { return p.stream ? fluxo('Tudo certo.') : { response: 'x' }; });
  const m = criarManipulador({ base, apps: APPS });
  const ev = await textoDoSSE(await m(pedido({ app: 'argo', pergunta: 'Quem tem direito ao BPC?', stream: true }), env));
  assert.ok(ev[0].fontes && ev[0].fontes.length);
  assert.ok(ev.some(function (e) { return e.t === 'Tudo certo.'; }));
  assert.equal(chamadas.length, 1);
});

test('verificação de valores: R$ em várias formas vira o mesmo número', () => {
  assert.deepEqual([...valoresCitados('R$ 600, R$ 600,00, R$ 1.518,00 e R$ 218,50. Em 2024 e 12%.')].sort(), ['1518', '218.5', '600']);
});

test('verificação de valores: valor que não veio das fontes vira aviso; o das fontes e o da pergunta, não', () => {
  const achados = [{ trecho: { referencia: 'art. 5º', titulo: 'Lei', norma: 'Lei 14.601', texto: 'renda per capita de até R$ 218,00 e adicional de R$ 150,00' } }];
  const c = numerosCitaveis(achados, ['Minha família recebe R$ 700,00']);
  assert.deepEqual(citacoesSemFonte('A linha é R$ 218 e o adicional R$ 150,00.', c), []);
  assert.deepEqual(citacoesSemFonte('A linha é R$ 218 e o benefício chega a R$ 1.200,00.', c), ['R$ 1.200']);
  assert.deepEqual(citacoesSemFonte('Com R$ 700 de renda, sim.', c), []);
  assert.deepEqual(citacoesSemFonte('O valor é R$ 999.', c, [], ['Antes eu disse R$ 999.']), [], 'valor já visto na conversa não avisa de novo');
  // Worker antigo (sem "v"): não confere valor
  assert.deepEqual(citacoesSemFonte('O valor é R$ 999.', { a: [], l: [] }), []);
});

test('Worker: manda os valores que a IA pôde ler (normas, fichas, base do app e a pergunta)', async () => {
  const { env } = ambiente(function () { return { response: 'ok' }; });
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({
    app: 'argo', pergunta: 'Qual o valor do benefício para renda de R$ 350?',
    fichas: [{ nome: 'CRAS X', grupo: 'CRAS', endereco: 'Rua A', horario: '8h', telefones: '', servicos: '', descricao: 'Taxa de R$ 42,00' }],
    baseApp: [{ titulo: 'Valor', texto: 'Piso de R$ 600,00', origem: 'lei' }]
  }, '8.8.8.8'), env);
  const j = await r.json();
  assert.ok(Array.isArray(j.citaveis.v));
  for (const esperado of ['350', '42', '600']) assert.ok(j.citaveis.v.includes(esperado), 'faltou ' + esperado);
});

// ------------------------------------------------------------------ busca

import { criarIndice, buscar } from '../shared/busca.mjs';
const indiceBase = criarIndice(base);

test('busca: "o que é o BPC" traz o artigo que DEFINE o BPC (LOAS art. 20), mesmo a lei só escrevendo por extenso', () => {
  for (const q of ['o que é o BPC', 'o que é o BPC e quem pode pedir']) {
    const r = buscar(indiceBase, q, { k: 4 });
    assert.ok(r.some(function (x) { return x.trecho.doc === 'loas-1993' && x.trecho.referencia === 'art. 20'; }), q);
  }
});

test('busca: pergunta que não é de definição não ganha o reforço (ordem de "quem tem direito ao BPC" não muda de assunto)', () => {
  const r = buscar(indiceBase, 'quem tem direito ao BPC', { k: 4 });
  assert.ok(r.length === 4);
  assert.ok(r.every(function (x) { return /6214|loas|cras/.test(x.trecho.doc); }));
});

import { ladosDaComparacao, buscarPergunta } from '../shared/busca.mjs';

test('comparação: separa os dois lados de "diferença entre X e Y" e ignora o que não é comparação', () => {
  assert.deepEqual(ladosDaComparacao('Qual a diferença entre o PAIF e o SCFV?'), ['paif', 'scfv']);
  assert.deepEqual(ladosDaComparacao('diferença entre BPC e bolsa família'), ['bpc', 'bolsa familia']);
  assert.equal(ladosDaComparacao('como funciona o PAIF'), null);
  assert.equal(ladosDaComparacao('diferença entre CRAS e CRAS'), null);
});

test('comparação: a IA recebe trechos dos DOIS lados (BPC e Bolsa Família)', () => {
  const docs = buscarPergunta(indiceBase, 'diferença entre BPC e bolsa família', { k: 4 }).map(function (r) { return r.trecho.doc; });
  assert.ok(docs.some(function (d) { return /bolsa|14601|12064/.test(d); }), 'Bolsa Família');
  assert.ok(docs.some(function (d) { return /loas|6214/.test(d); }), 'BPC');
});
