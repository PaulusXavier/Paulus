// node tests/mapa-foco.test.cjs — reconhecimento dos bairros 13 de Setembro e Araceli no mapa (sem DOM, sem rede).
const assert = require('assert');
const F = require('./_mapa.cjs')('mapa-foco.js');
const d = (q) => { const r = F.detectar(q); return r && { id: r.foco.id, resto: r.resto }; };

// 13 de Setembro, em várias grafias
for (const q of ['Rua das Flores, 13 de Setembro', 'rua das flores treze de setembro', 'Rua das Flores 13 de setembro', 'Rua das Flores, bairro 13 de Setembro', 'rua das flores, 13/set', 'Rua das Flores, XIII de Setembro', 'Rua das Flores, 13 setembro'])
  assert.deepStrictEqual(d(q) && d(q).id, '13s', q);
assert.strictEqual(d('Rua das Flores, 13 de Setembro').resto, 'Rua das Flores');
assert.strictEqual(d('Rua das Flores, bairro 13 de Setembro').resto, 'Rua das Flores');
assert.strictEqual(d('13 de setembro').resto, '');
assert.strictEqual(d('Rua A 120 13 de setembro').resto, 'Rua A 120');

// Araceli, em várias grafias
for (const q of ['Rua B, Araceli', 'rua b aracelis', 'Rua B, Araceli Souto Maior', 'Rua B, Profa. Araceli Souto Maior', 'Rua B, aracele', 'rua b bairro araceli', 'Rua B, Aracelli S. Maior'])
  assert.strictEqual(d(q) && d(q).id, 'araceli', q);
assert.strictEqual(d('Rua B, Araceli Souto Maior').resto, 'Rua B');
assert.strictEqual(d('Rua B 45 profa. araceli souto maior').resto, 'Rua B 45');

// nome de rua não é bairro; outros bairros não casam
assert.strictEqual(d('Rua Treze de Setembro'), null);
assert.strictEqual(d('Av. 13 de Setembro, 100'), null);
assert.strictEqual(d('Rua Santo Agostinho, Centenário'), null);
assert.strictEqual(d('Rua Araceli, Centro'), null);

// consultas
assert.deepStrictEqual(F.consultas(F.porId('13s'), 'Rua das Flores'), ['Rua das Flores, 13 de Setembro, Boa Vista', 'Rua das Flores, Treze de Setembro, Boa Vista']);
assert.strictEqual(F.consultas(F.porId('araceli'), '')[0], 'Araceli Souto Maior, Boa Vista');

// priorização
const rs = [{ display_name: 'Rua X, Centro, Boa Vista' }, { display_name: 'Rua X, Aracelis Souto Maior, Boa Vista' }, { address: { suburb: '13 de Setembro' }, display_name: 'Rua X, Boa Vista' }, { _rotulo: 'Rua X — Pricumã — Boa Vista' }];
assert.deepStrictEqual(F.priorizar(rs).map(r => rs.indexOf(r)), [1, 2, 0, 3]);
assert.deepStrictEqual(F.priorizar(rs, F.porId('13s')).map(r => rs.indexOf(r)), [2, 0, 1, 3]);
console.log('mapa-foco: ok');
