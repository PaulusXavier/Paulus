import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { respostaDeEquipeCras, equipeCrasCristiana } from '../shared/equipe-cras-cristiana.mjs';
import { respostaDeSaudeMentalTerritorio } from '../shared/saude-mental-territorio.mjs';

test('técnico de referência por bairro (CRAS Cristiana Vicente Nunes)', () => {
  const r = respostaDeEquipeCras('quem é o técnico do bairro Buritis?');
  assert.equal(r.tipoEquipe, 'bairro'); assert.match(r.texto, /Fernanda Gomes \(Psicóloga\)/);
  assert.match(respostaDeEquipeCras('técnico do bairro Pricumã').texto, /Cléo Sousa/);
  assert.match(respostaDeEquipeCras('pedagoga do Centenário').texto, /Susy Andrade/);
  assert.match(respostaDeEquipeCras('quem atende o Jóquei Clube no CRAS Cristiana?').texto, /Paloma de Assis/);
  assert.match(respostaDeEquipeCras('técnica de Tancredo Neves').texto, /Marina Silvestre/);
  assert.match(respostaDeEquipeCras('referência técnica da Asa Branca').texto, /Rafaela Garcia/);
});
test('psicóloga e assistente social: avisa quando o técnico do bairro é de outra categoria', () => {
  assert.doesNotMatch(respostaDeEquipeCras('psicóloga do CRAS Cristiana no Caimbé').texto, /Não consta/);
  assert.match(respostaDeEquipeCras('assistente social do Buritis').texto, /Não consta assistente social/);
});
test('bairros sem técnico fixo vão para a equipe volante; Marechal Rondon não inventa técnico', () => {
  const v = respostaDeEquipeCras('quem atende o 13 de Setembro no CRAS Cristiana?');
  assert.match(v.texto, /equipe volante/); assert.match(v.texto, /Danilo Braga/); assert.match(v.texto, /Paulo Xavier/);
  assert.match(respostaDeEquipeCras('psicólogo de referência da Professora Araceli Souto Maior').texto, /equipe volante/);
  const m = respostaDeEquipeCras('assistente social do bairro Marechal Rondon');
  assert.match(m.texto, /não traz técnico/); assert.doesNotMatch(m.texto, /Fernanda|Cléo|Marina|Susy|Paloma|Rafaela/);
});
test('equipe completa, por função e por pessoa', () => {
  const t = respostaDeEquipeCras('quais os técnicos do CRAS Cristiana Vicente Nunes').texto;
  for (const n of ['Fernanda Gomes', 'Cléo Sousa', 'Marina Silvestre', 'Susy Andrade', 'Paloma de Assis', 'Rafaela Garcia', 'Keomara Teles', 'Danilo Braga', 'Paulo Xavier']) assert.match(t, new RegExp(n));
  const p = respostaDeEquipeCras('quais os psicólogos do CRAS Cristiana').texto;
  assert.match(p, /Fernanda/); assert.match(p, /Danilo/); assert.doesNotMatch(p, /Cléo/);
  assert.match(respostaDeEquipeCras('Fernanda Gomes atende quais bairros').texto, /Buritis e Caimbé/);
  assert.match(respostaDeEquipeCras('equipe volante do CRAS Cristiana').texto, /Keomara Teles/);
});
test('outro CRAS ou pergunta sem bairro: não inventa nome', () => {
  assert.equal(respostaDeEquipeCras('técnico do Buritis no CRAS Cauamé').tipoEquipe, 'nao-consta');
  assert.equal(respostaDeEquipeCras('quem é o técnico do meu bairro?').tipoEquipe, 'pergunta');
  assert.equal(respostaDeEquipeCras('qual o endereço do CRAS?'), null);
  assert.equal(respostaDeEquipeCras('como funciona o PAIF com psicólogo?'), null);
});
test('pergunta de UBS/CAPS não é capturada pela equipe do CRAS, e a de técnico não vira UBS', () => {
  assert.equal(respostaDeEquipeCras('qual UBS tem psicólogo no Buritis?'), null);
  assert.equal(respostaDeSaudeMentalTerritorio('psicóloga do CRAS no Buritis'), null);
  assert.equal(respostaDeSaudeMentalTerritorio('qual UBS tem psicólogo no Buritis?').tipoSaude, 'ubs-psicologia');
});
test('UBS com psicólogo: Bernardo Alem (informação de campo) e grafia Araceli', () => {
  const v = respostaDeSaudeMentalTerritorio('qual UBS tem psicólogo no bairro Vila Jardim?');
  assert.equal(v.tipoSaude, 'ubs-psicologia'); assert.match(v.texto, /Bernardo Alem/); assert.match(v.texto, /informação de campo/);
  const c = respostaDeSaudeMentalTerritorio('UBS com psicólogo no Cidade Satélite').texto;
  assert.match(c, /Hélio Macedo/); assert.match(c, /Bernardo Alem/);
  assert.match(respostaDeSaudeMentalTerritorio('UBS psicólogo Araceli Souto Maior').texto, /UBS Asa Branca/);
  // UBS do bairro sem psicólogo (Pricumã, Liberdade, 13 de Setembro...) continua apontando a UBS Buritis da macroárea 6
  assert.match(respostaDeSaudeMentalTerritorio('qual UBS tem psicólogo no Pricumã?').texto, /UBS Buritis/);
});
test('dados espelham js/equipe-cras-cristiana.js do Argo, se a pasta do Argo estiver ao lado', (t) => {
  let src; try { src = readFileSync(new URL('../../Projeto-Argo-SUAS-main/js/equipe-cras-cristiana.js', import.meta.url), 'utf8'); } catch { return t.skip('Argo não está ao lado'); }
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.E = EQUIPE_CRAS_CRISTIANA;', ctx);
  const E = JSON.parse(JSON.stringify(ctx.E));
  assert.deepEqual(equipeCrasCristiana.fixedTeam, E.fixedTeam);
  assert.deepEqual(equipeCrasCristiana.volanteTeam, E.volanteTeam);
  assert.deepEqual(equipeCrasCristiana.fixedCoverage.filter(b => b !== 'Araceli Souto Maior'), E.fixedCoverage.filter(b => !/Araceli/.test(b)));
});
