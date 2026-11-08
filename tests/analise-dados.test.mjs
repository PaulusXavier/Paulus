// Análise de dados com Python e R : o Paulus escreve o código, a pessoa roda no próprio computador e os dados dela não passam por ele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';

const lista = lerTodas();
const ids = (q, anteriores = []) => escolherHabilidades(lista, q, anteriores, 'argo').map(h => h.id);
const NOVAS = ['analise-dados-planejar', 'analise-dados-medidas', 'analise-dados-cruzar-bases', 'automatizar-tarefas-python-r'];

test('as habilidades de análise existem, cabem no teto e produzem texto longo', () => {
  for (const id of NOVAS) {
    const h = lista.find(x => x.id === id);
    assert.ok(h, id);
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, id);
    assert.equal(h.texto, true, id + ' traz código, então a resposta pode ser mais longa');
  }
});

test('o pedido certo carrega a habilidade certa', () => {
  const casos = [
    ['quero analisar minha planilha de atendimentos do CRAS', 'analise-dados-planejar'],
    ['como analisar os dados do convivência?', 'analise-dados-planejar'],
    ['me ajuda a fazer um script para planilha de presença', 'analise-dados-planejar'],
    ['preciso cruzar a lista do bolsa família com a do SCFV', 'analise-dados-cruzar-bases'],
    ['como comparar duas planilhas e achar duplicados', 'analise-dados-cruzar-bases'],
    ['qual medida usar: média ou mediana da renda?', 'analise-dados-medidas'],
    ['como calcular a taxa por mil de famílias por bairro', 'analise-dados-medidas'],
    ['como juntar planilhas de vários meses com python', 'automatizar-tarefas-python-r'],
    ['quero agendar script para rodar todo mês', 'automatizar-tarefas-python-r']
  ];
  for (const [q, esperado] of casos) assert.ok(ids(q).includes(esperado), q + ' -> ' + ids(q).join(', '));
});

test('as habilidades de ensino continuam sendo escolhidas para quem quer aprender', () => {
  assert.ok(ids('como aprender python').includes('dados-python-visao-geral'));
  assert.ok(ids('erro no python keyerror').includes('dados-python-erros-ajuda'));
  assert.ok(ids('como instalar o tidyverse e o rstudio').some(i => i.startsWith('dados-r-')));
  assert.ok(!ids('como aprender python').some(i => NOVAS.includes(i)));
});

test('toda habilidade de análise oferece Python e R e mantém os dados no computador da pessoa', () => {
  for (const id of ['analise-dados-planejar', 'analise-dados-cruzar-bases', 'automatizar-tarefas-python-r']) {
    const t = lista.find(x => x.id === id).instrucoes;
    assert.match(t, /pandas|Python/, id);
    assert.match(t, /\bR\b|dplyr|tidyverse|readxl/, id);
    assert.match(t, /computador do serviço/, id + ' deve dizer onde o código roda');
    assert.match(t, /não vê|nunca|não analise/i, id + ' deve proibir dado real de família no chat');
  }
});

test('o roteiro de cruzar bases protege a chave e não vira lista de cobrança', () => {
  const t = lista.find(x => x.id === 'analise-dados-cruzar-bases').instrucoes;
  assert.match(t, /NIS e CPF/);
  assert.match(t, /TEXTO/);
  assert.match(t, /anti_join/);
  assert.match(t, /left_only/);
  assert.match(t, /não para cobrar nem punir/);
});

test('o roteiro de medidas manda dizer o denominador e não fazer conta de cabeça', () => {
  const t = lista.find(x => x.id === 'analise-dados-medidas').instrucoes;
  assert.match(t, /denominador/);
  assert.match(t, /sem conta de cabeça/);
  assert.match(t, /Associação não é causa/);
  assert.match(t, /menos de 5/);
});
