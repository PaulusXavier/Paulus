import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { respostaDeContagem, respostaDeFatoBoaVista, respostaDePolitica, respostaDaBase } from '../shared/resposta-local.mjs';
import { expandirBase } from '../shared/base-compacta.mjs';

const base = expandirBase(JSON.parse(readFileSync(new URL('../knowledge/worker-base.json', import.meta.url), 'utf8')));

test('contagem por bairro: escolas do Centro vêm do mapa e do diretório, com aviso de fonte', () => {
  const r = respostaDeContagem('quantas escolas tem no bairro Centro?');
  assert.ok(r);
  assert.match(r.texto, /\*\*Centro\*\*/);
  assert.match(r.texto, /Mapa colaborativo/);
  assert.match(r.texto, /Censo Escolar/);
  assert.ok(r.fontes.length >= 1);
});

test('contagem: sinônimo de bairro (13 de setembro) e lista de UBS', () => {
  assert.match(respostaDeContagem('quantas escolas tem no 13 de setembro?').texto, /13 de Setembro/);
  assert.match(respostaDeContagem('quais UBS tem no Pricumã?').texto, /UBS Pricumã/);
});

test('contagem: bairro desconhecido não vira zero; ranking e cidade toda respondem', () => {
  assert.match(respostaDeContagem('quantas escolas tem no bairro Xyzabc?').texto, /Não encontrei o bairro/);
  assert.match(respostaDeContagem('qual bairro tem mais escolas?').texto, /Bairros com mais escolas/);
  assert.match(respostaDeContagem('quantos CRAS tem em Boa Vista?').texto, /\*\*9\*\* CRAS/);
});

test('contagem: gente, outro lugar e tema sensível vão para a IA', () => {
  for (const q of ['quantos alunos tem nas escolas do Centro?', 'quantas escolas tem em Roraima?', 'quantas famílias no CRAS?', 'quantas escolas tem no Centro com violência?', 'oi'])
    assert.equal(respostaDeContagem(q), null, q);
});

test('Boa Vista: dado vem da seção exata da base; ano sem fonte e outro lugar vão para a IA', () => {
  assert.match(respostaDeFatoBoaVista('quantos habitantes tem Boa Vista?', base).texto, /413\.486/);
  assert.match(respostaDeFatoBoaVista('qual o PIB de Boa Vista?', base).texto, /PIB/);
  assert.equal(respostaDeFatoBoaVista('qual a população de Boa Vista em 2010?', base), null);
  assert.equal(respostaDeFatoBoaVista('quantos habitantes tem Rorainópolis?', base), null);
});

test('políticas: Bolsa Família e CadÚnico respondem pela seção certa; BPC e caso concreto não', () => {
  assert.match(respostaDePolitica('como sacar o Bolsa Família?', base).texto, /Como sacar/);
  assert.match(respostaDePolitica('quando o benefício é bloqueado?', base).texto, /bloqueado/);
  assert.equal(respostaDePolitica('qual o valor do BPC?', base), null);
  assert.equal(respostaDePolitica('posso negar o Bolsa Família para a vizinha?', base), null);
});

test('definição: só sigla, só com trecho de aderência alta que define o termo', () => {
  const trecho = { doc: 'x', titulo: 'PAIF', texto: 'O Serviço PAIF consiste no trabalho social com famílias.', tipo: 'norma' };
  const achados = [{ trecho, aderencia: 'alta' }];
  assert.ok(respostaDaBase('o que é o PAIF?', achados, {}));
  assert.equal(respostaDaBase('o que é vulnerabilidade social?', achados, {}), null);
  assert.equal(respostaDaBase('o que é o PAIF?', [{ trecho, aderencia: 'media' }], {}), null);
  assert.equal(respostaDaBase('o que é o PAIF?', achados, { analise: true }), null);
});
