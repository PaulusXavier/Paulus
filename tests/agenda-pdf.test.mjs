import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.self = globalThis;
globalThis.window = globalThis;
await import('../vendor/jspdf.umd.min.js');
const { selecionarAnotacoes, gerarPdfAnotacoes, nomeArquivoAnotacoes, rotuloDia, textoSeguro, AVISO_LGPD } = await import('../console/agenda-pdf.mjs');

const dias = {
  '2026-11-10': [
    { text: 'Visita ao 13 de Setembro', time: '14:00', cat: 'visita', done: true },
    { text: 'Reunião de equipe 😀', time: '08:30', cat: 'reuniao' },
    { text: 'Sem hora', cat: 'inventado' },
    { text: '   ' }
  ],
  '2026-12-01': [{ text: 'Prazo do relatório', cat: 'prazo' }],
  '2026-11-02': [],
  'lixo': [{ text: 'não entra' }]
};

test('seleciona por mês, ordena por hora (sem hora por último) e ignora vazios e chaves inválidas', () => {
  const todos = selecionarAnotacoes(dias);
  assert.deepEqual(todos.map((g) => g.chave), ['2026-11-10', '2026-12-01']);
  assert.deepEqual(todos[0].itens.map((i) => i.hora), ['08:30', '14:00', '']);
  assert.equal(todos[0].itens[0].texto, 'Reunião de equipe'); // emoji sai
  assert.equal(todos[0].itens[1].concluida, true);
  assert.equal(todos[0].itens[2].tipo, ''); // categoria desconhecida não vira rótulo
  assert.deepEqual(selecionarAnotacoes(dias, { mes: 11, ano: 2026 }).map((g) => g.chave), ['2026-12-01']);
  assert.deepEqual(selecionarAnotacoes(dias, { mes: 0, ano: 2026 }), []);
});

test('rótulos e nome de arquivo', () => {
  assert.equal(rotuloDia('2026-11-10'), 'Terça-feira, 10 de novembro de 2026');
  assert.equal(nomeArquivoAnotacoes({ mes: 2 }, ['2026']), 'anotacoes-agenda-marco-2026.pdf');
  assert.equal(nomeArquivoAnotacoes({}, ['2026', '2027']), 'anotacoes-agenda-2026-2027.pdf');
  assert.equal(textoSeguro('a\u0000b ★ c'), 'a b c');
});

test('gera PDF válido com aviso de LGPD; sem anotações devolve aviso legível; nota enorme pagina sem estourar', () => {
  const r = gerarPdfAnotacoes(dias, { jsPDF: globalThis.jspdf.jsPDF, escopo: {} });
  assert.equal(r.ok, true);
  assert.equal(r.totalAnotacoes, 4);
  assert.equal(new TextDecoder().decode(new Uint8Array(r.bytes).slice(0, 5)), '%PDF-');
  assert.match(AVISO_LGPD, /LGPD/);
  assert.equal(gerarPdfAnotacoes(dias, { jsPDF: globalThis.jspdf.jsPDF, escopo: { mes: 5, ano: 2026 } }).ok, false);
  assert.throws(() => gerarPdfAnotacoes(dias, {}), /biblioteca local/);
  const longa = { '2026-11-11': [{ text: Array.from({ length: 400 }, (_, i) => `linha ${i} com bastante texto para quebrar`).join('\n'), cat: 'grupo' }] };
  const g = gerarPdfAnotacoes(longa, { jsPDF: globalThis.jspdf.jsPDF });
  assert.equal(g.ok, true);
  assert.ok(g.totalPaginas >= 5);
  const muitos = {};
  for (let d = 1; d <= 28; d++) muitos[`2026-10-${String(d).padStart(2, '0')}`] = [{ text: 'a', time: '09:00' }, { text: 'b' }];
  assert.equal(gerarPdfAnotacoes(muitos, { jsPDF: globalThis.jspdf.jsPDF, escopo: { mes: 9, ano: 2026 } }).ok, true);
});
