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

test('agenda: rótulos de dia, progresso e pontos', () => {
  const hoje = new Date();
  const chave = (n) => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n, 12); return d.toISOString().slice(0, 10).replace(/.*/, () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };
  assert.equal(T.relDay(chave(0)), 'Hoje');
  assert.equal(T.relDay(chave(1)), 'Amanhã');
  assert.equal(T.relDay(chave(-1)), 'Ontem');
  assert.equal(T.relDay(chave(3)), 'Em 3 dias');
  assert.equal(T.relDay(chave(-4)), 'Há 4 dias');
  assert.equal(T.relDay(chave(30)), '');
  assert.equal(T.addDays('2026-12-30', 3), '2027-01-02');
  assert.match(T.progressHtml([{ done: true }, { done: false }]), /1 de 2 concluída/);
  assert.equal(T.progressHtml([]), '');
  const pontos = T.dotsHtml(Array.from({ length: 10 }, (_, i) => ({ text: 'x' + i, cat: 'visita', done: i < 2 })));
  assert.equal((pontos.match(/<i /g) || []).length, 8);
  assert.match(pontos, /\+2/);
});

test('agenda: lista agrupada tem um cabeçalho por dia', () => {
  const html = T.groupedHtml([
    { k: '2026-11-26', i: 0, e: { text: 'A', time: '09:00' } },
    { k: '2026-11-26', i: 1, e: { text: 'B' } },
    { k: '2026-11-27', i: 0, e: { text: 'C' } }
  ]);
  assert.equal((html.match(/class="ag-dayhead"/g) || []).length, 2);
  assert.equal((html.match(/class="ag-entry/g) || []).length, 3);
});

test('agenda: mover anotação de dia (botões +1d/+7d e arrastar)', () => {
  T.setDays({ '2026-11-26': [{ text: 'A' }, { text: 'B' }], '2026-11-27': [{ text: 'C' }] });
  const u = T.planMove('2026-11-26', 0, '2026-11-27');
  assert.equal(JSON.stringify(u.map((x) => [x.k, x.entries.map((e) => e.text)])), JSON.stringify([['2026-11-26', ['B']], ['2026-11-27', ['C', 'A']]]));
  assert.equal(T.planMove('2026-11-26', 5, '2026-11-27'), null, 'índice que não existe');
  assert.equal(T.planMove('2026-11-26', 0, '2026-11-26'), null, 'mesmo dia');
  assert.equal(T.planMove('2026-11-26', 0, '../x'), null, 'data inválida não passa');
});

test('agenda: filtro por tipo e modo pontos no calendário', () => {
  const dia = new Date(2026, 10, 26, 12);
  T.setDays({ '2026-11-26': [{ text: 'Visita Silva', cat: 'visita' }, { text: 'Reunião equipe', cat: 'reuniao' }, { text: 'Sem tipo' }] });
  T.setView({ dots: false, cat: '', week: false, hideDone: false });
  const todas = T.cellHtml(dia, 10, '2026-11-26', '2026-11-26', false);
  assert.equal((todas.match(/class="ag-note/g) || []).length, 3);
  T.setView({ cat: 'visita' });
  const so = T.cellHtml(dia, 10, '2026-11-26', '2026-11-26', false);
  assert.equal((so.match(/class="ag-note/g) || []).length, 1);
  assert.ok(so.includes('Visita Silva') && !so.includes('Reunião equipe'));
  T.setView({ cat: '', dots: true });
  const pontos = T.cellHtml(dia, 10, '2026-11-26', '2026-11-26', false);
  assert.ok(!pontos.includes('ag-note'), 'modo pontos não escreve o texto');
  assert.equal((pontos.match(/<i /g) || []).length, 3);
  assert.match(pontos, /ag-cell h2/, '3 pendentes = intensidade média');
  T.setView({ dots: false });
});


test('agenda (celular): atalhos de data e hora trocam só o começo do texto', () => {
  assert.equal(T.quickSet('Visita Silva', 'day', 'amanhã'), 'amanhã Visita Silva ');
  assert.equal(T.quickSet('amanhã Visita Silva', 'time', '14:00'), 'amanhã 14:00 Visita Silva ');
  assert.equal(T.quickSet('amanhã 14:00 Visita Silva', 'day', 'sex'), 'sex 14:00 Visita Silva ');
  assert.equal(T.quickSet('sex 14:00 Visita Silva', 'time', '09:00'), 'sex 09:00 Visita Silva ');
  assert.equal(T.quickSet('15/12 #prazo RMA', 'day', 'hoje'), 'hoje #prazo RMA ');
  // o que sai da troca continua sendo entendido pela entrada rápida
  const p = T.parseQuick(T.quickSet('Reunião CRAS', 'time', '09:00'));
  assert.equal(p.time, '09:00'); assert.equal(p.text, 'Reunião CRAS');
});

test('agenda (avisos): horário, antecedência, perdidos e adiados', () => {
  const agora = new Date(); agora.setHours(10, 0, 0, 0);
  const k = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  T.setDays({ [k]: [
    { text: 'Atendimento', time: '10:05', createdAt: 1, done: false },   // daqui a 5 min
    { text: 'Reunião', time: '09:00', createdAt: 2, done: false },       // passou há 1 h: perdido
    { text: 'Visita', time: '09:55', createdAt: 3, done: false },        // passou há 5 min: ainda é aviso normal
    { text: 'Feito', time: '10:00', createdAt: 4, done: true },          // concluída não avisa
    { text: 'Tarde', time: '15:00', createdAt: 5, done: false },
    { text: 'Sem hora', createdAt: 6, done: false }
  ] });
  T.prefs().lead = 0;
  let d = T.dueAlerts(agora);
  assert.deepEqual([...d.fresh.map((a) => a.e.text)], ['Visita']);
  assert.deepEqual([...d.missed.map((a) => a.e.text)], ['Reunião']);
  T.prefs().lead = 5;
  d = T.dueAlerts(agora);
  assert.deepEqual([...d.fresh.map((a) => a.e.text)].sort(), ['Atendimento', 'Visita']);
  T.prefs().lead = 0;
});

test('agenda (avisos): botão Concluir do aviso conclui a anotação certa; anotação apagada é ignorada', () => {
  const k = '2026-11-27';
  T.setDays({ [k]: [{ text: 'A', time: '08:00', createdAt: 11, done: false }, { text: 'B', time: '08:00', createdAt: 12, done: false }] });
  assert.equal(T.applyAction('concluir', T.alertId(k, { createdAt: 12 }, '08:00', 1)), true);
  assert.deepEqual([...T.days()[k].map((e) => e.done)], [false, true]);
  assert.equal(T.applyAction('concluir', 'n|2026-11-27|999|08:00'), true);          // não existe mais: nada acontece
  assert.deepEqual([...T.days()[k].map((e) => e.done)], [false, true]);
  assert.equal(T.applyAction('concluir', 'lixo'), false);
  assert.equal(T.applyAction('concluir', 'n|../../x|1|08:00'), false);
});
