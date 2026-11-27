// Relatórios do Bolsa Família no aparelho (porte do Anona): lê o relatório do MDS e compara dois meses, sem IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bfLerFamilias, bfCompararRecorrentes, bfAbasRedundantes, bfNomeAbaSeguro, bfIdentificador, bfPrepararDivisaoTecnicos, bfPrepararRelatoriosIndividuais } from '../shared/relatorios-bf.mjs';

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

test('divisão por técnico: ordena famílias, mantém integrantes juntos e reparte sobras pelas primeiras partes', () => {
  const continAna = ['PBF', '10/2026', '', '', '', '', '', 'Território Volante', '', 'Beto Lima', 'Bloqueio'];
  const volante = aba('Território Volante', [
    lin('10/2026', 1, '', 'Zoe Nunes', 'Centro', 'Território Volante', 'Zoe', 'Alerta'),
    lin('10/2026', 2, '', 'Diana Reis', 'Centro', 'Território Volante', 'Diana', 'Alerta'),
    lin('10/2026', 3, '', 'Ana Lima', 'Centro', 'Território Volante', 'Ana', 'Alerta'),
    continAna,
    lin('10/2026', 4, '', 'Carlos Souza', 'Centro', 'Território Volante', 'Carlos', 'Alerta'),
    lin('10/2026', 5, '', 'Beatriz Costa', 'Centro', 'Território Volante', 'Beatriz', 'Alerta')
  ]);
  const originalPrimeiroNis = volante.linhas[3][2];
  const resultado = bfPrepararDivisaoTecnicos([
    { nome: 'Resumo da divisão', linhas: [['Resumo'], ...CAB] },
    aba('Outra aba', [lin('10/2026', 99, '', 'Zzz', 'Centro', 'CRAS', 'Zzz', 'Alerta')]),
    volante
  ]);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.mesRepercussao, '10/2026');
  assert.equal(resultado.totalFamilias, 5);
  assert.equal(resultado.totalRegistros, 6);
  assert.equal(volante.linhas[3][2], originalPrimeiroNis, 'a função não altera as linhas de entrada');
  assert.equal(resultado.nomeArquivo, 'Território Volante - Divisão por técnico - 10-2026.xlsx');
  assert.deepEqual(resultado.tecnicos.map((t) => t.totalFamilias), [2, 2, 1]);
  assert.deepEqual(resultado.tecnicos.map((t) => t.faixa), ['A a B', 'C a D', 'Z a Z']);
  const [resumo, paulo, danilo, keomara] = resultado.abas;
  assert.equal(resumo.nome, 'Resumo da divisão');
  assert.equal(resumo.aoa[0][0], 'Técnico responsável');
  assert.equal(resumo.aoa[4][2], 5);
  assert.deepEqual(resumo.formulas, [{ celula: 'C5', f: 'SUM(C2:C4)', v: 5 }]);
  assert.deepEqual(paulo.aoa.slice(1).map((r) => r[4]), ['Ana Lima', 'Ana Lima', 'Beatriz Costa']);
  assert.equal(paulo.aoa[1][2], '00000000003', 'restaura zeros à esquerda no NIS numérico exportado');
  assert.deepEqual(danilo.aoa.slice(1).map((r) => r[4]), ['Carlos Souza', 'Diana Reis']);
  assert.deepEqual(keomara.aoa.slice(1).map((r) => r[4]), ['Zoe Nunes']);
});

test('divisão por técnico: prefere aba Território Volante, agrupa por CPF quando falta NIS e lê mês do topo', () => {
  const cpfCab = ['Programa', 'CPF do Responsável', 'Nome do Responsável Familiar', 'Efeito'];
  const cpfAba = { nome: 'Território Volante', linhas: [
    ['Período da Repercussão: 09/2026'], cpfCab,
    ['PBF', '00000000012', 'Ana Souza', 'Alerta'],
    ['PBF', '', '', 'Bloqueio']
  ] };
  const outra = aba('Planilha consolidada', [lin('09/2026', 100, '', 'Zzz', 'Centro', 'CRAS', 'Zzz', 'Alerta')]);
  const resultado = bfPrepararDivisaoTecnicos([outra, cpfAba]);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.totalFamilias, 1, 'as duas linhas com o mesmo CPF pertencem à mesma família');
  assert.equal(resultado.totalRegistros, 2);
  assert.equal(resultado.mesRepercussao, '09/2026');
  assert.deepEqual(resultado.tecnicos.map((t) => t.totalFamilias), [1, 0, 0]);
  assert.deepEqual(resultado.abas[1].aoa.slice(1).map((r) => r[2]), ['Ana Souza', 'Ana Souza']);
});

test('divisão por técnico: devolve motivos claros se não encontra tabela ou não há registos', () => {
  assert.equal(bfPrepararDivisaoTecnicos([{ nome: 'Dados', linhas: [['A', 'B'], ['1', '2']] }]).motivo, 'sem-tabela');
  assert.equal(bfPrepararDivisaoTecnicos([{ nome: 'Dados', linhas: [CAB] }]).motivo, 'sem-dados');
});

test('relatórios individuais: gera dados por técnico, herda campos da família e conta efeitos sem duplicar integrantes', () => {
  const cabPdf = ['Programa', 'Mês da Repercussão', 'NIS do Responsável Familiar (1)', 'CPF do Responsável', 'Nome do Responsável Familiar', 'Endereço', 'Bairro', 'Referência do endereço', 'NIS do Integrante(2)', 'Nome do Integrante', 'Motivo 1 (3)', 'Motivo 2 (3)', 'Efeito', 'Formação'];
  const periodo = ['Período da Repercussão: 10/2026'];
  const paulo = { nome: 'Paulo Xavier - Psicólogo', linhas: [periodo, cabPdf,
    ['PBF', '10/2026', 1, '', 'Ana Souza', 'Rua A, 10', 'Centro', 'Casa azul', 11, 'Ana Souza', 'Falta', '', 'Alerta', 'Psicólogo'],
    ['PBF', '', '', '', '', '', '', '', 12, 'Bia Souza', '', 'Renda', 'Bloqueio', 'Psicólogo'],
    ['PBF', '', '', '', '', '', '', '', 11, 'Ana Souza', 'Falta', '', 'Alerta', 'Psicólogo']
  ] };
  const danilo = { nome: 'Danilo Braga - Assistente Social', linhas: [cabPdf,
    ['PBF', '10/2026', 2, '', 'Caio Lima', 'Rua B, 20', 'Araceli', '', 21, 'Caio Lima', '', '', 'Suspensão', 'Assistente Social']
  ] };
  const resultado = bfPrepararRelatoriosIndividuais([
    { nome: 'Resumo da divisão', linhas: [['Técnico responsável', 'Total']] }, paulo, danilo
  ]);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.total, 2);
  const [rPaulo, rDanilo] = resultado.relatorios;
  assert.equal(rPaulo.tecnico, 'Paulo Xavier');
  assert.equal(rPaulo.formacao, 'Psicólogo');
  assert.equal(rPaulo.mes, '10/2026');
  assert.equal(rPaulo.totalFamilias, 1);
  assert.equal(rPaulo.totalRegistros, 2, 'a linha repetida do mesmo integrante é removida');
  assert.deepEqual(rPaulo.efeitos, [{ nome: 'Alerta', total: 1 }, { nome: 'Bloqueio', total: 1 }]);
  assert.equal(rPaulo.rows[1][1], '00000000001', 'NIS numérico do responsável mantém 11 dígitos');
  assert.equal(rPaulo.rows[1][rPaulo.headers.indexOf('Endereço')], 'Rua A, 10', 'os campos da família são herdados pelo segundo integrante');
  assert.equal(rDanilo.tecnico, 'Danilo Braga');
  assert.equal(rDanilo.formacao, 'Assistente Social');
  assert.equal(rDanilo.totalFamilias, 1);
  assert.equal(rDanilo.rows[0].at(-1), 'Suspensão');
});

test('relatórios individuais: erro explícito quando nenhuma aba tem efeito e registos', () => {
  const r = bfPrepararRelatoriosIndividuais([{ nome: 'Resumo', linhas: [['Resumo'], ['Total', 0] ] }]);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'sem-tabela');
});
