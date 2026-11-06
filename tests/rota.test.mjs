import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { lerPedidoDeRota, respostaDeRota, planejarRota, textoDaRota, svgDaRota, distanciaKm, resolverParadas, pontosDeRota } from '../shared/rota.mjs';
import { juntar } from '../scripts/build.mjs';

const P = (nome, lat, lng, extra) => Object.assign({ nome, lat, lng }, extra || {});
const PONTOS = [
  P('CRAS Cauamé', 2.8392, -60.6962), P('UBS Pintolândia', 2.8697, -60.7126), P('CAPS II', 2.8235, -60.6711),
  P('Conselho Tutelar', 2.8195, -60.6733), P('CREAS Centro', 2.8208, -60.6710), P('CRAS Caranã', 2.80, -60.69)
];
const R = (t, o) => respostaDeRota(t, Object.assign({ pontos: PONTOS, cidade: 'Boa Vista, RR' }, o || {}));

test('rota: distância de Boa Vista (centro → aeroporto) fica perto de 3 km em linha reta', () => {
  const km = distanciaKm({ lat: 2.8235, lng: -60.6758 }, { lat: 2.8463, lng: -60.6922 });
  assert.ok(km > 2.8 && km < 3.4, String(km));
});

test('rota: lê saída, paradas, volta, modo e tempo por parada', () => {
  const p = lerPedidoDeRota('traçar rota saindo do CRAS Cauamé: UBS Pintolândia, CAPS II, Conselho Tutelar, voltando ao CRAS Cauamé, de moto, 30 minutos em cada');
  assert.deepEqual(p.paradas, ['CRAS Cauamé', 'UBS Pintolândia', 'CAPS II', 'Conselho Tutelar']);
  assert.equal(p.volta, true); assert.equal(p.modo, 'moto'); assert.equal(p.minutosPorParada, 30); assert.equal(p.inicioFixo, true); assert.equal(p.otimizar, 'sim');
});

test('rota: "de X até Y passando por A e B" fixa as pontas e deixa o meio livre', () => {
  const p = lerPedidoDeRota('rota de CRAS Cauamé para o CAPS II passando por UBS Pintolândia e Conselho Tutelar');
  assert.deepEqual(p.paradas, ['CRAS Cauamé', 'UBS Pintolândia', 'Conselho Tutelar', 'CAPS II']);
  assert.ok(p.inicioFixo && p.fimFixo);
});

test('rota: conversa sobre rota (conceito, rota de fuga, "abrir rota de visita") NÃO é pedido de rota', () => {
  for (const t of ['o que é rota de visita?', 'qual a rota de fuga?', 'abrir rota de visita', 'me dá um roteiro de visita domiciliar', 'como organizar a rota de visitas, grupos e oficinas da semana?', 'rota de CRAS e CREAS', 'qual a rota de acesso ao benefício?']) {
    assert.equal(R(t), null, t);
  }
});

test('rota: acha a melhor ordem de verdade (força bruta confere) e economiza km', () => {
  const r = R('melhor ordem para visitar CRAS Cauamé, UBS Pintolândia, CAPS II e Conselho Tutelar');
  assert.ok(r.km > 0 && r.paradas.length === 4);
  // força bruta sobre as 24 permutações
  const pts = ['CRAS Cauamé', 'UBS Pintolândia', 'CAPS II', 'Conselho Tutelar'].map(n => PONTOS.find(p => p.nome === n));
  const perm = a => a.length < 2 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));
  const custo = o => o.slice(1).reduce((s, p, i) => s + distanciaKm(o[i], p) * 1.3, 0);
  const melhor = Math.min(...perm(pts).map(custo));
  assert.ok(Math.abs(r.km - melhor) < 0.01, r.km + ' x ' + melhor);
  assert.match(r.texto, /Ordem sugerida/);
});

test('rota: com volta e saída fixa mantém a saída e soma o retorno; tempo por parada entra no dia', () => {
  const r = R('traçar rota saindo do CRAS Cauamé: UBS Pintolândia, CAPS II, Conselho Tutelar, voltando ao CRAS Cauamé, de moto, 30 minutos em cada');
  assert.equal(r.paradas[0], 'CRAS Cauamé');
  assert.match(r.texto, /Volta para CRAS Cauamé/);
  assert.match(r.texto, /\+ 2 h nas paradas/);
  assert.match(r.texto, /moto, 4 paradas, voltando ao início/);
  assert.match(r.links[0].url, /origin=2\.839200%2C-60\.696200&destination=2\.839200%2C-60\.696200&waypoints=/);
});

test('rota: "nessa ordem" respeita a ordem escrita', () => {
  const r = R('rota nessa ordem: CRAS Cauamé, UBS Pintolândia, CAPS II, Conselho Tutelar');
  assert.deepEqual(r.paradas, ['CRAS Cauamé', 'UBS Pintolândia', 'CAPS II', 'Conselho Tutelar']);
  assert.match(r.texto, /Rota na ordem pedida/);
});

test('rota: setas valem como ordem do usuário e a palavra "rota" pode vir no fim', () => {
  const r = R('CRAS Cauamé -> UBS Pintolândia -> CAPS II rota');
  assert.deepEqual(r.paradas, ['CRAS Cauamé', 'UBS Pintolândia', 'CAPS II']);
});

test('rota: nome ambíguo pergunta qual; "CRAS" sozinho em pedido explícito também', () => {
  const r = R('traçar rota: CRAS, CAPS II');
  assert.equal(r.ambiguo, true);
  assert.match(r.texto, /CRAS Cauamé; CRAS Caranã/);
});

test('rota: unidade fora do diretório gera só o link por nome e avisa que não estimou', () => {
  const r = R('traçar rota CAPS II, Posto Fantasma e UBS Pintolândia');
  assert.equal(r.aproximada, true);
  assert.match(r.texto, /Não encontrei no diretório deste app: Posto Fantasma/);
  assert.match(r.links[0].url, /Posto%20Fantasma%2C%20Boa%20Vista%2C%20RR/);
  assert.equal(r.km, 0);
});

test('rota: sem diretório no app, ainda monta o link por nome e explica', () => {
  const r = respostaDeRota('como chegar ao CRAS Cauamé saindo do CAPS II', {});
  assert.match(r.texto, /não me passou o diretório/);
  assert.match(r.links[0].url, /destination=CRAS/);
});

test('rota: endereço de residência de família é recusado e não aparece no link', () => {
  const r = R('rota até Rua das Flores 123');
  assert.equal(r.bloqueio, true);
  assert.deepEqual(r.links, []);
  assert.doesNotMatch(JSON.stringify(r), /Flores/);
});

test('rota: "saindo daqui" usa a posição do aparelho quando o app passa, e o GPS do mapa quando não', () => {
  const com = R('melhor rota saindo daqui: CAPS II e UBS Pintolândia', { aparelho: { lat: 2.84, lng: -60.69 } });
  assert.equal(com.paradas[0], 'Sua posição');
  const sem = R('melhor rota saindo daqui: CAPS II e UBS Pintolândia');
  assert.match(sem.texto, /Saída: a sua posição atual/);
  assert.doesNotMatch(sem.links[0].url, /origin=/);
});

test('rota: acima de 11 paradas pede para dividir', () => {
  const lista = Array.from({ length: 12 }, (_, i) => 'Posto ' + (i + 1)).join(', ');
  assert.match(R('traçar rota: ' + lista).texto, /até 11 paradas/);
});

test('rota: coordenada com vírgula, latitude/longitude e ponto inválido; apelido acha a unidade', () => {
  const pts = pontosDeRota([{ nome: 'A', latitude: '2,83', longitude: '-60,69' }, { nome: 'B', lat: 99, lng: 0 }, { nome: 'Centro de Referência', lat: 2.8, lng: -60.6, apelidos: ['CREAS Sul'] }]);
  assert.equal(pts[0].lat, 2.83); assert.equal(pts[1].lat, null);
  assert.equal(resolverParadas(['creas sul'], pts)[0].ponto.nome, 'Centro de Referência');
});

test('rota: nome com "e" no meio é reunido quando as metades não existem sozinhas', () => {
  const pts = pontosDeRota([P('Casa de Apoio Paz e Vida', 2.8, -60.7), P('CAPS II', 2.82, -60.67)]);
  const res = resolverParadas(['Casa de Apoio Paz', 'Vida', 'CAPS II'], pts);
  assert.equal(res.length, 2); assert.equal(res[0].ponto.nome, 'Casa de Apoio Paz e Vida');
});

test('rota: esquema SVG escapa o nome vindo do diretório e o texto de rota tem aviso de estimativa', () => {
  const r = planejarRota([P('A <b>&"', 2.83, -60.69), P('B', 2.82, -60.67)], { modo: 'pe' });
  const svg = svgDaRota(r);
  assert.doesNotMatch(svg, /<b>/); assert.match(svg, /&lt;b&gt;&amp;&quot;/);
  assert.match(textoDaRota(r), /É estimativa: linha reta × 1,3 \(ruas\) a 4,5 km\/h/);
  assert.equal(r.geojson.features.length, 3);
});

// ------------------------------------------------------------ no navegador (dist/paulus.v1.js) e no Paulus.perguntar
function carregar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

test('rota: Paulus.perguntar responde no aparelho (sem rede), com tipo "rota", links e svg', async () => {
  const Paulus = carregar();
  Paulus.init({ app: 'argo', pontos: () => PONTOS, cidade: 'Boa Vista, RR', minIntervaloMs: 0 });
  const r = await Paulus.perguntar('traçar rota saindo do CRAS Cauamé: UBS Pintolândia, CAPS II e Conselho Tutelar, voltando ao CRAS Cauamé');
  assert.equal(r.tipo, 'rota');
  assert.match(r.texto, /Total: /);
  assert.ok(r.links[0].url.startsWith('https://www.google.com/maps/dir/'));
  assert.match(r.svg, /^<svg/);
  assert.equal(r.paradas[0], 'CRAS Cauamé');
  assert.ok(r.avisos.length === 1);
});

test('rota: posição do aparelho pode vir de função assíncrona; "abrir ..." continua mandando', async () => {
  const Paulus = carregar();
  let abriu = 0;
  Paulus.init({ app: 'anona', pontos: PONTOS, aparelho: async () => ({ lat: 2.84, lng: -60.69 }), minIntervaloMs: 0 });
  Paulus.registrarAcao({ id: 'rota-visita', rotulos: ['rota de visita'], executar() { abriu++; } });
  const r = await Paulus.perguntar('melhor rota saindo daqui: CAPS II e UBS Pintolândia');
  assert.equal(r.paradas[0], 'Sua posição');
  const a = await Paulus.perguntar('abrir rota de visita');
  assert.notEqual(a.tipo, 'rota');
});

test('rota: pergunta de conceito vai para o fluxo normal, não vira rota', async () => {
  const Paulus = carregar();
  Paulus.init({ app: 'argo', pontos: PONTOS, minIntervaloMs: 0 });
  const r = await Paulus.perguntar('o que é rota de visita?');
  assert.notEqual(r.tipo, 'rota');
});
