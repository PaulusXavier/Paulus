// Psicometria: cada pergunta chama o roteiro certo, sem disparar em pergunta comum. Textos e números fictícios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';

const lista = lerTodas();
const psico = lista.filter((x) => x.id.startsWith('psicometria-'));
const ids = (q, app = 'argo') => escolherHabilidades(lista, q, [], app).map((h) => h.id);

test('psicometria: os 15 roteiros existem, cabem no teto e não dão veredito sobre pessoa', () => {
  assert.equal(psico.length, 15);
  for (const h of psico) {
    assert.ok(h.instrucoes.length > 500 && h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.ok(!/\bdiagnostique\b/i.test(h.instrucoes), h.id);
    assert.match(h.instrucoes, /pessoa real|dado de pessoa|dados de pessoa|SATEPSI|serviço|computador do serviço|diga/i, h.id + ' deve trazer o limite de uso');
  }
});

test('psicometria: a pergunta chama o roteiro certo', () => {
  const casos = [
    ['o que é psicometria?', 'psicometria-visao-geral'],
    ['quero aprender psicometria do zero', 'psicometria-visao-geral'],
    ['o que é o alfa de Cronbach e quando usar?', 'psicometria-confiabilidade'],
    ['como calcular o erro padrão de medida?', 'psicometria-confiabilidade'],
    ['o que são evidências de validade?', 'psicometria-validade'],
    ['qual a diferença entre validade convergente e discriminante?', 'psicometria-validade'],
    ['como transformar em escore T e percentil?', 'psicometria-escores-normas'],
    ['o que é análise fatorial exploratória?', 'psicometria-analise-fatorial'],
    ['quais índices de ajuste da análise fatorial confirmatória (CFI, RMSEA)?', 'psicometria-analise-fatorial'],
    ['me explica a teoria de resposta ao item', 'psicometria-tri'],
    ['como elaborar itens de uma escala?', 'psicometria-construcao-instrumento'],
    ['como fazer adaptação transcultural e retrotradução de escala?', 'psicometria-adaptacao-equidade'],
    ['o que é funcionamento diferencial do item?', 'psicometria-adaptacao-equidade'],
    ['como escolher ponto de corte e ler curva ROC?', 'psicometria-pontos-corte-triagem'],
    ['como ler um artigo de validação de instrumento?', 'psicometria-ler-artigo'],
    ['como calcular alfa de Cronbach no R?', 'psicometria-codigo-r'],
    ['como calcular alfa de Cronbach no Python?', 'psicometria-codigo-python'],
    ['quero fazer um questionário de satisfação com escala Likert no serviço', 'psicometria-escalas-do-servico'],
    ['o que significa construto em psicometria?', 'psicometria-glossario'],
    ['como estudar psicometria? que livros?', 'psicometria-trilha-estudo']
  ];
  for (const [q, esperado] of casos) assert.ok(ids(q).includes(esperado), q + ' -> ' + ids(q).join(', '));
});

test('psicometria: não dispara em pergunta comum nem rouba as outras habilidades', () => {
  for (const q of ['qual o horário do CRAS?', 'como funciona o Bolsa Família?', 'onde fica o CAPS?', 'como fazer visita domiciliar?', 'como escrever um relatório técnico?']) {
    assert.deepEqual(ids(q).filter((x) => x.startsWith('psicometria-')), [], q);
  }
  assert.ok(ids('como saber se um teste psicológico está no SATEPSI?').includes('avaliacao-psicologica-testes-satepsi'));
  assert.ok(ids('como fazer uma pesquisa de satisfação com questionário?').includes('analise-dados-pesquisa-questionario'));
});

test('psicometria: os roteiros de código oferecem só o seu idioma e mantêm os dados no computador da pessoa', () => {
  const r = lista.find((x) => x.id === 'psicometria-codigo-r').instrucoes;
  const py = lista.find((x) => x.id === 'psicometria-codigo-python').instrucoes;
  assert.match(r, /library\(psych\)/);
  assert.match(py, /pingouin/);
  for (const t of [r, py]) {
    assert.match(t, /computador do serviço/);
    assert.match(t, /Nunca peça dado de pessoa/);
  }
});
