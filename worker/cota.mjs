// Cota da IA: quanto da franquia diária do Workers AI já foi usado, quando ela acaba (no ritmo de hoje) e quando renova.
//
// O que a Cloudflare oferece: 10.000 neurons por dia de graça, somados entre todos os modelos, renovados às 00:00 UTC.
// Não existe uma rota "quanto me resta". O consumo do dia vem da API de análises (GraphQL), conjunto aiInferenceAdaptiveGroups
// (sum.totalNeurons). Os números podem atrasar alguns minutos em relação ao painel da Cloudflare, que é a fonte oficial.
//
// Segredos do Worker (não vão para o Git; veja wrangler.toml):
//   COTA_CF_CONTA   ID da conta Cloudflare (só o código, sem token)
//   COTA_CF_TOKEN   token de API com UMA permissão: Conta > Análises da conta > Leitura (Account Analytics: Read)
// Opcional (variável comum):
//   COTA_NEURONS    franquia diária em neurons (padrão 10000)
//
// Sem os segredos o painel ainda mostra a hora da renovação (ela é fixa), e diz como ligar a leitura do consumo.
// Esta rota não toca em pergunta, resposta, conversa nem dado de família: só soma de neurons por hora e por modelo.

export const FRANQUIA_PADRAO = 10000;
export const PRECO_POR_MIL_NEURONS = 0.011; // dólar, plano Workers Paid, acima da franquia
const ENDPOINT_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const VALIDADE_CACHE_MS = 60000;            // várias telas abertas não multiplicam consultas à Cloudflare
const TEMPO_LIMITE_MS = 8000;
const HORA = 3600000;
const DIA = 24 * HORA;

// 00:00 UTC do dia de "agora", em milissegundos.
export function inicioDoDiaUTC(agora) {
  return Math.floor(agora / DIA) * DIA;
}

// Próxima renovação: 00:00 UTC do dia seguinte.
export function proximaRenovacao(agora) {
  return inicioDoDiaUTC(agora) + DIA;
}

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function franquiaDoAmbiente(env) {
  const n = Number(env && env.COTA_NEURONS);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : FRANQUIA_PADRAO;
}

export function cotaLigada(env) {
  return !!(env && String(env.COTA_CF_CONTA || '').trim() && String(env.COTA_CF_TOKEN || '').trim());
}

// "Modelo" curto para exibir: @cf/meta/llama-3.3-70b-instruct-fp8-fast -> llama-3.3-70b-instruct-fp8-fast
function nomeCurto(id) {
  const t = String(id || '').split('/').pop();
  return t || 'desconhecido';
}

// Resposta sem a leitura do consumo: só o que é fixo.
export function cotaSemLeitura(agora, franquia, motivo) {
  return {
    ok: true,
    leitura: false,
    motivo: motivo || 'nao-configurado',
    franquia: franquia,
    agora: new Date(agora).toISOString(),
    renova: new Date(proximaRenovacao(agora)).toISOString()
  };
}

// linhas: o que a Cloudflare devolve em aiInferenceAdaptiveGroups:
//   [{ count, dimensions: { datetimeHour, modelId }, sum: { totalNeurons, totalInputTokens, totalOutputTokens } }]
// Devolve o resumo do dia: usados, restam, por hora, por modelo e a projeção de quando a franquia acaba.
export function montarCota(linhas, agora, franquia) {
  const inicio = inicioDoDiaUTC(agora);
  const fim = inicio + DIA;
  const porHora = new Array(24).fill(0);
  const porModelo = new Map();
  let usados = 0, chamadas = 0, entrada = 0, saida = 0;

  (Array.isArray(linhas) ? linhas : []).forEach(function (l) {
    if (!l || typeof l !== 'object') return;
    const s = l.sum || {};
    const n = numero(s.totalNeurons);
    const d = l.dimensions || {};
    const t = Date.parse(d.datetimeHour);
    // Só vale o que cai no dia UTC de hoje; linha com hora ilegível entra no total, mas não no gráfico por hora.
    if (Number.isFinite(t) && (t < inicio || t >= fim)) return;
    usados += n;
    chamadas += numero(l.count);
    entrada += numero(s.totalInputTokens);
    saida += numero(s.totalOutputTokens);
    if (Number.isFinite(t)) porHora[Math.floor((t - inicio) / HORA)] += n;
    const m = nomeCurto(d.modelId);
    const atual = porModelo.get(m) || { modelo: m, neurons: 0, chamadas: 0 };
    atual.neurons += n;
    atual.chamadas += numero(l.count);
    porModelo.set(m, atual);
  });

  usados = Math.round(usados);
  const restam = Math.max(0, franquia - usados);
  const acima = Math.max(0, usados - franquia);
  const modelos = Array.from(porModelo.values())
    .map(function (m) { return { modelo: m.modelo, neurons: Math.round(m.neurons), chamadas: m.chamadas }; })
    .sort(function (a, b) { return b.neurons - a.neurons; })
    .slice(0, 8);

  const r = {
    ok: true,
    leitura: true,
    franquia: franquia,
    usados: usados,
    restam: restam,
    percentual: franquia > 0 ? Math.min(100, Math.round(usados / franquia * 1000) / 10) : 0,
    esgotada: usados >= franquia,
    acima: Math.round(acima),
    chamadas: Math.round(chamadas),
    tokensEntrada: Math.round(entrada),
    tokensSaida: Math.round(saida),
    porHora: porHora.map(function (n) { return Math.round(n); }),
    modelos: modelos,
    agora: new Date(agora).toISOString(),
    inicioDoDia: new Date(inicio).toISOString(),
    renova: new Date(fim).toISOString(),
    esgotaEm: null
  };
  if (acima > 0) r.custoExcedenteUSD = Math.round(acima / 1000 * PRECO_POR_MIL_NEURONS * 100) / 100;
  r.esgotaEm = projetarEsgotamento(porHora, usados, franquia, agora);
  return r;
}

// Quando a franquia acaba SE o ritmo recente continuar. Devolve ISO, ou null quando:
//  - já acabou (esgotada), ou ainda não há consumo para estimar, ou
//  - no ritmo atual ela dura até a renovação.
// Ritmo = média das últimas 3 horas cheias mais a hora corrente (até agora), para não ser enganado por uma rajada de manhã
// nem por uma hora parada. É uma estimativa, e o painel diz isso.
export function projetarEsgotamento(porHora, usados, franquia, agora) {
  if (!(usados > 0) || usados >= franquia) return null;
  const inicio = inicioDoDiaUTC(agora);
  const decorrido = agora - inicio;                       // ms desde 00:00 UTC
  const horaAtual = Math.min(23, Math.floor(decorrido / HORA));
  const janelaHoras = Math.min(3, horaAtual) + (decorrido - horaAtual * HORA) / HORA; // horas cheias + fração da hora corrente
  if (!(janelaHoras > 0.05)) return null;                 // início do dia: pouco dado
  let soma = 0;
  for (let h = Math.max(0, horaAtual - 3); h <= horaAtual; h++) soma += numero(porHora[h]);
  // Se a janela recente não tem consumo, usa a média do dia inteiro.
  let porMs = soma / (janelaHoras * HORA);
  if (!(porMs > 0)) porMs = usados / decorrido;
  if (!(porMs > 0)) return null;
  const faltaMs = (franquia - usados) / porMs;
  const quando = agora + faltaMs;
  if (quando >= proximaRenovacao(agora)) return null;     // dura até renovar
  return new Date(quando).toISOString();
}

export function montarConsulta(agora) {
  const inicio = new Date(inicioDoDiaUTC(agora)).toISOString();
  const fim = new Date(proximaRenovacao(agora)).toISOString();
  return 'query ($conta: String!) { viewer { accounts(filter: { accountTag: $conta }) { ' +
    'aiInferenceAdaptiveGroups(limit: 2000, filter: { datetime_geq: "' + inicio + '", datetime_lt: "' + fim + '" }) { ' +
    'count dimensions { datetimeHour modelId } sum { totalNeurons totalInputTokens totalOutputTokens } } } } }';
}

// Cache por instância do Worker. Chave: dia + conta (a conta não aparece no resultado).
const cache = { chave: '', ate: 0, valor: null };

export function limparCache() { cache.chave = ''; cache.ate = 0; cache.valor = null; }

// Consulta a Cloudflare e devolve o resumo. Nunca devolve token nem ID da conta.
// fetchFn: injetável nos testes. Erro vira { ok:true, leitura:false, motivo } (o painel explica), nunca exceção.
export async function consultarCota(env, opcoes) {
  const o = opcoes || {};
  const agora = typeof o.agora === 'number' ? o.agora : Date.now();
  const doFetch = o.fetch || (typeof fetch === 'function' ? fetch : null);
  const franquia = franquiaDoAmbiente(env);
  if (!cotaLigada(env)) return cotaSemLeitura(agora, franquia, 'nao-configurado');
  if (!doFetch) return cotaSemLeitura(agora, franquia, 'sem-rede');

  const conta = String(env.COTA_CF_CONTA).trim();
  const chave = inicioDoDiaUTC(agora) + ':' + conta + ':' + franquia;
  if (cache.valor && cache.chave === chave && agora < cache.ate) return Object.assign({}, cache.valor, { agora: new Date(agora).toISOString() });

  let resposta;
  const controle = typeof AbortController === 'function' ? new AbortController() : null;
  const temporizador = controle ? setTimeout(function () { controle.abort(); }, TEMPO_LIMITE_MS) : null;
  try {
    resposta = await doFetch(ENDPOINT_GRAPHQL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + String(env.COTA_CF_TOKEN).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: montarConsulta(agora), variables: { conta: conta } }),
      signal: controle ? controle.signal : undefined
    });
  } catch (e) {
    return cotaSemLeitura(agora, franquia, 'sem-resposta');
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }

  if (resposta.status === 401 || resposta.status === 403) return cotaSemLeitura(agora, franquia, 'sem-permissao');
  if (resposta.status === 429) return cotaSemLeitura(agora, franquia, 'muitas-consultas');
  if (!resposta.ok) return cotaSemLeitura(agora, franquia, 'sem-resposta');

  let dados;
  try { dados = await resposta.json(); } catch (e) { return cotaSemLeitura(agora, franquia, 'resposta-invalida'); }

  const erros = dados && Array.isArray(dados.errors) ? dados.errors : [];
  if (erros.length) {
    const texto = erros.map(function (e) { return String((e && e.message) || ''); }).join(' ').toLowerCase();
    // Token sem a permissão certa, ou ID de conta errado: o painel manda conferir os dois.
    if (/authoriz|permission|not allowed|access|denied|zone or account|accountTag/i.test(texto)) return cotaSemLeitura(agora, franquia, 'sem-permissao');
    return cotaSemLeitura(agora, franquia, 'resposta-invalida');
  }

  const contas = dados && dados.data && dados.data.viewer && dados.data.viewer.accounts;
  if (!Array.isArray(contas) || !contas.length) return cotaSemLeitura(agora, franquia, 'sem-permissao');
  const linhas = contas[0] && contas[0].aiInferenceAdaptiveGroups;
  const resumo = montarCota(Array.isArray(linhas) ? linhas : [], agora, franquia);
  cache.chave = chave; cache.ate = agora + VALIDADE_CACHE_MS; cache.valor = resumo;
  return resumo;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cota esgotada: o Workers AI recusa a chamada (erro 4006: "you have used up your daily free allocation of 10,000 neurons").
// Reconhecer isso permite (1) não tentar o modelo reserva, que gasta da MESMA franquia e falha igual; (2) não chamar a IA de novo
// a cada pergunta enquanto durar; (3) responder com um 503 próprio, com a hora da renovação, em vez de um 502 genérico.
// A marca vale só por alguns minutos (e nunca além da renovação das 00:00 UTC): se a pessoa passar para o plano pago ou a cota voltar,
// o Worker volta a tentar sozinho.

const MARCA_MS = 10 * 60 * 1000;
const marca = { ate: 0 };

// A exceção que o Workers AI lançou é de cota? (texto, código 4006 ou campo code)
export function ehErroDeCota(e) {
  if (!e) return false;
  const texto = String((e && e.message) || e || '');
  if (e && (e.code === 4006 || e.code === '4006')) return true;
  return /\b4006\b|daily free allocation|used up your daily|free allocation of|neurons? (limit|quota)|exceeded (your )?(daily )?(neuron|free)/i.test(texto);
}

// Registra que a cota acabou agora; vale por MARCA_MS ou até a renovação, o que vier antes.
export function marcarCotaEsgotada(agora) {
  const t = typeof agora === 'number' ? agora : Date.now();
  marca.ate = Math.min(t + MARCA_MS, proximaRenovacao(t));
}

// Esta instância sabe que a cota está esgotada neste instante?
export function cotaMarcadaEsgotada(agora) {
  const t = typeof agora === 'number' ? agora : Date.now();
  return t < marca.ate;
}

export function limparMarcaEsgotada() { marca.ate = 0; }

// Corpo da resposta 503 enviada ao navegador. "renova" é a hora real da renovação; "tentarEm" é quando vale perguntar de novo (a marca vence antes).
export function corpoCotaEsgotada(agora) {
  const t = typeof agora === 'number' ? agora : Date.now();
  const renova = proximaRenovacao(t);
  const tentar = Math.min(t + MARCA_MS, renova);
  return {
    erro: 'A cota gratuita da IA acabou por hoje. Volto a responder com a IA quando ela renovar; enquanto isso uso a base de normas.',
    cota: true,
    renova: new Date(renova).toISOString(),
    tentarEm: new Date(tentar).toISOString(),
    esperaSeg: Math.max(1, Math.ceil((tentar - t) / 1000))
  };
}
