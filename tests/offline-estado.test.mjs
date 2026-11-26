// Uso sem internet (v0.27.0): aviso de mudança de estado da IA, fila de perguntas que só a base respondeu e service worker com espera limitada.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { montarBase } from '../scripts/build-knowledge.mjs';
import { juntar } from '../scripts/build.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const base = montarBase();
const ORIGEM = 'https://paulusxavier.github.io';
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';
const semEspera = { minIntervaloMs: 0 };
const PERGUNTA = 'Quem gere o Cadastro Único no município?';

function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}
function rede(estado) {
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { return { response: 'A gestão do Cadastro Único cabe ao município.' }; } } };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => {
    estado.saiu++;
    if (estado.caida) throw new TypeError('Failed to fetch');
    return manipular(new Request(url, { method: init.method, headers: Object.assign({}, init.headers, { Origin: ORIGEM, 'CF-Connecting-IP': '7.7.7.7' }), body: init.body }), env);
  };
}
function novo(e) {
  const P = carregar(rede(e));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, memoria: false }, semEspera));
  return P;
}

test('offline: ia.aoMudar avisa quando a IA cai e quando volta, e só quando o estado muda de verdade', async () => {
  const e = { saiu: 0, caida: false };
  const P = novo(e);
  const avisos = [];
  const parar = P.ia.aoMudar(x => avisos.push(x));
  await P.perguntar(PERGUNTA);                         // IA responde: nada mudou, nenhum aviso
  assert.equal(avisos.length, 0);
  e.caida = true;
  await P.perguntar('E quem coordena o CRAS?');        // cai: avisa
  assert.ok(avisos.length >= 1);
  assert.equal(avisos[0].motivo, 'rede');
  assert.equal(avisos[0].pausada, true);
  assert.equal(avisos[avisos.length - 1].pendentes, 1);
  const n = avisos.length;
  P.ia.retomar();                                      // volta: avisa de novo
  assert.ok(avisos.length > n);
  assert.equal(avisos[avisos.length - 1].motivo, '');
  parar();
  const m = avisos.length;
  e.caida = false;
  P.ia.retomar();
  e.caida = true;
  await P.perguntar('Outra pergunta sobre o CRAS');
  assert.equal(avisos.length, m, 'depois de cancelar, nada chega');
});

test('offline: ouvinte que dá erro não derruba o app nem os outros ouvintes', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  const ok = [];
  P.ia.aoMudar(() => { throw new Error('app com defeito'); });
  P.ia.aoMudar(x => ok.push(x));
  const r = await P.perguntar(PERGUNTA);
  assert.equal(r.tipo, 'norma');
  assert.ok(ok.length >= 1);
  assert.equal(typeof P.ia.aoMudar('não é função'), 'function');
});

test('offline: pergunta respondida só pela base fica pendente (sem repetir, no máximo 5) e é marcada', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  const r = await P.perguntar(PERGUNTA);
  assert.equal(r.tipo, 'norma');
  assert.equal(r.pendente, true);
  assert.equal(JSON.stringify(Array.from(P.ia.pendentes()).map(p => p.pergunta)), JSON.stringify([PERGUNTA]));
  await P.perguntar(PERGUNTA);                         // a mesma pergunta não duplica
  assert.equal(P.ia.pendentes().length, 1);
  const outras = ['Como funciona o BPC?', 'O que é o PAIF?', 'Quem pode receber o Bolsa Família?', 'O que faz o CREAS?', 'O que é o CadÚnico?'];
  for (const q of outras) await P.perguntar(q);
  const lista = P.ia.pendentes();
  assert.ok(lista.length <= 5);
  assert.ok(!lista.some(p => p.pergunta === PERGUNTA), 'a mais antiga saiu quando passou de 5');
});

test('offline: cumprimento e dado pessoal não viram pendência', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  await P.perguntar('oi');
  await P.perguntar('Atendi a Maria da Silva Santos, CPF 123.456.789-09');
  assert.equal(P.ia.pendentes().length, 0);
});

test('offline: refazerPendentes pede de novo com a IA quando ela volta e esvazia a fila', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  await P.perguntar(PERGUNTA);
  await P.perguntar('Como funciona o BPC?');
  assert.equal(P.ia.pendentes().length, 2);
  // ainda sem IA: não tenta e não perde a fila
  const antes = e.saiu;
  assert.equal((await P.ia.refazerPendentes()).length, 0);
  assert.equal(e.saiu, antes);
  assert.equal(P.ia.pendentes().length, 2);
  // a IA volta
  e.caida = false;
  P.ia.retomar();
  const feitas = await P.ia.refazerPendentes();
  assert.equal(feitas.length, 2);
  assert.equal(feitas[0].pergunta, PERGUNTA);
  assert.equal(feitas[0].resposta.tipo, 'ia');
  assert.equal(P.ia.pendentes().length, 0);
});

test('offline: refazerPendentes para quando a IA cai de novo e não perde a pergunta', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  await P.perguntar(PERGUNTA);
  e.caida = false; P.ia.retomar();
  const original = e.caida;
  e.caida = true;                                      // cai logo no primeiro pedido
  const feitas = await P.ia.refazerPendentes();
  assert.equal(original, false);
  assert.equal(feitas.length, 0);
  assert.equal(P.ia.pendentes().length, 1, 'a pergunta voltou para a fila');
});

test('offline: responder com a IA tira a pergunta da fila, e nova conversa esvazia a fila', async () => {
  const e = { saiu: 0, caida: true };
  const P = novo(e);
  await P.perguntar(PERGUNTA);
  assert.equal(P.ia.pendentes().length, 1);
  e.caida = false; P.ia.retomar();
  const r = await P.perguntar(PERGUNTA);
  assert.equal(r.tipo, 'ia');
  assert.equal(P.ia.pendentes().length, 0);
  e.caida = true;
  await P.perguntar('Como funciona o BPC?');
  assert.equal(P.ia.pendentes().length, 1);
  P.limpar();
  assert.equal(P.ia.pendentes().length, 0);
});

// ------------------------------------------------------------ service worker
function carregarSW(opcoes) {
  const o = opcoes || {};
  const ouvintes = {}, arm = new Map(), puts = [], timers = [];
  const chave = (u, ignorar) => ignorar ? String(u).split('?')[0] : String(u);
  const caches = {
    match: async (req, op) => {
      const u = typeof req === 'string' ? req : req.url;
      const alvo = chave(u, op && op.ignoreSearch);
      for (const [k, v] of arm) if (chave(k, op && op.ignoreSearch) === alvo) return v;
      for (const [k, v] of arm) if (k.endsWith('/' + u) || k === u) return v;
      return undefined;
    },
    open: async () => ({ put: async (r, v) => { puts.push(r.url); }, addAll: async () => {}, add: async () => {} }),
    keys: async () => [], delete: async () => true
  };
  const sandbox = {
    self: { addEventListener: (n, f) => { ouvintes[n] = f; }, skipWaiting() {}, clients: { claim() {} } },
    location: { origin: 'https://site.test' }, caches, URL, Response,
    fetch: o.fetch,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].f = null; }
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), sandbox);
  const pedir = (url, modo) => { const ev = { request: { method: 'GET', url, mode: modo || 'cors' }, resposta: null, respondWith(p) { this.resposta = p; } }; ouvintes.fetch(ev); return ev; };
  const disparar = () => timers.filter(t => t.f && t.ms >= 1000).forEach(t => { const f = t.f; t.f = null; f(); });
  return { arm, puts, pedir, disparar };
}
const res = (txt) => ({ ok: true, type: 'basic', txt, clone() { return this; } });

test('service worker: rede boa devolve a rede e guarda cópia; outro domínio nem passa por ele', async () => {
  const sw = carregarSW({ fetch: async () => res('rede') });
  const ev = sw.pedir('https://site.test/console.js');
  assert.equal((await ev.resposta).txt, 'rede');
  await new Promise(r => setTimeout(r, 10));            // a cópia é gravada logo depois de comparar com a guardada
  assert.deepEqual(sw.puts, ['https://site.test/console.js']);
  assert.equal(sw.pedir('https://outro.test/x.js').resposta, null);
});

test('service worker: sem internet usa a cópia, mesmo que o endereço venha com ?v=', async () => {
  const sw = carregarSW({ fetch: async () => { throw new TypeError('offline'); } });
  sw.arm.set('https://site.test/console.js', res('copia'));
  const ev = sw.pedir('https://site.test/console.js?v=abc123');
  assert.equal((await ev.resposta).txt, 'copia');
});

test('service worker: rede que não anda usa a cópia depois do tempo limite; sem cópia, espera a rede', async () => {
  let soltar;
  const trava = () => new Promise(r => { soltar = r; });
  const sw = carregarSW({ fetch: trava });
  sw.arm.set('https://site.test/conhecimento.json', res('copia'));
  const ev = sw.pedir('https://site.test/conhecimento.json');
  sw.disparar();
  assert.equal((await ev.resposta).txt, 'copia');
  soltar(res('tarde'));                                // a rede responde depois: sem erro solto

  const sw2 = carregarSW({ fetch: trava });
  const ev2 = sw2.pedir('https://site.test/novo.json');
  sw2.disparar();                                      // o tempo passa, mas não há cópia
  soltar(res('rede-lenta'));
  assert.equal((await ev2.resposta).txt, 'rede-lenta');
});

test('service worker: navegação sem internet abre o index guardado; sem nada, falha de forma limpa', async () => {
  const sw = carregarSW({ fetch: async () => { throw new TypeError('offline'); } });
  sw.arm.set('index.html', res('index'));
  const ev = sw.pedir('https://site.test/qualquer-coisa', 'navigate');
  assert.equal((await ev.resposta).txt, 'index');
  const vazio = carregarSW({ fetch: async () => { throw new TypeError('offline'); } });
  const r = await vazio.pedir('https://site.test/x.png').resposta;
  assert.equal(r.type, 'error');
});

test('service worker: a instalação guarda a base inteira (sem baixar de novo os pacotes, que são as mesmas metades) e o leitor de PDF para a primeira vez sem internet', () => {
  const t = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of ['conhecimento.json', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf-lib.min.js', 'lugares-boa-vista.json']) assert.ok(t.includes("'" + f + "'"), f);
  assert.match(t, /var V = '[^']*';/, 'o build troca o nome do cache por essa linha');
});
