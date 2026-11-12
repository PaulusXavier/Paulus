// Ordem de visita domiciliar, no aparelho: sem IA, sem rede, sem coordenadas.
//
// Recebe endereços de texto ("Rua Santo Agostinho, nº 193 — Centenário") e devolve a ordem em que a equipe
// deve visitar. Regras (nesta ordem):
//   1. a rua de partida vem primeiro, depois as demais ruas do mesmo bairro, depois os outros bairros;
//   2. dentro do bairro, rua por rua (ordem alfabética: sem mapa, é o único critério estável);
//   3. dentro da rua, em serpentina: sobe pelos números ímpares e desce pelos pares (lados opostos da rua);
//      na rua de partida, começa pelo número mais próximo do de partida;
//   4. S/N e endereço sem número vão ao fim da rua; endereço ilegível ou vazio vai ao fim de tudo, na ordem original;
//   5. o mesmo endereço fica junto (famílias no mesmo imóvel).
// É uma aproximação por texto. Quem conhece o território pode e deve ajustar a ordem à mão.
//
// v0.15.0 — o que a ordem ganha, SEMPRE no aparelho e sem mandar endereço a lugar nenhum:
//   - nomes de rua normalizados ("Cap. Ene Garcez" = "Capitão Ene Garcez"; erro de digitação de uma letra não cria rua nova);
//   - ordem natural ("Rua 2" antes de "Rua 10"; antes era alfabética pura e a 10 vinha antes da 2);
//   - opcoes.geo: se o app tem as coordenadas das ruas/bairros, a ordem das ruas passa a ser a de MENOR DESLOCAMENTO (busca exata até 9 ruas,
//     vizinho mais próximo + 2-opt acima disso) e a resposta traz km estimado e a economia sobre a ordem alfabética;
//   - opcoes.vizinhanca: ruas que a equipe já visitou em sequência (aprendidas quando a pessoa ajusta a ordem) viram "perto" onde não há coordenada;
//   - opcoes.ordemDeRuas: uma IA (ou a pessoa) pode propor SÓ a ordem das ruas; o programa valida, põe as casas em ordem dentro de cada rua e confere o km.
//     Por isso a IA nunca precisa ver número de casa, e uma resposta inválida dela é descartada (cai na ordem do programa).
// Sem geo, sem vizinhança e sem ordemDeRuas o resultado é o de sempre (só com nome normalizado e ordem natural).
//
// Privacidade: função pura. O endereço de residência nunca sai da função (nem para IA, nem para a rede).

const TIPOS_VISITA = {
  rua: 'rua', r: 'rua', avenida: 'avenida', av: 'avenida', travessa: 'travessa', tv: 'travessa', alameda: 'alameda',
  estrada: 'estrada', br: 'br', rr: 'rr', rodovia: 'rodovia', beco: 'beco', praca: 'praca', vicinal: 'vicinal', via: 'via',
  passagem: 'passagem', largo: 'largo', loteamento: 'loteamento', conjunto: 'conjunto', residencial: 'residencial',
  quadra: 'quadra', ramal: 'ramal'
};

function semAcentoV(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function compactarV(s) { return semAcentoV(s).replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// Abreviações de título no nome da rua: "Cap. Ene Garcez" e "Capitão Ene Garcez" são a mesma rua (o Cadastro Único e a digitação misturam).
const ABREV_NOME_V = { sto: 'santo', sta: 'santa', cap: 'capitao', cel: 'coronel', gal: 'general', mal: 'marechal', pres: 'presidente', prof: 'professor', profa: 'professora', dr: 'doutor', dra: 'doutora', eng: 'engenheiro', ten: 'tenente', sen: 'senador', dep: 'deputado', gov: 'governador' };
function canonicoNomeV(chave) { return String(chave).split(' ').map(function (w) { return ABREV_NOME_V[w] || w; }).join(' '); }
function limparBairroV(txt) { return compactarV(String(txt || '').replace(/\bcep\b.*$/i, '').replace(/\bbairro\b\s*:?/i, '').replace(/\b(?:boa vista|roraima|rr)\b.*$/i, '')); }

// Ordem natural: "rua 2" vem antes de "rua 10" (a comparação alfabética pura punha a 10 antes da 2).
const COLATOR_V = (function () { try { return new Intl.Collator('pt-BR', { numeric: true }); } catch (e) { return null; } })();
function compararV(a, b) { return COLATOR_V ? COLATOR_V.compare(a, b) : String(a).localeCompare(String(b), 'pt-BR'); }

function editaV(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let ant = []; for (let j = 0; j <= b.length; j++) ant.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let menor = i;
    for (let j = 1; j <= b.length; j++) { const v = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)); cur.push(v); if (v < menor) menor = v; }
    if (menor > max) return max + 1;
    ant = cur;
  }
  return ant[b.length];
}

function tituloV(s) { return String(s || '').split(' ').filter(Boolean).map(function (w, i) { return i > 0 && /^(?:de|da|do|das|dos|e)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }

// Complemento do imóvel (apto 3, casa 2, bloco B, qd 5, lt 12): não faz parte do nome da rua nem do número.
const KW_COMPL = '(?:apto|apt|ap|apartamento|casa|cs|bloco|bl|qd|quadra|lt|lote|sala|sl|torre|andar|fundos|frente)';
const RE_PARTE_COMPL = new RegExp('^(?:' + KW_COMPL + '(?: ?\\d+[a-z]?| [a-z])?\\s*)+$');
const RE_FIM_COMPL = new RegExp('(?:,|\\s)\\s*' + KW_COMPL + ' ?(?:\\d+[a-z]?|[a-z])$');
const RE_PARTE_NUM = /^(?:n |numero |num )?(?:\d{1,6}(?: ?[a-z])?|s ?\/ ?n|sn|sem numero)$/;

// "Rua Santo Agostinho, nº 193 — Centenário" -> { tipo, chave, numero, semNumero, bairro } ou null se ilegível
export function analisarEnderecoVisita(texto) {
  const bruto = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  if (!bruto) return null;
  // bairro: depois de travessão ou hífen com espaços ("... 193 — Centenário", "... 245 - 13 de Setembro")
  const partes = bruto.split(/\s+[—–-]\s+/);
  let via = partes[0];
  let bairroTxt = partes.slice(1).join(' ');
  // vírgulas: "Rua X, 12, casa 2, Bairro Y" / "Rua X, Bairro Y" (complemento sai; o que vem depois do número é bairro)
  const pc = via.split(/\s*,\s*/).filter((s) => s && !RE_PARTE_COMPL.test(compactarV(s)));
  const temVirgula = pc.length >= 2;
  if (temVirgula) {
    const k = pc.findIndex((s, i) => i > 0 && RE_PARTE_NUM.test(compactarV(s)));
    if (k > 0) { via = pc.slice(0, k + 1).join(', '); if (!bairroTxt) bairroTxt = pc.slice(k + 1).join(' '); }
    else if (!bairroTxt && !pc.slice(1).some((s) => /\d/.test(s))) { via = pc[0]; bairroTxt = pc.slice(1).join(' '); }
    else via = pc.join(', ');
  } else if (pc.length === 1) via = pc[0];
  const bairro = limparBairroV(bairroTxt);

  let v = compactarV(via);
  const mt = /^(r|av|tv|[a-z]+)\.? /.exec(v + ' ');
  let tipo = '';
  if (mt && TIPOS_VISITA[mt[1]]) { tipo = TIPOS_VISITA[mt[1]]; v = v.slice(mt[0].length - 1).trim(); }
  // sem tipo ("Santo Agostinho, 193"): só vale se houver vírgula e número; senão é texto solto, ilegível
  if (!tipo && !temVirgula) return null;
  while (RE_FIM_COMPL.test(v)) v = v.replace(RE_FIM_COMPL, '').trim();

  // número: "..., nº 193", "..., 193", "... 193", "10-A", "s/n"
  let numero = null; let semNumero = false;
  let m = /(?:,\s*|\s+)(?:n[o°º]?\.?\s*|numero\s*|num\s*)?(s\s*\/\s*n|sn|sem numero)$/.exec(v);
  if (m) { semNumero = true; v = v.slice(0, m.index).trim(); }
  else {
    m = /(?:,\s*|\s+)(?:n[o°º]?\.?\s*|numero\s*|num\s*)?(\d{1,6})(?: ?[a-z])?$/.exec(v);
    // "Rua 7 de Setembro" não tem número de imóvel; "Rua 7" (sem mais nada) também não: o 7 é o nome da rua
    if (m && v.slice(0, m.index).trim() && !/\b(?:de|da|do|das|dos|e)$/.test(v.slice(0, m.index).trim())) {
      numero = parseInt(m[1], 10); v = v.slice(0, m.index).trim();
    }
  }
  const chave = canonicoNomeV(v.replace(/,/g, ' ').replace(/\bn[o°º]?$/, '').replace(/\s+/g, ' ').trim());
  if (!chave) return null;
  if (!tipo && numero === null && !semNumero) return null;
  return { tipo, chave, numero, semNumero: semNumero || numero === null, bairro };
}

// ------------------------------------------------------------------ geografia (opcional)

const KM_RUA_V = 1.3;   // linha reta × 1,3, o mesmo fator de shared/rota.mjs
const MAX_EXATO_V = 9;  // até 9 ruas: ordem ótima exata; acima, vizinho mais próximo + 2-opt

function coordV(lat, lng) {
  const a = Number(lat), b = Number(lng);
  return isFinite(a) && isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === 0 && b === 0) ? [a, b] : null;
}

function kmV(a, b) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

// "Rua Santo Agostinho" -> { tipo, chave } (mesma normalização do endereço da família)
function lerViaV(texto) {
  let v = compactarV(texto);
  if (!v) return null;
  const mt = /^(r|av|tv|[a-z]+)\.? /.exec(v + ' ');
  let tipo = '';
  if (mt && TIPOS_VISITA[mt[1]]) { tipo = TIPOS_VISITA[mt[1]]; v = v.slice(mt[0].length - 1).trim(); }
  return v ? { tipo, chave: canonicoNomeV(v) } : null;
}

// geo: { ruas: [{ rua: 'Rua Santo Agostinho', bairro: 'Centenário', lat, lng }], bairros: [{ bairro: 'Centenário', lat, lng }] }
// Só dado público do mapa (centro da rua ou do bairro), nunca ponto de residência de família.
export function prepararGeo(geo) {
  const g = { ruas: new Map(), semBairro: new Map(), indef: new Map(), porBairro: new Map(), bairros: new Map(), n: 0 };
  if (!geo || typeof geo !== 'object') return g;
  (Array.isArray(geo.ruas) ? geo.ruas : []).slice(0, 20000).forEach((r) => {
    const ponto = r && coordV(r.lat, r.lng); const via = r && lerViaV(r.rua || r.nome);
    if (!ponto || !via) return;
    const b = limparBairroV(r.bairro); const k = via.tipo + ' ' + via.chave;
    g.ruas.set(k + '|' + b, ponto);
    if (!g.semBairro.has(k)) g.semBairro.set(k, []);
    g.semBairro.get(k).push(ponto);
    if (!b) { if (!g.indef.has(k)) g.indef.set(k, []); g.indef.get(k).push(ponto); }   // rua do mapa sem bairro informado: serve a qualquer bairro, se for a única de mesmo nome
    const kb = via.tipo + '|' + b;
    if (!g.porBairro.has(kb)) g.porBairro.set(kb, []);
    g.porBairro.get(kb).push({ chave: via.chave, ponto });
    g.n++;
  });
  (Array.isArray(geo.bairros) ? geo.bairros : []).slice(0, 2000).forEach((b) => {
    const ponto = b && coordV(b.lat, b.lng); const nome = b && limparBairroV(b.bairro || b.nome);
    if (ponto && nome) { g.bairros.set(nome, ponto); g.n++; }
  });
  return g;
}

// Onde fica esta rua? { ponto, nivel: 'rua' | 'bairro' } ou null. Aceita uma letra errada no nome (nomes com 8+ letras e sem número).
function pontoDaRuaV(g, tipo, chave, bairro) {
  if (!g || !g.n) return null;
  const k = tipo + ' ' + chave;
  let p = g.ruas.get(k + '|' + bairro);
  if (p) return { ponto: p, nivel: 'rua' };
  if (!bairro) { const l = g.semBairro.get(k); if (l && l.length === 1) return { ponto: l[0], nivel: 'rua' }; }
  else { const l = g.indef.get(k); if (l && l.length === 1 && (g.semBairro.get(k) || []).length === 1) return { ponto: l[0], nivel: 'rua' }; }
  if (chave.length >= 8 && !/\d/.test(chave)) {
    const lista = g.porBairro.get(tipo + '|' + bairro) || [];
    for (let i = 0; i < lista.length; i++) if (!/\d/.test(lista[i].chave) && editaV(chave, lista[i].chave, 1) <= 1) return { ponto: lista[i].ponto, nivel: 'rua' };
  }
  const b = bairro ? g.bairros.get(bairro) : null;
  return b ? { ponto: b, nivel: 'bairro' } : null;
}

// ------------------------------------------------------------------ vizinhança aprendida (ruas visitadas em sequência)

const VIZ_MAX_PARES = 1500, VIZ_MAX_CONTAGEM = 20, VIZ_SEP = ' <> ';
function chaveParV(a, b) { return a < b ? a + VIZ_SEP + b : b + VIZ_SEP + a; }
export function vizinhancaVazia() { return { v: 1, pares: {} }; }

function vizinhancaPares(viz) {
  return viz && typeof viz === 'object' && viz.pares && typeof viz.pares === 'object' && !Array.isArray(viz.pares) ? viz.pares : null;
}

// Depois que a equipe ajusta a ordem à mão, guarda quais ruas ela pôs em sequência (só nome de rua e bairro, nunca número de casa nem nome de pessoa).
// Devolve um objeto NOVO; quem guarda (localStorage etc.) é o app. A próxima ordem usa isso onde não há coordenada.
export function aprenderVizinhanca(viz, itensEmOrdem, partida) {
  const pares = Object.assign({}, vizinhancaPares(viz) || {});
  const P = prepararV(itensEmOrdem, partida);
  const seq = [];
  P.dados.forEach((d) => { if (d.a && (!seq.length || seq[seq.length - 1] !== d.unid)) seq.push(d.unid); });
  for (let i = 1; i < seq.length; i++) {
    if (seq[i - 1] === seq[i]) continue;
    const k = chaveParV(seq[i - 1], seq[i]);
    pares[k] = Math.min(VIZ_MAX_CONTAGEM, (Number(pares[k]) || 0) + 1);
  }
  const chaves = Object.keys(pares);
  if (chaves.length > VIZ_MAX_PARES) chaves.sort((x, y) => pares[y] - pares[x]).slice(VIZ_MAX_PARES).forEach((k) => { delete pares[k]; });
  return { v: 1, pares };
}

export function resumoVizinhanca(viz) {
  const pares = vizinhancaPares(viz) || {}; const ruas = new Set();
  Object.keys(pares).forEach((k) => { k.split(VIZ_SEP).forEach((r) => ruas.add(r)); });
  return { ligacoes: Object.keys(pares).length, ruas: ruas.size };
}

// ------------------------------------------------------------------ agrupar em ruas

function prepararV(itens, partida) {
  const lista = Array.isArray(itens) ? itens : [];
  const p = analisarEnderecoVisita(partida);
  const dados = lista.map((item, i) => ({ item, i, a: analisarEnderecoVisita(item && item.endereco), unid: '' }));
  const legiveis = dados.filter((d) => d.a);
  const ilegiveis = dados.filter((d) => !d.a);

  // ruas: mesmo tipo + nome + bairro. "Rua 1" do Pintolândia e "Rua 1" do Caranã são ruas diferentes;
  // endereço sem bairro entra na única rua de mesmo nome, se houver só uma.
  const ruas = new Map();
  const idRua = (a) => a.tipo + ' ' + a.chave + '|' + a.bairro;
  legiveis.forEach((d) => {
    const id = idRua(d.a);
    let r = ruas.get(id);
    if (!r) { r = { id, tipo: d.a.tipo, chave: d.a.chave, bairro: d.a.bairro, primeiro: d.i, itens: [] }; ruas.set(id, r); }
    r.itens.push(d);
  });
  Array.from(ruas.values()).filter((r) => !r.bairro).forEach((r) => {
    const iguais = Array.from(ruas.values()).filter((x) => x !== r && x.tipo === r.tipo && x.chave === r.chave);
    if (iguais.length === 1) { iguais[0].itens = iguais[0].itens.concat(r.itens); iguais[0].primeiro = Math.min(iguais[0].primeiro, r.primeiro); ruas.delete(r.id); }
  });
  // uma letra errada no nome ("Santo Agostino") não cria rua nova: junta na grafia mais usada, no mesmo bairro
  const porTamanho = Array.from(ruas.values()).sort((x, y) => y.itens.length - x.itens.length || x.primeiro - y.primeiro);
  for (let i = 0; i < porTamanho.length; i++) {
    const r = porTamanho[i];
    if (!ruas.has(r.id) || r.chave.length < 8 || /\d/.test(r.chave)) continue;
    for (let j = 0; j < i; j++) {
      const k = porTamanho[j];
      if (!ruas.has(k.id) || k.tipo !== r.tipo || (k.bairro !== r.bairro && k.bairro && r.bairro) || /\d/.test(k.chave)) continue;
      if (editaV(r.chave, k.chave, 1) <= 1) { k.itens = k.itens.concat(r.itens); k.primeiro = Math.min(k.primeiro, r.primeiro); ruas.delete(r.id); break; }
    }
  }
  const arr = Array.from(ruas.values());
  arr.forEach((r) => { r.itens.forEach((d) => { d.unid = r.id; }); });
  const ehPartida = (r) => !!p && r.tipo === p.tipo && r.chave === p.chave && (!p.bairro || !r.bairro || r.bairro === p.bairro);
  return { lista, p, dados, ilegiveis, ruas: arr, ehPartida };
}

// Ordem de sempre: partida, bairro da partida, outros bairros na ordem em que aparecem, rua por rua em ordem natural.
function ordemLegadaV(P) {
  const { p, ruas, ehPartida } = P;
  const bairros = [];
  if (p && p.bairro) bairros.push(p.bairro);
  ruas.slice().sort((x, y) => x.primeiro - y.primeiro).forEach((r) => { if (r.bairro && bairros.indexOf(r.bairro) < 0) bairros.push(r.bairro); });
  const rang = (b) => (b ? bairros.indexOf(b) : bairros.length);
  return ruas.slice().sort((x, y) => {
    const px = ehPartida(x) ? 0 : 1; const py = ehPartida(y) ? 0 : 1;
    if (px !== py) return px - py;
    const bx = rang(x.bairro); const by = rang(y.bairro);
    if (bx !== by) return bx - by;
    return compararV(x.chave, y.chave) || compararV(x.tipo, y.tipo) || x.primeiro - y.primeiro;
  });
}

// As ruas de uma lista de visitas, SEM número de casa: é o que se pode mostrar a uma IA (ou à tela) para ela propor a ordem das ruas.
// ids: use-os em opcoes.ordemDeRuas.
export function ruasDasVisitas(itens, partida) {
  const P = prepararV(itens, partida);
  return {
    ruas: ordemLegadaV(P).map((r) => ({ id: r.id, rotulo: tituloV((r.tipo ? r.tipo + ' ' : '') + r.chave) + (r.bairro ? ' — ' + tituloV(r.bairro) : ''), bairro: tituloV(r.bairro), quantidade: r.itens.length })),
    ilegiveis: P.ilegiveis.length
  };
}

// ------------------------------------------------------------------ menor caminho entre ruas

function custoCaminhoV(o, D) { let c = 0; for (let i = 1; i < o.length; i++) c += D[o[i - 1]][o[i]]; return c; }

// Busca exata (programação dinâmica sobre subconjuntos). inicio: índice fixo ou -1.
function caminhoExatoV(D, n, inicio) {
  const cheio = (1 << n) - 1; const dp = []; const pai = [];
  for (let m = 0; m <= cheio; m++) { dp.push(new Array(n).fill(Infinity)); pai.push(new Array(n).fill(-1)); }
  for (let j = 0; j < n; j++) if (inicio < 0 || j === inicio) dp[1 << j][j] = 0;
  for (let m = 1; m <= cheio; m++) {
    for (let j = 0; j < n; j++) {
      const a = dp[m][j];
      if (a === Infinity || !(m & (1 << j))) continue;
      for (let k = 0; k < n; k++) {
        if (m & (1 << k)) continue;
        const t = m | (1 << k); const nv = a + D[j][k];
        if (nv < dp[t][k] - 1e-12) { dp[t][k] = nv; pai[t][k] = j; }
      }
    }
  }
  let melhor = Infinity; let ult = 0;
  for (let j = 0; j < n; j++) if (dp[cheio][j] < melhor - 1e-12) { melhor = dp[cheio][j]; ult = j; }
  const seq = []; let m = cheio; let j = ult;
  while (j >= 0) { seq.unshift(j); const q = pai[m][j]; m &= ~(1 << j); j = q; }
  return seq;
}

function doisOptV(o, D, fixo) {
  const n = o.length;
  for (let volta = 0; volta < 60; volta++) {
    let melhorou = false;
    for (let i = fixo ? 1 : 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = i > 0 ? o[i - 1] : -1; const b = o[i]; const c = o[j]; const d = j < n - 1 ? o[j + 1] : -1;
        const delta = (a >= 0 ? D[a][c] - D[a][b] : 0) + (d >= 0 ? D[b][d] - D[c][d] : 0);
        if (delta < -1e-9) { for (let x = i, y = j; x < y; x++, y--) { const t = o[x]; o[x] = o[y]; o[y] = t; } melhorou = true; }
      }
    }
    if (!melhorou) break;
  }
  return o;
}

function caminhoHeuristicoV(D, n, inicio) {
  const comecos = [];
  if (inicio >= 0) comecos.push(inicio); else if (n <= 60) for (let i = 0; i < n; i++) comecos.push(i); else comecos.push(0);
  let melhor = null; let melhorC = Infinity;
  comecos.forEach((s) => {
    const o = [s]; const usado = new Array(n).fill(false); usado[s] = true;
    while (o.length < n) {
      const at = o[o.length - 1]; let prox = -1;
      for (let k = 0; k < n; k++) if (!usado[k] && (prox < 0 || D[at][k] < D[at][prox] - 1e-12)) prox = k;
      usado[prox] = true; o.push(prox);
    }
    doisOptV(o, D, inicio >= 0);
    const c = custoCaminhoV(o, D);
    if (c < melhorC - 1e-12) { melhorC = c; melhor = o; }
  });
  return melhor;
}

// Ordena as ruas pela menor distância. Empate (distância igual) mantém a ordem de entrada, que é a alfabética natural.
function otimizarRuasV(base, P, ctx) {
  const virtual = ctx.partidaPonto && !base.some((r) => P.ehPartida(r)) ? { id: '\u0000partida', ponto: ctx.partidaPonto, virtual: true } : null;
  const nos = (virtual ? [virtual] : []).concat(base);
  const n = nos.length;
  const pesoV = ctx.viz;
  const D = nos.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const u = nos[i]; const v = nos[j]; let d;
      if (u.ponto && v.ponto) d = kmV(u.ponto, v.ponto) * KM_RUA_V;
      else if (pesoV && pesoV[chaveParV(u.id, v.id)] > 0) d = 0.15;
      else if (u.bairro && u.bairro === v.bairro) d = 0.6;
      else d = 2.5;
      d += 1e-6 * (j - i);   // desempate: na dúvida, a ordem de entrada
      D[i][j] = d; D[j][i] = d;
    }
  }
  let inicio = virtual ? 0 : -1;
  if (!virtual) base.forEach((r, i) => { if (inicio < 0 && P.ehPartida(r)) inicio = i; });
  const ordem = n <= MAX_EXATO_V ? caminhoExatoV(D, n, inicio) : caminhoHeuristicoV(D, n, inicio);
  return ordem.map((i) => nos[i]).filter((r) => !r.virtual);
}

function kmDaOrdemV(rotas, partidaPonto, primeiraEhPartida) {
  if (rotas.length < 1 || rotas.some((r) => !r.ponto)) return null;
  let km = 0;
  if (partidaPonto && !primeiraEhPartida) km += kmV(partidaPonto, rotas[0].ponto) * KM_RUA_V;
  for (let i = 1; i < rotas.length; i++) km += kmV(rotas[i - 1].ponto, rotas[i].ponto) * KM_RUA_V;
  return km;
}

// ------------------------------------------------------------------ ordem

function ordenarCasasV(r, p, ehPartidaRua, serpentina) {
  const comNumero = r.itens.filter((d) => d.a.numero !== null).sort((x, y) => x.a.numero - y.a.numero || x.i - y.i);
  const semNum = r.itens.filter((d) => d.a.numero === null).sort((x, y) => x.i - y.i);
  let meio = comNumero;
  if (serpentina) {
    const impares = comNumero.filter((d) => d.a.numero % 2 === 1);
    const pares = comNumero.filter((d) => d.a.numero % 2 === 0);
    let subida = impares; let volta = pares.slice().reverse();
    // rua de partida: começa pelo lado e pelo número mais próximos do ponto de partida
    if (ehPartidaRua && p.numero !== null) {
      const lado = p.numero % 2 === 1 ? impares : pares;
      const outro = p.numero % 2 === 1 ? pares : impares;
      const ate = lado.filter((d) => d.a.numero >= p.numero);
      const antes = lado.filter((d) => d.a.numero < p.numero).reverse();
      subida = ate.concat(antes);
      volta = outro.slice().sort((x, y) => Math.abs(x.a.numero - p.numero) - Math.abs(y.a.numero - p.numero) || x.i - y.i);
    }
    meio = subida.concat(volta);
  }
  return meio.concat(semNum);
}

// itens: [{ endereco }]  ->  { itens (reordenados), indices (posição original de cada um), ilegiveis (quantos foram ao fim),
//   metodo: 'texto' | 'geografia' | 'aprendido' | 'ruas-informadas', ruas: [{ id, rotulo, quantidade }],
//   km, kmLegado, economiaKm, nivelGeo ('rua' | 'bairro' | ''), cobertura (0 a 1, parte das ruas com coordenada), ordemRuasInvalida?, ordemRuasIncompleta? }
// opcoes: { serpentina (padrão true), geo, partidaPonto: { lat, lng }, vizinhanca, ordemDeRuas: [ids] }
export function ordenarVisitas(itens, partida, opcoes) {
  const o = Object.assign({ serpentina: true }, opcoes || {});
  const P = prepararV(itens, partida);
  const { p, ilegiveis, ehPartida } = P;
  const legado = ordemLegadaV(P);

  // coordenadas
  const g = prepararGeo(o.geo);
  let comPonto = 0; let soBairro = false;
  P.ruas.forEach((r) => {
    const x = pontoDaRuaV(g, r.tipo, r.chave, r.bairro);
    if (x) { r.ponto = x.ponto; comPonto++; if (x.nivel === 'bairro') soBairro = true; }
  });
  let partidaPonto = o.partidaPonto ? coordV(o.partidaPonto.lat, o.partidaPonto.lng) : null;
  if (!partidaPonto && p) { const x = pontoDaRuaV(g, p.tipo, p.chave, p.bairro); if (x) partidaPonto = x.ponto; }
  const viz = vizinhancaPares(o.vizinhanca);
  const ids = new Set(P.ruas.map((r) => r.id));
  let temVizinha = false;
  if (viz) { const l = P.ruas; for (let i = 0; i < l.length && !temVizinha; i++) for (let j = i + 1; j < l.length; j++) if (viz[chaveParV(l[i].id, l[j].id)] > 0) { temVizinha = true; break; } }

  let lista = legado; let metodo = 'texto'; let invalida = ''; let incompleta = 0;
  if (Array.isArray(o.ordemDeRuas)) {
    const vistos = new Set(); let erro = '';
    o.ordemDeRuas.forEach((id) => { if (!ids.has(id)) erro = erro || 'rua desconhecida'; else if (vistos.has(id)) erro = erro || 'rua repetida'; else vistos.add(id); });
    if (erro) invalida = erro;
    else {
      const porId = new Map(P.ruas.map((r) => [r.id, r]));
      const faltam = legado.filter((r) => !vistos.has(r.id));
      incompleta = faltam.length;
      lista = o.ordemDeRuas.map((id) => porId.get(id)).concat(faltam);
      metodo = 'ruas-informadas';
    }
  }
  if (metodo === 'texto' && (comPonto >= 2 || temVizinha) && legado.length > 1) {
    lista = otimizarRuasV(legado, P, { partidaPonto, viz: temVizinha ? viz : null });
    metodo = comPonto >= 2 ? 'geografia' : 'aprendido';
  }

  const ordem = [];
  lista.forEach((r) => { ordenarCasasV(r, p, ehPartida(r), o.serpentina).forEach((d) => ordem.push(d)); });
  ilegiveis.forEach((d) => ordem.push(d));

  const km = comPonto === P.ruas.length && comPonto >= 2 ? kmDaOrdemV(lista, partidaPonto, lista.length && ehPartida(lista[0])) : null;
  const kmLegado = km === null ? null : kmDaOrdemV(legado, partidaPonto, legado.length && ehPartida(legado[0]));
  const saida = {
    itens: ordem.map((d) => d.item), indices: ordem.map((d) => d.i), ilegiveis: ilegiveis.length, metodo,
    ruas: lista.map((r) => ({ id: r.id, rotulo: tituloV((r.tipo ? r.tipo + ' ' : '') + r.chave) + (r.bairro ? ' — ' + tituloV(r.bairro) : ''), quantidade: r.itens.length })),
    km: km === null ? null : Number(km.toFixed(2)), kmLegado: kmLegado === null ? null : Number(kmLegado.toFixed(2)),
    economiaKm: km === null ? 0 : Number(Math.max(0, kmLegado - km).toFixed(2)),
    nivelGeo: km === null ? '' : (soBairro ? 'bairro' : 'rua'), cobertura: P.ruas.length ? comPonto / P.ruas.length : 0
  };
  if (invalida) saida.ordemRuasInvalida = invalida;
  if (incompleta) saida.ordemRuasIncompleta = incompleta;
  return saida;
}

// A IA propõe a ordem das ruas; o programa confere. Sem coordenada não há como medir, e vale a proposta (a pessoa ligou a IA);
// com coordenada, a proposta só vale se não for mais longa que a do programa. Proposta inválida (rua que não existe, repetida) é descartada.
// -> { ...ordenarVisitas, origem: 'ia' | 'programa', motivo, verificada }
export function ordenarComSugestao(itens, partida, sugestao, opcoes) {
  const base = Object.assign({}, opcoes || {}); delete base.ordemDeRuas;
  const programa = ordenarVisitas(itens, partida, base);
  if (!Array.isArray(sugestao) || !sugestao.length) return Object.assign(programa, { origem: 'programa', motivo: 'sem sugestão da IA', verificada: true });
  const ia = ordenarVisitas(itens, partida, Object.assign({}, base, { ordemDeRuas: sugestao }));
  if (ia.ordemRuasInvalida) return Object.assign(programa, { origem: 'programa', motivo: 'a IA propôs uma ordem inválida (' + ia.ordemRuasInvalida + ')', verificada: true });
  if (ia.km === null || programa.km === null) return Object.assign(ia, { origem: 'ia', motivo: 'sem coordenadas para conferir a distância', verificada: false });
  if (ia.km > programa.km * 1.02 + 0.05) return Object.assign(programa, { origem: 'programa', motivo: 'a ordem da IA daria ' + ia.km.toFixed(1).replace('.', ',') + ' km e a do programa ' + programa.km.toFixed(1).replace('.', ',') + ' km', verificada: true });
  return Object.assign(ia, { origem: 'ia', motivo: 'conferida pelas coordenadas', verificada: true });
}

export const EXPLICACAO_VISITAS = 'O Paulus ordena no seu aparelho, sem enviar nada para a internet: começa pela rua de partida, depois as outras ruas do bairro (em ordem alfabética), e em cada rua sobe pelos números ímpares e volta pelos pares. Sem número ou sem endereço legível vai ao fim. É uma aproximação pelo texto do endereço, sem mapa: ajuste a ordem se você conhece um caminho melhor.';

// Texto que diz, sem exagero, COMO esta ordem saiu. Nunca promete mais que o método usado.
export function explicacaoDaOrdem(r) {
  if (!r || r.metodo === 'texto') return EXPLICACAO_VISITAS;
  const km = (x) => x.toFixed(1).replace('.', ',') + ' km';
  if (r.metodo === 'geografia') {
    let t = 'O Paulus ordenou as ruas pela menor distância entre elas, usando as coordenadas guardadas neste app (nada foi enviado para a internet); em cada rua sobe pelos ímpares e volta pelos pares.';
    if (r.km !== null && r.kmLegado !== null) t += ' Estimativa: ' + km(r.km) + (r.economiaKm >= 0.1 ? ' (a ordem alfabética daria ' + km(r.kmLegado) + ')' : '') + ', em linha reta × 1,3, sem trânsito nem mão de rua' + (r.nivelGeo === 'bairro' ? ' e, como algumas ruas só têm a coordenada do bairro, com pouca precisão' : '') + '.';
    else t += ' Algumas ruas não têm coordenada, então não dá para estimar o quilômetro total.';
    return t + ' Se você conhece um caminho melhor, ajuste à mão: o app aprende com o seu ajuste.';
  }
  if (r.metodo === 'aprendido') return 'O Paulus ordenou as ruas juntando as que a sua equipe já costuma visitar em sequência (aprendido dos seus ajustes, guardado só neste aparelho). Sem coordenadas, é uma aproximação: ajuste à mão se preciso.';
  return 'A ordem das ruas veio da IA' + (r.verificada ? ' e foi conferida pelo programa' : ', sem como conferir a distância (faltam coordenadas das ruas)') + '; a ordem das casas dentro de cada rua (ímpares subindo, pares voltando) é do programa. Confira se faz sentido para quem conhece o território.';
}
