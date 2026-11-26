import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { docDividir, docSelecionar, docPreparar, docSaneado } from '../shared/documento.mjs';

function zipStore(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const n = Buffer.from(name), d = Buffer.from(value), l = Buffer.alloc(30), c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    locals.push(l, n, d);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); centrals.push(c, n);
    offset += l.length + n.length + d.length;
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
function arquivo(nome, conteudo) {
  const b = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo);
  return { name: nome, size: b.length, text: async () => b.toString('utf8'), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}
function leitor() {
  const w = {};
  vm.runInNewContext(readFileSync('console/docs.js', 'utf8'), { window: w, WeakMap, TextDecoder, DecompressionStream, Response, Uint8Array, Promise, Math, String, Array, Error, document: {}, URL });
  return w.PaulusDocs;
}

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
test('docs.js lê DOCX e TXT e não trata foto como documento de texto (ela segue pela leitura de imagem)', async () => {
  const w = {}; vm.runInNewContext(readFileSync('console/docs.js', 'utf8'), { window: w, WeakMap, TextDecoder, DecompressionStream, Response, Uint8Array, Promise, Math, String, Array, Error, document: {}, URL });
  const buf = Buffer.from('UEsDBBQAAAAIAA18dl0rhCYSBgAAAAQAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLOp0LcDAFBLAwQUAAAACAANfHZdr+RmbaAAAADwAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sbY9NCsJADIWvkpVLu6+lUAoFV4oF93Em6kCnqZkpxdt4AVceoRdzIhRE3Hz5I+8lxZRbNqOnPpbFlJ/Y3jUOClHEcgf1oWqBzyRkCBj21baBFfphk4q2bo4wPwKc0c/PzmEAyxBJxMX5JY7XRaYqSvlw+DVo6TL2FqFz/RV1e7koZZSkQiQw7MGjC9q5jShpimBQ0CQrCv9MsuWd7OvHN1BLAQIUAxQAAAAIAA18dl0rhCYSBgAAAAQAAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgADXx2Xa/kZm2gAAAA8AAAABEAAAAAAAAAAAAAAIABNwAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAgAAAAAYBAAAAAA==', 'base64');
  const f = { name: 'a.docx', size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  const r = await w.PaulusDocs.ler([f]);
  assert.match(r.texto, /PAIF & o SCFV/);
  const t = await w.PaulusDocs.ler([{ name: 'b.txt', size: 90, text: async () => 'Texto simples com mais de quarenta caracteres para o teste passar.' }]);
  assert.match(t.texto, /Texto simples/);
  const e = await w.PaulusDocs.ler([{ name: 'c.jpg', size: 10 }]);
  assert.match(e.erro, /pergunta visual/);
});

test('reconhece formatos de escritório modernos, texto estruturado e imagens comuns', () => {
  const d = leitor();
  for (const nome of ['a.pdf', 'a.docx', 'a.xlsx', 'a.pptx', 'a.odt', 'a.ods', 'a.odp', 'a.json', 'a.xml', 'a.html', 'a.rtf']) assert.equal(d.legivel({ name: nome }), true, nome);
  for (const nome of ['a.doc', 'a.xls', 'a.ppt', 'a.mp4']) assert.equal(d.legivel({ name: nome }), false, nome);
  for (const nome of ['foto.jpg', 'foto.gif', 'foto.bmp', 'foto.avif', 'foto.heic']) assert.equal(d.ehImagem({ name: nome }), true, nome);
});

test('lê localmente PPTX e formatos OpenDocument sem enviar o pacote', async () => {
  const d = leitor();
  const pptx = arquivo('apresentacao.pptx', zipStore({
    'ppt/slides/slide2.xml': '<a:p><a:r><a:t>Segundo slide: acompanhamento e resultados.</a:t></a:r></a:p>',
    'ppt/slides/slide1.xml': '<a:p><a:r><a:t>Primeiro slide: apresentação do projeto Paulus.</a:t></a:r></a:p>'
  }));
  const p = await d.ler([pptx]);
  assert.match(p.texto, /Slide 1:[\s\S]*Primeiro slide/); assert.match(p.texto, /Slide 2:[\s\S]*Segundo slide/);
  const odt = arquivo('relatorio.odt', zipStore({ 'content.xml': '<office:document-content><text:p>Relatório com conteúdo de teste suficientemente extenso para a leitura local.</text:p></office:document-content>' }));
  assert.match((await d.ler([odt])).texto, /Relatório com conteúdo/);
  const odp = arquivo('reuniao.odp', zipStore({ 'content.xml': '<office:document-content><draw:page><text:p>Slide de reunião com texto suficientemente longo para ser extraído localmente.</text:p></draw:page></office:document-content>' }));
  assert.match((await d.ler([odp])).texto, /Slide 1:[\s\S]*reunião/);
});

test('lê a primeira folha ODS e interpreta JSON, HTML e RTF como texto local', async () => {
  const d = leitor();
  const ods = arquivo('tabela.ods', zipStore({ 'content.xml': '<office:document-content><table:table><table:table-row><table:table-cell office:value-type="string"><text:p>Atividade</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Quantidade</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>Visita domiciliar</text:p></table:table-cell><table:table-cell office:value="12" office:value-type="float"/></table:table-row></table:table></office:document-content>' }));
  const o = await d.ler([ods]); assert.match(o.texto, /Atividade\tQuantidade/); assert.match(o.texto, /Visita domiciliar\t12/);
  assert.match((await d.ler([arquivo('dados.json', '{"atividade":"Atendimento comunitário","quantidade":12,"nota":"texto longo para garantir leitura"}')])).texto, /Atendimento comunitário/);
  assert.match((await d.ler([arquivo('pagina.html', '<html><script>ignorar isto</script><p>Conteúdo visível da página com extensão suficiente para leitura local.</p></html>')])).texto, /Conteúdo visível/);
  assert.doesNotMatch((await d.ler([arquivo('pagina.html', '<html><script>ignorar isto</script><p>Conteúdo visível da página com extensão suficiente para leitura local.</p></html>')])).texto, /ignorar isto/);
  assert.match((await d.ler([arquivo('nota.rtf', '{\\rtf1 Texto formatado com tamanho suficiente para passar no limite de leitura.\\par Segunda linha de teste.}')])).texto, /Texto formatado/);
});
