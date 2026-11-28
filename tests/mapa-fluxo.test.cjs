/* Fluxo do "Mapa e rotas" com DOM e Leaflet de mentira: busca → rota → parada → horários por parada → copiar roteiro
 * → Acompanhar tirando a parada alcançada. Roda em Node puro: `node tests/mapa-fluxo.test.cjs` */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const U = require('./_mapa.cjs')('mapa-util.js');

function el(id) {
  const ouvintes = {}, cls = new Set(id && /^mapa(Resumo|Alternativas|Proximo|Destino(Box|Eta)|ParadasBox|Otimizar|VisitaBox|Copiar|Seguir|Resultados)$/.test(id) ? ['hidden'] : []);
  const o = {
    id, value: '', textContent: '', href: '#', disabled: false, style: { setProperty() {} }, children: [], dataset: {}, attrs: {},
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, f) => { const v = f === undefined ? !cls.has(c) : !!f; v ? cls.add(c) : cls.delete(c); return v; } },
    addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); },
    dispara: async (t, ev) => { for (const f of ouvintes[t] || []) await f(ev || { preventDefault() {}, target: o }); },
    setAttribute(k, v) { o.attrs[k] = v; }, getAttribute: (k) => o.attrs[k],
    appendChild(c) { o.children.push(c); if (c && c.nodeTipo === 'texto') o._txt = (o._txt || '') + c.textContent; return c; }, append(...cs) { cs.forEach(c => o.appendChild(c)); },
    insertBefore(c) { o.children.unshift(c); }, focus() {}, scrollIntoView() {}, closest: () => null,
    querySelector: (q) => o._q(q), querySelectorAll: (q) => o._qa(q),
    _q: (q) => (o._qa(q)[0] || el('q:' + q)), _qa: () => [],
    offsetHeight: 100, offsetWidth: 300, checked: false, options: [], requestSubmit() {}
  };
  Object.defineProperty(o, 'textContent', { get() { return o._t || ''; }, set(v) { o._t = String(v); o.children = []; o._txt = ''; } });
  return o;
}
const els = new Map(); const get = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
// campos que precisam de valor/opções
get('mapaOrigem').value = 'partida'; get('mapaVisita').value = '30'; get('mapaVisita').options = [{ value: '0' }, { value: '30' }]; get('mapaSaida').value = '08:00';
get('mapaBusca').value = '';

// Leaflet de mentira: qualquer método devolve o próprio objeto; registra marcadores
const marcadores = []; let cliqueMapa = null;
const camada = () => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : k === 'getLatLng' ? () => ({ lat: 0, lng: 0 }) : k === 'getZoom' ? () => 13 : k === 'getSize' ? () => ({ x: 400, y: 400 }) : () => camada()) });
const L = new Proxy({}, { get: (_, k) => {
  if (k === 'then') return undefined;      // senão Promise.resolve(L) acha que L é uma promessa e trava
  if (k === 'map') return () => ({ setView() { return this; }, on(t, f) { if (t === 'click') cliqueMapa = f; return this; }, createPane: () => ({ style: {} }), invalidateSize() {}, removeLayer() {}, hasLayer: () => true, getZoom: () => 13, fitBounds() {}, closePopup() {}, panTo() {}, getContainer: () => ({ style: {} }) });
  if (k === 'tileLayer') return () => ({ addTo() { return this; }, on() {} });
  if (k === 'control') return { zoom: () => ({ addTo() {} }) };
  if (k === 'latLngBounds') return () => ({});
  if (k === 'marker') return (ll, o) => { const m = { ll, o, popup: null, bindPopup(p) { m.popup = p; return m; }, on() { return m; }, addTo() { return m; } }; marcadores.push(m); return m; };
  if (k === 'layerGroup') return () => ({ addTo() { return this; }, addLayer() {} });
  if (k === 'DomEvent') return { stopPropagation() {} };
  return () => camada();
} });
L.map = L.map; // (Proxy get acima)

// OSRM e Nominatim de mentira: uma perna = 1 km, 5 min
const pedidos = [];
async function fetchFalso(url) {
  pedidos.push(String(url));
  if (/nominatim/.test(url)) { const q = new URL(url).searchParams.get('q') || ''; if (/Inexistente/.test(q)) return { ok: true, status: 200, json: async () => [] }; return { ok: true, status: 200, json: async () => [{ lat: (2.8 + ([...q].reduce((a, c) => a + c.charCodeAt(0), 0) % 25) * 0.004).toFixed(4), lon: '-60.67', display_name: q, address: { road: q } }] }; }
  if (falharPrincipal && /routing\.openstreetmap\.de/.test(url)) { usouReserva.n++; return { ok: false, status: 503, json: async () => null }; }
  if (/router\.project-osrm\.org/.test(url)) usouReserva.reserva = true;
  const pts = String(url).split('/route/v1/driving/')[1].split('?')[0].split(';');
  const pernas = pts.slice(1).map((_, i) => ({ distance: 1000, duration: 300, steps: [{ maneuver: { type: 'depart', location: [-60.67, 2.8] }, name: 'Rua X', distance: 1000 }, { maneuver: { type: 'arrive', location: [-60.67, 2.81] }, name: '', distance: 0 }] }));
  const coordenadas = pts.map(p => p.split(',').map(Number));
  return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 1000 * pernas.length, duration: 300 * pernas.length, geometry: { type: 'LineString', coordinates: coordenadas }, legs: pernas }] }) };
}

let falharPrincipal = false; const usouReserva = { n: 0, reserva: false};
let copiado = '', watch = null; const falas = [], abertos = [];
const win = {
  document: null, L, PaulusMapaUtil: U, PaulusMapaOffline: null, lucide: null, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }), addEventListener() {}, requestIdleCallback: (f) => f(),
  localStorage: { getItem: () => null, setItem() {} },
  speechSynthesis: { cancel() {}, speak(u) { falas.push(u.text); } }, SpeechSynthesisUtterance: function (t) { this.text = t; },
  open: (u) => { abertos.push(u); }, jspdf: (() => { try { return require('jspdf/dist/jspdf.node.min.js'); } catch (e) { return undefined; } })()   // opcional: npm i jspdf para testar o PDF
};
const secao = get('mapaRotas');
const lista = []; secao._qa = (q) => (q === '#mapaParadas .mp-parada-info' ? lista : []);
secao.querySelector = (q) => (q === '.mp-mais' || q === '.mp-topo' || q === '.mp-base' ? get('x' + q) : el('q'));
win.document = { getElementById: get, createElement: (t) => { const e = el(t); if (t === 'small' || t === 'span' || t === 'b' || t === 'p') { /* texto */ } return e; }, createTextNode: (t) => ({ nodeTipo: 'texto', textContent: t }), addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } }, head: { appendChild() {} }, fullscreenElement: null, visibilityState: 'visible' };
const contexto = vm.createContext(Object.assign({ window: win, navigator: { onLine: true, geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 2.80, longitude: -60.67, accuracy: 10 } }), watchPosition: (f) => { watch = f; return 1; }, clearWatch() {} }, clipboard: { writeText: async (t) => { copiado = t; } }, storage: null }, history: { state: null, pushState() {} }, fetch: fetchFalso, setTimeout, clearTimeout, AbortController, URL, URLSearchParams, console, Date, Math, JSON, Promise, Array, Object, Map, Set, Number, String, isFinite, parseFloat }, win));
win.window = win;
// as marcações de lista de paradas: o código cria <small class="mp-parada-info"> a cada renderParadas
const criar = win.document.createElement;
win.document.createElement = (t) => { const e = criar(t); const orig = Object.getOwnPropertyDescriptor(e, 'textContent'); return e; };
// substitui a consulta: devolve os <small> criados em renderParadas
const infos = [];
const criar2 = win.document.createElement;
win.document.createElement = (t) => { const e = criar2(t); e.classList.add = ((f) => (...c) => f(...c))(e.classList.add); Object.defineProperty(e, 'className', { set(v) { e._cn = v; if (/mp-parada-info/.test(v)) infos.push(e); }, get() { return e._cn || ''; } }); return e; };
secao._qa = (q) => (q === '#mapaParadas .mp-parada-info' ? infos.slice(-paradasAtuais()) : []);
let paradasAtuais = () => 0;

// ponte de mentira com a nuvem (rotas salvas / enviadas aos aparelhos)
let ouvinteNuvem = null; const gravados = [];
win.__paulusRotas = { logado: () => true, lista: () => [], observar(f) { ouvinteNuvem = f; try { f([], null); } catch (e) {} return () => {}; }, salvar(d, id) { gravados.push({ id, d }); return { id, pronto: Promise.resolve() }; }, apagar: async () => {} };
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'console', 'mapa-rotas.js'), 'utf8'), contexto, { filename: 'mapa-rotas.js' });

(async () => {
  const busca = async (q) => { get('mapaBusca').value = q; await get('mapaForm').dispara('submit', { preventDefault() {} }); await new Promise(r => setTimeout(r, 30)); };
  get('mapaVisita').value = '30'; await get('mapaVisita').dispara('change');   // a pessoa escolhe 30 min de visita
  // 1) destino simples: horário de chegada considera a saída planejada (08:00 + 5 min)
  await busca('Rua Alfa, Centenário');
  assert(/Chegada por volta de 08:05 \(saindo às 08:00\)/.test(get('mapaChegada').textContent), 'chegada simples: ' + get('mapaChegada').textContent);
  assert(get('mapaCopiar').classList.contains('hidden'), 'sem paradas não oferece copiar roteiro');
  // 2) vira parada 1 e busca outro destino; mais uma parada; depois o destino final
  await get('mapaAddParada').dispara('click'); await busca('Rua Beta, Centenário');
  await get('mapaAddParada').dispara('click'); await busca('Rua Gama, Centenário');
  const url = pedidos.filter(u => /route\/v1/.test(u)).pop();
  assert.strictEqual(url.split('/route/v1/driving/')[1].split('?')[0].split(';').length, 4, 'partida + 2 paradas + destino: ' + url);
  assert(!get('mapaVisitaBox').classList.contains('hidden') && !get('mapaCopiar').classList.contains('hidden'));
  // 3 trechos de 5 min + 2 visitas de 30 min = 1 h 15 → fim 09:15
  assert(/Deslocamento 15 min \+ 1 h de visitas · fim por volta de 09:15 \(saindo às 08:00\)/.test(get('mapaChegada').textContent), get('mapaChegada').textContent);
  assert(/Chegada ao destino: 09:15/.test(get('mapaDestinoEta').textContent), get('mapaDestinoEta').textContent);
  // 3) copiar roteiro
  await get('mapaCopiar').dispara('click'); await new Promise(r => setTimeout(r, 10));
  assert(/Parada 1: .* — chegada 08:05/.test(copiado) && /Parada 2: .* — chegada 08:40/.test(copiado) && /Destino: .* — chegada 09:15/.test(copiado), copiado);
  // 4) pino da parada tem popup com "Remover"
  const pinoParada = marcadores.filter(m => m.popup).pop(); assert(pinoParada, 'pino de parada com popup');
  // 5) Acompanhar: chegando na parada 1, ela sai da rota e a rota é refeita sem ela
  const antes = pedidos.length;
  await get('mapaSeguir').dispara('click');
  assert(watch, 'GPS ligado');
  const p1 = marcadores.filter(m => m.o && /^Parada 1/.test(m.o.title || '')).pop();
  const alvo = p1 ? p1.ll : null;
  assert(alvo, 'pino da parada 1');
  watch({ coords: { latitude: alvo[0], longitude: alvo[1], accuracy: 8 } });
  await new Promise(r => setTimeout(r, 40));
  assert(/Parada alcançada/.test(get('mapaStatus').textContent), 'status: ' + get('mapaStatus').textContent);
  const novo = pedidos.slice(antes).filter(u => /route\/v1/.test(u)).pop();
  assert(novo, 'rota refeita');
  assert.strictEqual(novo.split('/route/v1/driving/')[1].split('?')[0].split(';').length, 3, 'agora: posição + 1 parada + destino: ' + novo);
  assert(falas.some(f => /Acompanhando a rota/.test(f)), 'voz ao iniciar o Acompanhar: ' + falas.join('|'));
  assert(falas.some(f => /Parada alcançada\. Seguindo para a próxima/.test(f)), 'voz ao alcançar a parada: ' + falas.join('|'));
  assert(/Waze/.test(get('mapaWazeTxt').textContent) && /waze\.com\/ul\?ll=/.test(get('mapaWaze').href), 'link do Waze: ' + get('mapaWaze').href);
  // 6) horário limite do expediente: avisa quando passa e mostra a folga quando cabe
  get('mapaLimite').value = '08:30'; await get('mapaLimite').dispara('input');
  assert(/Passa das 08:30 em 10 min/.test(get('mapaFolga').textContent) && get('mapaFolga').classList.contains('is-alerta'), 'folga negativa: ' + get('mapaFolga').textContent);
  get('mapaLimite').value = '09:00'; await get('mapaLimite').dispara('input');
  assert(/Termina 20 min antes das 09:00/.test(get('mapaFolga').textContent) && !get('mapaFolga').classList.contains('is-alerta'), 'folga positiva: ' + get('mapaFolga').textContent);
  get('mapaLimite').value = ''; await get('mapaLimite').dispara('input');
  assert(get('mapaFolga').classList.contains('hidden'), 'sem limite, sem aviso');
  // 7) acompanhando: "faltam" aparece e o botão Cheguei está à vista
  assert(!get('mapaCheguei').classList.contains('hidden'), 'Cheguei visível com parada pendente');
  const origemUrl = pedidos.filter(u => /route\/v1/.test(u)).pop().split('/route/v1/driving/')[1].split('?')[0].split(';')[0].split(',').map(Number);   // lng,lat da partida
  watch({ coords: { latitude: origemUrl[1], longitude: origemUrl[0], accuracy: 8 } });
  assert(/Parada 1 em|Faltam/.test(get('mapaFaltam').textContent) && !get('mapaFaltam').classList.contains('hidden'), 'faltam: "' + get('mapaFaltam').textContent + '"');
  // 8) "Cheguei na parada" manual: a parada sai da rota mesmo sem o GPS chegar lá
  const antes2 = pedidos.length;
  await get('mapaCheguei').dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert(/Parada concluída/.test(get('mapaStatus').textContent), 'status: ' + get('mapaStatus').textContent);
  assert(falas.some(f => /Parada concluída/.test(f)), 'voz da parada concluída');
  const novo2 = pedidos.slice(antes2).filter(u => /route\/v1/.test(u)).pop();
  assert.strictEqual(novo2.split('/route/v1/driving/')[1].split('?')[0].split(';').length, 2, 'sem paradas: partida + destino');
  assert(get('mapaCheguei').classList.contains('hidden'), 'sem paradas, sem botão Cheguei');
  // 9) Voltar à partida: o destino vira parada e a partida vira o destino final
  await get('mapaSeguir').dispara('click');   // desliga o Acompanhar
  await get('mapaVoltar').dispara('click'); await new Promise(r => setTimeout(r, 40));
  const volta = pedidos.filter(u => /route\/v1/.test(u)).pop().split('/route/v1/driving/')[1].split('?')[0].split(';');
  assert.strictEqual(volta.length, 3, 'partida + destino antigo (parada) + partida: ' + volta);
  assert.strictEqual(volta[0], volta[2], 'a rota termina onde começou');
  assert(/Ponto de partida/.test(get('mapaDestinoTexto').textContent), 'destino final = partida (posição do aparelho): ' + get('mapaDestinoTexto').textContent);
  // 10) lista de endereços colada: 3 endereços viram partida + 2 paradas + destino; o que não existe é avisado
  await get('mapaLimpar').dispara('click');
  get('mapaLista').value = '1) Rua Um, 1\n- Rua Dois, 22\nRua Três, 333'; get('mapaListaOrdem').checked = true;
  await get('mapaListaMontar').dispara('click'); await new Promise(r => setTimeout(r, 40));
  const lista3 = pedidos.filter(u => /route\/v1/.test(u)).pop().split('/route/v1/driving/')[1].split('?')[0].split(';');
  assert.strictEqual(lista3.length, 4, 'partida + 3 endereços: ' + lista3);
  assert(/3 endereços na rota/.test(get('mapaStatus').textContent), 'status: ' + get('mapaStatus').textContent);
  // 10b) Concluir / Pular por parada: saem da rota, ficam na lista de resolvidas e dá para retomar
  const pontos = () => pedidos.filter(u => /route\/v1/.test(u)).pop().split('/route/v1/driving/')[1].split('?')[0].split(';').length;
  assert(!get('mapaPular').classList.contains('hidden') && !get('mapaCheguei').classList.contains('hidden'), 'Concluir e Pular à vista com paradas e rota');
  await get('mapaPular').dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert(/Parada pulada/.test(get('mapaStatus').textContent), 'status do pular: ' + get('mapaStatus').textContent);
  assert.strictEqual(pontos(), 3, 'pulou 1 de 3 paradas: partida + 2 pontos');
  assert(/Puladas 1/.test(get('mapaParadasResumo').textContent) && get('mapaFeitas').children.length === 1, 'pulada listada: ' + get('mapaParadasResumo').textContent);
  await get('mapaCheguei').dispara('click'); await new Promise(r => setTimeout(r, 40));   // logo após o pular: duplo toque, ignorado
  assert.strictEqual(pontos(), 3, 'duplo toque não conclui a parada seguinte');
  await new Promise(r => setTimeout(r, 500));
  await get('mapaCheguei').dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert(!get('mapaDesfazer').classList.contains('hidden'), 'Desfazer à vista após concluir');
  assert(/Parada concluída/.test(get('mapaStatus').textContent) && pontos() === 2, 'concluiu a próxima: partida + destino');
  assert(/Concluídas 1 · Puladas 1 · Faltam 0/.test(get('mapaParadasResumo').textContent), 'resumo: ' + get('mapaParadasResumo').textContent);
  const retomar = get('mapaFeitas').children[0].children.filter(c => c.className && /mp-btn/.test(c.className))[0];
  await retomar.dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert.strictEqual(pontos(), 3, 'a pulada volta para o fim da fila');
  await get('mapaLimpar').dispara('click');
  get('mapaLista').value = 'Rua Um, 1\nInexistente 9\nRua Dois, 2'; get('mapaListaOrdem').checked = false;
  await get('mapaListaMontar').dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert(/2 endereços na rota/.test(get('mapaStatus').textContent) && /Não achei: Inexistente 9/.test(get('mapaStatus').textContent), 'status: ' + get('mapaStatus').textContent);
  // 11) WhatsApp abre com o roteiro pronto
  await get('mapaWhats').dispara('click');
  assert(abertos.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(abertos[0]) && /Roteiro/.test(decodeURIComponent(abertos[0])), 'WhatsApp: ' + abertos[0]);
  // 11b) PDF do roteiro
  if (!win.jspdf) console.log('  (PDF não testado: rode `npm i jspdf` para incluir)');
  else { const os = require('os'), antes = process.cwd(); process.chdir(os.tmpdir());
    await get('mapaPdf').dispara('click');
    const nomePdf = fs.readdirSync('.').filter(f => /^roteiro-.*\.pdf$/.test(f)).pop(); assert(nomePdf, 'PDF gerado: ' + get('mapaStatus').textContent);
    assert(fs.readFileSync(nomePdf).slice(0, 4).toString() === '%PDF', 'arquivo é PDF'); fs.unlinkSync(nomePdf); process.chdir(antes); }
  // 11c) servidor de rotas principal fora do ar → reserva
  await get('mapaLimpar').dispara('click'); falharPrincipal = true;
  await busca('Rua Delta, Centenário');
  assert(usouReserva.reserva && /Chegada por volta/.test(get('mapaChegada').textContent), 'rota pelo servidor reserva');
  falharPrincipal = false;
  // 12) recentes e endereço repetido
  assert(!get('mapaRecentes').classList.contains('hidden'), 'recentes aparecem depois de buscar');
  await get('mapaLimpar').dispara('click'); await busca('Rua Alfa, Centenário');
  await get('mapaAddParada').dispara('click'); await busca('Rua Alfa, Centenário');
  await get('mapaAddParada').dispara('click');
  assert(/já está nas paradas/.test(get('mapaStatus').textContent), 'parada repetida: ' + get('mapaStatus').textContent);
  // 13) Enviar aos meus aparelhos: grava a rota atual como "enviada"; outro aparelho recebe a faixa e este não
  await get('mapaLimpar').dispara('click'); await busca('Rua Alfa, Centenário');
  await get('mapaAddParada').dispara('click'); await busca('Rua Beta, Centenário');
  assert(!get('mapaNuvem').disabled, 'botão de enviar liberado com destino');
  await get('mapaNuvem').dispara('click');
  const env = gravados.filter((g) => g.id === 'enviada').pop();
  assert(env, 'gravou em users/{uid}/rotas/enviada'); assert.strictEqual(env.d.paradas.length, 1); assert(env.d.destino && isFinite(env.d.destino.lat));
  assert(get('mapaRecebida').classList.contains('hidden'), 'quem enviou não recebe a própria faixa');
  ouvinteNuvem([Object.assign({ id: 'enviada', pendente: false }, env.d)], null);
  assert(get('mapaRecebida').classList.contains('hidden'), 'mesma versão enviada por este aparelho: sem faixa');
  ouvinteNuvem([Object.assign({ id: 'enviada', pendente: false }, env.d, { atualizadoEm: env.d.atualizadoEm + 1000, nome: 'Rota do outro celular' })], null);
  assert(!get('mapaRecebida').classList.contains('hidden') && /Rota do outro celular/.test(get('mapaRecebidaTxt').textContent), 'versão mais nova de outro aparelho mostra a faixa: ' + get('mapaRecebidaTxt').textContent);
  await get('mapaRecebidaAbrir').dispara('click'); await new Promise(r => setTimeout(r, 40));
  assert(get('mapaRecebida').classList.contains('hidden'), 'abrir esconde a faixa');
  assert.strictEqual(get('mapaSalvaNome').value, '', 'a rota enviada não vira nome de rota salva');
  // outro aparelho com o relógio ATRASADO (carimbo menor que o último visto) também é avisado
  ouvinteNuvem([Object.assign({ id: 'enviada', pendente: false }, env.d, { atualizadoEm: env.d.atualizadoEm - 600000, nome: 'Rota do tablet' })], null);
  assert(!get('mapaRecebida').classList.contains('hidden') && /Rota do tablet/.test(get('mapaRecebidaTxt').textContent), 'relógio atrasado do outro aparelho não esconde a rota');
  ouvinteNuvem([], null);
  assert(get('mapaRecebida').classList.contains('hidden'), 'rota enviada apagada some da faixa');
  assert(get('mapaLink') && !get('mapaLink').disabled, 'botão do link liberado com destino');
  // 14) até 30 paradas: lista com 32 linhas → 31 entram (30 paradas + destino), 1 fica de fora; o 31º "+" é recusado
  await get('mapaLimpar').dispara('click');
  get('mapaLista').value = Array.from({ length: 32 }, (_, i) => (2.70 + i * 0.01).toFixed(4) + ', -60.6700').join('\n'); get('mapaListaOrdem').checked = false;
  await get('mapaListaMontar').dispara('click'); await new Promise(r => setTimeout(r, 120));
  const rota31 = pedidos.filter(u => /route\/v1/.test(u)).pop().split('/route/v1/driving/')[1].split('?')[0].split(';');
  assert.strictEqual(rota31.length, 32, 'partida + 30 paradas + destino: ' + rota31.length);
  assert(/31 endereços na rota/.test(get('mapaStatus').textContent) && /1 ficou de fora/.test(get('mapaStatus').textContent), 'status: ' + get('mapaStatus').textContent);
  assert(/waypoints=/.test(get('mapaGoogle').href) && (get('mapaGoogle').href.match(/%7C/g) || []).length === 8, 'trecho 1 do Google com 9 paradas: ' + get('mapaGoogle').href);
  await busca('2.5000, -60.6000'); await get('mapaAddParada').dispara('click');
  assert(/Limite de 30 paradas/.test(get('mapaStatus').textContent), 'recusa a 31ª parada: ' + get('mapaStatus').textContent);
  // 15) "Limpar lista": esvazia a caixa de endereços (e fica apagado quando não há nada)
  get('mapaLista').value = 'Rua Um, 1'; await get('mapaLista').dispara('input');
  assert(!get('mapaFolhasLimpar').disabled, 'Limpar lista liberado com texto na caixa');
  await get('mapaFolhasLimpar').dispara('click');
  assert.strictEqual(get('mapaLista').value, '', 'caixa de endereços esvaziada');
  assert(get('mapaFolhasLimpar').disabled, 'Limpar lista apagado sem endereços');
  console.log('mapa-fluxo.test.js: tudo certo');
})().catch(e => { console.error(e); process.exit(1); });
