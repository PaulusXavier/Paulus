import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalStorageAdapter,
  createRoutineManager,
} from '../shared/rotinas.mjs';

class FakeClock {
  constructor(value) {
    this.value = new Date(value);
  }

  now = () => new Date(this.value);

  set(value) {
    this.value = new Date(value);
  }

  advance(milliseconds) {
    this.value = new Date(this.value.getTime() + milliseconds);
  }
}

class MemoryStorage {
  constructor(initial = []) {
    this.value = structuredClone(initial);
    this.saves = 0;
  }

  load = () => structuredClone(this.value);

  save = (routines) => {
    this.value = structuredClone(routines);
    this.saves += 1;
  };
}

function routine(title, trigger, extra = {}) {
  return { title, prompt: `Acção: ${title}`, trigger, ...extra };
}

test('cria, lista, liga/desliga e remove rotinas persistidas', async () => {
  const storage = new MemoryStorage();
  const clock = new FakeClock('2026-11-26T10:00:00');
  const manager = createRoutineManager({ storage, now: clock.now, execute: async () => {} });

  const created = await manager.add(routine('Resumo', { type: 'time', time: '10:30' }));
  assert.ok(created.id);
  assert.equal(created.enabled, true);
  assert.equal(created.lastRun, null);
  assert.deepEqual(await manager.list(), [created]);
  assert.deepEqual(storage.value, [created]);

  const disabled = await manager.setEnabled(created.id, false);
  assert.equal(disabled.enabled, false);
  assert.equal(manager.getNextExecution(disabled), null);
  assert.equal((await manager.setEnabled(created.id, true)).enabled, true);
  assert.equal(await manager.remove(created.id), true);
  assert.deepEqual(await manager.list(), []);
  assert.equal(await manager.remove(created.id), false);
});

test('valida campos e tipos de trigger', async () => {
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    execute: async () => {},
  });
  await assert.rejects(manager.add({ prompt: 'sem título', trigger: { type: 'start' } }), /title/);
  await assert.rejects(manager.add(routine('inválida', { type: 'time', time: '25:00' })), /HH:mm/);
  await assert.rejects(manager.add(routine('inválida', { type: 'idle', minutes: 0 })), /inteiro positivo/);
  await assert.rejects(manager.add(routine('inválida', { type: 'other' })), /time, start ou idle/);
  const fromActionAlias = await manager.add({ title: 'Alias', action: 'Fazer algo', trigger: { type: 'start' } });
  assert.equal(fromActionAlias.prompt, 'Fazer algo');
});

test('trigger start é executado uma vez por carregamento e aguarda callback async', async () => {
  const clock = new FakeClock('2026-11-26T10:00:00');
  const storage = new MemoryStorage();
  let release;
  const calls = [];
  const manager = createRoutineManager({
    storage,
    now: clock.now,
    execute: async (item, context) => {
      calls.push({ item, context });
      await new Promise((resolve) => { release = resolve; });
    },
  });
  const item = await manager.add(routine('Ao abrir', { type: 'start' }));

  const firstStart = manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.trigger, 'start');
  assert.equal(calls[0].context.routineId, item.id);
  assert.ok((await manager.get(item.id)).lastRun);
  release();
  const results = await firstStart;
  assert.equal(results[0].status, 'executed');
  assert.deepEqual(await manager.start(), []);
  assert.equal(calls.length, 1);
});

test('trigger time usa hora local, tolera pequena latência e não duplica no mesmo dia', async () => {
  const clock = new FakeClock(new Date(2026, 10, 26, 10, 29, 50));
  const calls = [];
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    now: clock.now,
    execute: async (item, context) => calls.push({ item, context }),
  });
  const item = await manager.add(routine('Horário', { type: 'time', time: '10:30' }));
  const next = manager.getNextExecution(item, clock.now());
  assert.equal(next.getHours(), 10);
  assert.equal(next.getMinutes(), 30);
  assert.equal(next.getDate(), 26);

  clock.advance(10_000);
  const first = await manager.tick();
  const second = await manager.tick();
  assert.equal(first.length, 1);
  assert.equal(first[0].status, 'executed');
  assert.deepEqual(second, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.trigger, 'time');
  assert.equal(calls[0].context.scheduledAt, next.toISOString());
  assert.ok((await manager.get(item.id)).lastRun);
});

test('horários muito atrasados são ignorados, sem avalanche, e o próximo é amanhã', async () => {
  const clock = new FakeClock(new Date(2026, 10, 26, 10, 0, 0));
  let executions = 0;
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    now: clock.now,
    graceMs: 30_000,
    execute: async () => { executions += 1; },
  });
  const item = await manager.add(routine('Atrasada', { type: 'time', time: '09:00' }));

  assert.deepEqual(await manager.tick(), []);
  clock.advance(60_000);
  assert.deepEqual(await manager.tick(), []);
  assert.equal(executions, 0);
  const next = manager.getNextExecution(item, clock.now());
  assert.equal(next.getDate(), 27);
  assert.equal(next.getHours(), 9);
});

test('trigger idle respeita minutos, dispara uma vez por período de inactividade e reinicia com actividade', async () => {
  const clock = new FakeClock('2026-11-26T10:00:00');
  const calls = [];
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    now: clock.now,
    execute: async (item, context) => calls.push(context),
  });
  const item = await manager.add(routine('Parado', { type: 'idle', minutes: 5 }));
  assert.equal(manager.getNextExecution(item).getTime(), clock.value.getTime() + 5 * 60_000);

  clock.advance(4 * 60_000 + 59_000);
  assert.deepEqual(await manager.tick(), []);
  clock.advance(1_000);
  assert.equal((await manager.tick()).length, 1);
  assert.deepEqual(await manager.tick(), []);
  assert.equal(calls.length, 1);
  assert.equal(manager.getNextExecution(item), null);

  clock.advance(60_000);
  const recorded = manager.recordActivity();
  assert.equal(recorded.getTime(), clock.value.getTime());
  assert.deepEqual(await manager.tick(), []);
  clock.advance(5 * 60_000);
  assert.equal((await manager.tick()).length, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((context) => context.trigger === 'idle'));
});

test('rotina desactivada não executa e pode voltar a ser activada', async () => {
  const clock = new FakeClock('2026-11-26T10:00:00');
  let executions = 0;
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    now: clock.now,
    execute: async () => { executions += 1; },
  });
  const item = await manager.add(routine('Arranque desligado', { type: 'start' }, { enabled: false }));
  assert.deepEqual(await manager.start(), []);
  await manager.setEnabled(item.id, true);
  // start já ocorreu neste carregamento; não volta a ser emitido nem cria duplicações.
  assert.deepEqual(await manager.start(), []);
  assert.equal(executions, 0);
});

test('erros do callback são devolvidos e a ocorrência continua marcada para evitar repetição', async () => {
  const clock = new FakeClock('2026-11-26T10:00:00');
  const manager = createRoutineManager({
    storage: new MemoryStorage(),
    now: clock.now,
    execute: async () => { throw new Error('falha controlada'); },
  });
  await manager.add(routine('Erro', { type: 'start' }));
  const result = await manager.start();
  assert.equal(result[0].status, 'error');
  assert.match(result[0].error.message, /falha controlada/);
  assert.deepEqual(await manager.start(), []);
});

test('adaptador de localStorage trata vazio e JSON inválido', () => {
  const values = new Map();
  const browserStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const adapter = createLocalStorageAdapter(browserStorage, 'rotinas-teste');
  assert.deepEqual(adapter.load(), []);
  const sample = [routine('Guardada', { type: 'start' }, { id: 'saved' })];
  adapter.save(sample);
  assert.deepEqual(adapter.load(), sample);
  values.set('rotinas-teste', '{');
  assert.deepEqual(adapter.load(), []);
});
