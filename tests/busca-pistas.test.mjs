// Pistas por assunto: pergunta sobre um público ou uma unidade sobe a referência técnica certa,
// sem tirar o dado de Censo/IBGE quando a pergunta é de número.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarIndice, buscarPergunta, K_PADRAO } from '../shared/busca.mjs';

const indice = criarIndice(JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8')));
const docs = (q) => buscarPergunta(indice, q, { k: K_PADRAO }).map((r) => r.trecho.doc);

test('busca por assunto: público e unidade chegam na referência técnica', () => {
  const casos = [
    ['o que faz o psicólogo no CRAS', 'cfp-ref-cras-2021'],
    ['como o psicólogo deve atuar no creas', 'cfp-ref-creas-2013'],
    ['atendimento a indígenas no CRAS', 'cfp-ref-povos-indigenas-2024'],
    ['trabalho com famílias indígenas no território', 'cfp-ref-povos-indigenas-2024'],
    ['comunidades quilombolas atendimento psicossocial', 'cfp-ref-quilombolas-2025'],
    ['pessoas privadas de liberdade atuação da psicologia', 'cfp-ref-prisional-2021'],
    ['o que é a RAPS', 'raps-guia-apoio'],
    ['regra de proteção do bolsa família', 'pbf-regra-protecao-retorno-revisao-2026'],
    ['paciente com hiv precisa de acompanhamento psicológico', 'cfp-ref-ist-hiv-aids-2020'],
    ['como fazer relatório de atendimento psicológico', 'cfp-avaliacao-psicologica-guia'],
    ['como orientar mães com bebê de até 6 anos', 'paif-trilha-4-primeira-infancia-2026']
  ];
  for (const [q, doc] of casos) assert.ok(docs(q).includes(doc), q + ' -> ' + docs(q).join(', '));
});

test('busca por assunto: família unipessoal acha o limite de unipessoais do Bolsa Família', () => {
  const d = docs('familia unipessoal bolsa familia');
  assert.ok(d.includes('lei-15077-2024-cadunico-bpc-pbf') || d.includes('decreto-12064-2024-resumo-por-tema'), d.join(', '));
});

test('busca por assunto: pergunta de número continua indo para o dado, não para a referência', () => {
  assert.equal(docs('quantos psicólogos tem nos CRAS de Boa Vista?')[0], 'censo-suas-2025-roraima-psicologos');
  assert.notEqual(docs('quantos indígenas vivem em Roraima')[0], 'cfp-ref-povos-indigenas-2024');
});
