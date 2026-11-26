import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function novo() {
  const mem = {};
  const sandbox = { window: {}, Promise, Date, Math, Object, Array, String, Number, Notification: undefined, document: { visibilityState: 'visible' },
    setInterval: () => 0, clearInterval: () => {}, localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } } };
  vm.runInNewContext(readFileSync(new URL('../console/confirmar.js', import.meta.url), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(new URL('../console/lembretes.js', import.meta.url), 'utf8'), sandbox);
  return { L: sandbox.window.PaulusLembretes, C: sandbox.window.PaulusConfirmar, mem };
}
const AGORA = new Date(2026, 10, 26, 10, 0, 0); // quinta, 26/11/2026 10:00
const quando = (ms) => { const d = new Date(ms); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].join('-'); };
const cmd = (L, t) => JSON.parse(JSON.stringify(L.interpretar(t, AGORA)));

test('amanhã às 15h', () => {
  const { L } = novo(); const c = cmd(L, 'Me lembre de ligar para a escola amanhã às 15h');
  assert.equal(c.acao, 'criar'); assert.equal(c.texto, 'Ligar para a escola'); assert.equal(quando(c.quando), '2026-11-27-15-0');
});
test('hoje 17:30, "lembre-me" e período do dia', () => {
  const { L } = novo();
  assert.equal(quando(cmd(L, 'Lembre-me de buscar o documento hoje às 17:30').quando), '2026-11-26-17-30');
  assert.equal(quando(cmd(L, 'me lembre de tomar café amanhã às 7 da manhã').quando), '2026-11-27-7-0');
  assert.equal(quando(cmd(L, 'me lembre da reunião hoje às 8 da noite').quando), '2026-11-26-20-0');
});
test('daqui a / em minutos e horas', () => {
  const { L } = novo();
  assert.equal(quando(cmd(L, 'me lembre de ligar daqui a 30 minutos').quando), '2026-11-26-10-30');
  assert.equal(quando(cmd(L, 'me avise de sair em 2 horas').quando), '2026-11-26-12-0');
  assert.equal(cmd(L, 'me lembre de ligar daqui a 30 minutos').texto, 'Ligar');
});
test('dia da semana e data', () => {
  const { L } = novo();
  assert.equal(quando(cmd(L, 'me lembre de enviar o relatório sexta às 14h').quando), '2026-11-27-14-0');
  assert.equal(quando(cmd(L, 'me lembre da consulta dia 30 às 9h').quando), '2026-11-30-9-0');
  assert.equal(quando(cmd(L, 'me lembre de pagar 5/12 às 8h30').quando), '2026-12-5-8-30');
});
test('só a hora: próxima ocorrência; só o dia: 9h', () => {
  const { L } = novo();
  assert.equal(quando(cmd(L, 'me lembre de ligar às 9h').quando), '2026-11-27-9-0');
  assert.equal(quando(cmd(L, 'me lembre de ligar às 18h').quando), '2026-11-26-18-0');
  assert.equal(quando(cmd(L, 'me lembre de ligar amanhã').quando), '2026-11-27-9-0');
});
test('sem horário, devolve pedido de horário; frases comuns não são comigo', () => {
  const { L } = novo();
  assert.equal(cmd(L, 'me lembre de comprar pão').acao, 'sem_hora');
  assert.equal(L.interpretar('qual a capital da França?', AGORA), null);
  assert.equal(L.interpretar('o que é lembrar?', AGORA), null);
  assert.equal(L.interpretar('adicionar leite à lista', AGORA), null);
});
test('listar, silenciar, ativar', () => {
  const { L } = novo();
  assert.equal(cmd(L, 'meus lembretes').acao, 'listar');
  assert.equal(cmd(L, 'silenciar lembretes').acao, 'silenciar');
  assert.equal(cmd(L, 'ativar lembretes').acao, 'ativar');
});
test('criar, listar, disparar, silenciar e cancelar com desfazer', async () => {
  const { L, C, mem } = novo(); const avisos = [];
  L.init({ avisar: l => avisos.push(l.texto) });
  let t = await L.executar(cmd(L, 'me lembre de ligar para a escola amanhã às 15h'), AGORA);
  assert.match(t, /Combinado.*amanhã às 15:00: Ligar para a escola/);
  assert.match(JSON.stringify(mem), /paulus.lembretes/);
  await L.executar(cmd(L, 'me lembre de ver o forno daqui a 5 minutos'), AGORA);
  assert.match(await L.executar({ acao: 'listar' }, AGORA), /Lembretes agendados \(2\)/);
  assert.equal(L.disparar(new Date(2026, 10, 26, 10, 6)).length, 1);
  assert.deepEqual(avisos, ['Ver o forno']);
  await L.executar({ acao: 'silenciar' });
  await L.executar(cmd(L, 'me lembre de x daqui a 1 minuto'), AGORA);
  L.disparar(new Date(2026, 10, 26, 10, 3));
  assert.deepEqual(avisos, ['Ver o forno']); // silenciado: guarda, não avisa
  const r = await L.executar(cmd(L, 'cancelar lembrete escola'), AGORA);
  assert.match(r, /Cancelei o lembrete: Ligar para a escola/);
  const rec = L.recibo(); assert.ok(rec);
  assert.equal((await C.desfazer(rec.id)).ok, true);
  assert.match(await L.executar({ acao: 'listar' }, AGORA), /Ligar para a escola/);
});
test('horário passado não cria lembrete', async () => {
  const { L } = novo();
  assert.match(await L.executar({ acao: 'criar', texto: 'X', quando: AGORA.getTime() - 1000 }, AGORA), /já passou/);
});
