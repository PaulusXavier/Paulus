/* Paulus — funções puras do "Mapa e rotas" (sem DOM; testáveis em Node: `node tests/mapa-util.test.js`).
 * Coordenadas coladas, busca sem número da casa, distância ao traçado da rota, posição de cada passo e textos de chegada. */
(function (raiz) {
  'use strict';

  const R = 6371000;
  const rad = (g) => g * Math.PI / 180;

  // distância em metros entre dois pontos { lat, lng }
  function distM(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // "2.8235, -60.6758", "2,8235 -60,6758", ou um link do Google Maps (…/@2.8235,-60.6758,17z, ?q=…, destination=…) → { lat, lng } | null
  function lerCoordenadas(txt) {
    const s = String(txt || '').trim();
    if (!s) return null;
    const num = (x) => parseFloat(String(x).replace(',', '.'));
    let m = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(s) || /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(s)
      || /[?&](?:q|query|ll|destination|daddr)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i.exec(s);
    if (!m) m = /^\(?\s*(-?\d{1,2}[.,]\d{3,})\s*(?:[;,]\s*|\s+)(-?\d{1,3}[.,]\d{3,})\s*\)?$/.exec(s);
    if (!m) return null;
    const lat = num(m[1]), lng = num(m[2]);
    return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  }

  // "Rua Santo Agostinho, 193, Centenário" → { texto: "Rua Santo Agostinho, Centenário", numero: "193" }; sem número solto → null.
  // "Rua 7 de Setembro" não perde o "7": só sai um número que esteja no fim ou antes de vírgula.
  function semNumero(q) {
    const t = String(q || '');
    const re = /[\s,]+(?:n[º°o]\.?\s*|n[úu]mero\s*)?(\d{1,5}[A-Za-z]?)(?=\s*(?:,|$))/gi;
    let ult = null, m;
    while ((m = re.exec(t))) ult = m;
    if (!ult) return null;
    const texto = (t.slice(0, ult.index) + t.slice(ult.index + ult[0].length)).replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
    return texto.length >= 3 ? { texto, numero: ult[1].toUpperCase() } : null;
  }

  // Metros por grau na latitude média (projeção plana, boa para distâncias curtas)
  function ptsMetros(pontos, lat0) {
    const kx = Math.cos(rad(lat0)) * R * Math.PI / 180, ky = R * Math.PI / 180;
    return pontos.map((p) => [p[1] * kx, p[0] * ky]);
  }
  // pontos: [[lat,lng],…]; devolve metros acumulados desde o início
  function acumulado(pontos) {
    const cum = [0];
    for (let i = 1; i < pontos.length; i++) cum.push(cum[i - 1] + distM({ lat: pontos[i - 1][0], lng: pontos[i - 1][1] }, { lat: pontos[i][0], lng: pontos[i][1] }));
    return cum;
  }

  // Projeta a posição p { lat, lng } no traçado → { dist: metros até a linha, ao_longo: metros percorridos até o ponto mais próximo }
  function projetar(p, pontos, cum) {
    if (!pontos || !pontos.length) return null;
    if (pontos.length === 1) return { dist: distM(p, { lat: pontos[0][0], lng: pontos[0][1] }), ao_longo: 0 };
    const m = ptsMetros(pontos, p.lat), kx = Math.cos(rad(p.lat)) * R * Math.PI / 180, ky = R * Math.PI / 180;
    const px = p.lng * kx, py = p.lat * ky;
    let melhor = null;
    for (let i = 0; i < m.length - 1; i++) {
      const ax = m[i][0], ay = m[i][1], bx = m[i + 1][0], by = m[i + 1][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (!melhor || d < melhor.dist) melhor = { dist: d, ao_longo: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return melhor;
  }

  // ponto [lat,lng] a d metros do início do traçado
  function pontoNoTraco(pontos, cum, d) {
    if (!pontos.length) return null;
    if (d <= 0) return pontos[0];
    const fim = cum[cum.length - 1];
    if (d >= fim) return pontos[pontos.length - 1];
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1], t = seg ? (d - cum[i - 1]) / seg : 0;
    return [pontos[i - 1][0] + (pontos[i][0] - pontos[i - 1][0]) * t, pontos[i - 1][1] + (pontos[i][1] - pontos[i - 1][1]) * t];
  }

  // Para cada passo: onde ele começa na rota ({ inicio: metros, lat, lng }). O OSRM informa maneuver.location; o mapa offline não:
  // nesse caso usa a soma das distâncias dos passos, ajustada ao comprimento real do traçado.
  function localizarPassos(passos, pontos, cum) {
    const total = cum[cum.length - 1] || 0;
    const soma = (passos || []).reduce((s, p) => s + (p.distance || 0), 0) || 1;
    const esc = total / soma;
    let acc = 0;
    return (passos || []).map((s) => {
      const loc = s.maneuver && s.maneuver.location;
      let lat, lng, inicio;
      if (loc && isFinite(loc[0]) && isFinite(loc[1])) {
        lat = loc[1]; lng = loc[0];
        const pr = projetar({ lat, lng }, pontos, cum); inicio = pr ? pr.ao_longo : acc * esc;
      } else {
        inicio = acc * esc; const pt = pontoNoTraco(pontos, cum, inicio) || [0, 0]; lat = pt[0]; lng = pt[1];
      }
      acc += s.distance || 0;
      return { inicio, lat, lng };
    });
  }

  // índice do passo em andamento, dado o quanto já se percorreu (passo i vale de inicio[i] até inicio[i+1])
  function passoAtual(locais, aoLongo) {
    let i = 0;
    for (let k = 0; k < locais.length; k++) { if (locais[k].inicio <= aoLongo + 15) i = k; else break; }
    return i;
  }

  const fmtDist = (m) => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
  function fmtTempo(s) {
    const min = Math.max(1, Math.round(s / 60));
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') + ' min' : '');
  }
  // hora de chegada (HH:MM) saindo agora
  function horaChegada(segundos, agora) {
    const d = new Date((agora || Date.now()) + segundos * 1000);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }


  const doisDig = (n) => String(n).padStart(2, '0');
  // "HH:MM" de um instante em milissegundos
  const fmtHora = (ms) => { const d = new Date(ms); return doisDig(d.getHours()) + ':' + doisDig(d.getMinutes()); };
  // "08:30" (campo de horário) → instante de hoje nesse horário; vazio ou inválido → agora
  function inicioDe(hhmm, agora) {
    const a = agora != null ? agora : Date.now();
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return a;
    const d = new Date(a); d.setHours(+m[1], +m[2], 0, 0); return d.getTime();
  }

  // Horário previsto de cada ponto da rota. pernas: [{ distance (m), duration (s) }] (uma por trecho: partida→parada 1, …, última parada→destino).
  // opc: { inicio (ms), visitaMin (minutos que se fica em cada parada intermediária; no destino não conta) }.
  // Devolve { etapas: [{ dist, dur, chegada, saida }], fim, dist, dur, parado (segundos de visita) }.
  function cronograma(pernas, opc) {
    opc = opc || {};
    const padrao = Math.max(0, +opc.visitaMin || 0) * 60, vis = opc.visitas || [];   // visitas[i]: minutos da parada i (null = padrão)
    let t = opc.inicio != null ? opc.inicio : Date.now(), dist = 0, dur = 0, parado = 0;
    const etapas = (pernas || []).map((p, i, todas) => {
      const d = Math.max(0, +p.distance || 0), s = Math.max(0, +p.duration || 0);
      t += s * 1000; dist += d; dur += s;
      const chegada = t;
      if (i < todas.length - 1) {      // numa parada do meio a pessoa fica um tempo; no destino a rota acaba
        const v = vis[i] != null && isFinite(vis[i]) ? Math.max(0, +vis[i]) * 60 : padrao;
        t += v * 1000; parado += v;
      }
      return { dist: d, dur: s, chegada, saida: t };
    });
    return { etapas, fim: t, dist, dur, parado };
  }

  // Chegou na parada? Raio = precisão do GPS (entre 35 e 80 m), para não "pular" parada por causa de um GPS ruim nem deixar de contar uma que já passou.
  function alcancouParada(pos, parada, precisao) {
    if (!pos || !parada) return false;
    return distM(pos, parada) <= Math.max(35, Math.min(80, +precisao || 0));
  }

  // Texto do roteiro para copiar/colar (WhatsApp, ficha de visita…). d: { modo, origem, paradas: [{ rotulo }], destino: { rotulo }, cron, inicio, visitaMin, planejado }
  function roteiroTexto(d) {
    const c = d.cron, L = [];
    L.push('Roteiro (' + d.modo + ') — saída ' + (d.planejado ? 'às ' + fmtHora(d.inicio) : 'agora (' + fmtHora(d.inicio) + ')'));
    L.push('Partida: ' + d.origem);
    const pts = (d.paradas || []).concat([d.destino]);
    pts.forEach((q, i) => {
      const e = c && c.etapas[i], ultimo = i === pts.length - 1;
      const rot = ultimo ? 'Destino' : 'Parada ' + (i + 1);
      const fica = e && !ultimo ? Math.round((e.saida - e.chegada) / 60000) : 0;
      L.push(rot + ': ' + q.rotulo + (e ? ' — chegada ' + fmtHora(e.chegada) + ' (' + fmtDist(e.dist) + ', ' + fmtTempo(e.dur) + ')' + (fica > 0 ? ' · visita ' + fica + ' min' : '') : ''));
    });
    if (c) {
      L.push('Deslocamento: ' + fmtDist(c.dist) + ' · ' + fmtTempo(c.dur) + (c.parado ? ' + ' + fmtTempo(c.parado) + ' de visitas' : ''));
      if (c.parado) L.push('Fim previsto: ' + fmtHora(c.fim));
    }
    return L.join('\n');
  }

  // seta que acompanha cada instrução (só enfeite: o texto da instrução sempre existe)
  const SETA = { left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↙', 'sharp right': '↘', straight: '↑', uturn: '↶' };
  function seta(s) {
    const m = (s && s.maneuver) || {};
    if (m.type === 'arrive') return '⚑';
    if (m.type === 'depart') return '▶';
    if (/roundabout|rotary/.test(m.type || '')) return '⟳';
    return SETA[m.modifier] || '↑';
  }

  // Melhor ordem para visitar `pts` ({lat,lng,…}) saindo de `origem` e terminando em `fim` (fixo, opcional):
  // vizinho mais próximo + melhoria 2-opt. Devolve uma cópia reordenada; não altera a lista recebida.
  function ordenarParadas(origem, pts, fim) {
    const n = pts.length; if (n < 2) return pts.slice();
    const rest = pts.slice(), seq = []; let atual = origem;
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((q, i) => { const d = distM(atual, q); if (d < bd) { bd = d; bi = i; } });
      atual = rest.splice(bi, 1)[0]; seq.push(atual);
    }
    const total = (s) => { let t = 0, a = origem; s.forEach((q) => { t += distM(a, q); a = q; }); if (fim) t += distM(a, fim); return t; };
    let melhorou = true, guarda = 0;
    while (melhorou && guarda++ < 50) {
      melhorou = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
        const c = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
        if (total(c) + 1e-6 < total(seq)) { seq.splice(0, n, ...c); melhorou = true; }
      }
    }
    return seq;
  }


  // Rotas longas em grupos por proximidade. O Google Maps aceita 9 paradas intermediárias por link e o link termina em
  // uma chegada: cada trecho cobre até `tam` (10) pontos. Aqui a ordem já sai pensada nesses trechos: o 1º grupo é a
  // vizinhança mais próxima da partida, o 2º é a vizinhança mais próxima de onde o 1º terminou, e assim por diante.
  // `fim` (opcional) é o destino fixo e entra no último grupo. `ordenar(origem, grupo, fim)` ordena dentro de cada grupo
  // (padrão: ordenarParadas). Devolve { lista, grupos } com o tamanho de cada grupo (o destino fixo não entra em `lista`).
  function agruparPorProximidade(origem, pts, fim, tam, ordenar) {
    tam = tam || 10; ordenar = ordenar || ordenarParadas;
    const resto = pts.slice(), lista = [], grupos = []; let cursor = origem;
    while (resto.length + (fim ? 1 : 0) > tam) {
      let si = 0, sd = Infinity;
      resto.forEach((q, i) => { const d = distM(cursor, q); if (d < sd) { sd = d; si = i; } });
      const semente = resto[si];
      const membros = resto.map((q, i) => ({ q, i, d: i === si ? -1 : distM(semente, q) })).sort((a, b) => a.d - b.d).slice(0, tam);
      const idx = new Set(membros.map((m) => m.i)), grupo = membros.map((m) => m.q);
      for (let i = resto.length - 1; i >= 0; i--) if (idx.has(i)) resto.splice(i, 1);
      const seq = ordenar(cursor, grupo, null);
      lista.push(...seq); grupos.push(seq.length); cursor = seq[seq.length - 1];
    }
    const ult = resto.length > 1 || fim ? ordenar(cursor, resto, fim || null) : resto.slice();
    lista.push(...ult); grupos.push(ult.length + (fim ? 1 : 0));
    return { lista, grupos };
  }

  // ---------- navegação por voz, "faltam", lista colada, horário limite e atalhos de compartilhamento ----------
  // distância para falar em voz alta: "400 metros", "1 quilômetro", "2,5 quilômetros" (o leitor de voz lê "400 m" mal)
  function distFala(m) {
    m = Math.max(0, +m || 0);
    if (m < 1000) { const n = Math.max(10, Math.round(m / 50) * 50 || 10); return n + ' metros'; }
    const k = Math.round(m / 100) / 10;
    return (k === 1 ? '1 quilômetro' : String(k).replace('.', ',') + ' quilômetros');
  }
  // Em que "estágio" de aviso o motorista está, dado quanto falta para a próxima manobra (metros) e o tamanho do trecho atual.
  // 0 = longe, 1 = "em 400 metros…" (só em trechos longos), 2 = "em 150 metros…", 3 = "agora".
  function estagioAviso(dist, trecho) {
    if (!isFinite(dist)) return 0;
    if (dist <= 40) return 3;
    if (dist <= 150) return 2;
    if (dist <= 400 && (trecho == null || trecho > 550)) return 1;
    return 0;
  }
  // quanto falta (distância e tempo proporcional) dado o percorrido ao longo do traçado
  function restante(total, aoLongo, duracao) {
    const t = Math.max(0, +total || 0), r = Math.max(0, t - Math.max(0, +aoLongo || 0));
    return { dist: r, dur: t ? (+duracao || 0) * (r / t) : 0 };
  }
  // Lista de endereços colada (um por linha): tira numeração/marcadores, linhas vazias e repetidas.
  function listaDeEnderecos(txt, max) {
    const vistos = new Set(), out = [];
    String(txt || '').split(/\r?\n|;\s*(?=\S)/).forEach((l) => {
      const s = l.replace(/^\s*(?:[-•*·–—]+|\(?\d{1,2}\s*[).:\-–]\s+)\s*/, '').replace(/\s+/g, ' ').trim();
      if (s.length < 3) return;
      const k = s.toLowerCase(); if (vistos.has(k)) return;
      vistos.add(k); out.push(s);
    });
    return { itens: out.slice(0, max || 9), cortados: Math.max(0, out.length - (max || 9)) };
  }
  // Folga até o horário limite do expediente: minutos que sobram (positivo) ou que passam (negativo). Sem horário válido → null.
  function folga(fimMs, limiteHHMM) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(limiteHHMM || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59 || !isFinite(fimMs)) return null;
    const d = new Date(fimMs); d.setHours(+m[1], +m[2], 0, 0);
    return Math.round((d.getTime() - fimMs) / 60000);
  }
  const linkWaze = (p) => 'https://waze.com/ul?ll=' + (+p.lat).toFixed(6) + ',' + (+p.lng).toFixed(6) + '&navigate=yes';
  // Links do Google Maps. O Google aceita no máximo 9 paradas intermediárias por link; acima disso a rota é
  // dividida em trechos encadeados (o destino de um trecho é a origem do seguinte). `o.rotulo === 'Minha posição'`
  // deixa a origem do 1º trecho em aberto (o Google usa a posição em tempo real).
  function linksGoogle(d) {
    const MAX_VIA = 9, pts = [d.origem].concat(d.paradas || [], [d.destino]), links = [];
    const fmt = (q) => q.lat + ',' + q.lng;
    for (let ini = 0; ini < pts.length - 1; ini += MAX_VIA + 1) {
      const fim = Math.min(ini + MAX_VIA + 1, pts.length - 1), via = pts.slice(ini + 1, fim);
      let u = 'https://www.google.com/maps/dir/?api=1&destination=' + fmt(pts[fim]) + '&travelmode=' + d.modo;
      if (!(ini === 0 && d.origem.rotulo === 'Minha posição')) u += '&origin=' + fmt(pts[ini]);
      if (via.length) u += '&waypoints=' + via.map(fmt).join('%7C');
      links.push({ href: u, de: ini, ate: fim });   // de/ate: posições em [partida, paradas…, destino]
    }
    return links;
  }
  const linkWhats = (texto) => 'https://wa.me/?text=' + encodeURIComponent(String(texto || ''));

  // comprimento em linha reta (metros) de origem → pts… → fim (opcional): serve para comparar duas ordens de visita
  function comprimento(origem, pts, fim) {
    let t = 0, a = origem; (pts || []).forEach((q) => { t += distM(a, q); a = q; }); if (fim) t += distM(a, fim); return t;
  }
  // ---------- rota em link (de um aparelho para outro, sem conta) ----------
  // A rota inteira (nome, meio de transporte, partida, paradas, destino e horários) vai em texto no endereço do app, depois do "#"
  // (o "#" nunca é enviado a servidor nenhum). Quem abre o link vê "Rota recebida — Abrir"; nada é aberto sem a pessoa tocar.
  const PREFIXO_ROTA = 'paulus-rota=', MAX_PARADAS_LINK = 30, MAX_LINK = 20000;
  const r6 = (n) => Math.round(+n * 1e6) / 1e6;
  const okPonto = (a) => Array.isArray(a) && isFinite(a[0]) && isFinite(a[1]) && Math.abs(a[0]) <= 90 && Math.abs(a[1]) <= 180;
  const b64 = (str) => { const by = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const deB64 = (t) => { const bin = atob(String(t).replace(/-/g, '+').replace(/_/g, '/')), by = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i); return new TextDecoder('utf-8', { fatal: true }).decode(by); };
  // dados: { nome, modo, origem, paradas: [{lat,lng,rotulo,visita}], destino, saida, limite, visita } → texto curto (base64 url-safe)
  function codificarRota(d) {
    const pt = (q) => [r6(q.lat), r6(q.lng), String(q.rotulo || '').slice(0, 120), q.visita != null && isFinite(q.visita) ? +q.visita : null];
    const o = { v: 1, n: String(d.nome || '').slice(0, 60), m: d.modo, o: d.origem || { tipo: 'pos' }, p: (d.paradas || []).slice(0, MAX_PARADAS_LINK).map(pt), d: pt(d.destino),
      s: d.saida || '', l: d.limite || '', i: d.visita || '0' };
    return b64(JSON.stringify(o));
  }
  // link inteiro (https://…/index.html#paulus-rota=…) → endereço do app + a rota
  const linkDoApp = (base, d) => String(base || '').replace(/#.*$/, '') + '#' + PREFIXO_ROTA + codificarRota(d);
  // "#paulus-rota=…" (ou só o texto) → dados da rota, validados e limpos; qualquer coisa estranha → null
  function decodificarRota(txt) {
    try {
      let t = String(txt || '').trim().replace(/^.*#/, '').replace(/^#/, '');
      if (!t.startsWith(PREFIXO_ROTA)) return null;
      t = t.slice(PREFIXO_ROTA.length); if (!t || t.length > MAX_LINK) return null;
      const o = JSON.parse(deB64(t));
      if (!o || o.v !== 1 || !['carro', 'pe', 'bike'].includes(o.m) || !okPonto(o.d) || !Array.isArray(o.p) || o.p.length > MAX_PARADAS_LINK || !o.p.every(okPonto)) return null;
      const lim = (v, n) => String(v == null ? '' : v).slice(0, n), hhmm = (v) => /^\d{1,2}:\d{2}$/.test(v) ? v : '';
      const ponto = (a) => ({ lat: r6(a[0]), lng: r6(a[1]), rotulo: lim(a[2], 200) || a[0] + ', ' + a[1] });
      const og = o.o && typeof o.o === 'object' ? o.o : {};
      let origem = { tipo: 'pos' };
      if (og.tipo === 'partida') origem = { tipo: 'partida' };
      else if (og.tipo === 'outro') origem = okPonto([og.lat, og.lng]) ? { tipo: 'outro', lat: r6(og.lat), lng: r6(og.lng), rotulo: lim(og.rotulo, 200) } : { tipo: 'outro', rotulo: lim(og.rotulo, 200) };
      return { nome: lim(o.n, 60) || 'Rota recebida', modo: o.m, origem,
        paradas: o.p.map((a) => Object.assign(ponto(a), { visita: a[3] != null && isFinite(a[3]) && a[3] >= 0 && a[3] <= 999 ? +a[3] : null })), destino: ponto(o.d),
        saida: hhmm(lim(o.s, 40)), limite: hhmm(lim(o.l, 40)), visita: /^\d{1,3}$/.test(lim(o.i, 40)) ? lim(o.i, 40) : '0' };
    } catch (e) { return null; }
  }

  const api = { codificarRota, decodificarRota, linkDoApp, PREFIXO_ROTA, comprimento, distFala, estagioAviso, restante, listaDeEnderecos, folga, linkWaze, linksGoogle, linkWhats, fmtHora, inicioDe, cronograma, alcancouParada, roteiroTexto, ordenarParadas, agruparPorProximidade, distM, lerCoordenadas, semNumero, acumulado, projetar, pontoNoTraco, localizarPassos, passoAtual, fmtDist, fmtTempo, horaChegada, seta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PaulusMapaUtil = api;
})(typeof window !== 'undefined' ? window : this);
