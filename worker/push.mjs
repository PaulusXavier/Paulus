// Avisos com o app fechado (Web Push). Veja docs/PUSH.md.
//
// Como funciona, em uma frase: o app (agenda.js) entrega ao Worker uma lista de "avisos" (hora + texto CRIPTOGRAFADO com uma chave que só existe no
// aparelho); na hora certa o Worker manda o aviso ao serviço de push do navegador; o service worker (sw.js) do aparelho decifra e mostra.
//   - O Worker e o armazenamento dele NUNCA veem o texto das anotações: só a hora, um código (hash) e um bloco cifrado.
//   - A hora certa vem de um alarme do Durable Object (sem cron, sem consulta a cada minuto): um objeto por usuário, em SQLite.
//   - Sem VAPID_PUBLICA e VAPID_PRIVADA o recurso fica desligado e nada muda no resto do Worker.
//
// Este arquivo só usa WebCrypto e fetch (roda no Worker e no Node dos testes). A classe do Durable Object está no fim.

const codificador = new TextEncoder();

export const LIMITES = { assinaturas: 5, itensPorAparelho: 300, blob: 2000, diasAFrente: 15, atrasoMaxMs: 6 * 3600000, porAlarme: 40, tentativas: 3 };

export function emB64u(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64u(t) {
  const s = String(t || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const junta = (...partes) => { const n = partes.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let i = 0; for (const p of partes) { o.set(p, i); i += p.length; } return o; };

export function pushLigado(env) {
  return !!(env && env.PUSH && typeof env.PUSH.idFromName === 'function' && texto(env.VAPID_PUBLICA) && texto(env.VAPID_PRIVADA));
}

// Só serviços de push conhecidos (o Worker faz um POST para o endereço guardado; nunca para um endereço qualquer).
const SERVICOS_PUSH = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function endpointValido(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !x.username && !x.password && String(u).length <= 600 && SERVICOS_PUSH.some((r) => r.test(x.hostname));
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- VAPID (RFC 8292)
let chaveVapidCache = null, chaveVapidTexto = '';
async function chaveVapid(env) {
  const bruto = texto(env.VAPID_PRIVADA);
  if (chaveVapidCache && chaveVapidTexto === bruto) return chaveVapidCache;
  const jwk = JSON.parse(bruto);
  chaveVapidCache = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  chaveVapidTexto = bruto;
  return chaveVapidCache;
}
export async function cabecalhoVapid(env, endpoint, agoraMs) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor((agoraMs || Date.now()) / 1000) + 12 * 3600;
  const cab = emB64u(codificador.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const carga = emB64u(codificador.encode(JSON.stringify({ aud: aud, exp: exp, sub: texto(env.VAPID_CONTATO) || 'mailto:paulus@example.org' })));
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chaveVapid(env), codificador.encode(cab + '.' + carga));
  return 'vapid t=' + cab + '.' + carga + '.' + emB64u(assinatura) + ', k=' + texto(env.VAPID_PUBLICA);
}

// ---------------------------------------------------------------- criptografia da mensagem (RFC 8291, aes128gcm)
async function hkdf(sal, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info: info }, k, bytes * 8));
}
// opcoes (só para teste): { par: CryptoKeyPair efêmero, sal: Uint8Array(16) }
export async function cifrarParaAparelho(dados, p256dhB64u, authB64u, opcoes) {
  const o = opcoes || {};
  const uaPublica = deB64u(p256dhB64u), segredoAuth = deB64u(authB64u);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4 || segredoAuth.length !== 16) throw new Error('Chaves do aparelho inválidas.');
  const par = o.par || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaChave = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, par.privateKey, 256));
  const ikm = await hkdf(segredoAuth, compartilhado, junta(codificador.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = o.sal || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, codificador.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode('Content-Encoding: nonce\0'), 12);
  const claro = junta(dados instanceof Uint8Array ? dados : codificador.encode(String(dados)), new Uint8Array([2]));   // 0x02: último (e único) registro
  if (claro.length > 4096 - 17) throw new Error('Mensagem grande demais para um aviso.');
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, claro));
  const cab = new Uint8Array(21); cab.set(sal, 0); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = asPublica.length;
  return junta(cab, asPublica, cifrado);
}

// Envia um aviso. Devolve o status HTTP do serviço de push (201 = aceito; 404/410 = assinatura morta).
export async function enviarPush(env, assinatura, dados, opcoes) {
  const o = opcoes || {};
  const corpo = await cifrarParaAparelho(dados, assinatura.p256dh, assinatura.auth);
  const buscar = o.buscar || fetch;
  const resp = await buscar(assinatura.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await cabecalhoVapid(env, assinatura.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(o.ttl || 3600),
      'Urgency': 'high'
    },
    body: corpo
  });
  try { await resp.arrayBuffer(); } catch (e) { /* corpo da resposta não importa */ }
  return resp.status;
}

// ---------------------------------------------------------------- validação dos pedidos do app
export function validarAssinatura(d) {
  if (!d || typeof d !== 'object' || !endpointValido(d.endpoint)) return null;
  try { if (deB64u(d.p256dh).length !== 65 || deB64u(d.auth).length !== 16) return null; } catch (e) { return null; }
  return { endpoint: String(d.endpoint), p256dh: String(d.p256dh), auth: String(d.auth) };
}
export function validarItens(lista, agora) {
  if (!Array.isArray(lista)) return null;
  const teto = agora + LIMITES.diasAFrente * 86400000;
  const out = [], vistos = new Set();
  for (const it of lista.slice(0, LIMITES.itensPorAparelho)) {
    if (!it || typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(it.id) || vistos.has(it.id)) continue;
    if (typeof it.at !== 'number' || !isFinite(it.at) || it.at < agora - 60000 || it.at > teto) continue;
    if (typeof it.blob !== 'string' || !it.blob || it.blob.length > LIMITES.blob || !/^[A-Za-z0-9_-]+$/.test(it.blob)) continue;
    vistos.add(it.id); out.push({ id: it.id, at: Math.round(it.at), blob: it.blob });
  }
  return out;
}

// Rotas /push/* (já autenticadas pelo handler). usuario = identificação da sessão; um Durable Object por usuário.
export async function tratarPush(request, env, json, usuario, rota) {
  if (rota === '/push/chave') return pushLigado(env) ? json({ ligado: true, chave: texto(env.VAPID_PUBLICA) }) : json({ ligado: false, erro: 'Avisos com o app fechado não estão ligados neste Worker (docs/PUSH.md).' });
  if (!pushLigado(env)) return json({ ligado: false, erro: 'Avisos com o app fechado não estão ligados neste Worker (docs/PUSH.md).' }, 404);
  if (!usuario) return json({ erro: 'Entre para usar os avisos com o app fechado.' }, 401);
  const cru = await request.text();
  if (cru.length > 700000) return json({ erro: 'Pedido grande demais.' }, 413);
  let d; try { d = JSON.parse(cru || '{}'); } catch (e) { return json({ erro: 'JSON inválido.' }, 400); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return json({ erro: 'JSON inválido.' }, 400);
  const agora = Date.now();
  let corpo;
  if (rota === '/push/assinar') {
    const a = validarAssinatura(d);
    if (!a) return json({ erro: 'Assinatura de aviso inválida.' }, 400);
    corpo = a;
  } else if (rota === '/push/agendar') {
    if (typeof d.id !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(d.id)) return json({ erro: 'Aparelho inválido.' }, 400);
    const itens = validarItens(d.itens, agora);
    if (!itens) return json({ erro: 'Lista de avisos inválida.' }, 400);
    corpo = { id: d.id, itens: itens, somar: d.somar === true };
  } else if (rota === '/push/cancelar' || rota === '/push/estado') {
    if (typeof d.id !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(d.id)) return json({ erro: 'Aparelho inválido.' }, 400);
    corpo = { id: d.id };
  } else return json({ erro: 'Rota não encontrada.' }, 404);
  const alvo = env.PUSH.get(env.PUSH.idFromName('u:' + String(usuario).slice(0, 200)));
  const r = await alvo.fetch('https://push.interno' + rota.slice(5), { method: 'POST', body: JSON.stringify(corpo) });
  let saida; try { saida = await r.json(); } catch (e) { saida = {}; }
  return json(saida, r.status);
}

// ---------------------------------------------------------------- Durable Object (SQLite): assinaturas + avisos + alarme
export class PaulusPush {
  constructor(state, env) {
    this.state = state; this.env = env; this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, criado INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS itens (sub TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, blob TEXT NOT NULL, tent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (sub, id))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS itens_at ON itens (at)');
  }

  async idDoEndpoint(endpoint) { return emB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', codificador.encode(endpoint)))).slice(0, 22); }

  async fetch(request) {
    const rota = new URL(request.url).pathname;
    let d = {}; try { d = JSON.parse(await request.text() || '{}'); } catch (e) { /* vazio */ }
    const resp = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    if (rota === '/assinar') {
      const id = await this.idDoEndpoint(d.endpoint), agora = Date.now();
      this.sql.exec('INSERT INTO subs (id, endpoint, p256dh, auth, criado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth', id, d.endpoint, d.p256dh, d.auth, agora);
      const antigas = this.sql.exec('SELECT id FROM subs ORDER BY criado DESC LIMIT -1 OFFSET ?', LIMITES.assinaturas).toArray();
      for (const a of antigas) { this.sql.exec('DELETE FROM itens WHERE sub = ?', a.id); this.sql.exec('DELETE FROM subs WHERE id = ?', a.id); }
      return resp({ ok: true, id: id });
    }
    if (rota === '/agendar') {
      const s = this.sql.exec('SELECT id FROM subs WHERE id = ?', d.id).toArray();
      if (!s.length) return resp({ erro: 'sem-assinatura' }, 404);
      if (!d.somar) this.sql.exec("DELETE FROM itens WHERE sub = ? AND id NOT LIKE 'teste%'", d.id);
      for (const it of d.itens || []) this.sql.exec('INSERT OR REPLACE INTO itens (sub, id, at, blob, tent) VALUES (?, ?, ?, ?, 0)', d.id, it.id, it.at, it.blob);
      await this.reprogramar();
      return resp({ ok: true, n: (d.itens || []).length });
    }
    if (rota === '/cancelar') {
      this.sql.exec('DELETE FROM itens WHERE sub = ?', d.id); this.sql.exec('DELETE FROM subs WHERE id = ?', d.id);
      await this.reprogramar();
      return resp({ ok: true });
    }
    if (rota === '/estado') {
      const s = this.sql.exec('SELECT id FROM subs WHERE id = ?', d.id).toArray();
      const n = s.length ? this.sql.exec('SELECT COUNT(*) AS n FROM itens WHERE sub = ?', d.id).toArray()[0].n : 0;
      return resp({ ativo: s.length > 0, pendentes: n });
    }
    return resp({ erro: 'Rota não encontrada.' }, 404);
  }

  // Programa o alarme para o próximo aviso (ou apaga o alarme se não há nenhum).
  async reprogramar(depoisDe) {
    const p = this.sql.exec('SELECT MIN(at) AS t FROM itens').toArray()[0];
    if (!p || p.t == null) { await this.state.storage.deleteAlarm(); return; }
    await this.state.storage.setAlarm(Math.max(p.t, depoisDe || 0, Date.now() + 300));
  }

  async alarm() {
    const agora = Date.now();
    this.sql.exec('DELETE FROM itens WHERE at < ?', agora - LIMITES.atrasoMaxMs);
    const devidos = this.sql.exec('SELECT sub, id, blob, tent FROM itens WHERE at <= ? ORDER BY at LIMIT ?', agora, LIMITES.porAlarme).toArray();
    let repetir = false;
    for (const it of devidos) {
      const s = this.sql.exec('SELECT endpoint, p256dh, auth FROM subs WHERE id = ?', it.sub).toArray()[0];
      if (!s) { this.sql.exec('DELETE FROM itens WHERE sub = ? AND id = ?', it.sub, it.id); continue; }
      let status = 0;
      try { status = await enviarPush(this.env, s, it.blob); } catch (e) { status = 0; }
      if (status >= 200 && status < 300) this.sql.exec('DELETE FROM itens WHERE sub = ? AND id = ?', it.sub, it.id);
      else if (status === 404 || status === 410) { this.sql.exec('DELETE FROM itens WHERE sub = ?', it.sub); this.sql.exec('DELETE FROM subs WHERE id = ?', it.sub); }
      else if (it.tent + 1 >= LIMITES.tentativas) this.sql.exec('DELETE FROM itens WHERE sub = ? AND id = ?', it.sub, it.id);
      else { this.sql.exec('UPDATE itens SET tent = tent + 1 WHERE sub = ? AND id = ?', it.sub, it.id); repetir = true; }
    }
    if (devidos.length >= LIMITES.porAlarme) repetir = true;
    await this.reprogramar(repetir ? Date.now() + 30000 : 0);
  }
}
