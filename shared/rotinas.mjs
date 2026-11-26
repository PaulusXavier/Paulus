const STORAGE_KEY = 'paulus:rotinas';
const DEFAULT_GRACE_MS = 60_000;

/**
 * Motor de rotinas sem timers, APIs de rede ou dependências de ambiente.
 *
 * O storage injectado implementa load() -> lista de rotinas e save(lista).
 * O consumidor decide quando chamar start(), tick() e recordActivity().
 * execute(routine, context) é sempre fornecido pelo consumidor; este módulo
 * nunca efectua chamadas de rede nem acções com side effects por iniciativa própria.
 */
export function createRoutineManager({
  storage,
  execute,
  now = () => new Date(),
  graceMs = DEFAULT_GRACE_MS,
} = {}) {
  if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new TypeError('storage deve implementar load() e save(lista)');
  }
  if (typeof execute !== 'function') {
    throw new TypeError('execute deve ser uma função async fornecida pelo chamador');
  }
  if (typeof now !== 'function') throw new TypeError('now deve ser uma função');
  if (!Number.isFinite(graceMs) || graceMs < 0) {
    throw new TypeError('graceMs deve ser um número finito não negativo');
  }

  let routines = [];
  let loaded = false;
  let started = false;
  let lastActivityAt = asDate(now()).getTime();
  let activityEpoch = 0;
  let mutationQueue = Promise.resolve();
  const fired = new Set();
  const running = new Set();

  const serializeMutation = (operation) => {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  };

  async function ensureLoaded() {
    if (loaded) return;
    await serializeMutation(async () => {
      if (loaded) return;
      const saved = await storage.load();
      routines = Array.isArray(saved) ? saved.map(normalizeSavedRoutine).filter(Boolean) : [];
      loaded = true;
    });
  }

  async function persist() {
    await storage.save(routines.map(copyRoutine));
  }

  function snapshot() {
    return routines.map(copyRoutine);
  }

  async function claimAndExecute(id, triggerKey, context) {
    const claim = await serializeMutation(async () => {
      const routine = routines.find((item) => item.id === id);
      const fireKey = `${id}:${triggerKey}`;
      if (!routine || !routine.enabled || fired.has(fireKey) || running.has(id)) return null;
      fired.add(fireKey);
      running.add(id);
      const previousLastRun = routine.lastRun;
      routine.lastRun = asDate(now()).toISOString();
      try {
        await persist();
      } catch (error) {
        routine.lastRun = previousLastRun;
        fired.delete(fireKey);
        running.delete(id);
        throw error;
      }
      return copyRoutine(routine);
    });
    if (!claim) return null;

    try {
      await execute(claim, { ...context, routineId: claim.id });
      return { routine: claim, status: 'executed' };
    } catch (error) {
      return { routine: claim, status: 'error', error };
    } finally {
      running.delete(id);
    }
  }

  async function addRoutine(input) {
    await ensureLoaded();
    const routine = normalizeNewRoutine(input);
    await serializeMutation(async () => {
      if (routines.some((item) => item.id === routine.id)) {
        throw new Error(`Já existe uma rotina com o id "${routine.id}"`);
      }
      routines.push(routine);
      await persist();
    });
    return copyRoutine(routine);
  }

  async function setEnabled(id, enabled) {
    await ensureLoaded();
    if (typeof enabled !== 'boolean') throw new TypeError('enabled deve ser boolean');
    return serializeMutation(async () => {
      const routine = routines.find((item) => item.id === id);
      if (!routine) return null;
      routine.enabled = enabled;
      await persist();
      return copyRoutine(routine);
    });
  }

  async function removeRoutine(id) {
    await ensureLoaded();
    return serializeMutation(async () => {
      const index = routines.findIndex((item) => item.id === id);
      if (index < 0) return false;
      routines.splice(index, 1);
      for (const key of fired) if (key.startsWith(`${id}:`)) fired.delete(key);
      await persist();
      return true;
    });
  }

  async function start() {
    await ensureLoaded();
    const shouldStart = await serializeMutation(async () => {
      if (started) return false;
      started = true;
      return true;
    });
    if (!shouldStart) return [];

    const at = asDate(now());
    const candidates = snapshot().filter((routine) => routine.enabled && routine.trigger.type === 'start');
    const results = [];
    for (const routine of candidates) {
      const result = await claimAndExecute(routine.id, 'start', {
        trigger: 'start',
        scheduledAt: at.toISOString(),
        firedAt: at.toISOString(),
      });
      if (result) results.push(result);
    }
    return results;
  }

  async function tick() {
    await ensureLoaded();
    const at = asDate(now());
    const currentTime = at.getTime();
    const candidates = snapshot().filter((routine) => routine.enabled);
    const results = [];

    for (const routine of candidates) {
      let result = null;
      if (routine.trigger.type === 'time') {
        const scheduled = localScheduledTime(at, routine.trigger.time);
        const delay = currentTime - scheduled.getTime();
        const dayKey = localDateKey(scheduled);
        if (delay >= 0 && delay <= graceMs && localDateKey(lastRunDate(routine)) !== dayKey) {
          result = await claimAndExecute(routine.id, `time:${dayKey}`, {
            trigger: 'time',
            scheduledAt: scheduled.toISOString(),
            firedAt: at.toISOString(),
          });
        }
      } else if (routine.trigger.type === 'idle') {
        const idleSince = lastActivityAt;
        const idleMs = currentTime - idleSince;
        const idleKey = `idle:${activityEpoch}`;
        if (idleMs >= routine.trigger.minutes * 60_000) {
          result = await claimAndExecute(routine.id, idleKey, {
            trigger: 'idle',
            idleMinutes: routine.trigger.minutes,
            idleSince: new Date(idleSince).toISOString(),
            firedAt: at.toISOString(),
          });
        }
      }
      if (result) results.push(result);
    }
    return results;
  }

  function recordActivity(at = now()) {
    lastActivityAt = asDate(at).getTime();
    activityEpoch += 1;
    return new Date(lastActivityAt);
  }

  function getNextExecution(routineOrId, from = now()) {
    const routine = typeof routineOrId === 'string'
      ? routines.find((item) => item.id === routineOrId)
      : routineOrId;
    if (!routine || !routine.enabled) return null;
    const reference = asDate(from);
    if (routine.trigger.type === 'time') {
      const scheduled = localScheduledTime(reference, routine.trigger.time);
      if (scheduled.getTime() <= reference.getTime()) scheduled.setDate(scheduled.getDate() + 1);
      return scheduled;
    }
    if (routine.trigger.type === 'start') return started ? null : reference;
    if (routine.trigger.type === 'idle') {
      if (fired.has(`${routine.id}:idle:${activityEpoch}`)) return null;
      return new Date(lastActivityAt + routine.trigger.minutes * 60_000);
    }
    return null;
  }

  async function list() {
    await ensureLoaded();
    return snapshot();
  }

  async function get(id) {
    await ensureLoaded();
    const routine = routines.find((item) => item.id === id);
    return routine ? copyRoutine(routine) : null;
  }

  return Object.freeze({
    add: addRoutine,
    get,
    getNextExecution,
    list,
    recordActivity,
    remove: removeRoutine,
    setEnabled,
    start,
    tick,
  });
}

/** Adapta el Storage do browser à interface load/save sem aceder a globals. */
export function createLocalStorageAdapter(storage, key = STORAGE_KEY) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('storage deve implementar getItem() e setItem()');
  }
  return {
    load() {
      const raw = storage.getItem(key);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    save(routines) {
      storage.setItem(key, JSON.stringify(routines));
    },
  };
}

function normalizeNewRoutine(input) {
  if (!input || typeof input !== 'object') throw new TypeError('A rotina deve ser um objecto');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const prompt = typeof input.prompt === 'string' ? input.prompt : (typeof input.action === 'string' ? input.action : '');
  if (!title) throw new TypeError('title é obrigatório');
  if (!prompt.trim()) throw new TypeError('prompt ou action é obrigatório');
  const trigger = normalizeTrigger(input.trigger);
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : makeId();
  return {
    id,
    title,
    prompt,
    trigger,
    enabled: input.enabled === undefined ? true : input.enabled,
    lastRun: normalizeLastRun(input.lastRun),
  };
}

function normalizeSavedRoutine(input) {
  try {
    return normalizeNewRoutine(input);
  } catch {
    return null;
  }
}

function normalizeTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') throw new TypeError('trigger é obrigatório');
  if (trigger.type === 'time') {
    if (typeof trigger.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(trigger.time)) {
      throw new TypeError('trigger.time deve estar no formato HH:mm (hora local)');
    }
    return { type: 'time', time: trigger.time };
  }
  if (trigger.type === 'start') return { type: 'start' };
  if (trigger.type === 'idle') {
    if (!Number.isInteger(trigger.minutes) || trigger.minutes < 1) {
      throw new TypeError('trigger.minutes deve ser um inteiro positivo');
    }
    return { type: 'idle', minutes: trigger.minutes };
  }
  throw new TypeError('trigger.type deve ser time, start ou idle');
}

function normalizeLastRun(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('lastRun deve ser uma data válida ou null');
  return date.toISOString();
}

function localScheduledTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function localDateKey(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function lastRunDate(routine) {
  return routine.lastRun ? new Date(routine.lastRun) : null;
}

function copyRoutine(routine) {
  return { ...routine, trigger: { ...routine.trigger } };
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('O relógio devolveu uma data inválida');
  return date;
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `rotina-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
