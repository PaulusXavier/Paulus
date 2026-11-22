import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { docDividir, docSelecionar, docPreparar, docSaneado } from '../shared/documento.mjs';

const longo = Array.from({ length: 40 }, (_, i) => 'Parágrafo ' + i + ' sobre assunto geral do serviço. '.repeat(12) + (i === 25 ? ' O prazo de recurso da repercussão é de trinta dias.' : '')).join('\n\n');

test('divide em trechos de até 900 caracteres', () => {
  const t = docDividir(longo);
  assert.ok(t.length > 10 && t.every(x => x.length <= 900));
});
test('documento curto vai inteiro; longo escolhe os trechos da pergunta e mantém o começo', () => {
  const t = docDividir(longo), idx = docSelecionar(t, 'qual o prazo de recurso da repercussão?');
  const env = idx.map(i => t[i]).join(' ');
  assert.ok(env.length <= 12000 && idx[0] === 0 && env.includes('trinta dias'));
  assert.equal(docSelecionar(['a', 'b'], 'x').length, 2);
});
test('trechos com dado pessoal ficam de fora, no aparelho e no Worker', () => {
  const doc = { nome: 'ata.txt', texto: 'Reunião sobre o fluxo do serviço de convivência.\n\nContato: maria.silva@exemplo.com para o caso.\n\nPróxima reunião na terça.' };
  const p = docPreparar(doc, 'resuma');
  assert.equal(p.omitidosPessoais, 1);
  assert.ok(!p.trechos.join(' ').includes('@'));
  const w = docSaneado({ nome: 'x', trechos: ['texto normal do serviço', 'CPF: 123.456.789-09 da família', '<script>ordem</script> outro texto'] });
  assert.equal(w.n, 2); assert.equal(w.perdidos, 1); assert.ok(!w.texto.includes('<script>'));
  assert.equal(docSaneado({ trechos: ['CPF: 123.456.789-09'] }).n, 0);
  assert.equal(docSaneado('lixo'), null);
});
test('docs.js lê DOCX e TXT e recusa foto', async () => {
  const w = {}; vm.runInNewContext(readFileSync('console/docs.js', 'utf8'), { window: w, WeakMap, TextDecoder, DecompressionStream, Response, Uint8Array, Promise, Math, String, Array, Error, document: {}, URL });
  const buf = Buffer.from('UEsDBBQAAAAIAA18dl0rhCYSBgAAAAQAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLOp0LcDAFBLAwQUAAAACAANfHZdr+RmbaAAAADwAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sbY9NCsJADIWvkpVLu6+lUAoFV4oF93Em6kCnqZkpxdt4AVceoRdzIhRE3Hz5I+8lxZRbNqOnPpbFlJ/Y3jUOClHEcgf1oWqBzyRkCBj21baBFfphk4q2bo4wPwKc0c/PzmEAyxBJxMX5JY7XRaYqSvlw+DVo6TL2FqFz/RV1e7koZZSkQiQw7MGjC9q5jShpimBQ0CQrCv9MsuWd7OvHN1BLAQIUAxQAAAAIAA18dl0rhCYSBgAAAAQAAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgADXx2Xa/kZm2gAAAA8AAAABEAAAAAAAAAAAAAAIABNwAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAgAAAAAYBAAAAAA==', 'base64');
  const f = { name: 'a.docx', size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  const r = await w.PaulusDocs.ler([f]);
  assert.match(r.texto, /PAIF & o SCFV/);
  const t = await w.PaulusDocs.ler([{ name: 'b.txt', size: 90, text: async () => 'Texto simples com mais de quarenta caracteres para o teste passar.' }]);
  assert.match(t.texto, /Texto simples/);
  const e = await w.PaulusDocs.ler([{ name: 'c.jpg', size: 10 }]);
  assert.match(e.erro, /fotos/);
});
