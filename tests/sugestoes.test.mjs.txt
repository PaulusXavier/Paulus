import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { separarSugestoes, ocultarSugestoes } from '../shared/sugestoes.mjs';
import { montarMensagens } from '../worker/prompt.mjs';
import { APPS } from '../worker/apps.mjs';
import { juntar } from '../scripts/build.mjs';

test('separa as sugestões do texto e limita a 3', () => {
  const r = separarSugestoes('O CRAS acolhe a família.\n\nSUGESTÕES: Qual o horário do CRAS? | E para adolescente? | Como é o encaminhamento? | quarta que passa do limite');
  assert.equal(r.texto, 'O CRAS acolhe a família.');
  assert.deepEqual(r.sugestoes, ['Qual o horário do CRAS?', 'E para adolescente?', 'Como é o encaminhamento?']);
});

test('sem rótulo, o texto fica igual; lixo curto é descartado', () => {
  assert.deepEqual(separarSugestoes('Só isso.'), { texto: 'Só isso.', sugestoes: [] });
  assert.deepEqual(separarSugestoes('Ok.\nSugestões: a | b').sugestoes, []);
});

test('aceita negrito e lista com marcadores', () => {
  const r = separarSugestoes('Texto.\n**Sugestões:**\n- Qual o telefone do CAPS?\n- Qual o endereço?');
  assert.deepEqual(r.sugestoes, ['Qual o telefone do CAPS?', 'Qual o endereço?']);
  assert.equal(r.texto, 'Texto.');
});

test('no streaming o rótulo (inclusive parcial) nunca aparece', () => {
  assert.equal(ocultarSugestoes('Resposta pronta.\nSUG'), 'Resposta pronta.');
  assert.equal(ocultarSugestoes('Resposta pronta.\n**Suges'), 'Resposta pronta.');
  assert.equal(ocultarSugestoes('Resposta pronta.\nSUGESTÕES: Qual o ho'), 'Resposta pronta.');
  assert.equal(ocultarSugestoes('A sugestão do CRAS é útil.'), 'A sugestão do CRAS é útil.');
});

test('o prompt pede sugestões e apresenta o mascote do Argo', () => {
  const m = montarMensagens({ app: APPS.argo, pagina: 'CRAS', historico: [], fichas: [], achados: [], pergunta: 'x' });
  assert.match(m[0].content, /SUGESTÕES:/);
  assert.match(m[0].content, /aparece como o Argo/);
});

test('cliente: onToken recebe texto sem rótulo e o resultado traz as sugestões', async () => {
  const partes = ['O CRAS acolhe a família. ', '\nSUGEST', 'ÕES: Qual o horário? | E o endereço?'];
  const corpo = partes.map(t => 'data: ' + JSON.stringify({ t }) + '\n\n').join('') + 'data: [DONE]\n\n';
  const fetchFalso = async () => new Response(corpo, { headers: { 'Content-Type': 'text/event-stream' } });
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'argo', endpoint: 'https://x.workers.dev', minIntervaloMs: 0 });
  const vistos = [];
  const r = await P.perguntar('o que o CRAS faz com as famílias?', { onToken: (_p, tudo) => vistos.push(tudo) });
  assert.equal(r.tipo, 'ia');
  assert.equal(r.texto, 'O CRAS acolhe a família.');
  assert.deepEqual(Array.from(r.sugestoes), ['Qual o horário?', 'E o endereço?']);
  assert.ok(vistos.every(v => !/sugest/i.test(v)), JSON.stringify(vistos));
});
