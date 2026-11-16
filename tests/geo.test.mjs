import test from 'node:test';
import vm from 'node:vm';
import { juntar } from '../scripts/build.mjs';
import assert from 'node:assert/strict';
import { geoLerCoordenadas, geoFormatarCoordenadas, geoNormalizarEndereco, geoLinksDeRota, geoParaGpx, geoParaKml, geoTipoDePedido, respostaDeGeo, geoDistanciaKm } from '../shared/geo.mjs';
import { respostaDeRota } from '../shared/rota.mjs';
import { montarLugaresJson } from '../scripts/importar-mapa.mjs';
import { fichasComoTexto } from '../worker/prompt.mjs';

const PONTOS = [
  { nome: 'CRAS Cauamé', lat: 2.8392, lng: -60.6962 }, { nome: 'CAPS II', lat: 2.8235, lng: -60.6711 },
  { nome: 'Conselho Tutelar', lat: 2.8195, lng: -60.6733 }, { nome: 'UBS Pintolândia', lat: 2.8697, lng: -60.7126 }
];
const OVERPASS = { elements: [
  { type: 'node', lat: 2.82, lon: -60.67, tags: { name: 'Centro', place: 'suburb' } },
  { type: 'node', lat: 2.87, lon: -60.71, tags: { name: 'Pintolândia', place: 'suburb' } },
  { type: 'node', lat: 2.8210, lon: -60.6720, tags: { name: 'UBS Centro', amenity: 'clinic' } },
  { type: 'node', lat: 2.8215, lon: -60.6690, tags: { name: 'Farmácia Boa', amenity: 'pharmacy' } },
  { type: 'node', lat: 2.8230, lon: -60.6800, tags: { name: 'Hospital Geral', amenity: 'hospital' } }
] };
const LUGARES = montarLugaresJson(OVERPASS, { data: '2026-11-14' });
const G = (t, o) => respostaDeGeo(t, Object.assign({ pontos: PONTOS, lugares: LUGARES }, o || {}));

test('geo: lê coordenada decimal, graus-minutos-segundos e link; recusa o que não é coordenada', () => {
  assert.deepEqual([geoLerCoordenadas('2.8235, -60.6758').lat, geoLerCoordenadas('2.8235, -60.6758').lng], [2.8235, -60.6758]);
  const d = geoLerCoordenadas('2°49\'24.6"N 60°40\'32.9"W');
  assert.ok(Math.abs(d.lat - 2.8235) < 1e-4 && Math.abs(d.lng + 60.675806) < 1e-4);
  assert.equal(geoLerCoordenadas('2,8235 -60,6758').lng, -60.6758);
  assert.equal(geoLerCoordenadas('https://maps/@2.8235,-60.6758,17z').lat, 2.8235);
  assert.equal(geoLerCoordenadas('versão 0.16.0 do app'), null);
  assert.equal(geoLerCoordenadas('99.5, 200.1'), null);
  assert.equal(geoFormatarCoordenadas(2.8235, -60.675806).dms, '2°49′24.6″N 60°40′32.9″O');
});

test('geo: endereço no padrão, sem inventar CEP, bairro ou número', () => {
  const e = geoNormalizarEndereco('av ville roy 1234 apto 2, centro, boa vista - rr, 69301000');
  assert.equal(e.texto, 'Avenida Ville Roy, 1234, Apto 2, Centro, Boa Vista - RR, CEP 69301-000');
  const f = geoNormalizarEndereco('rua 15 de novembro, centro');
  assert.equal(f.logradouro, 'Rua 15 de Novembro');
  assert.ok(f.faltando.some((x) => /número/.test(x)) && f.faltando.includes('CEP'));
  assert.equal(f.cep, '');
});

test('geo: coordenadas, perto, distância, bairro e "não consta" (nunca chuta)', () => {
  assert.match(G('coordenadas do CAPS II').texto, /2\.823500, -60\.671100/);
  assert.deepEqual(G('UBS perto do CAPS II num raio de 1 km').lugares.map((l) => l.nome), ['UBS Centro']);
  assert.deepEqual(G('qual a UBS mais próxima do CAPS II').lugares.map((l) => l.nome), ['UBS Centro']);
  assert.ok(G('o que tem perto do Conselho Tutelar').lugares.length >= 3);
  assert.match(G('farmácia perto do CRAS Fantasma').texto, /Não encontrei/);
  assert.equal(G('próxima reunião do CAPS II'), null);
  assert.match(G('em que bairro fica o CAPS II?').texto, /Centro/);
  const d = G('quantos km do CAPS II até a UBS Pintolândia de moto');
  assert.ok(d.km > 6 && d.km < 8 && d.kmRuas > d.km && /moto/.test(d.texto));
  assert.equal(G('o que é CAPS?'), null);
  assert.equal(G('onde fica o CAPS II?'), null, 'unidade do diretório vai para a ficha');
});

test('geo: o diretório vence o mapa no empate, e conversão/endereço são sensíveis', () => {
  const r = respostaDeGeo('coordenadas do CAPS II', { pontos: PONTOS, lugares: [{ nome: 'CAPS II', lat: 9, lng: -60 }] });
  assert.match(r.texto, /2\.823500/);
  assert.equal(G('converter 2°49\'24.6"N 60°40\'32.9"W').sensivel, true);
  assert.equal(geoTipoDePedido('padronizar endereço: rua a, 10'), 'endereco');
  assert.match(G('qual o cep da rua x').texto, /Não consulto CEP/);
});

test('geo: rota usa lugar do mapa e bairro, recusa coordenada solta e divide o link grande', () => {
  const r = respostaDeRota('melhor ordem para visitar CRAS Cauamé, UBS Centro e CAPS II', { pontos: PONTOS, lugares: LUGARES });
  assert.ok(r.km > 0 && r.paradas.includes('UBS Centro') && /OpenStreetMap/.test(r.texto));
  assert.match(r.gpx, /<rtept/); assert.match(r.kml, /<LineString>/);
  assert.equal(respostaDeRota('traçar rota: CRAS Cauamé, 2.8235, -60.6758', { pontos: PONTOS }).bloqueio, true);
  const muitos = Array.from({ length: 12 }, (_, i) => ({ nome: 'P' + i, lat: 2.8 + i / 100, lng: -60.6 }));
  const links = geoLinksDeRota(muitos, { modo: 'carro' });
  assert.equal(links.length, 2); assert.match(links[1].rotulo, /parte 2 de 2/);
  assert.match(geoParaGpx([{ nome: 'A & B', lat: 1, lng: 2 }]), /A &amp; B/);
  assert.match(geoParaKml([{ nome: 'A', lat: 1, lng: 2 }, { nome: 'B', lat: 1.1, lng: 2 }]), /2\.000000,1\.000000,0/);
  assert.ok(geoDistanciaKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) > 110);
});

test('geo: ficha com coordenada vai ao Worker; sem coordenada válida, não vai', () => {
  const t = fichasComoTexto([{ nome: 'CAPS II', lat: 2.8235, lng: -60.6711 }, { nome: 'X', lat: 99, lng: 0 }]);
  assert.match(t, /Coordenadas: 2\.823500, -60\.671100/);
  assert.equal((t.match(/Coordenadas/g) || []).length, 1);
});

test('geo: Paulus.perguntar responde no aparelho, baixa o mapa sob demanda e não guarda conversão no histórico', async () => {
  let baixou = 0;
  const falso = async (url) => { baixou++; return { ok: true, json: async () => LUGARES }; };
  const sandbox = { self: {}, fetch: falso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'argo', pontos: PONTOS, lugaresUrl: 'lugares.json', memoria: false, minIntervaloMs: 0 });
  assert.equal(baixou, 0, 'não baixa antes de precisar');
  const r = await P.perguntar('UBS perto do CAPS II');
  assert.equal(r.tipo, 'geo'); assert.equal(r.tipoGeo, 'perto'); assert.equal(r.lugares[0].nome, 'UBS Centro');
  await P.perguntar('farmácia perto do CAPS II');
  assert.equal(baixou, 1, 'baixa uma vez só');
  const c = await P.perguntar('converter 2°49\'24.6"N 60°40\'32.9"W');
  assert.equal(c.tipo, 'geo'); assert.equal(c.sensivel, true); assert.equal(c.pergunta, '');
  const e = await P.perguntar('padronizar endereço: rua das flores 10, centro, boa vista - rr');
  assert.equal(e.tipoGeo, 'endereco'); assert.match(e.texto, /Rua Das Flores|Rua das Flores/);
  const rota = await P.perguntar('melhor ordem para visitar CRAS Cauamé, UBS Centro e CAPS II');
  assert.equal(rota.tipo, 'rota'); assert.ok(rota.gpx.includes('<gpx'));
  assert.equal(P.versao, '0.17.0');
});
