import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABA_RESUMO, adivinharMesAnoAbas, adivinharMesAnoNome, descobrirMesAno, organizarRepercussao, bairrosDaPlanilha,
  filtrarPorBairros, abasTecnicosGerais, prepararRelatoriosTecnicosGerais, montarAbasPlanilha, gruposDeOrganizada, dadosDeFiltrada, nomeArquivoOrganizada, nomeArquivoFiltrada, criarBackup, lerBackup, resumoArmazenamento
} from '../shared/planilhas-mds.mjs';

const HEADER = ['Nº da linha', 'Bairro', 'NIS do Responsável Familiar', 'Nome do Responsável Familiar', 'CPF do Responsável', 'Endereço', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11',
  'NIS do Integrante', 'Nome do Integrante', 'Efeito', 'Motivo 1', 'Motivo 2', 'c18'];
const pad = (l) => { const r = Array(HEADER.length).fill(''); l.forEach((v, i) => { r[i] = v; }); return r; };
const bruta = () => [{
  nome: 'Consolidado',
  linhas: [
    ['Programa Bolsa Família'], ['Período da Repercussão: Setembro/2026'], ['UF: RR'], ['linha qualquer'],
    HEADER,
    pad([1, 'BURITIS', 11111111111, 'Ana Souza', 22222222222, 'Rua A', '', '', '', '', '', '', 33333333333, 'Ana Souza', 'Alerta', 'Educação']),
    // integrante extra da mesma família (linha compacta: sem bairro, começa nas colunas do integrante)
    ['', '', '', '', '', '', '', '', '', '', '', '', 44444444444, 'Bia Souza', 'Alerta'],
    pad([2, 'Pricumã', 55555555555, 'Carla Lima', '', 'Rua B', '', '', '', '', '', '', 66666666666, 'Carla Lima', 'Bloqueio']),
    pad([3, 'Prof. Araceli Souto Maior', 77777777777, 'Dora Reis', '', 'Rua C', '', '', '', '', '', '', 88888888888, 'Dora Reis', 'Suspensão']),
    pad([4, 'Bairro Fantasma', 99999999999, 'Eva Dias', '', 'Rua D', '', '', '', '', '', '', 12121212121, 'Eva Dias', 'Alerta']),
    // mesmo integrante repetido: entra só uma vez
    pad([5, 'BURITIS', 11111111111, 'Ana Souza', 22222222222, 'Rua A', '', '', '', '', '', '', 33333333333, 'Ana Souza', 'Alerta'])
  ]
}];

test('adivinha mês e ano pelo nome do arquivo e pela planilha, sem confundir pedaços de palavras', () => {
  assert.deepEqual(adivinharMesAnoNome('Repercussao setembro 2026.xlsx'), { mes: 8, ano: 2026 });
  assert.deepEqual(adivinharMesAnoNome('Martins outros.xlsx'), { mes: null, ano: null });
  assert.deepEqual(adivinharMesAnoAbas(bruta()), { mes: 8, ano: 2026 });
  assert.deepEqual(descobrirMesAno([], 'rel_01112026.xlsx', new Date(2020, 0, 1)), { mes: 10, ano: 2026 });
  assert.deepEqual(descobrirMesAno([], 'nada.xlsx', new Date(2026, 4, 10)), { mes: 4, ano: 2026 });
});

test('organiza por técnico: mapa de bairros, integrante extra herda a família, repetido sai, bairro desconhecido é avisado', () => {
  const r = organizarRepercussao(bruta());
  assert.equal(r.ok, true);
  assert.deepEqual(r.grupos.map((g) => g.equipe), ['Fernanda Gomes', 'Cléo Sousa', 'Território Volante']); // ordem fixa da equipe
  const fer = r.grupos[0];
  assert.equal(fer.linhas.length, 2); // Ana e Bia; a repetida de Ana não entra
  assert.equal(fer.linhas[0][0], 'Buritis');
  assert.equal(fer.linhas[0][2], 'Psicóloga');
  assert.equal(fer.linhas[1][6], 'Ana Souza'); // 3 colunas novas + índice 3 do MDS (Nome do Responsável herdado da família)
  assert.deepEqual(r.bairrosNaoMapeados, [{ bairro: 'Bairro Fantasma', qtd: 1 }]);
  assert.equal(r.totalNaoMapeadas, 1);
  assert.ok(r.informacoes.includes('Período da Repercussão: Setembro/2026'));
  assert.equal(r.cabecalho[0], 'Bairro do território');
  assert.equal(r.grupos[2].linhas[0][0], 'Professora Araceli Souto Maior');
});

test('NIS e CPF numéricos recuperam o zero à esquerda (11 dígitos)', () => {
  const abas = bruta();
  abas[0].linhas[5][2] = 1234567; // NIS do responsável sem zeros
  const r = organizarRepercussao(abas);
  const col = r.cabecalho.findIndex((h) => h === 'NIS do Responsável Familiar');
  assert.equal(r.grupos[0].linhas[0][col], '00001234567');
});

test('planilha sem cabeçalho do MDS devolve erro legível', () => {
  const r = organizarRepercussao([{ nome: 'x', linhas: [['a', 'b']] }]);
  assert.equal(r.ok, false);
  assert.match(r.texto, /cabeçalho do relatório bruto/);
});

// planilha organizada como o Anona/Paulus guarda: Resumo + uma aba por técnico
function guardada() {
  const org = organizarRepercussao(bruta());
  return [
    { nome: ABA_RESUMO, linhas: [['Técnico/equipe'], [], ['INFORMAÇÕES DO RELATÓRIO'], ['CRAS Cristiana Vicente Nunes'], ['UF: RR']] },
    ...org.grupos.map((g) => ({ nome: g.equipe, linhas: [org.cabecalho, ...g.linhas] }))
  ];
}

test('lista bairros e filtra por bairro, preservando as informações do relatório', () => {
  const abas = guardada();
  assert.deepEqual(bairrosDaPlanilha(abas), ['Buritis', 'Pricumã', 'Professora Araceli Souto Maior']);
  const f = filtrarPorBairros(abas, ['Buritis']);
  assert.equal(f.ok, true);
  assert.equal(f.grupos.length, 1);
  assert.equal(f.grupos[0].nome, 'Fernanda Gomes');
  assert.equal(f.grupos[0].linhas.length, 2);
  assert.deepEqual(f.grupos[0].bairros, ['Buritis']);
  assert.equal(f.grupos[0].formacao, 'Psicóloga');
  assert.deepEqual(f.informacoes, ['INFORMAÇÕES DO RELATÓRIO', 'CRAS Cristiana Vicente Nunes', 'UF: RR']);
  assert.equal(filtrarPorBairros(abas, []).grupos.length, 3); // sem seleção, todos
  assert.equal(filtrarPorBairros(abas, ['Nenhum']).ok, false);
});

test('nomes de arquivo: organizada, _filtrada e _completa', () => {
  assert.equal(nomeArquivoOrganizada(8, 2026), 'Repercussão Setembro de 2026 (CRAS Cristiana).xlsx');
  assert.equal(nomeArquivoFiltrada('Repercussão Setembro.xlsx', ['Buritis']), 'Repercussão Setembro_filtrada.xlsx');
  assert.equal(nomeArquivoFiltrada('Repercussão Setembro.xlsx', []), 'Repercussão Setembro_completa.xlsx');
});

const b64 = 'A'.repeat(200);
test('backup: lê o do Anona e o do Paulus, valida campos e não duplica', () => {
  const rep = { id: 'local_1', filename: 'a<b>.xlsx', mes: 8, ano: 2026, uploadedAt: 5, dataBase64: b64 };
  const anona = JSON.stringify({ app: 'Anona', tipo: 'backup-repercussao', reports: [rep, { id: 'x', mes: 99, ano: 2026, dataBase64: b64 }, { id: 'y', mes: 1, ano: 2026, dataBase64: 'curto' }, { id: 'z', mes: 1, ano: 2026, dataBase64: '<script>' + b64 }] });
  const r = lerBackup(anona, []);
  assert.equal(r.ok, true);
  assert.equal(r.validos.length, 1);
  assert.equal(r.descartados, 3);
  assert.equal(r.validos[0].filename, 'ab.xlsx'); // caracteres perigosos saem
  assert.equal(r.validos[0].sizeKB, Math.round((200 * 3 / 4) / 1024));
  const de = criarBackup([r.validos[0]], new Date('2026-11-27T00:00:00Z'));
  assert.equal(de.app, 'Paulus');
  const volta = lerBackup(JSON.stringify(de), [{ id: 'local_1' }]);
  assert.equal(volta.novos.length, 0);
  assert.equal(volta.jaExistem, 1);
  assert.equal(lerBackup('{', []).ok, false);
  assert.equal(lerBackup('{"x":1}', []).ok, false);
  assert.equal(lerBackup(JSON.stringify([{ id: 'a', mes: 1, ano: 1999, dataBase64: b64 }]), []).ok, false);
});

test('resumo de armazenamento', () => {
  assert.equal(resumoArmazenamento([]).texto, '');
  assert.match(resumoArmazenamento([{ sizeKB: 1024 }, { sizeKB: 512 }]).texto, /2 planilha\(s\) guardada\(s\) neste aparelho · ~1,5 MB/);
});

test('técnicos gerais: um relatório por aba, sem Resumo e sem Território Volante', () => {
  const abas = guardada();
  assert.deepEqual(abasTecnicosGerais(abas).map((a) => a.nome), ['Fernanda Gomes', 'Cléo Sousa']);
  const r = prepararRelatoriosTecnicosGerais(abas);
  assert.equal(r.ok, true);
  assert.equal(r.relatorios.length, 2);
  assert.equal(prepararRelatoriosTecnicosGerais([{ nome: 'Território Volante', linhas: [] }, { nome: ABA_RESUMO, linhas: [] }]).ok, false);
});

test('monta a planilha: Resumo primeiro, fórmulas vivas, total, informações e cor por técnico; ida e volta com o filtro', () => {
  const org = organizarRepercussao(bruta());
  const { abas } = montarAbasPlanilha({ cabecalho: org.cabecalho, grupos: gruposDeOrganizada(org), informacoes: org.informacoes });
  assert.deepEqual(abas.map((a) => a.nome), [ABA_RESUMO, 'Fernanda Gomes', 'Cléo Sousa', 'Território Volante']);
  assert.equal(abas[0].tipo, 'resumo');
  assert.equal(abas[1].cor, '159947');
  assert.deepEqual(abas[0].aoa[1], ['Fernanda Gomes', 'Psicóloga', 'Buritis', 1, 2]);
  assert.equal(abas[0].formulas[0].f, "COUNTA('Fernanda Gomes'!A:A)-1");
  assert.equal(abas[0].formulas.at(-1).f, 'SUM(E2:E4)');
  assert.equal(abas[0].aoa[4][4], 4); // total
  assert.ok(abas[0].aoa.some((l) => l[0] === 'INFORMAÇÕES DO RELATÓRIO'));
  // o que o console grava e relê tem de ser aceito pelo filtro
  const relido = abas.map((a) => ({ nome: a.nome, linhas: a.aoa }));
  assert.deepEqual(bairrosDaPlanilha(relido), ['Buritis', 'Pricumã', 'Professora Araceli Souto Maior']);
  const f = filtrarPorBairros(relido, ['Pricumã']);
  const de = dadosDeFiltrada(f);
  const { abas: filtrada } = montarAbasPlanilha(de);
  assert.deepEqual(filtrada.map((a) => a.nome), [ABA_RESUMO, 'Cléo Sousa']);
  assert.ok(filtrada[0].aoa.some((l) => l[0] === 'CRAS Cristiana Vicente Nunes'));
});

test('técnicos gerais usam o mês guardado quando a aba não traz o mês', () => {
  const org = organizarRepercussao(bruta());
  const { abas } = montarAbasPlanilha({ cabecalho: org.cabecalho, grupos: gruposDeOrganizada(org), informacoes: org.informacoes });
  const r = prepararRelatoriosTecnicosGerais(abas.map((a) => ({ nome: a.nome, linhas: a.aoa })), { mesTexto: 'Setembro/2026' });
  assert.equal(r.ok, true);
  assert.equal(r.relatorios.length, 2);
  assert.ok(r.relatorios.every((x) => x.mes === 'Setembro/2026'));
  assert.deepEqual(r.relatorios.map((x) => x.tecnico), ['Fernanda Gomes', 'Cléo Sousa']);
});
