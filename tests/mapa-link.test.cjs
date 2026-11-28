// Rodar: node tests/mapa-link.test.cjs — rota em link (de um aparelho para outro, sem conta)
const assert = require('assert'), U = require('./_mapa.cjs')('mapa-util.js'), eq = assert.strictEqual;
const rota = { nome: 'Terça — Araceli ✓', modo: 'carro', origem: { tipo: 'outro', lat: 2.82, lng: -60.67, rotulo: 'Rua Santo Agostinho, 193 — Centenário' },
  paradas: [{ lat: 2.8301234567, lng: -60.7, rotulo: 'Rua 13 de Setembro, 5 — 13 de Setembro', visita: 20 }, { lat: 2.84, lng: -60.71, rotulo: 'Av. Capitão Ene Garcez, 100', visita: null }],
  destino: { lat: 2.85, lng: -60.72, rotulo: 'CRAS Cristiana Vicente Nunes' }, saida: '08:00', limite: '17:00', visita: '30' };
const url = U.linkDoApp('https://x.github.io/Anona/index.html#velho', rota);
assert.ok(url.startsWith('https://x.github.io/Anona/index.html#paulus-rota=') && !/[+/=\s#]/.test(url.split('#')[1].slice(12)), 'url-safe, sem "#" antigo');
const d = U.decodificarRota('#' + url.split('#')[1]);
eq(d.nome, rota.nome); eq(d.modo, 'carro'); eq(d.paradas.length, 2); eq(d.paradas[0].lat, 2.830123); eq(d.paradas[0].visita, 20); eq(d.paradas[1].visita, null);
eq(d.paradas[0].rotulo, 'Rua 13 de Setembro, 5 — 13 de Setembro'); eq(d.destino.rotulo, 'CRAS Cristiana Vicente Nunes');
eq(d.origem.tipo, 'outro'); eq(d.origem.rotulo, rota.origem.rotulo); eq(d.saida, '08:00'); eq(d.limite, '17:00'); eq(d.visita, '30');
assert.deepStrictEqual(U.decodificarRota(url).destino, d.destino, 'aceita o link inteiro');
// 30 paradas cabem num link razoável
const muitas = Object.assign({}, rota, { paradas: Array.from({ length: 30 }, (_, i) => ({ lat: 2.8 + i / 1000, lng: -60.7, rotulo: 'Rua Exemplo Número ' + i + ', ' + (i + 1) + ' — Bairro Qualquer', visita: 15 })) });
const u30 = U.linkDoApp('https://x/', muitas); assert.ok(u30.length < 4500, 'link de 30 paradas: ' + u30.length + ' caracteres'); eq(U.decodificarRota(u30).paradas.length, 30);
// partida da pessoa ("pos") não carrega coordenadas
eq(U.decodificarRota(U.linkDoApp('https://x/', Object.assign({}, rota, { origem: { tipo: 'pos' } }))).origem.tipo, 'pos');
// entradas ruins ou maliciosas: sempre null, nunca exceção
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), com = (o) => '#paulus-rota=' + b64(o);
const ok = { v: 1, n: 'x', m: 'carro', o: { tipo: 'pos' }, p: [], d: [2.8, -60.7, 'a', null] };
assert.ok(U.decodificarRota(com(ok)));
for (const ruim of [null, '', '#', '#outra=1', '#paulus-rota=', '#paulus-rota=@@@', '#paulus-rota=' + b64({ v: 2 }), com(Object.assign({}, ok, { m: 'aviao' })), com(Object.assign({}, ok, { d: [95, 0, 'a'] })),
  com(Object.assign({}, ok, { d: ['a', 'b'] })), com(Object.assign({}, ok, { p: Array.from({ length: 31 }, () => [2.8, -60.7, 'a']) })), com(Object.assign({}, ok, { p: [[2.8]] })), '#paulus-rota=' + 'A'.repeat(30000)])
  eq(U.decodificarRota(ruim), null, String(ruim).slice(0, 40));
// campos estranhos são limpos
const sujo = U.decodificarRota(com(Object.assign({}, ok, { n: 'N'.repeat(500), s: '<script>', l: '9:99x', i: '99999', __proto__x: 1 })));
eq(sujo.nome.length, 60); eq(sujo.saida, ''); eq(sujo.limite, ''); eq(sujo.visita, '0'); eq(Object.keys(sujo).sort().join(), 'destino,limite,modo,nome,origem,paradas,saida,visita');
console.log('mapa-link.test.js: tudo certo');
