import test from 'node:test';
import assert from 'node:assert/strict';
import { qrGerar, qrParaSvg, qrParaPng, qrParaTexto, qrArquivo, qrCapacidadeBytes, qrExtrairLinks, lerPedidoDeQr, respostaDeQr } from '../shared/qrcode.mjs';
import { juntar } from '../scripts/build.mjs';

test('geração QR local, níveis e saída matricial', () => {
  const q=qrGerar('https://example.org');
  assert.equal(q.nivel,'M'); assert.ok(q.versao>=1&&q.versao<=40); assert.equal(q.tamanho,17+4*q.versao);
  assert.equal(q.modulos.length,q.tamanho); assert.equal(q.modulos[0].length,q.tamanho);
  assert.ok(qrGerar('Olá, Boa Vista').versao>=1);
  assert.ok(qrGerar('https://example.org',{nivel:'H'}).versao>=q.versao);
  assert.throws(()=>qrGerar(''),/vazio/);
});
test('capacidade publicada',()=>{assert.deepEqual(['L','M','Q','H'].map(n=>qrCapacidadeBytes(n)),[2953,2331,1663,1273]);assert.equal(qrCapacidadeBytes('M',1),14);});
test('SVG sanitizado, PNG binário e texto',()=>{
 const q=qrGerar('https://example.org');const svg=qrParaSvg(q,{titulo:'A&B'});assert.match(svg,/^<svg /);assert.match(svg,/A&amp;B/);
 const png=qrParaPng(q,{escala:3});assert.deepEqual(Array.from(png.slice(0,8)),[137,80,78,71,13,10,26,10]);assert.equal(new DataView(png.buffer,png.byteOffset).getUint32(8),13);assert.equal(new DataView(png.buffer,png.byteOffset).getUint32(16),(q.tamanho+8)*3);assert.equal(new DataView(png.buffer,png.byteOffset).getUint32(20),(q.tamanho+8)*3);
 assert.ok(qrParaTexto(q).includes('██'));assert.equal(qrArquivo(q,'svg').tipo,'image/svg+xml');assert.equal(qrArquivo(q,'png').bytes[1],80);
});
test('extração de links, pedido, filtros e resposta',()=>{
 assert.deepEqual(qrExtrairLinks('veja https://a.example/path, e www.b.example'),['https://a.example/path','https://www.b.example']);
 assert.deepEqual(lerPedidoDeQr('transforme este link em QR code: https://example.org').alvos,['https://example.org']);
 assert.equal(lerPedidoDeQr('como ler um QR code?'),null);
 assert.equal(lerPedidoDeQr('faça o QR do link https://example.org e escreva um aviso').extra,true);
 assert.equal(lerPedidoDeQr('gere um QR code').semLink,true);
 const r=respostaDeQr('transforme este link em QR code: https://example.org');assert.equal(r.qrs.length,1);assert.match(r.qrs[0].svg,/^<svg/);
 const p=respostaDeQr({alvos:['https://example.org/?cpf=12345678909'],nivel:'M',extra:false});assert.equal(p.bloqueado,true);
});
test('bundle inclui API pública de QR sem imports pendentes',()=>{
 const c=juntar();assert.match(c,/QR Code local/);assert.doesNotMatch(c,/^\s*(import|export)\b/m);
 const root={},mod={exports:{}};new Function('self','module',c+'\nreturn self.Paulus;')(root,mod);const P=root.Paulus||mod.exports;
 P.init({app:'teste',conhecimentoUrl:''});
 assert.equal(P.qr.capacidade('M'),2331);assert.equal(P.qr.gerar('https://example.org').tamanho,25);
});
test('cliente responde a pedido QR sem endpoint de IA', async()=>{
 const root={},mod={exports:{}};new Function('self','module',juntar()+'\nreturn self.Paulus;')(root,mod);const P=root.Paulus||mod.exports;
 P.init({app:'teste',conhecimentoUrl:''});const r=await P.perguntar('transforme este link em QR code: https://example.org');
 assert.equal(r.tipo,'qr');assert.equal(r.qrs.length,1);assert.match(r.qrs[0].svg,/^<svg/);assert.equal(r.semIA,true);
});
