// Monta o arquivo de coordenadas de ruas e bairros (geografia.json) que o Paulus usa para ordenar visitas pela MENOR DISTÂNCIA.
//
//   node scripts/montar-geografia.mjs overpass.json geografia.json
//
// Entrada: resposta do Overpass API (OpenStreetMap) com ruas e bairros da cidade, com centro de cada elemento. Consulta (cole em overpass-turbo.eu e exporte "dados brutos"):
//   [out:json][timeout:120];
//   area["name"="Boa Vista"]["admin_level"="8"]->.c;
//   ( way(area.c)["highway"]["name"]; nwr(area.c)["place"~"suburb|neighbourhood|quarter"]["name"]; );
//   out center;
// Saída: { ruas: [{ rua, bairro, lat, lng }], bairros: [{ bairro, lat, lng }] }. Só ponto central de RUA e de BAIRRO (dado público do mapa);
// nunca ponto de residência. O Anona carrega esse arquivo do próprio site; nada vai a servidor nenhum.
//
// Limites (de propósito, para não prometer o que não tem): o bairro de cada rua é o de centro mais próximo (aproximação, sem limite de bairro);
// o centro de uma rua comprida é a mediana dos trechos, não a casa onde a equipe vai. Confira no mapa antes de publicar.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function mediana(v) { const o = v.slice().sort((a, b) => a - b); const m = o.length >> 1; return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; }
function centro(e) {
  if (e.center && isFinite(e.center.lat) && isFinite(e.center.lon)) return [e.center.lat, e.center.lon];
  if (isFinite(e.lat) && isFinite(e.lon)) return [e.lat, e.lon];
  return null;
}
function km2(a, b) { const dx = (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180); const dy = a[0] - b[0]; return dx * dx + dy * dy; }   // só para comparar qual está mais perto

export function montarGeografia(overpass) {
  const els = Array.isArray(overpass && overpass.elements) ? overpass.elements : [];
  const bairros = [];
  const vias = new Map();
  els.forEach((e) => {
    const nome = e && e.tags && String(e.tags.name || '').replace(/\s+/g, ' ').trim();
    const c = e && centro(e);
    if (!nome || !c) return;
    if (e.tags.place) bairros.push({ bairro: nome, lat: c[0], lng: c[1] });
    else if (e.tags.highway) {
      let lista = vias.get(nome); if (!lista) { lista = []; vias.set(nome, lista); }
      lista.push(c);
    }
  });
  const ruas = [];
  vias.forEach((trechos, nome) => {
    // com bairros, cada trecho vai ao bairro de centro mais próximo e a rua vira uma entrada por bairro ("Rua 1" existe em vários)
    const grupos = new Map();
    trechos.forEach((c) => {
      let b = '';
      if (bairros.length) { let melhor = Infinity; bairros.forEach((x) => { const d = km2(c, [x.lat, x.lng]); if (d < melhor) { melhor = d; b = x.bairro; } }); }
      if (!grupos.has(b)) grupos.set(b, []);
      grupos.get(b).push(c);
    });
    grupos.forEach((cs, b) => ruas.push({ rua: nome, bairro: b, lat: Number(mediana(cs.map((c) => c[0])).toFixed(6)), lng: Number(mediana(cs.map((c) => c[1])).toFixed(6)) }));
  });
  ruas.sort((a, b) => a.rua.localeCompare(b.rua, 'pt-BR') || a.bairro.localeCompare(b.bairro, 'pt-BR'));
  bairros.sort((a, b) => a.bairro.localeCompare(b.bairro, 'pt-BR'));
  return { fonte: 'OpenStreetMap (ODbL), © colaboradores do OpenStreetMap', gerado: new Date().toISOString().slice(0, 10), ruas, bairros: bairros.map((b) => ({ bairro: b.bairro, lat: Number(b.lat.toFixed(6)), lng: Number(b.lng.toFixed(6)) })) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada || !saida) { console.error('Uso: node scripts/montar-geografia.mjs overpass.json geografia.json'); process.exit(1); }
  const g = montarGeografia(JSON.parse(readFileSync(entrada, 'utf8')));
  writeFileSync(saida, JSON.stringify(g));
  console.log(g.ruas.length + ' ruas e ' + g.bairros.length + ' bairros em ' + saida);
}
