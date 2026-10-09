import test from 'node:test';
import assert from 'node:assert/strict';
import { temDadoPessoal } from '../shared/pii.mjs';
import { detectarCrise } from '../shared/crise.mjs';

test('pii: barra documento, e-mail, nome completo, tratamento e endereço', () => {
  for (const t of ['CPF 123.456.789-09', 'escreveu para ana@exemplo.com', 'o nome dela é Maria Souza', 'a dona Maria Souza veio', 'ela mora na Rua das Flores, 123']) {
    assert.equal(temDadoPessoal(t), true, t);
  }
});

test('pii: deixa passar pergunta técnica', () => {
  for (const t of ['Quem gere o Cadastro Único no município?', 'como encaminho uma gestante em situação de rua?', 'qual o prazo do PAIF?']) {
    assert.equal(temDadoPessoal(t), false, t);
  }
});

test('crise: acha os três tipos e devolve telefones', () => {
  assert.equal(detectarCrise('ela falou em suicídio').subtipo, 'suicidio');
  assert.equal(detectarCrise('ele está sendo agredido agora').subtipo, 'violencia');
  assert.equal(detectarCrise('houve uma overdose').subtipo, 'clinica');
  assert.ok(detectarCrise('ela falou em suicídio').telefones.some(t => t.numero === '188'));
  assert.equal(detectarCrise('como funciona o PAIF?'), null);
});

// ---- correções da revisão ----
import { temDadoPessoal as pii2 } from '../shared/pii.mjs';
import { detectarCrise as crise2 } from '../shared/crise.mjs';
import { criarIndice as ci2, buscar as bu2 } from '../shared/busca.mjs';

test('pii: documento rotulado, mesmo curto, é barrado', () => {
  for (const t of ['meu RG 1234567', 'CPF: 12345678', 'NIS nº 123456789'.replace('123456789', '1234567')]) assert.equal(pii2(t), true, t);
});

test('pii: nome depois de paciente/mãe/criança é barrado', () => {
  assert.equal(pii2('a mãe Maria Souza veio ao CRAS'), true);
  assert.equal(pii2('paciente Ana Lima'), true);
});

test('pii: nomes de programas e intervalo de anos não são barrados', () => {
  for (const t of ['como atender criança no Bolsa Família', 'o que é a Lei Maria da Penha?', 'nome do Programa Bolsa Família', 'valores do Bolsa Família 2023-2026', 'decretos 2007 2012']) {
    assert.equal(pii2(t), false, t);
  }
});

test('crise: "estou sendo agredida", "risco de vida" e "socorro" acionam; "inconsciente" (Freud) e "primeiros socorros" não', () => {
  for (const t of ['estou sendo agredida', 'há risco de vida', 'socorro', 'ela está inconsciente', 'ela desmaiou']) assert.ok(crise2(t), t);
  for (const t of ['o inconsciente em Freud', 'curso de primeiros socorros']) assert.equal(crise2(t), null, t);
});

test('busca: sigla do Bolsa Família (BVF) acha o trecho por extenso', () => {
  const idx = ci2([{ id: 'x#1', doc: 'x', titulo: 'T', norma: 'N', ano: 2026, referencia: 'Valores', texto: 'Benefício Variável Familiar: R$ 50 por gestante.' }]);
  assert.equal(bu2(idx, 'valor do BVF', { k: 1 }).length, 1);
});

import { consultaComContexto } from '../shared/busca.mjs';
test('busca: pergunta curta de seguimento herda a pergunta anterior', () => {
  const h = [{ papel: 'usuario', texto: 'o que é o CECO?' }, { papel: 'paulus', texto: '...' }];
  assert.match(consultaComContexto('e o horário?', h), /CECO/);
  assert.equal(consultaComContexto('qual a diferença entre CAPS II e CAPS III?', h), 'qual a diferença entre CAPS II e CAPS III?');
});
