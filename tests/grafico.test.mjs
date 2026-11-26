import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { graficoEhPedido, graficoResponder, graficoSVG } from '../shared/grafico.mjs';
import { juntar } from '../scripts/build.mjs';

const csv = [
  'mes,atendimentos,idade,situacao',
  'Jan,10,20,aberto',
  'Fev,20,30,fechado',
  'Mar,30,40,aberto',
  'Abr,40,50,aberto'
].join('\n');

test('detecta pedidos gráficos e não captura perguntas comuns', () => {
  assert.equal(graficoEhPedido('faça um gráfico de barras'), true);
  assert.equal(graficoEhPedido('o que é média?'), false);
});

test('cria barras agrupadas pela categoria e preserva valores calculados', () => {
  const r = graficoResponder('gráfico de barras de atendimentos por mês', csv);
  assert.equal(r.tipo, 'grafico');
  assert.equal(r.analise, 'barras');
  assert.deepEqual(Array.from(r.grafico.labels), ['Abr', 'Mar', 'Fev', 'Jan']);
  assert.deepEqual(Array.from(r.grafico.values), [40, 30, 20, 10]);
  assert.match(r.texto, /não consumiu cota de IA/);
});

test('gráfico de linhas segue a ordem de aparição das categorias', () => {
  const r = graficoResponder('gráfico de linhas de atendimentos por mês', csv);
  assert.equal(r.analise, 'linha');
  assert.deepEqual(Array.from(r.grafico.labels), ['Jan', 'Fev', 'Mar', 'Abr']);
  assert.deepEqual(Array.from(r.grafico.values), [10, 20, 30, 40]);
});

test('pizza calcula frequência de categorias quando não se indica métrica', () => {
  const r = graficoResponder('gráfico de pizza por situação', csv);
  assert.equal(r.analise, 'pizza');
  const freq = Object.fromEntries(r.grafico.labels.map((x, i) => [x, r.grafico.values[i]]));
  assert.deepEqual(freq, { aberto: 3, fechado: 1 });
});

test('histograma agrupa valores numéricos e dispersão usa pares completos', () => {
  const h = graficoResponder('histograma de idade', csv);
  assert.equal(h.analise, 'histograma');
  assert.equal(h.grafico.values.reduce((a, b) => a + b, 0), 4);
  const d = graficoResponder('gráfico de dispersão de idade e atendimentos', csv);
  assert.equal(d.analise, 'dispersao');
  assert.deepEqual(Array.from(d.grafico.pontos, p => [p.x, p.y]), [[20, 10], [30, 20], [40, 30], [50, 40]]);
});

test('aceita tabela categórica pequena no modo leve e exclui coluna de identificador reconhecida', () => {
  const r = graficoResponder('gráfico de barras por situação', 'id,situacao\n1,aberto\n2,fechado');
  assert.equal(r.analise, 'barras');
  assert.deepEqual(Array.from(r.grafico.labels).sort(), ['aberto', 'fechado']);
  assert.doesNotMatch(r.svg, /Frequência de id/i);
});

test('SVG escapa rótulos e inclui descrição acessível', () => {
  const r = graficoResponder('gráfico de barras por grupo', 'grupo,valor\n<script>,1\nnormal,2');
  assert.ok(r.svg.startsWith('<svg'));
  assert.match(r.svg, /&lt;script&gt;/);
  assert.match(r.svg, /<desc/);
  assert.equal(graficoSVG(null), '');
});

test('pergunta gráfica com anexo responde no cliente sem fetch nem histórico de IA', async () => {
  let chamadas = 0;
  const sandbox = { self: {}, fetch: async () => { chamadas++; throw new Error('não deve haver rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  const r = await P.perguntar('gráfico de barras de atendimentos por mês', { documento: { nome: 'dados.csv', texto: csv } });
  assert.equal(r.tipo, 'grafico');
  assert.equal(r.sensivel, true);
  assert.equal(r.pergunta, '');
  assert.equal(chamadas, 0);
});

test('pedido de gráfico sem ficheiro explica como anexar sem chamar a IA', () => {
  const r = graficoResponder('crie um gráfico de pizza', '');
  assert.match(r.texto, /Anexe uma tabela CSV, TSV ou Excel/);
  assert.equal(r.svg, undefined);
});

test('docs.js extrai a primeira folha XLSX localmente e devolve tabela TSV', async () => {
  const w = {};
  vm.runInNewContext(readFileSync(new URL('../console/docs.js', import.meta.url), 'utf8'), {
    window: w, WeakMap, TextDecoder, DecompressionStream, Response, Uint8Array,
    Promise, Math, String, Array, Error, document: {}, URL
  });
  const buf = readFileSync(new URL('./tabela-simples.xlsx', import.meta.url));
  const f = { name: 'dados.xlsx', size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  const r = await w.PaulusDocs.ler([f]);
  assert.equal(r.nome, 'dados.xlsx');
  assert.match(r.texto, /mês\tvisitas\tsituação/);
  assert.match(r.texto, /jan\t10\taberto/);
  assert.match(r.texto, /fev\t20\tfechado/);
});
