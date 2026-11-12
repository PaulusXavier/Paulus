import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ordenarVisitas, ordenarComSugestao, ruasDasVisitas, prepararGeo, aprenderVizinhanca, vizinhancaVazia, resumoVizinhanca, explicacaoDaOrdem, analisarEnderecoVisita } from '../shared/visitas.mjs';

const PARTIDA = 'Rua Santo Agostinho, nº 193 — Centenário, Boa Vista/RR';
const I = (...t) => t.map((endereco) => ({ endereco }));
const ends = (r) => r.itens.map((x) => x.endereco);
const NOMES = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Foxtrote', 'Golfe', 'Hotel', 'India', 'Julieta', 'Kilo', 'Lima', 'Mike', 'Novembro'];

// gerador determinístico (sem Math.random: o teste tem de dar o mesmo resultado sempre)
function sorteio(semente) { let s = semente; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function cenario(n, semente) {
  const r = sorteio(semente);
  const ruas = [{ rua: 'Rua Santo Agostinho', bairro: 'Centenário', lat: 2.82, lng: -60.67 }];
  for (let i = 0; i < n - 1; i++) ruas.push({ rua: 'Rua ' + NOMES[i], bairro: 'Centenário', lat: 2.80 + r() * 0.04, lng: -60.69 + r() * 0.04 });
  return { ruas, itens: I(...ruas.map((x) => x.rua + ', 10 — Centenário')) };
}
const dist = (a, b) => { const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)) * 1.3; };
function melhorForca(pts) {   // fixa o ponto 0 (a partida) e testa todas as ordens do resto
  let melhor = Infinity;
  const resto = pts.slice(1);
  (function perm(ar, k) {
    if (k === ar.length) { let c = dist(pts[0], ar[0]); for (let i = 1; i < ar.length; i++) c += dist(ar[i - 1], ar[i]); if (c < melhor) melhor = c; return; }
    for (let i = k; i < ar.length; i++) { [ar[k], ar[i]] = [ar[i], ar[k]]; perm(ar, k + 1); [ar[k], ar[i]] = [ar[i], ar[k]]; }
  })(resto, 0);
  return melhor;
}
function custoDaSaida(r, ruas) {
  const por = new Map(ruas.map((x) => [analisarEnderecoVisita(x.rua + ', 10').chave, x]));
  const seq = []; r.ruas.forEach((u) => { seq.push(por.get(u.id.split('|')[0].replace(/^rua /, ''))); });
  let c = 0; for (let i = 1; i < seq.length; i++) c += dist(seq[i - 1], seq[i]); return c;
}

test('visitas v0.15: ordem natural (Rua 2 antes de Rua 10) e abreviações do nome', () => {
  const r = ordenarVisitas(I('Rua 10, 5', 'Rua 2, 5', 'Rua 1, 5', 'Rua 11, 5'), '');
  assert.deepEqual(ends(r), ['Rua 1, 5', 'Rua 2, 5', 'Rua 10, 5', 'Rua 11, 5']);
  assert.equal(analisarEnderecoVisita('Av. Cap. Ene Garcez, 10').chave, analisarEnderecoVisita('Avenida Capitão Ene Garcez, 20').chave);
  assert.equal(analisarEnderecoVisita('Rua Sta. Luzia, 3').chave, 'santa luzia');
});

test('visitas v0.15: uma letra errada não cria rua nova; Rua 10 e Rua 11 nunca se juntam', () => {
  const r = ordenarVisitas(I('Rua Santo Agostinho, 3 — Centenário', 'Rua Zeca, 1 — Centenário', 'Rua Santo Agostino, 1 — Centenário', 'Rua Santo Agostinho, 5 — Centenário'), '');
  assert.deepEqual(ends(r).slice(0, 3), ['Rua Santo Agostino, 1 — Centenário', 'Rua Santo Agostinho, 3 — Centenário', 'Rua Santo Agostinho, 5 — Centenário']);
  assert.equal(ruasDasVisitas(I('Rua 10, 1 — X', 'Rua 11, 1 — X')).ruas.length, 2);
  assert.equal(ruasDasVisitas(I('Rua Santo Agostinho, 1 — A', 'Rua Santo Agostinho, 2 — B')).ruas.length, 2);   // bairros diferentes: ruas diferentes
});

test('geo: com coordenadas a ordem das ruas é a ÓTIMA (confere com força bruta, 7 ruas)', () => {
  for (const semente of [1, 7, 42]) {
    const { ruas, itens } = cenario(7, semente);
    const r = ordenarVisitas(itens, PARTIDA, { geo: { ruas } });
    assert.equal(r.metodo, 'geografia');
    assert.equal(r.ruas[0].id, 'rua santo agostinho|centenario');   // começa pela partida
    const otimo = melhorForca(ruas);
    assert.ok(Math.abs(custoDaSaida(r, ruas) - otimo) < 1e-6, 'semente ' + semente);
    assert.ok(Math.abs(r.km - otimo) < 0.01);
    assert.ok(r.kmLegado >= r.km - 1e-9 && r.economiaKm >= 0);
  }
});

test('geo: com mais de 9 ruas (vizinho mais próximo + 2-opt) fica a menos de 10% do ótimo e nunca pior que o alfabético', () => {
  for (const semente of [3, 11]) {
    const { ruas, itens } = cenario(11, semente);
    const r = ordenarVisitas(itens, PARTIDA, { geo: { ruas } });
    const otimo = melhorForca(ruas);
    assert.ok(r.km <= otimo * 1.10 + 1e-6, `km ${r.km} ótimo ${otimo}`);
    assert.ok(r.km <= r.kmLegado + 1e-9);
  }
});

test('geo: lista grande (300 ruas) termina rápido e devolve todas as famílias uma vez', () => {
  const r0 = sorteio(5); const ruas = []; const itens = [];
  for (let i = 0; i < 300; i++) { const nome = 'Rua Teste' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) + 'xyz'; ruas.push({ rua: nome, bairro: 'Centenário', lat: 2.78 + r0() * 0.08, lng: -60.72 + r0() * 0.08 }); itens.push({ endereco: nome + ', 5 — Centenário' }); }
  const t0 = Date.now();
  const r = ordenarVisitas(itens, PARTIDA, { geo: { ruas } });
  assert.ok(Date.now() - t0 < 4000, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.equal(r.itens.length, 300); assert.equal(new Set(r.indices).size, 300);
  assert.ok(r.km < r.kmLegado);
});

test('geo: sem coordenadas o resultado é o de sempre; coordenada parcial não inventa km', () => {
  const sem = ordenarVisitas(I('Rua Zeca, 10', 'Rua Alfa, 50'), PARTIDA);
  assert.equal(sem.metodo, 'texto'); assert.equal(sem.km, null); assert.equal(sem.economiaKm, 0);
  const parcial = ordenarVisitas(I('Rua Zeca, 10 — Centenário', 'Rua Alfa, 50 — Centenário', 'Rua Beta, 3 — Centenário'), PARTIDA, { geo: { ruas: [{ rua: 'Rua Zeca', bairro: 'Centenário', lat: 2.8, lng: -60.7 }, { rua: 'Rua Alfa', bairro: 'Centenário', lat: 2.81, lng: -60.7 }] } });
  assert.equal(parcial.metodo, 'geografia'); assert.equal(parcial.km, null); assert.ok(parcial.cobertura > 0.6 && parcial.cobertura < 0.7);
});

test('geo: coordenada só do bairro vale, marca nivelGeo e usa partidaPonto como saída', () => {
  const geo = { bairros: [{ bairro: 'Centenário', lat: 2.82, lng: -60.67 }, { bairro: '13 de Setembro', lat: 2.84, lng: -60.66 }, { bairro: 'Caranã', lat: 2.87, lng: -60.64 }], ruas: [] };
  const itens = I('Rua A, 1 — Caranã', 'Rua B, 1 — 13 de Setembro', 'Rua C, 1 — Centenário');
  const r = ordenarVisitas(itens, '', { geo, partidaPonto: { lat: 2.819, lng: -60.671 } });
  assert.deepEqual(r.ruas.map((x) => x.rotulo), ['Rua C — Centenario', 'Rua B — 13 de Setembro', 'Rua A — Carana']);
  assert.equal(r.nivelGeo, 'bairro');
});

test('geo: lat/lng inválidos são ignorados; geo malformado não quebra', () => {
  const itens = I('Rua A, 1', 'Rua B, 1');
  for (const geo of [null, 'x', {}, { ruas: 'z' }, { ruas: [{ rua: 'Rua A', lat: 'abc', lng: 1 }, null, { rua: '', lat: 1, lng: 1 }] }, { ruas: [{ rua: 'Rua A', lat: 0, lng: 0 }] }]) {
    const r = ordenarVisitas(itens, '', { geo });
    assert.equal(r.metodo, 'texto'); assert.equal(r.itens.length, 2);
  }
  assert.equal(prepararGeo({ ruas: [{ rua: 'Rua A', lat: 95, lng: 0 }] }).n, 0);
});

test('vizinhança aprendida: a sequência que a equipe usou vira "perto"', () => {
  const itens = I('Rua Alfa, 1 — X', 'Rua Bravo, 1 — X', 'Rua Charlie, 1 — X', 'Rua Delta, 1 — X');
  // alfabética: Alfa, Bravo, Charlie, Delta. A equipe prefere Alfa → Delta → Charlie → Bravo:
  const ajustada = I('Rua Alfa, 1 — X', 'Rua Delta, 1 — X', 'Rua Charlie, 1 — X', 'Rua Bravo, 1 — X');
  let viz = vizinhancaVazia();
  viz = aprenderVizinhanca(viz, ajustada, '');
  assert.deepEqual(resumoVizinhanca(viz), { ligacoes: 3, ruas: 4 });
  const r = ordenarVisitas(itens, 'Rua Alfa, 1 — X', { vizinhanca: viz });
  assert.equal(r.metodo, 'aprendido');
  assert.deepEqual(ends(r), ajustada.map((x) => x.endereco));
  // sem aprendizado: alfabética
  assert.deepEqual(ends(ordenarVisitas(itens, 'Rua Alfa, 1 — X')), itens.map((x) => x.endereco));
  // vizinhança de outras ruas não muda nada
  const outra = aprenderVizinhanca(null, I('Rua Zulu, 1 — Y', 'Rua Yankee, 1 — Y'), '');
  assert.equal(ordenarVisitas(itens, '', { vizinhanca: outra }).metodo, 'texto');
});

test('vizinhança aprendida: guarda só nome de rua e bairro (nunca número de casa nem nome), limita o tamanho e ignora lixo', () => {
  const viz = aprenderVizinhanca(null, I('Rua Alfa, 193 — X', 'Rua Bravo, 77 — X'), '');
  const texto = JSON.stringify(viz);
  assert.ok(!/193|77/.test(texto));
  assert.equal(aprenderVizinhanca('lixo', I('Rua A, 1', 'Rua B, 1'), '').v, 1);
  assert.equal(ordenarVisitas(I('Rua A, 1', 'Rua B, 1'), '', { vizinhanca: { pares: 'x' } }).metodo, 'texto');
  let g = vizinhancaVazia();
  for (let i = 0; i < 60; i++) { const lista = []; for (let j = 0; j < 40; j++) lista.push({ endereco: 'Rua R' + i + 'x' + j + ', 1 — X' }); g = aprenderVizinhanca(g, lista, ''); }
  assert.ok(resumoVizinhanca(g).ligacoes <= 1500);
});

test('ordem de ruas proposta (IA): vale se for válida; inválida é descartada; faltou rua, entra no fim', () => {
  const itens = I('Rua Alfa, 3 — X', 'Rua Bravo, 3 — X', 'Rua Alfa, 1 — X', 'Rua Charlie, 8 — X');
  const { ruas } = ruasDasVisitas(itens, '');
  assert.deepEqual(ruas.map((x) => [x.rotulo, x.quantidade]), [['Rua Alfa — X', 2], ['Rua Bravo — X', 1], ['Rua Charlie — X', 1]]);
  assert.ok(ruas.every((x) => !/\d/.test(x.rotulo)), 'o rótulo não tem número de casa');
  const ids = ruas.map((x) => x.id);
  let r = ordenarVisitas(itens, '', { ordemDeRuas: [ids[2], ids[0], ids[1]] });
  assert.equal(r.metodo, 'ruas-informadas');
  assert.deepEqual(ends(r), ['Rua Charlie, 8 — X', 'Rua Alfa, 1 — X', 'Rua Alfa, 3 — X', 'Rua Bravo, 3 — X']);   // casas em ordem dentro da rua: é do programa
  r = ordenarVisitas(itens, '', { ordemDeRuas: [ids[0], 'rua inventada|x', ids[1]] });
  assert.equal(r.metodo, 'texto'); assert.equal(r.ordemRuasInvalida, 'rua desconhecida'); assert.equal(r.itens.length, 4);
  r = ordenarVisitas(itens, '', { ordemDeRuas: [ids[1], ids[1], ids[0]] });
  assert.equal(r.ordemRuasInvalida, 'rua repetida');
  r = ordenarVisitas(itens, '', { ordemDeRuas: [ids[2]] });
  assert.equal(r.ordemRuasIncompleta, 2); assert.equal(r.itens.length, 4); assert.equal(new Set(r.indices).size, 4);
  r = ordenarVisitas(itens, '', { ordemDeRuas: 'não é lista' });
  assert.equal(r.metodo, 'texto');
});

test('ordenarComSugestao: com coordenadas, a IA só vale se não for pior; sem coordenadas, vale e diz que não conferiu', () => {
  const { ruas, itens } = cenario(6, 9);
  const geo = { ruas };
  const { ruas: lista } = ruasDasVisitas(itens, PARTIDA);
  const ids = lista.map((x) => x.id);
  const otima = ordenarVisitas(itens, PARTIDA, { geo }).ruas.map((x) => x.id);
  let r = ordenarComSugestao(itens, PARTIDA, otima, { geo });
  assert.equal(r.origem, 'ia'); assert.equal(r.verificada, true);
  const pessima = ids.slice().sort((a, b) => (a === ids[0] ? -1 : b === ids[0] ? 1 : 0)).reverse();
  const pior = (() => { let melhor = null, kmMax = -1; [ids.slice(), ids.slice().reverse(), ids.slice(1).concat(ids[0])].forEach((o) => { const x = ordenarVisitas(itens, PARTIDA, { geo, ordemDeRuas: o }); if (x.km > kmMax) { kmMax = x.km; melhor = o; } }); return melhor; })();
  r = ordenarComSugestao(itens, PARTIDA, pior, { geo });
  const programa = ordenarVisitas(itens, PARTIDA, { geo });
  const piorKm = ordenarVisitas(itens, PARTIDA, { geo, ordemDeRuas: pior }).km;
  assert.ok(piorKm > programa.km);
  assert.equal(r.origem, 'programa'); assert.match(r.motivo, /km/);
  assert.equal(r.km, programa.km);
  r = ordenarComSugestao(itens, PARTIDA, ['rua que não existe|x'], { geo });
  assert.equal(r.origem, 'programa'); assert.match(r.motivo, /inválida/);
  r = ordenarComSugestao(itens, PARTIDA, ids.slice().reverse(), {});
  assert.equal(r.origem, 'ia'); assert.equal(r.verificada, false);
  r = ordenarComSugestao(itens, PARTIDA, null, {});
  assert.equal(r.origem, 'programa');
  void pessima;
});

test('explicação não promete mais do que o método usado', () => {
  const { ruas, itens } = cenario(5, 2);
  const g = ordenarVisitas(itens, PARTIDA, { geo: { ruas } });
  assert.match(explicacaoDaOrdem(g), /coordenadas guardadas neste app/);
  assert.match(explicacaoDaOrdem(g), /estimativa|Estimativa/);
  assert.match(explicacaoDaOrdem(g), /linha reta/);
  assert.match(explicacaoDaOrdem(ordenarVisitas(itens, PARTIDA)), /sem mapa/);
  assert.match(explicacaoDaOrdem({ metodo: 'ruas-informadas', verificada: false }), /sem como conferir/);
  assert.match(explicacaoDaOrdem({ metodo: 'aprendido' }), /só neste aparelho/);
  assert.ok(!/internet.*enviad|enviou/.test(explicacaoDaOrdem(g)) || /nada foi enviado/.test(explicacaoDaOrdem(g)));
});

test('não muta a entrada nem a geo, e o módulo continua sem rede', () => {
  const { ruas, itens } = cenario(6, 4); const geo = { ruas }; const a = JSON.stringify([itens, geo]);
  ordenarVisitas(itens, PARTIDA, { geo, vizinhanca: vizinhancaVazia() });
  assert.equal(JSON.stringify([itens, geo]), a);
  const src = readFileSync(new URL('../shared/visitas.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|import\s+/.test(src));
});

test('o pacote do navegador expõe a API nova e ela funciona sem import/export', async () => {
  const vm = await import('node:vm'); const { juntar } = await import('../scripts/build.mjs');
  const ctx = { self: {}, console }; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(juntar(), ctx);
  const V = ctx.Paulus.visitas;
  ['ordenar', 'comSugestao', 'ruas', 'aprender', 'vizinhancaVazia', 'resumoVizinhanca', 'explicar'].forEach((k) => assert.equal(typeof V[k], 'function', k));
  const r = V.ordenar([{ endereco: 'Rua Alfa, 1 — X' }, { endereco: 'Rua Zeta, 1 — X' }], '', { geo: { ruas: [{ rua: 'Rua Alfa', bairro: 'X', lat: 2.8, lng: -60.6 }, { rua: 'Rua Zeta', bairro: 'X', lat: 2.81, lng: -60.6 }] } });
  assert.equal(r.metodo, 'geografia'); assert.ok(r.km > 0);
});

test('montar-geografia: Overpass vira geo que o ordenador entende (rua de mesmo nome em bairros diferentes, sem endereço de ninguém)', async () => {
  const { montarGeografia } = await import('../scripts/montar-geografia.mjs');
  const overpass = { elements: [
    { type: 'node', tags: { name: 'Centenário', place: 'suburb' }, lat: 2.82, lon: -60.67 },
    { type: 'node', tags: { name: 'Caranã', place: 'suburb' }, lat: 2.87, lon: -60.64 },
    { type: 'way', tags: { name: 'Rua 1', highway: 'residential' }, center: { lat: 2.821, lon: -60.671 } },
    { type: 'way', tags: { name: 'Rua 1', highway: 'residential' }, center: { lat: 2.871, lon: -60.641 } },
    { type: 'way', tags: { name: 'Rua Santo Agostinho', highway: 'residential' }, center: { lat: 2.8205, lon: -60.6705 } },
    { type: 'way', tags: { highway: 'residential' }, center: { lat: 2.9, lon: -60.6 } },
    { type: 'way', tags: { name: 'Sem centro', highway: 'residential' } }
  ] };
  const g = montarGeografia(overpass);
  assert.equal(g.bairros.length, 2);
  assert.deepEqual(g.ruas.map((r) => r.rua + '|' + r.bairro), ['Rua 1|Caranã', 'Rua 1|Centenário', 'Rua Santo Agostinho|Centenário']);
  assert.ok(!/residencia|familia|nis|cpf/i.test(JSON.stringify(g)));
  const r = ordenarVisitas(I('Rua 1, 4 — Caranã', 'Rua Santo Agostinho, 193 — Centenário', 'Rua 1, 9 — Centenário'), PARTIDA, { geo: g });
  assert.equal(r.metodo, 'geografia'); assert.equal(r.nivelGeo, 'rua');
  assert.deepEqual(r.ruas.map((x) => x.rotulo), ['Rua Santo Agostinho — Centenario', 'Rua 1 — Centenario', 'Rua 1 — Carana']);
});

test('geo: rua do mapa sem bairro serve a qualquer bairro, se for a única de mesmo nome', () => {
  const geo = { ruas: [{ rua: 'Rua Zeca Marques', lat: 2.8, lng: -60.7 }, { rua: 'Rua Beta Alfa', lat: 2.81, lng: -60.7 }, { rua: 'Rua Beta Alfa', lat: 2.9, lng: -60.7 }] };
  const r = ordenarVisitas(I('Rua Zeca Marques, 1 — Pricumã', 'Rua Beta Alfa, 1 — Pricumã'), '', { geo });
  assert.equal(r.cobertura, 0.5);   // a "Beta Alfa" existe duas vezes no mapa: ambígua, não chuta
});
