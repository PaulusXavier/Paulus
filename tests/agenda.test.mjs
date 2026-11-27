// Agenda do Paulus: compatibilidade com a cifra do Argo (enc1), regras de datas e entrada rápida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const win = { PaulusAgendaDatas: { anos: {}, nomes: {} } };
const sandbox = { window: win, document: {}, localStorage: { getItem() { return null; } }, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, setInterval() {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../console/agenda.js', import.meta.url), 'utf8'), sandbox);
const T = sandbox.window.PaulusAgenda._teste;

// Gerado pelas funções REAIS do Argo (encryptForStorage, senha "senha-teste"): se isto falhar, a sincronização com o Argo quebrou.
const DO_ARGO = 'enc1:z1V2vD4d8zW44gJ3OKBQkw==:M6PiBcXMCxaQpPW6T2JMqPYMViO4iKVKwUCdInmWJRxu';

test('agenda: lê o que o Argo cifrou e o Argo lê o que o Paulus cifra (mesma chave)', async () => {
  const k = await T.derive('senha-teste');
  assert.equal(T.dec(DO_ARGO, k), 'Visita à família — ação 14h');
  const volta = T.enc('Reunião às 9h ç ã', k);
  assert.match(volta, /^enc1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.equal(T.dec(volta, k), 'Reunião às 9h ç ã');
});

test('agenda: senha errada não vira texto torto', async () => {
  const errada = await T.derive('outra-senha');
  let recusadas = 0;
  for (let i = 0; i < 50; i++) if (T.dec(T.enc('Reunião com a equipe do CRAS dia ' + i, await T.derive('senha-teste')), errada) === null) recusadas++;
  assert.ok(recusadas >= 49);
  assert.equal(T.dec('texto antigo em claro', errada), 'texto antigo em claro');
  assert.equal(T.dec('enc2:AAAA:BBBB', errada), null);
});

test('agenda: feriados calculados (Páscoa, Carnaval, Corpus Christi)', () => {
  assert.equal(T.easter(2027).toISOString().slice(0, 10), '2027-03-28');
  const a = T.computeYear(2027);
  assert.equal(a['2027-02-08'][0], 'CAR.');
  assert.equal(a['2027-03-26'][0], 'PAIX.');
  assert.equal(a['2027-05-27'][0], 'CORP.');
  assert.equal(a['2027-07-09'][0], 'B. VIST.');
  assert.ok(!Object.values(a).some((v) => v[1] === 'pagamento'), 'pagamentos não são inventados');
});

test('agenda: entrada rápida entende data, hora, tipo e repetição', () => {
  const hoje = new Date();
  const p = T.parseQuick('amanhã 14h #visita Família Silva');
  assert.equal(p.text, 'Família Silva');
  assert.equal(p.time, '14:00');
  assert.equal(p.cat, 'visita');
  assert.equal(p.date.getDate(), new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).getDate());
  const q = T.parseQuick('15/12 #prazo Enviar RMA');
  assert.equal(q.date.getMonth(), 11); assert.equal(q.date.getDate(), 15); assert.equal(q.cat, 'prazo');
  const r = T.parseQuick('toda segunda 9h #grupo Grupo de convivência');
  assert.ok(r.rec && r.rec.type === 'weekly' && r.rec.dates.length > 1);
  assert.ok(r.rec.dates.every((d) => d.getDay() === 1));
  assert.equal(T.parseQuick('31/02 teste').bad, true);
});
