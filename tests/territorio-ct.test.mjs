import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaDeTerritorioCT, territoriosCT } from '../shared/territorio-ct.mjs';

test('territórios locais incluem três Conselhos Tutelares', () => {
  assert.equal(territoriosCT.length, 3);
  assert.equal(respostaDeTerritorioCT('quantos conselhos tutelares tem em Boa Vista?').tipoTerritorio, 'geral');
});
test('identifica bairro em lista oficial sem depender de acentuação', () => {
  const r = respostaDeTerritorioCT('qual conselho tutelar atende o bairro Pricumã?');
  assert.equal(r.tipoTerritorio, 'bairro');
  assert.match(r.texto, /Conselho Tutelar I/);
  assert.match(respostaDeTerritorioCT('o Caimbé é de qual conselho tutelar?').texto, /Conselho Tutelar II/);
  assert.match(respostaDeTerritorioCT('qual conselho atende Dr. Silvio Botelho?').texto, /Conselho Tutelar III/);
});
test('lista bairros e contatos quando explicitamente solicitados', () => {
  assert.match(respostaDeTerritorioCT('quais bairros o Conselho Tutelar III atende?').texto, /Jardim Primavera/);
  assert.match(respostaDeTerritorioCT('telefone do Conselho Tutelar II').texto, /98403-7780/);
});
test('não adivinha bairro ausente e não captura pergunta sobre CRAS', () => {
  assert.equal(respostaDeTerritorioCT('qual é o CRAS do Centro?'), null);
  const r = respostaDeTerritorioCT('qual conselho tutelar atende Vila Jardim?');
  assert.equal(r.tipoTerritorio, 'nao-consta');
  assert.match(r.texto, /Não vou deduzir/);
});
