/* Paulus — ponte das ROTAS SALVAS do "Mapa e rotas" com o Firestore do projeto do Paulus (users/{uid}/rotas/{id}).
 * Usa o MESMO login do console: o ID token do Firebase Authentication (window.PaulusSessao) vai como Bearer na API REST do Firestore,
 * sem biblioteca. Só guarda nome, partida fixa, paradas, destino e horários; nunca a posição do aparelho, nome de pessoa, NIS ou CPF.
 * Sem internet: a gravação fica numa fila local (por conta) e sobe sozinha quando a conexão volta. A lista é reconferida a cada 20 s. */
(function (raiz) {
  'use strict';
  const PROJETO = 'paulusia-de285';
  const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJETO + '/databases/(default)/documents';
  const ouvintes = new Set();
  let lista = [], erro = null, uid = '', token = '', vigia = null, timer = 0, ocupado = false;

  const ls = {
    ler(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } },
    gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: tudo bem */ } }
  };
  const kFila = () => 'paulusRotasFila:' + uid, kCache = () => 'paulusRotasCache:' + uid;

  // ---- codificação Firestore (valores tipados) ----
  function cod(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(cod) } };
    const f = {}; Object.keys(v).forEach((k) => { if (v[k] !== undefined) f[k] = cod(v[k]); });
    return { mapValue: { fields: f } };
  }
  function dec(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return +v.integerValue;
    if ('doubleValue' in v) return +v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; Object.keys(f).forEach((k) => { o[k] = dec(f[k]); }); return o; }
    return null;
  }
  const doc = (d) => { const o = dec({ mapValue: { fields: d.fields || {} } }); o.id = String(d.name || '').split('/').pop(); return o; };

  // ---- sessão do console ----
  function sessao() { return raiz.PaulusSessao || null; }
  function uidDoToken(t) {
    try { const p = JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return String(p.user_id || p.sub || ''); } catch (e) { return ''; }
  }
  const logado = () => !!(sessao() && sessao().firebase && token && uid);
  async function renovarToken() {
    const S = sessao(); let t = '';
    if (S && S.firebase && S.token) { try { t = String(await (typeof S.token === 'function' ? S.token() : S.token) || ''); } catch (e) { t = ''; } }
    token = t;
    const novo = t ? uidDoToken(t) : '';
    if (novo !== uid) { uid = novo; lista = uid ? ls.ler(kCache(), []) : []; erro = null; emitir(); }
    return t;
  }
  function emitir() { ouvintes.forEach((f) => { try { f(lista.slice(), erro); } catch (e) { /* ouvinte com defeito não derruba os outros */ } }); }

  async function chamar(metodo, caminho, corpo) {
    const t = await renovarToken();
    if (!t) throw new Error('Entre na sua conta para usar as rotas salvas.');
    const r = await fetch(BASE + caminho, { method: metodo, headers: Object.assign({ Authorization: 'Bearer ' + t }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
    if (!r.ok) {
      let msg = ''; try { msg = (await r.json()).error.status || ''; } catch (e) { /* sem corpo */ }
      const e = new Error(r.status === 403 || msg === 'PERMISSION_DENIED' ? 'O Firebase recusou o acesso às rotas (regras do Firestore: veja docs/ROTAS-FIREBASE.md).' : r.status === 401 ? 'Sua sessão venceu. Entre de novo.' : 'Falha ao falar com o Firebase (' + r.status + ').');
      e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  const rotaPath = (id) => '/users/' + encodeURIComponent(uid) + '/rotas/' + encodeURIComponent(id);

  // ---- fila de gravações pendentes (offline) ----
  const fila = () => ls.ler(kFila(), []);
  async function enviarFila() {
    if (ocupado || !logado()) return; ocupado = true;
    try {
      let f = fila();
      while (f.length) {
        const it = f[0];
        try {
          if (it.op === 'del') await chamar('DELETE', rotaPath(it.id));
          else { const fields = {}; Object.keys(it.dados).forEach((k) => { fields[k] = cod(it.dados[k]); }); await chamar('PATCH', rotaPath(it.id), { fields }); }
        } catch (e) { if (!e.status) throw e; if (e.status === 401 || e.status === 403) throw e; /* dado recusado: descarta para não travar a fila */ }
        f = fila().slice(1); ls.gravar(kFila(), f);
      }
    } finally { ocupado = false; }
  }
  async function atualizar() {
    if (!logado()) return;
    try {
      await enviarFila();
      const pend = new Set(fila().map((x) => x.id));
      let proximo = '', todas = [];
      do {
        const j = await chamar('GET', '/users/' + encodeURIComponent(uid) + '/rotas?pageSize=100' + (proximo ? '&pageToken=' + encodeURIComponent(proximo) : ''));
        (j.documents || []).forEach((d) => todas.push(doc(d))); proximo = j.nextPageToken || '';
      } while (proximo && todas.length < 300);
      // o que ainda está na fila local aparece como "pendente" (e as apagadas pendentes não voltam)
      fila().forEach((it) => { if (it.op === 'del') todas = todas.filter((x) => x.id !== it.id); else { const i = todas.findIndex((x) => x.id === it.id); const d = Object.assign({ id: it.id }, it.dados); if (i >= 0) todas[i] = d; else todas.push(d); } });
      todas.forEach((x) => { x.pendente = pend.has(x.id); });
      lista = todas.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0)); erro = null;
      ls.gravar(kCache(), lista.filter((x) => !x.pendente)); emitir();
    } catch (e) { if (e && e.status) { erro = e; emitir(); } /* sem rede: mantém o que já tem */ }
  }
  const agendar = (ms) => { clearTimeout(timer); timer = setTimeout(() => atualizar().finally(() => agendar(20000)), ms); };

  const api = {
    logado,
    lista: () => lista.slice(),
    observar(fn) { ouvintes.add(fn); try { fn(lista.slice(), erro); } catch (e) { /* ok */ } if (!timer) { renovarToken().then(() => agendar(0)); } return () => ouvintes.delete(fn); },
    // devolve { id, pronto }: "pronto" só resolve quando o Firebase confirma; sem internet fica na fila e sobe depois
    salvar(dados, id) {
      if (!logado()) throw new Error('Entre na sua conta para salvar rotas.');
      const rid = id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const f = fila().filter((x) => x.id !== rid); f.push({ op: 'set', id: rid, dados }); ls.gravar(kFila(), f);
      lista = [Object.assign({ id: rid, pendente: true }, dados)].concat(lista.filter((x) => x.id !== rid)); emitir();
      // sem internet "pronto" fica pendente (o mapa avisa que guardou neste aparelho); recusa do Firebase rejeita
      const pronto = new Promise((ok, falha) => {
        const t = () => { if (erro && (erro.status === 401 || erro.status === 403)) falha(erro); else if (fila().some((x) => x.id === rid)) setTimeout(t, 2000); else ok(); };
        atualizar().then(t);
      });
      return { id: rid, pronto };
    },
    apagar(id) {
      if (!logado()) throw new Error('Entre na sua conta para apagar rotas.');
      const f = fila().filter((x) => x.id !== id); f.push({ op: 'del', id }); ls.gravar(kFila(), f);
      lista = lista.filter((x) => x.id !== id); emitir();
      return atualizar();
    },
    limpar() { lista = []; erro = null; emitir(); },
    _teste: { cod, dec, uidDoToken }
  };
  raiz.__paulusRotas = api;
  // acompanha entrada/saída de conta e a volta da internet
  let tinha = false;
  vigia = setInterval(async () => {
    const antes = uid; await renovarToken();
    if (!logado()) { if (tinha) { tinha = false; api.limpar(); } return; }
    if (!tinha || antes !== uid) { tinha = true; try { raiz.dispatchEvent(new Event('paulus:auth')); } catch (e) { /* ok */ } if (ouvintes.size) agendar(0); }
  }, 4000);
  raiz.addEventListener('online', () => { if (ouvintes.size) agendar(0); });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
