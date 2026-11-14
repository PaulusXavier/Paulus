// Geografia do Paulus: coordenadas, endereço no padrão, "perto de", distância, bairro, links de mapa, GPX e KML.
// Sem IA, sem rede e sem eval. FONTE ÚNICA: navegador e Worker.
//
// Por que existe: modelo de linguagem inventa latitude, CEP e quilômetro. Aqui o programa só usa o que o app passou
// (diretório de unidades, mapa de lugares do OpenStreetMap, centro de bairro e de rua) e, na falta, diz "não consta". Nunca chuta coordenada.
//
//   geoLerCoordenadas(texto)                 -> { lat, lng, formato, trecho, invertido? } ou null (decimal, graus-minutos-segundos, link do Google Maps)
//   geoFormatarCoordenadas(lat, lng)         -> { decimal, dms, lat, lng }
//   geoNormalizarEndereco(texto)             -> { logradouro, numero, complemento, bairro, cidade, uf, cep, texto, faltando[], avisos[] } ou null
//   geoMontarEndereco(partes)                -> texto padronizado
//   geoPrepararLugares(entrada)              -> { lugares, bairros, fonte, gerado } (entrada: JSON do scripts/importar-mapa.mjs ou lista de { nome, lat, lng })
//   geoFontes(opcoes)                        -> { diretorio, mapa, bairros, ruas }
//   geoAchar(nome, fontes) / geoPerto(centro, fontes, opcoes)
//   geoLinksDeRota(pontos, opcoes), geoParaGpx(pontos, opcoes), geoParaKml(pontos, opcoes)
//   geoTipoDePedido(texto)                   -> 'endereco' | 'conversao' | 'distancia' | 'perto' | 'bairro' | 'coordenadas' | '' (barato, não olha dados)
//   respostaDeGeo(texto, opcoes)             -> { texto, links, lugares, geojson, tipoGeo, ... } ou null (aí a pergunta segue o caminho normal)
//        opcoes.pontos   diretório do app [{ nome, lat, lng, endereco?, bairro?, apelidos?[] }] (ou função). Só unidades PÚBLICAS. VENCE qualquer empate.
//        opcoes.lugares  mapa de lugares (saída do importar-mapa) ou lista; opcoes.bairros [{ bairro, lat, lng }]; opcoes.ruas [{ rua, bairro, lat, lng }]
//        opcoes.aparelho { lat, lng } ou null (para "perto daqui"; o Paulus nunca pede o GPS); opcoes.cidade 'Boa Vista, RR'
//
// É ESTIMATIVA: linha reta × 1,3 (ruas) numa velocidade média por modo. Bairro e rua são o CENTRO (o limite do bairro não é conhecido).
// Endereço de residência e coordenada solta nunca viram parada de rota. Conversão e endereço digitados ficam no aparelho e não entram no histórico.
// Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos quebram o arquivo inteiro). Nomes com prefixo "geo" por causa do arquivo único do navegador.

export const GEO_FATOR_RUA = 1.3;
export const GEO_VELOCIDADE = { carro: 30, moto: 30, bicicleta: 12, pe: 4.5 };
const GEO_NOME_MODO = { carro: 'carro', moto: 'moto', bicicleta: 'bicicleta', pe: 'a pé' };
const GEO_MODO_MAPA = { carro: 'driving', moto: 'driving', bicicleta: 'bicycling', pe: 'walking' };
const GEO_RAIO_PADRAO = 2;
const GEO_RAIO_MAXIMO = 50;
const GEO_MAX_LISTA = 8;
const GEO_PONTOS_POR_LINK = 11;   // o link do Google Maps aceita origem + 9 paradas intermediárias + destino
const GEO_BRASIL = { latMin: -34, latMax: 5.5, lngMin: -74.5, lngMax: -34 };

// ------------------------------------------------------------------ texto

// Minúsculas e sem acento, MESMO comprimento do original.
function geoNorm(s) {
  const t = String(s == null ? '' : s);
  let o = '';
  for (let i = 0; i < t.length; i++) o += t.charAt(i).normalize('NFD').charAt(0).toLowerCase();
  return o;
}

const GEO_VAZIAS = { de: 1, do: 1, da: 1, dos: 1, das: 1, e: 1, o: 1, a: 1, os: 1, as: 1, ao: 1, aos: 1, na: 1, no: 1, nas: 1, nos: 1, em: 1, para: 1, pra: 1, por: 1 };

function geoPalavras(s) {
  return geoNorm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (w) { return w && !GEO_VAZIAS[w]; });
}

function geoEscapar(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; });
}

function geoKm(x) { return (x < 0.095 ? Math.max(0.1, x) : x).toFixed(1).replace('.', ',') + ' km'; }

function geoTempo(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r + ' min' : '');
}

function geoNumero(v) {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

function geoCoordOk(lat, lng) {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

export function geoDistanciaKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// ------------------------------------------------------------------ coordenadas

function geoDecimal(s) { return Number(String(s).replace(',', '.')); }

function geoAplicarHemisferio(valor, letra) {
  const l = String(letra || '').toUpperCase();
  const v = Math.abs(valor);
  if (l === 'S' || l === 'W' || l === 'O') return -v;
  if (l === 'N' || l === 'E' || l === 'L') return v;
  return valor;
}

const GEO_RE_DMS = /(-?\d{1,3})\s*[°º˚]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’´]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|''|′′|’’|´´)?)?)?\s*([NSLEWO])?(?![A-Za-z])/gi;
const GEO_RE_DEC_HEM = /(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NSLEWO])(?![A-Za-z])/gi;
const GEO_RE_PARES = [
  /(-?\d{1,2}\.\d+)(?!\d)\s*°?\s*[,;]?\s*(-?\d{1,3}\.\d+)(?!\d)/,
  /(-?\d{1,2},\d+)(?!\d)\s*°?\s*;\s*(-?\d{1,3},\d+)(?!\d)/,
  /(-?\d{1,2},\d+)(?!\d)\s*°?\s*,\s+(-?\d{1,3},\d+)(?!\d)/,
  /(-?\d{1,2},\d+)(?!\d)\s+(-?\d{1,3},\d+)(?!\d)/
];

function geoFechar(lat, lng, formato, trecho) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  let invertido = false;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) { const x = lat; lat = lng; lng = x; invertido = true; }
  if (!geoCoordOk(lat, lng)) return null;
  const r = { lat: lat, lng: lng, formato: formato, trecho: trecho };
  if (invertido) r.invertido = true;
  return r;
}

export function geoLerCoordenadas(texto) {
  const t = String(texto == null ? '' : texto).slice(0, 800);
  if (!t) return null;
  // 1. graus, minutos e segundos (com N/S/L/E/W/O depois do número)
  const dms = [];
  let m;
  GEO_RE_DMS.lastIndex = 0;
  while ((m = GEO_RE_DMS.exec(t)) !== null) {
    const g = Math.abs(Number(m[1])), mi = m[2] ? geoDecimal(m[2]) : 0, se = m[3] ? geoDecimal(m[3]) : 0;
    if (mi >= 60 || se >= 60) continue;
    let v = g + mi / 60 + se / 3600;
    if (/^-/.test(m[1])) v = -v;
    dms.push({ v: geoAplicarHemisferio(v, m[4]), letra: String(m[4] || '').toUpperCase(), trecho: m[0], i: m.index });
  }
  if (dms.length >= 2) {
    let a = dms[0], b = dms[1];
    // pela letra: N/S é latitude; E/L/W/O é longitude
    if (/^[EWLO]$/.test(a.letra) && /^[NS]$/.test(b.letra)) { const x = a; a = b; b = x; }
    const r = geoFechar(a.v, b.v, 'dms', t.slice(Math.min(a.i, b.i), Math.max(a.i + a.trecho.length, b.i + b.trecho.length)).trim());
    if (r) return r;
  }
  // 2. decimal com letra ("2.8235 N, 60.6758 W")
  const hem = [];
  GEO_RE_DEC_HEM.lastIndex = 0;
  while ((m = GEO_RE_DEC_HEM.exec(t)) !== null) hem.push({ v: geoAplicarHemisferio(geoDecimal(m[1]), m[2]), letra: m[2].toUpperCase(), trecho: m[0], i: m.index });
  if (hem.length >= 2) {
    let a = hem[0], b = hem[1];
    if (/^[EWLO]$/.test(a.letra) && /^[NS]$/.test(b.letra)) { const x = a; a = b; b = x; }
    const r = geoFechar(a.v, b.v, 'decimal', t.slice(Math.min(a.i, b.i), Math.max(a.i + a.trecho.length, b.i + b.trecho.length)).trim());
    if (r) return r;
  }
  // 3. par decimal ("2.8235, -60.6758", "2,8235 -60,6758", "@2.82,-60.67")
  for (let k = 0; k < GEO_RE_PARES.length; k++) {
    const p = GEO_RE_PARES[k].exec(t);
    if (!p) continue;
    // "0.16.0" (versão) e "1.2.3.4" não são coordenada: sem dígito ou ponto colado antes e sem ponto+dígito depois
    if (/[\d.]/.test(t.charAt(p.index - 1) || ' ') || /^(?:\.\d|\d)/.test(t.slice(p.index + p[0].length))) continue;
    const r = geoFechar(geoDecimal(p[1]), geoDecimal(p[2]), 'decimal', p[0].trim());
    if (r) return r;
  }
  return null;
}

function geoGrausMinSeg(v, pos, neg) {
  const a = Math.abs(v);
  let g = Math.floor(a);
  let mi = Math.floor((a - g) * 60);
  let s = Math.round(((a - g) * 60 - mi) * 60 * 10) / 10;
  if (s >= 60) { s = 0; mi += 1; }
  if (mi >= 60) { mi = 0; g += 1; }
  return g + '°' + mi + '′' + String(s).replace('.', ',') .replace(',', '.') + '″' + (v >= 0 ? pos : neg);
}

export function geoFormatarCoordenadas(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  return {
    lat: la, lng: ln,
    decimal: la.toFixed(6) + ', ' + ln.toFixed(6),
    dms: geoGrausMinSeg(la, 'N', 'S') + ' ' + geoGrausMinSeg(ln, 'L', 'O').replace(/L$/, 'L')
  };
}

// Brasil: pergunta ao ver coordenada claramente fora (um sinal trocado é o erro mais comum: longitude do Brasil é negativa)
function geoAvisoDeLocal(c) {
  if (c.lat >= GEO_BRASIL.latMin && c.lat <= GEO_BRASIL.latMax && c.lng >= GEO_BRASIL.lngMin && c.lng <= GEO_BRASIL.lngMax) return '';
  if (c.lat >= GEO_BRASIL.latMin && c.lat <= GEO_BRASIL.latMax && -c.lng >= GEO_BRASIL.lngMin && -c.lng <= GEO_BRASIL.lngMax) return 'Atenção: essa coordenada cai fora do Brasil. Se era para ser aqui, confira o sinal da longitude (no Brasil ela é negativa, "W" ou "O").';
  return 'Atenção: essa coordenada cai fora do Brasil.';
}

function geoLinkMapa(lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat.toFixed(6) + ',' + lng.toFixed(6)); }
function geoLinkOsm(lat, lng) { return 'https://www.openstreetmap.org/?mlat=' + lat.toFixed(6) + '&mlon=' + lng.toFixed(6) + '#map=17/' + lat.toFixed(5) + '/' + lng.toFixed(5); }

// ------------------------------------------------------------------ endereço

const GEO_UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const GEO_TIPOS_VIA = { r: 'Rua', rua: 'Rua', av: 'Avenida', avda: 'Avenida', avenida: 'Avenida', tv: 'Travessa', trav: 'Travessa', travessa: 'Travessa', al: 'Alameda', alameda: 'Alameda', pc: 'Praça', pca: 'Praça', praca: 'Praça', rod: 'Rodovia', rodovia: 'Rodovia', est: 'Estrada', estr: 'Estrada', estrada: 'Estrada', bc: 'Beco', beco: 'Beco', vic: 'Vicinal', vicinal: 'Vicinal', lg: 'Largo', largo: 'Largo', qd: 'Quadra', quadra: 'Quadra', vl: 'Via', via: 'Via', pq: 'Parque', parque: 'Parque', jd: 'Jardim', jardim: 'Jardim', cond: 'Condomínio', condominio: 'Condomínio', conj: 'Conjunto', conjunto: 'Conjunto', loteamento: 'Loteamento', lot: 'Loteamento' };
const GEO_MINUSCULAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, a: 1, o: 1, em: 1 };
const GEO_ROMANO = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/i;
const GEO_COMPL = /\b(?:apto?|apartamento|ap|bloco|bl|casa|sala|sl|fundos|frente|andar|esquina|torre|loja|galpao|km)\.?\s*[\w\-\/]*/i;

function geoTitulo(s) {
  return String(s).trim().replace(/\s+/g, ' ').split(' ').map(function (w, i) {
    const n = geoNorm(w);
    if (i > 0 && GEO_MINUSCULAS[n]) return n;
    if (GEO_ROMANO.test(w) && w.length <= 4) return w.toUpperCase();
    if (/^\d/.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function geoFormatarCep(d) { return d.slice(0, 5) + '-' + d.slice(5); }

export function geoMontarEndereco(p) {
  const via = [p.logradouro, p.numero ? p.numero : '', p.complemento || ''].filter(Boolean);
  let rua = p.logradouro ? p.logradouro + (p.numero ? ', ' + p.numero : '') : '';
  if (p.complemento) rua += (rua ? ', ' : '') + p.complemento;
  const cidade = p.cidade ? p.cidade + (p.uf ? ' - ' + p.uf : '') : (p.uf || '');
  void via;
  return [rua, p.bairro || '', cidade, p.cep ? 'CEP ' + p.cep : ''].filter(Boolean).join(', ');
}

// Lê "av ville roy 1234 apto 2, centro, boa vista - rr, 69301000" e devolve o endereço no padrão. Não consulta CEP e não completa o que falta.
export function geoNormalizarEndereco(texto, opcoes) {
  const o = opcoes || {};
  let t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, 300);
  t = t.replace(/^(?:(?:por favor|pf|pfv)[,\s]+)?(?:(?:normaliz|padroniz|format|organiz|arrum|corrig)\w*\s+(?:esse |este |o |um )?(?:endereco|endereço)\s*(?:abaixo)?\s*[:\-]?\s*)/i, '');
  if (!t) return null;
  const avisos = [];
  // CEP: 8 dígitos (com ou sem hífen e ponto)
  let cep = '';
  const mc = /\b(\d{2})\.?(\d{3})[-.\s]?(\d{3})\b/.exec(t);
  if (mc) { cep = geoFormatarCep(mc[1] + mc[2] + mc[3]); t = t.replace(mc[0], ' '); }
  else if (/\bcep\b\s*:?\s*\d{1,7}\b/i.test(t)) { avisos.push('O CEP está incompleto (tem 8 dígitos); deixei de fora.'); t = t.replace(/\bcep\b\s*:?\s*\d+/i, ' '); }
  t = t.replace(/\bcep\b\s*:?/i, ' ').replace(/[\s,;\-–—]+$/, '');
  // UF no fim ("... - RR", "/RR", ", RR")
  let uf = '';
  const mu = /(?:^|[\s,\-\/])([A-Za-z]{2})\s*[.]?\s*$/.exec(t);
  if (mu && GEO_UFS.indexOf(mu[1].toUpperCase()) >= 0) { uf = mu[1].toUpperCase(); t = t.slice(0, mu.index) + ' '; }
  // pedaços: vírgula, ponto e vírgula, " - " e barra
  const partes = t.split(/\s*[,;]\s*|\s+[-–—]\s+|\s*\/\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (!partes.length) return null;
  let via = partes.shift();
  // tipo de via
  let tipo = '';
  const mv = /^([A-Za-zÀ-ÿ]{1,12})\.?\s+(.*)$/.exec(via);
  if (mv && GEO_TIPOS_VIA[geoNorm(mv[1])]) { tipo = GEO_TIPOS_VIA[geoNorm(mv[1])]; via = mv[2]; }
  // complemento colado no logradouro ("1234 apto 2")
  let complemento = '';
  const mcomp = GEO_COMPL.exec(via);
  if (mcomp && mcomp.index > 0) { complemento = mcomp[0].trim(); via = via.slice(0, mcomp.index).trim(); }
  // número: "s/n", ou o último número do logradouro (um número logo depois do tipo, como "Rua 15 de Novembro", é parte do nome)
  let numero = '';
  if (/\b(?:s\/n|sn|s\.n\.|sem numero|sem número)\b/i.test(via)) { numero = 's/n'; via = via.replace(/\b(?:s\/n|sn|s\.n\.|sem numero|sem número)\b/i, '').trim(); }
  else {
    const nums = via.match(/\b\d+[A-Za-z]?\b/g) || [];
    if (nums.length) {
      const ult = nums[nums.length - 1];
      const pos = via.lastIndexOf(ult);
      const antes = via.slice(0, pos).trim();
      const depois = via.slice(pos + ult.length).trim();
      if (antes && !depois && !/\b(?:de|da|do)$/i.test(antes)) { numero = ult.toUpperCase(); via = antes; }
      else if (!antes && !depois) { avisos.push('Confira: "' + ult + '" pode ser o número da casa ou o nome da rua.'); }
    }
  }
  via = via.replace(/[.,\s]+$/, '').trim();
  // o resto: bairro e cidade; "bairro X" é bairro
  let bairro = '', cidade = '';
  const resto = [];
  partes.forEach(function (x) {
    const mb = /^(?:bairro|b\.)\s+(.*)$/i.exec(x);
    if (mb) { bairro = geoTitulo(mb[1]); return; }
    const mn = /^(?:n[ºo°.]?\s*)?(\d+[A-Za-z]?)$/i.exec(x);
    if (mn && !numero) { numero = mn[1].toUpperCase(); return; }
    const mq = GEO_COMPL.exec(x);
    if (mq && mq.index === 0 && !complemento) { complemento = x; return; }
    resto.push(x);
  });
  if (resto.length === 1) { if (bairro) cidade = geoTitulo(resto[0]); else bairro = geoTitulo(resto[0]); }
  else if (resto.length >= 2) { if (!bairro) bairro = geoTitulo(resto[0]); cidade = geoTitulo(resto[resto.length - 1]); }
  if (cidade && !uf && /^[A-Z]{2}$/.test(cidade.toUpperCase()) && GEO_UFS.indexOf(cidade.toUpperCase()) >= 0) { uf = cidade.toUpperCase(); cidade = ''; }
  const logradouro = (tipo ? tipo + ' ' : '') + geoTitulo(via);
  if (!via && !tipo) return null;
  const r = { logradouro: logradouro, numero: numero, complemento: complemento ? complemento.charAt(0).toUpperCase() + complemento.slice(1) : '', bairro: bairro, cidade: cidade, uf: uf, cep: cep, avisos: avisos, faltando: [] };
  if (o.cidade && !r.cidade) {
    const mcid = /^([^,]+?)(?:\s*[,\-]\s*([A-Za-z]{2}))?$/.exec(String(o.cidade).trim());
    if (mcid) { r.cidadePadrao = geoTitulo(mcid[1]); if (mcid[2] && !uf) r.ufPadrao = mcid[2].toUpperCase(); }
  }
  if (!r.numero) r.faltando.push('número (use "s/n" se não tem)');
  if (!r.bairro) r.faltando.push('bairro');
  if (!r.cidade && !r.cidadePadrao) r.faltando.push('cidade');
  if (!r.uf && !r.ufPadrao) r.faltando.push('UF');
  if (!r.cep) r.faltando.push('CEP');
  r.texto = geoMontarEndereco(r);
  return r;
}

// ------------------------------------------------------------------ fontes: diretório, mapa, bairros, ruas

// Diretório do app: o que o app conferiu. Ponto sem coordenada válida continua existindo (a pergunta é respondida com "sem coordenadas").
export function geoPontos(lista) {
  let l = lista;
  if (typeof l === 'function') { try { l = l(); } catch (e) { l = []; } }
  if (!Array.isArray(l)) return [];
  const saida = [];
  l.slice(0, 500).forEach(function (p) {
    if (!p || !p.nome) return;
    const lat = geoNumero(p.lat != null ? p.lat : p.latitude);
    const lng = geoNumero(p.lng != null ? p.lng : p.lon != null ? p.lon : p.long != null ? p.long : p.longitude);
    const ok = geoCoordOk(lat, lng);
    const nome = String(p.nome).replace(/\s+/g, ' ').trim().slice(0, 120);
    const nomes = [nome].concat(Array.isArray(p.apelidos) ? p.apelidos.slice(0, 6).map(String) : []);
    saida.push({
      nome: nome, lat: ok ? lat : null, lng: ok ? lng : null, endereco: String(p.endereco || '').slice(0, 160), bairro: String(p.bairro || '').slice(0, 80),
      nomes: nomes.map(geoPalavras).filter(function (x) { return x.length; }), nm: geoNorm(nome), fonte: 'diretorio', cat: ''
    });
  });
  return saida;
}

const GEO_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;

// Mapa de lugares. Formato compacto do importar-mapa: { fonte, gerado, cats:[...], bairros:[[nome,lat,lng]], lugares:[[nome, índiceDaCategoria, índiceDoBairro|texto, lat, lng, endereço, telefone]] }.
// Também aceita uma lista [{ nome, lat, lng, bairro?, cat?, endereco? }].
export function geoPrepararLugares(entrada) {
  let e = entrada;
  if (typeof e === 'function') { try { e = e(); } catch (x) { e = null; } }
  if (!e || typeof e !== 'object') return { lugares: [], bairros: [], fonte: '', gerado: '' };
  if (GEO_CACHE && GEO_CACHE.has(e)) return GEO_CACHE.get(e);
  const bairros = [], lugares = [];
  const lista = Array.isArray(e) ? e : Array.isArray(e.lugares) ? e.lugares : [];
  const cats = Array.isArray(e.cats) ? e.cats : [];
  const nomesBairro = [];
  (Array.isArray(e.bairros) ? e.bairros : []).slice(0, 2000).forEach(function (b) {
    const nome = String(Array.isArray(b) ? b[0] : b && (b.bairro || b.nome) || '').trim();
    const lat = geoNumero(Array.isArray(b) ? b[1] : b && b.lat), lng = geoNumero(Array.isArray(b) ? b[2] : b && (b.lng != null ? b.lng : b.lon));
    nomesBairro.push(nome);
    if (nome && geoCoordOk(lat, lng)) bairros.push(geoItemBairro(nome, lat, lng));
  });
  lista.slice(0, 30000).forEach(function (x) {
    let nome, cat, bairro, lat, lng, endereco, telefone;
    if (Array.isArray(x)) {
      nome = x[0]; cat = typeof x[1] === 'number' ? cats[x[1]] || '' : String(x[1] || '');
      bairro = typeof x[2] === 'number' ? nomesBairro[x[2]] || '' : String(x[2] || '');
      lat = geoNumero(x[3]); lng = geoNumero(x[4]); endereco = x[5]; telefone = x[6];
    } else if (x && typeof x === 'object') {
      nome = x.nome; cat = x.cat || x.categoria || ''; bairro = x.bairro || '';
      lat = geoNumero(x.lat != null ? x.lat : x.latitude); lng = geoNumero(x.lng != null ? x.lng : x.lon != null ? x.lon : x.longitude); endereco = x.endereco; telefone = x.telefone;
    } else return;
    nome = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!nome || !geoCoordOk(lat, lng)) return;
    lugares.push({ nome: nome, lat: lat, lng: lng, cat: String(cat || ''), bairro: String(bairro || ''), endereco: String(endereco || '').slice(0, 160), telefone: String(telefone || '').slice(0, 40), nomes: [geoPalavras(nome)], nm: geoNorm(nome), fonte: 'mapa' });
  });
  const r = { lugares: lugares, bairros: bairros, fonte: String(e.fonte || ''), gerado: String(e.gerado || '') };
  if (GEO_CACHE) GEO_CACHE.set(e, r);
  return r;
}

function geoItemBairro(nome, lat, lng) {
  return { nome: nome, lat: lat, lng: lng, bairro: nome, endereco: '', nomes: [geoPalavras(nome)], nm: geoNorm(nome), fonte: 'bairro', cat: '' };
}

function geoPrepararBairros(lista) {
  const l = typeof lista === 'function' ? (function () { try { return lista(); } catch (e) { return []; } })() : lista;
  if (!Array.isArray(l)) return [];
  const saida = [];
  l.slice(0, 2000).forEach(function (b) {
    const nome = String(b && (b.bairro || b.nome) || '').trim();
    const lat = geoNumero(b && b.lat), lng = geoNumero(b && (b.lng != null ? b.lng : b.lon));
    if (nome && geoCoordOk(lat, lng)) saida.push(geoItemBairro(nome, lat, lng));
  });
  return saida;
}

function geoPrepararRuas(lista) {
  const l = typeof lista === 'function' ? (function () { try { return lista(); } catch (e) { return []; } })() : lista;
  if (!Array.isArray(l)) return [];
  if (GEO_CACHE && GEO_CACHE.has(l)) return GEO_CACHE.get(l);
  const saida = [];
  l.slice(0, 20000).forEach(function (r) {
    const nome = String(r && (r.rua || r.nome) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const lat = geoNumero(r && r.lat), lng = geoNumero(r && (r.lng != null ? r.lng : r.lon));
    if (nome && geoCoordOk(lat, lng)) saida.push({ nome: nome, lat: lat, lng: lng, bairro: String(r.bairro || ''), endereco: '', nomes: [geoPalavras(nome)], nm: geoNorm(nome), fonte: 'rua', cat: '' });
  });
  if (GEO_CACHE) GEO_CACHE.set(l, saida);
  return saida;
}

export function geoFontes(o) {
  const op = o || {};
  const mapa = op.lugares ? geoPrepararLugares(op.lugares) : { lugares: [], bairros: [], fonte: '', gerado: '' };
  const bairros = geoPrepararBairros(op.bairros);
  mapa.bairros.forEach(function (b) { if (!bairros.some(function (x) { return x.nm === b.nm; })) bairros.push(b); });
  return { diretorio: Array.isArray(op.diretorio) ? op.diretorio : geoPontos(op.pontos), mapa: mapa.lugares, bairros: bairros, ruas: geoPrepararRuas(op.ruas), fonteMapa: mapa.fonte, geradoMapa: mapa.gerado };
}

// ------------------------------------------------------------------ achar um lugar pelo nome

function geoCombina(q, p) {
  if (q === p) return true;
  if (q.length >= 3 && p.indexOf(q) === 0) return true;
  return p.length >= 3 && q.indexOf(p) === 0 && q.length - p.length <= 2;
}

function geoRotulo(it, lista) {
  const repetido = lista.filter(function (x) { return x.nm === it.nm; }).length > 1;
  return it.nome + (it.bairro && (repetido || it.fonte === 'rua') ? ' (' + it.bairro + ')' : '');
}

// { item } | { ambiguos: [rótulos] } | {}
export function geoAcharEmItens(texto, itens) {
  const q = geoPalavras(texto);
  if (!q.length || !itens || !itens.length) return {};
  let melhor = 0;
  let achados = [];
  for (let i = 0; i < itens.length; i++) {
    const p = itens[i];
    let nota = 0;
    for (let j = 0; j < p.nomes.length; j++) {
      const pal = p.nomes[j];
      if (q.every(function (w) { return pal.some(function (x) { return geoCombina(w, x); }); })) nota = Math.max(nota, 1 + q.length / pal.length);
    }
    if (!nota) continue;
    if (nota > melhor + 1e-9) { melhor = nota; achados = [p]; } else if (Math.abs(nota - melhor) < 1e-9) achados.push(p);
  }
  // o mesmo lugar mapeado duas vezes (mesmo nome a menos de 150 m) conta uma vez só
  const unicos = [];
  achados.forEach(function (a) {
    if (!unicos.some(function (u) { return u.nm === a.nm && a.lat != null && u.lat != null && geoDistanciaKm(u, a) < 0.15; })) unicos.push(a);
  });
  if (unicos.length === 1) return { item: unicos[0] };
  if (unicos.length > 1) return { ambiguos: unicos.slice(0, 5).map(function (a) { return geoRotulo(a, unicos); }) };
  return {};
}

// "bairro Centro" e "rua X" forçam o tipo certo; sem prefixo, valem diretório, mapa, bairro e rua, nessa ordem (o diretório vence).
export function geoAcharEmFontes(texto, f) {
  let t = String(texto == null ? '' : texto).trim();
  const mb = /^(?:no |do |da |ao )?(?:bairro|b\.)\s+(.*)$/i.exec(t);
  if (mb) return geoAcharEmItens(mb[1], f.bairros || []);
  const mr = /^(?:na |da |a )?(?:rua|r\.|avenida|av\.?|travessa|alameda)\s+(.*)$/i.exec(t);
  if (mr) { const r = geoAcharEmItens(t, f.ruas || []); return r.item || r.ambiguos ? r : geoAcharEmItens(mr[1], f.ruas || []); }
  const camadas = [f.diretorio, f.mapa, f.bairros, f.ruas];
  for (let i = 0; i < camadas.length; i++) {
    const r = geoAcharEmItens(t, camadas[i] || []);
    if (r.item || r.ambiguos) return r;
  }
  return {};
}

export function geoAchar(nome, fontes) { return geoAcharEmFontes(nome, fontes); }

// Bairro de um ponto: o do próprio lugar (mapa) ou o de centro mais próximo (aproximação: o limite do bairro não é conhecido).
export function geoBairroDe(ponto, f) {
  if (ponto.bairro && ponto.fonte !== 'diretorio') return { nome: ponto.bairro, exato: true, km: 0 };
  if (ponto.bairro) return { nome: ponto.bairro, exato: true, km: 0 };
  let melhor = null, d = Infinity;
  (f.bairros || []).forEach(function (b) { const x = geoDistanciaKm(ponto, b); if (x < d) { d = x; melhor = b; } });
  return melhor ? { nome: melhor.nome, exato: false, km: d } : null;
}

// ------------------------------------------------------------------ tipos de lugar ("UBS", "farmácia", "escola"...)

function geoRx(re) { return function (n) { return re.test(n); }; }
const GEO_TIPOS = [
  { id: 'ubs', rotulo: 'UBS e postos de saúde', pergunta: /\b(?:ubs|ubsf|postos? de saude|unidades? basicas?(?: de saude)?|centros? de saude|unidades? de saude)\b/, nome: /\b(?:ubs|ubsf|posto de saude|unidade basica|centro de saude|unidade de saude)\b/ },
  { id: 'caps', rotulo: 'CAPS', pergunta: /\bcaps\b/, nome: /\bcaps\b/ },
  { id: 'cras', rotulo: 'CRAS', pergunta: /\bcras\b/, nome: /\bcras\b/ },
  { id: 'creas', rotulo: 'CREAS', pergunta: /\bcreas\b/, nome: /\bcreas\b/ },
  { id: 'conselho', rotulo: 'Conselhos Tutelares', pergunta: /\bconselhos? tutelar(?:es)?\b/, nome: /\bconselho tutelar\b/ },
  { id: 'upa', rotulo: 'UPAs e pronto atendimento', pergunta: /\b(?:upas?|pronto[- ]atendimento|pronto[- ]socorro)\b/, nome: /\b(?:upa|pronto atendimento|pronto socorro)\b/ },
  { id: 'hospital', rotulo: 'hospitais', pergunta: /\b(?:hospita(?:l|is)|maternidades?)\b/, nome: /\b(?:hospital|maternidade)\b/ },
  { id: 'saude', rotulo: 'serviços de saúde', pergunta: /\b(?:servicos? de saude|clinicas?|laboratorios?|saude)\b/, nome: /\b(?:ubs|ubsf|caps|upa|hospital|maternidade|posto de saude|clinica|laboratorio|unidade de saude)\b/, cats: ['Saúde'] },
  { id: 'farmacia', rotulo: 'farmácias', pergunta: /\b(?:farmacias?|drogarias?)\b/, nome: /\b(?:farmacia|drogaria)\b/, cats: ['Farmácias'] },
  { id: 'creche', rotulo: 'creches e pré-escolas', pergunta: /\b(?:creches?|cmeis?|pre[- ]?escolas?|educacao infantil)\b/, nome: /\b(?:creche|cmei|pre escola|pre-escola|educacao infantil)\b/, cats: ['Creches e pré-escolas'] },
  { id: 'escola', rotulo: 'escolas', pergunta: /\b(?:escolas?|colegios?)\b/, nome: /\b(?:escola|colegio)\b/, cats: ['Escolas'] },
  { id: 'policia', rotulo: 'polícia, bombeiros e justiça', pergunta: /\b(?:delegacias?|policia|bombeiros?|forum|tribunal)\b/, nome: /\b(?:delegacia|policia|bombeiro|forum|tribunal)\b/, cats: ['Segurança e justiça'] },
  { id: 'assistencia', rotulo: 'serviços de assistência social', pergunta: /\b(?:assistencia social|socioassistencia\w*)\b/, nome: /\b(?:cras|creas|centro pop|acolhimento)\b/, cats: ['Assistência social'] },
  { id: 'templo', rotulo: 'igrejas e templos', pergunta: /\b(?:igrejas?|templos?|catedral)\b/, nome: /\b(?:igreja|templo|catedral|paroquia)\b/, cats: ['Templos'] },
  { id: 'praca', rotulo: 'praças e parques', pergunta: /\b(?:pracas?|parques?|ginasios?)\b/, nome: /\b(?:praca|parque|ginasio)\b/, cats: ['Cultura, esporte e lazer'] },
  { id: 'banco', rotulo: 'bancos', pergunta: /\bbancos?\b/, nome: /\bbanco\b/, cats: ['Bancos'] }
];

function geoTipoDoTexto(norm) {
  for (let i = 0; i < GEO_TIPOS.length; i++) if (GEO_TIPOS[i].pergunta.test(norm)) return GEO_TIPOS[i];
  return null;
}

function geoDoTipo(item, tipo) {
  if (!tipo) return true;
  if (tipo.nome.test(item.nm)) return true;
  return !!(tipo.cats && item.cat && tipo.cats.indexOf(item.cat) >= 0);
}

// ------------------------------------------------------------------ perto de

// centro: { lat, lng, nome? }. Devolve [{ nome, lat, lng, km, bairro, fonte, endereco }] do mais perto ao mais longe, só do diretório e do mapa.
export function geoPerto(centro, f, opcoes) {
  const o = opcoes || {};
  const raio = o.raioKm != null ? o.raioKm : GEO_RAIO_PADRAO;
  const lista = [];
  const cn = centro.nome ? geoNorm(centro.nome) : '';
  const proprio = function (it) { return (cn && it.nm === cn) || (it.lat === centro.lat && it.lng === centro.lng) || geoDistanciaKm(it, centro) < 0.02; };
  const dir = f.diretorio || [];
  dir.forEach(function (it) {
    if (it.lat == null || proprio(it) || !geoDoTipo(it, o.tipo)) return;
    const km = geoDistanciaKm(centro, it);
    if (km <= raio) lista.push({ nome: it.nome, lat: it.lat, lng: it.lng, km: km, bairro: it.bairro || '', fonte: 'diretorio', endereco: it.endereco, nm: it.nm });
  });
  (f.mapa || []).forEach(function (it) {
    if (proprio(it) || !geoDoTipo(it, o.tipo)) return;
    const km = geoDistanciaKm(centro, it);
    if (km > raio) return;
    // o diretório vence: o mesmo lugar no mapa (mesmo nome, ou menos de 60 m) não entra de novo
    if (lista.some(function (x) { return x.fonte === 'diretorio' && (x.nm === it.nm || geoDistanciaKm(x, it) < 0.06); })) return;
    if (lista.some(function (x) { return x.nm === it.nm && geoDistanciaKm(x, it) < 0.15; })) return;
    lista.push({ nome: it.nome, lat: it.lat, lng: it.lng, km: km, bairro: it.bairro, fonte: 'mapa', endereco: it.endereco, nm: it.nm });
  });
  lista.sort(function (a, b) { return a.km - b.km; });
  return lista.slice(0, o.max || GEO_MAX_LISTA);
}

// ------------------------------------------------------------------ links, GPX e KML

function geoCoordTexto(p, cidade) {
  return p.lat != null ? p.lat.toFixed(6) + ',' + p.lng.toFixed(6) : p.nome + (p.endereco ? ', ' + p.endereco : cidade ? ', ' + cidade : '');
}

// pontos: [{ nome, lat, lng }] NA ORDEM da rota. opcoes: { modo, cidade, volta, semOrigem, rotulo }.
// O link do Google Maps aceita origem + 9 paradas + destino; rota maior sai em partes, e cada parte começa onde a anterior terminou.
export function geoLinksDeRota(pontos, opcoes) {
  const o = opcoes || {};
  const seq = pontos.slice();
  if (o.volta && seq.length > 1) seq.push(seq[0]);
  if (!seq.length) return [];
  const modoMapa = GEO_MODO_MAPA[o.modo] || 'driving';
  const rotulo = o.rotulo || 'Abrir a rota no app de mapas';
  const montar = function (trecho, semOrigem) {
    const destino = trecho[trecho.length - 1];
    const meio = trecho.slice(semOrigem ? 0 : 1, -1);
    let url = 'https://www.google.com/maps/dir/?api=1';
    if (!semOrigem && trecho.length > 1) url += '&origin=' + encodeURIComponent(geoCoordTexto(trecho[0], o.cidade));
    url += '&destination=' + encodeURIComponent(geoCoordTexto(destino, o.cidade));
    if (meio.length) url += '&waypoints=' + meio.map(function (p) { return encodeURIComponent(geoCoordTexto(p, o.cidade)); }).join('%7C');
    return url + '&travelmode=' + modoMapa;
  };
  const capacidade = GEO_PONTOS_POR_LINK;
  if (seq.length <= (o.semOrigem ? capacidade - 1 : capacidade)) return [{ rotulo: rotulo, url: montar(seq, !!o.semOrigem) }];
  const partes = [];
  let ini = 0;
  while (ini < seq.length - 1) {
    const cap = ini === 0 && o.semOrigem ? capacidade - 1 : capacidade;
    const fim = Math.min(seq.length, ini + cap);
    partes.push({ trecho: seq.slice(ini, fim), de: ini + 1, ate: fim, semOrigem: ini === 0 && !!o.semOrigem });
    if (fim >= seq.length) break;
    ini = fim - 1;
  }
  return partes.map(function (p, i) {
    return { rotulo: rotulo + ' (parte ' + (i + 1) + ' de ' + partes.length + ', paradas ' + p.de + ' a ' + p.ate + ')', url: montar(p.trecho, p.semOrigem) };
  });
}

function geoComCoord(pontos) { return (pontos || []).filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lng) && p.lat != null; }); }

export function geoParaGpx(pontos, opcoes) {
  const o = opcoes || {};
  const pts = geoComCoord(pontos);
  const nome = geoEscapar(o.nome || 'Rota Paulus');
  const seq = pts.concat(o.volta && pts.length > 1 ? [pts[0]] : []);
  const wpt = pts.map(function (p, i) { return '<wpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"><name>' + geoEscapar((i + 1) + '. ' + p.nome) + '</name></wpt>'; }).join('');
  const rte = '<rte><name>' + nome + '</name>' + seq.map(function (p) { return '<rtept lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"><name>' + geoEscapar(p.nome) + '</name></rtept>'; }).join('') + '</rte>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Paulus" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' + nome + '</name></metadata>' + wpt + rte + '</gpx>\n';
}

export function geoParaKml(pontos, opcoes) {
  const o = opcoes || {};
  const pts = geoComCoord(pontos);
  const nome = geoEscapar(o.nome || 'Rota Paulus');
  const seq = pts.concat(o.volta && pts.length > 1 ? [pts[0]] : []);
  const marcas = pts.map(function (p, i) { return '<Placemark><name>' + geoEscapar((i + 1) + '. ' + p.nome) + '</name><Point><coordinates>' + p.lng.toFixed(6) + ',' + p.lat.toFixed(6) + ',0</coordinates></Point></Placemark>'; }).join('');
  const linha = seq.length > 1 ? '<Placemark><name>' + nome + '</name><LineString><tessellate>1</tessellate><coordinates>' + seq.map(function (p) { return p.lng.toFixed(6) + ',' + p.lat.toFixed(6) + ',0'; }).join(' ') + '</coordinates></LineString></Placemark>' : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + nome + '</name>' + marcas + linha + '</Document></kml>\n';
}

// ------------------------------------------------------------------ o que a pessoa pergunta

const GEO_RE_ENDERECO = /\b(?:normaliz\w+|padroniz\w+|format\w+|organiz\w+|arrum\w+|corrig\w+|escrev\w+)\b[^.?!]{0,25}\bendereco\b|\bendereco\b[^.?!:]{0,25}\b(?:no padrao|padronizado|certinho|correto)\b|\b(?:qual|me (?:diga|passe|de)|descubra|consulte|buscar?)\b[^.?!]{0,12}\bo cep\b|\bcep d[eao]\b/;
const GEO_RE_CONVERSAO = /\b(?:convert\w+|conversao|transform\w+|passar? (?:para|pra)|graus|decimais|decimal|formato|escrev\w+ (?:em|como))\b/;
const GEO_RE_DISTANCIA = /\b(?:distancia|dist[ae]ncias?|quantos? (?:km|quilometros?)|quanto (?:tempo|dista|falta)|quanto (?:e|fica) (?:de|a) distancia|dista)\b/;
const GEO_RE_PERTO = /\b(?:perto|pertinho|proxim[oa]s?|arredores|ao redor|em volta|vizinh[oa]s?)\b/;
const GEO_RE_BAIRRO = /\b(?:em|de) que bairro\b|\bqual(?: e)? o bairro\b|\bbairro d[eoa]s? [^.?!]{2,60}\b(?:fica|esta)\b/;
const GEO_RE_COORD_PALAVRA = /\b(?:coordenadas?|latitude|longitude|lat\s*[,\/e]\s*(?:lng|lon|long)|gps|ponto no mapa|localizacao (?:exata|geografica)|posicao geografica)\b/;
const GEO_RE_ONDE = /\b(?:onde (?:fica|esta|se localiza|e)|localizacao d[eoa]s?)\b/;

function geoSoCoordenadas(t, c) {
  const resto = t.replace(c.trecho, ' ').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  return resto.length <= 12;
}

// Barato: só olha o texto. Serve para o cliente saber se vale esperar o mapa de lugares (lugaresUrl) e se o pedido é do tipo que não vai ao histórico.
export function geoTipoDePedido(texto) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) return '';
  const n = geoNorm(t);
  if (GEO_RE_ENDERECO.test(n) && !/\bcep\b[^.?!]{0,10}\b(?:significa|serve|funciona)\b/.test(n)) return 'endereco';
  const c = geoLerCoordenadas(t);
  if (c && (GEO_RE_CONVERSAO.test(n) || geoSoCoordenadas(t, c) || GEO_RE_COORD_PALAVRA.test(n) || GEO_RE_PERTO.test(n) || /\b(?:onde|mapa|fica|bairro)\b/.test(n))) return 'conversao';
  if (GEO_RE_BAIRRO.test(n)) return 'bairro';
  if (GEO_RE_DISTANCIA.test(n) && /\b(?:entre|de|do|da|ate|para|pra)\b/.test(n)) return 'distancia';
  if (GEO_RE_PERTO.test(n)) return 'perto';
  if (GEO_RE_COORD_PALAVRA.test(n) || GEO_RE_ONDE.test(n)) return 'coordenadas';
  return '';
}

function geoLimparNome(s) {
  let x = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  let ant;
  do {
    ant = x;
    x = x.replace(/[.?!,;:\s]+$/, '').replace(/^[.?!,;:\s]+/, '');
    x = x.replace(/^(?:o|a|os|as|ao|aos|à|às|na|no|nas|nos|em|até|ate|para|pra|por|pelo|pela|de|do|da|dos|das)\s+/i, '');
    x = x.replace(/\s+(?:por favor|pfv|pf|obrigado|obrigada|no mapa|aqui|no google maps|no gps)$/i, '');
  } while (x !== ant);
  return x.trim();
}

function geoResposta(texto, extra) {
  return Object.assign({ texto: texto, links: [], lugares: [], geojson: null, tipoGeo: '' }, extra || {});
}

const GEO_FONTE_ROTULO = {
  diretorio: 'coordenada do diretório do app',
  mapa: 'coordenada do mapa colaborativo (OpenStreetMap), que pode estar errada ou desatualizada: confira',
  bairro: 'centro do bairro (aproximação: o limite do bairro não é conhecido)',
  rua: 'centro da rua (aproximação: não é a porta de nenhuma casa)'
};

function geoNaoAchei(nome, f) {
  const fontes = f.diretorio.length ? 'no diretório deste app' + (f.mapa.length || f.bairros.length || f.ruas.length ? ' nem no mapa de lugares' : '') : (f.mapa.length || f.bairros.length || f.ruas.length) ? 'no mapa de lugares' : 'aqui';
  return 'Não encontrei "' + nome + '" ' + fontes + ', então não tenho coordenada dele. Não chuto latitude nem longitude. Tente o nome completo da unidade ou do bairro.' + (!f.diretorio.length && !f.mapa.length && !f.bairros.length && !f.ruas.length ? ' (Este app ainda não me passou o diretório de unidades nem o mapa de lugares.)' : '');
}

function geoRotuloAmbiguo(nome, lista) {
  return 'Mais de um lugar combina com "' + nome + '": ' + lista.join('; ') + '. Escreva o nome completo do que você quer.';
}

function geoFeature(it, extra) {
  return { type: 'Feature', properties: Object.assign({ nome: it.nome, fonte: it.fonte }, extra || {}), geometry: { type: 'Point', coordinates: [it.lng, it.lat] } };
}

function geoPino(it, km) {
  const p = { nome: it.nome, lat: Number(it.lat.toFixed(6)), lng: Number(it.lng.toFixed(6)), bairro: it.bairro || '', fonte: it.fonte };
  if (km != null) p.km = Number(km.toFixed(2));
  return p;
}

function geoNotaDeFontes(f, usouMapa) {
  const base = 'Distâncias em linha reta; por ruas costuma ser uns 30% a mais. ';
  const fonte = f.mapa.length && usouMapa ? 'A lista vem do diretório do app e do mapa colaborativo (OpenStreetMap), que é incompleto e pode estar desatualizado. ' : 'A lista vem do diretório do app e pode estar incompleta. ';
  return base + fonte + 'Telefone, horário e endereço oficial: veja o diretório.';
}

function geoModo(n) {
  if (/\b(?:moto|motocicleta)\b/.test(n)) return 'moto';
  if (/\b(?:bicicleta|bike)\b/.test(n)) return 'bicicleta';
  if (/\b(?:a pe|andando|caminhando|de pe)\b/.test(n)) return 'pe';
  return 'carro';
}

function geoAparelho(o) {
  let a = o.aparelho;
  if (typeof a === 'function') { try { a = a(); } catch (e) { a = null; } }
  if (!a) return null;
  const lat = geoNumero(a.lat), lng = geoNumero(a.lng);
  return geoCoordOk(lat, lng) ? { nome: 'Sua posição', lat: lat, lng: lng, nm: 'sua posicao', fonte: 'aparelho', bairro: '', cat: '' } : null;
}

// ---- cada tipo de pedido

function geoResponderEndereco(t, o) {
  const n = geoNorm(t);
  if (/\b(?:qual|me (?:diga|passe|de)|descubra|consulte|buscar?)\b[^.?!]{0,12}\bo cep\b|\bcep d[eao]\b/.test(n) && !/\d{5}/.test(t)) {
    return geoResposta('Não consulto CEP: não tenho acesso ao cadastro dos Correios e não chuto número. Procure pelo endereço no site dos Correios ("Busca CEP"). Se já tem o endereço, posso padronizá-lo para você: escreva "padronizar endereço: rua, número, bairro, cidade - UF".', { tipoGeo: 'endereco', sensivel: true });
  }
  const e = geoNormalizarEndereco(t, { cidade: o.cidade });
  if (!e || (!e.logradouro && !e.bairro)) return geoResposta('Escreva o endereço junto com o pedido. Por exemplo: "padronizar endereço: av ville roy 1234 apto 2, centro, boa vista - rr, 69301000".', { tipoGeo: 'endereco', sensivel: true });
  const linhas = ['Endereço no padrão:', e.texto];
  if (e.avisos.length) linhas.push(e.avisos.join(' '));
  if (e.faltando.length) linhas.push('Não consta no que você escreveu: ' + e.faltando.join('; ') + '. Não completo isso de cabeça nem consulto CEP.');
  linhas.push('Feito aqui no aparelho; o endereço não foi enviado a servidor nenhum nem guardado no histórico do Paulus.');
  const links = [];
  if (e.logradouro) {
    const cidade = e.cidade || e.cidadePadrao || '';
    const uf = e.uf || e.ufPadrao || '';
    const consulta = [e.logradouro + (e.numero && e.numero !== 's/n' ? ', ' + e.numero : ''), e.bairro, cidade, uf].filter(Boolean).join(', ');
    links.push({ rotulo: 'Procurar este endereço no app de mapas', url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(consulta) });
  }
  return geoResposta(linhas.join('\n'), { tipoGeo: 'endereco', endereco: e, links: links, sensivel: true });
}

function geoResponderConversao(t, f, o) {
  const c = geoLerCoordenadas(t);
  if (!c) return null;
  const fmt = geoFormatarCoordenadas(c.lat, c.lng);
  const linhas = ['Decimal: ' + fmt.decimal, 'Graus, minutos e segundos: ' + fmt.dms];
  if (c.invertido) linhas.unshift('A latitude e a longitude pareciam trocadas; li a primeira como longitude e a segunda como latitude. Confira.');
  const aviso = geoAvisoDeLocal(c);
  if (aviso) linhas.push(aviso);
  const b = geoBairroDe({ lat: c.lat, lng: c.lng, bairro: '', fonte: 'coordenada' }, f);
  if (b && b.km <= 15) linhas.push('Bairro de centro mais próximo: ' + b.nome + ' (' + geoKm(b.km) + '; aproximação, o limite do bairro não é conhecido).');
  const perto = geoPerto({ lat: c.lat, lng: c.lng }, f, { raioKm: 2, max: 3 });
  if (perto.length) linhas.push('Lugares públicos por perto: ' + perto.map(function (p) { return p.nome + ' (' + geoKm(p.km) + ')'; }).join('; ') + '.');
  return geoResposta(linhas.join('\n'), {
    tipoGeo: 'conversao', sensivel: true, lat: c.lat, lng: c.lng, lugares: perto.map(function (p) { return geoPino(p, p.km); }),
    links: [{ rotulo: 'Abrir no app de mapas', url: geoLinkMapa(c.lat, c.lng) }, { rotulo: 'Abrir no OpenStreetMap', url: geoLinkOsm(c.lat, c.lng) }],
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nome: 'Ponto informado' }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } }] }
  });
}

function geoResponderCoordenadas(t, n, f, o) {
  let m = /\b(?:coordenadas?|latitude e longitude|latitude|longitude|lat\s*[,\/e]\s*(?:lng|lon|long)|gps|ponto no mapa|localizacao (?:exata|geografica)|posicao geografica)\s+(?:(?:exata|geografica|geograficas)\s+)?(?:(?:d[oae]s?|n[oa]s?|em|para|pra)\s+)?([^.?!:]+?)\s*[.?!]*$/.exec(n);
  let viaOnde = false;
  if (!m) { m = /\b(?:onde (?:fica|ficam|esta|estao|se localiza)|localizacao d[oae]s?)\s+([^.?!:]+?)\s*[.?!]*$/.exec(n); viaOnde = true; }
  if (!m) return null;
  const nome = geoLimparNome(t.slice(m.index + m[0].lastIndexOf(m[1]), m.index + m[0].lastIndexOf(m[1]) + m[1].length));
  if (!nome || nome.split(' ').length > 9) return null;
  const quer = !viaOnde || /\b(?:no mapa|gps|coordenadas?|latitude|longitude|exata)\b/.test(n);
  const r = geoAcharEmFontes(nome, f);
  if (r.ambiguos) return geoResposta(geoRotuloAmbiguo(nome, r.ambiguos), { tipoGeo: 'coordenadas', ambiguo: true });
  if (!r.item) return viaOnde ? null : geoResposta(geoNaoAchei(nome, f), { tipoGeo: 'coordenadas', naoAchou: true });
  const it = r.item;
  // "onde fica a UBS X": unidade do diretório segue para a ficha (endereço, horário, telefone), que é quem sabe
  if (viaOnde && !quer && it.fonte === 'diretorio') return null;
  if (it.lat == null) return geoResposta('"' + it.nome + '" está no diretório deste app, mas sem coordenadas. Não chuto latitude nem longitude: peça à coordenação para completar o cadastro.', { tipoGeo: 'coordenadas', semCoordenadas: true });
  const fmt = geoFormatarCoordenadas(it.lat, it.lng);
  const linhas = [it.nome + (it.bairro && it.fonte !== 'bairro' ? ' (bairro ' + it.bairro + ')' : ''), 'Decimal: ' + fmt.decimal, 'Graus, minutos e segundos: ' + fmt.dms, 'Origem: ' + GEO_FONTE_ROTULO[it.fonte] + '.'];
  if (it.endereco && it.fonte !== 'bairro') linhas.splice(1, 0, 'Endereço: ' + it.endereco);
  if (it.fonte === 'diretorio' && !it.bairro) {
    const b = geoBairroDe(it, f);
    if (b && b.km <= 15) linhas.push('Bairro de centro mais próximo: ' + b.nome + ' (' + geoKm(b.km) + '; aproximação).');
  }
  return geoResposta(linhas.join('\n'), {
    tipoGeo: 'coordenadas', lat: it.lat, lng: it.lng, lugares: [geoPino(it)], geojson: { type: 'FeatureCollection', features: [geoFeature(it)] },
    links: [{ rotulo: 'Abrir no app de mapas', url: geoLinkMapa(it.lat, it.lng) }, { rotulo: 'Abrir no OpenStreetMap', url: geoLinkOsm(it.lat, it.lng) }]
  });
}

function geoResponderBairro(t, n, f) {
  const m = /\b(?:(?:em|de) que bairro|qual(?: e)? o bairro)\s+(?:(?:fica|esta|e|se localiza|moram|mora)\s+)?([^.?!:]+?)\s*[.?!]*$/.exec(n) || /\bbairro\s+d[eoa]s?\s+([^.?!:]+?)\s+(?:fica|esta)\s*[.?!]*$/.exec(n);
  if (!m) return null;
  const nome = geoLimparNome(t.slice(m.index + m[0].lastIndexOf(m[1]), m.index + m[0].lastIndexOf(m[1]) + m[1].length));
  if (!nome) return null;
  const r = geoAcharEmFontes(nome, f);
  if (r.ambiguos) return geoResposta(geoRotuloAmbiguo(nome, r.ambiguos), { tipoGeo: 'bairro', ambiguo: true });
  if (!r.item) return geoResposta('Não encontrei "' + nome + '" no diretório deste app nem no mapa de lugares, então não sei em que bairro fica. Não deduzo bairro pelo nome.', { tipoGeo: 'bairro', naoAchou: true });
  const it = r.item;
  if (it.fonte === 'bairro') return geoResposta(it.nome + ' é um bairro (centro: ' + geoFormatarCoordenadas(it.lat, it.lng).decimal + ').', { tipoGeo: 'bairro', lugares: [geoPino(it)] });
  if (it.bairro) return geoResposta(it.nome + ' fica no bairro ' + it.bairro + ' (segundo ' + (it.fonte === 'diretorio' ? 'o diretório do app' : it.fonte === 'rua' ? 'o mapa de ruas' : 'o mapa colaborativo, que pode estar desatualizado') + ').', { tipoGeo: 'bairro', lugares: it.lat != null ? [geoPino(it)] : [] });
  if (it.lat == null) return geoResposta('"' + it.nome + '" está no diretório, mas sem coordenadas nem bairro. Não deduzo bairro pelo nome.', { tipoGeo: 'bairro', semCoordenadas: true });
  const b = geoBairroDe(it, f);
  if (!b) return geoResposta('Não tenho a lista de bairros com coordenadas neste app, então não sei dizer o bairro de ' + it.nome + '. Confira o endereço no diretório.', { tipoGeo: 'bairro', naoAchou: true });
  return geoResposta('O bairro de centro mais próximo de ' + it.nome + ' é ' + b.nome + ' (' + geoKm(b.km) + '; aproximação, o limite do bairro não é conhecido). Para o endereço oficial, veja o diretório.', { tipoGeo: 'bairro', lugares: [geoPino(it)] });
}

function geoRaioDoTexto(n) {
  const m = /\b(?:(?:num|em um|no|dentro de um)\s+)?raio\s+(?:de\s+|ate\s+)?(\d+(?:[.,]\d+)?)\s*(km|quilometros?|m|metros?)\b/.exec(n) || /\b(?:ate|a menos de|dentro de|em ate)\s+(\d+(?:[.,]\d+)?)\s*(km|quilometros?|m|metros?)\b/.exec(n);
  if (!m) return null;
  const v = geoDecimal(m[1]);
  const km = /^m/.test(m[2]) && m[2] !== 'km' && !/^quil/.test(m[2]) ? v / 1000 : v;
  return { km: Math.min(GEO_RAIO_MAXIMO, Math.max(0.05, km)), trecho: m[0] };
}

function geoResponderPerto(t, n, f, o) {
  const mk = /\b(?:perto|pertinho|proxim[oa]s?|arredores|ao redor|em volta|vizinh[oa]s?)\b/.exec(n);
  if (!mk) return null;
  const antesN = n.slice(0, mk.index);
  const maisProx = /\bmais$|\bmais proxim/.test(n.slice(Math.max(0, mk.index - 6), mk.index + mk[0].length)) || /\bmais (?:perto|proxim)/.test(n);
  const tipo = geoTipoDoTexto(antesN) || (maisProx ? geoTipoDoTexto(n.slice(mk.index + mk[0].length, mk.index + mk[0].length + 0)) : null);
  const raioInfo = geoRaioDoTexto(n);
  let depois = t.slice(mk.index + mk[0].length);
  if (raioInfo) { const p = geoNorm(depois).indexOf(raioInfo.trecho); if (p >= 0) depois = depois.slice(0, p); }
  depois = depois.replace(/^\s*(?:de|do|da|dos|das|a|ao|aos|as|à|às)\s+/i, '').replace(/^\s*(?:de|do|da)\s+/i, '');
  depois = geoLimparNome(depois.replace(/\b(?:no raio|num raio|dentro|ate)\b.*$/i, ''));
  const quantosMatch = /\b(\d{1,2})\s+(?:mais\s+)?proxim|\bas?\s+(\d{1,2})\s+(?:\w+\s+)?mais (?:perto|proxim)/.exec(n);
  let max = GEO_MAX_LISTA;
  if (quantosMatch) max = Math.min(GEO_MAX_LISTA, Number(quantosMatch[1] || quantosMatch[2]));
  else if (maisProx && !/\bs\b/.test(mk[0]) && tipo && !/\b(?:mais proximas|mais proximos)\b/.test(n)) max = 1;
  const raio = raioInfo ? raioInfo.km : maisProx ? GEO_RAIO_MAXIMO : GEO_RAIO_PADRAO;

  let centro = null, centroNome = '';
  if (!depois || /^(?:daqui|de mim|de onde estou|da minha (?:posicao|localizacao))$/i.test(geoNorm(depois)) || /^(?:aqui|mim|eu)$/.test(geoNorm(depois))) {
    centro = geoAparelho(o);
    if (!centro) {
      if (!tipo && !depois) return null;
      return geoResposta('Não sei onde você está: este app não me passou a posição do aparelho. Diga perto de qual unidade, lugar ou bairro, por exemplo "UBS perto do CRAS Cauamé".', { tipoGeo: 'perto', semPosicao: true });
    }
    centroNome = 'sua posição';
  } else {
    const r = geoAcharEmFontes(depois, f);
    if (r.ambiguos) return geoResposta(geoRotuloAmbiguo(depois, r.ambiguos), { tipoGeo: 'perto', ambiguo: true });
    if (!r.item) return tipo || /\b(?:o que|que (?:tem|fica|existe)|tem (?:algum|alguma))\b/.test(n) ? geoResposta(geoNaoAchei(depois, f), { tipoGeo: 'perto', naoAchou: true }) : null;
    if (r.item.lat == null) return geoResposta('"' + r.item.nome + '" está no diretório deste app, mas sem coordenadas. Não chuto latitude nem longitude: peça à coordenação para completar o cadastro.', { tipoGeo: 'perto', semCoordenadas: true });
    centro = r.item; centroNome = r.item.nome;
  }
  const lista = geoPerto(centro, f, { raioKm: raio, tipo: tipo, max: max });
  const rotuloTipo = tipo ? tipo.rotulo : 'Lugares';
  const usouMapa = lista.some(function (x) { return x.fonte === 'mapa'; });
  const nota = geoNotaDeFontes(f, usouMapa || (f.mapa.length > 0));
  const aprox = centro.fonte === 'bairro' || centro.fonte === 'rua' ? ' (' + (centro.fonte === 'bairro' ? 'centro do bairro' : 'centro da rua') + ', aproximação)' : '';
  let texto;
  if (!lista.length) {
    const alem = geoPerto(centro, f, { raioKm: GEO_RAIO_MAXIMO, tipo: tipo, max: 1 })[0];
    texto = 'Não encontrei ' + (tipo ? rotuloTipo : 'lugares') + ' num raio de ' + geoKm(raio) + ' de ' + centroNome + aprox + ' no que o app e o mapa me passaram.' + (alem ? ' O mais perto que conheço é ' + alem.nome + ', a ' + geoKm(alem.km) + '.' : '') + '\n' + nota;
  } else {
    const cab = maisProx && lista.length === 1 ? 'O mais perto de ' + centroNome + aprox + ':' : maisProx ? 'Os mais perto de ' + centroNome + aprox + ':' : (tipo ? rotuloTipo.charAt(0).toUpperCase() + rotuloTipo.slice(1) : 'Lugares') + ' num raio de ' + geoKm(raio) + ' de ' + centroNome + aprox + ':';
    texto = cab + '\n' + lista.map(function (x, i) { return (i + 1) + '. ' + x.nome + (x.bairro ? ' — ' + x.bairro : '') + ' · ' + geoKm(x.km); }).join('\n') + '\n' + nota;
  }
  const links = lista.length ? [{ rotulo: 'Abrir o mais perto no app de mapas', url: geoLinkMapa(lista[0].lat, lista[0].lng) }] : [];
  return geoResposta(texto, {
    tipoGeo: 'perto', links: links, lugares: lista.map(function (x) { return geoPino(x, x.km); }),
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nome: centroNome, centro: true }, geometry: { type: 'Point', coordinates: [centro.lng, centro.lat] } }].concat(lista.map(function (x) { return geoFeature(x, { km: Number(x.km.toFixed(2)) }); })) },
    centro: { nome: centroNome, lat: centro.lat, lng: centro.lng }, sensivel: centro.fonte === 'aparelho'
  });
}

function geoResolverPonta(txt, f, o) {
  const x = geoLimparNome(txt);
  if (/^(?:daqui|aqui|onde estou|minha (?:posicao|localizacao)|mim)$/.test(geoNorm(x))) { const a = geoAparelho(o); return a ? { item: a } : { semPosicao: true }; }
  const r = geoAcharEmFontes(x, f);
  r.nome = x;
  return r;
}

function geoResponderDistancia(t0, n0, f, o) {
  const t = t0.replace(/\s*,?\s*\b(?:(?:de|com|na|usando|em)\s+(?:uma\s+)?)?(?:moto|motocicleta|bicicleta|bike|carro|viatura)\b/gi, '').replace(/\s*,?\s*\b(?:a pé|andando|caminhando)\b/gi, '');
  const n = geoNorm(t);
  const modoTexto = geoNorm(t0);
  // "entre A e B" | "de A até B/para B/a B": todos os pontos de corte possíveis, porque o nome pode ter "e" (Casa de Apoio Paz e Vida)
  let candidatos = [];
  const me = /\bentre\s+(.+?)\s*[.?!]*$/.exec(n);
  if (me) {
    const ini = me.index + me[0].indexOf(me[1]);
    const resto = t.slice(ini, ini + me[1].length);
    const rn = geoNorm(resto);
    const re = /\s(?:e|com)\s/g;
    let k;
    while ((k = re.exec(rn)) !== null) candidatos.push([resto.slice(0, k.index), resto.slice(k.index + k[0].length)]);
  }
  const md = /\b(?:de|do|da|desde)\s+(.+?)\s*[.?!]*$/.exec(n.replace(/^.*?\b(?:distancia|dist[ae]ncias?|quantos? (?:km|quilometros?)|quanto (?:tempo|dista|falta))\b\s*/, 'de '));
  if (!candidatos.length && md) {
    const resto0 = t.slice(n.length - md[0].length > 0 ? n.length - md[0].length : 0);
    void resto0;
  }
  if (!candidatos.length) {
    const base = t.slice(0);
    const bn = geoNorm(base);
    const re2 = /\b(?:ate|para|pra|a|ao)\s/g;
    const ini = (function () { const m0 = /\b(?:de|do|da|desde)\s+/.exec(bn.replace(/^.*?\b(?:distancia|quantos? (?:km|quilometros?)|quanto (?:tempo|dista|falta)|dista)\b/, function (s) { return s.replace(/[^\s]/g, ' '); })); return m0 ? m0.index + m0[0].length : -1; })();
    if (ini >= 0) {
      const resto = base.slice(ini);
      const rn = geoNorm(resto);
      let k2;
      re2.lastIndex = 1;
      while ((k2 = re2.exec(rn)) !== null) { if (k2.index > 0 && rn.charAt(k2.index - 1) === ' ') candidatos.push([resto.slice(0, k2.index), resto.slice(k2.index + k2[0].length)]); }
    }
  }
  if (!candidatos.length) return null;
  let a = null, b = null, falhou = null, ambig = null;
  for (let i = 0; i < candidatos.length; i++) {
    const ra = geoResolverPonta(candidatos[i][0], f, o), rb = geoResolverPonta(candidatos[i][1], f, o);
    if (ra.item && rb.item) { a = ra.item; b = rb.item; break; }
    if (ra.semPosicao || rb.semPosicao) { return geoResposta('Não sei onde você está: este app não me passou a posição do aparelho. Diga os dois lugares pelo nome.', { tipoGeo: 'distancia', semPosicao: true }); }
    if (!ambig && (ra.ambiguos || rb.ambiguos)) ambig = ra.ambiguos ? [ra.nome, ra.ambiguos] : [rb.nome, rb.ambiguos];
    if (!falhou) falhou = !ra.item && !ra.ambiguos ? ra.nome : !rb.item && !rb.ambiguos ? rb.nome : '';
  }
  if (!a) {
    if (ambig) return geoResposta(geoRotuloAmbiguo(ambig[0], ambig[1]), { tipoGeo: 'distancia', ambiguo: true });
    return falhou ? geoResposta(geoNaoAchei(falhou, f), { tipoGeo: 'distancia', naoAchou: true }) : null;
  }
  const semCoord = [a, b].filter(function (x) { return x.lat == null; });
  if (semCoord.length) return geoResposta('"' + semCoord[0].nome + '" está no diretório deste app, mas sem coordenadas. Não chuto distância: peça à coordenação para completar o cadastro.', { tipoGeo: 'distancia', semCoordenadas: true });
  const modo = geoModo(modoTexto);
  const reta = geoDistanciaKm(a, b);
  const ruas = reta * GEO_FATOR_RUA;
  const min = ruas / GEO_VELOCIDADE[modo] * 60;
  const aprox = [a, b].some(function (x) { return x.fonte === 'bairro' || x.fonte === 'rua'; });
  const linhas = ['Distância entre ' + a.nome + ' e ' + b.nome + ':', '• Em linha reta: ' + geoKm(reta) + '.', '• Por ruas (linha reta × ' + String(GEO_FATOR_RUA).replace('.', ',') + '): cerca de ' + geoKm(ruas) + ', ~' + geoTempo(min) + ' ' + (modo === 'pe' ? 'a pé' : 'de ' + GEO_NOME_MODO[modo]) + ', sem trânsito.'];
  if (aprox) linhas.push('Bairro e rua contam pelo centro, então é aproximação.');
  linhas.push('É estimativa: confira o trajeto real no app de mapas.');
  return geoResposta(linhas.join('\n'), {
    tipoGeo: 'distancia', km: Number(reta.toFixed(2)), kmRuas: Number(ruas.toFixed(2)), minutos: Math.round(min), lugares: [geoPino(a), geoPino(b)], sensivel: a.fonte === 'aparelho' || b.fonte === 'aparelho',
    links: geoLinksDeRota([a, b], { modo: modo, cidade: o.cidade }),
    geojson: { type: 'FeatureCollection', features: [geoFeature(a), geoFeature(b), { type: 'Feature', properties: { km: Number(reta.toFixed(2)), estimativa: true }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }] }
  });
}

export function respostaDeGeo(texto, opcoes) {
  const o = opcoes || {};
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, 600);
  const tipo = geoTipoDePedido(t);
  if (!tipo) return null;
  const n = geoNorm(t);
  if (tipo === 'endereco') return geoResponderEndereco(t, o);
  const f = geoFontes(o);
  if (tipo === 'conversao') return geoResponderConversao(t, f, o);
  if (tipo === 'bairro') return geoResponderBairro(t, n, f);
  if (tipo === 'distancia') return geoResponderDistancia(t, n, f, o);
  if (tipo === 'perto') return geoResponderPerto(t, n, f, o);
  return geoResponderCoordenadas(t, n, f, o);
}
