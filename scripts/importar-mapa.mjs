// Transforma lugares do mapa (OpenStreetMap, via Overpass) em documento de apoio da base do Paulus.
//
//   node scripts/importar-mapa.mjs overpass-lugares.json [knowledge/documentos/mapa-boa-vista-osm.md]
//   npm run build:conhecimento
//
// Entrada: resposta do Overpass API (JSON bruto, "out center;") ou o GeoJSON do overpass-turbo (Exportar > GeoJSON) com os lugares da cidade. Consulta para colar em overpass-turbo.eu
// (Exportar > dados brutos JSON). Já traz os bairros, para cada lugar cair no bairro mais próximo:
//   [out:json][timeout:180];
//   area["name"="Boa Vista"]["admin_level"="8"]->.c;
//   (
//     nwr(area.c)["amenity"~"school|kindergarten|college|university|hospital|clinic|doctors|dentist|pharmacy|social_facility|community_centre|police|fire_station|courthouse|townhall|library|marketplace|place_of_worship|bank|post_office"]["name"];
//     nwr(area.c)["healthcare"]["name"];
//     nwr(area.c)["office"~"government|ngo|association"]["name"];
//     nwr(area.c)["leisure"~"park|sports_centre|stadium"]["name"];
//     nwr(area.c)["place"~"suburb|neighbourhood|quarter"]["name"];
//   );
//   out center;
//
// Saída: um .md no formato de knowledge/documentos (tipo referencia, revisao pendente), com um resumo por categoria e, para cada
// categoria e bairro, a lista de nomes (com endereço e telefone quando o mapa tem). Só lugar público e serviço: nunca residência.
//
// Limites (de propósito): é o OpenStreetMap, não o Google Maps. O Google não permite copiar seu mapa em massa, e o OSM é aberto (ODbL).
// O OSM de Boa Vista é incompleto e pode estar desatualizado; endereço e telefone de serviço vêm do diretório do Argo, não daqui.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Ordem importa: a primeira regra que combina define a categoria.
const REGRAS = [
  ['Assistência social', (t) => !!t.social_facility || t.amenity === 'social_facility' || t.amenity === 'community_centre'],
  ['Saúde', (t) => ['hospital', 'clinic', 'doctors', 'dentist'].includes(t.amenity) || (t.healthcare && t.healthcare !== 'pharmacy')],
  ['Farmácias', (t) => t.amenity === 'pharmacy' || t.healthcare === 'pharmacy'],
  ['Creches e pré-escolas', (t) => t.amenity === 'kindergarten'],
  ['Escolas', (t) => t.amenity === 'school'],
  ['Ensino superior', (t) => ['college', 'university'].includes(t.amenity)],
  ['Cursos e escolas livres', (t) => ['language_school', 'music_school', 'prep_school', 'driving_school', 'dancing_school', 'training'].includes(t.amenity)],
  ['Segurança e justiça', (t) => ['police', 'fire_station', 'courthouse'].includes(t.amenity)],
  ['Órgãos públicos', (t) => t.amenity === 'townhall' || t.office === 'government' || t.amenity === 'post_office'],
  ['Terceiro setor', (t) => ['ngo', 'association', 'quango'].includes(t.office)],
  ['Cultura, esporte e lazer', (t) => t.amenity === 'library' || ['park', 'sports_centre', 'stadium', 'water_park'].includes(t.leisure) || t.tourism === 'attraction' || t.amenity === 'marketplace'],
  ['Templos', (t) => t.amenity === 'place_of_worship'],
  ['Bancos', (t) => t.amenity === 'bank'],
];

const ORDEM = REGRAS.map((r) => r[0]);
// O que cada categoria reúne, dito com as palavras que a pessoa usa na pergunta (ajuda a busca: "UBS", "creche", "fórum"...). Só descreve a regra acima.
const DICA = {
  'Assistência social': 'serviços socioassistenciais e centros comunitários',
  'Saúde': 'UBS, postos, clínicas, hospitais e laboratórios',
  'Farmácias': 'farmácias e drogarias',
  'Creches e pré-escolas': 'creches e educação infantil',
  'Escolas': 'escolas',
  'Ensino superior': 'universidades e faculdades',
  'Cursos e escolas livres': 'cursos de idiomas, música, preparatórios e autoescolas',
  'Segurança e justiça': 'polícia, bombeiros, fóruns e tribunais',
  'Órgãos públicos': 'secretarias, prefeitura, órgãos de governo e correios',
  'Terceiro setor': 'ONGs e associações',
  'Cultura, esporte e lazer': 'parques, praças, ginásios, bibliotecas e feiras',
  'Templos': 'igrejas e templos',
  'Bancos': 'bancos',
};

function limpar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/[<>]/g, '').trim(); }
function centro(e) {
  if (e.center && isFinite(e.center.lat) && isFinite(e.center.lon)) return [e.center.lat, e.center.lon];
  if (isFinite(e.lat) && isFinite(e.lon)) return [e.lat, e.lon];
  return null;
}
function chaveNome(s) { return limpar(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function d2(a, b) { const dx = (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180); const dy = a[0] - b[0]; return dx * dx + dy * dy; }
function categoria(tags) { const r = REGRAS.find((x) => x[1](tags)); return r ? r[0] : null; }
function endereco(t) {
  const rua = limpar(t['addr:street']); if (!rua) return '';
  return rua + (t['addr:housenumber'] ? ', ' + limpar(t['addr:housenumber']) : '');
}

// Roraima inteira (caixa de coordenadas). Serve para tirar do arquivo as "Boa Vista" de outros estados (há uma na Paraíba).
const RORAIMA = { latMin: 0.5, latMax: 5.3, lonMin: -64.9, lonMax: -58.9 };
const RURAL = 'Zona rural e comunidades';
const KM_RURAL = 5;   // lugar a mais de 5 km do centro de qualquer bairro vai para "Zona rural", em vez de ser colado num bairro distante

function pontosGeo(g) {
  if (!g || !g.coordinates) return [];
  const c = g.coordinates;
  if (g.type === 'Point') return [c];
  if (g.type === 'LineString' || g.type === 'MultiPoint') return c;
  if (g.type === 'Polygon') return c[0] || [];
  if (g.type === 'MultiPolygon') return c.reduce((a, p) => a.concat(p[0] || []), []);
  return [];
}

// Aceita o JSON bruto do Overpass ({elements}) ou o GeoJSON que o overpass-turbo exporta ({features}).
export function comoElementos(entrada) {
  if (entrada && Array.isArray(entrada.elements)) return entrada.elements;
  if (entrada && Array.isArray(entrada.features)) {
    return entrada.features.map((f) => {
      const p = pontosGeo(f.geometry); if (!p.length) return null;
      const lon = p.reduce((a, x) => a + x[0], 0) / p.length, lat = p.reduce((a, x) => a + x[1], 0) / p.length;
      return { tags: f.properties || {}, lat, lon };
    }).filter(Boolean);
  }
  return [];
}

export function lugaresDoMapa(overpass) {
  const todos = comoElementos(overpass);
  const els = todos.filter((e) => { const c = centro(e); return c && c[0] >= RORAIMA.latMin && c[0] <= RORAIMA.latMax && c[1] >= RORAIMA.lonMin && c[1] <= RORAIMA.lonMax; });
  const descartados = todos.length - els.length;
  const bairros = [];
  const lugares = [];
  const vistos = new Map();
  els.forEach((e) => {
    const t = (e && e.tags) || {}; const nome = limpar(t.name); const c = e && centro(e);
    if (!nome || !c) return;
    if (t.place && /^(suburb|neighbourhood|quarter)$/.test(t.place)) { if (!/^zona rural$/i.test(nome)) bairros.push({ bairro: nome, c }); return; }   // "Zona Rural" do mapa não é bairro: vira o rótulo da zona rural
    const cat = categoria(t); if (!cat) return;
    // o mesmo lugar mapeado duas vezes (ponto e prédio, por exemplo): mesmo nome e categoria a menos de 400 m conta uma vez só
    const nk = cat + '|' + chaveNome(nome);
    const outros = vistos.get(nk) || [];
    if (outros.some((o) => Math.sqrt(d2(o, c)) * 111 < 0.4)) return;
    outros.push(c); vistos.set(nk, outros);
    lugares.push({ nome, cat, c, tags: t });
  });
  lugares.forEach((l) => {
    let b = limpar(l.tags['addr:suburb'] || l.tags['addr:neighbourhood']);
    if (/^zona rural$/i.test(b)) b = RURAL;
    if (!b && bairros.length) {
      let m = Infinity, n = '';
      bairros.forEach((x) => { const d = d2(l.c, x.c); if (d < m) { m = d; n = x.bairro; } });
      b = Math.sqrt(m) * 111 <= KM_RURAL ? n : RURAL;   // grau de latitude ≈ 111 km
    }
    l.bairro = b || 'Sem bairro no mapa';
  });
  return { lugares, bairros: bairros.length, descartados };
}

export function montarMarkdown(overpass, opcoes) {
  const { lugares, bairros, descartados } = lugaresDoMapa(overpass);
  const hoje = (opcoes && opcoes.data) || new Date().toISOString().slice(0, 10);
  const cidade = (opcoes && opcoes.cidade) || 'Boa Vista (RR)';
  const porCat = new Map();
  lugares.forEach((l) => {
    if (!porCat.has(l.cat)) porCat.set(l.cat, new Map());
    const m = porCat.get(l.cat); if (!m.has(l.bairro)) m.set(l.bairro, []); m.get(l.bairro).push(l);
  });
  const L = [];
  L.push('---', 'doc: mapa-boa-vista-osm', 'titulo: Mapa de Boa Vista: lugares e serviços por bairro (OpenStreetMap)',
    'norma: Lista de lugares e serviços de ' + cidade + ' tirada do OpenStreetMap em ' + hoje + ' (© colaboradores do OpenStreetMap, licença ODbL). Não é norma nem cadastro oficial: o mapa é colaborativo, incompleto e pode estar desatualizado. O bairro de cada lugar é o do mapa ou, na falta, o de centro mais próximo até 5 km (aproximação); mais longe que isso vai para zona rural e comunidades. Endereço e telefone de serviço oficial vêm do diretório do Argo.',
    'ano: ' + hoje.slice(0, 4), 'tipo: referencia', 'pacote: psicologia', 'worker: nao', 'revisao: pendente', '---', '',
    '<!-- Gerado por scripts/importar-mapa.mjs. Não editar à mão: rode o script de novo com um Overpass novo. -->', '');
  const cats = ORDEM.filter((c) => porCat.has(c));
  const total = (c) => { let n = 0; porCat.get(c).forEach((v) => { n += v.length; }); return n; };
  // Atenção: a IA recebe só os primeiros MAX caracteres de cada trecho (MAX_TEXTO_TRECHO = 700 em shared/busca.mjs). Por isso as listas
  // são partidas em pedaços que cabem, e cada pedaço repete a contagem total no começo: nada some no corte.
  const MAX = 520;
  L.push('## Resumo do mapa');
  L.push(lugares.length + ' lugares com nome em ' + cidade + ', em ' + bairros + ' bairros e conjuntos do mapa' + (descartados ? ' (' + descartados + ' pontos de fora de Roraima descartados, como os da Boa Vista da Paraíba)' : '') + '. Por categoria: ' + cats.map((c) => c.toLowerCase() + ' ' + total(c)).join('; ') + '. O município é grande: o que está longe de qualquer bairro aparece como ' + RURAL.toLowerCase() + '.');
  L.push('');
  cats.forEach((c) => {
    const m = porCat.get(c);
    const top = [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 8).map(([b, v]) => b + ' (' + v.length + ')').join('; ');
    L.push('## Resumo de ' + c.toLowerCase() + ' no mapa', total(c) + ' lugares de ' + c.toLowerCase() + ' no mapa de ' + cidade + ', em ' + m.size + ' bairros. Bairros com mais: ' + top + '.', '');
  });
  const porBairro = new Map();
  lugares.forEach((l) => { if (!porBairro.has(l.bairro)) porBairro.set(l.bairro, new Map()); const m = porBairro.get(l.bairro); m.set(l.cat, (m.get(l.cat) || 0) + 1); });
  [...porBairro.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).forEach(([b, m]) => {
    let n = 0; m.forEach((v) => { n += v; });
    L.push('## Resumo do bairro ' + b, 'O que tem no bairro ' + b + ' (' + n + ' lugares no mapa): ' + cats.filter((c) => m.has(c)).map((c) => c.toLowerCase() + ' ' + m.get(c)).join('; ') + '.', '');
  });
  cats.forEach((c) => {
    [...porCat.get(c).entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).forEach(([b, itens]) => {
      itens.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
      const linhas = itens.map((l) => {
        const extra = [endereco(l.tags), limpar(l.tags.phone || l.tags['contact:phone'])].filter(Boolean).join('; ');
        return '- ' + l.nome + (extra ? ' (' + extra + ')' : '');
      });
      const partes = []; let atual = [], tam = 0;
      linhas.forEach((x) => { if (atual.length && tam + x.length > MAX) { partes.push(atual); atual = []; tam = 0; } atual.push(x); tam += x.length + 1; });
      if (atual.length) partes.push(atual);
      partes.forEach((pt, k) => {
        const sufixo = partes.length > 1 ? ' (parte ' + (k + 1) + ' de ' + partes.length + ')' : '';
        L.push('## ' + c + ', bairro ' + b + sufixo, itens.length + (itens.length === 1 ? ' lugar' : ' lugares') + ' no mapa (' + c.toLowerCase() + ': ' + (DICA[c] || c.toLowerCase()) + '; bairro ' + b + ')' + (partes.length > 1 ? ', parte ' + (k + 1) + ' de ' + partes.length : '') + ':');
        pt.forEach((x) => L.push(x));
        L.push('');
      });
    });
  });
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada) { console.error('Uso: node scripts/importar-mapa.mjs overpass-lugares.json [saida.md]'); process.exit(1); }
  const dados = JSON.parse(readFileSync(entrada, 'utf8'));
  const destino = saida || 'knowledge/documentos/mapa-boa-vista-osm.md';
  writeFileSync(destino, montarMarkdown(dados));
  const r = lugaresDoMapa(dados);
  console.log(r.lugares.length + ' lugares em ' + destino + (r.descartados ? ' (' + r.descartados + ' fora de Roraima descartados)' : ''));
}
