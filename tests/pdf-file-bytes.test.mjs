// Regressão: navegadores atuais dão a File/Blob um MÉTODO bytes(). O Paulus não pode tratá-lo como os bytes do arquivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { juntar } from '../scripts/build.mjs';
import { carregarPDFLib } from './pdflib-carregar.mjs';

const PDFLib = carregarPDFLib();

// Mesmo "realm" do teste (sem vm): Uint8Array e pdf-lib são os mesmos objetos nos dois lados.
function carregar() {
  const raiz = {};
  globalThis.PDFLib = PDFLib;   // já "carregado" no escopo global: o Paulus só baixa o pdf-lib se ainda não existir
  new Function('self', juntar()).call(raiz, raiz);
  return raiz.Paulus;
}

test('arquivo com bytes() de função (File moderno) é lido por arrayBuffer() e editado', async () => {
  const doc = await PDFLib.PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  const arquivoModerno = {
    name: 'ficha.pdf',
    bytes: async () => new Uint8Array(bytes),                 // método, como em Blob.prototype.bytes()
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
  const Paulus = carregar();
  Paulus.init({ app: 'umbrella', endpoint: '', conhecimento: [] });
  const r = await Paulus.perguntar('remover a página 2', { arquivos: [arquivoModerno] });
  assert.equal(r.tipo, 'pdf');
  assert.equal(r.ok, true, r.texto);
  assert.equal(r.arquivos[0].paginas, 2);
});

test('arquivo no formato { nome, bytes } continua funcionando', async () => {
  const doc = await PDFLib.PDFDocument.create();
  for (let i = 0; i < 2; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  const Paulus = carregar();
  Paulus.init({ app: 'umbrella', endpoint: '', conhecimento: [] });
  const r = await Paulus.perguntar('girar a página 1 para a direita', { arquivos: [{ nome: 'a.pdf', bytes }] });
  assert.equal(r.tipo, 'pdf');
  assert.equal(r.ok, true, r.texto);
});
