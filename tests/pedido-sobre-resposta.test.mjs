// Pedidos sobre a última resposta (continuar, contestar, "por quê?") e pergunta composta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { montarMensagens, montarSistema, blocoPartes } from '../worker/prompt.mjs';
import { pedeAnalise, montarMensagensRaciocinio } from '../worker/raciocinar.mjs';
import { classificarPedido, consultaDoPedido, perfilDaIA, trechosParaOPedido, partesDaPergunta } from '../shared/pedido.mjs';
import { compactarHistorico } from '../shared/conversa.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const H = [
  { papel: 'usuario', texto: 'quem tem direito ao BPC?' },
  { papel: 'paulus', texto: 'Idosos de 65 anos ou mais e pessoas com deficiência, com renda per capita de até 1/4 do salário mínimo.' }
];

test('pedido: continuar, contestar e "por quê?" só valem com resposta anterior', () => {
  for (const t of ['continue', 'pode continuar', 'aprofunde', 'tem mais?', 'o que mais?']) assert.equal(classificarPedido(t, H), 'continuar', t);
  for (const t of ['tem certeza?', 'discordo', 'isso está errado', 'mas eu li que o limite é meio salário mínimo']) assert.equal(classificarPedido(t, H), 'contestacao', t);
  for (const t of ['por quê?', 'de onde tirou isso?', 'qual a fonte?', 'onde está escrito?']) assert.equal(classificarPedido(t, H), 'porque', t);
  for (const t of ['continue', 'tem certeza?', 'por quê?']) assert.ok(!['continuar', 'contestacao', 'porque'].includes(classificarPedido(t, [])), t);
});

test('pedido: pergunta nova que começa parecido NÃO é pedido sobre a resposta', () => {
  for (const t of ['tem certeza que o CRAS atende aos domingos e à noite?', 'continue o ofício para o CAPS com os dados abaixo e o nome da família', 'quem tem direito ao BPC?'])
    assert.ok(!['continuar', 'contestacao', 'porque'].includes(classificarPedido(t, H)), t);
});

test('pedido: busca herda o assunto; contestação soma as palavras novas', () => {
  assert.equal(consultaDoPedido('continue', H, 'continuar'), 'quem tem direito ao BPC?');
  assert.equal(consultaDoPedido('por quê?', H, 'porque'), 'quem tem direito ao BPC?');
  assert.match(consultaDoPedido('mas eu li que é meio salário', H, 'contestacao'), /BPC.*meio salário/);
});

test('pedido: parâmetros e trechos por modo', () => {
  assert.equal(perfilDaIA({ modo: 'contestacao' }).temperature, 0.2);
  assert.equal(perfilDaIA({ modo: 'porque' }).temperature, 0.2);
  assert.equal(perfilDaIA({ modo: 'continuar' }).max_tokens, 1100);
  assert.equal(perfilDaIA({ modo: 'normal', partes: 3 }).max_tokens, 1300);
  assert.equal(perfilDaIA({ modo: 'normal', partes: 3, tema: true }).max_tokens, 900);
  assert.equal(trechosParaOPedido('continuar', 'continue', 4), 3);
  assert.equal(trechosParaOPedido('contestacao', 'tem certeza?', 4), 4);
});

test('conversa: "tem certeza?", "continue" e "por quê?" não entram no resumo de perguntas antigas', () => {
  const h = [];
  for (const t of ['como funciona a busca ativa no PAIF?', 'tem certeza?', 'continue', 'por quê?', 'e o BPC, quem tem direito hoje?']) h.push({ papel: 'usuario', texto: t }, { papel: 'paulus', texto: 'resposta' });
  const c = compactarHistorico(h, { recentes: 2 });
  assert.deepEqual(c.antigas, ['como funciona a busca ativa no PAIF?']);
});

test('pergunta composta: cada pergunta vira uma parte (2 a 4)', () => {
  assert.equal(partesDaPergunta('Posso encaminhar sem consentimento? E se a família recusar? E quando notificar o conselho?').length, 3);
  assert.deepEqual(partesDaPergunta('o que é CRAS?'), []);
  assert.match(blocoPartes(['a b c?', 'd e f?']), /TODAS/);
});

test('raciocínio: decisão curta e contestação analisam; continuar e "por quê?" não', () => {
  assert.equal(pedeAnalise('Posso registrar isso como visita?', 'normal'), true);
  assert.equal(pedeAnalise('tem certeza?', 'contestacao', H), true);
  assert.equal(pedeAnalise('continue', 'continuar', H), false);
  assert.equal(pedeAnalise('por quê?', 'porque', H), false);
  const m = montarMensagensRaciocinio({ app: APPS.argo, historico: H, pergunta: 'tem certeza?', achados: [], modo: 'contestacao' });
  assert.match(m[1].content, /duvidando ou discordando/);
});

test('prompt: cada modo traz o seu bloco; suicídio não recebe nenhum', () => {
  assert.match(montarSistema(APPS.argo, '', false, [], { modo: 'continuar' }), /CONTINUAÇÃO DA RESPOSTA ANTERIOR/);
  assert.match(montarSistema(APPS.argo, '', false, [], { modo: 'contestacao' }), /DUVIDOU OU DISCORDOU/);
  assert.match(montarSistema(APPS.argo, '', false, [], { modo: 'porque' }), /DE ONDE VEIO A SUA RESPOSTA/);
  assert.match(montarSistema(APPS.argo, '', false, [], { partes: ['a b c?', 'd e f?'] }), /VÁRIAS PERGUNTAS/);
  assert.doesNotMatch(montarSistema(APPS.argo, '', true, [], { modo: 'contestacao' }), /DUVIDOU OU DISCORDOU/);
});

function ambiente() {
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(modelo, params) { chamadas.push({ modelo, params }); return { response: 'Resposta.' }; } } };
  return { env, chamadas };
}
let ipN = 0;
const pedido = (corpo) => new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': '9.9.' + Math.floor(++ipN / 200) + '.' + (ipN % 200) }, body: JSON.stringify(corpo) });

test('Worker: "continue" e "por quê?" não fazem passo extra e usam o bloco certo', async () => {
  for (const [msg, re] of [['continue', /CONTINUAÇÃO/], ['por quê?', /DE ONDE VEIO/]]) {
    const { env, chamadas } = ambiente();
    const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
    await m(pedido({ app: 'argo', pergunta: msg, historico: H }), env);
    assert.equal(chamadas.length, 1, msg);
    assert.match(chamadas[0].params.messages[0].content, re);
  }
});

test('Worker: "tem certeza?" reanalisa e usa o bloco de contestação', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  await m(pedido({ app: 'argo', pergunta: 'tem certeza?', historico: H }), env);
  assert.ok(chamadas.length >= 2, 'passo de raciocínio + resposta');
  const ultima = chamadas[chamadas.length - 1];
  assert.match(ultima.params.messages[0].content, /DUVIDOU OU DISCORDOU/);
  assert.equal(ultima.params.temperature, 0.2);
});

test('Worker: pergunta composta avisa o prompt de que são várias', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  await m(pedido({ app: 'argo', pergunta: 'O que é o PAIF? Como funciona o BPC? Quando o CadÚnico precisa ser atualizado?' }), env);
  assert.match(chamadas[chamadas.length - 1].params.messages[0].content, /VÁRIAS PERGUNTAS/);
});
