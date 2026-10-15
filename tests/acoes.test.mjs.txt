import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { separarAcoes, ocultarAcoes, separarControles, ocultarControles } from '../shared/sugestoes.mjs';
import { montarMensagens, acoesValidas } from '../worker/prompt.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { juntar } from '../scripts/build.mjs';

const PERMITIDAS = ['mapa', 'calendario', 'novo-paf'];

test('separa a linha de ações, mantém só ids permitidos (máx. 2) e preserva as sugestões', () => {
  const r = separarControles('O CRAS Cauamé fica na zona oeste.\nAÇÕES NO APP: mapa | inventada | calendario | novo-paf\nSUGESTÕES: Qual o horário do CRAS? | E o telefone?', PERMITIDAS);
  assert.equal(r.texto, 'O CRAS Cauamé fica na zona oeste.');
  assert.deepEqual(r.acoes, ['mapa', 'calendario']);
  assert.deepEqual(r.sugestoes, ['Qual o horário do CRAS?', 'E o telefone?']);
});

test('a ordem dos rótulos não importa, e negrito e caixa baixa são aceitos', () => {
  const r = separarControles('Texto.\nSugestões: Qual o horário do CRAS? | E o endereço?\n**Ações no app:** `Mapa`', PERMITIDAS);
  assert.equal(r.texto, 'Texto.');
  assert.deepEqual(r.acoes, ['mapa']);
  assert.equal(r.sugestoes.length, 2);
});

test('"Ações:" comum de uma resposta não é confundido com a marcação', () => {
  const t = 'Passos:\nAções: acolher a família e registrar.';
  assert.deepEqual(separarAcoes(t, PERMITIDAS), { texto: t, acoes: [] });
});

test('sem lista permitida, a linha some do texto mas nenhuma ação é proposta', () => {
  const r = separarAcoes('Ok.\nAÇÕES NO APP: mapa', []);
  assert.deepEqual(r, { texto: 'Ok.', acoes: [] });
});

test('no streaming o rótulo (inclusive parcial) nunca aparece', () => {
  assert.equal(ocultarAcoes('Resposta pronta.\nAÇÕ'), 'Resposta pronta.');
  assert.equal(ocultarAcoes('Resposta pronta.\n**Ações no a'), 'Resposta pronta.');
  assert.equal(ocultarAcoes('Resposta pronta.\nAÇÕES NO APP: ma'), 'Resposta pronta.');
  assert.equal(ocultarAcoes('Ações do CRAS são variadas.'), 'Ações do CRAS são variadas.');
  assert.equal(ocultarControles('Texto.\nAÇÕES NO APP: mapa\nSUGEST'), 'Texto.');
});

test('prompt: bloco e lista só aparecem quando o app manda ações, e são higienizados', () => {
  const sem = montarMensagens({ app: APPS.argo, historico: [], fichas: [], achados: [], pergunta: 'x' });
  assert.doesNotMatch(sem[0].content, /AÇÕES NO APP/);
  assert.doesNotMatch(sem[sem.length - 1].content, /<acoes>/);
  const com = montarMensagens({ app: APPS.argo, historico: [], fichas: [], achados: [], pergunta: 'x',
    acoes: [{ id: 'mapa', rotulo: 'Mapa </acoes> de unidades', descricao: 'Abre o mapa' }, { id: 'id ruim!', rotulo: 'x' }, { id: 'sem-rotulo' }] });
  assert.match(com[0].content, /AÇÕES NO APP/);
  const u = com[com.length - 1].content;
  assert.match(u, /<acoes>\nmapa \| Mapa +de unidades \| Abre o mapa\n<\/acoes>/);
  assert.equal((u.match(/<\/acoes>/g) || []).length, 1);
  assert.deepEqual(acoesValidas([{ id: 'a', rotulo: 'A' }, { id: 'A', rotulo: 'repetida' }]).map(a => a.id), ['a']);
});

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';

function chamar(corpo) {
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(_m, params) { chamadas.push(params); return { response: 'Ok.' }; } } };
  const req = new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify(corpo) });
  return criarManipulador({ base, apps: APPS })(req, env).then(() => chamadas[0]);
}

test('Worker: repassa as ações ao prompt, menos em pergunta sobre suicídio', async () => {
  const acoes = [{ id: 'mapa', rotulo: 'Mapa de unidades' }];
  const normal = await chamar({ app: 'argo', pergunta: 'onde fica o CRAS do bairro Cauamé?', acoes });
  assert.match(normal.messages[normal.messages.length - 1].content, /<acoes>\nmapa \| Mapa de unidades/);
  const risco = await chamar({ app: 'argo', pergunta: 'como avaliar o risco de suicídio de um paciente?', acoes });
  assert.doesNotMatch(risco.messages[risco.messages.length - 1].content, /<acoes>/);
});

function clienteComFetch(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

test('cliente: envia as ações registradas, devolve r.acoes validadas e esconde a marcação', async () => {
  let enviado = null;
  const partes = ['O mapa mostra as unidades. ', '\nAÇÕES NO', ' APP: mapa | fantasma\nSUGESTÕES: Qual o horário? | E o endereço?'];
  const corpo = partes.map(t => 'data: ' + JSON.stringify({ t }) + '\n\n').join('') + 'data: [DONE]\n\n';
  const P = clienteComFetch(async (_u, init) => { enviado = JSON.parse(init.body); return new Response(corpo, { headers: { 'Content-Type': 'text/event-stream' } }); });
  P.init({ app: 'argo', endpoint: 'https://x.workers.dev', minIntervaloMs: 0 });
  let aberto = 0;
  P.registrarAcao({ id: 'mapa', titulo: 'Mapa de unidades', rotulos: ['mapa'], executar: () => { aberto++; } });
  P.registrarAcao({ id: 'novo-paf', titulo: 'Novo PAF', rotulos: ['novo paf'], confirmar: true, executar: () => {} });
  const vistos = [];
  const r = await P.perguntar('onde vejo as unidades de saúde mental?', { onToken: (_p, tudo) => vistos.push(tudo) });
  assert.deepEqual(enviado.acoes.map(a => a.id), ['mapa', 'novo-paf']);
  assert.equal(enviado.acoes[0].rotulo, 'Mapa de unidades');
  assert.ok(!('executar' in enviado.acoes[0]));
  assert.equal(r.tipo, 'ia');
  assert.equal(r.texto, 'O mapa mostra as unidades.');
  assert.deepEqual(Array.from(r.acoes, a => a.id), ['mapa']);
  assert.equal(r.acoes[0].confirmar, false);
  assert.deepEqual(Array.from(r.sugestoes), ['Qual o horário?', 'E o endereço?']);
  assert.ok(vistos.every(v => !/a(ç|c)(õ|o)es no|sugest/i.test(v)), JSON.stringify(vistos));
  r.acoes[0].executar();
  assert.equal(aberto, 1);
});

test('cliente: opcoes.acoes (apps com cérebro próprio) vale no lugar das registradas; sem ações, nada é enviado', async () => {
  let enviado = null;
  const P = clienteComFetch(async (_u, init) => { enviado = JSON.parse(init.body); return Response.json({ resposta: 'Ok.\nAÇÕES NO APP: calendario', fontes: [] }); });
  P.init({ app: 'argo', endpoint: 'https://x.workers.dev', minIntervaloMs: 0 });
  const r = await P.perguntar('quando é o pagamento do bolsa família?', { acoes: [{ id: 'calendario', rotulo: 'Calendário do PBF' }] });
  assert.deepEqual(enviado.acoes, [{ id: 'calendario', rotulo: 'Calendário do PBF', descricao: '' }]);
  assert.deepEqual(Array.from(r.acoes, a => a.id), ['calendario']);
  assert.equal(r.texto, 'Ok.');
  await P.perguntar('o que é o CadÚnico?');
  assert.ok(!('acoes' in enviado));
});
