// Rotas do Paulus: ordem das paradas, distância, tempo e link do mapa. Sem IA, sem rede e sem eval. FONTE ÚNICA: navegador e Worker.
//
// Por que existe: modelo de linguagem inventa quilômetro e minuto. Aqui o programa lê o pedido, acha as unidades no diretório do app,
// escolhe a melhor ordem (busca exata, até 11 paradas), mede e monta o link. A IA, se entrar, só explica o resultado.
//
//   lerPedidoDeRota(texto)           -> o que a pessoa pediu (paradas escritas, volta, modo, tempo por parada...) ou null se não é pedido de rota
//   respostaDeRota(texto, opcoes)    -> { texto, links, svg, geojson, paradas, km, minutos, ... } ou null (aí a pergunta segue o caminho normal)
//        opcoes.pontos   [{ nome, lat, lng, endereco?, apelidos?[] }] (ou função que devolve a lista): o diretório do app. Só unidades PÚBLICAS.
//        opcoes.aparelho { lat, lng } ou null: posição de quem pergunta ("saindo daqui"). O Paulus nunca pede o GPS: quem passa é o app.
//        opcoes.cidade   'Boa Vista, RR': acrescentada ao nome quando o link do mapa é feito só com texto.
//   planejarRota(pontos, opcoes)     -> { ordem, trechos, km, minutos, links, geojson... } (pontos já com lat e lng)
//   textoDaRota(r), svgDaRota(r), distanciaKm(a, b)
//
// É ESTIMATIVA: linha reta × 1,3 (ruas) numa velocidade média por modo, sem trânsito, mão de rua nem horário das unidades.
// Endereço de residência de família não entra (o programa recusa): rota é entre unidades, bairros e serviços.
// Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos quebram o arquivo inteiro). Nomes com prefixo "rota" por causa do arquivo único do navegador.

const ROTA_FATOR_RUA = 1.3;
const ROTA_VELOCIDADE = { carro: 30, moto: 30, bicicleta: 12, pe: 4.5 };
const ROTA_NOME_MODO = { carro: 'carro', moto: 'moto', bicicleta: 'bicicleta', pe: 'a pé' };
const ROTA_MODO_MAPA = { carro: 'driving', moto: 'driving', bicicleta: 'bicycling', pe: 'walking' };
const ROTA_MAX_PARADAS = 11;
const ROTA_MAX_TEXTO = 600;

// ------------------------------------------------------------------ texto

// Minúsculas e sem acento, MESMO comprimento do original (para cortar o original pelos índices do normalizado).
function rotaNorm(s) {
  const t = String(s == null ? '' : s);
  let o = '';
  for (let i = 0; i < t.length; i++) o += t.charAt(i).normalize('NFD').charAt(0).toLowerCase();
  return o;
}

function rotaEscapar(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function rotaKm(x) { return x.toFixed(1).replace('.', ',') + ' km'; }

function rotaTempo(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r + ' min' : '');
}

// Corta de est (texto original + normalizado, sempre do mesmo tamanho) o que casa com re (feita sobre est.n).
// Devolve os grupos do ORIGINAL (com acento e maiúscula) ou null.
function rotaCortar(est, re) {
  const m = re.exec(est.n);
  if (!m) return null;
  const grupos = [];
  for (let i = 1; i < m.length; i++) {
    if (m[i] == null) { grupos.push(''); continue; }
    const p = m.index + m[0].lastIndexOf(m[i]);
    grupos.push(est.t.slice(p, p + m[i].length));
  }
  est.t = est.t.slice(0, m.index) + ' ' + est.t.slice(m.index + m[0].length);
  est.n = est.n.slice(0, m.index) + ' ' + est.n.slice(m.index + m[0].length);
  return grupos;
}

// Onde um nome de lugar termina: pontuação, fim, ou uma palavra que começa outra parte do pedido.
const ROTA_PARADA_FIM = '(?=[,;:.?!]|$|\\s(?:passando|voltando|retornando|terminando|finalizando|chegando|visitando|visitar|depois|ate|para|pra|rumo|de moto|de carro|de bike|de bicicleta|de viatura|a pe|andando|caminhando|com|usando|e volta|ida e volta|e depois|e passando|e voltando)\\b)';
const ROTA_NOME = '([^,;:.?!]+?)';
const ROTA_ARTIGO = '(?:(?:o|a|os|as|ao|aos|na|no|nas|nos|em|ate|para|pra|por|pelo|pela|de|do|da|dos|das)\\s+)';

const ROTA_MODOS = [
  ['moto', /\b(?:(?:de|com|na|usando|em)\s+(?:uma\s+)?)?(?:moto|motocicleta)\b/],
  ['bicicleta', /\b(?:(?:de|com|na|usando|em)\s+(?:uma\s+)?)?(?:bicicleta|bike)\b/],
  ['pe', /\b(?:a pe|andando|caminhando|de pe)\b/],
  ['carro', /\b(?:(?:de|com|no|usando|em)\s+(?:um\s+)?)?(?:carro|viatura|veiculo|automovel)\b/]
];

// A palavra sozinha não é lugar: "rota de CRAS e CREAS" é assunto, não pedido.
const ROTA_RUIDO = /^(?:uma|um|rota|rotas|trajeto|percurso|itinerario|dia|hoje|amanha|semana|saida|saidas)$/;
const ROTA_GENERICOS = /^(?:cras|creas|caps|ubs|upa|unidade|unidades|servico|servicos|rede|equipe|familia|familias|visita|visitas|atendimento|atendimentos|grupo|grupos|oficina|oficinas|reuniao|reunioes|territorio|bairro|bairros|fuga|acesso|encaminhamento|encaminhamentos|beneficio|beneficios|campo)$/;

// Só palavras de assunto ("oficinas da semana", "visitas"): não é lugar. Em pedido explícito, "CRAS" sozinho é lugar ambíguo e a pessoa será perguntada qual.
function rotaSoAssunto(nome, explicito) {
  const pal = rotaNorm(nome).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (w) { return w && !/^(?:de|do|da|dos|das|e|o|a|os|as|ao|na|no|em|para|pra|por)$/.test(w); });
  return !pal.length || pal.every(function (w) { return ROTA_RUIDO.test(w) || (!explicito && ROTA_GENERICOS.test(w)); });
}
const ROTA_CONCEITO = /^(?:o que (?:e|sao|significa)|qual (?:e )?a diferenca|para que serve|por que|porque|quem faz|como funciona)\b/;
// Pedido inequívoco (verbo de traçar, "como chegar", "melhor ordem"). "Rota de ..." sozinho é fraco: pode ser assunto ("rota de fuga").
const ROTA_EXPLICITO = /\b(?:tracar|trace|tracando|calcule|calcular|monte|montar|planeje|planejar|faca|fazer|me de|quero|preciso|gere|gerar)\b[^.?!]{0,30}\b(?:rota|rotas|trajeto|percurso|itinerario|ordem)\b|\bcomo (?:chegar|ir)\b|\b(?:melhor|menor|mais curta|mais rapida) (?:ordem|rota|caminho|trajeto|percurso)\b/;
const ROTA_GATILHO = /\b(?:rotas?|trajeto|percurso|itinerario|tracar|trace|melhor ordem|menor caminho|como chegar|como ir)\b/;
const ROTA_ENDERECO = /\b(?:rua|r|av|avenida|travessa|tv|alameda|beco|quadra|qd|lote|estrada|vicinal)\.?\s+[^,;]{0,40}?\b\d+/i;

const ROTA_INTROS = [
  /\bcomo (?:chegar|ir)(?: (?:a|ao|aos|as|na|no|nas|nos|em|ate|para|pra))?\b/,
  /\b(?:visitar|visitando|passar por|passando por|ir (?:a|ao|aos|as|na|no|nas|nos|em|para|pra))\b/,
  /\b(?:rotas?|trajeto|percurso|itinerario)(?: (?:de|do|da|dos|das|para|pra|ate|entre|em|ao|a|na|no))?\b/,
  /\b(?:melhor|menor|mais curta|mais rapida) (?:ordem|rota|caminho|trajeto|percurso)(?: (?:para|de|pra))?(?: (?:visitar|passar por))?\b/,
  /\bordem (?:de|das|dos|para|pra)(?: visitas?| paradas?)?\b/,
  /:/
];

function rotaLimparNome(s) {
  let x = String(s).replace(/\s+/g, ' ').trim();
  x = x.replace(/[.?!,;:\s]+$/, '').replace(/^[.?!,;:\s]+/, '');
  let ant;
  do {
    ant = x;
    x = x.replace(/^(?:o|a|os|as|ao|aos|à|às|na|no|nas|nos|em|até|ate|para|pra|por|pelo|pela|de|do|da|dos|das)\s+/i, '');
    x = x.replace(/\s+(?:por favor|pfv|pf|obrigado|obrigada)$/i, '');
  } while (x !== ant);
  return x.trim();
}

// Divide a lista de paradas ("A, B e C", "A -> B -> C", "A; B"). sequencia = a pessoa usou setas (ordem dela).
function rotaDividir(est, explicito) {
  const itens = [];
  let sequencia = false;
  const re = /\s*(?:->|=>|→|>|;|,|\se\s|\sdepois\s|\se depois\s|\sseguindo para\s)\s*/g;
  let ult = 0, m;
  const pedacos = [];
  while ((m = re.exec(est.n)) !== null) {
    if (/[>→]/.test(m[0])) sequencia = true;
    pedacos.push([ult, m.index]);
    ult = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  pedacos.push([ult, est.n.length]);
  pedacos.forEach(function (p) {
    const nome = rotaLimparNome(est.t.slice(p[0], p[1]));
    if (!nome || nome.length > 70 || nome.split(' ').length > 8) return;
    if (rotaSoAssunto(nome, explicito) || /\b(?:tracar|trace|rota|rotas|trajeto|percurso)\b/.test(rotaNorm(nome))) return;
    itens.push(nome);
  });
  return { itens: itens, sequencia: sequencia };
}

// ------------------------------------------------------------------ leitura do pedido

export function lerPedidoDeRota(texto) {
  const original = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, ROTA_MAX_TEXTO);
  if (!original) return null;
  const est = { t: original, n: rotaNorm(original) };
  if (!ROTA_GATILHO.test(est.n)) return null;
  const explicito = ROTA_EXPLICITO.test(est.n);
  if (!explicito && ROTA_CONCEITO.test(est.n.trim())) return null;
  const comoChegar = /\bcomo (?:chegar|ir)\b/.test(est.n);

  // modo de deslocamento e tempo em cada parada
  let modo = '';
  ROTA_MODOS.forEach(function (x) { if (!modo && rotaCortar(est, x[1])) modo = x[0]; });
  let minutosPorParada = 0;
  let g = rotaCortar(est, /\b(\d{1,3})\s*(?:min|minutos?)\b(?:\s+(?:em cada(?: parada| visita| unidade)?|por (?:parada|visita|unidade)|cada|de atendimento|de conversa))/);
  if (g) minutosPorParada = Math.min(240, Number(g[0]));
  else {
    g = rotaCortar(est, /\b(\d{1,2})(?:[.,](\d))?\s*(?:h|hora|horas)\s+(?:em cada(?: parada| visita| unidade)?|por (?:parada|visita|unidade)|cada)\b/);
    if (g) minutosPorParada = Math.min(240, Math.round((Number(g[0]) + (g[1] ? Number(g[1]) / 10 : 0)) * 60));
  }

  // ordem: "nessa ordem" trava; "melhor ordem" libera
  let otimizar = 'auto';
  if (rotaCortar(est, /\b(?:nessa ordem|nesta ordem|sem reordenar|sem mudar a ordem|nao mude a ordem|na ordem (?:que|em que) (?:escrevi|digitei|citei|passei))\b/)) otimizar = 'nao';
  else if (rotaCortar(est, /\b(?:otimiz\w+|reorden\w+|minimiz\w+|economiz\w+|menor caminho)\b/)) otimizar = 'sim';
  else if (/\b(?:melhor|menor|mais curta|mais rapida) (?:ordem|rota|caminho|trajeto|percurso)\b/.test(est.n)) otimizar = 'sim';

  // volta ao início (ou a outro lugar, que vira o fim)
  let volta = false, fimNome = '';
  g = rotaCortar(est, new RegExp('\\b(?:volt(?:ando|ar|a)|retorn(?:ando|ar|o))\\b(?:\\s+(?:ao|aos|a|as|para|pro|pra|ate|no|na)\\s+' + ROTA_NOME + ')?' + ROTA_PARADA_FIM));
  if (g) { volta = true; fimNome = rotaLimparNome(g[0]); }
  if (rotaCortar(est, /\b(?:ida e volta|e volta|de volta)\b/)) volta = true;

  // saída
  let origem = '', origemAparelho = false;
  if (rotaCortar(est, /\b(?:(?:saindo|partindo|comecando|a partir)\s+(?:de\s+)?)?(?:daqui|de onde (?:eu )?estou|da minha (?:posicao|localizacao)(?: atual)?|de minha localizacao)\b/)) origemAparelho = true;
  if (!origemAparelho) {
    g = rotaCortar(est, new RegExp('\\b(?:saindo|partindo|comecando|iniciando|a partir)\\s+(?:(?:do|da|de|dos|das|no|na|em)\\s+)?' + ROTA_NOME + ROTA_PARADA_FIM));
    if (g) origem = rotaLimparNome(g[0]);
  }

  // fim fixo e paradas do meio
  let fim = '';
  g = rotaCortar(est, new RegExp('\\b(?:terminando|finalizando|chegando|encerrando)\\s+(?:no|na|em|ao|a|nos|nas)\\s+' + ROTA_NOME + ROTA_PARADA_FIM));
  if (g) fim = rotaLimparNome(g[0]);
  let meio = [];
  g = rotaCortar(est, /\bpassando\s+(?:por|pelo|pela|pelos|pelas)\s+([^.?!:]+?)(?=[.?!:]|$|\s(?:voltando|retornando|terminando|finalizando|chegando|e volta|ida e volta|com|usando)\b)/);
  if (g) {
    const sub = { t: g[0], n: rotaNorm(g[0]) };
    meio = rotaDividir(sub, explicito).itens;
  }

  // "rota de X até Y"
  let lista = { itens: [], sequencia: false };
  let deAte = false;
  g = rotaCortar(est, new RegExp('\\b(?:rota|trajeto|percurso|itinerario|caminho)\\s+(?:de|do|da)\\s+' + ROTA_NOME + '\\s+(?:ate|para|pra|a|ao)\\s+' + ROTA_NOME + ROTA_PARADA_FIM));
  if (g) {
    lista = { itens: [rotaLimparNome(g[0]), rotaLimparNome(g[1])], sequencia: false };
    deAte = true;
  } else {
    let inicio = -1;
    ROTA_INTROS.forEach(function (re) {
      const m = re.exec(est.n);
      if (m && m.index + m[0].length > inicio) inicio = m.index + m[0].length;
    });
    if (inicio >= 0) lista = rotaDividir({ t: est.t.slice(inicio), n: est.n.slice(inicio) }, explicito);
    if (!lista.itens.length) {
      // "A -> B -> C rota": a palavra vem depois da lista. Vale a frase inteira, se tiver ao menos duas paradas
      const limpo = { t: est.t, n: est.n };
      rotaCortar(limpo, /\b(?:rotas?|trajeto|percurso|itinerario|tracar|trace|tracando)\b/);
      const tentativa = rotaDividir(limpo, explicito);
      if (tentativa.itens.length >= 2) lista = tentativa;
    }
  }

  // monta: saída, o que foi listado (o do meio entra entre a primeira e a última), fim
  let itens = lista.itens.slice();
  if (meio.length && itens.length >= 2) itens = [itens[0]].concat(meio, itens.slice(1));
  else if (meio.length) itens = itens.concat(meio);
  const mesmo = function (a, b) { return rotaNorm(a) === rotaNorm(b); };
  if (origem && !(itens.length && mesmo(itens[0], origem))) itens.unshift(origem);
  if (fim && !(itens.length && mesmo(itens[itens.length - 1], fim))) itens.push(fim);
  let fimFixo = !!fim || deAte || (comoChegar && itens.length >= 2);
  if (fimNome && !(itens.length && mesmo(itens[0], fimNome))) { itens.push(fimNome); fimFixo = true; volta = false; }
  const inicioFixo = !!origem || deAte || (comoChegar && itens.length >= 2);
  if (!itens.length && !explicito && !origemAparelho) return null;
  if (otimizar === 'auto') {
    if (comoChegar || deAte || lista.sequencia || itens.length <= 2) otimizar = 'nao';
    else otimizar = 'sim';
  }
  return {
    explicito: explicito, comoChegar: comoChegar, paradas: itens, inicioFixo: inicioFixo, fimFixo: fimFixo,
    origemAparelho: origemAparelho, volta: volta, otimizar: otimizar, modo: modo, minutosPorParada: minutosPorParada, sequencia: lista.sequencia
  };
}

// ------------------------------------------------------------------ diretório do app

const ROTA_PALAVRAS_VAZIAS = { de: 1, do: 1, da: 1, dos: 1, das: 1, e: 1, o: 1, a: 1, os: 1, as: 1, ao: 1, aos: 1, na: 1, no: 1, nas: 1, nos: 1, em: 1, para: 1, pra: 1, por: 1 };

function rotaPalavras(s) {
  return rotaNorm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(function (w) { return w && !ROTA_PALAVRAS_VAZIAS[w]; });
}

function rotaNumero(v) {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

// Aceita { nome, lat, lng } e também latitude/longitude/lon. Ponto sem coordenada válida continua valendo para o link (por nome), mas sem distância.
export function pontosDeRota(lista) {
  let l = lista;
  if (typeof l === 'function') { try { l = l(); } catch (e) { l = []; } }
  if (!Array.isArray(l)) return [];
  const saida = [];
  l.slice(0, 500).forEach(function (p) {
    if (!p || !p.nome) return;
    const lat = rotaNumero(p.lat != null ? p.lat : p.latitude);
    const lng = rotaNumero(p.lng != null ? p.lng : p.lon != null ? p.lon : p.long != null ? p.long : p.longitude);
    const ok = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
    const nome = String(p.nome).replace(/\s+/g, ' ').trim().slice(0, 120);
    const nomes = [nome].concat(Array.isArray(p.apelidos) ? p.apelidos.slice(0, 6).map(String) : []);
    saida.push({ nome: nome, lat: ok ? lat : null, lng: ok ? lng : null, endereco: String(p.endereco || '').slice(0, 160), nomes: nomes.map(rotaPalavras).filter(function (x) { return x.length; }) });
  });
  return saida;
}

function rotaCombina(q, p) {
  if (q === p) return true;
  if (q.length >= 3 && p.indexOf(q) === 0) return true;
  return p.length >= 3 && q.indexOf(p) === 0 && q.length - p.length <= 2;
}

// Qual ponto do diretório é este texto? { ponto } | { ambiguos: [nomes] } | {}
function rotaAchar(texto, pontos) {
  const q = rotaPalavras(texto);
  if (!q.length) return {};
  let melhor = 0;
  let achados = [];
  pontos.forEach(function (p) {
    let nota = 0;
    p.nomes.forEach(function (pal) {
      if (q.every(function (w) { return pal.some(function (x) { return rotaCombina(w, x); }); })) nota = Math.max(nota, 1 + q.length / pal.length);
    });
    if (!nota) return;
    if (nota > melhor + 1e-9) { melhor = nota; achados = [p]; } else if (Math.abs(nota - melhor) < 1e-9) achados.push(p);
  });
  if (achados.length === 1) return { ponto: achados[0] };
  if (achados.length > 1) return { ambiguos: achados.slice(0, 5).map(function (p) { return p.nome; }) };
  return {};
}

// Cada texto vira { texto, ponto?, ambiguos? }. "CRAS Cauamé e Caranã" (nome com "e") é reunido quando as duas metades sozinhas não existem.
export function resolverParadas(textos, pontos) {
  const saida = [];
  for (let i = 0; i < textos.length; i++) {
    const r = rotaAchar(textos[i], pontos);
    const prox = i + 1 < textos.length ? rotaAchar(textos[i + 1], pontos) : null;
    if (prox && ((!r.ponto && !r.ambiguos) || (!prox.ponto && !prox.ambiguos) || (r.ponto && r.ponto === prox.ponto))) {
      const junto = rotaAchar(textos[i] + ' ' + textos[i + 1], pontos);
      if (junto.ponto) { saida.push({ texto: textos[i] + ' e ' + textos[i + 1], ponto: junto.ponto }); i++; continue; }
    }
    saida.push({ texto: textos[i], ponto: r.ponto || null, ambiguos: r.ambiguos || null });
  }
  return saida;
}

// ------------------------------------------------------------------ planejamento

export function distanciaKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function rotaTrecho(a, b) { return distanciaKm(a, b) * ROTA_FATOR_RUA; }

// Custo de uma ordem (índices em pontos); com volta, soma o retorno ao primeiro.
function rotaCusto(ordem, D, volta) {
  let c = 0;
  for (let i = 1; i < ordem.length; i++) c += D[ordem[i - 1]][ordem[i]];
  if (volta && ordem.length > 1) c += D[ordem[ordem.length - 1]][ordem[0]];
  return c;
}

// Melhor ordem exata por programação dinâmica sobre subconjuntos (até 11 paradas: 2^11 × 11 × 11, instantâneo).
// inicio / fim: índices fixos ou -1. Com volta e inicio, o fim é o próprio início.
function rotaMelhorOrdem(D, n, inicio, fim, volta) {
  const livres = [];
  for (let i = 0; i < n; i++) if (i !== inicio && i !== fim) livres.push(i);
  const m = livres.length;
  const fechar = volta && fim < 0 && inicio >= 0 ? inicio : fim;
  if (m === 0) return [inicio].concat(fim >= 0 ? [fim] : []).filter(function (x) { return x >= 0; });
  const cheio = (1 << m) - 1;
  const dp = [], pai = [];
  for (let s = 0; s <= cheio; s++) { dp.push(new Array(m).fill(Infinity)); pai.push(new Array(m).fill(-1)); }
  for (let j = 0; j < m; j++) dp[1 << j][j] = inicio >= 0 ? D[inicio][livres[j]] : 0;
  for (let s = 1; s <= cheio; s++) {
    for (let j = 0; j < m; j++) {
      const atual = dp[s][j];
      if (!(s & (1 << j)) || atual === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if (s & (1 << k)) continue;
        const nv = atual + D[livres[j]][livres[k]];
        const t = s | (1 << k);
        if (nv < dp[t][k] - 1e-12) { dp[t][k] = nv; pai[t][k] = j; }
      }
    }
  }
  let melhor = Infinity, ult = 0;
  for (let j = 0; j < m; j++) {
    const c = dp[cheio][j] + (fechar >= 0 ? D[livres[j]][fechar] : 0);
    if (c < melhor - 1e-12) { melhor = c; ult = j; }
  }
  const seq = [];
  let s = cheio, j = ult;
  while (j >= 0) { seq.unshift(livres[j]); const p = pai[s][j]; s &= ~(1 << j); j = p; }
  const ordem = (inicio >= 0 ? [inicio] : []).concat(seq);
  if (fim >= 0) ordem.push(fim);
  return ordem;
}

function rotaLinkMapa(pts, volta, modo, cidade, semOrigem) {
  const coord = function (p) { return p.lat != null ? p.lat.toFixed(6) + ',' + p.lng.toFixed(6) : p.nome + (p.endereco ? ', ' + p.endereco : cidade ? ', ' + cidade : ''); };
  const seq = pts.slice();
  if (volta && seq.length > 1) seq.push(seq[0]);
  if (!seq.length) return '';
  const destino = seq[seq.length - 1];
  const meio = seq.slice(semOrigem ? 0 : 1, -1);
  let url = 'https://www.google.com/maps/dir/?api=1';
  if (!semOrigem && seq.length > 1) url += '&origin=' + encodeURIComponent(coord(seq[0]));
  url += '&destination=' + encodeURIComponent(coord(destino));
  if (meio.length) url += '&waypoints=' + meio.map(function (p) { return encodeURIComponent(coord(p)); }).join('%7C');
  return url + '&travelmode=' + (ROTA_MODO_MAPA[modo] || 'driving');
}

// pontos: [{ nome, lat, lng }] na ordem em que a pessoa escreveu. opcoes: { otimizar, volta, inicioFixo, fimFixo, modo, minutosPorParada, cidade, semOrigemNoLink }
export function planejarRota(pontos, opcoes) {
  const o = opcoes || {};
  const modo = ROTA_VELOCIDADE[o.modo] ? o.modo : 'carro';
  const n = Math.min(pontos.length, ROTA_MAX_PARADAS);
  const pts = pontos.slice(0, n);
  const D = pts.map(function (a) { return pts.map(function (b) { return rotaTrecho(a, b); }); });
  const fimFixo = !!o.fimFixo && n >= 2;
  const volta = !!o.volta && !fimFixo;
  const fim = fimFixo ? n - 1 : -1;
  const original = pts.map(function (_, i) { return i; });
  const kmOriginal = rotaCusto(original, D, volta);
  let ordem = original;
  if (o.otimizar && n > 2) ordem = rotaMelhorOrdem(D, n, o.inicioFixo || volta ? 0 : -1, fim, volta);
  const trechos = [];
  for (let i = 1; i < ordem.length; i++) {
    const km = D[ordem[i - 1]][ordem[i]];
    trechos.push({ de: pts[ordem[i - 1]].nome, para: pts[ordem[i]].nome, km: km, min: km / ROTA_VELOCIDADE[modo] * 60 });
  }
  if (volta && ordem.length > 1) {
    const km = D[ordem[ordem.length - 1]][ordem[0]];
    trechos.push({ de: pts[ordem[ordem.length - 1]].nome, para: pts[ordem[0]].nome, km: km, min: km / ROTA_VELOCIDADE[modo] * 60, volta: true });
  }
  const km = trechos.reduce(function (s, t) { return s + t.km; }, 0);
  const minutosViagem = trechos.reduce(function (s, t) { return s + t.min; }, 0);
  const minutosParadas = (o.minutosPorParada || 0) * pts.length;
  const ordenados = ordem.map(function (i) { return pts[i]; });
  const reordenou = ordem.some(function (v, i) { return v !== i; });
  return {
    ordem: ordenados, trechos: trechos, km: km, minutos: minutosViagem, minutosParadas: minutosParadas, modo: modo, volta: volta,
    kmOriginal: kmOriginal, economiaKm: reordenou ? Math.max(0, kmOriginal - km) : 0, reordenou: reordenou, minutosPorParada: o.minutosPorParada || 0,
    links: [{ rotulo: 'Abrir a rota no app de mapas', url: rotaLinkMapa(ordenados, volta, modo, o.cidade, !!o.semOrigemNoLink) }],
    geojson: {
      type: 'FeatureCollection',
      features: ordenados.map(function (p, i) { return { type: 'Feature', properties: { ordem: i + 1, nome: p.nome }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }; })
        .concat([{ type: 'Feature', properties: { km: Number(km.toFixed(2)), estimativa: true }, geometry: { type: 'LineString', coordinates: ordenados.concat(volta && ordenados.length > 1 ? [ordenados[0]] : []).map(function (p) { return [p.lng, p.lat]; }) } }])
    }
  };
}

// ------------------------------------------------------------------ texto e esquema

export function textoDaRota(r) {
  const n = r.ordem.length;
  const nomeModo = ROTA_NOME_MODO[r.modo];
  const cab = (r.reordenou ? 'Ordem sugerida' : 'Rota na ordem pedida') + ' (' + nomeModo + ', ' + n + (n === 1 ? ' parada' : ' paradas') + (r.volta ? ', voltando ao início' : '') + '):';
  const linhas = [cab];
  r.ordem.forEach(function (p, i) {
    if (i === 0) { linhas.push('1. ' + p.nome + ' (saída)'); return; }
    const t = r.trechos[i - 1];
    linhas.push((i + 1) + '. ' + p.nome + ' — ' + rotaKm(t.km) + ' · ~' + rotaTempo(t.min));
  });
  if (r.volta && r.trechos.length) {
    const t = r.trechos[r.trechos.length - 1];
    linhas.push('Volta para ' + t.para + ' — ' + rotaKm(t.km) + ' · ~' + rotaTempo(t.min));
  }
  let total = 'Total: ' + rotaKm(r.km) + ', cerca de ' + rotaTempo(r.minutos) + ' de deslocamento';
  if (r.minutosParadas) total += ' (+ ' + rotaTempo(r.minutosParadas) + ' nas paradas, ' + rotaTempo(r.minutos + r.minutosParadas) + ' no dia)';
  linhas.push(total + '.');
  if (r.reordenou && r.economiaKm >= 0.05) linhas.push('Na ordem em que você escreveu seriam ' + rotaKm(r.kmOriginal) + '; esta economiza cerca de ' + rotaKm(r.economiaKm) + '. Se preferir a sua ordem, peça "nessa ordem".');
  linhas.push('É estimativa: linha reta × ' + String(ROTA_FATOR_RUA).replace('.', ',') + ' (ruas) a ' + String(ROTA_VELOCIDADE[r.modo]).replace('.', ',') + ' km/h, sem trânsito, mão de rua nem horário das unidades. Confira no app de mapas e ligue antes para quem fecha cedo.');
  return linhas.join('\n');
}

// Esquema em linha reta, SEM mapa de fundo (nada é baixado). Nomes escapados: o texto vem do diretório do app.
export function svgDaRota(r) {
  const W = 360, H = 260, PAD = 34;
  const pts = r.ordem;
  if (!pts.length) return '';
  const lat0 = pts.reduce(function (s, p) { return s + p.lat; }, 0) / pts.length;
  const kx = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(function (p) { return p.lng * kx; }), ys = pts.map(function (p) { return -p.lat; });
  const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  const esc = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1e-9), (H - 2 * PAD) / Math.max(maxY - minY, 1e-9));
  const ox = (W - (maxX - minX) * esc) / 2, oy = (H - (maxY - minY) * esc) / 2;
  const pos = pts.map(function (_, i) { return [ox + (xs[i] - minX) * esc, oy + (ys[i] - minY) * esc]; });
  const caminho = pos.concat(r.volta && pos.length > 1 ? [pos[0]] : []);
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Esquema da rota em linha reta, sem mapa de fundo" style="max-width:100%;height:auto;color:inherit">';
  s += '<polyline points="' + caminho.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" opacity="0.6"/>';
  pts.forEach(function (p, i) {
    const x = pos[i][0], y = pos[i][1];
    const nome = p.nome.length > 22 ? p.nome.slice(0, 21) + '…' : p.nome;
    const ancora = x > W / 2 ? 'end' : 'start';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9" fill="currentColor" opacity="0.15" stroke="currentColor"/>';
    s += '<text x="' + x.toFixed(1) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">' + (i + 1) + '</text>';
    s += '<text x="' + (x + (ancora === 'end' ? -13 : 13)).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + ancora + '" font-size="10" fill="currentColor">' + rotaEscapar(nome) + '</text>';
  });
  return s + '</svg>';
}

// ------------------------------------------------------------------ resposta pronta

const ROTA_EXEMPLO = 'Por exemplo: "traçar rota saindo do CRAS X: UBS Y, CAPS II e Conselho Tutelar, voltando ao CRAS X, de moto, 30 minutos em cada".';

function rotaResposta(texto, extra) {
  return Object.assign({ texto: texto, links: [], svg: '', geojson: null, paradas: [], km: 0, minutos: 0 }, extra || {});
}

export function respostaDeRota(texto, opcoes) {
  const o = opcoes || {};
  const ped = lerPedidoDeRota(texto);
  if (!ped) return null;
  const pontos = pontosDeRota(o.pontos);
  const aparelho = o.aparelho && rotaNumero(o.aparelho.lat) === rotaNumero(o.aparelho.lat) && isFinite(rotaNumero(o.aparelho.lat)) && isFinite(rotaNumero(o.aparelho.lng))
    ? { nome: 'Sua posição', lat: rotaNumero(o.aparelho.lat), lng: rotaNumero(o.aparelho.lng) } : null;

  // endereço de residência: não trato (a regra do Paulus é proteger as famílias, e a conversa pode ser guardada pelo app)
  if (ped.paradas.some(function (p) { return ROTA_ENDERECO.test(p); })) {
    return rotaResposta('Não traço rota até endereço de residência: para proteger as famílias, só trabalho com unidades, serviços e bairros. Diga o nome da unidade ou do bairro. Para a casa de uma família, use o app de mapas direto, no aparelho.', { bloqueio: true });
  }
  if (!ped.paradas.length && !ped.origemAparelho) {
    return rotaResposta('Diga de onde sai e quais paradas quer. ' + ROTA_EXEMPLO + (pontos.length ? '' : ' (Este app ainda não me passou o diretório de unidades, então só consigo montar o link do mapa pelos nomes, sem km nem tempo.)'));
  }
  if (ped.paradas.length > ROTA_MAX_PARADAS) {
    return rotaResposta('Consigo ordenar até ' + ROTA_MAX_PARADAS + ' paradas por rota. Divida em duas saídas (por território ou por turno) e peça de novo.');
  }

  const res = resolverParadas(ped.paradas, pontos);
  // Fora do pedido explícito, só responde quem reconhece ao menos uma unidade do diretório e tem duas paradas ("rota de fuga" vai para a IA).
  const achadas = res.filter(function (r) { return r.ponto; }).length;
  if (!ped.explicito && !(achadas >= 1 && res.length + (ped.origemAparelho ? 1 : 0) >= 2)) return null;

  const duvida = res.filter(function (r) { return r.ambiguos; });
  if (duvida.length) {
    return rotaResposta('Mais de uma unidade combina com "' + duvida[0].texto + '": ' + duvida[0].ambiguos.join('; ') + '. Escreva o nome completo da que você quer.', { ambiguo: true });
  }
  const modo = ped.modo || 'carro';
  const cidade = o.cidade ? String(o.cidade) : '';
  const semCoord = res.filter(function (r) { return !r.ponto || r.ponto.lat == null; });
  let paradas = res.map(function (r) { return r.ponto ? { nome: r.ponto.nome, lat: r.ponto.lat, lng: r.ponto.lng, endereco: r.ponto.endereco } : { nome: r.texto, lat: null, lng: null, endereco: '' }; });
  let semOrigem = false;
  if (ped.origemAparelho) {
    if (aparelho) paradas.unshift(aparelho);
    else semOrigem = true;
  }
  const inicioFixo = ped.inicioFixo || (ped.origemAparelho && !!aparelho);

  // Alguma parada sem coordenada: só o link por nome, na ordem escrita, e digo isso.
  if (semCoord.length || !paradas.length) {
    const naoAchadas = res.filter(function (r) { return !r.ponto; }).map(function (r) { return r.texto; });
    const url = rotaLinkMapa(paradas, ped.volta, modo, cidade, semOrigem);
    const msg = (!pontos.length ? 'Este app não me passou o diretório de unidades com coordenadas. ' : naoAchadas.length ? 'Não encontrei no diretório deste app: ' + naoAchadas.join('; ') + '. ' : 'Faltam as coordenadas de: ' + semCoord.map(function (r) { return r.texto; }).join('; ') + '. ') +
      'Sem as coordenadas não calculo km, tempo nem a melhor ordem. Deixei o link do mapa pelos nomes, na ordem que você escreveu' + (cidade ? ' (busca em ' + cidade + ')' : '') + '; confira se o mapa achou o lugar certo.';
    return rotaResposta(msg, { links: url ? [{ rotulo: 'Abrir no app de mapas (por nome)', url: url }] : [], paradas: paradas.map(function (p) { return p.nome; }), semCoordenadas: semCoord.map(function (r) { return r.texto; }), aproximada: true });
  }

  // "como chegar ao X" sem saída: só o destino, o mapa parte da posição de quem pergunta
  if (paradas.length === 1) {
    const p = paradas[0];
    return rotaResposta('Abro o trajeto até ' + p.nome + ' a partir da sua posição atual. Não sei onde você está, então não estimo km nem tempo; o app de mapas mostra.', {
      links: [{ rotulo: 'Abrir a rota no app de mapas', url: rotaLinkMapa([p], false, modo, cidade, true) }], paradas: [p.nome]
    });
  }

  const r = planejarRota(paradas, { otimizar: ped.otimizar === 'sim', volta: ped.volta, inicioFixo: inicioFixo, fimFixo: ped.fimFixo, modo: modo, minutosPorParada: ped.minutosPorParada, cidade: cidade, semOrigemNoLink: semOrigem });
  let corpo = textoDaRota(r);
  if (semOrigem) corpo = 'Saída: a sua posição atual (o app de mapas usa o GPS). Os km abaixo contam só entre as paradas.\n' + corpo;
  return rotaResposta(corpo, { links: r.links, svg: svgDaRota(r), geojson: r.geojson, paradas: r.ordem.map(function (p) { return p.nome; }), km: Number(r.km.toFixed(2)), minutos: Math.round(r.minutos + r.minutosParadas), estimativa: true });
}
