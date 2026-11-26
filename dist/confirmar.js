// Confirmação e "Desfazer" do Paulus. Só lógica (sem DOM): a tela entra por PaulusConfirmar.init({ pergunta }).
//  - pedir(texto, op): ação sem volta passa por uma pergunta inline (Confirmar / Cancelar); devolve Promise<boolean>.
//  - registrar(rotulo, fn): ação que apaga vira reversível; guarda um recibo com a função que restaura.
//  - desfazer(id): roda a restauração UMA vez; recibo vence em 10 min (o aparelho pode ter mudado).
(function () {
  'use strict';
  var MAX = 10, VALIDADE = 10 * 60 * 1000;
  var recibos = [], contador = 0, cfg = {}, agora = function () { return Date.now(); };

  function podar() { var t = agora(); recibos = recibos.filter(function (r) { return !r.usado && t - r.criado < VALIDADE; }).slice(-MAX); }

  function registrar(rotulo, restaurar) {
    if (typeof restaurar !== 'function') return null;
    podar();
    var r = { id: 'r' + (++contador), rotulo: String(rotulo || 'Ação'), restaurar: restaurar, criado: agora(), usado: false };
    recibos.push(r);
    return { id: r.id, rotulo: r.rotulo };
  }

  function desfazer(id) {
    podar();
    var r = recibos.filter(function (x) { return x.id === id; })[0];
    if (!r) return Promise.resolve({ ok: false, texto: 'Já não dá para desfazer: o prazo acabou ou já foi desfeito.' });
    r.usado = true;
    return Promise.resolve().then(function () { return r.restaurar(); }).then(
      function () { podar(); return { ok: true, texto: 'Desfeito: ' + r.rotulo.charAt(0).toLowerCase() + r.rotulo.slice(1) + ' restaurado.' }; },
      function (e) { r.usado = false; return { ok: false, texto: 'Não consegui desfazer' + (e && e.message ? ': ' + e.message : '.') }; }
    );
  }

  function pedir(texto, op) {
    op = op || {};
    var pergunta = cfg.pergunta;
    if (typeof pergunta === 'function') {
      return Promise.resolve().then(function () { return pergunta(String(texto), { sim: op.sim || 'Confirmar', nao: op.nao || 'Cancelar', perigo: op.perigo !== false }); }).then(function (v) { return v === true; }, function () { return false; });
    }
    if (typeof window.confirm === 'function') { try { return Promise.resolve(window.confirm(String(texto)) === true); } catch (e) { /* cai para falso */ } }
    return Promise.resolve(false); // sem como perguntar, na dúvida não apaga
  }

  function ultimo() { podar(); var r = recibos[recibos.length - 1]; return r ? { id: r.id, rotulo: r.rotulo } : null; }
  function pendentes() { podar(); return recibos.length; }
  function init(o) { cfg = o || {}; if (typeof cfg.relogio === 'function') agora = cfg.relogio; }

  window.PaulusConfirmar = { init: init, pedir: pedir, registrar: registrar, desfazer: desfazer, ultimo: ultimo, pendentes: pendentes };
})();
