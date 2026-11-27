// Relatórios do Bolsa Família no aparelho (porte do Anona): lê o relatório do MDS e compara dois meses, sem IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bfLerFamilias, bfCompararRecorrentes, bfAbasRedundantes, bfNomeAbaSeguro, bfIdentificador } from '../shared/relatorios-bf.mjs';

const CAB = ['Programa', 'Mês de repercussão', 'NIS do Responsável Familiar (1)', 'CPF do Responsável', 'Nome do Responsável Familiar', 'Endereço', 'Bairro', 'Técnico/equipe', 'NIS do Integrante(2)', 'Nome do Integrante', 'Efeito'];
const lin = (mes, nis, cpf, nome, bairro, tec, integ, efeito) => ['PBF', mes, nis, cpf, nome, 'Rua A, 1', bairro, tec, '', integ, efeito];
const aba = (nome, linhas) => ({ nome, linhas: [['Relatório de condicionalidades'], [], CAB, ...linhas] });

test('lê o cabeçalho depois das linhas de título, herda a família e junta integrantes', () => {
  const r = bfLerFamilias([aba('Dados', [
    lin('10/2026', 123, '', 'Ana Souza', 'Centro', 'Território Volante', 'Ana', 'Alerta'),
    lin('10/2026', '', '', '', '', 'Território Volante', 'Beto', 'Bloqueio'),
    lin('10/2026', '99999999999', '', 'Caio Lima', 'Pintolândia', 'Equipe volante', 'Caio', 'Alerta')
  ])]);
  assert.equal(r.mes, '10/2026');
  assert.equal(r.familias.size, 2);
  const ana = r.familias.get('00000000123');
  assert.equal(ana.registros, 2);
  assert.deepEqual(ana.integrantes, ['Ana (Alerta)', 'Beto (Bloqueio)']);
  assert.equal(ana.tecnico, '', 'rótulo genérico não vale como técnico');
});

test('número perde zero à esquerda: NIS/CPF voltam com 11 dígitos', () => {
  assert.equal(bfIdentificador(1234567890), '01234567890');
  assert.equal(bfIdentificador('abc'), 'abc');
});

test('arquivo dividido por técnico usa o nome da aba como técnico e ignora o resumo', () => {
  const r = bfLerFamilias([
    { nome: 'Resumo do território', linhas: [['x', 'y']] },
    aba('Paulo Xavier - Psicólogo', [lin('10/2026', '1', '', 'Ana', 'Centro', 'Território Volante', 'Ana', 'Alerta')]),
    aba('Danilo Braga - Assistente Social', [lin('10/2026', '2', '', 'Bia', 'Centro', 'Território Volante', 'Bia', 'Alerta')])
  ]);
  assert.equal(r.familias.get('1').tecnico, 'Paulo Xavier');
  assert.equal(r.familias.get('2').tecnico, 'Danilo Braga');
});

test('aba por CRAS que repete famílias da consolidada é descartada', () => {
  const fora = bfAbasRedundantes([
    { nome: 'Todos', nis: ['1', '2', '3'] }, { nome: 'CRAS 1', nis: ['1', '2'] }, { nome: 'Resumo', nis: [] }
  ]);
  assert.deepEqual(fora, ['CRAS 1']);
});

test('nome de aba: sem caracteres proibidos, 31 letras e sem repetir ignorando maiúsculas', () => {
  const u = new Set();
  assert.equal(bfNomeAbaSeguro('Ana/Maria: [x]', u), 'Ana Maria x');
  assert.equal(bfNomeAbaSeguro('ana maria x', u), 'ana maria x 2');
  assert.ok(bfNomeAbaSeguro('a'.repeat(50), u).length <= 31);
});

test('famílias recorrentes: casa por NIS ou CPF, separa quem mudou de técnico e monta fórmulas do resumo', () => {
  const ant = bfLerFamilias([
    aba('Paulo Xavier - Psi', [lin('09/2026', '1', '', 'Ana', 'Centro', '', 'Ana', 'Alerta'), lin('09/2026', '', '555', 'Dora', 'Centro', '', 'Dora', 'Alerta')]),
    aba('Danilo Braga - AS', [lin('09/2026', '2', '', 'Bia', 'Centro', '', 'Bia', 'Alerta'), lin('09/2026', '3', '', 'Eva', 'Centro', '', 'Eva', 'Alerta')])
  ]);
  const atu = bfLerFamilias([
    aba('Paulo Xavier - Psi', [lin('10/2026', '1', '', 'Ana', 'Centro', '', 'Ana', 'Bloqueio'), lin('10/2026', '2', '', 'Bia', 'Centro', '', 'Bia', 'Bloqueio')]),
    aba('Keomara Teles - Psi', [lin('10/2026', '', '555', 'Dora', 'Centro', '', 'Dora', 'Bloqueio')])
  ]);
  const r = bfCompararRecorrentes(ant, atu);
  assert.equal(r.ok, true);
  assert.equal(r.total, 3, 'Eva não repetiu');
  assert.equal(r.mudaram, 2, 'Bia (Danilo→Paulo) e Dora (Paulo→Keomara)');
  assert.deepEqual(r.tecnicos, ['Paulo Xavier'], 'só Ana ficou com o mesmo técnico');
  assert.equal(r.nomeArquivo, 'Famílias Recorrentes - 09-2026 e 10-2026.xlsx');
  const nomes = r.abas.map((a) => a.nome);
  assert.deepEqual(nomes, ['Resumo', 'Todas as famílias', 'Paulo Xavier', 'Mudaram de técnico']);
  const resumo = r.abas[0];
  assert.deepEqual(resumo.formulas.map((f) => f.celula), ['B3', 'B4', 'B7']);
  assert.equal(resumo.formulas[0].f, "COUNTA('Todas as famílias'!B:B)-1");
  assert.equal(r.abas[3].aoa[0].at(-1), 'Mudança de técnico');
  assert.match(r.abas[3].aoa[1].at(-1), /→/);
});

test('sem repetição ou sem arquivos: devolve motivo claro, sem estourar', () => {
  const a = bfLerFamilias([aba('D', [lin('09/2026', '1', '', 'Ana', 'C', '', 'Ana', 'Alerta')])]);
  const b = bfLerFamilias([aba('D', [lin('10/2026', '2', '', 'Bia', 'C', '', 'Bia', 'Alerta')])]);
  assert.equal(bfCompararRecorrentes(a, b).motivo, 'nenhuma');
  assert.equal(bfCompararRecorrentes(a, null).motivo, 'faltam-arquivos');
});
