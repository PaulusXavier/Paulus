// Login do Worker (opcional). Só existe com AUTH_SEGREDO e USUARIOS configurados; sem eles o Worker segue aberto.
//
//   AUTH_SEGREDO  texto aleatório (>= 16 caracteres) que assina as sessões:  node scripts/criar-usuario.mjs --segredo
//   USUARIOS      JSON  {"paulo":"pbkdf2$100000$<sal>$<hash>"}  (várias contas):  node scripts/criar-usuario.mjs paulo
//
// Só usa WebCrypto (crypto.subtle), que existe no Cloudflare Workers e no Node 20+. Nada é gravado: a sessão é um
// token assinado (HMAC-SHA256) que carrega usuário e validade; remover a conta de USUARIOS ou trocar o segredo derruba a sessão.

export const MAX_SENHA = 200;
export const MAX_USUARIO = 40;
export const ITERACOES = 100000;            // o Workers aceita no máximo 100000 em PBKDF2
export const SESSAO_CURTA_MS = 12 * 60 * 60 * 1000;
export const SESSAO_LONGA_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SEGREDO = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();

function paraB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(txt) {
  if (typeof txt !== 'string' || !/^[A-Za-z0-9_-]*$/.test(txt)) return null;
  try {
    const s = atob(txt.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((txt.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}
function igualConstante(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export function normalizarUsuario(u) {
  return String(u == null ? '' : u).normalize('NFC').trim().toLowerCase();
}

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(String(senha).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256));
}

// "pbkdf2$100000$<sal em base64url>$<hash em base64url>"
export async function criarHashDeSenha(senha, iteracoes) {
  const n = iteracoes || ITERACOES;
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return 'pbkdf2$' + n + '$' + paraB64url(sal) + '$' + paraB64url(await derivar(senha, sal, n));
}

async function conferirSenha(senha, registro) {
  const p = String(registro || '').split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  const n = Number(p[1]);
  if (!Number.isInteger(n) || n < 1000 || n > ITERACOES) return false;
  const sal = deB64url(p[2]), esperado = deB64url(p[3]);
  if (!sal || !sal.length || !esperado || !esperado.length) return false;
  return igualConstante(await derivar(senha, sal, n), esperado);
}

// Lê USUARIOS (JSON texto ou objeto) e devolve { nomeNormalizado: registro }.
export function lerUsuarios(env) {
  let o = env && env.USUARIOS;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return {}; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = Object.create(null);
  for (const k of Object.keys(o)) if (typeof o[k] === 'string') out[normalizarUsuario(k)] = o[k];
  return out;
}

function segredoDe(env) {
  const s = env && env.AUTH_SEGREDO;
  return typeof s === 'string' && s.length >= MIN_SEGREDO ? s : null;
}

export function loginLigado(env) {
  return !!segredoDe(env) && Object.keys(lerUsuarios(env)).length > 0;
}

const HASH_FALSO = 'pbkdf2$' + ITERACOES + '$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Confere usuário e senha. Devolve o nome da conta ou null. Conta inexistente gasta o mesmo tempo de uma existente.
export async function entrar(env, usuario, senha) {
  const nome = normalizarUsuario(usuario);
  const contas = lerUsuarios(env);
  const registro = Object.prototype.hasOwnProperty.call(contas, nome) ? contas[nome] : null;
  if (typeof senha !== 'string' || !nome || nome.length > MAX_USUARIO || senha.length > MAX_SENHA) { await conferirSenha('x', HASH_FALSO); return null; }
  const certo = await conferirSenha(senha, registro || HASH_FALSO);
  return registro && certo ? nome : null;
}

async function chaveHmac(env, usos) {
  return crypto.subtle.importKey('raw', enc.encode(segredoDe(env) || ''), { name: 'HMAC', hash: 'SHA-256' }, false, usos);
}

export async function criarSessao(env, conta, opcoes) {
  const agora = Date.now();
  const expira = agora + (opcoes && opcoes.lembrar ? SESSAO_LONGA_MS : SESSAO_CURTA_MS);
  const carga = paraB64url(enc.encode(JSON.stringify({ u: conta, e: expira })));
  const ass = new Uint8Array(await crypto.subtle.sign('HMAC', await chaveHmac(env, ['sign']), enc.encode(carga)));
  return { token: carga + '.' + paraB64url(ass), usuario: conta, expira: expira };
}

// Devolve { usuario, expira } se o token é verdadeiro, não venceu e a conta ainda existe em USUARIOS; senão null.
export async function verificarSessao(env, token) {
  if (!segredoDe(env) || typeof token !== 'string' || token.length > 600) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const ass = deB64url(partes[1]);
  if (!ass) return null;
  let valido = false;
  try { valido = await crypto.subtle.verify('HMAC', await chaveHmac(env, ['verify']), ass, enc.encode(partes[0])); } catch (e) { return null; }
  if (!valido) return null;
  const bruto = deB64url(partes[0]);
  if (!bruto) return null;
  let d;
  try { d = JSON.parse(dec.decode(bruto)); } catch (e) { return null; }
  if (!d || typeof d.u !== 'string' || typeof d.e !== 'number' || d.e <= Date.now()) return null;
  const contas = lerUsuarios(env);
  if (!Object.prototype.hasOwnProperty.call(contas, d.u)) return null;
  return { usuario: d.u, expira: d.e };
}

export function tokenDoPedido(request) {
  const h = request && request.headers && request.headers.get ? (request.headers.get('Authorization') || '') : '';
  const m = /^Bearer\s+([A-Za-z0-9_.-]+)\s*$/i.exec(h);
  return m ? m[1] : '';
}

// Freio de tentativas por IP + usuário: 5 erros seguidos bloqueiam por 30 s, dobrando a cada erro novo (até 15 min).
export function criarFreio(opcoes) {
  const o = Object.assign({ limite: 5, base: 30000, teto: 15 * 60000, esquecerApos: 60 * 60000, max: 2000 }, opcoes || {});
  const mapa = new Map();
  const chave = (ip, nome) => String(ip) + '|' + nome;
  function limpar(agora) {
    if (mapa.size <= o.max) return;
    for (const [k, v] of mapa) if (agora - v.ultimo > o.esquecerApos && agora >= v.ate) mapa.delete(k);
    while (mapa.size > o.max) mapa.delete(mapa.keys().next().value);
  }
  return {
    espera(ip, nome) { const v = mapa.get(chave(ip, nome)); return v ? Math.max(0, v.ate - Date.now()) : 0; },
    errou(ip, nome) {
      const agora = Date.now(), k = chave(ip, nome);
      let v = mapa.get(k);
      if (!v || agora - v.ultimo > o.esquecerApos) v = { erros: 0, ate: 0, ultimo: agora };
      v.erros++; v.ultimo = agora;
      if (v.erros >= o.limite) v.ate = agora + Math.min(o.teto, o.base * Math.pow(2, v.erros - o.limite));
      mapa.set(k, v); limpar(agora);
    },
    acertou(ip, nome) { mapa.delete(chave(ip, nome)); }
  };
}
