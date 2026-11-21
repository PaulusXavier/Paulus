// Monta o modelo 3D do mapa de Roraima (modelos/mapa-roraima-3d-didatico-v1.html): um arquivo único, sem biblioteca e sem rede.
//
//   node scripts/montar-mapa-roraima.mjs mun.json [saida.html]
//
// Entrada: GeoJSON dos 15 municípios (geodata-br, IBGE, CC0):
//   curl -o mun.json https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-14-mun.json
// Dados dos municípios: scripts/modelos/mapa-roraima.dados.json (população, área e % indígena vêm do Argo SUAS; edite lá).
// Gabarito: scripts/modelos/mapa-roraima.modelo.html (marcador /*__DADOS__*/null). Só dado público de município; nada de pessoa.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const rad = (g) => g * Math.PI / 180;

export function normalizar(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// área de um anel em km² sobre o elipsoide (SIRGAS 2000 / GRS80), pela latitude equivalente de área (Snyder)
const A_EQ = 6378.137, E2 = 0.00669438002290;
function qArea(lat) {
  const s = Math.sin(rad(lat)), e = Math.sqrt(E2);
  return (1 - E2) * (s / (1 - E2 * s * s) - Math.log((1 - e * s) / (1 + e * s)) / (2 * e));
}
export function areaAnelKm2(anel) {
  let s = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i], [x2, y2] = anel[i + 1];
    s += rad(x2 - x1) * (qArea(y1) + qArea(y2)) / 2;
  }
  return Math.abs(s) * A_EQ * A_EQ / 2;
}

// Douglas-Peucker (tolerância em graus). O anel é fechado (começo = fim), então ele é cortado em duas metades no ponto mais longe do começo.
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const manter = new Uint8Array(pts.length); manter[0] = manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop(); let dmax = 0, im = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > dmax) { dmax = d; im = i; } }
    if (dmax > tol && im > 0) { manter[im] = 1; pilha.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => manter[i]);
}
export function simplificar(anel, tol) {
  if (anel.length < 8) return anel;
  let k = 1, dm = -1;
  for (let i = 1; i < anel.length - 1; i++) { const d = Math.hypot(anel[i][0] - anel[0][0], anel[i][1] - anel[0][1]); if (d > dm) { dm = d; k = i; } }
  return dp(anel.slice(0, k + 1), tol).concat(dp(anel.slice(k), tol).slice(1));
}

function dentro(pt, anel) {
  let c = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-12)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
// ponto de rótulo: o ponto de dentro mais longe da borda (grade 36x36)
export function pontoDeRotulo(anel) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of anel) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let melhor = null, md = -1;
  for (let i = 0; i <= 36; i++) for (let j = 0; j <= 36; j++) {
    const p = [x0 + (x1 - x0) * i / 36, y0 + (y1 - y0) * j / 36];
    if (!dentro(p, anel)) continue;
    let d = 1e9; for (let k = 0; k < anel.length - 1; k++) d = Math.min(d, distSeg(p, anel[k], anel[k + 1]));
    if (d > md) { md = d; melhor = p; }
  }
  return melhor || [(x0 + x1) / 2, (y0 + y1) / 2];
}

export function montarDados(geojson, base) {
  const porId = new Map(base.municipios.map((m) => [m.id, m]));
  const saida = [];
  for (const f of geojson.features) {
    const id = normalizar(f.properties.name), b = porId.get(id);
    if (!b) throw new Error('município sem dados: ' + f.properties.name);
    const g = f.geometry;
    if (g.type !== 'Polygon') throw new Error(f.properties.name + ': esperava Polygon, veio ' + g.type);
    const anel = g.coordinates[0];
    const calc = areaAnelKm2(anel);
    const simples = simplificar(anel, 0.003).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
    const m = Object.assign({}, b, { areaCalcKm2: Math.round(calc), anel: simples, rotulo: pontoDeRotulo(simples).map((v) => +v.toFixed(3)) });
    if (m.areaKm2 == null) m.areaEstimada = true; // sem área oficial no Argo: usa a calculada do contorno
    saida.push(m);
  }
  if (saida.length !== base.municipios.length) throw new Error('faltam municípios no GeoJSON');
  return { v: 1, fonte: base.fonte, estado: base.estado, municipios: saida };
}

export function montarHtml(geojson, base, gabarito) {
  const dados = montarDados(geojson, base);
  if (!gabarito.includes('/*__DADOS__*/null')) throw new Error('gabarito sem o marcador /*__DADOS__*/null');
  return gabarito.replace('/*__DADOS__*/null', () => JSON.stringify(dados));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada) { console.error('uso: node scripts/montar-mapa-roraima.mjs mun.json [saida.html]'); process.exit(1); }
  const geo = JSON.parse(readFileSync(entrada, 'utf8'));
  const base = JSON.parse(readFileSync(join(AQUI, 'modelos', 'mapa-roraima.dados.json'), 'utf8'));
  const gab = readFileSync(join(AQUI, 'modelos', 'mapa-roraima.modelo.html'), 'utf8');
  const destino = saida || join(AQUI, '..', 'modelos', 'mapa-roraima-3d-didatico-v1.html');
  const html = montarHtml(geo, base, gab);
  writeFileSync(destino, html);
  const d = montarDados(geo, base);
  const soma = d.municipios.reduce((s, m) => s + m.pop, 0);
  console.log('Gerado ' + destino + ' (' + Math.round(html.length / 1024) + ' KB): ' + d.municipios.length + ' municípios, ' + d.municipios.reduce((s, m) => s + m.anel.length, 0) + ' pontos.');
  console.log('Soma da população: ' + soma + ' (estado no Argo: ' + base.estado.pop + ')');
  console.log('Área do contorno: ' + d.municipios.reduce((s, m) => s + m.areaCalcKm2, 0) + ' km² (oficial do estado: ' + base.estado.areaKm2 + ')');
}
