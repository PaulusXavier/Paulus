import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lerPedidoDePdf, respostaDePdf, resolverPaginasPdf, lerPaginasPdf, listaPaginasPdf } from '../shared/pdf.mjs';
import { juntar } from '../scripts/build.mjs';
import { carregarPDFLib } from './pdflib-carregar.mjs';
import { lerHabilidade, escolherHabilidades } from '../shared/habilidades.mjs';

const PDFLib = carregarPDFLib();
const { PDFDocument, StandardFonts } = PDFLib;

async function pdfComPaginas(n, rotulo = 'P') {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(rotulo + i, { x: 60, y: 760, size: 18, font: f });
  return new Uint8Array(await d.save());
}
async function pdfComFormulario() {
  const d = await PDFDocument.create(); const p = d.addPage([595, 842]); const fm = d.getForm();
  fm.createTextField('Nome completo').addToPage(p, { x: 60, y: 700, width: 300, height: 22 });
  fm.createTextField('Cidade').addToPage(p, { x: 60, y: 650, width: 200, height: 22 });
  fm.createCheckBox('Recebe benefício').addToPage(p, { x: 60, y: 600, width: 16, height: 16 });
  const dd = fm.createDropdown('Bairro'); dd.addOptions(['Centro', 'Caranã']); dd.addToPage(p, { x: 60, y: 510, width: 150, height: 22 });
  return new Uint8Array(await d.save());
}
const abrir = (r, i = 0) => PDFDocument.load(r.arquivos[i].bytes);
const R = (t, arqs) => respostaDePdf(t, arqs, { PDFLib });

test('pdf: lê páginas em português (listas, faixas, última, pares, a partir de)', () => {
  const r = (t, total) => resolverPaginasPdf(lerPaginasPdf(t), total).indices.map(i => i + 1);
  assert.deepEqual(r('paginas 1 a 3 e 5', 8), [1, 2, 3, 5]);
  assert.deepEqual(r('a ultima pagina', 8), [8]);
  assert.deepEqual(r('as duas ultimas paginas', 8), [7, 8]);
  assert.deepEqual(r('paginas pares', 6), [2, 4, 6]);
  assert.deepEqual(r('a partir da pagina 6', 8), [6, 7, 8]);
  assert.match(resolverPaginasPdf(lerPaginasPdf('pagina 12'), 8).erro, /não existe.*8 páginas/);
  assert.equal(listaPaginasPdf([1, 2, 3, 5, 8, 9]), '1 a 3, 5 e 8 e 9');
});

test('pdf: só assume pedido de edição; pergunta sobre PDF segue para a IA', () => {
  for (const t of ['como junto dois pdfs?', 'o que é PDF/A?', 'você consegue editar pdf?', 'remover a página 2 do relatório', 'qual a diferença entre PDF e Word?']) assert.equal(lerPedidoDePdf(t, { temArquivo: false }), null, t);
  assert.ok(lerPedidoDePdf('remover a página 2 do pdf', { temArquivo: false }));
  assert.ok(lerPedidoDePdf('remover a página 2', { temArquivo: true }));
});

test('pdf: encadeia pedidos e entende aspas, graus e posição', () => {
  const p = lerPedidoDePdf('remova a página 2, gire a página 3 para a esquerda e numere as páginas no topo à direita', { temArquivo: true });
  assert.deepEqual(p.operacoes.map(o => o.op), ['remover', 'girar', 'numerar']);
  assert.equal(p.operacoes[1].graus, 270);
  assert.deepEqual(p.operacoes[2].pos, { v: 'sup', h: 'dir' });
  const q = lerPedidoDePdf('preencher o campo "Nome" com "Maria" e o campo "Cidade" com "Boa Vista"', { temArquivo: true });
  assert.deepEqual(q.operacoes[0].pares, [{ campo: 'Nome', valor: 'Maria' }, { campo: 'Cidade', valor: 'Boa Vista' }]);
  assert.equal(lerPedidoDePdf('girar todas as páginas 90 graus', { temArquivo: true }).operacoes[0].spec, null);
});

test('pdf: remove, extrai, gira e inverte páginas de verdade', async () => {
  const a = { nome: 'ficha.pdf', bytes: await pdfComPaginas(5) };
  let r = await R('remover as páginas 2 e 4', [a]);
  assert.ok(r.ok); assert.equal((await abrir(r)).getPageCount(), 3); assert.equal(r.arquivos[0].nome, 'ficha-editado.pdf');
  r = await R('extrair as páginas 4 a 5', [a]);
  assert.equal((await abrir(r)).getPageCount(), 2);
  r = await R('girar a página 2 90 graus', [a]);
  const d = await abrir(r); assert.equal(d.getPage(1).getRotation().angle, 90); assert.equal(d.getPage(0).getRotation().angle, 0);
  r = await R('inverter a ordem das páginas', [a]);
  assert.equal((await abrir(r)).getPageCount(), 5);
  assert.deepEqual((await R('mover a página 5 para o início', [a])).arquivos.length, 1);
});

test('pdf: remover todas as páginas ou página inexistente dá erro claro e não devolve arquivo', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(3) };
  let r = await R('remover a página 9', [a]); assert.equal(r.ok, false); assert.match(r.texto, /não existe/); assert.equal(r.arquivos.length, 0);
  r = await R('remover as páginas 1 a 3', [a]); assert.equal(r.ok, false); assert.match(r.texto, /todas as páginas/);
});

test('pdf: junta PDFs e fotos, divide em partes', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(2) }, b = { nome: 'b.pdf', bytes: await pdfComPaginas(3) };
  let r = await R('juntar os pdfs', [a, b]);
  assert.equal((await abrir(r)).getPageCount(), 5); assert.equal(r.arquivos[0].nome, 'a-unido.pdf');
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  r = await R('transformar as fotos em pdf', [{ nome: 'foto.png', bytes: png }]);
  assert.equal((await abrir(r)).getPageCount(), 1);
  r = await R('dividir a cada 2 páginas', [{ nome: 'b.pdf', bytes: b.bytes }]);
  assert.equal(r.arquivos.length, 2); assert.deepEqual(r.arquivos.map(x => x.paginas), [2, 1]);
  r = await R('dividir o pdf na página 1', [b]);
  assert.deepEqual(r.arquivos.map(x => x.paginas), [1, 2]);
});

test('pdf: numera, carimba e coloca marca d’água, inclusive em página girada, com acento', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(3) };
  let r = await R('girar a página 2 90 graus e numerar as páginas', [a]);
  assert.ok(r.ok); assert.match(r.texto, /Numerei todas as páginas/);
  r = await R('colocar marca d\'água "CÓPIA" em todas as páginas', [a]); assert.ok(r.ok);
  r = await R('escrever "Recebido em {data} – coração" na página 1 no topo', [a]); assert.ok(r.ok); assert.match(r.texto, /Recebido em \d\d\/\d\d\/\d{4}/);
  assert.ok(r.arquivos[0].bytes.length > a.bytes.length);
});

test('pdf: lista, preenche, marca e trava campos de formulário', async () => {
  const f = { nome: 'ficha.pdf', bytes: await pdfComFormulario() };
  let r = await R('listar os campos do pdf', [f]);
  assert.equal(r.arquivos.length, 0); assert.match(r.texto, /Nome completo \[texto\]/); assert.match(r.texto, /Bairro \[lista suspensa\] \(opções: Centro, Caranã\)/);
  r = await R('preencher o campo "Nome completo" com "Maria de Souza"; preencher cidade com "Boa Vista"; marcar "Recebe benefício"; preencher bairro com "Caranã"', [f]);
  assert.ok(r.ok, r.texto);
  const form = (await abrir(r)).getForm();
  assert.equal(form.getTextField('Nome completo').getText(), 'Maria de Souza');
  assert.equal(form.getTextField('Cidade').getText(), 'Boa Vista');
  assert.equal(form.getCheckBox('Recebe benefício').isChecked(), true);
  assert.deepEqual(form.getDropdown('Bairro').getSelected(), ['Caranã']);
  r = await R('preencher o campo "Nome completo" com "José" e travar o formulário', [f]);
  assert.equal((await abrir(r)).getForm().getFields().length, 0);
  r = await R('preencher o campo "Telefone" com "1"', [f]);
  assert.equal(r.ok, false); assert.match(r.texto, /Não achei o campo "Telefone".*Nome completo/);
  r = await R('preencher o campo "Nome" com "Ana"', [{ nome: 'x.pdf', bytes: await pdfComPaginas(1) }]);
  assert.equal(r.ok, false); assert.match(r.texto, /não tem campos/);
});

test('pdf: assinatura escaneada entra como imagem na última página; sem imagem pede a imagem', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(3) };
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  let r = await R('colocar a assinatura no canto inferior direito', [a, { nome: 'ass.png', bytes: png }]);
  assert.ok(r.ok, r.texto); assert.match(r.texto, /última página/);
  r = await R('colocar a assinatura no canto inferior direito', [a]);
  assert.equal(r.ok, false); assert.match(r.texto, /anexe também a imagem/);
});

test('pdf: título e autor; salvar como; sem arquivo pede o PDF', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(2) };
  let r = await R('definir o título "Relatório 2026" e o autor "Paulo"; salvar como "relatorio final"', [a]);
  const d = await abrir(r); assert.equal(d.getTitle(), 'Relatório 2026'); assert.equal(d.getAuthor(), 'Paulo'); assert.equal(r.arquivos[0].nome, 'relatorio final.pdf');
  r = await R('remover a página 2 do pdf', []);
  assert.equal(r.precisaArquivo, true); assert.match(r.texto, /anexe o arquivo/);
});

test('pdf: o que não faz é dito com franqueza (tarja, texto existente, senha, compressão)', async () => {
  const a = { nome: 'a.pdf', bytes: await pdfComPaginas(2) };
  for (const [t, re] of [['tarjar o CPF do pdf', /não apaga o texto/], ['comprimir o pdf', /Comprimir/], ['colocar senha no pdf', /senha/], ['mudar o texto do pdf', /texto que já está/], ['assinar digitalmente o pdf', /certificado/]]) {
    const r = await R(t, [a]);
    assert.equal(r.ok, false, t); assert.match(r.texto, re, t); assert.equal(r.arquivos.length, 0);
  }
});

test('pdf: arquivo ruim ou com senha não derruba nada', async () => {
  const r = await R('remover a página 1', [{ nome: 'lixo.pdf', bytes: new Uint8Array([1, 2, 3]) }]);
  assert.equal(r.ok, false); assert.match(r.texto, /Ignorei/);
});

test('pdf (navegador): Paulus.perguntar edita no aparelho, não chama rede e não deixa o pedido no histórico', async () => {
  const chamadas = [];
  const sandbox = { self: {}, fetch: async (...a) => { chamadas.push(a); throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true }, PDFLib, Uint8Array, ArrayBuffer };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'anona', endpoint: 'https://x.exemplo.workers.dev', conhecimento: [], PDFLib, minIntervaloMs: 0 });
  const bytes = await pdfComFormulario();
  const r = await P.perguntar('preencher o campo "Nome completo" com "Maria Souza" e o campo "Cidade" com "Boa Vista"', { arquivos: [{ nome: 'ficha.pdf', bytes }] });
  assert.equal(r.tipo, 'pdf'); assert.equal(r.ok, true, r.texto); assert.equal(r.arquivos.length, 1);
  assert.equal(chamadas.length, 0);
  assert.ok(!JSON.stringify(r).includes('Maria Souza'));
  const sem = await P.perguntar('juntar os pdfs');
  assert.equal(sem.tipo, 'pdf'); assert.equal(sem.precisaArquivo, true);
  // pergunta comum continua nos outros caminhos
  const c = await P.perguntar('o que é PDF/A?', { semAcoes: true });
  assert.notEqual(c.tipo, 'pdf');
  // dado pessoal sem ser pedido de PDF continua bloqueado
  assert.equal((await P.perguntar('Maria Souza CPF 123.456.789-09 recebe bolsa?')).tipo, 'bloqueio');
});

test('pdf: habilidade ensina como pedir e é escolhida para perguntas sobre editar PDF', () => {
  const md = readFileSync(new URL('../habilidades/pdf-editar-no-aparelho.md', import.meta.url), 'utf8');
  const h = lerHabilidade(md, 'pdf-editar-no-aparelho.md');
  const esc = escolherHabilidades([h], 'como faço para juntar pdf e remover página?', [], 'anona');
  assert.equal(esc.length, 1);
  assert.equal(escolherHabilidades([h], 'o que é o CRAS?', [], 'anona').length, 0);
});
