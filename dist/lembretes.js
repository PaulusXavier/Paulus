// Lembretes com horário do Paulus: "me lembre de ligar para a escola amanhã às 15h".
// Tudo fica NESTE aparelho (localStorage); nada vai ao Worker, à IA ou ao Firebase. Não é lugar para dado de família.
// O aviso é do próprio app (faixa na tela, e notificação do sistema só se a pessoa já tiver permitido). Só dispara com o app aberto.
(function () {
  'use strict';
  var CHAVE = 'paulus.lembretes', CHAVE_MUDO = 'paulus.lembretes.mudo', MAX = 100;
  var cfg = {}, lista = null, temporizador = 0;
  var DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  var NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, meia: 0.5 };

  function simples(t) { return String(t).toLowerCase().replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c'); }
  function dois(n) { return ('0' + n).slice(-2); }
  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  // ---------------------------------------------------------------- tempo
  var P_NUM = '(\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)';
  var RE_DAQUI = new RegExp('\\b(?:daqui a|daqui|em|dentro de)\\s+(?:uma?\\s+)?' + P_NUM + '?\\s*(minutos?|min|horas?|h|dias?)\\b(?:\\s+e\\s+meia)?');
  var RE_HORA = /\b(?:as|a|ao|pelas?)?\s*(\d{1,2})\s*(?:(?:h|:)\s*(\d{2})?|horas?(?:\s+e\s+(\d{1,2}|meia))?|(?=\s+da\s+(?:manha|tarde|noite|madrugada)\b))\s*(?:da\s+(manha|tarde|noite|madrugada))?(?!\d)/;
  var RE_DATA = /\b(?:dia\s+)?(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b|\bdia\s+(\d{1,2})\b/;

  function numero(w) { if (w == null || w === '') return 1; var n = Number(String(w).replace(',', '.')); return isNaN(n) ? (NUM[w] != null ? NUM[w] : 1) : n; }
  function ajustarPeriodo(h, periodo) {
    if (!periodo) return h;
    if ((periodo === 'tarde' || periodo === 'noite') && h < 12) return h + 12;
    if (periodo === 'manha' && h === 12) return 0;
    return h;
  }

  // Devolve { quando: ms, trecho: [pedaços do texto que são "quando"] } ou null. `agora` é um Date (testável).
  function quandoDe(s, agora) {
    var m, trechos = [], alvo = new Date(agora.getTime()), temDia = false, temHora = false, hh = 9, mm = 0;
    if ((m = RE_DAQUI.exec(s))) {
      var q = numero(m[1]), un = m[2].charAt(0) === 'm' ? 60000 : m[2].charAt(0) === 'h' ? 3600000 : 86400000;
      var extra = /\be\s+meia/.test(m[0]) ? un / 2 : 0;
      trechos.push(m[0]);
      return { quando: agora.getTime() + q * un + extra, trechos: trechos, relativo: true };
    }
    if (/\bamanha\b/.test(s) && !/\bamanha\s+(?:de|da)\s+(?:manha)/.test(s)) { alvo.setDate(alvo.getDate() + 1); temDia = true; trechos.push('amanha'); }
    else if (/\bdepois de amanha\b/.test(s)) { alvo.setDate(alvo.getDate() + 2); temDia = true; trechos.push('depois de amanha'); }
    else if (/\bhoje\b/.test(s)) { temDia = true; trechos.push('hoje'); }
    else if (/\b(?:esta|nesta)\s+noite\b|\bhoje a noite\b/.test(s)) { temDia = true; trechos.push('esta noite'); }
    if (!temDia && (m = RE_DATA.exec(s))) {
      var dia = Number(m[1] || m[4]), mes = m[2] ? Number(m[2]) - 1 : alvo.getMonth(), ano = m[3] ? Number(m[3]) : alvo.getFullYear();
      if (ano < 100) ano += 2000;
      if (dia < 1 || dia > 31 || mes < 0 || mes > 11) return null;
      alvo = new Date(ano, mes, dia, 0, 0, 0, 0);
      if (alvo.getDate() !== dia) return null; // 31/02
      if (!m[3] && alvo.getTime() < new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) alvo = new Date(ano + (m[2] ? 1 : 0), m[2] ? mes : mes + 1, dia);
      temDia = true; trechos.push(m[0].replace(/^\s+/, ''));
    }
    if (!temDia) {
      var nomes = Object.keys(DIAS);
      for (var i = 0; i < nomes.length; i++) {
        var rd = new RegExp('\\b(?:na |no |proxima |proximo |nesta |neste )?' + nomes[i] + '(?:-feira)?\\b');
        if ((m = rd.exec(s))) {
          var dif = (DIAS[nomes[i]] - agora.getDay() + 7) % 7;
          if (dif === 0 && !/\bhoje\b/.test(s)) dif = 7;
          alvo.setDate(alvo.getDate() + dif); temDia = true; trechos.push(m[0]); break;
        }
      }
    }
    var sh = s.replace(RE_DATA, ' ');
    if ((m = RE_HORA.exec(sh)) && (m[2] != null || /h|hora|as |a /.test(m[0]) || m[4])) {
      var h = Number(m[1]);
      var minutos = m[2] != null ? Number(m[2]) : m[3] === 'meia' ? 30 : m[3] ? Number(m[3]) : 0;
      if (h <= 23 && minutos <= 59 && (m[2] != null || m[4] || /\bh\b|\dh|hora/.test(m[0]))) {
        hh = ajustarPeriodo(h, m[4]); mm = minutos; temHora = true; trechos.push(m[0].replace(/^\s+/, ''));
      }
    } else if (/\bmeio[- ]dia\b/.test(s)) { hh = 12; temHora = true; trechos.push('meio-dia'); }
    else if (/\bmeia[- ]noite\b/.test(s)) { hh = 0; temHora = true; trechos.push('meia-noite'); if (!temDia) alvo.setDate(alvo.getDate() + 1); }
    if (!temDia && !temHora) return null;
    if (!temHora && /\bnoite\b/.test(s)) hh = 20;
    alvo.setHours(hh, mm, 0, 0);
    if (!temDia && alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1); // só a hora: próxima vez que ela ocorre
    return { quando: alvo.getTime(), trechos: trechos, relativo: false };
  }

  // devolve null (não é comigo) ou { acao: 'criar'|'listar'|'cancelar'|'silenciar'|'ativar', ... }
  function interpretar(texto, agora) {
    var orig = String(texto || '').trim(), s0 = simples(orig).replace(/^(?:paulus[,:]?\s+|por favor[,:]?\s+|pode\s+|poderia\s+)+/, '');
    if (!s0 || s0.length > 300) return null;
    var base = orig.slice(orig.length - s0.length), m;
    if (/^(?:(?:ver|mostr\w+|list\w+|quais(?: sao)?|abr\w+)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+)?lembretes?|(?:meus\s+)?lembretes?(?:\s+(?:agendados|pendentes|de hoje))?\s*\??)\s*$/.test(s0)) return { acao: 'listar' };
    if (/^(?:silenci\w+|pausar?|desligu?\w*|desativ\w+|nao (?:me )?avis\w+)\s+(?:os\s+|todos os\s+)?(?:avisos?|lembretes?)(?:\s+de lembretes?)?\s*$/.test(s0)) return { acao: 'silenciar' };
    if (/^(?:ativ\w+|ligu?\w*|reativ\w+|volt\w+ a avisar)\s+(?:os\s+)?(?:avisos?|lembretes?)\s*$/.test(s0)) return { acao: 'ativar' };
    if ((m = /^(?:cancel\w+|apag\w+|remov\w+|exclu\w+|tir\w+)\s+(?:o\s+|os\s+|todos os\s+|todas as\s+)?lembretes?\s*(?:d[eoa]s?\s+|sobre\s+)?(.*)$/.exec(s0))) {
      var alvo = base.slice(s0.length - m[1].length).trim();
      return { acao: 'cancelar', alvo: alvo, todos: /\btodos?\b/.test(s0) && !alvo || /^(?:todos|todas)$/.test(simples(alvo)) };
    }
    var corpo;
    if ((m = /^(?:me\s+)?(?:lembr\w+|avis\w+|alert\w+)(?:\s*-\s*me|\s+me)?\s+(?:de|para|que)\s+(.+)$/.exec(s0)) || (m = /^(?:criar|agendar|marcar|colocar|anotar)\s+(?:um\s+)?lembrete\s*(?:para|de|:)?\s*(.+)$/.exec(s0)) || (m = /^lembrete\s*[:\-]?\s*(.+)$/.exec(s0))) corpo = m[1];
    else if ((m = /^(?:me\s+)?(?:lembr\w+|avis\w+)(?:\s*-\s*me)?\s+(.+)$/.exec(s0)) && /\b(?:amanha|hoje|\d\s*h|\d:\d\d|daqui|em \d)/.test(s0)) corpo = m[1];
    if (!corpo) return null;
    var ref = agora instanceof Date ? agora : new Date();
    var q = quandoDe(corpo, ref);
    if (!q) return { acao: 'sem_hora', texto: maiuscula(base.slice(s0.length - corpo.length).trim()) };
    // tira do texto original os pedaços que eram só "quando" (mesmos índices, pois simples() não muda o tamanho)
    var limpo = corpo, orign = base.slice(s0.length - corpo.length);
    q.trechos.forEach(function (t) { var i = limpo.indexOf(t); if (i >= 0) { limpo = limpo.slice(0, i) + ' '.repeat(t.length) + limpo.slice(i + t.length); orign = orign.slice(0, i) + ' '.repeat(t.length) + orign.slice(i + t.length); } });
    var o = orign.replace(/\s+/g, ' ').replace(/\s+(?:e|as|a|ao|pelas?|de|da|do|no|na|em)\s*$/i, '').replace(/^\s*(?:que\s+)?/i, '').replace(/[\s,.;:–-]+$/, '').replace(/^[\s,.;:–-]+/, '').trim();
    o = o.replace(/\s+(?:as|a|ao|em|no|na|dia|para)\s*$/i, '').trim();
    if (!o) return { acao: 'sem_hora', texto: '' };
    return { acao: 'criar', texto: maiuscula(o.slice(0, 160)), quando: q.quando };
  }

  // ---------------------------------------------------------------- agenda local
  function ler() {
    if (lista) return lista;
    lista = [];
    try { var j = JSON.parse(localStorage.getItem(CHAVE) || '[]'); if (Array.isArray(j)) lista = j.filter(function (x) { return x && typeof x.texto === 'string' && typeof x.quando === 'number'; }); } catch (e) { /* sem armazenamento: só nesta sessão */ }
    return lista;
  }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(-MAX))); } catch (e) { /* segue na memória */ } }
  function mudo() { try { return localStorage.getItem(CHAVE_MUDO) === '1'; } catch (e) { return !!cfg._mudo; } }
  function definirMudo(v) { cfg._mudo = !!v; try { localStorage.setItem(CHAVE_MUDO, v ? '1' : '0'); } catch (e) { /* segue */ } }

  function criar(texto, quando) {
    ler();
    var l = { id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto: texto, quando: quando, avisado: false };
    lista.push(l); lista.sort(function (a, b) { return a.quando - b.quando; }); gravar(); return l;
  }
  function pendentes() { return ler().filter(function (l) { return !l.avisado; }); }
  function quandoTexto(ms, agora) {
    var d = new Date(ms), a = agora || new Date(), dia0 = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var dif = Math.round((dia0(d) - dia0(a)) / 86400000);
    var rot = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : dois(d.getDate()) + '/' + dois(d.getMonth() + 1);
    return rot + ' às ' + dois(d.getHours()) + ':' + dois(d.getMinutes());
  }
  function txtLista(agora) {
    var p = pendentes();
    if (!p.length) return 'Você não tem lembretes agendados. Diga, por exemplo: "me lembre de ligar para a escola amanhã às 15h".';
    return 'Lembretes agendados (' + p.length + '):\n' + p.map(function (l) { return '- ' + quandoTexto(l.quando, agora) + ' · ' + l.texto; }).join('\n') + (mudo() ? '\n\nOs avisos estão silenciados; diga "ativar lembretes" para voltar a ser avisado.' : '');
  }

  function executar(c, agora) {
    var rec = null;
    if (c.acao === 'sem_hora') return Promise.resolve('Não entendi quando devo avisar. Diga o dia e a hora, por exemplo: "me lembre de ' + (c.texto ? c.texto.charAt(0).toLowerCase() + c.texto.slice(1) : 'ligar para a escola') + ' amanhã às 15h".');
    if (c.acao === 'criar') {
      var ref = agora || new Date();
      if (c.quando <= ref.getTime()) return Promise.resolve('Esse horário já passou. Diga um horário futuro.');
      var l = criar(c.texto, c.quando); pedirPermissao();
      var extra = mudo() ? ' Os avisos estão silenciados no momento.' : ' Aviso só com o Paulus aberto neste aparelho.';
      return Promise.resolve('Combinado. Aviso ' + quandoTexto(l.quando, ref) + ': ' + l.texto + '.' + extra);
    }
    if (c.acao === 'listar') return Promise.resolve(txtLista(agora));
    if (c.acao === 'silenciar') { definirMudo(true); return Promise.resolve('Avisos de lembrete silenciados. Os lembretes continuam guardados; diga "ativar lembretes" para voltar.'); }
    if (c.acao === 'ativar') { definirMudo(false); return Promise.resolve('Avisos de lembrete ativados.'); }
    if (c.acao === 'cancelar') {
      var p = pendentes(), alvo = simples(c.alvo || '').trim();
      var achados = c.todos ? p : alvo ? p.filter(function (l) { var t = simples(l.texto); return t.indexOf(alvo) >= 0 || alvo.indexOf(t) >= 0; }) : (p.length === 1 ? p : []);
      if (!achados.length) return Promise.resolve(alvo ? 'Não achei lembrete com "' + c.alvo + '". Diga "meus lembretes" para ver a lista.' : (p.length ? 'Qual lembrete cancelar? Diga "meus lembretes" para ver a lista e "cancelar lembrete" com parte do texto.' : 'Você não tem lembretes agendados.'));
      var copia = achados.map(function (l) { return { id: l.id, texto: l.texto, quando: l.quando, avisado: false }; }), ids = achados.map(function (l) { return l.id; });
      lista = ler().filter(function (l) { return ids.indexOf(l.id) < 0; }); gravar();
      var C = window.PaulusConfirmar;
      if (C) rec = C.registrar(achados.length === 1 ? 'Lembrete cancelado' : 'Lembretes cancelados (' + achados.length + ')', function () { copia.forEach(function (x) { ler().push(x); }); lista.sort(function (a, b) { return a.quando - b.quando; }); gravar(); });
      ultimo = rec;
      return Promise.resolve('Cancelei ' + (achados.length === 1 ? 'o lembrete: ' : achados.length + ' lembretes: ') + achados.map(function (l) { return l.texto; }).join('; ') + '.');
    }
    return Promise.resolve('');
  }
  var ultimo = null;

  // ---------------------------------------------------------------- avisos
  function pedirPermissao() {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default' && cfg.pedirNotificacao === true) Notification.requestPermission(); } catch (e) { /* sem notificação do sistema */ }
  }
  function disparar(agora) {
    var t = (agora || new Date()).getTime(), vencidos = ler().filter(function (l) { return !l.avisado && l.quando <= t; });
    if (!vencidos.length) return [];
    vencidos.forEach(function (l) { l.avisado = true; });
    var limite = t - 7 * 86400000; lista = lista.filter(function (l) { return !l.avisado || l.quando > limite; });
    gravar();
    if (!mudo()) {
      vencidos.forEach(function (l) {
        if (typeof cfg.avisar === 'function') { try { cfg.avisar(l); } catch (e) { /* segue */ } }
        try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification('Paulus · lembrete', { body: l.texto, tag: l.id }); } catch (e) { /* segue */ }
      });
    }
    return vencidos;
  }
  function init(o) {
    cfg = o || {}; ler();
    if (temporizador) clearInterval(temporizador);
    disparar();
    temporizador = setInterval(function () { disparar(); }, 20000);
  }

  window.PaulusLembretes = {
    init: init, interpretar: interpretar, executar: executar, disparar: disparar, pendentes: pendentes,
    recibo: function () { var r = ultimo; ultimo = null; return r; },
    _quandoDe: quandoDe, _redefinir: function () { lista = null; }
  };
})();
