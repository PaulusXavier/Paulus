/* Paulus — "Mapa e rotas": procura de endereços (como no Google Maps) e rota a partir da posição do aparelho.
 * Mapa: Leaflet (vendor/leaflet, carregado só quando a seção aparece) + OpenStreetMap.
 * Busca de endereço: Nominatim. Rota: routing.openstreetmap.de (OSRM). Não precisa de chave.
 * Com internet, só o texto do endereço digitado e as coordenadas (posição/destino) saem do aparelho; nada é guardado — a não ser a rota que a pessoa manda "Salvar" (vai para a conta dela).
 * OFFLINE: depois de "Baixar mapa offline" (mapa-offline.js: ruas de Boa Vista guardadas no aparelho), a busca, o
 * toque no mapa, a rota com passo a passo e o desenho das ruas funcionam sem internet — automaticamente quando a rede
 * falha, ou sempre, se o usuário marcar "Usar sempre o mapa offline".
 * Funções puras (coordenadas coladas, distância ao traçado, posição dos passos…) ficam em mapa-util.js (testes: tests/mapa-util.test.js).
 * Rotas salvas: "Salvar rota" guarda nome, partida fixa, paradas, destino e horários na conta (Firestore: users/{uid}/rotas/{id}, via window.__paulusRotas do index.html) e a lista aparece em todos os aparelhos.
 * Também: voz de navegação (speechSynthesis do aparelho), "faltam…" ao acompanhar, "Cheguei" na parada, lista de endereços colada,
 * "Voltar à partida", horário limite do expediente, atalhos Waze/WhatsApp e camada de satélite (Esri). */
(function () {
  'use strict';
  const sec = document.getElementById('mapaRotas');
  if (!sec) return;
  const $ = (id) => document.getElementById(id);
  const U = window.PaulusMapaUtil;
  const FOCO = window.PaulusMapaFoco || null;   // bairros de foco (13 de Setembro e Araceli): mapa-foco.js
  let escopo = (FOCO && FOCO.porId(lerPref('paulusMapaEscopo', ''))) ? lerPref('paulusMapaEscopo', '') : '';   // bairro fixado nos chips de busca
  if (!U) { const st = $('mapaStatus'); if (st) { st.textContent = 'Não consegui carregar o mapa (arquivo mapa-util.js ausente).'; st.className = 'mp-status is-erro'; } return; }

  const PARTIDA = { rotulo: 'Rua Santo Agostinho, 193 — Centenário, Boa Vista/RR', consulta: 'Rua Santo Agostinho 193, Centenário, Boa Vista, Roraima' };
  const CENTRO = [2.8235, -60.6758];                 // Boa Vista/RR
  const VIEWBOX = '-60.85,2.95,-60.55,2.70';         // esquerda,topo,direita,base: Boa Vista e entorno
const LIMITE_ROTA_FORA = 120;                       // metros: acima disso, no modo Acompanhar, a rota é recalculada
  const PERFIS = {
    carro: { caminho: 'routed-car', google: 'driving' },
    pe:    { caminho: 'routed-foot', google: 'walking' },
    bike:  { caminho: 'routed-bike', google: 'bicycling' }
  };
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const ROTAS = 'https://routing.openstreetmap.de';
  const MAX_PARADAS = 30;                                          // paradas por rota (mais o destino final)
  const ROTAS_RESERVA = 'https://router.project-osrm.org';     // só carro/moto; usado se o principal falhar
  const LIMITE_LONGE = 40000;                                  // metros: destino mais longe que isso de Boa Vista ganha um aviso

  let L = null, mapa = null, camadaRota = null, mDestino = null, mOrigem = null, mPos = null, circPos = null;
  let posicao = null;            // { lat, lng, precisao }
  let destino = null;            // { lat, lng, rotulo }
  let partidaCache = null;       // coordenadas do endereço de partida padrão (só nesta sessão)
  let modo = lerPref('paulusMapaModo', 'carro'); if (!PERFIS[modo]) modo = 'carro';
  let senha = 0;                 // descarta respostas antigas quando o usuário já pediu outra coisa
  let promessaLeaflet = null, ultimoNominatim = 0;
  const AMO = window.PaulusMapaOffline || null;
  let motor = null;              // mapa offline carregado (ou null)
  let camadaTiles = null, vetor = null, ClasseVetor = null, vetorAuto = false, errosTile = 0, baixando = null;
  let sempreOffline = lerPref('paulusMapaSempreOffline', '0') === '1';
  let ampliadaPref = lerPref('paulusMapaAmpliada', '0') === '1';   // baixar também estradas/povoados do entorno
  let parciaisN = 0;             // pedaços de um download interrompido que ainda dá para retomar
  let avisoDestino = '';         // ex.: "o número 193 não está no mapa offline"
  let rotas = [], rotaSel = 0, origemAtual = null, trilha = null;   // rotas: alternativas; trilha: pontos/acumulado/passos da escolhida
  let feitas = [];             // paradas já resolvidas nesta rota: [{ q, estado: 'concluida' | 'pulada', idx }] (só na tela; não vai para a rota salva)
  let paradas = [], grupoParadas = null;   // paradas no meio do caminho: [{ lat, lng, rotulo }] (o destino fica sempre por último)
  let origemOutro = null;        // partida escolhida por "Inverter": { lat, lng, rotulo }
  let ultimoZoom = 0;
  let mPasso = null, soltoAte = 0, ultimoRecalculo = 0, seguindo = false, vigia = null, travaTela = null;
  let camadaSat = null, satelite = lerPref('paulusMapaSatelite', '0') === '1';          // imagem de satélite (Esri) em vez do mapa de ruas
  const temVoz = () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  let vozNav = lerPref('paulusMapaVozNav', '1') === '1';                               // avisos falados no modo Acompanhar
  const cacheBusca = new Map();  // só na memória desta sessão: repete a mesma busca sem gastar internet
  const PARTIDA_CHAVE = 'paulusMapaPartida';
  const usarOffline = () => !!motor && (sempreOffline || navigator.onLine === false);
  const DICA_OFFLINE = ' Dica: baixe o mapa offline (em "Partida, posição e mapa offline") para usar sem internet.';

  function lerPref(k, f) { try { return localStorage.getItem(k) || f; } catch (e) { return f; } }
  function gravarPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: tudo bem */ } }

  function status(msg, tipo) {
    const el = $('mapaStatus'); if (!el) return;
    el.textContent = msg || '';
    el.className = 'mp-status' + (tipo ? ' is-' + tipo : '') + (msg ? '' : ' hidden');
  }
  const ocupado = (sim) => { sec.classList.toggle('is-busy', !!sim); sec.setAttribute('aria-busy', sim ? 'true' : 'false'); };
  const iconesRefresh = () => { try { if (window.lucide) window.lucide.createIcons(); } catch (e) { /* ícones são só enfeite */ } };

  // ---------- Leaflet (carregado só quando preciso) ----------
  function carregarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (promessaLeaflet) return promessaLeaflet;
    promessaLeaflet = new Promise((ok, falha) => {
      const js = document.createElement('script'); js.src = 'leaflet.js';   // o CSS do Leaflet está em mapa-rotas.css
      js.onload = () => (window.L && window.L.map) ? ok(window.L) : falha(new Error('Leaflet inválido'));
      js.onerror = () => { promessaLeaflet = null; falha(new Error('Não consegui carregar o mapa. Confira a internet.')); };
      document.head.appendChild(js);
    });
    return promessaLeaflet;
  }

  function icone(classe, tam) { return L.divIcon({ className: 'mp-pino ' + classe, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], html: '<span></span>' }); }

  async function garantirMapa() {
    if (mapa) return mapa;
    L = await carregarLeaflet();
    if (mapa) return mapa;
    mapa = L.map('mapaCanvas', { zoomControl: false }).setView(CENTRO, 13);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);
    mapa.createPane('vetor').style.zIndex = 150;     // abaixo dos blocos do mapa: aparece quando os blocos não carregam (sem internet)
    camadaTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · rotas: OSRM'
    }).addTo(mapa);
    // satélite: imagens Esri World Imagery (útil onde o OpenStreetMap ainda não tem a casa ou a rua). Só aparece se o usuário pedir.
    camadaSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 18,
      attribution: 'Imagens © Esri, Maxar, Earthstar Geographics · rotas: OSRM'
    });
    [camadaTiles, camadaSat].forEach((cam) => {
      cam.options.updateWhenZooming = false;   // pinça mais fluida no celular: os blocos só carregam quando o zoom termina
      cam.on('tileload', (e) => { if (e.tile) e.tile.style.visibility = ''; });
      cam.on('tileerror', (e) => {
        if (e.tile) e.tile.style.visibility = 'hidden';          // bloco que falhou fica transparente: as ruas offline aparecem por baixo
        if (vetorAuto) return;
        if (++errosTile === 1) setTimeout(() => { errosTile = 0; }, 8000);
        if (motor && errosTile >= 3) { vetorAuto = true; aplicarModoMapa(); ofertaUI(); }
      });
    });
    aplicarModoMapa();
    mapa.on('click', (e) => escolherNoMapa(e.latlng.lat, e.latlng.lng));
    mapa.on('dragstart', () => { if (seguindo) soltoAte = Date.now() + 12000; });
    setTimeout(() => mapa.invalidateSize(), 150);
    return mapa;
  }

  // ---------- Nominatim (máx. 1 pedido por segundo) ----------
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  async function nominatim(caminho, params, tentativa) {
    const espera = ultimoNominatim + 1100 - Date.now();
    if (espera > 0) await esperar(espera);
    ultimoNominatim = Date.now();
    const url = NOMINATIM + caminho + '?' + new URLSearchParams(Object.assign({ format: 'jsonv2', 'accept-language': 'pt-BR' }, params));
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if ((r.status === 429 || r.status === 503) && !tentativa) { clearTimeout(t); await esperar(2500); return await nominatim(caminho, params, true); }
      if (!r.ok) throw new Error('O serviço de busca respondeu com erro (' + r.status + ').');
      return await r.json();
    } catch (e) {
      let er = e;
      if (e && e.name === 'AbortError') er = new Error('A busca demorou demais. Tente de novo.');
      else if (e instanceof TypeError) er = new Error('Sem conexão com o serviço de busca. Confira a internet.');
      if (er && typeof er === 'object') er.rede = true;     // qualquer falha aqui = serviço fora do ar/sem rede → vale tentar o mapa offline
      throw er;
    } finally { clearTimeout(t); }
  }
  // repete a mesma busca sem gastar internet (só na memória desta sessão; nada vai para o armazenamento do aparelho)
  async function comCache(chave, buscarDeVerdade) {
    if (cacheBusca.has(chave)) return cacheBusca.get(chave);
    const v = await buscarDeVerdade();
    if (cacheBusca.size >= 60) cacheBusca.delete(cacheBusca.keys().next().value);
    cacheBusca.set(chave, v);
    return v;
  }
  // Resultados do mapa offline têm o mesmo formato dos do Nominatim (lat/lon/display_name) + _rotulo (já pronto) e _aviso.
  const referencia = () => { const r = posicao || origemAtual || partidaCache; return r && isFinite(r.lat) && isFinite(r.lng) ? { lat: r.lat, lng: r.lng } : null; };   // desempata ruas de mesmo nome pela que está mais perto
  const paraItem = (x) => ({ lat: x.lat, lon: x.lng, display_name: x.rotulo, _rotulo: x.rotulo, _aviso: x.aviso || '' });
  // bairro de foco: o citado no texto ("…, 13 de setembro", "treze de setembro", "aracelis") ou o fixado nos chips
  function focoDaBusca(q) {
    if (!FOCO) return null;
    const d = FOCO.detectar(q);
    return d ? { foco: d.foco, resto: d.resto, citado: true } : (escopo ? { foco: FOCO.porId(escopo), resto: q, citado: false } : null);
  }
  const avisoBairro = (rs, f) => { if (f && rs.length && !FOCO.doBairro(rs[0], f.foco)) rs[0]._aviso = (rs[0]._aviso ? rs[0]._aviso + ' ' : '') + 'Não confirmei que fica no bairro ' + f.foco.rotulo + ': confira o ponto no mapa.'; return rs; };
  const buscarOffline = (q) => {
    const f = focoDaBusca(q), perto = referencia();
    let itens = [];
    if (f) for (const v of f.foco.variantes.slice(0, 3)) { itens = motor.buscar((f.resto ? f.resto + ', ' : '') + v, 6, { perto }); if (itens.length) break; }
    if (!itens.length) itens = motor.buscar(q, 6, { perto });
    const rs = itens.map(paraItem);
    return f ? avisoBairro(FOCO.priorizar(rs, f.foco), f) : (FOCO ? FOCO.priorizar(rs) : rs);
  };
  // 1º só em Boa Vista e entorno; 2º Brasil inteiro (Boa Vista tem preferência); 3º sem o número da casa, avisando.
  function buscarOnline(q) {
    const f = focoDaBusca(q);
    return comCache('b:' + (f ? f.foco.id + ':' : '') + q.toLowerCase(), async () => {
      const base = { q, limit: 6, countrycodes: 'br', viewbox: VIEWBOX, addressdetails: 1 };
      let rs = [];
      if (f) {   // rua + bairro de foco: tenta as grafias do bairro (no máx. 2 pedidos) antes de buscar na cidade toda
        for (const c of FOCO.consultas(f.foco, f.resto).slice(0, 2)) {
          rs = await nominatim('/search', Object.assign({}, base, { q: c, bounded: 1 }));
          if (rs.length) break;
        }
      }
      if (!rs.length && !(f && f.citado)) rs = await nominatim('/search', Object.assign({ bounded: 1 }, base));
      if (!rs.length) rs = await nominatim('/search', base);
      if (!rs.length) {
        const sn = U.semNumero(f ? (f.resto || q) : q);
        if (sn) {
          const b2 = Object.assign({}, base, { q: sn.texto + (f ? ', ' + f.foco.variantes[0] : '') });
          rs = await nominatim('/search', Object.assign({ bounded: 1 }, b2));
          if (!rs.length && f) rs = await nominatim('/search', Object.assign({ bounded: 1 }, base, { q: sn.texto }));
          rs.forEach((r) => { r._aviso = 'Não achei o número ' + sn.numero + ' no mapa: mostrei a rua. Arraste o pino ou toque no mapa para ajustar.'; });
        }
      }
      return f ? avisoBairro(FOCO.priorizar(rs, f.foco), f) : (FOCO ? FOCO.priorizar(rs) : rs);
    });
  }
  async function buscarEndereco(q) {
    if (usarOffline()) return buscarOffline(q);
    try {
      const rs = await buscarOnline(q);
      if (!rs.length && motor) { const off = buscarOffline(q); if (off.length) return off; }   // o Nominatim não achou: o mapa offline entende abreviação, fonética e nome por extenso
      return rs;
    }
    catch (e) { if (motor && e && e.rede) return buscarOffline(q); throw e; }
  }
  async function buscarCoordenada(lat, lng) {
    const offline = () => { const r = motor.reverso(lat, lng); return r ? { display_name: r.rotulo, _rotulo: r.rotulo } : null; };
    if (usarOffline()) return offline();
    try { return await comCache('r:' + lat.toFixed(5) + ',' + lng.toFixed(5), () => nominatim('/reverse', { lat: lat.toFixed(6), lon: lng.toFixed(6), zoom: 18 })); }
    catch (e) { if (motor && e && e.rede) return offline(); throw e; }
  }

  function rotuloCurto(r) {
    if (r && r._rotulo) return r._rotulo;
    const a = r.address || {};
    const via = a.road || a.pedestrian || a.footway || a.path || a.suburb || '';
    const num = a.house_number ? ', ' + a.house_number : '';
    const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || '';
    const cidade = a.city || a.town || a.village || a.municipality || '';
    const partes = [via + num, bairro && bairro !== via ? bairro : '', cidade].filter(Boolean);
    return partes.length >= 2 ? partes.join(' — ') : String(r.display_name || '').split(',').slice(0, 3).join(',').trim();
  }

  // ---------- origem ----------
  function msgGeo(e) {
    return e && e.code === 1 ? 'A localização foi negada. Permita o acesso à localização no navegador (ícone de cadeado, ao lado do endereço) ou escolha outro ponto de partida.'
      : e && e.code === 3 ? 'Não consegui obter sua posição a tempo. Vá para um local aberto e tente de novo.'
      : 'Não consegui obter sua posição agora.';
  }
  function lerPosicao() {
    return new Promise((ok, falha) => {
      if (!navigator.geolocation) return falha(new Error('Este aparelho/navegador não informa a localização.'));
      navigator.geolocation.getCurrentPosition(
        (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy || 0, quando: Date.now() }),
        (e) => falha(new Error(msgGeo(e))),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    });
  }

  async function mostrarPosicao(p) {
    await garantirMapa();
    if (mPos) mapa.removeLayer(mPos); if (circPos) mapa.removeLayer(circPos);
    circPos = L.circle([p.lat, p.lng], { radius: Math.min(p.precisao || 0, 2000), color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
    mPos = L.marker([p.lat, p.lng], { icon: icone('mp-pino-pos', 18), keyboard: false, interactive: false }).addTo(mapa);
  }

  async function usarMinhaPosicao(centralizar) {
    status('Obtendo a sua posição…'); ocupado(true);
    try {
      posicao = await lerPosicao();
      await mostrarPosicao(posicao);
      if (centralizar) mapa.setView([posicao.lat, posicao.lng], 16);
      const m = posicao.precisao ? ' (precisão de cerca de ' + Math.round(posicao.precisao) + ' m)' : '';
      status('Posição encontrada' + m + '.', 'ok');
      return posicao;
    } finally { ocupado(false); }
  }

  async function obterOrigem() {
    const tipo = $('mapaOrigem').value;
    if (tipo === 'pos') {
      let p = posicao;
      // posição com mais de 90 s (e sem "Acompanhar" ligado) é lida de novo: quem andou não pode sair da rota errada
      if (!p || (!vigia && Date.now() - (p.quando || 0) > 90000)) {
        try { p = await usarMinhaPosicao(false); } catch (e) { if (!p) throw e; }   // posição antiga é melhor que nenhuma
      }
      return { lat: p.lat, lng: p.lng, rotulo: 'Minha posição' };
    }
    if (tipo === 'partida') {
      if (!partidaCache) {   // coordenadas achadas uma vez com internet ficam guardadas: a partida padrão passa a funcionar offline
        try { const g = JSON.parse(lerPref(PARTIDA_CHAVE, 'null')); if (g && isFinite(g.lat) && isFinite(g.lng)) partidaCache = { lat: +g.lat, lng: +g.lng, rotulo: PARTIDA.rotulo }; } catch (e) { /* guardado inválido: busca de novo */ }
      }
      if (!partidaCache) {
        const r = await buscarEndereco(PARTIDA.consulta);
        if (!r.length) throw new Error('Não consegui localizar o endereço de partida no mapa. Use "Outro endereço".');
        const achada = { lat: +r[0].lat, lng: +r[0].lon, rotulo: PARTIDA.rotulo };
        if (r[0]._rotulo || r[0]._aviso) return achada;     // aproximado (mapa offline ou rua sem o número 193): usa nesta rota, mas não fixa nem guarda para sempre
        partidaCache = achada; gravarPref(PARTIDA_CHAVE, JSON.stringify({ lat: achada.lat, lng: achada.lng }));
      }
      return partidaCache;
    }
    const txt = ($('mapaOrigemTexto').value || '').trim();
    if (!txt) throw new Error('Digite o endereço de partida.');
    if (origemOutro && origemOutro.rotulo === txt) return origemOutro;           // veio de "Inverter": já tem coordenadas exatas
    const c = U.lerCoordenadas(txt);
    if (c) return { lat: c.lat, lng: c.lng, rotulo: txt };
    const r = await buscarEndereco(txt);
    if (!r.length) throw new Error('Não encontrei o endereço de partida "' + txt + '".');
    return { lat: +r[0].lat, lng: +r[0].lon, rotulo: rotuloCurto(r[0]) || txt };
  }

  // ---------- destino ----------
  async function marcarDestino(d) {
    destino = d;
    await garantirMapa();
    if (mDestino) mapa.removeLayer(mDestino);
    mDestino = L.marker([d.lat, d.lng], { icon: icone('mp-pino-dest', 26), title: d.rotulo + ' — arraste para ajustar', draggable: true, keyboard: false }).addTo(mapa);
    mDestino.on('dragend', () => { const ll = mDestino.getLatLng(); escolherNoMapa(ll.lat, ll.lng); });
    $('mapaDestinoTexto').textContent = d.rotulo;
    $('mapaDestinoBox').classList.remove('hidden');
    atualizarSalvar();
  }

  // últimos destinos desta sessão (só na memória, nunca no aparelho): um toque repete a busca
  const recentes = [];
  function lembrarRecente(d) {
    const i = recentes.findIndex((r) => U.distM(r, d) < 30); if (i >= 0) recentes.splice(i, 1);
    recentes.unshift({ lat: d.lat, lng: d.lng, rotulo: d.rotulo }); if (recentes.length > 5) recentes.pop();
    const box = $('mapaRecentes'); if (!box) return;
    box.textContent = '';
    const t = document.createElement('span'); t.className = 'mp-focos-t'; t.textContent = 'Recentes:'; box.appendChild(t);
    recentes.forEach((r) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = r.rotulo.length > 34 ? r.rotulo.slice(0, 33) + '…' : r.rotulo; b.title = r.rotulo;
      b.addEventListener('click', () => { senha++; avisoDestino = ''; $('mapaBusca').value = r.rotulo; escolherDestino({ lat: r.lat, lng: r.lng, rotulo: r.rotulo }).catch(mostrarErro); });
      box.appendChild(b);
    });
    box.classList.remove('hidden');
  }
  // Android/celular: o teclado e o foco no painel de cima escondem o resumo da rota (tempo, Acompanhar…). Depois que a rota
  // é traçada, tira o foco do campo/botão tocado para fechar o teclado e mostrar o resumo.
  function fecharTecladoNoCelular() {
    try {
      const a = document.activeElement;
      if (MOBILE() && a && a.blur && a !== document.body && sec.contains(a) && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(a.tagName)) a.blur();
    } catch (e) { /* sem foco para tirar */ }
  }
  async function escolherDestino(d) {
    lembrarRecente(d);
    const km = U.distM({ lat: CENTRO[0], lng: CENTRO[1] }, d);
    if (km > LIMITE_LONGE) avisoDestino = (avisoDestino ? avisoDestino + ' ' : '') + 'Atenção: esse ponto fica a ' + fmtDist(km) + ' do centro de Boa Vista. Se não era esse lugar, confira o endereço ou toque no mapa.';
    await marcarDestino(d);
    mapa.setView([d.lat, d.lng], Math.max(mapa.getZoom(), 16));
    fecharTecladoNoCelular();
    await tracarRota();
  }

  async function escolherNoMapa(lat, lng) {
    const minha = ++senha; avisoDestino = '';
    await marcarDestino({ lat, lng, rotulo: lat.toFixed(5) + ', ' + lng.toFixed(5) });
    status('Procurando o endereço desse ponto…'); ocupado(true);
    try {
      const r = await buscarCoordenada(lat, lng);
      if (minha === senha && r && (r.address || r.display_name)) { destino.rotulo = rotuloCurto(r) || destino.rotulo; $('mapaDestinoTexto').textContent = destino.rotulo; }
    } catch (e) { /* mantém as coordenadas como nome; a rota ainda funciona */ }
    finally { ocupado(false); }
    if (minha === senha) await tracarRota();
  }

  // ---------- busca ----------
  const fecharResultados = () => $('mapaResultados').classList.add('hidden');
  function listarResultados(rs, opc) {
    opc = opc || {};
    const ul = $('mapaResultados'); ul.textContent = '';
    const lista = opc.todos ? rs : rs.slice(1);
    if (!lista.length) { ul.classList.add('hidden'); return; }
    lista.forEach((r) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      const rotulo = rotuloCurto(r) || r.display_name;
      b.textContent = rotulo;
      const bf = FOCO && FOCO.FOCOS.find(f => FOCO.doBairro(r, f));
      if (bf && !bf.pertence.test(FOCO.norm(rotulo))) { const tag = document.createElement('span'); tag.className = 'mp-res-tag'; tag.textContent = bf.curto; b.appendChild(tag); }   // etiqueta: resultado dentro de um bairro de foco
      b.addEventListener('click', () => { senha++; avisoDestino = r._aviso || ''; ul.classList.add('hidden'); $('mapaBusca').value = rotulo; escolherDestino({ lat: +r.lat, lng: +r.lon, rotulo }).catch(mostrarErro); });
      li.appendChild(b); ul.appendChild(li);
    });
    const t = document.createElement('li'); t.className = 'mp-res-titulo'; t.textContent = opc.titulo || 'Outros resultados'; ul.insertBefore(t, ul.firstChild);
    ul.classList.remove('hidden');
  }

  async function buscar(ev) {
    ev.preventDefault();
    clearTimeout(tSug);
    const q = ($('mapaBusca').value || '').trim();
    if (q.length < 3) { status('Digite o endereço (rua, número, bairro) para buscar.', 'erro'); return; }
    const c = U.lerCoordenadas(q);                  // coordenadas ou link do Google Maps colados no campo
    if (c) {
      fecharResultados(); ocupado(true);
      try { await garantirMapa(); mapa.setView([c.lat, c.lng], 17); await escolherNoMapa(c.lat, c.lng); } catch (e) { mostrarErro(e); }
      return;
    }
    const minha = ++senha;
    const fb = focoDaBusca(q);
    status(fb ? 'Procurando no ' + fb.foco.rotulo + '…' : 'Procurando o endereço…'); ocupado(true);
    try {
      await garantirMapa();
      const rs = await buscarEndereco(q);
      if (minha !== senha) return;
      if (!rs.length && fb) { listarResultados([]); status('Não achei "' + (fb.resto || q) + '" no ' + fb.foco.rotulo + ' nem no resto de Boa Vista. Tente só o nome da rua (sem o número), outra grafia, ou toque no mapa para marcar o ponto.', 'erro'); return; }
      if (!rs.length) { listarResultados([]); status('Não encontrei esse endereço. Tente só a rua e o bairro (ex.: "Rua Santo Agostinho, Centenário"), cole as coordenadas, ou toque no mapa para marcar o ponto.', 'erro'); return; }
      listarResultados(rs); avisoDestino = rs[0]._aviso || '';
      await escolherDestino({ lat: +rs[0].lat, lng: +rs[0].lon, rotulo: rotuloCurto(rs[0]) || q });
    } catch (e) { mostrarErro(e); }
    finally { ocupado(false); }
  }

  // ---------- rota ----------
  const MOD = { left: 'à esquerda', right: 'à direita', 'slight left': 'levemente à esquerda', 'slight right': 'levemente à direita',
    'sharp left': 'fechando à esquerda', 'sharp right': 'fechando à direita', straight: 'em frente', uturn: 'e faça o retorno' };
  function instrucao(s) {
    if (s._parada) return s._parada > paradas.length ? 'Destino alcançado' : 'Parada ' + s._parada + ' alcançada';
    const m = s.maneuver || {}, nome = s.name ? ' em ' + s.name : '', mod = MOD[m.modifier] || '';
    switch (m.type) {
      case 'depart': return 'Siga' + (s.name ? ' por ' + s.name : '') + (mod && m.modifier !== 'straight' ? ' ' + mod : '');
      case 'arrive': return 'Você chegou ao destino' + (m.modifier === 'left' ? ' (à esquerda)' : m.modifier === 'right' ? ' (à direita)' : '');
      case 'turn': case 'end of road': return (m.type === 'end of road' ? 'No fim da via, vire ' : 'Vire ') + (mod || 'em frente') + nome;
      case 'fork': return 'Mantenha-se ' + (mod || 'em frente') + nome;
      case 'merge': return 'Entre' + (s.name ? ' em ' + s.name : '') + (mod ? ' ' + mod : '');
      case 'on ramp': case 'off ramp': return 'Pegue a ' + (m.type === 'on ramp' ? 'entrada' : 'saída') + (mod ? ' ' + mod : '') + nome;
      case 'roundabout': case 'rotary': return 'Na rotatória, pegue a ' + (m.exit || '') + 'ª saída' + (s.name ? ' para ' + s.name : '');
      case 'roundabout turn': return 'Na rotatória, vire ' + (mod || 'em frente') + nome;
      case 'exit roundabout': case 'exit rotary': return 'Saia da rotatória' + (s.name ? ' para ' + s.name : '');
      default: return 'Continue' + (s.name ? ' por ' + s.name : ' em frente');
    }
  }
  const fmtDist = U.fmtDist, fmtTempo = U.fmtTempo;

  // Serviço principal (routing.openstreetmap.de, um por meio de transporte); se estiver fora do ar, o carro/moto tenta o servidor de demonstração do OSRM.
  async function rotaOnline(o) {
    try { return await rotaOnlineEm(ROTAS + '/' + PERFIS[modo].caminho, o); }
    catch (e) {
      if (modo !== 'carro' || !(e && e.rede)) throw e;
      status('O serviço de rotas não respondeu. Tentando um servidor reserva…');
      try { return await rotaOnlineEm(ROTAS_RESERVA, o); } catch (e2) { throw e; }   // se o reserva também falhar, vale o erro original
    }
  }
  async function rotaOnlineEm(base, o) {
    const coords = pontosRota(o).map(q => q.lng + ',' + q.lat).join(';');
    const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${paradas.length ? 'false' : 'true'}`;
    for (let tent = 0; ; tent++) {      // uma nova tentativa se o servidor público engasgar
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { signal: ctl.signal });
        if (r.status >= 500 && tent < 1) { await esperar(1500); continue; }
        const dados = await r.json().catch(() => null);
        if (!r.ok && !(dados && dados.code)) { const er = new Error('O serviço de rotas respondeu com erro (' + r.status + ').'); er.rede = r.status >= 500; throw er; }
        return dados;
      } catch (e) {
        const rede = e && (e.name === 'AbortError' || e instanceof TypeError);
        if (rede && tent < 1) { await esperar(1200); continue; }
        let er = e;
        if (e && e.name === 'AbortError') er = new Error('O cálculo da rota demorou demais. Tente de novo.');
        else if (e instanceof TypeError) er = new Error('Sem conexão com o serviço de rotas. Confira a internet.');
        if (er && typeof er === 'object') er.rede = true;
        throw er;
      } finally { clearTimeout(t); }
    }
  }
  const pontosRota = (o) => [o].concat(paradas, [destino]);
  function rotaOffline(o) {
    const pts = pontosRota(o), pernas = [], coords = []; let dist = 0, dur = 0, alternativas = [];
    const unica = pts.length === 2;       // alternativas só quando é um trecho só (com paradas, a rota fica como está)
    for (let k = 0; k < pts.length - 1; k++) {
      const r = motor.rotear(modo, { lat: pts[k].lat, lng: pts[k].lng }, { lat: pts[k + 1].lat, lng: pts[k + 1].lng }, unica ? { alternativas: 2 } : undefined);
      const onde = pts.length > 2 ? ' (trecho ' + (k + 1) + ' de ' + (pts.length - 1) + ')' : '';
      if (r.erro === 'longe') throw new Error('A partida, uma parada ou o destino está fora da área do mapa offline (' + (motor.info().ampliada ? 'Boa Vista e região' : 'Boa Vista e entorno') + '), ou longe de qualquer rua para esse meio de transporte' + onde + '.' + (motor.info().ampliada ? '' : ' Para a zona rural, atualize o mapa offline marcando a opção das estradas do entorno.'));
      if (r.erro) throw new Error('Não achei caminho entre os pontos para esse meio de transporte (mapa offline)' + onde + '.');
      pernas.push(Object.assign({}, r.legs[0], { distance: r.distance, duration: r.duration })); dist += r.distance; dur += r.duration;
      r.geometry.coordinates.forEach((c, n) => { if (k === 0 || n > 0) coords.push(c); });
      if (unica && r.alternativas) alternativas = r.alternativas;
    }
    const principal = { distance: dist, duration: dur, geometry: { type: 'LineString', coordinates: coords }, legs: pernas };
    const alts = alternativas.map(x => ({ distance: x.distance, duration: x.duration, geometry: x.geometry, legs: x.legs }));
    return { code: 'Ok', routes: [principal].concat(alts) };
  }

  async function tracarRota() {
    if (!destino) return;
    const minha = ++senha;
    status('Traçando a rota…'); ocupado(true);
    try {
      const o = await obterOrigem();
      if (minha !== senha) return;
      await garantirMapa();
      let dados, offline = false;
      if (usarOffline()) { dados = rotaOffline(o); offline = true; }
      else {
        try { dados = await rotaOnline(o); }
        catch (e) { if (motor && e && e.rede) { dados = rotaOffline(o); offline = true; } else throw e; }
      }
      if (minha !== senha) return;
      if (!dados || dados.code !== 'Ok' || !dados.routes || !dados.routes.length) {
        limparRota(); seguir(false);
        throw new Error(dados && dados.code === 'NoRoute' ? 'Não achei caminho entre os dois pontos para esse meio de transporte.' : 'Não consegui traçar a rota agora.');
      }
      mostrarRotas(o, dados.routes.slice(0, 3));
      const msg = [offline ? 'Rota calculada pelo mapa offline (sem internet): sem trânsito e sem obras.' + (dados.routes.length > 1 ? ' Há ' + (dados.routes.length - 1) + ' caminho(s) alternativo(s) — toque no que preferir.' : '') : '', avisoDestino].filter(Boolean).join(' ');
      status(msg, offline ? 'ok' : '');
      avisoDestino = '';
    } catch (e) { mostrarErro(e); }
    finally { if (minha === senha) ocupado(false); }
  }

  function apagarCamadas() {
    if (camadaRota) { mapa.removeLayer(camadaRota); camadaRota = null; }
    if (mOrigem) { mapa.removeLayer(mOrigem); mOrigem = null; }
    if (mPasso) { mapa.removeLayer(mPasso); mPasso = null; }
  }
  function limparRota() {
    if (mapa) apagarCamadas();
    rotas = []; trilha = null; origemAtual = null;
    atualizarBotaoCheguei();
    $('mapaResumo').classList.add('hidden'); $('mapaPassos').textContent = ''; $('mapaAlternativas').textContent = ''; $('mapaProximo').classList.add('hidden');
  }

  const coordsDe = (r) => r.geometry.coordinates.map(c => [c[1], c[0]]);
  const passosDe = (r) => {          // junta os trechos; a chegada de cada trecho intermediário vira "Parada n alcançada"
    const L = r.legs || [], out = [];
    L.forEach((leg, li) => (leg.steps || []).forEach((st) => { out.push(li < L.length - 1 && st.maneuver && st.maneuver.type === 'arrive' ? Object.assign({}, st, { _parada: li + 1 }) : st); }));
    return out;
  };

  function pintarRotas() {
    apagarCamadas();
    const estilo = (cor, larg, op) => ({ color: cor, weight: larg, opacity: op, lineCap: 'round', lineJoin: 'round' });
    camadaRota = L.layerGroup().addTo(mapa);
    rotas.forEach((r, i) => {                      // alternativas (cinza) por baixo; tocar numa delas a escolhe
      if (i === rotaSel) return;
      const pts = coordsDe(r), dica = 'Rota alternativa: ' + fmtTempo(r.duration) + ' · ' + fmtDist(r.distance) + ' (toque para escolher)';
      [L.polyline(pts, estilo('#ffffff', 9, 0.85)), L.polyline(pts, estilo('#7b8aa0', 5, 0.95))].forEach((l) => {
        l.on('click', (ev) => { L.DomEvent.stopPropagation(ev); selecionarRota(i); });
        l.bindTooltip(dica, { sticky: true });
        camadaRota.addLayer(l);
      });
    });
    const pts = coordsDe(rotas[rotaSel]);
    camadaRota.addLayer(L.polyline(pts, estilo('#ffffff', 9, 0.9)));
    camadaRota.addLayer(L.polyline(pts, estilo('#146B47', 5, 0.95)));
    const cum = U.acumulado(pts), steps = passosDe(rotas[rotaSel]);
    trilha = { pontos: pts, cum, steps, passos: U.localizarPassos(steps, pts, cum), atual: -1 };
    if (origemAtual && origemAtual.rotulo !== 'Minha posição') mOrigem = L.marker([origemAtual.lat, origemAtual.lng], { icon: icone('mp-pino-orig', 16), title: origemAtual.rotulo, keyboard: false }).addTo(mapa);
  }

  function linksGoogle(o) { return U.linksGoogle({ origem: o, paradas, destino, modo: PERFIS[modo].google }); }
  // todos os trechos do Google Maps em texto (o Google aceita só 9 paradas por link: acima disso, vários links)
  function textoLinksGoogle() {
    const ls = origemAtual ? linksGoogle(origemAtual) : [];
    if (ls.length < 2) return ls.length ? ls[0].href : '';
    return ls.map((l, i) => 'Google Maps, trecho ' + (i + 1) + ' de ' + ls.length + ' (paradas ' + (l.de + 1) + ' a ' + Math.min(l.ate, paradas.length) + (l.ate > paradas.length ? ' e destino' : '') + '): ' + l.href).join('\n');
  }
  // "paradas 11–20" / "paradas 21–25 e destino": quais pontos da lista cada trecho do Google cobre
  function faixaTrecho(l) {
    const a = l.de + 1, b = Math.min(l.ate, paradas.length);
    return (b > a ? 'paradas ' + a + '–' + b : b === a ? 'parada ' + a : 'destino') + (l.ate > paradas.length && b >= a ? ' e destino' : '');
  }
  function mostrarLinksGoogle(o) {
    const ls = linksGoogle(o), a = $('mapaGoogle'), txt = a.querySelector('span');
    a.href = ls[0].href;
    if (txt) txt.textContent = ls.length > 1 ? 'Google Maps (trecho 1 de ' + ls.length + ' · ' + faixaTrecho(ls[0]) + ')' : 'Google Maps';
    const pai = a.parentNode;
    if (pai && pai.querySelectorAll) Array.from(pai.querySelectorAll('.mp-google-extra')).forEach((x) => x.remove());
    let ref = a;
    ls.slice(1).forEach((l, i) => {      // trechos 2, 3… ficam logo depois do botão principal
      const b = document.createElement('a'); b.className = 'mp-btn mp-btn-sec mp-google-extra'; b.href = l.href; b.target = '_blank'; b.rel = 'noopener';
      b.textContent = 'Google Maps (trecho ' + (i + 2) + ' de ' + ls.length + ' · ' + faixaTrecho(l) + ')';
      if (ref.after) ref.after(b);
      ref = b;
    });
  }

  // ---------- horários: saída (agora ou planejada) + tempo de visita em cada parada ----------
  function cronogramaAtual() {
    const r = rotas[rotaSel]; if (!r) return null;
    const pernas = (r.legs || []).map((l) => ({ distance: l.distance, duration: l.duration }));
    if (!pernas.length || pernas.some((p) => !isFinite(p.duration) || !isFinite(p.distance))) return null;
    return U.cronograma(pernas, { inicio: U.inicioDe($('mapaSaida').value), visitaMin: paradas.length ? +$('mapaVisita').value || 0 : 0, visitas: paradas.map((q) => q.visita) });
  }
  // horário limite do expediente: mostra quanto sobra (ou quanto passa) em relação ao fim previsto da rota
  function mostrarFolga(fimMs) {
    const el = $('mapaFolga'); if (!el) return;
    const lim = $('mapaLimite') ? $('mapaLimite').value : '', f = U.folga(fimMs, lim);
    if (f === null) { el.textContent = ''; el.classList.add('hidden'); el.classList.remove('is-alerta'); return; }
    const dur = (m) => fmtTempo(Math.abs(m) * 60);
    el.textContent = f >= 0 ? 'Termina ' + dur(f) + ' antes das ' + lim + '.' : '⚠ Passa das ' + lim + ' em ' + dur(f) + (paradas.length ? ' — tire uma parada ou reduza o tempo de visita.' : '.');
    el.classList.toggle('is-alerta', f < 0); el.classList.remove('hidden');
  }
  function atualizarCronograma() {
    const r = rotas[rotaSel]; if (!r || !destino) return;
    const cr = cronogramaAtual(), plan = /^\d{1,2}:\d{2}$/.test($('mapaSaida').value);
    $('mapaVisitaBox').classList.toggle('hidden', !paradas.length);
    $('mapaCopiar').classList.toggle('hidden', !paradas.length);
    const dica = $('mapaDestinoEta'), infos = sec.querySelectorAll('#mapaParadas .mp-parada-info');
    if (!cr) {        // sem duração por trecho: só o total, como antes
      $('mapaChegada').textContent = 'Chegada por volta de ' + U.horaChegada(r.duration) + ' (saindo agora)';
      dica.classList.add('hidden'); infos.forEach((el) => { el.textContent = ''; });
      mostrarFolga(U.inicioDe($('mapaSaida').value) + r.duration * 1000);
      return;
    }
    const saindo = plan ? 'saindo às ' + $('mapaSaida').value : 'saindo agora';
    $('mapaChegada').textContent = cr.parado
      ? 'Deslocamento ' + fmtTempo(cr.dur) + ' + ' + fmtTempo(cr.parado) + ' de visitas · fim por volta de ' + U.fmtHora(cr.fim) + ' (' + saindo + ')'
      : 'Chegada por volta de ' + U.fmtHora(cr.fim) + ' (' + saindo + ')';
    infos.forEach((el, i) => { const e = cr.etapas[i]; el.textContent = e ? 'chegada ' + U.fmtHora(e.chegada) + ' · ' + fmtDist(e.dist) + ' · ' + fmtTempo(e.dur) : ''; });
    const ult = cr.etapas[cr.etapas.length - 1];
    dica.textContent = paradas.length && ult ? 'Chegada ao destino: ' + U.fmtHora(ult.chegada) + ' · último trecho ' + fmtDist(ult.dist) : '';
    dica.classList.toggle('hidden', !dica.textContent);
    mostrarFolga(cr.fim);
  }

  function preencherResumo() {
    const r = rotas[rotaSel], o = origemAtual;
    $('mapaDist').textContent = fmtDist(r.distance);
    $('mapaTempo').textContent = fmtTempo(r.duration);
    $('mapaDeAte').textContent = o.rotulo + (paradas.length ? ' → ' + paradas.length + (paradas.length === 1 ? ' parada' : ' paradas') : '') + ' → ' + destino.rotulo;
    mostrarLinksGoogle(o);
    const alvoWaze = paradas[0] || destino; $('mapaWaze').href = U.linkWaze(alvoWaze);   // o Waze só aceita um destino: com paradas, vai à 1ª
    $('mapaWazeTxt').textContent = paradas.length ? 'Waze (1ª parada)' : 'Waze';
    $('mapaSeguir').classList.toggle('hidden', o.rotulo !== 'Minha posição' || !navigator.geolocation);
    atualizarCronograma();
    const alt = $('mapaAlternativas'); alt.textContent = '';
    if (rotas.length > 1) {
      const rapida = rotas.reduce((m, x, i) => x.duration < rotas[m].duration ? i : m, 0);
      rotas.forEach((x, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-alt'; b.setAttribute('aria-pressed', i === rotaSel ? 'true' : 'false');
        b.textContent = fmtTempo(x.duration) + ' · ' + fmtDist(x.distance) + (i === rapida ? ' · mais rápida' : '');
        b.addEventListener('click', () => selecionarRota(i));
        alt.appendChild(b);
      });
      alt.classList.remove('hidden');
    } else alt.classList.add('hidden');
    const ol = $('mapaPassos'); ol.textContent = '';
    trilha.steps.forEach((s, i) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'mp-passo';
      const ic = document.createElement('span'); ic.className = 'mp-seta-passo'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = U.seta(s);
      const tx = document.createElement('span'); tx.className = 'mp-passo-txt'; tx.textContent = instrucao(s);
      if (s.distance && s.maneuver && s.maneuver.type !== 'arrive') { const d = document.createElement('small'); d.textContent = fmtDist(s.distance); tx.appendChild(d); }
      b.append(ic, tx); b.addEventListener('click', () => irParaPasso(i)); li.appendChild(b); ol.appendChild(li);
    });
    $('mapaResumo').classList.remove('hidden');
  }

  function mostrarRotas(o, lista) {
    origemAtual = o; rotas = lista; rotaSel = 0;
    pintarRotas(); preencherResumo(); atualizarBotaoCheguei();
    if (cheia && MOBILE()) recolherMais(true);
    if (!seguindo) mapa.fitBounds(L.latLngBounds(trilha.pontos), margens());
  }
  function selecionarRota(i) {
    if (!rotas[i] || i === rotaSel) return;
    rotaSel = i; pintarRotas(); preencherResumo();
    if (!seguindo) mapa.fitBounds(L.latLngBounds(trilha.pontos), margens());
  }

  function marcarPassoAtual(i) {
    if (!trilha || trilha.atual === i) return;
    trilha.atual = i;
    sec.querySelectorAll('#mapaPassos li').forEach((li, k) => li.classList.toggle('is-atual', k === i));
    const li = sec.querySelectorAll('#mapaPassos li')[i];
    if (li && li.scrollIntoView) { try { li.scrollIntoView({ block: 'nearest' }); } catch (e) { /* sem rolagem */ } }
  }
  function irParaPasso(i) {
    const l = trilha && trilha.passos[i]; if (!l) return;
    if (mPasso) mapa.removeLayer(mPasso);
    mPasso = L.circleMarker([l.lat, l.lng], { radius: 11, color: '#146B47', weight: 3, fillColor: '#ffffff', fillOpacity: 0.9, interactive: false }).addTo(mapa);
    mapa.setView([l.lat, l.lng], Math.max(mapa.getZoom(), 17));
    sec.querySelectorAll('#mapaPassos li').forEach((li, k) => li.classList.toggle('is-sel', k === i));
    if (cheia && MOBILE()) { $('mapaResumo').classList.add('is-passos-fechados'); $('mapaPassosBtn').setAttribute('aria-expanded', 'false'); }   // abre espaço para ver o ponto no mapa
  }

  // ---------- acompanhar (GPS ligado): destaca o passo atual e recalcula se sair da rota ----------
  async function pedirTelaLigada() { try { if (navigator.wakeLock) travaTela = await navigator.wakeLock.request('screen'); } catch (e) { /* a tela pode apagar: o app continua */ } }
  function soltarTela() { try { if (travaTela) travaTela.release(); } catch (e) { /* já solta */ } travaTela = null; }
  // voz de navegação: usa a voz do próprio aparelho (nada sai dele); só fala com o modo Acompanhar ligado e a voz ativada
  function falar(txt) {
    if (!vozNav || !txt || !temVoz()) return;
    try { const ss = window.speechSynthesis; ss.cancel(); const u = new window.SpeechSynthesisUtterance(txt); u.lang = 'pt-BR'; u.rate = 1; ss.speak(u); } catch (e) { /* sem voz: o texto na tela continua */ }
  }
  const calar = () => { try { if (temVoz()) window.speechSynthesis.cancel(); } catch (e) { /* já calado */ } };
  const minusc = (t) => t.charAt(0).toLowerCase() + t.slice(1), maiusc = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function avisarVoz(i, prox, loc, pr) {
    if (!vozNav || !prox || !loc) return;
    const dist = loc.inicio - pr.ao_longo, trecho = loc.inicio - (trilha.passos[i] ? trilha.passos[i].inicio : 0);
    const est = U.estagioAviso(dist, trecho), a = trilha.aviso || (trilha.aviso = { passo: -1, est: 0 });
    if (a.passo !== i) { a.passo = i; a.est = 0; }
    if (est <= a.est) return;
    a.est = est;
    const chegada = !!(prox._parada || (prox.maneuver && prox.maneuver.type === 'arrive'));
    if (chegada && est === 3) return;          // a chegada é anunciada pelo próprio acompanhamento
    const txt = prox._parada ? (prox._parada > paradas.length ? 'você chega ao destino' : 'chegada na parada ' + prox._parada) : chegada ? 'você chega ao destino' : minusc(instrucao(prox));
    falar(est === 3 ? maiusc(txt) : 'Em ' + U.distFala(dist) + ', ' + txt);
  }
  // "Faltam 12 min · 4,2 km · chegada 15:42" (e, com paradas, a distância até a próxima)
  function atualizarFaltam(pr) {
    const el = $('mapaFaltam'), r = rotas[rotaSel]; if (!el || !r || !trilha) return;
    const f = U.restante(trilha.cum[trilha.cum.length - 1], pr.ao_longo, r.duration);
    if (paradas.length && r.legs && r.legs[0]) el.textContent = 'Parada 1 em ' + fmtDist(Math.max(0, r.legs[0].distance - pr.ao_longo)) + ' · até o destino: ' + fmtTempo(f.dur) + ' · ' + fmtDist(f.dist);
    else el.textContent = 'Faltam ' + fmtTempo(f.dur) + ' · ' + fmtDist(f.dist) + ' · chegada ' + U.horaChegada(f.dur);
    el.classList.remove('hidden');
  }
  // parada cumprida (sozinha, pelo GPS, ou pelo botão "Cheguei"): sai da lista e a rota é refeita daqui até a próxima
  function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* aparelho sem vibração */ } }
  // Encerra a parada i da fila: "concluida" (visita feita) ou "pulada" (fica para depois). Ela sai da rota e vai para a lista de resolvidas.
  let ultimaEncerrada = 0, ultimaFeita = null, tDesfazer = null;
  function mostrarDesfazer(f) {   // 10 s para desfazer um toque sem querer (no celular, com a luva ou o dedo suado, acontece)
    const b = $('mapaDesfazer'); if (!b) return;
    clearTimeout(tDesfazer); ultimaFeita = f;
    if (!f) { b.classList.add('hidden'); return; }
    b.querySelector('span').textContent = 'Desfazer ' + (f.estado === 'pulada' ? 'pular' : 'concluir') + ' parada';
    b.classList.remove('hidden');
    tDesfazer = setTimeout(() => mostrarDesfazer(null), 10000);
  }
  function encerrarParada(i, estado, auto) {
    if (!(i >= 0 && i < paradas.length)) return;
    if (!auto && Date.now() - ultimaEncerrada < 500) return;   // duplo toque sem querer não pula duas paradas de uma vez
    if (!auto) ultimaEncerrada = Date.now();
    const q = paradas.splice(i, 1)[0];
    const f = { q, estado, idx: i }; feitas.push(f); mostrarDesfazer(f);
    vibrar(estado === 'pulada' ? [80, 50, 80] : [120, 70, 120]);
    const prox = paradas.length ? 'Seguindo para a próxima.' : 'Seguindo para o destino final.';
    const verbo = estado === 'pulada' ? 'Parada pulada' : auto ? 'Parada alcançada' : 'Parada concluída';
    ultimoRecalculo = Date.now(); renderParadas();
    avisoDestino = verbo + ': ' + q.rotulo + '. ' + prox;   // aparece quando a rota nova ficar pronta
    status(avisoDestino, 'ok');
    falar(verbo + '. ' + prox);
    if (destino) tracarRota();
  }
  function cumprirParada(manual) { encerrarParada(0, 'concluida', !manual); }
  // desfazer: a concluída volta ao lugar de onde saiu; a pulada é retomada no fim da fila (antes do destino)
  function retomarParada(f, noLugar) {
    const k = feitas.indexOf(f); if (k < 0) return;
    if (paradas.length >= MAX_PARADAS) { status('Limite de ' + MAX_PARADAS + ' paradas (mais o destino final).', 'erro'); return; }
    feitas.splice(k, 1);
    paradas.splice(f.estado === 'pulada' && !noLugar ? paradas.length : Math.min(f.idx, paradas.length), 0, f.q);
    if (ultimaFeita === f) mostrarDesfazer(null);
    aposMudarParadas();
  }
  function aoMoverPosicao(p) {
    posicao = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy || 0, quando: Date.now() };
    mostrarPosicao(posicao).catch(() => {});
    if (!trilha || !destino) return;
    if (paradas.length && Date.now() - ultimoRecalculo > 4000 && U.alcancouParada(posicao, paradas[0], posicao.precisao)) { cumprirParada(false); return; }
    if (!paradas.length && U.distM(posicao, destino) < 30) {   // com paradas pendentes, passar perto do destino não encerra a rota
      vibrar([200, 80, 200, 80, 200]); status('Você chegou ao destino.', 'ok'); $('mapaProximo').classList.add('hidden'); falar('Você chegou ao destino.'); seguir(false); return;
    }
    const pr = U.projetar(posicao, trilha.pontos, trilha.cum);
    if (pr && pr.dist > Math.max(LIMITE_ROTA_FORA, (posicao.precisao || 0) * 1.5)) {
      if (Date.now() - ultimoRecalculo > 20000) { ultimoRecalculo = Date.now(); vibrar([80, 50, 80]); status('Você saiu da rota. Recalculando…'); falar('Você saiu da rota. Recalculando.'); tracarRota(); }
      return;
    }
    if (pr) {
      const i = U.passoAtual(trilha.passos, pr.ao_longo); marcarPassoAtual(i);
      const prox = trilha.steps[i + 1], loc = trilha.passos[i + 1];
      const el = $('mapaProximo');
      if (prox && loc) { el.textContent = 'Em ' + fmtDist(Math.max(0, loc.inicio - pr.ao_longo)) + ': ' + instrucao(prox); el.classList.remove('hidden'); }
      else el.classList.add('hidden');
      trilha.proxDist = prox && loc ? loc.inicio - pr.ao_longo : null;
      atualizarFaltam(pr); avisarVoz(i, prox, loc, pr);
    }
    if (mapa && Date.now() > soltoAte) {   // se a pessoa arrastou o mapa para olhar à frente, ele não volta sozinho por alguns segundos
      // perto de uma curva, aproxima um pouco mais (ver a esquina); em trecho longo, volta ao zoom normal
      const alvo = trilha && trilha.proxDist != null ? (trilha.proxDist < 150 ? 18 : 17) : null, z = mapa.getZoom();
      if (alvo && Math.abs(z - alvo) >= 1 && z >= 15 && Date.now() - ultimoZoom > 6000) { ultimoZoom = Date.now(); mapa.setView([posicao.lat, posicao.lng], alvo, { animate: true }); }
      else mapa.panTo([posicao.lat, posicao.lng], { animate: true });
    }
  }
  function seguir(sim) {
    sim = !!sim;
    if (sim === seguindo) return;
    const btn = $('mapaSeguir');
    if (sim) {
      if (!navigator.geolocation) { status('Este aparelho/navegador não informa a localização.', 'erro'); return; }
      seguindo = true;
      if (MOBILE() && !cheia) entrarCheia();   // no celular acompanhar é em tela cheia: o mapa grande e o próximo passo à vista
      vigia = navigator.geolocation.watchPosition(aoMoverPosicao,
        (e) => { if (e && e.code === 1) { status(msgGeo(e), 'erro'); seguir(false); } else status('Sinal de GPS fraco. Vá para um local aberto.'); },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
      pedirTelaLigada();
      if (posicao && mapa) mapa.setView([posicao.lat, posicao.lng], Math.max(mapa.getZoom(), 17));
      status('Acompanhando a sua posição. A tela fica acesa enquanto estiver ligado.', 'ok');
      falar('Acompanhando a rota.');
    } else {
      seguindo = false;
      if (vigia !== null && navigator.geolocation) navigator.geolocation.clearWatch(vigia);
      vigia = null; soltarTela(); $('mapaProximo').classList.add('hidden'); $('mapaFaltam').classList.add('hidden'); calar();
      sec.querySelectorAll('#mapaPassos li.is-atual').forEach(li => li.classList.remove('is-atual')); if (trilha) trilha.atual = -1;
    }
    sec.classList.toggle('is-seguindo', seguindo);   // o CSS enxuga os painéis enquanto acompanha
    btn.setAttribute('aria-pressed', seguindo ? 'true' : 'false');
    btn.querySelector('span').textContent = seguindo ? 'Parar de acompanhar' : 'Acompanhar';
    atualizarBotaoCheguei();
  }
  // "Cheguei na parada 1": para quando o GPS não pega (prédio, sinal fraco) ou a visita foi cancelada ("Pular")
  function atualizarBotaoCheguei() {
    const b = $('mapaCheguei'); if (!b) return;
    const ver = !!paradas.length && (seguindo || rotas.length > 0);
    b.classList.toggle('hidden', !ver);
    const p = $('mapaPular'); if (p) p.classList.toggle('hidden', !ver);
    const t = b.querySelector('span'); if (t && paradas.length) t.textContent = 'Concluir parada 1';
    const tp = p && p.querySelector('span'); if (tp && paradas.length) tp.textContent = 'Pular parada 1';
    // na tela cheia a lista some enquanto acompanha: mostra aqui qual é a próxima parada
    const np = $('mapaProximaParada');
    if (np) { np.textContent = paradas.length ? 'Parada 1 de ' + (paradas.length + feitas.length) + ': ' + paradas[0].rotulo : ''; np.classList.toggle('hidden', !(ver && seguindo)); }
  }

  // ---------- paradas (rota com vários endereços) ----------
  function desenharParadas() {
    if (!mapa) return;
    if (grupoParadas) { mapa.removeLayer(grupoParadas); grupoParadas = null; }
    if (!paradas.length) return;
    grupoParadas = L.layerGroup().addTo(mapa);
    paradas.forEach((q, i) => {
      const mk = L.marker([q.lat, q.lng], { icon: L.divIcon({ className: 'mp-pino mp-pino-parada', iconSize: [24, 24], iconAnchor: [12, 12], html: '<span>' + (i + 1) + '</span>' }), title: 'Parada ' + (i + 1) + ': ' + q.rotulo + ' — arraste para ajustar', keyboard: false, draggable: true });
      mk.on('dragend', () => { const ll = mk.getLatLng(); ajustarParada(q, ll.lat, ll.lng); });
      const pop = document.createElement('div'); pop.className = 'mp-pop';
      const tit = document.createElement('b'); tit.textContent = 'Parada ' + (i + 1);
      const end = document.createElement('p'); end.textContent = q.rotulo;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'mp-btn mp-btn-sec mp-btn-peq'; rm.textContent = 'Remover esta parada';
      rm.addEventListener('click', () => { mapa.closePopup(); removerParada(i); });
      pop.append(tit, end, rm); mk.bindPopup(pop);
      grupoParadas.addLayer(mk);
    });
  }
  function renderParadas() {
    const box = $('mapaParadasBox'), ol = $('mapaParadas'); ol.textContent = '';
    box.classList.toggle('hidden', !paradas.length && !feitas.length);
    const cab = box.querySelector && box.querySelector('.mp-paradas-cab b'); if (cab) cab.textContent = 'Paradas no caminho' + (paradas.length ? ' (' + paradas.length + ' de ' + MAX_PARADAS + ')' : '');
    paradas.forEach((q, i) => {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'mp-parada-n'; n.textContent = String(i + 1);
      const t = document.createElement('span'); t.className = 'mp-parada-t'; t.appendChild(document.createTextNode(q.rotulo));
      t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.title = 'Mostrar no mapa';
      const ver = () => { if (mapa) mapa.setView([q.lat, q.lng], Math.max(mapa.getZoom(), 16)); };
      t.addEventListener('click', ver); t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ver(); } });
      const inf = document.createElement('small'); inf.className = 'mp-parada-info'; t.appendChild(inf);
      li.append(n, t);
      const sv = document.createElement('select'); sv.className = 'mp-select mp-visita-sel'; sv.setAttribute('aria-label', 'Tempo de visita na parada ' + (i + 1));
      [['', 'visita: padrão'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 h'], ['90', '1 h 30']].forEach(([v, tx]) => { const op = document.createElement('option'); op.value = v; op.textContent = tx; sv.appendChild(op); });
      sv.value = q.visita != null ? String(q.visita) : '';
      sv.addEventListener('change', () => { q.visita = sv.value === '' ? null : +sv.value; atualizarCronograma(); });
      li.appendChild(sv);
      const mk = (txt, rot, fn, off) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-mini mp-mini-peq'; b.textContent = txt; b.setAttribute('aria-label', rot); b.title = rot; b.disabled = !!off; b.addEventListener('click', fn); li.appendChild(b); };
      mk('↑', 'Subir a parada ' + (i + 1), () => moverParada(i, -1), i === 0);
      mk('↓', 'Descer a parada ' + (i + 1), () => moverParada(i, 1), i === paradas.length - 1);
      mk('✕', 'Remover a parada ' + (i + 1), () => removerParada(i));
      const ac = document.createElement('div'); ac.className = 'mp-parada-acoes';
      const bt = (txt, rot, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-btn mp-btn-peq ' + cls; b.textContent = txt; b.setAttribute('aria-label', rot); b.addEventListener('click', fn); ac.appendChild(b); };
      bt('✓ Concluir', 'Concluir a parada ' + (i + 1) + ' (visita feita)', 'mp-btn-ok', () => encerrarParada(i, 'concluida', false));
      bt('Pular ›', 'Pular a parada ' + (i + 1) + ' e ir para a próxima', 'mp-btn-sec', () => encerrarParada(i, 'pulada', false));
      li.appendChild(ac);
      ol.appendChild(li);
    });
    renderFeitas();
    $('mapaOtimizar').classList.toggle('hidden', paradas.length < 2);
    atualizarBotaoCheguei();
    $('mapaVisitaBox').classList.toggle('hidden', !paradas.length); $('mapaCopiar').classList.toggle('hidden', !paradas.length);
    desenharParadas();
  }
  // resumo "Concluídas 2 · Puladas 1 · Faltam 3" e a lista do que já foi resolvido (com Desfazer / Retomar)
  function renderFeitas() {
    const res = $('mapaParadasResumo'), ol = $('mapaFeitas'); if (!res || !ol) return;
    ol.textContent = '';
    const c = feitas.filter((f) => f.estado === 'concluida').length, p = feitas.length - c;
    res.textContent = feitas.length ? ['Concluídas ' + c, p ? 'Puladas ' + p : '', 'Faltam ' + paradas.length].filter(Boolean).join(' · ') : '';
    res.classList.toggle('hidden', !feitas.length); ol.classList.toggle('hidden', !feitas.length);
    feitas.forEach((f) => {
      const li = document.createElement('li'); li.className = 'mp-feita is-' + f.estado;
      const m = document.createElement('span'); m.className = 'mp-feita-m'; m.textContent = f.estado === 'pulada' ? '↷' : '✓'; m.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span'); t.className = 'mp-parada-t'; t.textContent = f.q.rotulo;
      const e = document.createElement('small'); e.className = 'mp-parada-info'; e.textContent = f.estado === 'pulada' ? 'Pulada' : 'Concluída'; t.appendChild(e);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-btn mp-btn-sec mp-btn-peq'; b.textContent = f.estado === 'pulada' ? 'Retomar no fim' : 'Desfazer';
      b.addEventListener('click', () => retomarParada(f));
      li.append(m, t, b); ol.appendChild(li);
    });
  }
  function aposMudarParadas() { renderParadas(); if (destino) tracarRota(); }
  // pino da parada arrastado: usa o novo ponto e tenta achar o endereço dele
  async function ajustarParada(q, lat, lng) {
    if (paradas.indexOf(q) < 0) return;
    q.lat = lat; q.lng = lng; q.rotulo = lat.toFixed(5) + ', ' + lng.toFixed(5);
    renderParadas(); status('Procurando o endereço desse ponto…'); ocupado(true);
    try { const r = await buscarCoordenada(lat, lng); if (r && (r.address || r.display_name) && paradas.indexOf(q) >= 0) q.rotulo = rotuloCurto(r) || q.rotulo; }
    catch (e) { /* fica com as coordenadas como nome */ }
    finally { ocupado(false); }
    if (paradas.indexOf(q) >= 0) { renderParadas(); if (destino) tracarRota(); }
  }
  function moverParada(i, d) { const j = i + d; if (j < 0 || j >= paradas.length) return; const t = paradas[i]; paradas[i] = paradas[j]; paradas[j] = t; aposMudarParadas(); }
  function removerParada(i) { paradas.splice(i, 1); aposMudarParadas(); }
  async function adicionarParada() {
    if (!destino) { status('Escolha primeiro um destino; ele vira a parada e você busca o próximo.', 'erro'); return; }
    if (paradas.length >= MAX_PARADAS) { status('Limite de ' + MAX_PARADAS + ' paradas (mais o destino final).', 'erro'); return; }
    if (paradas.some((q) => U.distM(q, destino) < 30)) { status('Esse endereço já está nas paradas. Busque outro ou arraste o pino.', 'erro'); return; }
    seguir(false);
    paradas.push({ lat: destino.lat, lng: destino.lng, rotulo: destino.rotulo });
    senha++; destino = null;
    if (mDestino) { mapa.removeLayer(mDestino); mDestino = null; }
    limparRota();
    $('mapaBusca').value = ''; fecharResultados(); $('mapaDestinoBox').classList.add('hidden'); atualizarSalvar();
    renderParadas();
    status('Parada ' + paradas.length + ' adicionada. Busque o próximo endereço (ou toque no mapa): ele será o próximo ponto da rota.', 'ok');
    $('mapaBusca').focus();
  }
  // Com o mapa offline: ordem pelo TEMPO real de viagem (mão única e curvas). Sem ele (ou fora da área): linha reta.
  async function ordenarPontos(o, pts, fim) {
    const dentro = (lst) => lst.every(q => motor && motor.dentro(q.lat, q.lng));
    const porTempo = (org, lst, f) => {          // ordem pelo tempo real (mapa offline), se couber; senão, linha reta
      if (motor && motor.ordenar && lst.length >= 2 && lst.length <= 9 && dentro([org].concat(lst, f ? [f] : []))) {
        const res = motor.ordenar(modo, org, lst, f || null);
        if (!res.erro) return res.ordem.map(i => lst[i]);
      }
      return U.ordenarParadas(org, lst, f || null);
    };
    // mais de 10 pontos: o Google Maps divide em trechos de 9 paradas; ordena por vizinhança, trecho a trecho
    if (pts.length + (fim ? 1 : 0) > 10) {
      status('Agrupando as paradas por proximidade (de 9 em 9)…'); await new Promise((r) => setTimeout(r, 30));
      const g = U.agruparPorProximidade(o, pts, fim || null, 10, porTempo);
      return { lista: g.lista, grupos: g.grupos, offline: false };
    }
    if (motor && motor.ordenar && pts.length <= 9 && dentro([o].concat(pts, fim ? [fim] : []))) {
      status('Calculando a melhor ordem pelo tempo de viagem…'); await new Promise((r) => setTimeout(r, 30));
      const res = motor.ordenar(modo, o, pts, fim || null);
      if (!res.erro) return { lista: res.ordem.map(i => pts[i]), offline: true };
    }
    return { lista: U.ordenarParadas(o, pts, fim || null), offline: false };
  }
  async function otimizarParadas() {
    if (paradas.length < 2) return;
    try {
      const o = origemAtual || await obterOrigem();
      const r = await ordenarPontos(o, paradas, destino || null);
      const antes = U.comprimento(o, paradas, destino), depois = U.comprimento(o, r.lista, destino), ganho = antes - depois;
      paradas = r.lista;
      status((r.grupos ? 'Paradas reordenadas por proximidade em ' + r.grupos.length + ' trechos do Google Maps (1º = mais perto da partida, depois o mais perto de onde o anterior termina).' : r.offline ? 'Paradas reordenadas pelo menor tempo de viagem (mapa offline, respeitando mão única).' : 'Paradas reordenadas pela menor distância em linha reta.') + (ganho > 100 ? ' Economiza cerca de ' + fmtDist(ganho) + ' em linha reta.' : ' A ordem que você tinha já era boa.') + ' Confira e ajuste se precisar.', 'ok');
      aposMudarParadas();
    } catch (e) { mostrarErro(e); }
  }

  // ---------- lista de endereços colada → rota com várias paradas ----------
  async function montarDaLista() {
    const { itens, cortados } = U.listaDeEnderecos($('mapaLista').value, MAX_PARADAS + 1);
    if (itens.length < 2) { status('Cole pelo menos 2 endereços, um por linha.', 'erro'); return; }
    const minha = ++senha; seguir(false); ocupado(true);
    const achados = [], faltou = [], aprox = [], repetidos = [];
    try {
      await garantirMapa();
      for (let k = 0; k < itens.length; k++) {
        status('Procurando o endereço ' + (k + 1) + ' de ' + itens.length + '…' + (itens.length > 10 && k === 0 ? ' (cerca de 1 segundo por endereço; pode deixar a tela aberta)' : ''));
        const q = itens[k], c = U.lerCoordenadas(q);
        let pt = null;
        if (c) pt = { lat: c.lat, lng: c.lng, rotulo: q };
        else {
          const rs = await buscarEndereco(q);
          if (minha !== senha) return;
          if (rs.length) { pt = { lat: +rs[0].lat, lng: +rs[0].lon, rotulo: rotuloCurto(rs[0]) || q }; if (rs[0]._aviso) aprox.push(q); }
        }
        if (pt) achados.push(pt); else faltou.push(q);
      }
      if (minha !== senha) return;
      for (let a = achados.length - 1; a > 0; a--) if (achados.slice(0, a).some((q) => U.distM(q, achados[a]) < 30)) { repetidos.push(achados[a].rotulo); achados.splice(a, 1); }
      if (achados.length < 2) { status('Só consegui achar ' + achados.length + ' endereço(s). Não achei: ' + faltou.join('; ') + '. Confira a grafia (rua, número, bairro).', 'erro'); return; }
      const o = await obterOrigem();
      let seq = achados;
      let ordem = null;
      if ($('mapaListaOrdem').checked) { ordem = await ordenarPontos(o, achados, null); seq = ordem.lista; }
      if (minha !== senha) return;
      seguir(false); limparRota(); fecharResultados();
      paradas = seq.slice(0, -1); feitas = []; renderParadas();
      avisoDestino = [achados.length + ' endereços na rota' + ($('mapaListaOrdem').checked ? (ordem && ordem.grupos ? ', agrupados por proximidade em ' + ordem.grupos.length + ' trechos de até 9 paradas' : ', na melhor ordem') : '') + ' (o último é o destino).',
        faltou.length ? 'Não achei: ' + faltou.join('; ') + '.' : '', aprox.length ? 'Sem o número exato (só a rua): ' + aprox.join('; ') + ' — arraste o pino para ajustar.' : '',
        repetidos.length ? (repetidos.length === 1 ? 'Endereço repetido, contei uma vez: ' : repetidos.length + ' endereços repetidos, contei uma vez cada. Ex.: ') + repetidos.slice(0, 3).join('; ') + (repetidos.length > 3 ? '; e mais ' + (repetidos.length - 3) : '') + '.' : '',
        cortados ? 'Passou de ' + (MAX_PARADAS + 1) + ' endereços: ' + cortados + (cortados === 1 ? ' ficou de fora.' : ' ficaram de fora.') : ''].filter(Boolean).join(' ');
      $('mapaBusca').value = '';
      await marcarDestino(seq[seq.length - 1]); mapa.setView([seq[seq.length - 1].lat, seq[seq.length - 1].lng], 14);
      const det = $('mapaListaBox'); if (det && det.removeAttribute) det.removeAttribute('open');
      fecharTecladoNoCelular();
      await tracarRota();
    } catch (e) { mostrarErro(e); }
    finally { if (minha === senha) ocupado(false); }
  }

  // ---------- folhas resumo (PDF) → lista de endereços → rota ----------
  // O PDF é lido aqui no aparelho (pdf.js do próprio app). Só o quadro "Endereço da família" de cada folha vira texto (PaulusRotaFolhas.enderecosDeFolhas):
  // nome, CPF e código da família não entram na lista, não são mostrados e não vão a serviço nenhum.
  const POR_VEZ = MAX_PARADAS + 1;          // máximo de endereços por rota (limite das paradas do app)
  let filaFolhas = [], tamGrupo = POR_VEZ, promessaPdfJs = null;
  function carregarPdfJs() {
    if (promessaPdfJs) return promessaPdfJs;
    promessaPdfJs = new Promise((ok, falha) => {
      import('./pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href; ok(m); })
        .catch(() => { promessaPdfJs = null; falha(new Error('Não consegui carregar o leitor de PDF.')); });
    });
    return promessaPdfJs;
  }
  async function lerPaginasPdf(file) {
    const pdfjs = await carregarPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false }).promise;
    try {
      const paginas = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const conteudo = await pg.getTextContent();
        paginas.push(window.PaulusRotaFolhas.linhasDeItens(conteudo.items));
      }
      return paginas;
    } finally { try { doc.destroy(); } catch (e) { /* ok */ } }
  }
  // "Limpar lista": esvazia a caixa de endereços e as próximas paradas que ainda faltam montar (a rota já traçada não muda).
  function atualizarLimparLista() {
    const l = $('mapaFolhasLimpar'), t = $('mapaLista');
    if (l) l.disabled = !(filaFolhas.length || (t && String(t.value || '').trim()));
  }
  function limparLista() {
    filaFolhas = [];
    const t = $('mapaLista'); if (t) t.value = '';
    mostrarProximas();
    status('Lista de endereços limpa.', 'ok');
  }
  function mostrarProximas() {
    atualizarLimparLista();
    const b = $('mapaFolhasProx'); if (!b) return;
    b.classList.toggle('hidden', !filaFolhas.length);
    b.textContent = filaFolhas.length ? 'Montar as próximas paradas (faltam ' + filaFolhas.length + ')' : '';
  }
  async function montarGrupoFolhas(grupo, aviso) {
    // "—" separa rua e bairro no PDF; para a busca de endereço, vírgula funciona melhor
    $('mapaLista').value = grupo.map(t => t.replace(/\s+[—–]\s+/g, ', ')).join('\n');
    await montarDaLista();
    mostrarProximas();
    const el = $('mapaStatus'), atual = (el && el.textContent) || '', erro = !!(el && /is-erro/.test(el.className || ''));
    status([atual, aviso, filaFolhas.length ? 'Faltam ' + filaFolhas.length + ' endereço(s): use “Montar as próximas paradas”.' : ''].filter(Boolean).join(' '), erro ? 'erro' : 'ok');
  }
  async function importarFolhas() {
    const inp = $('mapaFolhasArq'), file = inp && inp.files && inp.files[0];
    if (!file) return;
    let unicos = [], lido = '';
    try {
      ocupado(true); status('Lendo o PDF neste aparelho…');
      if (!window.PaulusRotaFolhas || !window.PaulusRotaFolhas.enderecosDeFolhas) throw new Error('O leitor de folhas não carregou. Recarregue a página.');
      const r = window.PaulusRotaFolhas.enderecosDeFolhas(await lerPaginasPdf(file));
      if (!r.enderecos.length) { status('Não achei endereço nesse PDF. Ele precisa ter folhas resumo (quadro “Endereço da família”) ou o roteiro do PDF unificado.', 'erro'); return; }
      unicos = window.PaulusRotaFolhas.enderecosUnicos(r.enderecos);
      const rep = r.enderecos.length - unicos.length;
      lido = 'Li ' + r.enderecos.length + ' endereço(s) de ' + (r.via === 'folhas' ? r.folhas + ' folha(s)' : 'roteiro do PDF') + (rep ? ' (' + rep + ' repetido(s), contei uma vez)' : '') + '.';
    } catch (e) { mostrarErro(e); return; }
    finally { ocupado(false); try { inp.value = ''; } catch (e) { /* ok */ } }
    if (unicos.length < 2) { status(lido + ' Preciso de pelo menos 2 endereços diferentes para montar uma rota.', 'erro'); return; }
    tamGrupo = window.PaulusRotaFolhas.tamanhoDoGrupo(unicos.length, POR_VEZ);
    filaFolhas = unicos.slice(tamGrupo);
    await montarGrupoFolhas(unicos.slice(0, tamGrupo), lido + (filaFolhas.length ? ' Como passa de ' + POR_VEZ + ', dividi em grupos: este é o 1º, com ' + tamGrupo + ' paradas.' : ''));
  }
  async function montarProximas() {
    if (!filaFolhas.length) return;
    const grupo = filaFolhas.slice(0, tamGrupo); filaFolhas = filaFolhas.slice(tamGrupo);
    await montarGrupoFolhas(grupo, 'Próximo grupo, com ' + grupo.length + ' paradas.');
  }

  // "Voltar à partida": o destino atual vira a última parada e a partida vira o destino final
  async function voltarAPartida() {
    if (!destino) return;
    if (paradas.length >= MAX_PARADAS) { status('Limite de ' + MAX_PARADAS + ' paradas (mais o destino final).', 'erro'); return; }
    let o = origemAtual;
    if (!o) { try { o = await obterOrigem(); } catch (e) { mostrarErro(e); return; } }
    if (U.distM(o, destino) < 50) { status('O destino já é o ponto de partida.', 'erro'); return; }
    seguir(false);
    paradas.push({ lat: destino.lat, lng: destino.lng, rotulo: destino.rotulo });
    senha++; avisoDestino = ''; $('mapaBusca').value = '';
    renderParadas();
    try { await marcarDestino({ lat: o.lat, lng: o.lng, rotulo: o.rotulo === 'Minha posição' ? 'Ponto de partida' : o.rotulo }); await tracarRota(); } catch (e) { mostrarErro(e); }
  }

  // ---------- inverter e compartilhar ----------
  async function inverter() {
    if (!destino) return;
    let o = origemAtual;
    if (!o) { try { o = await obterOrigem(); } catch (e) { mostrarErro(e); return; } }
    seguir(false);
    const d = destino;
    origemOutro = { lat: d.lat, lng: d.lng, rotulo: d.rotulo };      // o antigo destino vira a partida
    if (paradas.length) { paradas.reverse(); renderParadas(); }
    selOrigem.value = 'outro'; ajustarOrigem(); $('mapaOrigemTexto').value = d.rotulo;
    $('mapaBusca').value = o.rotulo === 'Minha posição' ? '' : o.rotulo;
    senha++; avisoDestino = '';
    try { await marcarDestino({ lat: o.lat, lng: o.lng, rotulo: o.rotulo }); await tracarRota(); } catch (e) { mostrarErro(e); }
  }
  function textoRoteiro() {
    const nomes = { carro: 'carro/moto', pe: 'a pé', bike: 'bicicleta' };
    return U.roteiroTexto({ modo: nomes[modo] || modo, origem: origemAtual.rotulo, paradas, destino, cron: cronogramaAtual(), inicio: U.inicioDe($('mapaSaida').value), planejado: /^\d{1,2}:\d{2}$/.test($('mapaSaida').value) });
  }
  async function compartilhar() {
    if (!destino) return;
    const varios = !!origemAtual && linksGoogle(origemAtual).length > 1;      // mais de 9 paradas: vários links, todos no texto
    const url = $('mapaGoogle').href, texto = (paradas.length && origemAtual && rotas.length ? textoRoteiro() : 'Destino: ' + destino.rotulo) + (varios ? '\n' + textoLinksGoogle() : '');
    try { if (navigator.share) { await navigator.share(varios ? { title: 'Rota até o destino', text: texto } : { title: 'Rota até o destino', text: texto, url }); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(varios ? texto : texto + '\n' + url); status('Link da rota copiado.', 'ok'); }
    catch (e) { status('Não consegui copiar. Use "Abrir no Google Maps" e compartilhe de lá.', 'erro'); }
  }
  // Roteiro em PDF (A4): partida, cada parada com horário, visita e trecho, totais e aviso de dados pessoais
  function baixarPdf() {
    if (!destino || !rotas.length || !origemAtual) return;
    try {
      if (!window.jspdf) throw new Error('A biblioteca de PDF ainda não carregou. Confira a internet e tente de novo.');
      const cr = cronogramaAtual(), nomes = { carro: 'carro/moto', pe: 'a pé', bike: 'bicicleta' };
      const plan = /^\d{1,2}:\d{2}$/.test($('mapaSaida').value), ini = U.inicioDe($('mapaSaida').value);
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 14, F = 'helvetica';
      let y = 0, pag = 1;
      const rodape = () => { doc.setFont(F, 'normal'); doc.setFontSize(7.5); doc.setTextColor(110); doc.text('Contém endereços: guarde com cuidado (LGPD). Não inclui nomes de pessoas.', M, 288); doc.text('Página ' + pag, W - M, 288, { align: 'right' }); };
      const nova = () => { rodape(); doc.addPage(); pag++; y = 18; };
      doc.setFillColor(20, 107, 71); doc.rect(0, 0, W, 24, 'F');
      doc.setTextColor(255); doc.setFont(F, 'bold'); doc.setFontSize(16); doc.text('Roteiro de visitas', M, 12);
      doc.setFont(F, 'normal'); doc.setFontSize(9);
      doc.text(new Date(ini).toLocaleDateString('pt-BR') + ' · saída ' + (plan ? 'às ' + U.fmtHora(ini) : 'agora (' + U.fmtHora(ini) + ')') + ' · ' + (nomes[modo] || modo), M, 19);
      y = 33; doc.setTextColor(30);
      const linha = (rot, txt, extra, cor) => {
        const ls = doc.splitTextToSize(txt, 112), h = Math.max(1, ls.length) * 4.6 + 5;
        if (y + h > 280) nova();
        doc.setFont(F, 'bold'); doc.setFontSize(9); doc.setTextColor(cor || 20, cor ? 0 : 107, cor ? 0 : 71); doc.text(rot, M, y);
        doc.setTextColor(30); doc.setFont(F, 'normal'); doc.text(ls, M + 22, y);
        if (extra) { doc.setFontSize(8.5); doc.setTextColor(70); doc.text(extra, W - M, y, { align: 'right' }); }
        y += h; doc.setDrawColor(225); doc.line(M, y - 3.2, W - M, y - 3.2);
      };
      linha('Partida', origemAtual.rotulo, plan ? U.fmtHora(ini) : '');
      const pts = paradas.concat([destino]);
      pts.forEach((q, i) => {
        const e = cr && cr.etapas[i], ultimo = i === pts.length - 1, fica = e && !ultimo ? Math.round((e.saida - e.chegada) / 60000) : 0;
        linha(ultimo ? 'Destino' : 'Parada ' + (i + 1), q.rotulo, e ? 'chegada ' + U.fmtHora(e.chegada) + (fica ? ' · visita ' + fica + ' min' : '') + ' · ' + fmtDist(e.dist) + ' · ' + fmtTempo(e.dur) : '');
      });
      y += 2; if (y > 270) nova();
      doc.setFont(F, 'bold'); doc.setFontSize(10); doc.setTextColor(20);
      doc.text(cr ? 'Deslocamento ' + fmtDist(cr.dist) + ' · ' + fmtTempo(cr.dur) + (cr.parado ? ' + ' + fmtTempo(cr.parado) + ' de visitas' : '') + ' · fim previsto ' + U.fmtHora(cr.fim) : 'Total ' + fmtDist(rotas[rotaSel].distance) + ' · ' + fmtTempo(rotas[rotaSel].duration), M, y);
      y += 6; doc.setFont(F, 'normal'); doc.setFontSize(8); doc.setTextColor(90);
      doc.text('Tempos estimados sem trânsito. Mapa: OpenStreetMap; rotas: OSRM.', M, y);
      rodape();
      doc.save('roteiro-' + new Date(ini).toISOString().slice(0, 10) + '.pdf');
      status('Roteiro em PDF baixado.', 'ok');
    } catch (e) { status((e && e.message) || 'Não consegui gerar o PDF.', 'erro'); }
  }
  function enviarWhats() {     // abre o WhatsApp com o roteiro pronto; a pessoa escolhe para quem enviar
    if (!destino || !rotas.length || !origemAtual) return;
    try { window.open(U.linkWhats(textoRoteiro() + '\n' + textoLinksGoogle()), '_blank', 'noopener'); }
    catch (e) { status('Não consegui abrir o WhatsApp. Use "Copiar roteiro".', 'erro'); }
  }

  async function copiarRoteiro() {
    if (!destino || !rotas.length || !origemAtual) return;
    try { await navigator.clipboard.writeText(textoRoteiro()); status('Roteiro copiado. Cole onde precisar (WhatsApp, ficha de visita…).', 'ok'); }
    catch (e) { status('Não consegui copiar automaticamente. Use \"Compartilhar\" ou \"Abrir no Google Maps\".', 'erro'); }
  }

  function mostrarErro(e) { status(((e && e.message) || 'Algo deu errado.') + (e && e.rede && !motor && AMO ? DICA_OFFLINE : ''), 'erro'); ocupado(false); }

  function limparTudo() {
    senha++;
    seguir(false);
    destino = null; origemOutro = null; paradas = []; feitas = []; mostrarDesfazer(null);
    if (mapa) { if (mDestino) { mapa.removeLayer(mDestino); mDestino = null; } limparRota(); }
    $('mapaBusca').value = ''; $('mapaResultados').classList.add('hidden'); $('mapaDestinoBox').classList.add('hidden');
    renderParadas(); status(''); ocupado(false);
    salvaAbertaId = ''; atualizarSalvar(); if ($('mapaSalvaNome')) $('mapaSalvaNome').value = '';
  }

  // ---------- rotas salvas (Firebase) ----------
  // Guardadas na conta do usuário (users/{uid}/rotas/{id}, ponte window.__paulusRotas no index.html) e iguais em todos os aparelhos.
  // Vai só o que a pessoa mandou salvar: nome da rota, partida (se for endereço fixo — "Minha posição" nunca é guardada),
  // paradas, destino, tempo de visita e horários. Nada de nome de pessoa, NIS ou CPF.
  const MAX_SALVAS = 50;
  const ID_ENVIADA = 'enviada';      // 1 rota "em trânsito": a última enviada com o botão "Enviar aos meus aparelhos"
  let enviadaVista = +lerPref('paulusMapaEnviadaVista', '0') || 0, recebida = null, avisouToast = 0;
  let salvas = [], salvasErro = null, salvaAbertaId = '', ligouNuvem = false;
  const nuvem = () => window.__paulusRotas || null;
  const r6 = (n) => Math.round(+n * 1e6) / 1e6;
  const limpaNome = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const ponto = (q) => ({ lat: r6(q.lat), lng: r6(q.lng), rotulo: String(q.rotulo || '').slice(0, 200) });
  const pontoValido = (q) => !!q && isFinite(q.lat) && isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
  function msgSalvas(txt, tipo) { const el = $('mapaSalvasMsg'); if (!el) return; el.textContent = txt || ''; el.classList.toggle('is-erro', tipo === 'erro'); el.classList.toggle('is-ok', tipo === 'ok'); }
  function atualizarSalvar() {
    const b = $('mapaSalvar'); if (!b) return;
    b.disabled = !destino; if ($('mapaNuvem')) $('mapaNuvem').disabled = !destino; if ($('mapaLink')) $('mapaLink').disabled = !destino;
    b.title = destino ? '' : 'Escolha o destino (e as paradas, se houver) para poder salvar';
  }
  // o que vai para a nuvem: lista simples, sem nada do aparelho
  function dadosDaRota(nome, anterior) {
    const tipo = $('mapaOrigem').value;
    let origem = { tipo: 'pos' };
    if (tipo === 'partida') origem = { tipo: 'partida' };
    else if (tipo === 'outro') {
      const o = origemAtual && origemAtual.rotulo !== 'Minha posição' ? origemAtual : origemOutro;
      origem = pontoValido(o) ? Object.assign({ tipo: 'outro' }, ponto(o)) : { tipo: 'outro', rotulo: String($('mapaOrigemTexto').value || '').slice(0, 200) };
    }
    const agora = Date.now(), saida = $('mapaSaida').value, limite = $('mapaLimite').value, visita = $('mapaVisita').value;
    return {
      nome, modo, origem,
      // as puladas voltam ao fim da fila (ainda faltam); as concluídas não entram
      paradas: paradas.concat(feitas.filter((f) => f.estado === 'pulada').map((f) => f.q)).map((q) => Object.assign(ponto(q), { visita: q.visita != null && isFinite(q.visita) ? +q.visita : null })),
      destino: ponto(destino),
      saida: /^\d{1,2}:\d{2}$/.test(saida) ? saida : '', limite: /^\d{1,2}:\d{2}$/.test(limite) ? limite : '', visita: /^\d{1,3}$/.test(visita) ? visita : '0',
      criadoEm: (anterior && anterior.criadoEm) || agora, atualizadoEm: agora
    };
  }
  async function salvarRota() {
    const ponte = nuvem();
    if (!ponte || !ponte.logado()) { msgSalvas('Entre na sua conta para salvar rotas.', 'erro'); return; }
    if (!destino) { msgSalvas('Monte a rota primeiro: escolha ao menos o destino.', 'erro'); return; }
    const campo = $('mapaSalvaNome'), nome = limpaNome(campo.value);
    if (!nome) { msgSalvas('Dê um nome à rota (ex.: “Terça — Araceli”).', 'erro'); campo.focus(); return; }
    const igual = salvas.find((x) => x.id !== ID_ENVIADA && String(x.nome || '').toLowerCase() === nome.toLowerCase());
    if (!igual && salvas.length >= MAX_SALVAS) { msgSalvas('Limite de ' + MAX_SALVAS + ' rotas salvas. Apague alguma para salvar outra.', 'erro'); return; }
    let h, aviso = false;
    const dadosSalvar = dadosDaRota(nome, igual);
    if (dadosSalvar.paradas.length > MAX_PARADAS) { msgSalvas('A nuvem aceita até ' + MAX_PARADAS + ' paradas (mais o destino). Conclua ou tire ' + (dadosSalvar.paradas.length - MAX_PARADAS) + ' parada(s) e salve de novo.', 'erro'); return; }
    try { h = ponte.salvar(dadosSalvar, igual && igual.id); }
    catch (e) { msgSalvas((e && e.message) || 'Não consegui salvar a rota.', 'erro'); return; }
    salvaAbertaId = h.id; campo.value = nome; fecharTecladoNoCelular();
    const pronto = Promise.resolve(h.pronto).then(() => 'ok');
    pronto.catch((e) => { if (aviso) msgSalvas(erroNuvem(e), 'erro'); });
    try {
      const r = await Promise.race([pronto, esperar(3500).then(() => 'pendente')]);
      if (r === 'pendente') { aviso = true; msgSalvas('“' + nome + '” guardada neste aparelho; sobe para a sua conta quando a internet voltar.', 'ok'); }
      else msgSalvas((igual ? 'Rota “' + nome + '” atualizada' : 'Rota “' + nome + '” salva') + ' na sua conta. Já aparece nos seus outros aparelhos.', 'ok');
    } catch (e) { msgSalvas(erroNuvem(e), 'erro'); }
  }
  function erroNuvem(e) {
    if (e && e.code === 'permission-denied') return 'A nuvem recusou a rota. Publique as regras novas (firestore.rules) no Console do Firebase e tente de novo.';
    return (e && e.message) || 'Não consegui falar com a sua conta agora. Tente de novo.';
  }
  async function abrirSalva(r) {
    if (!r || !pontoValido(r.destino)) { msgSalvas('Essa rota salva está incompleta.', 'erro'); return; }
    const ps = (Array.isArray(r.paradas) ? r.paradas : []).filter(pontoValido).slice(0, MAX_PARADAS).map((q) => ({ lat: +q.lat, lng: +q.lng, rotulo: String(q.rotulo || q.lat + ', ' + q.lng), visita: q.visita != null && isFinite(q.visita) ? +q.visita : null }));
    seguir(false); const minha = ++senha; limparRota();
    if (PERFIS[r.modo]) definirModo(r.modo);
    const o = r.origem || {}; origemOutro = null;
    if (o.tipo === 'outro' && pontoValido(o) && o.rotulo) { selOrigem.value = 'outro'; origemOutro = { lat: +o.lat, lng: +o.lng, rotulo: String(o.rotulo) }; $('mapaOrigemTexto').value = origemOutro.rotulo; }
    else if (o.tipo === 'outro' && o.rotulo) { selOrigem.value = 'outro'; $('mapaOrigemTexto').value = String(o.rotulo); }
    else selOrigem.value = o.tipo === 'partida' ? 'partida' : 'pos';
    gravarPref('paulusMapaOrigem', selOrigem.value); ajustarOrigem();
    $('mapaSaida').value = /^\d{1,2}:\d{2}$/.test(r.saida) ? r.saida : '';
    if (/^\d{1,2}:\d{2}$/.test(r.limite)) { $('mapaLimite').value = r.limite; gravarPref('paulusMapaLimite', r.limite); } else $('mapaLimite').value = '';
    if (r.visita != null && Array.from($('mapaVisita').options).some((x) => x.value === String(r.visita))) { $('mapaVisita').value = String(r.visita); gravarPref('paulusMapaVisita', String(r.visita)); }
    paradas = ps; feitas = []; renderParadas();
    $('mapaBusca').value = ''; fecharResultados(); $('mapaSalvaNome').value = r.id === ID_ENVIADA ? '' : (r.nome || ''); salvaAbertaId = r.id || '';
    avisoDestino = 'Rota “' + (r.nome || 'salva') + '” aberta.';
    try {
      await marcarDestino({ lat: +r.destino.lat, lng: +r.destino.lng, rotulo: String(r.destino.rotulo || r.destino.lat + ', ' + r.destino.lng) });
      if (minha !== senha) return;
      mapa.setView([destino.lat, destino.lng], 14);
      fecharTecladoNoCelular();
      await tracarRota();
    } catch (e) { mostrarErro(e); }
  }
  async function apagarSalva(r) {
    const ponte = nuvem(); if (!ponte || !r) return;
    const ok = window.confirm('Apagar a rota “' + (r.nome || '') + '” da sua conta? Ela some de todos os seus aparelhos.');
    if (!ok) return;
    try { await Promise.race([Promise.resolve(ponte.apagar(r.id)), esperar(3500)]); if (salvaAbertaId === r.id) salvaAbertaId = ''; msgSalvas('Rota “' + (r.nome || '') + '” apagada.', 'ok'); }
    catch (e) { msgSalvas(erroNuvem(e), 'erro'); }
  }
  function resumoSalva(r) {
    const nomes = { carro: 'carro/moto', pe: 'a pé', bike: 'bicicleta' }, n = Array.isArray(r.paradas) ? r.paradas.length : 0;
    return (n ? n + (n === 1 ? ' parada + destino' : ' paradas + destino') : 'só o destino') + ' · ' + (nomes[r.modo] || 'carro/moto') + (r.saida ? ' · sai às ' + r.saida : '') + (r.pendente ? ' · aguardando sincronizar' : '');
  }
  function renderSalvas(lista, erro) {
    salvas = Array.isArray(lista) ? lista : []; salvasErro = erro || null;
    const ul = $('mapaSalvasLista'), cont = $('mapaSalvasN'); if (!ul) return;
    ul.textContent = ''; if (cont) cont.textContent = salvas.length ? '(' + salvas.length + ')' : '';
    if (salvasErro) msgSalvas(salvasErro.code === 'permission-denied' ? erroNuvem(salvasErro) : 'Não consegui ler as rotas salvas agora (sem internet?). Elas voltam quando a conexão voltar.', 'erro');
    else if ($('mapaSalvasMsg') && /^(Não consegui ler|A nuvem recusou)/.test($('mapaSalvasMsg').textContent)) msgSalvas('');
    if (!salvas.length && !salvasErro) { const li = document.createElement('li'); li.className = 'mp-salvas-vazia'; li.textContent = 'Nenhuma rota salva ainda.'; ul.appendChild(li); }
    salvas.forEach((r) => {
      const li = document.createElement('li'); li.className = 'mp-salva' + (r.id === salvaAbertaId ? ' is-aberta' : '');
      const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'mp-salva-abrir'; ab.title = 'Abrir esta rota';
      const t = document.createElement('b'); t.textContent = r.nome || 'Rota sem nome';
      const d = document.createElement('small'); d.textContent = resumoSalva(r) + (r.destino && r.destino.rotulo ? ' — ' + r.destino.rotulo : '');
      ab.append(t, d); ab.addEventListener('click', () => { abrirSalva(r); });
      const ap = document.createElement('button'); ap.type = 'button'; ap.className = 'mp-mini mp-mini-peq'; ap.textContent = '✕'; ap.setAttribute('aria-label', 'Apagar a rota ' + (r.nome || '')); ap.title = 'Apagar esta rota';
      ap.addEventListener('click', () => { apagarSalva(r); });
      li.append(ab, ap); ul.appendChild(li);
    });
  }
  const nomeDoAparelho = () => { const ua = (navigator.userAgent || ''); return /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'celular' : 'computador'; };
  // Rota em link: serve para mandar a outro aparelho/pessoa que NÃO está na mesma conta (WhatsApp, e-mail). Abre no app, sem Google Maps.
  async function compartilharLink() {
    if (!destino) { msgSalvas('Monte a rota primeiro: escolha ao menos o destino.', 'erro'); return; }
    const dados = dadosDaRota(limpaNome($('mapaSalvaNome').value) || 'Rota compartilhada', null);
    if (dados.paradas.length > MAX_PARADAS) { msgSalvas('O link leva até ' + MAX_PARADAS + ' paradas (mais o destino). Tire ' + (dados.paradas.length - MAX_PARADAS) + ' parada(s).', 'erro'); return; }
    let url; try { url = U.linkDoApp(location.origin + location.pathname, dados); } catch (e) { msgSalvas('Não consegui montar o link.', 'erro'); return; }
    const texto = 'Rota no Paulus: ' + dados.nome + ' (' + dados.paradas.length + (dados.paradas.length === 1 ? ' parada' : ' paradas') + ' + destino). Abra o link no aparelho com o app: ' + url + '\nContém endereços: não repasse a quem não deve receber.';
    try { if (navigator.share) { await navigator.share({ title: dados.nome, text: texto }); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(texto); msgSalvas('Link da rota copiado. Cole no WhatsApp ou e-mail; ao abrir, o app mostra “Rota recebida — Abrir”.', 'ok'); }
    catch (e) { msgSalvas('Não consegui copiar o link automaticamente.', 'erro'); }
  }
  // link recebido (#paulus-rota=…): mostra a faixa "Rota recebida por link" e limpa o endereço; só abre quando a pessoa tocar em Abrir
  function lerLinkRecebido() {
    let h = ''; try { h = location.hash || ''; } catch (e) { return; }
    if (h.indexOf(U.PREFIXO_ROTA) < 0) return;
    const d = U.decodificarRota(h);
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* sem histórico: o link fica no endereço, sem problema */ }
    if (!d) { setTimeout(() => { if (window.toast) window.toast('O link da rota está incompleto ou inválido.', 'erro'); }, 600); return; }
    mostrarRecebida(Object.assign({ id: '', pendente: false, viaLink: true, atualizadoEm: Date.now() }, d), 'Rota recebida por link');
    try { sec.scrollIntoView({ block: 'start' }); } catch (e) { /* sem rolagem */ }
  }
  async function enviarAosAparelhos() {
    const ponte = nuvem();
    if (!ponte || !ponte.logado()) { msgSalvas('Entre na sua conta para enviar a rota aos seus aparelhos.', 'erro'); return; }
    if (!destino) { msgSalvas('Monte a rota primeiro: escolha ao menos o destino.', 'erro'); return; }
    const dados = dadosDaRota(limpaNome($('mapaSalvaNome').value) || 'Rota enviada do ' + nomeDoAparelho(), salvas.find((x) => x.id === ID_ENVIADA));
    if (dados.paradas.length > MAX_PARADAS) { msgSalvas('A nuvem aceita até ' + MAX_PARADAS + ' paradas (mais o destino). Conclua ou tire ' + (dados.paradas.length - MAX_PARADAS) + ' parada(s) e envie de novo.', 'erro'); return; }
    let h; try { h = ponte.salvar(dados, ID_ENVIADA); } catch (e) { msgSalvas((e && e.message) || 'Não consegui enviar a rota.', 'erro'); return; }
    enviadaVista = dados.atualizadoEm; gravarPref('paulusMapaEnviadaVista', String(enviadaVista)); esconderRecebida();   // este aparelho não avisa a si mesmo
    const pronto = Promise.resolve(h.pronto).then(() => 'ok'); let aviso = false;
    pronto.catch((e) => { if (aviso) msgSalvas(erroNuvem(e), 'erro'); });
    try {
      const r = await Promise.race([pronto, esperar(3500).then(() => 'pendente')]);
      if (r === 'pendente') { aviso = true; msgSalvas('Rota guardada neste aparelho; segue para os outros quando a internet voltar.', 'ok'); }
      else msgSalvas('Rota enviada. Nos outros aparelhos com o app aberto na sua conta aparece “Rota recebida — Abrir”.', 'ok');
    } catch (e) { msgSalvas(erroNuvem(e), 'erro'); }
  }
  function esconderRecebida() { recebida = null; const f = $('mapaRecebida'); if (f) f.classList.add('hidden'); }
  // Compara por IGUALDADE com a última versão vista/enviada (e não "mais nova"): cada aparelho carimba com o próprio relógio, e um celular
  // com a hora atrasada mandava rotas que o outro aparelho nunca mostrava.
  function avisarRecebida(lista) {
    const f = $('mapaRecebida'); if (!f) return;
    const r = (lista || []).find((x) => x.id === ID_ENVIADA);
    if (!r) { if (recebida && recebida.id === ID_ENVIADA) esconderRecebida(); return; }      // a rota enviada foi apagada em outro aparelho
    if (r.pendente) return;
    if (r.atualizadoEm === enviadaVista || !pontoValido(r.destino)) { if (recebida && recebida.id === ID_ENVIADA) esconderRecebida(); return; }
    mostrarRecebida(r, 'Rota recebida de outro aparelho');
  }
  function mostrarRecebida(r, titulo) {
    const f = $('mapaRecebida'); if (!f) return;
    recebida = r;
    const n = Array.isArray(r.paradas) ? r.paradas.length : 0;
    const min = Math.max(0, Math.round((Date.now() - r.atualizadoEm) / 60000));
    const quando = min < 1 ? 'agora há pouco' : min < 60 ? 'há ' + min + ' min' : min < 1440 ? 'há ' + Math.round(min / 60) + ' h' : 'há ' + Math.round(min / 1440) + ' d';
    $('mapaRecebidaTxt').textContent = titulo + (r.viaLink ? '' : ' (' + quando + ')') + ': ' + (r.nome || 'Rota enviada') + ' — ' + (n ? n + (n === 1 ? ' parada + destino' : ' paradas + destino') : 'só o destino') + '.';
    const ja = avisouToast === r.atualizadoEm; avisouToast = r.atualizadoEm;
    f.classList.remove('hidden');
    // se o mapa está fora da tela, um aviso no rodapé para a rota não passar despercebida
    try {
      const b = sec.getBoundingClientRect();
      if (!ja && window.toast && (b.bottom < 0 || b.top > (window.innerHeight || 800))) window.toast('Rota recebida de outro aparelho. Veja em “Mapa e rotas”.', 'info');
    } catch (e) { /* sem layout: tudo bem */ }
  }
  function marcarRecebidaVista() { if (recebida && recebida.id === ID_ENVIADA) { enviadaVista = recebida.atualizadoEm; gravarPref('paulusMapaEnviadaVista', String(enviadaVista)); } }
  function ligarNuvem() {
    if (ligouNuvem || !nuvem() || !nuvem().observar) return;
    ligouNuvem = true; nuvem().observar((l, e) => { renderSalvas(l, e); avisarRecebida(l); });
  }

  // ---------- ligações ----------
  function definirModo(m) {
    modo = m; gravarPref('paulusMapaModo', m);
    sec.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === m ? 'true' : 'false'));
  }
  definirModo(modo);
  sec.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => { definirModo(b.dataset.modo); if (destino) tracarRota(); }));

  const selOrigem = $('mapaOrigem');
  const origemSalva = lerPref('paulusMapaOrigem', 'pos');
  if (['pos', 'partida', 'outro'].includes(origemSalva)) selOrigem.value = origemSalva;
  const ajustarOrigem = () => $('mapaOrigemBox').classList.toggle('hidden', selOrigem.value !== 'outro');
  ajustarOrigem();
  selOrigem.addEventListener('change', () => { gravarPref('paulusMapaOrigem', selOrigem.value); ajustarOrigem(); if (selOrigem.value === 'outro') $('mapaOrigemTexto').focus(); else if (destino) tracarRota(); });
  $('mapaOrigemTexto').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (destino) tracarRota(); } });



  // ---------- tela cheia (CSS + API de tela cheia do navegador; o botão Voltar do Android também sai) ----------
  let cheia = false, viaApi = false, saindo = false;
  const MOBILE = () => window.matchMedia('(max-width: 1023px)').matches;
  const ajustarMapa = () => { if (mapa) setTimeout(() => { mapa.invalidateSize(); }, 80); };
  function recolherMais(sim) { const m = sec.querySelector('.mp-mais'); m.classList.toggle('is-recolhido', !!sim); $('mapaMais').setAttribute('aria-expanded', sim ? 'false' : 'true'); }
  function margens() {
    if (!cheia) return { padding: [30, 30] };
    const topo = sec.querySelector('.mp-topo').offsetHeight, base = sec.querySelector('.mp-base').offsetHeight;
    if (MOBILE()) return { paddingTopLeft: [24, topo + 16], paddingBottomRight: [24, base + 16] };
    return { paddingTopLeft: [sec.querySelector('.mp-topo').offsetWidth + 40, 30], paddingBottomRight: [30, 30] };
  }
  function entrarCheia() {
    if (cheia) return;
    cheia = true;
    sec.classList.add('is-tela-cheia'); document.documentElement.classList.add('mp-sem-rolagem');
    $('mapaTelaCheia').setAttribute('aria-pressed', 'true'); $('mapaSairCheia').classList.remove('hidden');
    recolherMais(MOBILE()); $('mapaMais').classList.remove('hidden');
    $('mapaResumo').classList.add('is-passos-fechados'); $('mapaPassosBtn').setAttribute('aria-expanded', 'false');
    try { history.pushState({ paulusMapaCheia: 1 }, ''); } catch (e) { /* sem histórico: o botão Sair continua funcionando */ }
    try { if (sec.requestFullscreen) sec.requestFullscreen({ navigationUI: 'hide' }).then(() => { viaApi = true; }).catch(() => {}); } catch (e) { /* só a versão em CSS */ }
    garantirMapa().then(ajustarMapa).catch(() => {}); ajustarMapa();
  }
  function fecharCheia() {
    if (!cheia) return;
    cheia = false; saindo = false;
    sec.classList.remove('is-tela-cheia'); document.documentElement.classList.remove('mp-sem-rolagem');
    $('mapaTelaCheia').setAttribute('aria-pressed', 'false'); $('mapaSairCheia').classList.add('hidden'); $('mapaMais').classList.add('hidden');
    sec.querySelector('.mp-mais').classList.remove('is-recolhido');
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* já saiu */ } }
    viaApi = false; ajustarMapa();
    if (document.activeElement && document.activeElement.blur && sec.contains(document.activeElement)) document.activeElement.blur();   // fecha o teclado ao voltar
    try { sec.scrollIntoView({ block: 'start' }); } catch (e) { /* sem rolagem automática */ }
  }
  function sairCheia() {
    if (!cheia || saindo) return;
    saindo = true;   // Esc/Voltar/botão podem chegar juntos: só um history.back()
    if (history.state && history.state.paulusMapaCheia) history.back();   // dispara o popstate abaixo, que fecha
    else fecharCheia();
  }
  $('mapaTelaCheia').addEventListener('click', () => (cheia ? sairCheia() : entrarCheia()));
  $('mapaSairCheia').addEventListener('click', sairCheia);
  $('mapaMais').addEventListener('click', () => recolherMais(!sec.querySelector('.mp-mais').classList.contains('is-recolhido')));
  $('mapaPassosBtn').addEventListener('click', () => { const f = $('mapaResumo').classList.toggle('is-passos-fechados'); $('mapaPassosBtn').setAttribute('aria-expanded', f ? 'false' : 'true'); });
  // celular, fora da tela cheia: o mapa pequeno prendia a rolagem da página — tocar nele (ou na busca) abre a tela cheia
  $('mapaToqueAbrir').addEventListener('click', () => { if (!cheia) entrarCheia(); });
  const abrirPelaBusca = () => { if (!cheia && MOBILE()) { entrarCheia(); setTimeout(() => $('mapaBusca').focus(), 0); } };
  $('mapaBusca').addEventListener('focus', abrirPelaBusca);
  $('mapaBusca').addEventListener('click', abrirPelaBusca);   // o campo pode já estar focado ao voltar da tela cheia
  const ajuda = $('mapaAjuda'); if (ajuda && !MOBILE()) ajuda.open = true;
  const envio = $('mapaEnvio'); if (envio && !MOBILE()) envio.open = true;   // no computador os botões de enviar já vêm à mostra
  // alça do painel de rota: toque alterna o passo a passo; deslizar para cima abre e para baixo fecha
  const alternarPassos = (abrir) => {
    const r = $('mapaResumo'), fechado = r.classList.contains('is-passos-fechados'), quer = abrir === undefined ? fechado : abrir;
    r.classList.toggle('is-passos-fechados', !quer); $('mapaPassosBtn').setAttribute('aria-expanded', quer ? 'true' : 'false');
  };
  const alca = $('mapaAlca'); let yAlca = null;
  alca.addEventListener('click', () => alternarPassos());
  alca.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; yAlca = t ? t.clientY : null; }, { passive: true });
  alca.addEventListener('touchend', (e) => {
    const t = e.changedTouches && e.changedTouches[0]; if (yAlca == null || !t) return;
    const dy = t.clientY - yAlca; yAlca = null;
    if (Math.abs(dy) > 28) { alternarPassos(dy < 0); if (e.cancelable) e.preventDefault(); }   // preventDefault: o toque não vira clique duplicado
  });
  // teclado do celular: o painel de busca usa só a parte visível da tela
  if (window.visualViewport) {
    const vv = window.visualViewport, ajustarVV = () => sec.style.setProperty('--mp-vvh', Math.round(vv.height) + 'px');
    vv.addEventListener('resize', ajustarVV); ajustarVV();
  }   // no computador a ajuda já vem aberta
  window.addEventListener('popstate', fecharCheia);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cheia) sairCheia(); });
  document.addEventListener('fullscreenchange', () => { if (cheia && viaApi && !document.fullscreenElement) sairCheia(); else ajustarMapa(); });
  window.addEventListener('resize', ajustarMapa); window.addEventListener('orientationchange', ajustarMapa);
  // o painel de baixo cobre a atribuição do mapa: sobe os controles do Leaflet acima dele
  if ('ResizeObserver' in window) new ResizeObserver(() => sec.style.setProperty('--mp-base-h', (sec.querySelector('.mp-base').offsetHeight + 8) + 'px')).observe(sec.querySelector('.mp-base'));

  // ---------- voz (Web Speech API do navegador; pt-BR) ----------
  const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;

  // "ir para rua santo agostinho número 193 bairro centenário" -> "Rua santo agostinho, 193, centenário"
  function limparFala(t) {
    let s = String(t || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:por favor[, ]+)?(?:ir|vá|va|levar|leve|me leve|navegar|navegue|traçar|trace|rota|buscar|busque|procurar|procure|endereço|destino)(?:\s+(?:até|ate|para|pra|a|o|ao|na|no|de|do|da))*\s+/i, '');
    s = s.replace(/\s*\b(?:n[úu]mero|n[º°]\.?)\s*(?=\d)/gi, ', ').replace(/\s+\b(?:n[úu]mero)\b\s*/gi, ', ');
    s = s.replace(/\s+bairro\s+/gi, ', ').replace(/\s*,(\s*,)+/g, ',').replace(/\s+,/g, ',').replace(/[.\s]+$/, '').replace(/^[\s,]+/, '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  const ERROS_VOZ = {
    'not-allowed': 'O microfone foi negado. Permita o acesso ao microfone no navegador (ícone de cadeado, ao lado do endereço).',
    'service-not-allowed': 'O navegador não liberou o reconhecimento de voz. Permita o microfone ou digite o endereço.',
    'no-speech': 'Não ouvi nada. Toque no microfone e fale o endereço de novo.',
    'audio-capture': 'Não encontrei um microfone neste aparelho.',
    'network': 'O reconhecimento de voz precisa de internet. Confira a conexão ou digite o endereço.',
    'language-not-supported': 'Este navegador não reconhece português por voz. Digite o endereço.'
  };

  function ligarVoz(btn, input, aoTerminar) {
    if (!btn || !input) return;
    if (!Reconhecimento) { btn.classList.add('hidden'); return; }   // ex.: Firefox: só digitando
    let rec = null, ativo = false;
    btn.addEventListener('click', () => {
      if (ativo && rec) { try { rec.stop(); } catch (e) { /* já parou */ } return; }
      let final = '', erro = '';
      try {
        rec = new Reconhecimento();
        rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      } catch (e) { status('Não consegui iniciar o microfone. Digite o endereço.', 'erro'); return; }
      rec.onstart = () => { ativo = true; btn.setAttribute('aria-pressed', 'true'); btn.classList.add('is-ouvindo'); status('Ouvindo… diga o endereço (ex.: "Rua Santo Agostinho, 193, Centenário").'); };
      rec.onresult = (e) => {
        let txt = '', ok = false;
        for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) ok = true; }
        input.value = txt;
        if (ok) final = limparFala(txt) || txt.trim();
      };
      rec.onerror = (e) => { erro = ERROS_VOZ[e && e.error] || (e && e.error === 'aborted' ? '' : 'Não consegui entender. Tente de novo ou digite o endereço.'); };
      rec.onend = () => {
        ativo = false; btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-ouvindo');
        if (erro) { status(erro, 'erro'); return; }
        if (final) { input.value = final; status(''); if (aoTerminar) aoTerminar(final); }
        else status('Não ouvi nenhum endereço. Toque no microfone e tente de novo.', 'erro');
      };
      try { rec.start(); } catch (e) { status('Não consegui iniciar o microfone agora. Tente de novo.', 'erro'); }
    });
  }
  ligarVoz($('mapaVoz'), $('mapaBusca'), () => { const f = $('mapaForm'); if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true })); });
  ligarVoz($('mapaVozOrigem'), $('mapaOrigemTexto'), () => { if (destino) tracarRota(); });

  $('mapaForm').addEventListener('submit', buscar);
  $('mapaMinhaPos').addEventListener('click', async () => {
    try { await garantirMapa(); await usarMinhaPosicao(true); selOrigem.value = 'pos'; ajustarOrigem(); gravarPref('paulusMapaOrigem', 'pos'); if (destino) await tracarRota(); }
    catch (e) { mostrarErro(e); }
  });
  // botão redondo sobre o mapa: só centraliza na posição (não muda a partida nem refaz a rota)
  $('mapaLocalizar').addEventListener('click', async () => {
    try { soltoAte = 0; await garantirMapa(); await usarMinhaPosicao(true); }
    catch (e) { mostrarErro(e); }
  });
  $('mapaLimpar').addEventListener('click', limparTudo);
  $('mapaInverter').addEventListener('click', inverter);
  $('mapaAddParada').addEventListener('click', adicionarParada);
  $('mapaOtimizar').addEventListener('click', otimizarParadas);
  $('mapaSeguir').addEventListener('click', () => seguir(!seguindo));
  $('mapaCompartilhar').addEventListener('click', compartilhar);
  $('mapaCopiar').addEventListener('click', copiarRoteiro);
  $('mapaWhats').addEventListener('click', enviarWhats);
  $('mapaPdf').addEventListener('click', baixarPdf);
  $('mapaVoltar').addEventListener('click', voltarAPartida);
  $('mapaCheguei').addEventListener('click', () => cumprirParada(true));
  $('mapaPular').addEventListener('click', () => encerrarParada(0, 'pulada', false));
  $('mapaDesfazer').addEventListener('click', () => { if (ultimaFeita) retomarParada(ultimaFeita, true); });
  $('mapaListaMontar').addEventListener('click', montarDaLista);
  if ($('mapaFolhasArq')) { $('mapaFolhasArq').addEventListener('change', importarFolhas); }
  if ($('mapaFolhasProx')) { $('mapaFolhasProx').addEventListener('click', montarProximas); }
  if ($('mapaFolhasLimpar')) { $('mapaFolhasLimpar').addEventListener('click', limparLista); }
  if ($('mapaLista')) { $('mapaLista').addEventListener('input', atualizarLimparLista); }
  // rotas salvas na conta (Firebase): salvar, abrir e apagar; a lista acompanha entrada/saída de conta e os outros aparelhos
  if ($('mapaSalvar')) {
    $('mapaSalvar').addEventListener('click', salvarRota);
    if ($('mapaNuvem')) $('mapaNuvem').addEventListener('click', enviarAosAparelhos);
    if ($('mapaLink')) $('mapaLink').addEventListener('click', compartilharLink);
    if ($('mapaRecebidaAbrir')) $('mapaRecebidaAbrir').addEventListener('click', () => { const r = recebida; marcarRecebidaVista(); esconderRecebida(); if (r) { try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} abrirSalva(r); } });
    if ($('mapaRecebidaFechar')) $('mapaRecebidaFechar').addEventListener('click', () => { marcarRecebidaVista(); esconderRecebida(); });
    $('mapaSalvaNome').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); salvarRota(); } });
    atualizarSalvar(); renderSalvas([], null); ligarNuvem();
    window.addEventListener('paulus:auth', ligarNuvem);
    window.addEventListener('load', ligarNuvem);
  }
  lerLinkRecebido();
  // horário limite do expediente (lembrado entre usos: costuma ser sempre o mesmo)
  const limiteSalvo = lerPref('paulusMapaLimite', ''); if (/^\d{1,2}:\d{2}$/.test(limiteSalvo)) $('mapaLimite').value = limiteSalvo;
  $('mapaLimite').addEventListener('input', () => { gravarPref('paulusMapaLimite', $('mapaLimite').value); atualizarCronograma(); });
  // voz de navegação: só aparece se o aparelho tiver voz; a preferência fica lembrada
  const bVoz = $('mapaVozNav');
  const marcarVozNav = () => { bVoz.setAttribute('aria-pressed', vozNav ? 'true' : 'false'); const t = bVoz.querySelector('span'); if (t) t.textContent = vozNav ? 'Voz ligada' : 'Voz desligada'; };
  bVoz.classList.toggle('hidden', !temVoz()); marcarVozNav();
  bVoz.addEventListener('click', () => { vozNav = !vozNav; gravarPref('paulusMapaVozNav', vozNav ? '1' : '0'); marcarVozNav(); if (vozNav) falar('Voz ligada.'); else calar(); });
  // satélite
  $('mapaCamada').addEventListener('click', () => {
    satelite = !satelite; gravarPref('paulusMapaSatelite', satelite ? '1' : '0'); aplicarModoMapa();
    if (satelite && motor && sempreOffline) status('O satélite precisa de internet: desmarque "Usar sempre o mapa offline" para vê-lo.', 'erro');
    else if (satelite && navigator.onLine === false) status('Sem internet: o satélite só mostra o que já foi visto antes.', 'erro');
  });
  const visitaSalva = lerPref('paulusMapaVisita', '0');
  if (Array.from($('mapaVisita').options).some((o) => o.value === visitaSalva)) $('mapaVisita').value = visitaSalva;
  $('mapaVisita').addEventListener('change', () => { gravarPref('paulusMapaVisita', $('mapaVisita').value); atualizarCronograma(); });
  $('mapaSaida').addEventListener('input', atualizarCronograma);
  document.addEventListener('visibilitychange', () => { if (seguindo && document.visibilityState === 'visible' && !travaTela) pedirTelaLigada(); });

  // sugestões enquanto digita: só com o mapa offline em uso (a busca online não pode ser disparada a cada letra)
  // chips "Buscar em": fixa a busca num dos bairros de foco (13 de Setembro / Araceli); tocar de novo solta
  function marcarEscopo() {
    sec.querySelectorAll('[data-foco]').forEach(b => b.setAttribute('aria-pressed', b.dataset.foco === escopo ? 'true' : 'false'));
    const f = FOCO && FOCO.porId(escopo);
    $('mapaBusca').placeholder = f ? 'Rua e número' : 'Destino: digite ou fale o endereço';
  }
  sec.querySelectorAll('[data-foco]').forEach(b => b.addEventListener('click', () => {
    escopo = escopo === b.dataset.foco ? '' : b.dataset.foco; gravarPref('paulusMapaEscopo', escopo); marcarEscopo(); $('mapaBusca').focus();
  }));
  marcarEscopo();
  let tSug = null;
  $('mapaBusca').addEventListener('input', () => {
    clearTimeout(tSug);
    const q = $('mapaBusca').value.trim();
    if (q.length < 3) { fecharResultados(); return; }
    if (!motor || !usarOffline()) return;
    tSug = setTimeout(() => { try { listarResultados(buscarOffline(q), { todos: true, titulo: 'Sugestões (mapa offline)' }); } catch (e) { /* sem sugestões */ } }, 250);
  });
  // teclado: ↓ vai para a lista, ↑/↓ percorrem, Esc fecha
  $('mapaBusca').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharResultados();
    if (e.key === 'ArrowDown') { const b = $('mapaResultados').querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
  });
  $('mapaResultados').addEventListener('keydown', (e) => {
    const bs = Array.from($('mapaResultados').querySelectorAll('button')), i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) bs[i - 1].focus(); else $('mapaBusca').focus(); }
    else if (e.key === 'Escape') { fecharResultados(); $('mapaBusca').focus(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('#mapaForm, #mapaResultados')) fecharResultados(); });

  // ---------- mapa offline: camada de ruas (canvas), download e painel ----------
  const MINZ = [0, 0, 12, 13, 14, 15, 16];                                  // zoom mínimo para desenhar cada classe de via
  const COR = ['#e892a2', '#f9c58f', '#f4e48a', '#ffffff', '#ffffff', '#ffffff'];
  const LARG = [7, 6, 5.5, 4.5, 3.5, 2.5];
  const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const ATRIB_OFF = 'Ruas offline: dados © OpenStreetMap';

  function criarClasseVetor() {
    return L.Layer.extend({
      onAdd(map) {
        this._map = map; this._med = new Map();
        this._c = L.DomUtil.create('canvas', 'mp-vetor'); this._c.setAttribute('aria-hidden', 'true');
        map.getPane('vetor').appendChild(this._c);
        map.on('moveend zoomend resize viewreset', this._desenhar, this);
        if (map.attributionControl) map.attributionControl.addAttribution(ATRIB_OFF);
        this._desenhar();
      },
      onRemove(map) {
        map.off('moveend zoomend resize viewreset', this._desenhar, this);
        if (map.attributionControl) map.attributionControl.removeAttribution(ATRIB_OFF);
        L.DomUtil.remove(this._c); this._map = null;
      },
      _desenhar() {
        const map = this._map; if (!map || !motor) return;
        const tam = map.getSize(), pad = 0.4, w = Math.ceil(tam.x * (1 + 2 * pad)), h = Math.ceil(tam.y * (1 + 2 * pad));
        const dpr = Math.min(window.devicePixelRatio || 1, 2), c = this._c;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
        const canto = map.containerPointToLayerPoint([-tam.x * pad, -tam.y * pad]).round();
        L.DomUtil.setPosition(c, canto);
        const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        const z = map.getZoom(), esc = 256 * Math.pow(2, z), po = map.getPixelOrigin(), ox = po.x + canto.x, oy = po.y + canto.y;
        const X = (lng) => (lng + 180) / 360 * esc - ox;
        const Y = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * esc - oy; };
        const b = map.getBounds().pad(pad), D = motor.dados;
        const ids = motor.segsNaCaixa(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
        const porRank = [[], [], [], [], [], [], []];
        for (let i = 0; i < ids.length; i++) { const s = ids[i], r = D.rank(D.sw[s]); if (r !== undefined && z >= MINZ[r]) porRank[r].push(s); }
        const caminhos = porRank.map((l) => {
          if (!l.length) return null; const p = new Path2D();
          for (const s of l) { p.moveTo(X(D.nlng[D.sa[s]]), Y(D.nlat[D.sa[s]])); p.lineTo(X(D.nlng[D.sb[s]]), Y(D.nlat[D.sb[s]])); }
          return p;
        });
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const k = Math.pow(1.38, z - 15);
        if (caminhos[6]) { ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9c8f7a'; ctx.lineWidth = Math.max(1, Math.min(2.2, 1.4 * k)); ctx.stroke(caminhos[6]); ctx.setLineDash([]); }
        const larg = (r) => Math.max(1.4, Math.min(24, LARG[r] * k));
        for (let r = 5; r >= 0; r--) if (caminhos[r]) { ctx.strokeStyle = '#a89f91'; ctx.lineWidth = larg(r) + 2; ctx.stroke(caminhos[r]); }   // contornos
        for (let r = 5; r >= 0; r--) if (caminhos[r]) { ctx.strokeStyle = COR[r]; ctx.lineWidth = larg(r); ctx.stroke(caminhos[r]); }               // miolo

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (z >= 15) {                      // nomes das ruas, na direção da rua, sem se sobrepor
          const cand = [];
          for (let r = 0; r <= 5; r++) {
            if (z < (r <= 3 ? 15 : 16)) continue;
            for (const s of porRank[r]) {
              const nome = D.ways[D.sw[s]].n; if (!nome) continue;
              const x1 = X(D.nlng[D.sa[s]]), y1 = Y(D.nlat[D.sa[s]]), x2 = X(D.nlng[D.sb[s]]), y2 = Y(D.nlat[D.sb[s]]), len = Math.hypot(x2 - x1, y2 - y1);
              if (len >= 40) cand.push({ nome, x1, y1, x2, y2, len });
            }
          }
          cand.sort((a, d) => d.len - a.len);
          ctx.font = '600 11px ' + FONTE;
          const ocupadas = [], contagem = new Map(); let feitos = 0;
          for (let i = 0; i < cand.length && i < 700 && feitos < 160; i++) {
            const cd = cand[i]; if ((contagem.get(cd.nome) || 0) >= 2) continue;
            let tw = this._med.get(cd.nome); if (tw === undefined) { tw = ctx.measureText(cd.nome).width; this._med.set(cd.nome, tw); }
            if (cd.len < tw + 12) continue;
            const mx = (cd.x1 + cd.x2) / 2, my = (cd.y1 + cd.y2) / 2; if (mx < -20 || my < -20 || mx > w + 20 || my > h + 20) continue;
            let ang = Math.atan2(cd.y2 - cd.y1, cd.x2 - cd.x1); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
            const hw = Math.abs(Math.cos(ang)) * tw / 2 + Math.abs(Math.sin(ang)) * 7 + 3, hh = Math.abs(Math.sin(ang)) * tw / 2 + Math.abs(Math.cos(ang)) * 7 + 3;
            if (ocupadas.some(o => Math.abs(o.x - mx) < o.hw + hw && Math.abs(o.y - my) < o.hh + hh)) continue;
            ocupadas.push({ x: mx, y: my, hw, hh }); contagem.set(cd.nome, (contagem.get(cd.nome) || 0) + 1); feitos++;
            ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(cd.nome, 0, 0); ctx.fillStyle = '#3b3b3b'; ctx.fillText(cd.nome, 0, 0);
            ctx.restore();
          }
        }
        if (z >= 16 && motor.locaisNaCaixa) {          // locais (escola, UBS, CRAS, mercado...) e, mais perto, números das casas
          const COR_LOCAL = { s: '#d9534f', e: '#3a7bd5', g: '#8e5bd0', c: '#d98a1c', o: '#6b7a86' }, SIGLA = { s: '+', e: 'E', g: 'G', c: '$', o: '•' };
          const ls = motor.locaisNaCaixa(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), 70);
          ctx.font = '600 10px ' + FONTE;
          for (const l of ls) {
            const x = X(l.lng), y = Y(l.lat), cor = COR_LOCAL[l.k] || COR_LOCAL.o;
            ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.fillText(SIGLA[l.k] || SIGLA.o, x, y + 0.5);
            if (z >= 17) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(l.n, x, y + 16); ctx.fillStyle = '#2d2d2d'; ctx.fillText(l.n, x, y + 16); }
          }
          if (z >= 18) {
            ctx.font = '600 10px ' + FONTE;
            for (const a of motor.enderecosNaCaixa(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), 150)) {
              const x = X(a.lng), y = Y(a.lat); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(a.n, x, y); ctx.fillStyle = '#7a5c2e'; ctx.fillText(a.n, x, y);
            }
          }
        }
        if (z >= 12 && z <= 15) {           // nomes dos bairros
          ctx.font = '700 ' + (z <= 13 ? 11 : 12) + 'px ' + FONTE;
          for (const q of D.lugares) {
            if (!b.contains([q.lat, q.lng])) continue;
            const x = X(q.lng), y = Y(q.lat), t = String(q.n).toUpperCase();
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(242,239,233,.95)'; ctx.strokeText(t, x, y); ctx.fillStyle = 'rgba(95,84,62,.85)'; ctx.fillText(t, x, y);
          }
        }
      }
    });
  }

  function ligarVetor(sim) {
    if (!mapa || !L) return;
    const cont = mapa.getContainer();
    if (sim) {
      if (!ClasseVetor) ClasseVetor = criarClasseVetor();
      if (!vetor) vetor = new ClasseVetor();
      if (!mapa.hasLayer(vetor)) vetor.addTo(mapa);
      cont.style.background = '#f2efe9';
    } else if (vetor && mapa.hasLayer(vetor)) { mapa.removeLayer(vetor); cont.style.background = ''; }
  }
  // Com internet: blocos do OpenStreetMap. Sem internet (ou "usar sempre offline"): ruas desenhadas a partir do mapa baixado.
  function aplicarModoMapa() {
    if (!mapa || !camadaTiles) return;
    const soVetor = !!motor && sempreOffline;
    const base = satelite && camadaSat ? camadaSat : camadaTiles, outra = base === camadaSat ? camadaTiles : camadaSat;
    if (outra && mapa.hasLayer(outra)) mapa.removeLayer(outra);
    if (soVetor) { if (mapa.hasLayer(base)) mapa.removeLayer(base); }
    else if (!mapa.hasLayer(base)) base.addTo(mapa);
    ligarVetor(!!motor && (soVetor || vetorAuto));
    const bc = $('mapaCamada');
    if (bc) { bc.setAttribute('aria-pressed', satelite ? 'true' : 'false'); const t = bc.querySelector('span'); if (t) t.textContent = satelite ? 'Mapa' : 'Satélite'; }
  }

  const offBox = $('mapaOffBox');
  function ofertaUI() {
    if (!offBox) return;
    const info = motor ? motor.info() : null, ocup = !!baixando;
    let t;
    if (ocup) t = baixando.texto || 'Baixando…';
    else if (info) {
      const d = new Date(info.quando), data = isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
      t = 'Mapa offline pronto' + (data ? ' (baixado em ' + data + ')' : '') + ' · ' + info.ruas.toLocaleString('pt-BR') + ' ruas, ' + info.bairros + ' bairros, ' + info.locais.toLocaleString('pt-BR') + ' locais' + (info.ampliada ? ', com a zona rural do entorno' : '') + ' (' + Math.max(1, Math.round((info.bytes || 0) / 1048576)) + ' MB no aparelho).' + (Date.now() - info.quando > 90 * 86400000 ? ' O mapa tem mais de 3 meses: vale atualizar para incluir ruas novas.' : '') + (vetorAuto && !sempreOffline ? ' Sem internet agora: usando o mapa offline.' : '');
    } else t = parciaisN ? 'Um download do mapa offline foi interrompido: ' + parciaisN + ' pedaço(s) já estão guardados. Toque em "Continuar download" para terminar sem baixar tudo de novo.' : 'Mapa offline: ainda não baixado. Baixe uma vez (de preferência no Wi-Fi) para buscar endereços, ver o mapa e traçar rotas sem internet.';
    if (!ocup && parciaisN && info) t += ' Há também um download interrompido: toque em "Continuar download".';
    $('mapaOffTexto').textContent = t;
    $('mapaOffBaixar').textContent = parciaisN ? 'Continuar download' : info ? 'Atualizar mapa offline' : 'Baixar mapa offline';
    const ab = $('mapaOffAmpBox'); if (ab) { ab.classList.toggle('hidden', ocup); $('mapaOffAmp').checked = ampliadaPref; }
    $('mapaOffBaixar').classList.toggle('hidden', ocup);
    $('mapaOffCancelar').classList.toggle('hidden', !ocup);
    $('mapaOffApagar').classList.toggle('hidden', ocup || !info);
    $('mapaOffSempreBox').classList.toggle('hidden', !info);
    const pr = $('mapaOffProg'); pr.classList.toggle('hidden', !ocup); if (ocup) pr.value = baixando.pct || 0;
    $('mapaOffSempre').checked = sempreOffline;
  }

  async function baixarOffline() {
    if (!AMO || baixando) return;
    const amp = ampliadaPref;
    if (!parciaisN && !window.confirm('Baixar o mapa de Boa Vista' + (amp ? ' e das estradas do entorno (zona rural)' : '') + ' para usar sem internet?\n\nDemora alguns minutos e usa ' + (amp ? 'cerca de cem MB' : 'algumas dezenas de MB') + ' de internet — de preferência no Wi-Fi. Se a conexão cair, o download continua de onde parou. Depois fica guardado no aparelho.')) return;
    const ctl = new AbortController(); baixando = { ctl, texto: 'Iniciando o download…', pct: 0 }; ofertaUI(); status('');
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* o navegador decide sozinho */ }
    try {
      const r = await AMO.baixar({ sinal: ctl.signal, ampliada: amp, onProgresso: (p) => { baixando.texto = p.texto; baixando.pct = Math.round(p.feito / p.total * 100); ofertaUI(); } });
      parciaisN = 0;
      motor = AMO.criarMotor(r.pacote); vetorAuto = false; errosTile = 0;
      if (r.erroGuardar) status('O mapa foi baixado e já funciona agora, mas NÃO ficou guardado no aparelho (vale só até fechar o app). ' + r.erroGuardar.message, 'erro');
      else status('Mapa offline pronto: a busca, o mapa e as rotas já funcionam sem internet.', 'ok');
      aplicarModoMapa();
    } catch (e) { status((e && e.message) || 'Não consegui baixar o mapa offline.', 'erro'); }
    finally { baixando = null; if (AMO.parciais) { try { parciaisN = await AMO.parciais(); } catch (e) { parciaisN = 0; } } ofertaUI(); }
  }

  if (offBox && !AMO) offBox.classList.add('hidden');
  if (offBox && AMO) {
    $('mapaOffBaixar').addEventListener('click', baixarOffline);
    $('mapaOffCancelar').addEventListener('click', () => { if (baixando) baixando.ctl.abort(); });
    $('mapaOffApagar').addEventListener('click', async () => {
      if (!window.confirm('Apagar o mapa offline deste aparelho? Você poderá baixar de novo quando quiser.')) return;
      try { await AMO.apagar(); motor = null; parciaisN = 0; vetorAuto = false; aplicarModoMapa(); status('Mapa offline apagado deste aparelho.', 'ok'); }
      catch (e) { status((e && e.message) || 'Não consegui apagar o mapa offline.', 'erro'); }
      ofertaUI();
    });
    const ampEl = $('mapaOffAmp'); if (ampEl) ampEl.addEventListener('change', (ev) => { ampliadaPref = !!ev.target.checked; gravarPref('paulusMapaAmpliada', ampliadaPref ? '1' : '0'); });
    $('mapaOffSempre').addEventListener('change', (ev) => {
      sempreOffline = !!ev.target.checked; gravarPref('paulusMapaSempreOffline', sempreOffline ? '1' : '0');
      aplicarModoMapa(); ofertaUI(); if (destino) tracarRota();
    });
    window.addEventListener('online', () => { vetorAuto = false; errosTile = 0; aplicarModoMapa(); ofertaUI(); });
    window.addEventListener('offline', () => { if (motor) { vetorAuto = true; aplicarModoMapa(); } ofertaUI(); });
    // carrega o mapa guardado quando o navegador estiver livre (montar o índice leva uma fração de segundo)
    const iniciar = () => AMO.carregar()
      .then((p) => {
        if (p) { try { motor = AMO.criarMotor(p); } catch (e) { motor = null; } }
        // app aberto já sem internet: os blocos falharam antes de o mapa guardado carregar → usa as ruas offline desde já
        if (motor && (navigator.onLine === false || errosTile >= 3)) vetorAuto = true;
        aplicarModoMapa(); ofertaUI();
      })
      .catch(() => ofertaUI())
      .then(() => AMO.parciais ? AMO.parciais() : 0).then((n) => { parciaisN = n || 0; if (parciaisN) ofertaUI(); }, () => {});
    (window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 600))(iniciar);
  }

  // carrega o mapa só quando a seção chega perto da tela
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some(x => x.isIntersecting)) { io.disconnect(); garantirMapa().catch(() => {}); } }, { rootMargin: '300px' });
    io.observe(sec);
  } else garantirMapa().catch(() => {});
  iconesRefresh();

  window.PaulusMapa = { _teste: { instrucao, fmtDist, fmtTempo, rotuloCurto, limparFala } };
})();
