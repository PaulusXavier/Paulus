// Rodar: node tests/mapa-offline.test.cjs
// Rede sintética (grade 6x6 de ruas + rotatória) no formato da Overpass API: rota, passo a passo, mão única,
// busca de endereço, geocodificação reversa e o fluxo de download (com fetch falso).
const assert = require('assert');
const M = require('./_mapa.cjs')('mapa-offline.js');
const eq = assert.strictEqual;

const LAT0 = 2.80, LNG0 = -60.70, D = 0.002;
const g = (r, c) => ({ id: 1000 + r * 10 + c, lat: LAT0 + r * D, lon: LNG0 + c * D });
const via = (id, tags, pts) => ({ type: 'way', id, tags, nodes: pts.map(p => p.id), geometry: pts.map(p => ({ lat: p.lat, lon: p.lon })) });
const linha = (f) => [0, 1, 2, 3, 4, 5].map(f);
const els = [];
['Rua Alfa', 'Rua Beta', 'Avenida Central', 'Rua Delta', 'Rua Epsilon', 'Rua Zeta'].forEach((n, r) =>
  els.push(via(100 + r, Object.assign({ highway: r === 2 ? 'tertiary' : 'residential', name: n }, r === 1 ? { oneway: 'yes' } : {}), linha(c => g(r, c)))));
['Rua Um', 'Rua Dois', 'Avenida Presidente Castelo Branco', 'Rua Quatro', 'Rua Cinco', 'Rua Seis'].forEach((n, c) =>
  els.push(via(200 + c, { highway: c === 2 ? 'secondary' : 'residential', name: n }, linha(r => g(r, c)))));
els.push(via(300, { highway: 'footway', name: '' }, [g(0, 0), g(1, 1)]));                       // atalho só a pé
els.push(via(301, { highway: 'service', access: 'private', name: 'Condomínio' }, [g(2, 2), { id: 9001, lat: LAT0 + 2 * D + 0.0005, lon: LNG0 + 2 * D + 0.0005 }]));
const gx = (n, la, lo) => ({ id: n, lat: la, lon: lo });
els.push(via(310, { highway: 'residential', name: 'Rua 7 de Setembro' }, [gx(9100, 2.790, -60.710), gx(9101, 2.790, -60.7085)]));
els.push(via(311, { highway: 'residential', name: 'Rua 10' }, [gx(9102, 2.789, -60.710), gx(9103, 2.789, -60.7085)]));
// rotatória (sentido anti-horário: N → W → S → E → N) com 4 saídas
const RC = [2.83, -60.66], R = 0.0004, S = 0.003;
const rN = gx(9200, RC[0] + R, RC[1]), rW = gx(9201, RC[0], RC[1] - R), rS = gx(9202, RC[0] - R, RC[1]), rE = gx(9203, RC[0], RC[1] + R);
els.push(via(320, { highway: 'residential', name: 'Rotatória', junction: 'roundabout' }, [rN, rW, rS, rE, rN]));
els.push(via(321, { highway: 'residential', name: 'Rua Oeste' }, [gx(9210, RC[0], RC[1] - S), rW]));
els.push(via(322, { highway: 'residential', name: 'Rua Leste' }, [rE, gx(9211, RC[0], RC[1] + S)]));
els.push(via(323, { highway: 'residential', name: 'Rua Norte' }, [rN, gx(9212, RC[0] + S, RC[1])]));
els.push(via(324, { highway: 'residential', name: 'Rua Sul' }, [rS, gx(9213, RC[0] - S, RC[1])]));
const extras = [
  { type: 'node', id: 1, lat: 2.805, lon: -60.696, tags: { place: 'suburb', name: 'Calungá' } },
  { type: 'node', id: 2, lat: 2.795, lon: -60.712, tags: { place: 'suburb', name: 'Centenário' } },
  { type: 'node', id: 3, lat: 2.830, lon: -60.660, tags: { place: 'suburb', name: 'Centro' } },
  { type: 'node', id: 4, lat: LAT0 + 3.4 * D, lon: LNG0 + 2 * D, tags: { 'addr:street': 'Avenida Presidente Castelo Branco', 'addr:housenumber': '100' } },
  { type: 'way', id: 5, center: { lat: LAT0 + 4.5 * D, lon: LNG0 + 4.2 * D }, tags: { amenity: 'social_facility', name: 'CRAS Cauamé' } }
];

// ---------- construtor ----------
const c = M.novoConstrutor();
eq(c.addVias(els), els.length - 1);   // a via particular não entra eq(c.addVias(els), 0, 'a mesma via vinda em dois pedaços não pode duplicar');
c.addExtras(extras);
const pacote = c.finalizar(), motor = M.criarMotor(pacote);
const info = motor.info(); eq(info.bairros, 3); eq(info.enderecos, 1); eq(info.locais, 1);

// ---------- acessos ----------
const A = M._teste.acessoVia;
eq(A({ highway: 'residential' }), 7); eq(A({ highway: 'service', access: 'private' }), 0); eq(A({ highway: 'footway' }), 2);
eq(A({ highway: 'cycleway' }), 4); eq(A({ highway: 'motorway' }), 1); eq(A({ highway: 'residential', motor_vehicle: 'no' }), 6);
eq(M._teste.oneway({ highway: 'residential', junction: 'roundabout' }), 1); eq(M._teste.oneway({ highway: 'residential', oneway: '-1' }), -1);

// ---------- rotas ----------
const pt = (r, c, dr, dc) => ({ lat: LAT0 + (r + (dr || 0)) * D, lng: LNG0 + (c + (dc || 0)) * D });
const mLng = 0.002 * 111320 * Math.cos(2.8 * Math.PI / 180);
let rota = motor.rotear('carro', pt(2, 0), pt(2, 5)), passos = rota.legs[0].steps;
assert.ok(Math.abs(rota.distance - 5 * mLng) < 5 * mLng * 0.02, 'reta pela Avenida Central: ' + rota.distance);
assert.deepStrictEqual(passos.map(p => p.maneuver.type), ['depart', 'arrive']); eq(passos[0].name, 'Avenida Central');

rota = motor.rotear('carro', pt(2, 0), pt(4, 2)); passos = rota.legs[0].steps;
assert.deepStrictEqual(passos.map(p => p.maneuver.type), ['depart', 'turn', 'arrive'], JSON.stringify(passos));
eq(passos[1].maneuver.modifier, 'left'); eq(passos[1].name, 'Avenida Presidente Castelo Branco');
assert.ok(Math.abs(passos[0].distance + passos[1].distance - rota.distance) < 1);

// mão única: a Rua Beta só vai para leste; a pé pode ir nos dois sentidos
const direto = 2 * mLng;
let car = motor.rotear('carro', pt(1, 3), pt(1, 1));
assert.ok(car.distance > direto * 1.5, 'carro dá a volta: ' + car.distance);
const co = car.geometry.coordinates;
for (let i = 1; i < co.length; i++) if (Math.abs(co[i][1] - (LAT0 + D)) < 1e-9 && Math.abs(co[i - 1][1] - (LAT0 + D)) < 1e-9) assert.ok(co[i][0] - co[i - 1][0] >= -1e-12, 'contramão na Rua Beta');
let pe = motor.rotear('pe', pt(1, 3), pt(1, 1)); assert.ok(Math.abs(pe.distance - direto) < direto * 0.03, 'a pé direto: ' + pe.distance);
pe = motor.rotear('pe', pt(0, 0), pt(1, 1)); assert.ok(pe.distance < 0.002 * 111320 * 1.5, 'atalho a pé: ' + pe.distance);
car = motor.rotear('carro', pt(0, 0), pt(1, 1)); assert.ok(car.distance > 0.002 * 111320 * 1.9, 'carro não usa calçada');
assert.ok(motor.rotear('bike', pt(0, 0), pt(1, 1)).distance > 0.002 * 111320 * 1.9);
// meio de quarteirão
rota = motor.rotear('carro', pt(2, 0, 0, 0.3), pt(2, 4, 0, 0.6)); assert.ok(Math.abs(rota.distance - 4.3 * mLng) < mLng * 0.05, 'meio de quarteirão: ' + rota.distance);
car = motor.rotear('carro', pt(1, 3, 0, 0.5), pt(1, 3, 0, 0.2)); assert.ok(car.distance > mLng * 2, 'contramão no mesmo quarteirão');
eq(motor.rotear('carro', pt(2, 0), { lat: 3.5, lng: -60.2 }).erro, 'longe');

// ---------- rotatória ----------
rota = motor.rotear('carro', { lat: RC[0], lng: RC[1] - S + 0.0003 }, { lat: RC[0], lng: RC[1] + S - 0.0003 }); passos = rota.legs[0].steps;
assert.deepStrictEqual(passos.map(p => p.maneuver.type), ['depart', 'roundabout', 'exit roundabout', 'arrive'], JSON.stringify(passos));
eq(passos[1].maneuver.exit, 2); eq(passos[1].name, 'Rua Leste'); eq(passos[0].name, 'Rua Oeste');
eq(motor.rotear('carro', { lat: RC[0], lng: RC[1] - S + 0.0003 }, { lat: RC[0] + S - 0.0003, lng: RC[1] }).legs[0].steps.find(p => p.maneuver.type === 'roundabout').maneuver.exit, 3);
eq(motor.rotear('carro', { lat: RC[0], lng: RC[1] - S + 0.0003 }, { lat: RC[0] - S + 0.0003, lng: RC[1] }).legs[0].steps.find(p => p.maneuver.type === 'roundabout').maneuver.exit, 1);

const TIPOS = new Set(['depart', 'arrive', 'turn', 'end of road', 'new name', 'roundabout', 'exit roundabout']);
for (const r of [motor.rotear('carro', pt(0, 0), pt(5, 5)), motor.rotear('pe', pt(5, 0), pt(0, 5)), motor.rotear('bike', pt(0, 5), pt(5, 0))])
  for (const p of r.legs[0].steps) assert.ok(TIPOS.has(p.maneuver.type), p.maneuver.type);

// ---------- busca ----------
let r = motor.buscar('Avenida Castelo Branco, calungá');
eq(r[0].rotulo, 'Avenida Presidente Castelo Branco — Calungá — Boa Vista'); eq(r[0].tipo, 'rua');
eq(motor.buscar('av pres castelo branco')[0].tipo, 'rua');
eq(motor.buscar('AVENIDA PRESIDENTE CASTELO BRANCU CALUNGA')[0].rotulo, 'Avenida Presidente Castelo Branco — Calungá — Boa Vista');   // erro de digitação/voz
assert.ok(motor.buscar('rua um, 55')[0].rotulo.startsWith('Rua Um')); assert.ok(motor.buscar('rua um, 55')[0].aviso.includes('55'));
r = motor.buscar('Avenida Presidente Castelo Branco, 100, Calungá');
eq(r[0].exato, true); assert.ok(r[0].rotulo.startsWith('Avenida Presidente Castelo Branco, 100 — Calungá')); assert.ok(Math.abs(r[0].lat - (LAT0 + 3.4 * D)) < 1e-9);
eq(motor.buscar('Avenida Presidente Castelo Branco 100 Calungá, Boa Vista, Roraima')[0].exato, true);
eq(motor.buscar('avenida presidente castelo branco, 100')[0].exato, true);
eq(motor.buscar('ir para rua santo agostinho número 193').length, 0);          // não existe: não inventa
eq(motor.buscar('calunga')[0].tipo, 'bairro'); eq(motor.buscar('Calungá')[0].rotulo, 'Calungá — Boa Vista');
assert.ok(motor.buscar('cras caua')[0].rotulo.startsWith('CRAS Cauamé'));
assert.ok(motor.buscar('rua 7 de setembro 245')[0].rotulo.startsWith('Rua 7 de Setembro'));
assert.ok(motor.buscar('Rua 10')[0].rotulo.startsWith('Rua 10')); eq(motor.buscar('rua 10')[0].aviso, '');
eq(motor.buscar('xyz qwerty').length, 0); eq(motor.buscar('').length, 0); assert.ok(motor.buscar('rua').length <= 6);

// ---------- reverso ----------
assert.ok(motor.reverso(LAT0 + 2 * D + 0.00001, LNG0 + 2.5 * D).rotulo.startsWith('Avenida Central'));
assert.ok(motor.reverso(LAT0 + 3.4 * D, LNG0 + 2 * D).rotulo.startsWith('Avenida Presidente Castelo Branco, 100'));
eq(motor.reverso(3.5, -60.2), null); eq(motor.dentro(2.8, -60.7), true); eq(motor.dentro(3.5, -60.7), false);

// ---------- caixa visível ----------
const ids = motor.segsNaCaixa(LAT0 + 1.9 * D, LNG0 + 1.9 * D, LAT0 + 2.1 * D, LNG0 + 2.1 * D);
assert.ok(ids.length >= 4 && new Set(ids).size === ids.length); assert.ok(motor.dados.rank(pacote.segs.w[ids[0]]) >= 0);

// ---------- tempo de curva ----------
rota = motor.rotear('carro', pt(2, 0), pt(4, 2));
const esperado = 2 * mLng / 10 + 2 * 0.002 * 111320 / 12 + 6;       // Av. Central (10 m/s) + Castelo Branco (12 m/s) + curva à esquerda (6 s)
assert.ok(Math.abs(rota.duration - esperado) < 1.5, 'curva à esquerda custa tempo: ' + rota.duration + ' vs ' + esperado);
rota = motor.rotear('carro', pt(2, 0), pt(2, 5)); assert.ok(Math.abs(rota.duration - 5 * mLng / 10) < 0.5, 'reta não tem curva');
eq(motor.rotear('carro', pt(0, 0), pt(4, 4)).alternativas, undefined);

// ---------- rotas alternativas ----------
rota = motor.rotear('carro', pt(0, 0), pt(4, 4), { alternativas: 2 });
assert.ok(rota.alternativas.length >= 1, 'deve achar outro caminho na grade');
for (const alt of rota.alternativas) {
  assert.ok(JSON.stringify(alt.geometry.coordinates) !== JSON.stringify(rota.geometry.coordinates), 'alternativa igual à principal');
  assert.ok(alt.distance <= rota.distance * 1.8 && alt.duration >= rota.duration - 1e-6, 'alternativa dentro do limite');
  assert.ok(alt.legs[0].steps.length >= 2 && !alt._segs);
}
assert.ok(!rota._segs && rota.duration > 0);
eq(motor.rotear('carro', pt(2, 0), { lat: 3.5, lng: -60.2 }, { alternativas: 2 }).erro, 'longe');

// ---------- ponto numa via solta ("ilha") ----------
{
  const c2 = M.novoConstrutor(); c2.addVias(els.concat([via(330, { highway: 'residential', name: 'Rua da Ilha' }, [gx(9300, LAT0 + 3 * D + 0.0004, LNG0 + 3.5 * D), gx(9301, LAT0 + 3 * D + 0.0004, LNG0 + 3.5 * D + 0.0003)])]));
  const m2 = M.criarMotor(c2.finalizar());
  const r2 = m2.rotear('carro', { lat: LAT0 + 3 * D + 0.0004, lng: LNG0 + 3.5 * D + 0.0001 }, pt(0, 0));
  assert.ok(!r2.erro && r2.distance > 100, 'origem numa via solta deve usar a rede ligada: ' + JSON.stringify(r2.erro));
}

// ---------- busca por cruzamento ----------
r = motor.buscar('Rua Delta com Rua Quatro');
eq(r[0].tipo, 'cruzamento'); eq(r[0].exato, true); assert.ok(Math.abs(r[0].lat - (LAT0 + 3 * D)) < 1e-9 && Math.abs(r[0].lng - (LNG0 + 3 * D)) < 1e-9);
assert.ok(r[0].rotulo.startsWith('Rua Delta com Rua Quatro'), r[0].rotulo);
eq(motor.buscar('rua um x rua alfa')[0].tipo, 'cruzamento'); eq(motor.buscar('rua dois / rua beta')[0].tipo, 'cruzamento');
eq(motor.buscar('av central esquina com av pres castelo branco, calungá')[0].tipo, 'cruzamento');
assert.ok(motor.buscar('rua alfa com rua epsilon').every(x => x.tipo !== 'cruzamento'), 'ruas paralelas não se cruzam: não inventa');
eq(motor.buscar('rua inexistente com rua um').length === 0 || motor.buscar('rua inexistente com rua um')[0].tipo !== 'cruzamento', true);

// ---------- locais (reverso, categoria, caixa) ----------
assert.ok(motor.reverso(LAT0 + 4.5 * D, LNG0 + 4.2 * D).rotulo.startsWith('CRAS Cauamé'));
const nl = motor.locaisNaCaixa(LAT0 + 4 * D, LNG0 + 4 * D, LAT0 + 5 * D, LNG0 + 5 * D); eq(nl.length, 1); eq(nl[0].k, 'g');
eq(motor.enderecosNaCaixa(LAT0 + 3 * D, LNG0 + 1 * D, LAT0 + 4 * D, LNG0 + 3 * D).length, 1);
const CL = M._teste.catLocal;
eq(CL({ amenity: 'pharmacy' }), 's'); eq(CL({ healthcare: 'clinic' }), 's'); eq(CL({ amenity: 'school' }), 'e'); eq(CL({ amenity: 'social_facility' }), 'g');
eq(CL({ shop: 'supermarket' }), 'c'); eq(CL({ amenity: 'place_of_worship' }), 'o');
const en = M._teste.enxuto({ type: 'way', id: 1, tags: { highway: 'residential', name: 'X', lit: 'yes', source: 'bing' }, nodes: [1, 2], geometry: [{ lat: 1, lon: 2, extra: 1 }, null] });
assert.deepStrictEqual(en, { type: 'way', id: 1, tags: { highway: 'residential', name: 'X' }, nodes: [1, 2], geometry: [{ lat: 1, lon: 2 }, null] });
eq(M._teste.enxuto({ type: 'node', id: 2 }), null);
eq(motor.info().ampliada, false);

// ---------- fonética, números por extenso, proximidade ----------
{
  const c3 = M.novoConstrutor();
  c3.addVias([
    via(400, { highway: 'residential', name: 'Rua Xavier de Castro' }, [gx(9400, 2.78, -60.74), gx(9401, 2.78, -60.739)]),
    via(401, { highway: 'residential', name: 'Rua Cássio Lima' }, [gx(9402, 2.79, -60.74), gx(9403, 2.79, -60.739)]),
    via(402, { highway: 'residential', name: 'Avenida Sete de Setembro' }, [gx(9404, 2.80, -60.74), gx(9405, 2.80, -60.739)]),
    via(403, { highway: 'residential', name: 'Rua Dez' }, [gx(9406, 2.81, -60.74), gx(9407, 2.81, -60.739)]),
    via(404, { highway: 'residential', name: 'Rua Aurora' }, [gx(9408, 2.76, -60.74), gx(9409, 2.76, -60.739)]),
    via(405, { highway: 'residential', name: 'Rua Aurora' }, [gx(9410, 2.88, -60.60), gx(9411, 2.88, -60.599)])
  ]);
  const m3 = M.criarMotor(c3.finalizar());
  assert.ok(m3.buscar('rua chavier castro')[0].rotulo.startsWith('Rua Xavier de Castro'), 'ch = x');
  assert.ok(m3.buscar('rua kassio lima')[0].rotulo.startsWith('Rua Cássio Lima'), 'k/ss = c');
  assert.ok(m3.buscar('avenida 7 de setembro')[0].rotulo.startsWith('Avenida Sete de Setembro'), 'dígito acha extenso');
  assert.ok(m3.buscar('avenida sete de setembro')[0].rotulo.startsWith('Avenida Sete de Setembro'));
  assert.ok(m3.buscar('rua 10')[0].rotulo.startsWith('Rua Dez')); assert.ok(m3.buscar('rua dez')[0].rotulo.startsWith('Rua Dez'));
  eq(M._teste.tokens('Rua Sete de Setembro').join(' '), 'rua 7 setembro');
  eq(M._teste.fon('chavier'), M._teste.fon('xavier')); eq(M._teste.casaToken('quero', 'vera'), false);
  assert.ok(Math.abs(m3.buscar('rua aurora', 6, { perto: { lat: 2.88, lng: -60.60 } })[0].lat - 2.88) < 0.005, 'perto da posição 2');
  assert.ok(Math.abs(m3.buscar('rua aurora', 6, { perto: { lat: 2.76, lng: -60.74 } })[0].lat - 2.76) < 0.005, 'perto da posição 1');
}

// ---------- ordem das paradas pelo tempo real ----------
{
  const O = pt(1, 3), P = [pt(1, 5), pt(1, 1), pt(3, 4), pt(4, 0)], F = pt(5, 5);
  const T = (a, b) => motor.rotear('carro', a, b).duration;
  const perms = (l) => l.length < 2 ? [l] : l.flatMap((x, i) => perms(l.slice(0, i).concat(l.slice(i + 1))).map(r => [x].concat(r)));
  const custo = (ord, fim) => { let t = 0, a = O; for (const i of ord) { t += T(a, P[i]); a = P[i]; } return t + (fim ? T(a, fim) : 0); };
  for (const fim of [F, null]) {
    const res = motor.ordenar('carro', O, P, fim), melhor = Math.min(...perms([0, 1, 2, 3]).map(o => custo(o, fim)));
    eq(res.ordem.length, 4); eq(new Set(res.ordem).size, 4);
    assert.ok(Math.abs(res.duracao - melhor) < 1e-6 && Math.abs(custo(res.ordem, fim) - melhor) < 1e-6, 'ordem ótima: ' + res.duracao + ' vs ' + melhor);
  }
  assert.deepStrictEqual(motor.ordenar('carro', O, [P[0]], F).ordem, [0]);
  eq(motor.ordenar('carro', O, [P[0], { lat: 3.9, lng: -60.2 }], F).erro, 'semrota');
  eq(motor.ordenar('carro', O, new Array(10).fill(P[0])).erro, 'muitas');
}
eq(motor.info().bytes > 0, true);

// ---------- download com fetch falso ----------
(async () => {
  const pedidos = [], prog = [];
  const falso = async (url, op) => { const q = decodeURIComponent(String(op.body).replace(/^data=/, '')); pedidos.push(q); return { ok: true, status: 200, json: async () => ({ elements: q.includes('out geom') ? els : extras }) }; };
  const res = await M.baixar({ buscar: falso, semGuardar: true, minSegmentos: 10, pausa: 0, onProgresso: (p) => prog.push(p) });
  eq(pedidos.length, 7); eq(pedidos.filter(p => p.includes('out geom')).length, 6); eq(pedidos.filter(p => p.includes('out center')).length, 1);
  assert.ok(pedidos[0].includes('(2.74,-60.76,2.82,-60.7)'), pedidos[0].slice(-80));
  eq(res.pacote.segs.a.length, pacote.segs.a.length, 'pedaços repetidos não duplicam ruas'); eq(prog[prog.length - 1].total, 7);
  await assert.rejects(() => M.baixar({ buscar: async () => ({ ok: false, status: 429, json: async () => ({}) }), semGuardar: true, pausa: 0 }), /Não consegui baixar o mapa/);
  await assert.rejects(() => M.baixar({ buscar: async () => ({ ok: true, status: 200, json: async () => ({ elements: [] }) }), semGuardar: true, pausa: 0 }), /quase vazio/);
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => M.baixar({ buscar: falso, semGuardar: true, minSegmentos: 10, pausa: 0, sinal: ctl.signal }), /cancelado/);
  // ---------- download que retoma + área ampliada ----------
  {
    const guarda = new Map(), arm = { ler: async (k) => guarda.get(k) || null, gravar: async (k, e) => { guarda.set(k, e); }, limpar: async () => { guarda.clear(); } };
    const ok = new Set(); let corte = 3, chamadas1 = 0;
    const quebra = async (url, op) => {
      const q = decodeURIComponent(String(op.body).replace(/^data=/, '')); chamadas1++;
      if (!ok.has(q)) { if (ok.size >= corte) return { ok: false, status: 504, json: async () => ({}) }; ok.add(q); }
      return { ok: true, status: 200, json: async () => ({ elements: q.includes('out geom') ? els : extras }) };
    };
    await assert.rejects(() => M.baixar({ buscar: quebra, semGuardar: true, minSegmentos: 10, pausa: 0, parcial: arm }), /continua de onde parou/);
    eq(guarda.size, 3, 'os 3 pedaços baixados ficam guardados');
    const pedidos2 = [], prog2 = [];
    const bom = async (url, op) => { const q = decodeURIComponent(String(op.body).replace(/^data=/, '')); pedidos2.push(q); return { ok: true, status: 200, json: async () => ({ elements: q.includes('out geom') ? els : extras }) }; };
    const res2 = await M.baixar({ buscar: bom, semGuardar: true, minSegmentos: 10, pausa: 0, parcial: arm, onProgresso: (p) => prog2.push(p) });
    eq(pedidos2.length, 4, 'só pede o que faltava'); eq(res2.retomadas, 3); eq(res2.pacote.segs.a.length, pacote.segs.a.length); eq(guarda.size, 0, 'limpa os pedaços ao terminar');
    assert.ok(prog2.some(p => /Retomando/.test(p.texto)));
  }
  {
    const pedidos3 = [], bom = async (url, op) => { const q = decodeURIComponent(String(op.body).replace(/^data=/, '')); pedidos3.push(q); return { ok: true, status: 200, json: async () => ({ elements: q.includes('out geom') ? els : extras }) }; };
    const res3 = await M.baixar({ buscar: bom, semGuardar: true, minSegmentos: 10, pausa: 0, ampliada: true });
    eq(pedidos3.length, 16); eq(pedidos3.filter(q => q.includes('out geom')).length, 14); eq(res3.pacote.ampliada, true); eq(res3.pacote.v, 2);
    assert.ok(pedidos3.some(q => q.includes('(2.45,-61.05,2.74,-60.76)')), 'moldura ampliada pedida');
    assert.ok(pedidos3.filter(q => q.includes('out geom')).slice(6).every(q => !q.includes('residential')), 'entorno só com estradas principais');
    const mA = M.criarMotor(res3.pacote); eq(mA.dentro(2.5, -60.9), true); eq(mA.dentro(3.3, -60.9), false); eq(mA.info().ampliada, true);
  }
  console.log('mapa-offline.test.js: tudo certo');
})().catch((e) => { console.error(e); process.exit(1); });
