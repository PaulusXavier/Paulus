import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarPDFLib } from './pdflib-carregar.mjs';
import {
  ABRIGOS, EFEITOS, MAX_ARQUIVOS, MAX_BYTES, CRONOGRAMAS_REPERCUSSAO_POR_ANO, anoVigente, cronogramaVigente,
  linhasCapa, montarRelatorioAbrigo, motivoRejeicao, nomeArquivoAbrigo, textoSeguroPdf
} from '../shared/relatorios-abrigos.mjs';

const PDFLib = carregarPDFLib();

async function folha(paginas = 1) {
  const d = await PDFLib.PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([595, 842]);
  return d.save();
}

test('abrigos e efeitos seguem a ordem do Anona', () => {
  assert.deepEqual(ABRIGOS, ['Rondon 1', 'Rondon 5', 'PRA', 'Tuaronoko']);
  assert.deepEqual(EFEITOS, ['Famílias em Alerta', 'Famílias em Bloqueio', 'Famílias Suspensas']);
});

test('usa o ano mais recente do cronograma e aceita um ano novo sem mexer no resto', () => {
  assert.equal(anoVigente(), 2026);
  const novo = { ...CRONOGRAMAS_REPERCUSSAO_POR_ANO, 2027: [{ mes: 'Março', educacaoRef: 'x', saudeRef: '—', dataLimite: '01/01/2027' }] };
  assert.equal(cronogramaVigente(novo).ano, 2027);
  assert.equal(cronogramaVigente(novo).meses.length, 1);
  assert.equal(cronogramaVigente({}).ano, null);
});

test('limites: só PDF, 60 arquivos e 80 MB no total', () => {
  const ok = { nome: 'a.pdf', tipo: 'application/pdf', tamanho: 1000 };
  assert.equal(motivoRejeicao(ok, { arquivos: 0, bytes: 0 }), null);
  assert.equal(motivoRejeicao({ nome: 'a.pdf', tipo: '', tamanho: 10 }, { arquivos: 0, bytes: 0 }), null);
  assert.match(motivoRejeicao({ nome: 'a.docx', tipo: '', tamanho: 10 }, { arquivos: 0, bytes: 0 }), /não é PDF/);
  assert.match(motivoRejeicao(ok, { arquivos: MAX_ARQUIVOS, bytes: 0 }), /limite de 60 arquivos/);
  assert.match(motivoRejeicao(ok, { arquivos: 1, bytes: MAX_BYTES }), /80 MB/);
});

test('texto seguro tira o que a Helvetica não desenha e mantém acentos', () => {
  assert.equal(textoSeguroPdf('Famílias — Saúde ✓\n😀'), 'Famílias — Saúde  ');
});

test('capa tem mês, referências, data limite e contagens', () => {
  const cron = CRONOGRAMAS_REPERCUSSAO_POR_ANO[2026][3];
  const linhas = linhasCapa({ abrigo: 'PRA', cronograma: cron, ano: 2026, contagens: [2, 0, 1] }).map((l) => l.texto);
  assert.ok(linhas.includes('Mês de repercussão: Setembro/2026'));
  assert.ok(linhas.some((t) => t.includes('1º Semestre de 2026')));
  assert.ok(linhas.some((t) => t.includes('29/10/2026')));
  assert.ok(linhas.includes('   Famílias em Alerta: 2'));
  assert.ok(linhas.includes('   Total: 3 famílias'));
});

test('nome do arquivo não tem caracteres proibidos', () => {
  assert.equal(nomeArquivoAbrigo('Rondon 1', { mes: 'Março' }, '27-11-2026'), 'Abrigo Rondon 1 - Repercussao Março - 27-11-2026.pdf');
});

test('monta o PDF: capa + divisória por efeito com folhas + folhas na ordem', async () => {
  const cron = CRONOGRAMAS_REPERCUSSAO_POR_ANO[2026][4];
  const grupos = [
    { efeito: EFEITOS[0], itens: [{ nome: 'a.pdf', bytes: await folha(2) }, { nome: 'b.pdf', bytes: await folha(1) }] },
    { efeito: EFEITOS[1], itens: [] },
    { efeito: EFEITOS[2], itens: [{ nome: 'c.pdf', bytes: await folha(3) }] }
  ];
  const r = await montarRelatorioAbrigo({ PDFLib, abrigo: 'Rondon 5', cronograma: cron, ano: 2026, grupos });
  assert.equal(r.total, 3);
  assert.deepEqual(r.contagens, [2, 0, 1]);
  assert.equal(r.paginasFolhas, 6);
  const doc = await PDFLib.PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), 1 + 1 + 3 + 1 + 3); // capa, divisória, 3 folhas, divisória, 3 folhas (Bloqueio vazio é pulado)
  assert.equal(new TextDecoder().decode(r.bytes.slice(0, 5)), '%PDF-');
  assert.match(doc.getTitle(), /Rondon 5/);
});

test('erros legíveis: sem mês, sem folhas e PDF inválido', async () => {
  const vazio = EFEITOS.map((efeito) => ({ efeito, itens: [] }));
  const cron = CRONOGRAMAS_REPERCUSSAO_POR_ANO[2026][0];
  await assert.rejects(montarRelatorioAbrigo({ PDFLib, abrigo: 'PRA', cronograma: null, ano: 2026, grupos: vazio }), /mês de repercussão/);
  await assert.rejects(montarRelatorioAbrigo({ PDFLib, abrigo: 'PRA', cronograma: cron, ano: 2026, grupos: vazio }), /pelo menos uma folha/);
  const ruim = [{ efeito: EFEITOS[0], itens: [{ nome: 'x.pdf', bytes: new Uint8Array([1, 2, 3]) }] }];
  await assert.rejects(montarRelatorioAbrigo({ PDFLib, abrigo: 'PRA', cronograma: cron, ano: 2026, grupos: ruim }), /Não consegui abrir o arquivo "x\.pdf"/);
});
