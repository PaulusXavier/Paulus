import test from 'node:test';
import assert from 'node:assert/strict';
import { montarMarkdown, lugaresDoMapa } from '../scripts/importar-mapa.mjs';
import { lerDocumentoCompleto } from '../scripts/build-knowledge.mjs';

const el = (id, lat, lon, tags) => ({ type: 'node', id, lat, lon, tags });
const amostra = {
  elements: [
    el(1, 2.82, -60.67, { name: 'Centro', place: 'suburb' }),
    el(2, 2.80, -60.72, { name: 'Pintolândia', place: 'suburb' }),
    el(3, 2.8201, -60.6701, { name: 'Escola Estadual A', amenity: 'school', 'addr:street': 'Rua X', 'addr:housenumber': '10' }),
    el(4, 2.8202, -60.6702, { name: 'Escola Municipal B', amenity: 'school' }),
    el(5, 2.8003, -60.7203, { name: 'UBS Pintolândia', amenity: 'clinic', phone: '+55 95 0000-0000' }),
    el(6, 2.8004, -60.7204, { name: 'CRAS Teste', amenity: 'social_facility' }),
    el(7, 2.8, -60.7, { amenity: 'school' }),                       // sem nome: ignorado
    el(8, 2.8201, -60.6701, { name: 'Escola Estadual A', amenity: 'school' }), // duplicado
    el(9, 2.81, -60.69, { name: 'Casa qualquer', building: 'house' }),         // não é serviço
  ],
};

test('classifica, descarta sem nome, duplicado e residência', () => {
  const { lugares, bairros } = lugaresDoMapa(amostra);
  assert.equal(bairros, 2);
  assert.equal(lugares.length, 4);
  assert.equal(lugares.find((l) => l.nome === 'UBS Pintolândia').cat, 'Saúde');
  assert.equal(lugares.find((l) => l.nome === 'CRAS Teste').cat, 'Assistência social');
});

test('bairro vem do centro mais próximo e entra na contagem', () => {
  const md = montarMarkdown(amostra, { data: '2026-11-13' });
  assert.match(md, /## Escolas, bairro Centro/);
  assert.match(md, /2 lugares no mapa/);
  assert.match(md, /- Escola Estadual A \(Rua X, 10\)/);
  assert.match(md, /- UBS Pintolândia \(\+55 95 0000-0000\)/);
  assert.match(md, /escolas 2/);
  assert.match(md, /## Resumo do bairro Centro/);
});

test('o documento gerado é aceito pelo build da base', () => {
  const { meta, trechos } = lerDocumentoCompleto(montarMarkdown(amostra, { data: '2026-11-13' }), 'mapa-boa-vista-osm.md');
  assert.equal(meta.doc, 'mapa-boa-vista-osm');
  assert.ok(trechos.length >= 4);
});

test('aceita GeoJSON, descarta Boa Vista da Paraiba e manda lugar distante para zona rural', () => {
  const f = (lon, lat, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
  const geo = { type: 'FeatureCollection', features: [
    f(-60.67, 2.82, { name: 'Centro', place: 'suburb' }),
    f(-60.6701, 2.8201, { name: 'Escola Perto', amenity: 'school' }),
    f(-60.40, 3.18, { name: 'Escola Indígena Longe', amenity: 'school' }),
    f(-36.24, -7.26, { name: 'Escola da Paraíba', amenity: 'school' }),
  ] };
  const { lugares, descartados } = lugaresDoMapa(geo);
  assert.equal(descartados, 1);
  assert.equal(lugares.length, 2);
  assert.equal(lugares.find((l) => l.nome === 'Escola Perto').bairro, 'Centro');
  assert.match(lugares.find((l) => l.nome === 'Escola Indígena Longe').bairro, /^Zona rural/);
});

test('nenhum trecho passa do corte que a IA recebe e a contagem total aparece em todas as partes', async () => {
  const { MAX_TEXTO_TRECHO } = await import('../shared/busca.mjs');
  const muitos = { elements: [el(1, 2.82, -60.67, { name: 'Centro', place: 'suburb' })] };
  for (let i = 0; i < 40; i++) muitos.elements.push(el(100 + i, 2.82 + i * 0.00001, -60.67 + i * 0.001, { name: 'Escola Municipal Numero ' + i + ' de Teste', amenity: 'school', 'addr:street': 'Avenida Longa de Teste' }));
  const { trechos } = lerDocumentoCompleto(montarMarkdown(muitos, { data: '2026-11-13' }), 'x.md');
  trechos.forEach((t) => assert.ok(t.texto.length <= MAX_TEXTO_TRECHO, t.referencia + ' tem ' + t.texto.length));
  const partes = trechos.filter((t) => /^Escolas, bairro Centro/.test(t.referencia));
  assert.ok(partes.length > 1);
  partes.forEach((t) => assert.match(t.texto, /^40 lugares no mapa/));
});

test('mesmo lugar mapeado duas vezes conta uma vez; Zona Rural do mapa vira o rotulo da zona rural', () => {
  const g = { elements: [
    el(1, 2.82, -60.67, { name: 'Centro', place: 'suburb' }),
    el(2, 2.9, -60.9, { name: 'Zona Rural', place: 'suburb' }),
    el(3, 2.8201, -60.6701, { name: 'UFRR Campus', amenity: 'university' }),
    el(4, 2.8203, -60.6703, { name: 'Ufrr  campus', amenity: 'university' }),
    el(5, 2.9, -60.9, { name: 'Escola Rural', amenity: 'school', 'addr:suburb': 'Zona Rural' }),
  ] };
  const { lugares } = lugaresDoMapa(g);
  assert.equal(lugares.filter((l) => l.cat === 'Ensino superior').length, 1);
  assert.equal(lugares.find((l) => l.nome === 'Escola Rural').bairro, 'Zona rural e comunidades');
});
