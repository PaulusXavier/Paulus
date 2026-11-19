// Excel no trabalho do serviço: o Paulus ensina e escreve a fórmula; a pessoa cola, testa e confere, e os dados dela não passam por ele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const lista = lerTodas();
const excel = lista.filter(h => h.id.startsWith('excel-'));
const ids = (q, anteriores = []) => escolherHabilidades(lista, q, anteriores, 'argo').map(h => h.id);
const texto = id => lista.find(h => h.id === id).instrucoes;

test('há 33 roteiros de Excel, dentro do teto, sem dado pessoal e sem marcação que quebre o prompt', () => {
  assert.ok(excel.length >= 33, 'roteiros de Excel: ' + excel.length);
  for (const h of excel) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.equal(h.texto, true, h.id + ' traz fórmula, então a resposta pode ser mais longa');
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação');
  }
});

test('o pedido certo carrega o roteiro certo', () => {
  const casos = [
    ['quero aprender excel do zero', 'excel-visao-geral'],
    ['como somar uma coluna no excel', 'excel-formulas-basicas'],
    ['como usar CONT.SES no excel para contar por bairro', 'excel-condicionais-somase-contse'],
    ['SOMASES excel com duas condições', 'excel-condicionais-somase-contse'],
    ['como fazer função se com e no excel', 'excel-se-e-ou'],
    ['meu procv dá erro #N/D', 'excel-procv-procx-indice'],
    ['qual a diferença entre procv e procx', 'excel-procv-procx-indice'],
    ['como separar nome e sobrenome no excel', 'excel-texto'],
    ['como manter zeros à esquerda do NIS no excel', 'excel-texto'],
    ['como calcular idade no excel com datadif', 'excel-datas-horas'],
    ['como calcular dias úteis no excel', 'excel-datas-horas'],
    ['como remover duplicados no excel', 'excel-limpeza-dados'],
    ['como criar uma tabela dinâmica', 'excel-tabela-dinamica'],
    ['minha tabela dinâmica não atualiza', 'excel-tabela-dinamica'],
    ['como fazer lista suspensa no excel', 'excel-validacao-formatacao-condicional'],
    ['como fazer gráfico de barras no excel', 'excel-graficos'],
    ['como usar a função filtro e único no excel 365', 'excel-matrizes-dinamicas-365'],
    ['como calcular desvio padrão no excel', 'excel-estatistica-basica'],
    ['excel mostra #VALOR! o que é', 'excel-erros-depuracao'],
    ['como usar power query para juntar planilhas de vários meses', 'excel-power-query'],
    ['como gravar uma macro no excel', 'excel-macros-vba'],
    ['me ajuda a criar uma planilha de presença do grupo no excel', 'excel-modelos-servico'],
    ['como colocar senha em planilha excel com dados de famílias', 'excel-dados-sensiveis-compartilhar'],
    ['quais os atalhos mais úteis do excel', 'excel-atalhos'],
    ['como imprimir excel em uma página e repetir cabeçalho', 'excel-impressao-relatorio'],
    ['qual a diferença entre excel e google planilhas', 'excel-google-planilhas-libreoffice'],
    ['preciso de uma fórmula para excel', 'excel-pedir-ao-paulus'],
    ['abri um csv no excel e os acentos ficaram errados', 'excel-importar-csv'],
    ['como calcular renda per capita no excel', 'excel-calculos-do-servico'],
    ['como usar somarproduto no excel', 'excel-formulas-avancadas'],
    ['como usar power pivot e dax no excel', 'excel-power-pivot-dax'],
    ['quando devo usar excel ou python', 'excel-escolher-ferramenta'],
    ['quero treinar excel com exercícios', 'excel-treino-exercicios'],
    ['como formatar planilha excel e não mesclar células', 'excel-formatacao-visual']
  ];
  for (const [q, esperado] of casos) assert.ok(ids(q).includes(esperado), q + ' -> ' + ids(q).join(', '));
});

test('pergunta que não é de Excel não carrega roteiro de Excel', () => {
  const comuns = [
    'como funciona o Bolsa Família', 'quem gere o Cadastro Único no município', 'como escrever um relatório técnico', 'como fazer visita domiciliar',
    'o que é o BPC', 'qual o prazo para recurso do descumprimento', 'quero analisar minha planilha de atendimentos do CRAS',
    'como cruzar a lista do bolsa família com a do SCFV', 'qual medida usar média ou mediana da renda', 'como aprender python',
    'como calcular a taxa por mil de famílias por bairro', 'como fazer a conta da renda per capita da família', 'como juntar planilhas com python',
    'como baixar a planilha do Sicon', 'como importar csv no r', 'quanto é 15% de 1200', 'o que é uma célula do corpo',
    'como combinar planilhas do anona', 'idade mínima para o BPC', 'prazo em dias úteis para resposta do ofício', 'como montar o PAF da família'
  ];
  for (const q of comuns) assert.deepEqual(ids(q).filter(i => i.startsWith('excel-')), [], q);
});

test('os roteiros de análise, R e Python continuam sendo escolhidos para o que é deles', () => {
  assert.ok(ids('quero analisar minha planilha de atendimentos do CRAS').includes('analise-dados-planejar'));
  assert.ok(ids('preciso cruzar a lista do bolsa família com a do SCFV').includes('analise-dados-cruzar-bases'));
  assert.ok(ids('como importar csv pandas').some(i => i.startsWith('dados-python-')));
  assert.ok(ids('como importar csv r').some(i => i.startsWith('dados-r-')));
});

test('o roteiro de pedir ajuda deixa claro que o Paulus não vê a planilha e barra dado real', () => {
  const t = texto('excel-pedir-ao-paulus');
  assert.match(t, /não vê o arquivo/);
  assert.match(t, /fictíci/);
  assert.match(t, /Dado real de família/);
  assert.match(t, /versão do Excel/);
});

test('o roteiro de visão geral traz a trilha e a regra de ouro da base', () => {
  const t = texto('excel-visao-geral');
  assert.match(t, /cinco degraus/);
  assert.match(t, /uma linha = um registro/);
  assert.match(t, /Dado real de família não entra no chat/);
});

test('PROCV: exige o FALSO, explica o #N/D e não vira lista de cobrança', () => {
  const t = texto('excel-procv-procx-indice');
  assert.match(t, /FALSO/);
  assert.match(t, /#N\/D/);
  assert.match(t, /não para cobrar nem punir|não para cobrar|cobrar nem punir/);
});

test('dados sensíveis: senha, ocultar e dinâmica não protegem como parecem', () => {
  const t = texto('excel-dados-sensiveis-compartilhar');
  assert.match(t, /não esconde nada/);
  assert.match(t, /Criptografar com Senha/);
  assert.match(t, /Inspecionar Documento/);
  assert.match(t, /Célula pequena/);
  assert.match(t, /nem para mim|chat de IA/);
});

test('cálculos do serviço: valor de linha de corte vem da norma, não da memória do Paulus', () => {
  const t = texto('excel-calculos-do-servico');
  assert.match(t, /norma vigente/);
  assert.match(t, /nunca escrita dentro da fórmula/);
  assert.match(t, /não chuta valor/);
});

test('o CSV avisa dos zeros, do UTF-8 e do limite de linhas', () => {
  const t = texto('excel-importar-csv');
  assert.match(t, /UTF-8/);
  assert.match(t, /zero à esquerda/);
  assert.match(t, /1\.048\.576/);
});

test('macros: avisa do risco, de testar em cópia e do que fica melhor em Python ou R', () => {
  const t = texto('excel-macros-vba');
  assert.match(t, /não tem Ctrl\+Z/);
  assert.match(t, /golpe/);
  assert.match(t, /Python ou R/);
});

test('o guia de apoio existe na base como material de apoio, com a tabela de funções', () => {
  const md = readFileSync(new URL('../knowledge/documentos/excel-guia-apoio.md', import.meta.url), 'utf8');
  assert.match(md, /^---\r?\ndoc: excel-guia-apoio/);
  assert.match(md, /tipo: apoio/);
  assert.match(md, /não é norma/);
  assert.match(md, /VLOOKUP = PROCV/);
  assert.match(md, /COUNTIFS|CONT\.SE\(S\)/);
  assert.match(md, /Não abre o arquivo/);
  const catalogo = JSON.parse(readFileSync(new URL('../knowledge/catalogo.json', import.meta.url), 'utf8'));
  assert.ok(catalogo.some(c => c.doc === 'excel-guia-apoio' && c.tipo === 'apoio'));
});
