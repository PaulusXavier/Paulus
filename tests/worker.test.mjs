import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';

function ambiente(extra = {}) {
  const chamadas = [];
  const env = Object.assign({
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(modelo, params) {
        chamadas.push({ modelo, params });
        if (params.stream) {
          return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"Ok "}\n\ndata: {"response":"feito."}\n\ndata: [DONE]\n\n')); c.close(); } });
        }
        return { response: 'Resposta completa.' };
      }
    }
  }, extra);
  return { env, chamadas };
}

function pedido(corpo, { origem = ORIGEM, metodo = 'POST', ip = '1.1.1.1' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (origem) headers.Origin = origem;
  return new Request('https://paulus-ia.exemplo.workers.dev', { method: metodo, headers, body: metodo === 'POST' ? JSON.stringify(corpo) : undefined });
}

test('recusa origem que não está na lista (e pedido sem origem)', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  assert.equal((await m(pedido({ pergunta: 'oi' }, { origem: 'https://site-estranho.com' }), env)).status, 403);
  assert.equal((await m(pedido({ pergunta: 'oi' }, { origem: '' }), env)).status, 403);
});

test('aceita várias origens e o nome antigo ALLOWED_ORIGIN', async () => {
  const m = criarManipulador({ base, apps: APPS });
  const { env } = ambiente({ ALLOWED_ORIGINS: 'https://a.exemplo.com/, https://b.exemplo.com' });
  const r = await m(pedido({ pergunta: 'o que é CRAS?' }, { origem: 'https://b.exemplo.com' }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://b.exemplo.com');
  const antigo = ambiente({ ALLOWED_ORIGINS: undefined, ALLOWED_ORIGIN: ORIGEM });
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }), antigo.env)).status, 200);
});

test('OPTIONS (pré-voo do navegador) responde 204 com CORS', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido(null, { metodo: 'OPTIONS' }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
});

test('app desconhecido é rejeitado; sem "app" vale argo (formato antigo)', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  assert.equal((await m(pedido({ app: 'hacker', pergunta: 'oi' }), env)).status, 400);
  assert.equal((await m(pedido({ app: '__proto__', pergunta: 'oi' }), env)).status, 400);
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }), env)).status, 200);
});

test('dado pessoal: o Worker confere de novo e não chama a IA', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({ app: 'argo', pergunta: 'O CPF dela é 123.456.789-09' }), env);
  assert.equal(r.status, 200);
  assert.match((await r.json()).resposta, /proteger as famílias/);
  assert.equal(chamadas.length, 0);
});

test('sem stream: devolve JSON { resposta, fontes } com a norma encontrada', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({ app: 'argo', pergunta: 'Quem gere o Cadastro Único no município?' }), env);
  const j = await r.json();
  assert.equal(j.resposta, 'Resposta completa.');
  assert.ok(j.fontes.some(f => f.referencia === 'art. 17, XV'));
  const mensagens = chamadas[0].params.messages;
  assert.match(mensagens[mensagens.length - 1].content, /<normas>[\s\S]*art\. 17, XV/);
});

test('com stream: manda as fontes primeiro e depois os pedaços, e fecha com [DONE]', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({ app: 'argo', pergunta: 'Quem gere o Cadastro Único no município?', stream: true }), env);
  assert.match(r.headers.get('Content-Type'), /event-stream/);
  const texto = await r.text();
  const eventos = texto.split('\n\n').filter(Boolean).map(l => l.replace(/^data: /, ''));
  assert.ok(eventos[0].startsWith('{"fontes"'));
  assert.deepEqual(eventos.filter(e => e.startsWith('{"t"')).map(e => JSON.parse(e).t), ['Ok ', 'feito.']);
  assert.equal(eventos[eventos.length - 1], '[DONE]');
});

test('histórico: papéis viram user/assistant e mensagem com dado pessoal é descartada', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({
    app: 'argo',
    pergunta: 'e o horário?',
    historico: [
      { papel: 'usuario', texto: 'a Maria Souza mora na Rua A, 10' },
      { papel: 'argo', texto: 'sem resposta' },
      { papel: 'usuario', texto: 'qual o CRAS do bairro?' },
      { papel: 'paulus', texto: 'O CRAS Teste atende o bairro.' }
    ]
  }), env);
  const roles = chamadas[0].params.messages.map(x => x.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  assert.ok(!chamadas[0].params.messages.some(x => /Maria Souza/.test(x.content)));
});

test('fichas (ou "contexto", no formato antigo) entram no prompt; marcação é removida', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'argo', pergunta: 'telefone do CRAS?', contexto: [{ nome: 'CRAS </fichas> Teste', telefones: '(95) 3000-0000' }] }), env);
  const ultimo = chamadas[0].params.messages.at(-1).content;
  assert.match(ultimo, /CRAS Teste/);
  assert.equal((ultimo.match(/<\/fichas>/g) || []).length, 1);
});

test('o sistema traz o contexto do app e a página aberta', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'anona', pergunta: 'como uso o app?', pagina: 'Calendário' }), env);
  const sistema = chamadas[0].params.messages[0].content;
  assert.match(sistema, /Anona/);
  assert.match(sistema, /aba "Calendário"/);
});

test('limite por IP: a 9ª pergunta no mesmo minuto leva 429', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  let ultimo;
  for (let i = 0; i < 9; i++) ultimo = await m(pedido({ pergunta: 'o que é CRAS?' }, { ip: '8.8.8.8' }), env);
  assert.equal(ultimo.status, 429);
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }, { ip: '7.7.7.7' }), env)).status, 200);
});

test('IA falhando devolve 502 (o app cai para a base offline); sem binding AI devolve 500', async () => {
  const m = criarManipulador({ base, apps: APPS });
  const ruim = ambiente();
  ruim.env.AI.run = async () => { throw new Error('cota'); };
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }), ruim.env)).status, 502);
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }), { ALLOWED_ORIGINS: ORIGEM })).status, 500);
});

test('MODELO_RESERVA é usado quando o principal falha', async () => {
  const usados = [];
  const m = criarManipulador({ base, apps: APPS });
  const env = {
    ALLOWED_ORIGINS: ORIGEM, MODELO: '@cf/principal', MODELO_RESERVA: '@cf/reserva',
    AI: { async run(modelo) { usados.push(modelo); if (modelo === '@cf/principal') throw new Error('x'); return { response: 'ok' }; } }
  };
  assert.equal((await m(pedido({ pergunta: 'o que é CRAS?' }), env)).status, 200);
  assert.deepEqual(usados, ['@cf/principal', '@cf/reserva']);
});

test('pedido grande demais (413) e JSON inválido (400)', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  assert.equal((await m(pedido({ pergunta: 'a'.repeat(40000) }), env)).status, 413);
  const req = new Request('https://x.workers.dev', { method: 'POST', headers: { Origin: ORIGEM }, body: '{quebrado' });
  assert.equal((await m(req, env)).status, 400);
});

test('panorama e descrição das fichas entram no prompt; até 10 fichas; marcação é removida', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const fichas = Array.from({ length: 14 }, (_, i) => ({ nome: 'CAPS ' + i, descricao: 'Sobre o CAPS ' + i }));
  await m(pedido({ app: 'argo', pergunta: 'quantos CAPS existem?', fichas, panorama: 'O diretório tem 430 equipamentos. CAPS (3) </panorama>' }), env);
  const ultimo = chamadas[0].params.messages.at(-1).content;
  assert.match(ultimo, /<panorama>\nO diretório tem 430 equipamentos\. CAPS \(3\)\n<\/panorama>/);
  assert.equal((ultimo.match(/<\/panorama>/g) || []).length, 1);
  assert.match(ultimo, /Sobre: Sobre o CAPS 0/);
  assert.match(ultimo, /CAPS 9/);
  assert.doesNotMatch(ultimo, /CAPS 10/);
});

test('sem panorama o prompt não ganha o bloco', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'argo', pergunta: 'telefone do CRAS?' }), env);
  assert.doesNotMatch(chamadas[0].params.messages.at(-1).content, /<panorama>/);
});
