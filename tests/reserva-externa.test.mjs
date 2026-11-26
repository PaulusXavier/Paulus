// IA de reserva externa: só depois da cota da Cloudflare, só com configuração, e nunca para imagem, documento ou conversa sobre suicídio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarBase } from '../scripts/build-knowledge.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { limparMarcaEsgotada, marcarCotaEsgotada } from '../worker/cota.mjs';
import { externaLigada, configExterna, conversaSensivel, podeUsarExterna } from '../worker/reserva-externa.mjs';

const base = montarBase();
const ORIGEM = 'https://paulusxavier.github.io';
const ERRO_4006 = '4006: you have used up your daily free allocation of 10,000 neurons';
const EXT = { IA_EXTERNA_URL: 'https://api.provedor.exemplo/v1', IA_EXTERNA_MODELO: 'modelo-x', IA_EXTERNA_CHAVE: 'segredo-123' };

function pedido(pergunta, extra) {
  return new Request('https://x/', { method: 'POST', headers: { Origin: ORIGEM, 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.' + Math.floor(Math.random() * 250) + '.1' }, body: JSON.stringify(Object.assign({ app: 'argo', pergunta: pergunta }, extra || {})) });
}
function envCom(extra, chamadasCF) {
  return Object.assign({ ALLOWED_ORIGINS: ORIGEM, AI: { async run(m) { if (chamadasCF) chamadasCF.push(m); throw new Error(ERRO_4006); } } }, extra || {});
}
function comFetch(fn, corpo) {
  const original = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url, init, corpo: init && init.body ? JSON.parse(init.body) : null }); return fn(url, init); };
  return Promise.resolve().then(corpo).finally(() => { globalThis.fetch = original; }).then((r) => ({ r, chamadas }));
}
const okJson = (texto) => new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('configuração: só liga com as três variáveis, em https, e dá para desligar', () => {
  assert.equal(externaLigada({}), false);
  assert.equal(externaLigada({ IA_EXTERNA_URL: EXT.IA_EXTERNA_URL, IA_EXTERNA_MODELO: 'm' }), false);
  assert.equal(externaLigada(Object.assign({}, EXT, { IA_EXTERNA_URL: 'http://inseguro.exemplo/v1' })), false, 'a chave não viaja em http');
  assert.equal(externaLigada(EXT), true);
  assert.equal(externaLigada(Object.assign({}, EXT, { IA_EXTERNA: 'desligado' })), false);
  assert.equal(configExterna(EXT).url, 'https://api.provedor.exemplo/v1/chat/completions');
  assert.equal(configExterna(Object.assign({}, EXT, { IA_EXTERNA_URL: 'https://a.exemplo/v1/chat/completions/' })).url, 'https://a.exemplo/v1/chat/completions');
});

test('conversaSensivel: pergunta atual e últimas mensagens da pessoa; resposta do Paulus não conta', () => {
  assert.equal(conversaSensivel('o que é ideação suicida?', []), true);
  assert.equal(conversaSensivel('e agora, o que faço?', [{ papel: 'usuario', texto: 'um usuário falou em se matar' }]), true);
  assert.equal(conversaSensivel('qual o valor do Bolsa Família?', [{ papel: 'paulus', texto: 'sobre suicídio...' }]), false);
  assert.equal(conversaSensivel('quais documentos para o CadÚnico?', []), false);
  assert.deepEqual(podeUsarExterna(EXT, { pergunta: 'x', imagem: true }), { ok: false, motivo: 'imagem' });
  assert.deepEqual(podeUsarExterna(EXT, { pergunta: 'x', documento: true }), { ok: false, motivo: 'documento' });
  assert.equal(podeUsarExterna(EXT, { pergunta: 'x' }).ok, true);
});

test('Worker: cota esgotada + reserva ligada = 200 com a resposta do provedor, marcada como externa', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  const { r, chamadas } = await comFetch(() => okJson('Resposta da reserva.'), () => m(pedido('Quem gere o Cadastro Único no município?'), envCom(EXT)));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.resposta, /Resposta da reserva/);
  assert.equal(j.externa, true);
  assert.ok(chamadas.length >= 1);
  assert.equal(chamadas[0].url, 'https://api.provedor.exemplo/v1/chat/completions');
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer segredo-123');
  assert.equal(chamadas[0].corpo.model, 'modelo-x');
  limparMarcaEsgotada();
});

test('Worker: com a cota já marcada, nem tenta a Cloudflare: vai direto à reserva', async () => {
  limparMarcaEsgotada(); marcarCotaEsgotada();
  const cf = [];
  const m = criarManipulador({ base, apps: APPS });
  const { r } = await comFetch(() => okJson('Direto da reserva.'), () => m(pedido('Quem gere o Cadastro Único no município?'), envCom(EXT, cf)));
  assert.equal(r.status, 200);
  assert.equal(cf.length, 0);
  limparMarcaEsgotada();
});

test('Worker: sem configuração, ou com o provedor falhando, continua o 503 de cota de antes', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  assert.equal((await m(pedido('Quem gere o Cadastro Único no município?'), envCom())).status, 503);
  limparMarcaEsgotada();
  const { r } = await comFetch(() => new Response('erro', { status: 500 }), () => m(pedido('Quem gere o Cadastro Único no município?'), envCom(EXT)));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).cota, true);
  limparMarcaEsgotada();
  const { r: r2 } = await comFetch(() => okJson('   '), () => m(pedido('Quem gere o Cadastro Único no município?'), envCom(EXT)));
  assert.equal(r2.status, 503, 'resposta vazia do provedor não vira resposta');
  limparMarcaEsgotada();
});

test('Worker: pelo stream, a reserva sai como evento de texto e avisa que é externa', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  const { r } = await comFetch(() => okJson('Texto em fluxo.'), () => m(pedido('Quem gere o Cadastro Único no município?', { stream: true }), envCom(EXT)));
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.match(t, /"externa":true/);
  assert.match(t, /Texto em fluxo\./);
  assert.match(t, /\[DONE\]/);
  limparMarcaEsgotada();
});

test('privacidade: conversa sobre suicídio nunca vai ao provedor externo', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  const { r, chamadas } = await comFetch(() => okJson('não deveria'), () => m(pedido('Como a cartilha orienta a abordar ideação suicida em adolescentes?'), envCom(EXT)));
  assert.equal(r.status, 503);
  assert.equal(chamadas.length, 0);
  limparMarcaEsgotada();
  // a pergunta de agora é neutra, mas a pessoa vinha falando do assunto
  const { r: r2, chamadas: c2 } = await comFetch(() => okJson('não deveria'), () => m(pedido('e o que mais devo observar?', { historico: [{ papel: 'usuario', texto: 'um usuário falou sobre autolesão' }, { papel: 'paulus', texto: 'Entendo.' }] }), envCom(EXT)));
  assert.equal(r2.status, 503);
  assert.equal(c2.length, 0);
  limparMarcaEsgotada();
});

test('privacidade: documento anexado nunca vai ao provedor externo', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  const documento = { nome: 'nota.txt', trechos: ['O CRAS é a porta de entrada da proteção social básica e oferta o PAIF às famílias do território.'] };
  const { r, chamadas } = await comFetch(() => okJson('não deveria'), () => m(pedido('Resuma o documento anexado.', { documento }), envCom(EXT)));
  assert.equal(chamadas.length, 0, 'o provedor externo não foi chamado');
  assert.notEqual((await r.json()).externa, true);
  limparMarcaEsgotada();
});

test('privacidade: foto (lida pela visão da Cloudflare) nunca vai ao provedor externo', async () => {
  limparMarcaEsgotada();
  const m = criarManipulador({ base, apps: APPS });
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].concat(new Array(200).fill(7))).toString('base64');
  // a visão responde; a resposta final esbarra na cota
  const env = envCom(EXT);
  env.AI = { async run(modelo) { if (/vision|scout/.test(modelo)) return { response: 'TEXTO NA IMAGEM:\nO CRAS oferta o PAIF às famílias do território.\nO QUE A IMAGEM MOSTRA:\nUm cartaz de serviço.' }; throw new Error(ERRO_4006); } };
  const { r, chamadas } = await comFetch(() => okJson('não deveria'), () => m(pedido('o que diz a imagem?', { imagem: { nome: 'a.png', dados: png } }), env));
  assert.equal(r.status, 503);
  assert.equal(chamadas.length, 0);
  limparMarcaEsgotada();
});

// ---------------------------------------------------------------- app: aviso na resposta

import vm from 'node:vm';
import { juntar } from '../scripts/build.mjs';

test('app: resposta da reserva externa chega marcada (externa) e com o aviso, em stream e sem stream; o app não entra em pausa', async () => {
  limparMarcaEsgotada();
  const sandbox = (f) => { const s = { self: {}, fetch: f, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } }; vm.runInNewContext(juntar(), s); return s.self.Paulus; };
  const manipular = criarManipulador({ base, apps: APPS });
  const env = envCom(EXT);
  const original = globalThis.fetch;
  const fetchApp = async (url, init) => manipular(new Request(url, { method: init.method, headers: Object.assign({}, init.headers, { Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }), body: init.body }), env);
  globalThis.fetch = async () => okJson('Resposta de reserva para o app.');   // o provedor externo (o Worker chama globalThis.fetch)
  try {
    for (const stream of [true, false]) {
      limparMarcaEsgotada();
      const P = sandbox(fetchApp);
      P.init({ app: 'argo', endpoint: 'https://paulus-ia.exemplo.workers.dev', conhecimento: base, minIntervaloMs: 0 });
      const r = await P.perguntar('Quem gere o Cadastro Único no município?', stream ? { onToken() {} } : {});
      assert.equal(r.tipo, 'ia', 'stream=' + stream);
      assert.match(r.texto, /Resposta de reserva para o app/);
      assert.equal(r.externa, true);
      assert.ok(r.avisos.some((a) => /IA de reserva de outro provedor/.test(a)));
      assert.equal(P.ia.estado().pausada, false, 'com a reserva funcionando o app não pausa a IA');
    }
  } finally { globalThis.fetch = original; }
  limparMarcaEsgotada();
});
