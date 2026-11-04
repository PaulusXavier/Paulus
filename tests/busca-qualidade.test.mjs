// Qualidade da busca nas normas (v0.9.0): gíria do trabalho, município da pergunta e documentos que só um trecho responde.
// Cada caso é uma pergunta real de quem trabalha no CRAS e o documento que TEM de aparecer entre os trechos que vão para a IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarIndice, buscarPergunta, municipiosEm, normalizar, K_PADRAO } from '../shared/busca.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const indice = criarIndice(base);
const docs = function (q) { return buscarPergunta(indice, q, { k: K_PADRAO }).map(function (r) { return r.trecho.doc; }); };

test('busca: gíria do trabalho chega na palavra da norma', () => {
  assert.ok(docs('quem pode receber cesta básica').includes('decreto-6307-2007'), 'cesta básica -> benefício eventual');
  assert.ok(docs('aluguel social').includes('decreto-6307-2007'), 'aluguel social -> benefício eventual');
  assert.ok(docs('meu bolsa família foi cortado').includes('bolsa-familia-2026'), 'cortado -> bloqueio/suspensão');
  assert.ok(docs('morador de rua').includes('cfp-ref-pop-rua-2025'), 'morador de rua -> situação de rua');
  assert.ok(docs('atendimento de índio na aldeia').includes('cfp-ref-povos-indigenas-2024'), 'índio -> indígena');
});

test('busca: dado do Censo SUAS sobre psicólogos acha o documento certo', () => {
  for (const q of ['quantos psicólogos no censo SUAS', 'quantos psicólogos tem nos CRAS de Boa Vista?', 'psicólogos do CREAS de Roraima', 'quantos CRAS tem em Boa Vista']) {
    assert.equal(docs(q)[0], 'censo-suas-2025-roraima-psicologos', q);
  }
});

test('busca: município da pergunta manda; sem município vale Boa Vista; diagnóstico não atrapalha pergunta de trabalho', () => {
  assert.equal(docs('quantas famílias no CadÚnico em Pacaraima')[0], 'diagnostico-socioterritorial-pacaraima-2026');
  assert.equal(docs('quantas famílias no CadÚnico em Uiramutã')[0], 'diagnostico-socioterritorial-uiramuta-2026');
  assert.equal(docs('quantas famílias no CadÚnico em Boa Vista')[0], 'boa-vista-diagnostico-socioterritorial-2026');
  const semMunicipio = docs('quantas famílias estão cadastradas no CadÚnico');
  assert.ok(semMunicipio.includes('boa-vista-diagnostico-socioterritorial-2026'), 'sem município, Boa Vista: ' + semMunicipio.join(', '));
  assert.ok(!semMunicipio.some(function (d) { return /pacaraima|uiramuta|alto-alegre|caroebe|rorainopolis/.test(d); }), 'sem município, nada de outro lugar: ' + semMunicipio.join(', '));
  const trabalho = docs('como escrever um relatório de visita domiciliar');
  assert.ok(!trabalho.some(function (d) { return /diagnostico-socioterritorial/.test(d); }), 'pergunta de trabalho não traz diagnóstico de município: ' + trabalho.join(', '));
});

test('busca: o mesmo assunto de diagnóstico não se repete em documentos que incluem Boa Vista', () => {
  const r = buscarPergunta(indice, 'quantas famílias e pessoas estão cadastradas em Boa Vista', { k: K_PADRAO });
  const titulos = r.filter(function (x) { return /diagnostico-socioterritorial/.test(x.trecho.doc); }).map(function (x) { return normalizar(x.trecho.referencia).split(' ').slice(-6).join(' '); });
  assert.ok(titulos.length >= 2, 'precisa de resultados de diagnóstico para o teste valer');
  assert.equal(new Set(titulos).size, titulos.length, titulos.join(' | '));
});

test('busca: o que já funcionava continua funcionando', () => {
  assert.ok(docs('benefício eventual natalidade e funeral')[0] === 'decreto-6307-2007');
  assert.ok(docs('o que é a Operação Acolhida')[0] === 'roraima-operacao-acolhida-2026');
  assert.ok(docs('quantos indígenas vivem em Roraima')[0] === 'roraima-povos-indigenas-2022');
  assert.ok(docs('quantos municípios tem Roraima')[0] === 'roraima-municipios-2022');
});

test('busca: municipiosEm só reconhece o nome inteiro', () => {
  assert.deepEqual(municipiosEm(normalizar('CRAS de Boa Vista e de São João da Baliza')), ['boa vista', 'sao joao da baliza']);
  assert.deepEqual(municipiosEm(normalizar('boa vistaria')), []);
});
