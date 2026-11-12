import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { ordenarVisitas, analisarEnderecoVisita } from '../shared/visitas.mjs';
import { juntar } from '../scripts/build.mjs';

const PARTIDA = 'Rua Santo Agostinho, nº 193 — Centenário, Boa Vista/RR';
const ends = (r) => r.itens.map((x) => x.endereco);
const I = (...t) => t.map((endereco) => ({ endereco }));

test('visitas: lê tipo, nome, número e bairro', () => {
  let a = analisarEnderecoVisita('Rua Santo Agostinho, nº 193 — Centenário');
  assert.deepEqual([a.tipo, a.chave, a.numero, a.bairro], ['rua', 'santo agostinho', 193, 'centenario']);
  a = analisarEnderecoVisita('Av. Capitão Ene Garcez, S/N — 13 de Setembro');
  assert.deepEqual([a.tipo, a.chave, a.numero, a.semNumero, a.bairro], ['avenida', 'capitao ene garcez', null, true, '13 de setembro']);
  a = analisarEnderecoVisita('Rua 7 de Setembro, 245');
  assert.deepEqual([a.chave, a.numero], ['7 de setembro', 245]);
  assert.equal(analisarEnderecoVisita('Rua 7 de Setembro').numero, null);
  assert.equal(analisarEnderecoVisita('sem endereço nenhum'), null);
  assert.equal(analisarEnderecoVisita(''), null);
});

test('visitas: rua de partida primeiro, em serpentina (ímpares sobem, pares voltam)', () => {
  const r = ordenarVisitas(I('Rua Zeca, 10', 'Rua Santo Agostinho, nº 200', 'Rua Alfa, 50', 'Rua Santo Agostinho, 193', 'Rua Alfa, S/N', 'Av. Alfa, 7', 'Rua Alfa, 8'), PARTIDA);
  assert.deepEqual(ends(r), ['Rua Santo Agostinho, 193', 'Rua Santo Agostinho, nº 200', 'Av. Alfa, 7', 'Rua Alfa, 50', 'Rua Alfa, 8', 'Rua Alfa, S/N', 'Rua Zeca, 10']);
});

test('visitas: lados da rua, mesmo endereço junto, ilegível no fim na ordem original', () => {
  const r = ordenarVisitas(I('Rua B, 4', 'Rua B, 1', 'Rua B, 2', 'Rua B, 3', 'ilegível 1', 'Rua B, 3', 'ilegível 2'), '');
  assert.deepEqual(ends(r), ['Rua B, 1', 'Rua B, 3', 'Rua B, 3', 'Rua B, 4', 'Rua B, 2', 'ilegível 1', 'ilegível 2']);
  assert.equal(r.ilegiveis, 2);
  assert.deepEqual(r.indices.slice(-2), [4, 6]);
});

test('visitas: bairro da partida vem antes dos outros', () => {
  const r = ordenarVisitas(I('Rua Alfa, 1 — 13 de Setembro', 'Rua Zeta, 1 — Centenário'), PARTIDA);
  assert.deepEqual(ends(r), ['Rua Zeta, 1 — Centenário', 'Rua Alfa, 1 — 13 de Setembro']);
});

test('visitas: lista vazia e entradas estranhas não quebram', () => {
  assert.deepEqual(ordenarVisitas([], PARTIDA).itens, []);
  assert.equal(ordenarVisitas(I('Rua A, 1', null), PARTIDA).itens.length, 2);
  assert.equal(ordenarVisitas(undefined, PARTIDA).itens.length, 0);
});

test('visitas: não muta a lista de entrada', () => {
  const ent = I('Rua B, 2', 'Rua A, 1'); const copia = JSON.stringify(ent);
  ordenarVisitas(ent, PARTIDA); assert.equal(JSON.stringify(ent), copia);
});

test('visitas: o módulo não faz rede nem usa IA', () => {
  const src = readFileSync(new URL('../shared/visitas.mjs', import.meta.url), 'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|import\s+/.test(src.replace(/\/\/.*$/gm, '')));
});

test('visitas: o pacote do navegador expõe Paulus.visitas', () => {
  const ctx = { self: {}, console }; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(juntar(), ctx);
  const P = ctx.Paulus;
  assert.equal(P.versao, '0.15.0');
  assert.deepEqual(Array.from(P.visitas.ordenar([{ endereco: 'Rua B, 2' }, { endereco: 'Rua A, 1' }]).indices), [1, 0]);
});

test('visitas: complemento (apto, casa, bloco, quadra/lote) não vira outra rua nem bairro', () => {
  const casos = [
    ['Rua Paraviana, 12 apto 3 - Centro', 12, 'centro'],
    ['Rua Paraviana, 12, casa 2, Centro', 12, 'centro'],
    ['R. Paraviana 12 Bloco B', 12, ''],
    ['Rua Paraviana, 12-A - Centro', 12, 'centro']
  ];
  for (const [t, n, b] of casos) {
    const a = analisarEnderecoVisita(t);
    assert.deepEqual([a.chave, a.numero, a.bairro], ['paraviana', n, b], t);
  }
  assert.equal(analisarEnderecoVisita('Rua das Flores, Qd 5 Lt 12').chave, 'das flores');
  // "casa" no nome da rua continua sendo nome da rua
  assert.equal(analisarEnderecoVisita('Rua da Casa Nova, 10').chave, 'da casa nova');
});

test('visitas: bairro sem número e endereço sem tipo', () => {
  const a = analisarEnderecoVisita('Rua X, Centro');
  assert.deepEqual([a.chave, a.numero, a.bairro], ['x', null, 'centro']);
  const b = analisarEnderecoVisita('Santo Agostinho, 193');
  assert.deepEqual([b.tipo, b.chave, b.numero], ['', 'santo agostinho', 193]);
  assert.equal(analisarEnderecoVisita('ilegível 1'), null);
});

test('visitas: ruas de mesmo nome em bairros diferentes não se misturam', () => {
  const r = ordenarVisitas(I('Rua 1, 5 - Pintolândia', 'Rua 1, 2 - Caranã', 'Rua 1, 3 - Pintolândia', 'Rua 1, 4 - Caranã'), '');
  assert.deepEqual(ends(r), ['Rua 1, 3 - Pintolândia', 'Rua 1, 5 - Pintolândia', 'Rua 1, 4 - Caranã', 'Rua 1, 2 - Caranã']);
});
