import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarPDFLib } from './pdflib-carregar.mjs';
import {
  ROTA_BLOCOS, ROTA_PARTIDA, ROTA_MAX_ARQUIVOS, ROTA_MAX_BYTES, extrairEndereco, linhasDeItens, quadroEndereco,
  enderecoDasPaginas, enderecoDoOcr, motivoRejeicaoRota, ordenarBloco, aprenderAjuste, linhasRoteiro, linhasCapaRota,
  montarPdfRota, nomeArquivoRota
} from '../shared/rota-folhas.mjs';

const PDFLib = carregarPDFLib();
const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

async function folha(paginas = 1) {
  const d = await PDFLib.PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([595, 842]);
  return d.save();
}

test('linhasDeItens agrupa por linha, de cima para baixo e da esquerda para a direita', () => {
  const l = linhasDeItens([item('Número:', 200, 700), item('Rua', 10, 700), item('Linha de baixo', 10, 650)]);
  assert.deepEqual(l, ['Rua Número:', 'Linha de baixo']);
});

test('lê o endereço do quadro com rótulos e restaura o número do Cadastro Único', () => {
  const e = extrairEndereco(['II - ENDEREÇO DA FAMÍLIA', 'Tipo de logradouro: RUA Nome: SANTO AGOSTINHO Número: 0000000000000193 Bairro: CENTENARIO']);
  assert.equal(e.rua, 'Rua Santo Agostinho');
  assert.equal(e.numero, '193');
  assert.equal(e.texto, 'Rua Santo Agostinho, 193 — Centenario');
});

test('lê campos numerados (Tipo, Título, Nome) e endereço livre', () => {
  const a = extrairEndereco(['1.12 - Tipo: AVENIDA 1.13 - Título: GENERAL 1.14 - Nome: SAMPAIO 1.15 - Número: 45']);
  assert.equal(a.rua, 'Avenida General Sampaio');
  assert.equal(a.numero, '45');
  const b = extrairEndereco('Endereço: Rua Sete, 245 - Araceli');
  assert.equal(b.rua, 'Rua Sete');
  assert.equal(b.numero, '245');
  assert.equal(extrairEndereco(['nada de endereço aqui']), null);
});

test('só o quadro do endereço entra na leitura: nome e CPF ficam de fora', () => {
  const linhas = ['FOLHA RESUMO', 'II - ENDEREÇO DA FAMÍLIA', 'Endereço: Rua Sete, 245', 'COMPONENTES DA FAMÍLIA', 'Nome Completo: MARIA DA SILVA', 'CPF 123.456.789-00'];
  const q = quadroEndereco(linhas);
  assert.deepEqual(q, ['II - ENDEREÇO DA FAMÍLIA', 'Endereço: Rua Sete, 245']);
  const achou = enderecoDasPaginas([[item('II - ENDEREÇO DA FAMÍLIA', 10, 700), item('Endereço: Rua Sete, 245', 10, 680), item('COMPONENTES DA FAMÍLIA', 10, 600), item('Nome Completo: MARIA DA SILVA', 10, 580)]]);
  assert.equal(achou.via, 'texto');
  assert.ok(!JSON.stringify(achou).includes('MARIA'));
});

test('sem texto na folha: devolve null (o console tenta OCR); OCR vale com via ocr', () => {
  assert.equal(enderecoDasPaginas([[], []]), null);
  const o = enderecoDoOcr('ENDEREÇO DA FAMÍLIA\nTipo de logradouro: RUA Nome: S4NTO AGOSTINHO Número: O000000000000193');
  assert.equal(o.via, 'ocr');
  assert.equal(o.numero, '193');
  assert.equal(enderecoDoOcr('lixo sem endereço'), null);
});

test('limites e duplicados', () => {
  const pdf = { nome: 'a.pdf', tipo: 'application/pdf', tamanho: 100 };
  assert.equal(motivoRejeicaoRota(pdf, { arquivos: 0, bytes: 0 }, []), null);
  assert.match(motivoRejeicaoRota({ nome: 'a.txt', tipo: 'text/plain', tamanho: 1 }, { arquivos: 0, bytes: 0 }, []), /não é PDF/);
  assert.match(motivoRejeicaoRota(pdf, { arquivos: 0, bytes: 0 }, [{ nome: 'a.pdf', tamanho: 100 }]), /já foi adicionado/);
  assert.match(motivoRejeicaoRota(pdf, { arquivos: ROTA_MAX_ARQUIVOS, bytes: 0 }, []), /limite de 30 arquivos/);
  assert.match(motivoRejeicaoRota(pdf, { arquivos: 1, bytes: ROTA_MAX_BYTES }, []), /50 MB/);
});

test('ordena por rua com a rua de partida primeiro; sem endereço vai ao fim', () => {
  const itens = [
    { nome: 'sem.pdf', endereco: '' },
    { nome: 'b.pdf', endereco: 'Rua Zeta, 10 — Araceli' },
    { nome: 'c.pdf', endereco: 'Rua Santo Agostinho, 200 — Centenário' },
    { nome: 'd.pdf', endereco: 'Rua Alfa, 5 — Araceli' },
    { nome: 'e.pdf', endereco: 'Rua Santo Agostinho, 50 — Centenário' }
  ];
  const r = ordenarBloco(itens);
  assert.equal(r.itens.length, 5);
  assert.equal(r.itens[4].nome, 'sem.pdf');
  assert.equal(r.semEndereco, 1);
  assert.deepEqual(r.itens.slice(0, 2).map((i) => i.nome).sort(), ['c.pdf', 'e.pdf']); // partida primeiro
  assert.ok(r.explicacao.length > 20);
});

test('aprende só nomes de rua com o ajuste manual e não quebra com poucos itens', () => {
  const ordem = [{ endereco: 'Rua Zeta, 10 — Araceli' }, { endereco: 'Rua Alfa, 5 — Araceli' }];
  const viz = aprenderAjuste(null, ordem);
  assert.ok(viz && viz.pares && Object.keys(viz.pares).length >= 1);
  assert.equal(aprenderAjuste(viz, [{ endereco: 'Rua Alfa, 5' }]), viz);
});

test('roteiro e capa descrevem blocos, ordem e totais', () => {
  const blocos = [{ label: ROTA_BLOCOS[0].label, itens: [{ nome: 'x.pdf', endereco: 'Rua A, 1' }, { nome: 'y.pdf', endereco: '' }] }, { label: ROTA_BLOCOS[1].label, itens: [] }];
  const l = linhasRoteiro(blocos);
  assert.equal(l[0].texto, ROTA_BLOCOS[0].label);
  assert.equal(l[1].endereco, '1.  Rua A, 1');
  assert.equal(l[2].endereco, '2.  (endereço não informado)');
  assert.equal(l.length, 3); // bloco vazio não entra
  const capa = linhasCapaRota(blocos).map((x) => x.texto);
  assert.ok(capa.includes(`Partida: ${ROTA_PARTIDA}`));
  assert.ok(capa.includes('Total: 2 famílias (2 folhas resumo)'));
  assert.equal(nomeArquivoRota('27-11-2026'), 'Visitas - Folhas de Familia Unificadas - 27-11-2026.pdf');
});

test('monta o PDF: capa + roteiro + divisória por bloco + folhas na ordem', async () => {
  const blocos = [
    { label: ROTA_BLOCOS[0].label, itens: [{ nome: 'a.pdf', endereco: 'Rua A, 1', bytes: await folha(2) }, { nome: 'b.pdf', endereco: 'Rua B, 2', bytes: await folha(1) }] },
    { label: ROTA_BLOCOS[1].label, itens: [] }
  ];
  const r = await montarPdfRota({ PDFLib, blocos });
  assert.equal(r.total, 2);
  assert.equal(r.paginasFolhas, 3);
  const doc = await PDFLib.PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), 1 + 1 + 1 + 3); // capa, roteiro, divisória, 3 páginas de folhas
  assert.match(doc.getTitle(), /rota de visita/);
});

test('roteiro com muitas famílias passa para mais páginas (19 linhas por página)', async () => {
  const itens = [];
  for (let i = 0; i < 25; i++) itens.push({ nome: `f${i}.pdf`, endereco: `Rua ${i}, ${i}`, bytes: await folha(1) });
  const r = await montarPdfRota({ PDFLib, blocos: [{ label: ROTA_BLOCOS[0].label, itens }] });
  const doc = await PDFLib.PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), 1 + 2 + 1 + 25); // 26 linhas de roteiro = 2 páginas
});

test('erros legíveis: sem folhas e PDF inválido', async () => {
  await assert.rejects(montarPdfRota({ PDFLib, blocos: [{ label: 'x', itens: [] }] }), /pelo menos uma folha/);
  await assert.rejects(montarPdfRota({ PDFLib, blocos: [{ label: 'x', itens: [{ nome: 'z.pdf', endereco: '', bytes: new Uint8Array([1, 2]) }] }] }), /Não consegui abrir o arquivo "z\.pdf"/);
});
