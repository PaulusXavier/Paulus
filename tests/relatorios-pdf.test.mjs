import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.self = globalThis;
globalThis.window = globalThis;
await import('../vendor/jspdf.umd.min.js');
await import('../vendor/jszip.min.js');

const { bfPrepararDivisaoTecnicos, bfPrepararRelatoriosIndividuais } = await import('../shared/relatorios-bf.mjs');
const { gerarPdfRelatorioIndividual } = await import('../console/relatorio-individual-pdf.mjs');

const cabecalho = ['NIS do Responsável Familiar', 'Nome do Responsável Familiar', 'Endereço', 'Bairro', 'NIS do Integrante', 'Nome do Integrante', 'Efeito'];
const preparado = bfPrepararRelatoriosIndividuais([{
  nome: 'Paulo Xavier - Psicólogo',
  linhas: [cabecalho,
    ['00000000001', 'Ana Souza', 'Rua Santo Agostinho, 193', 'Centenário', '00000000011', 'Ana Souza', 'Alerta'],
    ['', '', '', '', '00000000012', 'Bia Souza', 'Bloqueio']
  ]
}]);

test('gera PDF local válido e inclui o ficheiro num ZIP sem servidor ou IA', async () => {
  assert.equal(preparado.ok, true);
  const { nomeArquivo, bytes } = gerarPdfRelatorioIndividual(preparado.relatorios[0], {
    jsPDF: globalThis.jspdf.jsPDF,
    incluirVisita: true
  });
  assert.match(nomeArquivo, /^Relatorio de Repercussao Individual - Paulo Xavier - 10\/2026\.pdf$|^Relatorio de Repercussao Individual - Paulo Xavier\.pdf$/);
  assert.ok(bytes.byteLength > 1000);
  assert.equal(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5)), '%PDF-');

  const zip = new globalThis.JSZip();
  zip.file(nomeArquivo, bytes);
  const bytesZip = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  assert.equal(new TextDecoder().decode(bytesZip.slice(0, 2)), 'PK');
  const reaberto = await globalThis.JSZip.loadAsync(bytesZip);
  assert.ok(reaberto.file(nomeArquivo));
  const pdfReaberto = await reaberto.file(nomeArquivo).async('uint8array');
  assert.equal(new TextDecoder().decode(pdfReaberto.slice(0, 5)), '%PDF-');
});

test('fluxo ponta a ponta: divide o Território Volante, gera um PDF por técnico e reabre o ZIP', async () => {
  const CAB = ['Programa', 'Mês de repercussão', 'NIS do Responsável Familiar (1)', 'CPF do Responsável', 'Nome do Responsável Familiar', 'Endereço', 'Bairro', 'Técnico/equipe', 'NIS do Integrante(2)', 'Nome do Integrante', 'Efeito'];
  const linha = (nis, nome, efeito) => ['PBF', '10/2026', nis, '', nome, 'Rua A, 1', 'Centro', 'Território Volante', '', nome, efeito];
  const divisao = bfPrepararDivisaoTecnicos([{
    nome: 'Território Volante',
    linhas: [['Período da Repercussão: 10/2026'], [], CAB,
      linha('1', 'Ana Lima', 'Alerta'),
      linha('2', 'Beatriz Costa', 'Bloqueio'),
      linha('3', 'Carlos Souza', 'Suspensão'),
      linha('4', 'Diana Reis', 'Alerta'),
      linha('5', 'Zoe Nunes', 'Bloqueio')
    ]
  }]);
  assert.equal(divisao.ok, true);
  assert.deepEqual(divisao.tecnicos.map((tecnico) => tecnico.totalFamilias), [2, 2, 1]);

  const relatorios = bfPrepararRelatoriosIndividuais(divisao.abas.map((aba) => ({ nome: aba.nome, linhas: aba.aoa })));
  assert.equal(relatorios.ok, true);
  assert.equal(relatorios.total, 3);
  const gerados = relatorios.relatorios.map((relatorio) => gerarPdfRelatorioIndividual(relatorio, {
    jsPDF: globalThis.jspdf.jsPDF,
    incluirVisita: true
  }));
  assert.equal(gerados.length, 3);
  assert.deepEqual(gerados.map((item) => item.nomeArquivo), [
    'Relatorio de Repercussao Individual - Paulo Xavier - 10-2026.pdf',
    'Relatorio de Repercussao Individual - Danilo Braga - 10-2026.pdf',
    'Relatorio de Repercussao Individual - Keomara Teles - 10-2026.pdf'
  ]);
  for (const item of gerados) {
    assert.ok(item.bytes.byteLength > 1000);
    assert.equal(new TextDecoder().decode(new Uint8Array(item.bytes).slice(0, 5)), '%PDF-');
  }

  const zip = new globalThis.JSZip();
  for (const item of gerados) zip.file(item.nomeArquivo, item.bytes);
  const bytesZip = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const reaberto = await globalThis.JSZip.loadAsync(bytesZip);
  assert.equal(Object.keys(reaberto.files).length, 3);
  for (const item of gerados) {
    const pdf = await reaberto.file(item.nomeArquivo).async('uint8array');
    assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-');
  }
});
