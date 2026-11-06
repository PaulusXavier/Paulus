import test from 'node:test';
import assert from 'node:assert/strict';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const lista = lerTodas();
const cras = lista.filter((h) => h.id.startsWith('cras-'));
const id = (q, app = 'argo') => escolherHabilidades(lista, q, [], app).map((h) => h.id);

test('CRAS: os roteiros sobre a unidade existem, cabem no limite e não têm dado pessoal nem número de lei', () => {
  assert.ok(cras.length >= 36, 'esperava ao menos 36 roteiros cras-*, achei ' + cras.length);
  for (const h of cras) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/\bart(igo|\.)\s*\d/i.test(h.instrucoes), h.id + ' cita artigo (isso vem das fontes)');
    assert.ok(!/\b(lei|decreto|portaria|resolu[cç][aã]o)\s*(cnas\s*)?(n[ºo°.]?\s*)?\d/i.test(h.instrucoes), h.id + ' cita número de norma (isso vem das fontes)');
  }
});

test('CRAS: nenhum gatilho novo é de uma palavra só, salvo sigla específica', () => {
  for (const h of cras) for (const g of h.gatilhos) {
    if (g.length < 2) assert.deepEqual(g, ['tsft'], h.id + ' tem gatilho de uma palavra: ' + g.join(' '));
  }
});

test('CRAS: cada pergunta chama o roteiro certo', () => {
  const casos = [
    ['para que serve o CRAS?', 'cras-visao-geral'],
    ['o que o CRAS oferece para as famílias?', 'cras-servicos-ofertados'],
    ['o que é território de abrangência?', 'cras-territorio-referenciamento'],
    ['quantos técnicos precisa ter um CRAS?', 'cras-equipe-referencia'],
    ['quais as atribuições do coordenador do CRAS?', 'cras-coordenacao'],
    ['como deve ser o espaço físico do CRAS?', 'cras-estrutura-fisica'],
    ['o CRAS funciona à noite?', 'cras-funcionamento-minimo'],
    ['como organizar a recepção do CRAS?', 'cras-recepcao-fluxo'],
    ['a pessoa pede cesta básica no CRAS, o que fazer?', 'cras-demandas-frequentes'],
    ['o CRAS concede BPC?', 'cras-limites-competencias'],
    ['como usar as listas da vigilância socioassistencial no CRAS?', 'cras-vigilancia-busca-ativa'],
    ['como funciona o CRAS itinerante?', 'cras-equipes-volantes-itinerante'],
    ['quando encaminhar do CRAS para o CREAS?', 'cras-fluxo-creas'],
    ['como preencher o censo SUAS do CRAS?', 'cras-censo-suas-rma'],
    ['como funciona o piso básico fixo?', 'cras-financiamento'],
    ['meu CRAS está sobrecarregado, falta técnico', 'cras-demanda-reprimida'],
    ['comecei a trabalhar no CRAS, por onde começar?', 'cras-novo-trabalhador'],
    ['qual o papel do CMAS?', 'cras-participacao-controle-social'],
    ['como é o CRAS em Roraima?', 'cras-roraima-contexto'],
    ['como explicar o CRAS para a família?', 'cras-explicar-para-familia'],
    ['o que significa PAIF?', 'cras-glossario-siglas'],
    ['como surgiu o CRAS?', 'cras-historia-suas'],
    ['me ajuda com o relatório de atividades do CRAS', 'cras-relatorio-atividades'],
    ['como montar o plano de ação do CRAS?', 'cras-plano-de-acao'],
    ['qual o papel do psicólogo no CRAS?', 'cras-profissionais-papeis'],
    ['quais as seguranças afiançadas e como aparecem no CRAS?', 'cras-segurancas-afiancadas'],
    ['como aplicar a universalidade e a equidade no CRAS?', 'cras-principios-diretrizes'],
    ['como organizar o SCFV referenciado ao CRAS?', 'cras-scfv-no-territorio'],
    ['me dá casos práticos do CRAS', 'cras-casos-praticos'],
    ['quero estudar para concurso sobre o CRAS, faz perguntas', 'cras-estudo-perguntas'],
    ['como articular o CRAS e a escola?', 'cras-saude-educacao-garantia-direitos'],
    ['como evitar clientelismo no CRAS?', 'cras-etica-no-atendimento'],
    ['como fazer educação permanente da equipe do CRAS?', 'cras-gestao-trabalho-formacao'],
    ['como avaliar a qualidade do CRAS?', 'cras-indicadores-qualidade'],
    ['como organizar a rotina semanal do CRAS?', 'cras-rotina-semanal'],
    ['posso usar WhatsApp no CRAS com as famílias?', 'cras-canais-digitais-lgpd'],
  ];
  for (const [pergunta, esperado] of casos) assert.ok(id(pergunta).includes(esperado), pergunta + ' -> ' + id(pergunta).join(', '));
});

test('CRAS: pergunta de diretório ou de definição curta não carrega roteiro', () => {
  for (const q of ['qual o horário do CRAS?', 'onde fica o CRAS do Cauamé?', 'telefone do CRAS', 'o que é o CRAS?', 'quanto é o valor do Bolsa Família?']) {
    assert.deepEqual(id(q).filter((x) => x.startsWith('cras-')), [], q);
  }
});

test('CRAS: o roteiro de Roraima só vale nos apps que conhecem o contexto', () => {
  assert.ok(id('como é o CRAS em Roraima?', 'argo').includes('cras-roraima-contexto'));
  assert.ok(!id('como é o CRAS em Roraima?', 'verbus').includes('cras-roraima-contexto'));
});
