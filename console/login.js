// Tela de login do Console do Paulus.
// Fluxo: confere a sessão no Worker (/sessao) -> se não houver login ativo ou a sessão vale, abre o console;
// senão mostra a tela, envia usuário e senha a /login e guarda o token da sessão (a senha nunca é guardada).
// O console (console.js) só é carregado DEPOIS de entrar, e Paulus.init recebe o token e o aviso de sessão vencida.
(function () {
  'use strict';

  var KEY = 'paulus.sessao', USER = 'paulus.usuario', AVISO = 'paulus.aviso', BLOQ = 'paulus.bloqueio';
  var meta = document.querySelector('meta[name="paulus-endpoint"]');
  var EP = String((meta && meta.content) || window.PAULUS_ENDPOINT || '').replace(/\/+$/, '');
  // Login pelo Firebase (opcional): com <meta name="paulus-firebase-key" content="WEB_API_KEY"> o console entra com e-mail e senha
  // do Firebase Authentication (API REST, sem biblioteca) e manda o ID token ao Worker. A chave web do Firebase é pública por desenho.
  var metaFb = document.querySelector('meta[name="paulus-firebase-key"]');
  var FBKEY = String((metaFb && metaFb.content) || window.PAULUS_FIREBASE_KEY || '').trim();
  var FB = !!FBKEY;
  var $ = function (id) { return document.getElementById(id); };
  var sessao = null, bloqueioAte = 0, tick = 0, ocupado = false, orbe = null, consoleCarregado = false, noAparelho = false;
  var reduzido = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------- armazenamento (pode falhar: aba anônima etc.)
  function ler(st, k) { try { return st.getItem(k); } catch (e) { return null; } }
  function gravar(st, k, v) { try { st.setItem(k, v); } catch (e) { /* sem armazenamento: a sessão vale só nesta aba */ } }
  function apagar(st, k) { try { st.removeItem(k); } catch (e) { /* nada */ } }

  function lerSessao() {
    var daAba = ler(sessionStorage, KEY), cru = daAba || ler(localStorage, KEY);
    if (!cru) return null;
    try {
      var s = JSON.parse(cru);
      if (s && typeof s.token === 'string' && (s.expira > Date.now() || (FB && s.refresh))) { noAparelho = !daAba; return s; }
    } catch (e) { /* lixo */ }
    apagar(sessionStorage, KEY); apagar(localStorage, KEY);
    return null;
  }
  // Grava na aba ou no aparelho. Só apaga a cópia do OUTRO lugar: apagar e regravar a mesma chave dispararia, nas outras abas,
  // um evento "storage" de remoção e elas sairiam sem motivo (a cada renovação do token do Firebase, por exemplo).
  function guardar(s, lembrar) {
    noAparelho = !!lembrar;
    apagar(lembrar ? sessionStorage : localStorage, KEY);
    gravar(lembrar ? localStorage : sessionStorage, KEY, JSON.stringify(s));
  }

  // ---------------------------------------------------------------- rede
  function post(caminho, corpo, token) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : 0;
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch(EP + caminho, { method: 'POST', headers: h, body: JSON.stringify(corpo || {}), credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j || {} }; }); })
      .catch(function () { clearTimeout(timer); return { status: 0, j: {} }; });
  }

  // ---------------------------------------------------------------- Firebase (REST)
  function fbPost(url, corpo, formulario) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : 0;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': formulario ? 'application/x-www-form-urlencoded' : 'application/json' }, body: formulario ? corpo : JSON.stringify(corpo), credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j || {} }; }); })
      .catch(function () { clearTimeout(timer); return { status: 0, j: {} }; });
  }
  function dadosDoFirebase(j, anterior) {
    var idToken = j.idToken || j.id_token, refresh = j.refreshToken || j.refresh_token;
    if (!idToken) return null;
    return { token: idToken, refresh: refresh || (anterior && anterior.refresh) || '', usuario: j.email || (anterior && anterior.usuario) || 'usuário', expira: Date.now() + (Number(j.expiresIn || j.expires_in) || 3600) * 1000 };
  }
  var renovando = null;
  // Troca o refresh token por um ID token novo (vale 1 h). Falha de rede mantém a sessão; recusa do Firebase a encerra.
  function renovar() {
    if (!sessao || !sessao.refresh) return Promise.resolve(false);
    if (renovando) return renovando;
    var antiga = sessao;
    renovando = fbPost('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(FBKEY), 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(antiga.refresh), true).then(function (r) {
      renovando = null;
      if (r.status === 200) {
        var n = dadosDoFirebase(r.j, antiga);
        if (n) { n.usuario = antiga.usuario; sessao = n; guardar(n, noAparelho); return true; }
      }
      if (r.status === 400 || r.status === 401) { sair('Sua sessão foi encerrada. Entre de novo.'); }
      return false;
    });
    return renovando;
  }
  // Só erro de credencial vira "e-mail ou senha incorretos"; chave recusada, método desligado etc. são problema do serviço e não da pessoa.
  function mensagemFirebase(j) {
    var c = String(j && j.error && j.error.message || '');
    if (/TOO_MANY_ATTEMPTS/.test(c)) return { espera: 60 };
    if (/USER_DISABLED/.test(c)) return { texto: 'Esta conta está desativada.' };
    if (/INVALID_EMAIL|MISSING_EMAIL/.test(c)) return { texto: 'Informe um e-mail válido.' };
    if (/MISSING_PASSWORD/.test(c)) return { texto: 'Informe a senha.' };
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(c) || !c) return { texto: 'E-mail ou senha incorretos.' };
    if (/API.?KEY|REFERER|OPERATION_NOT_ALLOWED|PROJECT_NOT_FOUND|CONFIGURATION_NOT_FOUND/i.test(c)) return { texto: 'O login está indisponível por um problema de configuração. Avise quem administra o Paulus.' };
    return { texto: 'Não foi possível entrar agora. Tente de novo em instantes.' };
  }
  // O Firebase aceita qualquer conta do projeto; o Worker pode recusar (e-mail fora da lista ou não verificado).
  // Confere já no login, para dizer o motivo certo em vez de abrir o console e cair em "sessão venceu".
  function conferirNoWorker(d) {
    return post('/sessao', {}, d.token).then(function (v) {
      if (v.status === 401) return { status: 403, j: { erro: 'Esta conta não tem acesso ao Paulus. Confirme o e-mail da conta ou peça a liberação a quem administra.' } };
      return { status: 200, j: { ok: true, token: d.token, usuario: d.usuario, expira: d.expira, refresh: d.refresh } };
    });
  }

  // ---------------------------------------------------------------- estado de interação compartilhado pelo ícone e pelo fundo
  // pt: para onde o ícone "olha" (-1..1, suavizado); olho: 1 = aberto, ~0.15 = recolhido (senha oculta em foco); imp: impulso da digitação/toque.
  var pt = { x: 0, y: 0, ax: 0, ay: 0, t: 0 }, ui = { olho: 1, olhoAlvo: 1, imp: 0, rajada: false };
  function mirar(x, y) { pt.ax = Math.max(-1, Math.min(1, x)); pt.ay = Math.max(-1, Math.min(1, y)); pt.t = performance.now(); }
  function suavizar(now) {
    if (now - pt.t > 2500 && pt.t) { pt.ax *= 0.96; pt.ay *= 0.96; }
    pt.x += (pt.ax - pt.x) * 0.09; pt.y += (pt.ay - pt.y) * 0.09;
    ui.olho += (ui.olhoAlvo - ui.olho) * 0.12; ui.imp *= 0.93;
  }

  // ---------------------------------------------------------------- ícone animado (canvas)
  // O ícone do app (icon-512.png) fica no centro: respira, o olho ciborgue pulsa, uma varredura de luz passa por cima
  // e os anéis do HUD giram em volta. O estado (idle, busy, erro, ok, lock) muda cor, ritmo e brilho.
  function criarOrbe(cv) {
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, est = 'idle', estT = 0, raf = 0, rodando = true, parts = [], i;
    var img = new Image(), imgOk = false;
    img.onload = function () { imgOk = true; if (reduzido) quadro(performance.now()); };
    img.src = 'icon-512.png';
    for (i = 0; i < 34; i++) parts.push({ a: Math.random() * 6.283, r: 1.3 + Math.random() * 0.45, v: (0.15 + Math.random() * 0.45) * (Math.random() < 0.5 ? -1 : 1), s: 0.7 + Math.random() * 1.5, f: Math.random() * 6.283 });
    function tamanho() {
      var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    function cor() { return est === 'erro' ? '255,107,94' : est === 'ok' ? '110,231,168' : est === 'lock' ? '255,179,71' : '55,230,255'; }
    function anel(cx, cy, r, ini, tam, dash, lw, al, c) {
      ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(' + c + ',' + al + ')';
      ctx.arc(cx, cy, r, ini, ini + tam); ctx.stroke(); ctx.setLineDash([]);
    }
    function quadro(now) {
      if (!W) return;
      suavizar(now);
      var t = reduzido ? 2 : now / 1000, c = cor();
      var vel = est === 'busy' ? 3.2 : est === 'ok' ? 5 : est === 'lock' ? 0.25 : 1;
      var k = est === 'ok' ? Math.min(1, (now - estT) / 900) : 0;
      var tremor = est === 'erro' ? Math.sin((now - estT) / 26) * Math.max(0, 1 - (now - estT) / 520) * 6 : 0;
      var Ri = Math.min(W, H) * 0.28, cx = W / 2 + tremor, cy = H / 2;
      var dx = pt.x * Ri * 0.06, dy = pt.y * Ri * 0.05, resp = 1 + 0.018 * Math.sin(t * 1.6) + k * 0.1 + ui.imp * 0.03, flut = reduzido ? 0 : Math.sin(t * 1.1) * 2;
      var pulsoOlho = (0.5 + 0.5 * Math.sin(t * (est === 'busy' ? 9 : 2.2))) * (0.25 + 0.75 * ui.olho) + ui.imp * 0.6;
      ctx.clearRect(0, 0, W, H);
      // halo atrás do ícone
      var g = ctx.createRadialGradient(cx, cy, Ri * 0.6, cx, cy, Ri * (1.9 + 0.12 * pulsoOlho + k * 1.2));
      g.addColorStop(0, 'rgba(' + c + ',' + Math.min(0.9, 0.38 + 0.2 * pulsoOlho) + ')'); g.addColorStop(0.45, 'rgba(' + c + ',0.1)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // régua de marcas
      for (i = 0; i < 72; i++) {
        var a = i / 72 * 6.2832 + t * 0.08 * vel, longa = i % 6 === 0, r1 = Ri * 1.3, r2 = r1 + (longa ? 9 : 4);
        ctx.beginPath(); ctx.lineWidth = longa ? 1.4 : 1; ctx.strokeStyle = 'rgba(' + c + ',' + (longa ? 0.7 : 0.28) * (1 - k * 0.8) + ')';
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
      }
      anel(cx, cy, Ri * 1.2 * (1 + k * 0.3), t * 0.5 * vel, 6.2832, [3, 9], 1.3, 0.5 * (1 - k * 0.7), c);
      for (i = 0; i < 3; i++) anel(cx, cy, Ri * 1.1, -t * 0.7 * vel + i * 2.0944, 1.25, [], 2.2 + ui.imp * 2.5, 0.75, c);
      var sw = t * 1.6 * vel;
      ctx.lineCap = 'round'; anel(cx, cy, Ri * 1.1, sw, 0.7, [], 3, 0.95, c); ctx.lineCap = 'butt';
      // o ícone
      var tam = Ri * 2 * 1.02 * resp;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy + flut, Ri * resp, 0, 6.2832); ctx.clip();
      if (imgOk) {
        ctx.drawImage(img, cx + dx - tam / 2, cy + dy + flut - tam / 2, tam, tam);
        // tinta do estado (erro, bloqueio, acesso liberado)
        if (est === 'erro' || est === 'lock') { ctx.fillStyle = 'rgba(' + c + ',0.22)'; ctx.fillRect(cx - Ri * 1.2, cy - Ri * 1.2, Ri * 2.4, Ri * 2.4); }
        ctx.globalCompositeOperation = 'lighter';
        // olho ciborgue pulsando (o olho fica à direita do centro do ícone)
        var ex = cx + dx + tam * 0.109, ey = cy + dy + flut + tam * 0.008, er = tam * (0.06 + 0.04 * ui.olho + 0.05 * pulsoOlho + (est === 'ok' ? 0.12 * k : 0));
        var ge = ctx.createRadialGradient(ex, ey, 0, ex, ey, er * 2.2);
        ge.addColorStop(0, 'rgba(' + c + ',' + (0.55 + 0.35 * pulsoOlho) + ')'); ge.addColorStop(0.4, 'rgba(' + c + ',0.28)'); ge.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = ge; ctx.fillRect(ex - er * 2.2, ey - er * 2.2, er * 4.4, er * 4.4);
        ctx.fillStyle = 'rgba(' + c + ',' + (0.4 * pulsoOlho) + ')'; ctx.fillRect(ex - er * 2.4, ey - 0.6, er * 4.8, 1.2); // reflexo horizontal da lente
        // varredura de luz sobre o rosto
        var per = est === 'busy' ? 1.1 : 3.4, ph = ((t / per) % 1.25) - 0.125, sy = cy + flut - Ri + ph * Ri * 2;
        var gs = ctx.createLinearGradient(0, sy - Ri * 0.45, 0, sy + 2);
        gs.addColorStop(0, 'rgba(' + c + ',0)'); gs.addColorStop(1, 'rgba(' + c + ',' + (est === 'busy' ? 0.42 : 0.26) + ')');
        ctx.fillStyle = gs; ctx.fillRect(cx - Ri, sy - Ri * 0.45, Ri * 2, Ri * 0.45 + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx - Ri, sy, Ri * 2, 1);
        ctx.globalCompositeOperation = 'source-over';
        if (k > 0 && k < 1) { ctx.fillStyle = 'rgba(255,255,255,' + (0.45 * (1 - k)) + ')'; ctx.fillRect(cx - Ri, cy - Ri, Ri * 2, Ri * 2); }
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, Ri * 0.3 * (1 + 0.12 * pulsoOlho), 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      }
      ctx.restore();
      // aro de vidro em volta do ícone
      ctx.beginPath(); ctx.arc(cx, cy + flut, Ri * resp, 0, 6.2832); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(' + c + ',0.65)'; ctx.stroke();
      // partículas em órbita
      for (i = 0; i < parts.length; i++) {
        var p = parts[i], ang = p.a + t * p.v * vel, rr = Ri * (p.r + k * 0.8), al = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 + p.f))) * (1 - k * 0.9);
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.92, p.s, 0, 6.2832); ctx.fillStyle = 'rgba(' + c + ',' + al + ')'; ctx.fill();
      }
    }
    function laco(now) { if (!rodando) return; quadro(now); raf = requestAnimationFrame(laco); }
    tamanho();
    window.addEventListener('resize', function () { tamanho(); if (reduzido) quadro(performance.now()); });
    if (reduzido) quadro(performance.now()); else raf = requestAnimationFrame(laco);
    return {
      estado: function (e) { est = e; estT = performance.now(); if (reduzido) quadro(estT); },
      parar: function () { rodando = false; cancelAnimationFrame(raf); }
    };
  }

  // ---------------------------------------------------------------- fundo animado (HUD em tela cheia)
  function criarFundo(cv, centro) {
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, est = 'idle', estT = 0, raf = 0, rodando = true, parts = [], cols = [], pulsos = [], ultimoPulso = 0, i, j;
    var HEX = '0123456789ABCDEF';
    function cor() { return est === 'erro' ? '255,107,94' : est === 'ok' ? '110,231,168' : est === 'lock' ? '255,179,71' : '55,230,255'; }
    function semear() {
      var n = Math.max(36, Math.min(95, Math.round(W * H / 20000)));
      parts = []; for (i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22, s: 0.6 + Math.random() * 1.3 });
      cols = []; var passo = 30, nc = Math.floor(W / passo);
      for (i = 0; i < nc; i++) if (Math.random() < 0.55) cols.push({ x: i * passo + 10, y: Math.random() * H, v: 18 + Math.random() * 46, n: 5 + Math.floor(Math.random() * 9), t: '' , troca: 0 });
    }
    function tamanho() {
      var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0); semear();
    }
    function arco(cx, cy, r, ini, tam, lw, al, c, dash) {
      ctx.beginPath(); ctx.setLineDash(dash || []); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(' + c + ',' + al + ')'; ctx.arc(cx, cy, r, ini, ini + tam); ctx.stroke(); ctx.setLineDash([]);
    }
    function aneis(cx, cy, t, c, vel, k) {
      var B = Math.min(W, H), R = B * 0.46, a, r1, r2, longa, ang;
      // régua de graus no anel maior
      for (i = 0; i < 120; i++) {
        a = i / 120 * 6.2832 - t * 0.04 * vel; longa = i % 10 === 0; r1 = R; r2 = R + (longa ? 12 : i % 2 ? 4 : 7);
        ctx.beginPath(); ctx.lineWidth = longa ? 1.3 : 0.8; ctx.strokeStyle = 'rgba(' + c + ',' + (longa ? 0.5 : 0.2) + ')';
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
        if (longa && B > 520) { ctx.save(); ctx.translate(cx + Math.cos(a) * (R + 26), cy + Math.sin(a) * (R + 26)); ctx.rotate(a + 1.5708); ctx.fillStyle = 'rgba(' + c + ',0.38)'; ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(String((i / 10) * 30 % 360), 0, 0); ctx.restore(); }
      }
      arco(cx, cy, R * 0.93, t * 0.12 * vel, 6.2832, 1, 0.16, c, [1, 7]);
      // segmentos grossos girando em sentidos opostos
      for (j = 0; j < 4; j++) arco(cx, cy, R * 0.86, t * 0.22 * vel + j * 1.5708, 0.85, 3, 0.34, c);
      for (j = 0; j < 3; j++) arco(cx, cy, R * 0.72, -t * 0.31 * vel + j * 2.0944, 1.2, 1.6, 0.4, c, [10, 5]);
      arco(cx, cy, R * 0.6, t * 0.45 * vel, 6.2832, 1, 0.22, c, [30, 14, 3, 14]);
      // marcas de mira nos 4 eixos
      for (j = 0; j < 4; j++) { ang = j * 1.5708; ctx.beginPath(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(' + c + ',0.55)'; ctx.moveTo(cx + Math.cos(ang) * (R * 0.5), cy + Math.sin(ang) * (R * 0.5)); ctx.lineTo(cx + Math.cos(ang) * (R * 0.56), cy + Math.sin(ang) * (R * 0.56)); ctx.stroke(); }
      // linhas de mira atravessando a tela
      var gx = ctx.createLinearGradient(0, cy, W, cy); gx.addColorStop(0, 'rgba(' + c + ',0)'); gx.addColorStop(0.5, 'rgba(' + c + ',0.16)'); gx.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = gx; ctx.fillRect(0, cy - 0.5, W, 1);
      var gy = ctx.createLinearGradient(cx, 0, cx, H); gy.addColorStop(0, 'rgba(' + c + ',0)'); gy.addColorStop(0.5, 'rgba(' + c + ',0.12)'); gy.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = gy; ctx.fillRect(cx - 0.5, 0, 1, H);
    }
    function quadro(now, dt) {
      if (!W) return;
      var t = reduzido ? 3 : now / 1000, c = cor(), ctr = centro(), cx = ctr.x - pt.x * 14, cy = ctr.y - pt.y * 10;
      var vel = est === 'busy' ? 3.2 : est === 'ok' ? 4.5 : est === 'lock' ? 0.3 : 1;
      var k = est === 'ok' ? Math.min(1, (now - estT) / 900) : 0;
      ctx.clearRect(0, 0, W, H);
      // chuva de dados
      ctx.font = '11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
      for (i = 0; i < cols.length; i++) {
        var cl = cols[i];
        if (!reduzido) cl.y += cl.v * dt * vel * 0.6;
        if (cl.y - cl.n * 14 > H) { cl.y = -20; cl.v = 18 + Math.random() * 46; }
        if (now > cl.troca) { cl.t = ''; for (j = 0; j < cl.n; j++) cl.t += HEX.charAt((Math.random() * 16) | 0); cl.troca = now + 140 + Math.random() * 260; }
        for (j = 0; j < cl.n; j++) {
          ctx.fillStyle = 'rgba(' + c + ',' + (j === cl.n - 1 ? 0.5 : 0.07 + 0.2 * (j / cl.n)) + ')';
          ctx.fillText(cl.t.charAt(j), cl.x, cl.y - (cl.n - 1 - j) * 14);
        }
      }
      // sonar: pulsos que nascem no centro (e uma rajada quando a pessoa toca no ícone)
      if (ui.rajada) { ui.rajada = false; pulsos.push(now); ultimoPulso = now; }
      if (!reduzido && now - ultimoPulso > (est === 'busy' ? 700 : 3200)) { pulsos.push(now); ultimoPulso = now; }
      for (i = pulsos.length - 1; i >= 0; i--) {
        var pr = (now - pulsos[i]) / 4200;
        if (pr >= 1) { pulsos.splice(i, 1); continue; }
        ctx.beginPath(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(' + c + ',' + (0.35 * (1 - pr)) + ')'; ctx.arc(cx, cy, 40 + pr * Math.hypot(W, H) * 0.55, 0, 6.2832); ctx.stroke();
      }
      aneis(cx, cy, t, c, vel, k);
      // rede de partículas
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!reduzido) { p.x += p.vx * vel; p.y += p.vy * vel; if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10; }
        for (j = i + 1; j < parts.length; j++) {
          var q = parts[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
          if (d2 < 15000) { ctx.beginPath(); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(' + c + ',' + (0.2 * (1 - d2 / 15000)) + ')'; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.2832); ctx.fillStyle = 'rgba(' + c + ',0.55)'; ctx.fill();
      }
      // linha de varredura
      var sy = ((t * 0.13) % 1.2 - 0.1) * H, gs = ctx.createLinearGradient(0, sy - 70, 0, sy + 2);
      gs.addColorStop(0, 'rgba(' + c + ',0)'); gs.addColorStop(1, 'rgba(' + c + ',0.1)');
      ctx.fillStyle = gs; ctx.fillRect(0, sy - 70, W, 72);
      ctx.fillStyle = 'rgba(' + c + ',0.35)'; ctx.fillRect(0, sy, W, 1);
      // flash ao liberar o acesso
      if (k > 0 && k < 1) { ctx.fillStyle = 'rgba(' + c + ',' + (0.18 * (1 - k)) + ')'; ctx.fillRect(0, 0, W, H); }
    }
    var antes = performance.now();
    function laco(now) { if (!rodando) return; var dt = Math.min(0.05, (now - antes) / 1000); antes = now; quadro(now, dt); raf = requestAnimationFrame(laco); }
    tamanho();
    window.addEventListener('resize', function () { tamanho(); if (reduzido) quadro(performance.now(), 0); });
    if (reduzido) quadro(performance.now(), 0); else raf = requestAnimationFrame(laco);
    return {
      estado: function (e) { est = e; estT = performance.now(); if (reduzido) quadro(estT, 0); },
      parar: function () { rodando = false; cancelAnimationFrame(raf); }
    };
  }

  // relógio e fluxo hexadecimal dos painéis do HUD
  function ligarHud() {
    var clk = $('hclk'), dt = $('hdt'), hx = $('hhex');
    function hora() {
      var d = new Date(), z = function (n) { return ('0' + n).slice(-2); };
      if (clk) clk.textContent = z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
      if (dt) dt.textContent = z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear();
    }
    function hex() { var t = '0x'; for (var n = 0; n < 12; n++) t += '0123456789ABCDEF'.charAt((Math.random() * 16) | 0); if (hx) hx.textContent = t; }
    hora(); hex();
    var a = setInterval(hora, 1000), b = reduzido ? 0 : setInterval(hex, 160);
    return function () { clearInterval(a); if (b) clearInterval(b); };
  }

  // ---------------------------------------------------------------- interface
  function msg(texto, tipo) { var el = $('lgs'); el.textContent = texto; el.className = 'lst' + (tipo ? ' ' + tipo : ''); }
  function campos(ligado) { $('lgu').disabled = !ligado; $('lgp').disabled = !ligado; $('lgb').disabled = !ligado; }
  function marcaErro(sim) { $('lgub').classList.toggle('err', sim); $('lgpb').classList.toggle('err', sim); $('lgu').setAttribute('aria-invalid', String(sim)); $('lgp').setAttribute('aria-invalid', String(sim)); }
  function tremer() {
    var lc = $('lc'); lc.classList.remove('tremer'); void lc.offsetWidth; lc.classList.add('tremer');
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) { /* sem vibração */ }
    if (orbe) { orbe.estado('erro'); setTimeout(function () { if (orbe) orbe.estado(bloqueioAte > Date.now() ? 'lock' : 'idle'); }, 650); }
  }
  function mmss(seg) { return Math.floor(seg / 60) + ':' + ('0' + (seg % 60)).slice(-2); }

  function bloquear(seg) {
    bloqueioAte = Date.now() + seg * 1000;
    gravar(localStorage, BLOQ, String(bloqueioAte));
    clearInterval(tick);
    if (orbe) orbe.estado('lock');
    campos(false); $('lgu').disabled = false;
    function passo() {
      var falta = Math.ceil((bloqueioAte - Date.now()) / 1000);
      if (falta <= 0) {
        clearInterval(tick); bloqueioAte = 0; apagar(localStorage, BLOQ); campos(true); $('lgb').textContent = 'Autenticar';
        msg('Pode tentar de novo.', 'aviso'); marcaErro(false); if (orbe) orbe.estado('idle'); $('lgp').focus();
        return;
      }
      $('lgb').textContent = 'Aguarde ' + mmss(falta);
      msg('MUITAS TENTATIVAS · ACESSO BLOQUEADO POR ' + mmss(falta), 'aviso');
    }
    passo(); tick = setInterval(passo, 500);
  }

  function enviar(ev) {
    ev.preventDefault();
    if (ocupado || bloqueioAte > Date.now()) return;
    var u = $('lgu').value.trim(), s = $('lgp').value;
    if (!u || !s) { marcaErro(true); msg(FB ? 'Informe e-mail e senha.' : 'Informe usuário e senha.', 'erro'); (u ? $('lgp') : $('lgu')).focus(); return; }
    marcaErro(false); ocupado = true; campos(false); $('lgb').classList.add('busy'); $('lgb').textContent = 'Verificando…';
    if (orbe) orbe.estado('busy'); msg('VERIFICANDO CREDENCIAIS…');
    var lembrar = $('lgl').checked;
    var chamada = FB
      ? fbPost('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(FBKEY), { email: u, password: s, returnSecureToken: true }).then(function (r) {
          if (r.status === 200) { var d = dadosDoFirebase(r.j); if (d) { d.usuario = r.j.email || u; return conferirNoWorker(d); } return { status: 502, j: {} }; }
          if (r.status === 0 || r.status >= 500) return r;
          var m = mensagemFirebase(r.j);
          return m.espera ? { status: 429, j: { espera: m.espera } } : { status: 401, j: { erro: m.texto } };
        })
      : post('/login', { usuario: u, senha: s, lembrar: lembrar });
    chamada.then(function (r) {
      ocupado = false; $('lgb').classList.remove('busy'); $('lgb').textContent = 'Autenticar';
      if (r.status === 200 && r.j.ok && r.j.token) {
        $('lgp').value = '';
        sessao = { token: r.j.token, usuario: r.j.usuario, expira: r.j.expira };
        if (r.j.refresh) sessao.refresh = r.j.refresh;
        guardar(sessao, lembrar); gravar(localStorage, USER, u); apagar(localStorage, BLOQ);
        if (orbe) orbe.estado('ok'); msg('ACESSO CONCEDIDO · ' + String(r.j.usuario).toUpperCase(), 'ok');
        setTimeout(function () { abrir(true); }, reduzido ? 200 : 950);
        return;
      }
      campos(true); $('lgp').value = '';
      if (r.status === 429 || (r.status === 401 && r.j.espera > 0)) { marcaErro(true); tremer(); bloquear(Math.max(1, Number(r.j.espera) || 30)); return; }
      marcaErro(true); tremer();
      if (r.status === 0) msg('SEM CONEXÃO COM O PAULUS. Verifique a internet e tente de novo.', 'erro');
      else if (r.status === 401 || r.status === 400 || r.status === 403) msg(String(r.j.erro || 'Usuário ou senha incorretos.'), 'erro');
      else msg('O servidor falhou (' + r.status + '). Tente de novo em instantes.', 'erro');
      $('lgp').focus();
    });
  }

  // ---------------------------------------------------------------- entrar e sair
  function sair(aviso) {
    try { if (window.Paulus && Paulus.limpar) Paulus.limpar(); } catch (e) { /* segue */ }
    apagar(sessionStorage, KEY); apagar(localStorage, KEY);
    if (aviso) gravar(sessionStorage, AVISO, aviso);
    location.reload();
  }

  function ligarPaulus() {
    if (!window.Paulus || window.Paulus.__login) return;
    var ini = window.Paulus.init;
    window.Paulus.init = function (o) {
      o = Object.assign({}, o);
      if (!o.endpoint && EP) o.endpoint = EP;
      if (sessao) {
        var antes = o.aoNegar;
        o.token = FB
          ? function () { if (!sessao) return ''; return (sessao.refresh && sessao.expira - Date.now() < 120000 ? renovar() : Promise.resolve()).then(function () { return sessao ? sessao.token : ''; }); }
          : function () { return sessao ? sessao.token : ''; };
        o.aoNegar = function (f) { sair('Sua sessão venceu. Entre de novo.'); if (typeof antes === 'function') antes(f); };
      }
      return ini.call(window.Paulus, o);
    };
    window.Paulus.__login = true;
  }

  function abrir(comLogin) {
    if (consoleCarregado) return;
    consoleCarregado = true;
    ligarPaulus();
    if (comLogin && sessao) {
      var b = $('sair'); b.hidden = false; b.title = 'Sair (' + sessao.usuario + ')';
      b.addEventListener('click', function () { sair(''); });
      var resta = sessao.expira - Date.now();
      // Firebase: o ID token dura 1 h, mas o refresh token o renova sozinho; só vence a sessão de senha.
      if (!FB) setTimeout(function () { sair('Sua sessão expirou. Entre de novo.'); }, Math.max(1000, Math.min(resta, 2147000000)));
      else setInterval(function () { if (sessao && sessao.expira - Date.now() < 300000) renovar(); }, 60000);
      var ultimaConferencia = 0;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden || !sessao) return;
        if (!FB && sessao.expira <= Date.now()) { sair('Sua sessão expirou. Entre de novo.'); return; }
        // ao voltar para a aba: confere no Worker (conta removida ou segredo trocado derrubam a sessão)
        if (Date.now() - ultimaConferencia < 30000) return;
        ultimaConferencia = Date.now();
        (FB && sessao.refresh && sessao.expira - Date.now() < 120000 ? renovar() : Promise.resolve()).then(function () {
          if (sessao) post('/sessao', {}, sessao.token).then(function (r) { if (r.status === 401) sair('Sua sessão foi encerrada. Entre de novo.'); });
        });
      });
      // saiu em outra aba: sai aqui também
      // (espera um instante e confere: uma troca de token apaga e grava em seguida, e isso não é sair)
      window.addEventListener('storage', function (e) {
        if (!sessao || (e.key !== KEY && e.key !== null) || e.newValue) return;
        setTimeout(function () { if (sessao && !ler(sessionStorage, KEY) && !ler(localStorage, KEY)) sair('Você saiu em outra aba.'); }, 80);
      });
    }
    var lg = $('lg');
    document.body.classList.remove('lock');
    if (orbe) { orbe.parar(); }
    lg.classList.add('sai');
    setTimeout(function () { lg.hidden = true; }, reduzido ? 0 : 520);
    var sc = document.createElement('script');
    sc.src = 'console.js';
    sc.onerror = function () { var st = $('st'); if (st) st.textContent = 'ERRO: console.js NÃO ENCONTRADO'; };
    document.body.appendChild(sc);
  }

  // ---------------------------------------------------------------- partida
  function mostrarFormulario(texto, tipo) {
    campos(true); msg(texto || 'AGUARDANDO CREDENCIAIS', tipo || '');
    var ultimo = ler(localStorage, USER);
    if (ultimo && !$('lgu').value) { $('lgu').value = ultimo; $('lgp').focus(); } else $('lgu').focus();
  }

  // o bloqueio por tentativas sobrevive a recarregar a página
  function retomarBloqueio() {
    var antes = Number(ler(localStorage, BLOQ)) || 0;
    if (antes > Date.now()) bloquear(Math.ceil((antes - Date.now()) / 1000));
  }

  function iniciar() {
    var o = criarOrbe($('lgo')), pararHud = ligarHud();
    var f = criarFundo($('lgbg'), function () { var r = $('lgo').getBoundingClientRect(), b = $('lgbg').getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }; });
    orbe = { estado: function (e) { o.estado(e); f.estado(e); }, parar: function () { o.parar(); f.parar(); pararHud(); } };
    if (FB) {
      var rot = document.querySelector('label[for="lgu"]'); if (rot) rot.textContent = 'E-MAIL';
      $('lgu').placeholder = 'seu e-mail'; $('lgu').maxLength = 120; $('lgu').type = 'email'; $('lgu').setAttribute('autocomplete', 'email'); $('lgu').setAttribute('inputmode', 'email');
      var lr = document.querySelector('.lr'); if (lr) lr.textContent = 'LOGIN FIREBASE · A SENHA NUNCA FICA NO APARELHO';
      if ($('hcr')) $('hcr').textContent = 'FIREBASE'; if ($('hass')) $('hass').textContent = 'ASSINATURA GOOGLE · RS256';
    }
    $('lgform').addEventListener('submit', enviar);
    $('lgv').addEventListener('click', function () {
      var p = $('lgp'), ver = p.type === 'password';
      p.type = ver ? 'text' : 'password';
      this.textContent = ver ? 'OCULTAR' : 'VER'; this.setAttribute('aria-pressed', String(ver)); this.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
      p.focus(); olhoDoCampo();
    });
    function caps(e) { if (e.getModifierState) $('lgc').hidden = !e.getModifierState('CapsLock'); }
    $('lgp').addEventListener('keydown', caps); $('lgp').addEventListener('keyup', caps);
    $('lgp').addEventListener('blur', function () { $('lgc').hidden = true; });
    ['lgu', 'lgp'].forEach(function (id) { $(id).addEventListener('input', function () { marcaErro(false); ui.imp = Math.min(1, ui.imp + 0.35); }); });
    // olhar: o ícone segue o mouse/toque; com o teclado, olha para o formulário; senha oculta em foco recolhe o olho
    function mirarEvento(e) { var r = $('lgo').getBoundingClientRect(); mirar((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5), (e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.5)); }
    window.addEventListener('pointermove', mirarEvento, { passive: true });
    window.addEventListener('touchmove', function (e) { if (e.touches[0]) mirarEvento(e.touches[0]); }, { passive: true });
    function olhoDoCampo() { ui.olhoAlvo = document.activeElement === $('lgp') && $('lgp').type === 'password' ? 0.12 : 1; }
    ['lgu', 'lgp'].forEach(function (id) {
      $(id).addEventListener('focus', function () { mirar(0, 0.75); olhoDoCampo(); });
      $(id).addEventListener('blur', function () { setTimeout(olhoDoCampo, 0); });
    });
    // tocar no ícone: pulso e rajada de sonar
    $('lgo').addEventListener('pointerdown', function () { ui.imp = 1; ui.rajada = true; });
    // Enter no usuário vai para a senha; Esc na senha limpa
    $('lgu').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('lgp').value) { e.preventDefault(); $('lgp').focus(); } });
    $('lgp').addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('lgp').value = ''; marcaErro(false); } });
    // ondas no botão
    $('lgb').addEventListener('pointerdown', function (e) {
      if (this.disabled || reduzido) return;
      var r = this.getBoundingClientRect(), d = document.createElement('span'), tam = Math.max(r.width, r.height) * 2;
      d.className = 'rp'; d.style.cssText = 'width:' + tam + 'px;height:' + tam + 'px;left:' + (e.clientX - r.left - tam / 2) + 'px;top:' + (e.clientY - r.top - tam / 2) + 'px';
      this.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 650);
    });
    // internet foi e voltou
    window.addEventListener('offline', function () { if (!ocupado && !bloqueioAte && !$('lg').hidden) msg('SEM INTERNET · AGUARDANDO CONEXÃO', 'aviso'); });
    window.addEventListener('online', function () { if (!ocupado && !bloqueioAte && !$('lg').hidden) msg('CONEXÃO RESTABELECIDA', 'ok'); });

    var aviso = ler(sessionStorage, AVISO); apagar(sessionStorage, AVISO);
    if (!EP) { if (window.console) console.warn('Paulus: defina <meta name="paulus-endpoint"> no index.html para ligar o login.'); abrir(false); return; }
    var guardada = lerSessao();
    msg(guardada ? 'VALIDANDO SESSÃO…' : 'CONECTANDO…');
    // Firebase: ID token vencido (dura 1 h) mas com refresh token: renova antes de perguntar ao Worker
    var preparo = Promise.resolve();
    if (FB && guardada && guardada.refresh && guardada.expira - Date.now() < 120000) {
      sessao = guardada;
      preparo = renovar().then(function () { guardada = sessao && sessao.token ? sessao : guardada; });
    }
    preparo.then(function () { return post('/sessao', {}, guardada && guardada.token); }).then(function (r) {
      if (r.status === 200 && r.j.login === false) { abrir(false); return; }              // Worker sem login: console aberto
      if (r.status === 200 && r.j.ok && guardada) { sessao = { token: guardada.token, usuario: r.j.usuario || guardada.usuario, expira: r.j.expira || guardada.expira, refresh: guardada.refresh }; abrir(true); return; }
      if (r.status === 0 && guardada) { sessao = guardada; abrir(true); return; }          // sem rede: segue com a sessão guardada
      if (r.status === 0) { mostrarFormulario('SEM CONEXÃO COM O PAULUS. Você ainda pode tentar entrar.', 'aviso'); retomarBloqueio(); return; }
      if (guardada) { apagar(sessionStorage, KEY); apagar(localStorage, KEY); aviso = aviso || 'Sua sessão venceu. Entre de novo.'; }
      mostrarFormulario(aviso || 'AGUARDANDO CREDENCIAIS', aviso ? 'aviso' : '');
      retomarBloqueio();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
