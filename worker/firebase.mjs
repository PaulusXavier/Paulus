// Login pelo Firebase Authentication (opcional). Só existe com FIREBASE_PROJECT_ID configurado.
//
//   FIREBASE_PROJECT_ID  id do projeto Firebase (ex.: meu-projeto-123). Todos os apps precisam usar o MESMO projeto.
//   FIREBASE_EMAILS      (opcional) e-mails autorizados, separados por vírgula. Com a lista, só esses entram (e-mail verificado).
//   FIREBASE_DOMINIOS    (opcional) domínios de e-mail autorizados, separados por vírgula (ex.: prefeitura.gov.br).
//
// O app entra pelo Firebase (SDK ou API REST), recebe um "ID token" e o manda ao Paulus em
//   Authorization: Bearer <idToken>
// O Worker confere a assinatura (RS256, chaves públicas do Google), o projeto (aud/iss) e a validade. Nada é gravado.
// Só usa WebCrypto e fetch, que existem no Cloudflare Workers e no Node 20+.

const URL_CHAVES = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_TOKEN = 4096;
const FOLGA_S = 300;                 // diferença de relógio aceita
const CACHE_MS = 60 * 60 * 1000;     // chaves públicas do Google ficam 1 h na memória
const REBUSCA_MIN_MS = 60 * 1000;    // chave desconhecida: busca de novo, no máximo 1 vez por minuto

const dec = new TextDecoder();

function deB64url(txt) {
  if (typeof txt !== 'string' || !/^[A-Za-z0-9_-]+$/.test(txt)) return null;
  try {
    const s = atob(txt.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((txt.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}

function lerJson(txt) {
  const b = deB64url(txt);
  if (!b) return null;
  try { const o = JSON.parse(dec.decode(b)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
}

export function firebaseLigado(env) {
  return !!(env && typeof env.FIREBASE_PROJECT_ID === 'string' && /^[a-z0-9][a-z0-9.:_-]{2,60}$/i.test(env.FIREBASE_PROJECT_ID.trim()));
}

function lista(v) {
  return String(v || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

let cache = { chaves: null, ate: 0, tentou: 0 };
export function limparCacheFirebase() { cache = { chaves: null, ate: 0, tentou: 0 }; }

async function chavesDoGoogle(buscar, agora, forcar) {
  if (cache.chaves && agora < cache.ate && !forcar) return cache.chaves;
  if (forcar && agora - cache.tentou < REBUSCA_MIN_MS) return cache.chaves || [];
  cache.tentou = agora;
  try {
    const r = await buscar(URL_CHAVES);
    if (!r || !r.ok) return cache.chaves || [];
    const j = await r.json();
    if (j && Array.isArray(j.keys)) { cache = { chaves: j.keys, ate: agora + CACHE_MS, tentou: agora }; return cache.chaves; }
  } catch (e) { /* sem rede: usa o que já tinha */ }
  return cache.chaves || [];
}

// Devolve { usuario, uid, email, expira } se o token é do projeto, está assinado pelo Google e não venceu; senão null.
// opcoes (para teste): { buscar: fetch, agora: ms }
export async function verificarFirebase(env, token, opcoes) {
  if (!firebaseLigado(env) || typeof token !== 'string' || token.length > MAX_TOKEN) return null;
  const o = opcoes || {};
  const buscar = o.buscar || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!buscar) return null;
  const agora = typeof o.agora === 'number' ? o.agora : Date.now();
  const projeto = env.FIREBASE_PROJECT_ID.trim();
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const cab = lerJson(partes[0]);
  const carga = lerJson(partes[1]);
  const ass = deB64url(partes[2]);
  if (!cab || !carga || !ass || cab.alg !== 'RS256' || typeof cab.kid !== 'string' || cab.kid.length > 100) return null;

  let chaves = await chavesDoGoogle(buscar, agora, false);
  let jwk = chaves.find(function (k) { return k && k.kid === cab.kid; });
  if (!jwk) { chaves = await chavesDoGoogle(buscar, agora, true); jwk = chaves.find(function (k) { return k && k.kid === cab.kid; }); }
  if (!jwk) return null;
  let valido = false;
  try {
    const chave = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valido = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, ass, new TextEncoder().encode(partes[0] + '.' + partes[1]));
  } catch (e) { return null; }
  if (!valido) return null;

  const s = Math.floor(agora / 1000);
  if (carga.aud !== projeto || carga.iss !== 'https://securetoken.google.com/' + projeto) return null;
  if (typeof carga.sub !== 'string' || !carga.sub || carga.sub.length > 128) return null;
  if (typeof carga.exp !== 'number' || carga.exp <= s) return null;
  if (typeof carga.iat !== 'number' || carga.iat > s + FOLGA_S) return null;
  if (typeof carga.auth_time === 'number' && carga.auth_time > s + FOLGA_S) return null;

  const email = typeof carga.email === 'string' ? carga.email.trim().toLowerCase() : '';
  const emails = lista(env.FIREBASE_EMAILS), dominios = lista(env.FIREBASE_DOMINIOS);
  if (emails.length || dominios.length) {
    if (!email || carga.email_verified !== true) return null;
    const dom = email.slice(email.lastIndexOf('@') + 1);
    if (emails.indexOf(email) < 0 && dominios.indexOf(dom) < 0) return null;
  }
  return { usuario: email || carga.sub, uid: carga.sub, email: email, expira: carga.exp * 1000 };
}
