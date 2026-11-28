// Rodar: node tests/mapa-offline-bv.test.cjs
// Melhorias para Boa Vista: números por extenso, siglas de locais, bairro por limite administrativo e por addr:suburb, chão de terra, tags guardadas.
const assert = require('assert');
const M = require('./_mapa.cjs')('mapa-offline.js');
const eq = assert.strictEqual, T = M._teste;

// ---------- números por extenso e abreviações ----------
assert.deepStrictEqual(T.tokens('Rua Treze de Setembro'), ['rua', '13', 'setembro']);
assert.deepStrictEqual(T.tokens('Av. Vinte e Cinco de Agosto'), ['avenida', '25', 'agosto']);
assert.deepStrictEqual(T.tokens('Rua Trinta e Um de Março'), ['rua', '31', 'marco']);
assert.deepStrictEqual(T.tokens('Rua Um'), ['rua', 'um'], '"um" sozinho é nome de rua');
assert.deepStrictEqual(T.tokens('Av. Cap. Ene Garcez'), ['avenida', 'capitao', 'ene', 'garcez']);
assert.deepStrictEqual(T.tokens('Jd. Floresta'), ['jardim', 'floresta']);
assert.ok(T.tokensLocal('HGR').includes('hospital') && T.tokensLocal('HGR').includes('roraima'));

// ---------- tags que o download guarda (antes addr:suburb/boundary eram descartadas) ----------
const e1 = T.enxuto({ type: 'node', id: 1, lat: 1, lon: 2, tags: { 'addr:street': 'Rua A', 'addr:housenumber': '1', 'addr:suburb': 'Pricumã', short_name: 'X', lixo: 'y' } });
eq(e1.tags['addr:suburb'], 'Pricumã'); eq(e1.tags.short_name, 'X'); eq(e1.tags.lixo, undefined);
const e2 = T.enxuto({ type: 'relation', id: 2, center: { lat: 1, lon: 2 }, tags: { boundary: 'administrative', admin_level: '10', name: 'Caimbé' } });
eq(e2.tags.admin_level, '10');

// ---------- chão de terra ----------
assert.ok(T.velCarro({ highway: 'tertiary', surface: 'dirt' }) <= 5); eq(T.velCarro({ highway: 'tertiary', surface: 'asphalt' }), 10);
assert.ok(T.velCarro({ highway: 'unclassified', surface: 'compacted' }) <= 7);

// ---------- pacote sintético ----------
const via = (id, nome, a, b) => ({ type: 'way', id, tags: { highway: 'residential', name: nome }, nodes: [id * 10, id * 10 + 1], geometry: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }] });
const vias = [
  via(1, 'Rua Treze de Setembro', [2.800, -60.700], [2.800, -60.690]),
  via(2, 'Avenida Capitão Ene Garcez', [2.810, -60.700], [2.810, -60.690]),
  via(3, 'Rua Pricumã', [2.820, -60.700], [2.820, -60.690])
];
const extras = [
  { type: 'relation', id: 50, center: { lat: 2.805, lon: -60.695 }, tags: { boundary: 'administrative', admin_level: '10', name: 'Treze de Setembro' } },
  { type: 'relation', id: 51, center: { lat: 2.9, lon: -60.6 }, tags: { boundary: 'administrative', admin_level: '8', name: 'Boa Vista (município)' } },
  { type: 'way', id: 60, center: { lat: 2.8201, lon: -60.6951 }, tags: { amenity: 'hospital', name: 'Hospital Geral de Roraima', short_name: 'HGR' } },
  { type: 'way', id: 61, center: { lat: 2.8101, lon: -60.6951 }, tags: { amenity: 'social_facility', name: 'CRAS Cristiana Vicente Nunes' } }
];
// 4 casas escritas como "Pricumã" (sem nenhum place=suburb): o bairro deve ser derivado
for (let i = 0; i < 4; i++) extras.push({ type: 'node', id: 100 + i, lat: 2.8201 + i * 0.0001, lon: -60.699 + i * 0.002, tags: { 'addr:street': 'Rua Pricumã', 'addr:housenumber': String(10 + i * 2), 'addr:suburb': 'Pricumã' } });
const c = M.novoConstrutor(); c.addVias(vias); c.addExtras(extras);
const pacote = c.finalizar(), motor = M.criarMotor(pacote), info = motor.info();
eq(info.bairros, 2, 'Treze de Setembro (limite admin. nível 10) + Pricumã (derivado dos endereços); o município nível 8 NÃO é bairro');
const nomes = motor.dados.lugares.map(b => b.n).sort(); assert.deepStrictEqual(nomes, ['Pricumã', 'Treze de Setembro']);

// busca por extenso e por sigla
let r = motor.buscar('treze de setembro');
assert.ok(r.some(x => x.tipo === 'bairro' && /Treze de Setembro/.test(x.rotulo)), 'bairro por extenso: ' + JSON.stringify(r));
assert.ok(motor.buscar('rua 13 de setembro').some(x => x.tipo === 'rua' && /Treze de Setembro/.test(x.rotulo)), '13 acha Treze');
assert.ok(motor.buscar('rua treze de setembro').some(x => x.tipo === 'rua' && /Treze de Setembro/.test(x.rotulo)));
r = motor.buscar('hgr'); assert.ok(r.length && r[0].tipo === 'local' && /Hospital Geral/.test(r[0].rotulo), 'sigla HGR: ' + JSON.stringify(r));
r = motor.buscar('hospital geral de roraima'); assert.ok(r.some(x => x.tipo === 'local'));
r = motor.buscar('cras cristiana'); assert.ok(r.length && /CRAS Cristiana/.test(r[0].rotulo), 'CRAS: ' + JSON.stringify(r));
r = motor.buscar('centro de referencia de assistencia social cristiana'); assert.ok(r.some(x => /CRAS Cristiana/.test(x.rotulo)), 'nome por extenso acha a sigla');

// bairro de um ponto = o das casas vizinhas (o centro de Treze de Setembro está mais longe da Rua Pricumã que o de Pricumã... mas o rótulo vem do endereço)
const rv = motor.reverso(2.8201 + 0.0001, -60.699 + 0.002); assert.ok(rv && /Pricumã/.test(rv.rotulo), JSON.stringify(rv));
// endereço sem número exato: rótulo traz o bairro escrito nas casas
r = motor.buscar('rua pricuma 12'); assert.ok(r.length && /Pricumã/.test(r[0].rotulo) && r[0].exato, JSON.stringify(r));

// pacote antigo (sem campo b / a): continua funcionando
const velho = JSON.parse(JSON.stringify({ ruas: pacote.ruas, bairros: pacote.bairros, enderecos: pacote.enderecos.map(a => ({ r: a.r, n: a.n, lat: a.lat, lng: a.lng })), locais: pacote.locais.map(l => ({ n: l.n, lat: l.lat, lng: l.lng, k: l.k })) }));
const pv = Object.assign({}, pacote, velho); const mv = M.criarMotor(pv); eq(mv.info().bairros, 1);
assert.ok(mv.buscar('rua pricuma 12').length);
console.log('mapa-offline-bv.test.js: tudo certo');
