// Anotações do Paulus (lista de compras e lembretes), salvas no Firestore da própria pessoa.
// O navegador fala DIRETO com o Firebase (API REST) usando o token do login; nada passa pelo Worker nem pela IA.
// Caminho: paulus_notas/{uid}/itens/{id}. Regra de segurança: veja docs/NOTAS.md.
(function () {
  'use strict';
  var FS = 'https://firestore.googleapis.com/v1/projects/';
  var cfg = {}, itens = [], carregado = false, carregando = null, painel = null, aberto = false, lista = 'tarefas', filtroLista = null, avisoPendencias = null, avisoDispensado = false, listaAvisoDestino = 'tarefas';

  // ---------------------------------------------------------------- texto
  // troca letras acentuadas por letras simples SEM mudar o tamanho do texto (os índices continuam valendo)
  function simples(t) { return String(t).toLowerCase().replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c'); }
  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function separar(t) {
    return String(t).split(/\s*(?:,|;|\n|\s+e\s+)\s*/i).map(function (s) { return s.replace(/^[\s.\-–•]+|[\s.]+$/g, ''); }).filter(function (s) { return s && s.length <= 120; }).slice(0, 30).map(maiuscula);
  }
  var FIM_LISTA = /\s+(?:n[ao]|em|para a|pra|para|a|da)\s+(?:minha\s+|nossa\s+)?(?:lista(?:\s+de\s+compras)?|anotacoes|compras|agenda|tarefas)\s*$/;
  var CONTEXTO = /\b(lista|anotac|compras|mercado|supermercado|agenda|tarefas?)\b/;

  // devolve null (não é comigo: segue para a IA) ou { acao, itens?, alvo?, todos? }
  function interpretar(texto, o) {
    var orig = String(texto || '').trim(), s = simples(orig).replace(/^(?:paulus[,:]?\s+|por favor[,:]?\s+|pode\s+|poderia\s+)+/, '');
    var base = orig.slice(orig.length - s.length);
    if (!s || s.length > 400) return null;
    var m;
    if (/^(?:(?:o que|quais coisas) (?:eu )?(?:tenho|preciso|devo) (?:(?:que|de) )?fazer|o que esta pendente|pendencias?|(?:minhas?|as) tarefas?(?: pendentes?)?|(?:minhas?|a) agenda|(?:qual|como esta) (?:a )?minha agenda|(?:minhas? )?anotacoes? da agenda|(?:ver|mostr\w+|abr\w+|ler) (?:(?:a|as) )?(?:minhas? )?(?:anotacoes? da agenda|agenda|tarefas?)|(?:quais|que) tarefas? (?:eu )?(?:tenho|preciso) (?:(?:que|de) )?fazer|quais (?:sao )?(?:as )?(?:minhas )?tarefas|o que tenho anotado na agenda)\b/.test(s)) return { acao: 'ver', lista: 'tarefas' };
    if (o && o.modoNota) return { acao: 'add', lista: lista, itens: separar(base.replace(/^(?:adicion\w+|anot\w+|coloc\w+|inclu\w+)\s+/i, '').replace(FIM_LISTA, '')) };
    if ((m = /^(?:apag\w+|limp\w+|remov\w+|exclu\w+|tir\w+)\s+(?:todas?\s+)?(?:as\s+|os\s+|todos\s+os\s+|todas\s+as\s+)?(?:\w+\s+)?(?:conclui\w+|comprad\w+|feit\w+|marcad\w+|riscad\w+)(?:\s+d[ao]\s+(?:minha\s+)?(?:lista|compras|tarefas|agenda))?\s*$/.exec(s))) return { acao: 'apagar_feitos', lista: /taref|agenda/.test(s) ? 'tarefas' : 'compras' };
    if (/^(?:limp\w+|esvazi\w+|apag\w+)\s+(?:toda\s+|tudo\s+d[ao]\s+|tudo\s*$)?(?:a\s+|minha\s+)*(?:lista|tudo|anotacoes|compras)?\s*(?:de compras)?\s*$/.test(s) && CONTEXTO.test(s + ' lista') && /lista|tudo|anotac|compras/.test(s)) return { acao: 'apagar_tudo' };
    if ((m = /^(?:apag\w+|remov\w+|exclu\w+|tir\w+)\s+(.+?)\s+d[ao]\s+(?:minha\s+)?(?:lista|compras|anotacoes|agenda|tarefas)\s*$/.exec(s))) return { acao: 'apagar', lista: /agenda|taref/.test(s) ? 'tarefas' : 'compras', alvo: base.slice(s.indexOf(m[1]), s.indexOf(m[1]) + m[1].length) };
    if ((m = /^(?:ja\s+)?(?:comprei|peguei|risquei|risca\w*)\s+(.+)$/.exec(s))) return { acao: 'feito', lista: 'compras', alvo: base.slice(s.length - m[1].length), todos: /^(?:tudo|todos|tudo isso)$/.test(m[1]) };
    if ((m = /^marc\w+\s+(.+?)\s+como\s+(?:comprad|conclui|pego)\w*\s*$/.exec(s))) return { acao: 'feito', lista: /conclui/.test(s) || /taref|agenda/.test(m[1]) ? 'tarefas' : 'compras', alvo: base.slice(s.indexOf(m[1]), s.indexOf(m[1]) + m[1].length), todos: /^(?:tudo|todos|todas)$/.test(m[1]) };
    if ((m = /^(?:conclui\w*|finaliz\w*|terminei|fiz)\s+(.+?)(?:\s+(?:na|da)\s+(?:minha\s+)?(?:agenda|lista de tarefas|tarefas))?\s*$/.exec(s))) return { acao: 'feito', lista: 'tarefas', alvo: base.slice(s.indexOf(m[1]), s.indexOf(m[1]) + m[1].length), todos: /^(?:tudo|todas? as tarefas)$/.test(m[1]) };
    if ((m = /^(?:adicion\w+|anot\w+|lembra\w*|lembrar|agend\w+|marc\w+|coloc\w+|poe|por|inclu\w+|acrescent\w+|bot\w+)\s+(.+?)(?:\s+(?:na|em|para a|pra)\s+(?:minha )?(?:agenda|lista de tarefas|tarefas))\s*$/.exec(s))) {
      var inicioTarefa = s.indexOf(m[1]);
      var tarefa = separar(base.slice(inicioTarefa, inicioTarefa + m[1].length));
      return tarefa.length ? { acao: 'add', lista: 'tarefas', itens: tarefa } : null;
    }
    if ((m = /^(?:adicion\w+|anot\w+|cria\w*|registra\w*|lembra\w*|lembrar)\s+(?:uma?\s+)?(?:tarefa|lembrete)\s*[:,\-]?\s*(.+)$/.exec(s))) {
      var inicioLembrete = s.indexOf(m[1]);
      var lembrete = separar(base.slice(inicioLembrete, inicioLembrete + m[1].length));
      return lembrete.length ? { acao: 'add', lista: 'tarefas', itens: lembrete } : null;
    }
    if ((m = /^(?:adicion\w+|anot\w+|coloc\w+|poe|por|inclu\w+|acrescent\w+|bot\w+)\s+(.+)$/.exec(s)) && CONTEXTO.test(s)) {
      var inicioItem = s.indexOf(m[1]), fimLista = FIM_LISTA.exec(s.slice(inicioItem));
      var fimItem = fimLista ? inicioItem + fimLista.index : s.length;
      var trecho = base.slice(inicioItem, fimItem);
      var it = separar(trecho.replace(/^(?:na|a|em)\s+(?:minha\s+)?lista\s*(?:de compras)?\s*[:,]?\s*/i, ''));
      return it.length ? { acao: 'add', lista: 'compras', itens: it } : null;
    }
    if ((m = /^(?:nao esquecer de|não esquecer de|lembrar de|lembra de|preciso|tenho que|devo)\s+(.+)$/.exec(s)) && !/\bcomprar\b/.test(m[1])) {
      var afazer = separar(base.slice(s.length - m[1].length));
      return afazer.length ? { acao: 'add', lista: 'tarefas', itens: afazer } : null;
    }
    if ((m = /^(?:preciso comprar|tenho que comprar|nao esquecer de comprar|nao esquecer|lembrar de comprar|lembra de comprar|comprar)\s+(.+)$/.exec(s))) {
      var it2 = separar(base.slice(s.length - m[1].length).replace(FIM_LISTA, ''));
      return it2.length ? { acao: 'add', lista: 'compras', itens: it2 } : null;
    }
    if (s.length < 100 && /^(?:o que (?:ainda )?(?:falta|preciso comprar|tenho que comprar|tem na lista)|(?:ver|mostr\w+|le|ler|leia|abr\w+)\s+(?:a\s+)?(?:minha\s+)?(?:lista|anotacoes)|(?:minha\s+)?lista(?: de compras)?\s*\??$|quais (?:itens|coisas) (?:faltam|tem na lista))/.test(s)) return { acao: 'ver', lista: 'compras' };
    return null;
  }

  // ---------------------------------------------------------------- Firebase (REST)
  function jwt(token) { try { var p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4))))); } catch (e) { return null; } }
  function sessao() {
    var S = window.PaulusSessao;
    if (!S || !S.firebase || typeof S.token !== 'function') return Promise.reject(new Error('Precisa entrar com o login do Firebase para usar as anotações.'));
    return Promise.resolve(S.token()).then(function (t) {
      var c = t && jwt(t);
      if (!c || !c.aud || !(c.user_id || c.sub)) throw new Error('Sessão sem identificação do Firebase. Saia e entre de novo.');
      return { t: t, base: FS + encodeURIComponent(c.aud) + '/databases/(default)/documents/paulus_notas/' + encodeURIComponent(c.user_id || c.sub) + '/itens' };
    });
  }
  function chamar(metodo, sufixo, corpo) {
    return sessao().then(function (s) {
      return fetch(s.base + (sufixo || ''), { method: metodo, headers: { Authorization: 'Bearer ' + s.t, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then(function (r) {
        if (r.status === 403) throw new Error('O Firebase recusou o acesso. Falta publicar a regra das anotações (veja docs/NOTAS.md).');
        if (!r.ok) throw new Error('Não consegui falar com o Firebase agora (' + r.status + ').');
        return r.status === 204 ? {} : r.json();
      });
    }).catch(function (e) { throw e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e : new Error('Sem conexão com o Firebase. Confira a internet.'); });
  }
  function doc(d) { var f = d.fields || {}; return { id: d.name.split('/').pop(), texto: (f.texto || {}).stringValue || '', lista: (f.lista || {}).stringValue || 'compras', feito: !!(f.feito || {}).booleanValue, criado: Number((f.criado || {}).integerValue || 0) }; }
  function carregar() {
    if (carregado) return Promise.resolve(itens);
    if (carregando) return carregando;
    carregando = chamar('GET', '?pageSize=300').then(function (j) { itens = (j.documents || []).map(doc).sort(function (a, b) { return a.criado - b.criado; }); carregado = true; desenhar(); carregando = null; return itens; }, function (e) { carregando = null; throw e; });
    return carregando;
  }
  function criar(texto, destino) {
    destino = destino || lista;
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), agora = Date.now();
    return chamar('POST', '?documentId=' + id, { fields: { texto: { stringValue: texto }, lista: { stringValue: destino }, feito: { booleanValue: false }, criado: { integerValue: String(agora) } } })
      .then(function () { itens.push({ id: id, texto: texto, lista: destino, feito: false, criado: agora }); });
  }
  function marcar(it, feito) { return chamar('PATCH', '/' + it.id + '?updateMask.fieldPaths=feito', { fields: { feito: { booleanValue: feito } } }).then(function () { it.feito = feito; }); }
  function apagar(it) { return chamar('DELETE', '/' + it.id).then(function () { itens = itens.filter(function (x) { return x !== it; }); }); }
  function achar(alvo, destino) { var termos = separar(alvo).map(simples); return itens.filter(function (it) { if (destino && it.lista !== destino) return false; var t = simples(it.texto); return termos.some(function (x) { return x && (t.indexOf(x) >= 0 || x.indexOf(t) >= 0); }); }); }
  function todos(fn, lst) { return Promise.all(lst.map(fn)); }
  function txtLista(destino) {
    destino = destino || lista;
    var grupo = itens.filter(function (i) { return i.lista === destino; });
    var p = grupo.filter(function (i) { return !i.feito; }), f = grupo.filter(function (i) { return i.feito; });
    if (!grupo.length) return destino === 'tarefas' ? 'Não há tarefas anotadas. Pode dizer, por exemplo: "anotar preparar a reunião na agenda".' : 'Sua lista de compras está vazia. Diga: "adicionar leite e pão à lista".';
    var t = destino === 'tarefas'
      ? (p.length ? 'Tarefas por fazer (' + p.length + '):\n' + p.map(function (i) { return '- ' + i.texto; }).join('\n') : 'Não há tarefas pendentes.')
      : (p.length ? 'Falta comprar (' + p.length + '):\n' + p.map(function (i) { return '- ' + i.texto; }).join('\n') : 'Tudo comprado.');
    if (destino === 'tarefas' && p.length) t += '\n\nEstas anotações não têm data ou hora associada.';
    return f.length ? t + '\n\nConcluídas (' + f.length + '): ' + f.map(function (i) { return i.texto; }).join(', ') + '.' : t;
  }

  // ---------------------------------------------------------------- executar (usado por texto e por voz)
  function executar(c) {
    var pronto = carregado ? Promise.resolve() : carregar();
    return pronto.then(function () {
      if (c.acao === 'ver') return txtLista(c.lista || lista);
      if (c.acao === 'add') {
        var destino = c.lista || lista;
        var novos = c.itens.filter(function (t) { return !itens.some(function (i) { return i.lista === destino && !i.feito && simples(i.texto) === simples(t); }); });
        if (!novos.length) return 'Já está na lista: ' + c.itens.join(', ') + '.';
        return todos(function (t) { return criar(t, destino); }, novos).then(function () { desenhar(); notificarPendencias(); return (destino === 'tarefas' ? 'Anotei na agenda: ' : 'Anotei na lista: ') + novos.join(', ') + '. ' + itens.filter(function (i) { return i.lista === destino && !i.feito; }).length + (destino === 'tarefas' ? ' tarefas pendentes.' : ' itens por comprar.'); });
      }
      if (c.acao === 'feito') {
        var a = c.todos ? itens.filter(function (i) { return (!c.lista || i.lista === c.lista) && !i.feito; }) : achar(c.alvo, c.lista).filter(function (i) { return !i.feito; });
        if (!a.length) return 'Não achei "' + c.alvo + '" entre os itens pendentes.';
        return todos(function (i) { return marcar(i, true); }, a).then(function () { desenhar(); notificarPendencias(); var tarefas = a.some(function (i) { return i.lista === 'tarefas'; }); var restantes = itens.filter(function (i) { return i.lista === (tarefas ? 'tarefas' : 'compras') && !i.feito; }).length; return (tarefas ? 'Marquei como concluída: ' : 'Marquei como comprada: ') + a.map(function (i) { return i.texto; }).join(', ') + '. ' + (restantes ? (tarefas ? 'Restam ' + restantes + ' tarefas pendentes.' : 'Faltam ' + restantes + ' itens por comprar.') : (tarefas ? 'Não há mais tarefas pendentes.' : 'Não falta mais nada na lista de compras.')); });
      }
      if (c.acao === 'apagar') {
        var b = achar(c.alvo, c.lista);
        if (!b.length) return 'Não achei "' + c.alvo + '" na lista.';
        return todos(apagar, b).then(function () { desenhar(); notificarPendencias(); return 'Apaguei: ' + b.map(function (i) { return i.texto; }).join(', ') + '.'; });
      }
      if (c.acao === 'apagar_feitos') {
        var d = itens.filter(function (i) { return i.feito && (!c.lista || i.lista === c.lista); });
        if (!d.length) return 'Não há itens concluídos para apagar.';
        return todos(apagar, d).then(function () { desenhar(); notificarPendencias(); return 'Apaguei ' + d.length + ' item(ns) concluído(s).'; });
      }
      if (c.acao === 'apagar_tudo') {
        var tudo = itens.filter(function (i) { return !c.lista || i.lista === c.lista; });
        if (!tudo.length) return 'A lista já está vazia.';
        if (cfg.confirmar && !cfg.confirmar('Apagar TODAS as ' + tudo.length + ' anotações?')) return 'Certo, não apaguei nada.';
        return todos(apagar, tudo).then(function () { desenhar(); notificarPendencias(); return 'Lista apagada.'; });
      }
      return '';
    });
  }

  // ---------------------------------------------------------------- painel
  function el(tag, at, filhos) { var e = document.createElement(tag); Object.keys(at || {}).forEach(function (k) { if (k === 'text') e.textContent = at[k]; else if (k === 'on') Object.keys(at.on).forEach(function (v) { e.addEventListener(v, at.on[v]); }); else e.setAttribute(k, at[k]); }); (filhos || []).forEach(function (f) { if (f) e.appendChild(f); }); return e; }
  function erro(e) { var s = painel && painel.querySelector('.ns'); if (s) { s.textContent = e.message || String(e); s.className = 'ns erro'; } }
  function ok() { var s = painel && painel.querySelector('.ns'); if (s) { s.textContent = ''; s.className = 'ns'; } }
  function notificarPendencias() {
    var pendentesTarefas = itens.filter(function (i) { return i.lista === 'tarefas' && !i.feito; });
    var pendentesCompras = itens.filter(function (i) { return i.lista === 'compras' && !i.feito; });
    if (!pendentesTarefas.length && !pendentesCompras.length) { if (avisoPendencias) avisoPendencias.hidden = true; return; }
    if (!avisoPendencias) {
      var gruposAviso = el('div', { class: 'nt-grupos' });
      var abrir = el('button', { type: 'button', class: 'nt-abrir', text: 'Abrir pendências' });
      abrir.addEventListener('click', function () { avisoDispensado = true; lista = listaAvisoDestino; if (filtroLista) filtroLista.value = lista; mostrar(true); avisoPendencias.hidden = true; });
      var fechar = el('button', { type: 'button', class: 'nt-fechar', text: 'Dispensar', 'aria-label': 'Dispensar aviso de pendências' });
      fechar.addEventListener('click', function () { avisoDispensado = true; avisoPendencias.hidden = true; });
      avisoPendencias = el('section', { id: 'nt-aviso', role: 'region', 'aria-label': 'Resumo das pendências nas anotações' }, [
        el('div', { class: 'nt-topo' }, [el('strong', { class: 'nt-titulo', text: 'Pendências nas anotações' }), fechar]),
        el('p', { class: 'nt-resumo', role: 'status', 'aria-live': 'polite' }), gruposAviso,
        el('p', { class: 'nt-sem-prazo', text: 'As anotações não têm data ou hora associada.' }),
        abrir
      ]);
      document.body.appendChild(avisoPendencias);
    }
    var resumo = [];
    if (pendentesTarefas.length) resumo.push(pendentesTarefas.length + (pendentesTarefas.length === 1 ? ' tarefa na agenda' : ' tarefas na agenda'));
    if (pendentesCompras.length) resumo.push(pendentesCompras.length + (pendentesCompras.length === 1 ? ' item na lista de compras' : ' itens na lista de compras'));
    listaAvisoDestino = pendentesTarefas.length ? 'tarefas' : 'compras';
    avisoPendencias.querySelector('.nt-resumo').textContent = resumo.join(' · ');
    var grupos = avisoPendencias.querySelector('.nt-grupos'); grupos.textContent = '';
    [[ 'Agenda e tarefas', pendentesTarefas ], [ 'Lista de compras', pendentesCompras ]].forEach(function (grupo) {
      if (!grupo[1].length) return;
      var ul = el('ul', { class: 'nt-itens' });
      grupo[1].slice(0, 3).forEach(function (i) { ul.appendChild(el('li', { text: i.texto })); });
      if (grupo[1].length > 3) ul.appendChild(el('li', { class: 'nt-mais', text: 'E mais ' + (grupo[1].length - 3) + '…' }));
      grupos.appendChild(el('div', { class: 'nt-grupo' }, [el('h3', { class: 'nt-grupo-titulo', text: grupo[0] }), ul]));
    });
    abrir.textContent = pendentesTarefas.length ? 'Abrir agenda e tarefas' : 'Abrir lista de compras';
    avisoPendencias.hidden = avisoDispensado;
  }
  function criarPainel() {
    var inp = el('input', { type: 'text', class: 'ni', placeholder: 'Ex.: preparar a reunião', maxlength: '120', 'aria-label': 'Nova tarefa ou item de compras' });
    filtroLista = el('select', { class: 'nf', 'aria-label': 'Tipo de anotação' }, [el('option', { value: 'tarefas', text: 'Agenda e tarefas' }), el('option', { value: 'compras', text: 'Lista de compras' })]);
    filtroLista.value = lista;
    filtroLista.addEventListener('change', function () { lista = filtroLista.value; desenhar(); });
    function adicionar() { var t = separar(inp.value); if (!t.length) return; inp.value = ''; executar({ acao: 'add', lista: lista, itens: t }).then(ok, erro); }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
    painel = el('div', { id: 'np', role: 'dialog', 'aria-label': 'Anotações', hidden: '' }, [
      el('h2', { text: 'Agenda e anotações' }),
      filtroLista,
      el('div', { class: 'nl', 'aria-live': 'polite' }),
      el('div', { class: 'na' }, [inp, el('button', { type: 'button', class: 'nb', text: 'Adicionar', on: { click: adicionar } })]),
      el('div', { class: 'na' }, [
        el('button', { type: 'button', class: 'nd', text: 'Ditar', title: 'Dite uma tarefa ou um item da categoria selecionada', on: { click: function () { if (cfg.ditar) cfg.ditar(); } } }),
        el('button', { type: 'button', class: 'nd', text: 'Apagar concluídos', on: { click: function () { executar({ acao: 'apagar_feitos', lista: lista }).then(ok, erro); } } })
      ]),
      el('p', { class: 'ns', role: 'status' })
    ]);
    document.body.appendChild(painel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberto) mostrar(false); });
  }
  function desenhar() {
    if (!painel) return;
    var l = painel.querySelector('.nl'); l.textContent = '';
    var atuais = itens.filter(function (i) { return i.lista === lista; });
    var pendentes = atuais.filter(function (i) { return !i.feito; }).length;
    var tit = painel.querySelector('h2'); if (tit) tit.textContent = (lista === 'tarefas' ? 'Agenda e tarefas' : 'Lista de compras') + ' · ' + pendentes + ' pendente(s)';
    if (!atuais.length) { l.appendChild(el('p', { class: 'nv', text: lista === 'tarefas' ? 'Ainda não há tarefas. Escreva uma tarefa ou diga: "anotar preparar a reunião na agenda".' : 'Nada na lista. Escreva um item ou diga: "adicionar leite e pão à lista".' })); return; }
    var ord = atuais.filter(function (i) { return !i.feito; }).concat(atuais.filter(function (i) { return i.feito; }));
    ord.forEach(function (it) {
      l.appendChild(el('div', { class: 'ni-l' + (it.feito ? ' feito' : '') }, [
        el('button', { type: 'button', class: 'nk', role: 'checkbox', 'aria-checked': String(it.feito), 'aria-label': (it.feito ? 'Reabrir ' : lista === 'tarefas' ? 'Marcar como concluída: ' : 'Marcar como comprada: ') + it.texto, text: it.feito ? '✓' : '', on: { click: function () { marcar(it, !it.feito).then(function () { desenhar(); notificarPendencias(); ok(); }, erro); } } }),
        el('span', { class: 'nt', text: it.texto }),
        el('button', { type: 'button', class: 'nx', 'aria-label': 'Apagar ' + it.texto, text: '×', on: { click: function () { apagar(it).then(function () { desenhar(); notificarPendencias(); ok(); }, erro); } } })
      ]));
    });
  }
  function mostrar(v) {
    if (!painel) criarPainel();
    aberto = typeof v === 'boolean' ? v : !aberto; painel.hidden = !aberto;
    var b = document.getElementById('nt'); if (b) { b.setAttribute('aria-expanded', String(aberto)); b.classList.toggle('on', aberto); }
    if (aberto) { desenhar(); carregar().then(ok, erro); var i = painel.querySelector('.ni'); if (i && window.innerWidth > 700) i.focus(); }
  }
  function init(o) {
    cfg = o || {};
    var b = document.getElementById('nt'); if (b) b.addEventListener('click', function () { mostrar(); });
    // O script só é carregado depois da autenticação; o aviso é do próprio app, não é uma notificação do sistema.
    carregar().then(notificarPendencias, function () { /* a consola continua utilizável; o painel pode tentar carregar novamente */ });
  }

  window.PaulusNotas = { init: init, interpretar: interpretar, executar: executar, abrir: mostrar, _simples: simples };
})();
