// Tela de login do Console do Paulus.
// Fluxo: confere a sessão no Worker (/sessao) -> se não houver login ativo ou a sessão vale, abre o console;
// senão mostra a tela, envia usuário e senha a /login e guarda o token da sessão (a senha nunca é guardada).
// O console (console.js) só é carregado DEPOIS de entrar, e Paulus.init recebe o token e o aviso de sessão vencida.
(function () {
  'use strict';

  var KEY = 'paulus.sessao', USER = 'paulus.usuario', AVISO = 'paulus.aviso';
  var meta = document.querySelector('meta[name="paulus-endpoint"]');
  var EP = String((meta && meta.content) || window.PAULUS_ENDPOINT || '').replace(/\/+$/, '');
  var $ = function (id) { return document.getElementById(id); };
  var sessao = null, bloqueioAte = 0, tick = 0, ocupado = false, orbe = null, consoleCarregado = false;
  var reduzido = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------- armazenamento (pode falhar: aba anônima etc.)
  function ler(st, k) { try { return st.getItem(k); } catch (e) { return null; } }
  function gravar(st, k, v) { try { st.setItem(k, v); } catch (e) { /* sem armazenamento: a sessão vale só nesta aba */ } }
  function apagar(st, k) { try { st.removeItem(k); } catch (e) { /* nada */ } }

  function lerSessao() {
    var cru = ler(sessionStorage, KEY) || ler(localStorage, KEY);
    if (!cru) return null;
    try {
      var s = JSON.parse(cru);
      if (s && typeof s.token === 'string' && s.expira > Date.now()) return s;
    } catch (e) { /* lixo */ }
    apagar(sessionStorage, KEY); apagar(localStorage, KEY);
    return null;
  }
  function guardar(s, lembrar) {
    apagar(sessionStorage, KEY); apagar(localStorage, KEY);
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
      var t = reduzido ? 2 : now / 1000, c = cor();
      var vel = est === 'busy' ? 3.2 : est === 'ok' ? 5 : est === 'lock' ? 0.25 : 1;
      var k = est === 'ok' ? Math.min(1, (now - estT) / 900) : 0;
      var tremor = est === 'erro' ? Math.sin((now - estT) / 26) * Math.max(0, 1 - (now - estT) / 520) * 6 : 0;
      var Ri = Math.min(W, H) * 0.28, cx = W / 2 + tremor, cy = H / 2;
      var resp = 1 + 0.018 * Math.sin(t * 1.6) + k * 0.1, flut = reduzido ? 0 : Math.sin(t * 1.1) * 2;
      var pulsoOlho = 0.5 + 0.5 * Math.sin(t * (est === 'busy' ? 9 : 2.2));
      ctx.clearRect(0, 0, W, H);
      // halo atrás do ícone
      var g = ctx.createRadialGradient(cx, cy, Ri * 0.6, cx, cy, Ri * (1.9 + 0.12 * pulsoOlho + k * 1.2));
      g.addColorStop(0, 'rgba(' + c + ',' + (0.38 + 0.2 * pulsoOlho) + ')'); g.addColorStop(0.45, 'rgba(' + c + ',0.1)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // régua de marcas
      for (i = 0; i < 72; i++) {
        var a = i / 72 * 6.2832 + t * 0.08 * vel, longa = i % 6 === 0, r1 = Ri * 1.3, r2 = r1 + (longa ? 9 : 4);
        ctx.beginPath(); ctx.lineWidth = longa ? 1.4 : 1; ctx.strokeStyle = 'rgba(' + c + ',' + (longa ? 0.7 : 0.28) * (1 - k * 0.8) + ')';
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
      }
      anel(cx, cy, Ri * 1.2 * (1 + k * 0.3), t * 0.5 * vel, 6.2832, [3, 9], 1.3, 0.5 * (1 - k * 0.7), c);
      for (i = 0; i < 3; i++) anel(cx, cy, Ri * 1.1, -t * 0.7 * vel + i * 2.0944, 1.25, [], 2.2, 0.75, c);
      var sw = t * 1.6 * vel;
      ctx.lineCap = 'round'; anel(cx, cy, Ri * 1.1, sw, 0.7, [], 3, 0.95, c); ctx.lineCap = 'butt';
      // o ícone
      var tam = Ri * 2 * 1.02 * resp;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy + flut, Ri * resp, 0, 6.2832); ctx.clip();
      if (imgOk) {
        ctx.drawImage(img, cx - tam / 2, cy + flut - tam / 2, tam, tam);
        // tinta do estado (erro, bloqueio, acesso liberado)
        if (est === 'erro' || est === 'lock') { ctx.fillStyle = 'rgba(' + c + ',0.22)'; ctx.fillRect(cx - Ri * 1.2, cy - Ri * 1.2, Ri * 2.4, Ri * 2.4); }
        ctx.globalCompositeOperation = 'lighter';
        // olho ciborgue pulsando (o olho fica à direita do centro do ícone)
        var ex = cx + tam * 0.109, ey = cy + flut + tam * 0.008, er = tam * (0.1 + 0.05 * pulsoOlho + (est === 'ok' ? 0.12 * k : 0));
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
      var t = reduzido ? 3 : now / 1000, c = cor(), ctr = centro(), cx = ctr.x, cy = ctr.y;
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
      // sonar: pulsos que nascem no centro
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
  function marcaErro(sim) { $('lgub').classList.toggle('err', sim); $('lgpb').classList.toggle('err', sim); }
  function tremer() {
    var lc = $('lc'); lc.classList.remove('tremer'); void lc.offsetWidth; lc.classList.add('tremer');
    if (orbe) { orbe.estado('erro'); setTimeout(function () { if (orbe) orbe.estado(bloqueioAte > Date.now() ? 'lock' : 'idle'); }, 650); }
  }
  function mmss(seg) { return Math.floor(seg / 60) + ':' + ('0' + (seg % 60)).slice(-2); }

  function bloquear(seg) {
    bloqueioAte = Date.now() + seg * 1000;
    clearInterval(tick);
    if (orbe) orbe.estado('lock');
    campos(false); $('lgu').disabled = false;
    function passo() {
      var falta = Math.ceil((bloqueioAte - Date.now()) / 1000);
      if (falta <= 0) {
        clearInterval(tick); bloqueioAte = 0; campos(true); $('lgb').textContent = 'Autenticar';
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
    if (!u || !s) { marcaErro(true); msg('Informe usuário e senha.', 'erro'); (u ? $('lgp') : $('lgu')).focus(); return; }
    marcaErro(false); ocupado = true; campos(false); $('lgb').classList.add('busy'); $('lgb').textContent = 'Verificando';
    if (orbe) orbe.estado('busy'); msg('VERIFICANDO CREDENCIAIS…');
    var lembrar = $('lgl').checked;
    post('/login', { usuario: u, senha: s, lembrar: lembrar }).then(function (r) {
      ocupado = false; $('lgb').classList.remove('busy'); $('lgb').textContent = 'Autenticar';
      if (r.status === 200 && r.j.ok && r.j.token) {
        $('lgp').value = '';
        sessao = { token: r.j.token, usuario: r.j.usuario, expira: r.j.expira };
        guardar(sessao, lembrar); gravar(localStorage, USER, u);
        if (orbe) orbe.estado('ok'); msg('ACESSO CONCEDIDO · ' + String(r.j.usuario).toUpperCase(), 'ok');
        setTimeout(function () { abrir(true); }, reduzido ? 200 : 950);
        return;
      }
      campos(true); $('lgp').value = '';
      if (r.status === 429 || (r.status === 401 && r.j.espera > 0)) { marcaErro(true); tremer(); bloquear(Math.max(1, Number(r.j.espera) || 30)); return; }
      marcaErro(true); tremer();
      if (r.status === 0) msg('SEM CONEXÃO COM O PAULUS. Verifique a internet e tente de novo.', 'erro');
      else if (r.status === 401 || r.status === 400) msg(String(r.j.erro || 'Usuário ou senha incorretos.'), 'erro');
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
        o.token = function () { return sessao ? sessao.token : ''; };
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
      setTimeout(function () { sair('Sua sessão expirou. Entre de novo.'); }, Math.max(1000, Math.min(resta, 2147000000)));
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && sessao && sessao.expira <= Date.now()) sair('Sua sessão expirou. Entre de novo.');
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

  function iniciar() {
    var o = criarOrbe($('lgo')), pararHud = ligarHud();
    var f = criarFundo($('lgbg'), function () { var r = $('lgo').getBoundingClientRect(), b = $('lgbg').getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }; });
    orbe = { estado: function (e) { o.estado(e); f.estado(e); }, parar: function () { o.parar(); f.parar(); pararHud(); } };
    $('lgform').addEventListener('submit', enviar);
    $('lgv').addEventListener('click', function () {
      var p = $('lgp'), ver = p.type === 'password';
      p.type = ver ? 'text' : 'password';
      this.textContent = ver ? 'OCULTAR' : 'VER'; this.setAttribute('aria-pressed', String(ver)); this.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
      p.focus();
    });
    function caps(e) { if (e.getModifierState) $('lgc').hidden = !e.getModifierState('CapsLock'); }
    $('lgp').addEventListener('keydown', caps); $('lgp').addEventListener('keyup', caps);
    $('lgp').addEventListener('blur', function () { $('lgc').hidden = true; });
    ['lgu', 'lgp'].forEach(function (id) { $(id).addEventListener('input', function () { marcaErro(false); }); });

    var aviso = ler(sessionStorage, AVISO); apagar(sessionStorage, AVISO);
    if (!EP) { if (window.console) console.warn('Paulus: defina <meta name="paulus-endpoint"> no index.html para ligar o login.'); abrir(false); return; }
    var guardada = lerSessao();
    msg(guardada ? 'VALIDANDO SESSÃO…' : 'CONECTANDO…');
    post('/sessao', {}, guardada && guardada.token).then(function (r) {
      if (r.status === 200 && r.j.login === false) { abrir(false); return; }              // Worker sem login: console aberto
      if (r.status === 200 && r.j.ok && guardada) { sessao = { token: guardada.token, usuario: r.j.usuario || guardada.usuario, expira: r.j.expira || guardada.expira }; abrir(true); return; }
      if (r.status === 0 && guardada) { sessao = guardada; abrir(true); return; }          // sem rede: segue com a sessão guardada
      if (r.status === 0) { mostrarFormulario('SEM CONEXÃO COM O PAULUS. Você ainda pode tentar entrar.', 'aviso'); return; }
      if (guardada) { apagar(sessionStorage, KEY); apagar(localStorage, KEY); aviso = aviso || 'Sua sessão venceu. Entre de novo.'; }
      mostrarFormulario(aviso || 'AGUARDANDO CREDENCIAIS', aviso ? 'aviso' : '');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
