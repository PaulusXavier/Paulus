// Serviços opcionais de voz do Paulus, isolados da voz nativa do navegador e de worker/voz.mjs.
// Contrato HTTP: POST com áudio bruto (Content-Type audio/* permitido) para transcrever;
// ou JSON { acao: "tts" | "sintetizar", texto, voice_id, ... } para pedir TTS.
// As chamadas pagas exigem habilitação explícita: TRANSCRICAO_IA=ligado ou TTS_EXTERNA=ligado.
// O retorno atual do modelo MiniMax não é consumido enquanto seu formato não estiver documentado/verificado.

export const WHISPER_MODELO = '@cf/openai/whisper';
export const MINIMAX_TTS_MODELO = 'minimax/speech-02-turbo';
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const JSON_MAX_BYTES = 8 * 1024;
export const TTS_MAX_CHARS = 1500;
export const WHISPER_TEMPO_MS = 45000;
export const TTS_TEMPO_MS = 45000;
export const AUDIO_MIMES = Object.freeze([
  'audio/aac', 'audio/flac', 'audio/mp3', 'audio/mpeg', 'audio/mp4',
  'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'audio/x-wav'
]);
const EMOCOES = new Set(['neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised']);
const OPCOES_TTS = new Set(['acao', 'texto', 'voice_id', 'speed', 'volume', 'pitch', 'emotion', 'effect']);

function flagLigada(valor) {
  return String(valor || '').trim().toLowerCase() === 'ligado';
}
function mimeBase(valor) {
  return String(valor || '').split(';', 1)[0].trim().toLowerCase();
}
function listaConfigurada(valor) {
  return String(valor || '').split(',').map(x => x.trim()).filter(Boolean);
}
function jsonErro(json, erro, status, extra) {
  return json(Object.assign({ erro }, extra || {}), status);
}

async function lerLimitado(request, limite) {
  const tamanhoDeclarado = request.headers.get('Content-Length');
  if (tamanhoDeclarado !== null) {
    const n = Number(tamanhoDeclarado);
    if (!Number.isFinite(n) || n < 0) return { erro: 'Content-Length inválido.', status: 400 };
    if (n > limite) return { erro: 'Pedido grande demais.', status: 413 };
  }
  if (!request.body) return { bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const parte = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += parte.byteLength;
      if (total > limite) {
        try { await reader.cancel('limite de conteúdo excedido'); } catch (e) { /* leitura já encerrada */ }
        return { erro: 'Pedido grande demais.', status: 413 };
      }
      partes.push(parte);
    }
  } catch (e) {
    return { erro: 'Não foi possível ler o conteúdo do pedido.', status: 400 };
  }
  const bytes = new Uint8Array(total);
  let deslocamento = 0;
  for (const parte of partes) {
    bytes.set(parte, deslocamento);
    deslocamento += parte.byteLength;
  }
  return { bytes };
}

function executarComTempo(fn, tempoMs) {
  const controlador = new AbortController();
  let temporizador;
  const limite = new Promise((_, rejeitar) => {
    temporizador = setTimeout(() => {
      controlador.abort();
      const erro = new Error('tempo esgotado');
      erro.name = 'TimeoutError';
      rejeitar(erro);
    }, tempoMs);
  });
  return Promise.race([Promise.resolve().then(() => fn(controlador.signal)), limite])
    .finally(() => clearTimeout(temporizador));
}

function extrairTranscricao(saida) {
  const bruto = typeof saida === 'string' ? saida : (saida && typeof saida.text === 'string' ? saida.text : '');
  const texto = bruto.replace(/\u0000/g, '').trim();
  return texto.slice(0, 12000);
}

function hostsDeAudio(env) {
  return listaConfigurada(env && env.TTS_AUDIO_HOSTS).map(h => h.toLowerCase().replace(/\.$/, ''));
}

/** Valida uma URL devolvida pelo provedor sem a buscar nem a encaminhar como fetch. */
export function urlAudioSegura(valor, env) {
  if (typeof valor !== 'string' || valor.length > 2048) return '';
  let u;
  try { u = new URL(valor); } catch (e) { return ''; }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !host || host === 'localhost' || host.endsWith('.localhost')) return '';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return '';
  if (!hostsDeAudio(env).includes(host)) return '';
  return u.href;
}

/** Valida estritamente os campos opcionais da interface MiniMax; campos desconhecidos nunca são repassados. */
export function validarPedidoTTS(dados, env) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { erro: 'Pedido TTS inválido.' };
  if (Object.keys(dados).some(k => !OPCOES_TTS.has(k))) return { erro: 'Campo TTS não permitido.' };
  if (dados.acao !== undefined && dados.acao !== 'tts' && dados.acao !== 'sintetizar') return { erro: 'Ação de voz não permitida.' };
  if (typeof dados.texto !== 'string' || !dados.texto.trim()) return { erro: 'Informe o texto para sintetizar.' };
  if (dados.texto.length > TTS_MAX_CHARS) return { erro: 'O texto deve ter até 1500 caracteres.' };
  const voiceId = typeof dados.voice_id === 'string' ? dados.voice_id.trim() : '';
  const vozes = listaConfigurada(env && env.TTS_VOICE_IDS);
  if (!voiceId || !/^[a-zA-Z0-9._-]{1,80}$/.test(voiceId) || !vozes.includes(voiceId)) return { erro: 'voice_id não permitido.' };
  const campos = {};
  for (const [nome, minimo, maximo] of [['speed', 0.5, 2], ['volume', 0, 10], ['pitch', -12, 12]]) {
    if (dados[nome] === undefined) continue;
    if (typeof dados[nome] !== 'number' || !Number.isFinite(dados[nome]) || dados[nome] < minimo || dados[nome] > maximo) {
      return { erro: 'Valor inválido para ' + nome + '.' };
    }
    campos[nome] = dados[nome];
  }
  if (dados.emotion !== undefined) {
    if (typeof dados.emotion !== 'string' || !EMOCOES.has(dados.emotion)) return { erro: 'Efeito de voz não permitido.' };
    campos.emotion = dados.emotion;
  }
  if (dados.effect !== undefined) {
    const efeitos = listaConfigurada(env && env.TTS_EFFECTS);
    if (typeof dados.effect !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(dados.effect) || !efeitos.includes(dados.effect)) {
      return { erro: 'Efeito de voz não permitido.' };
    }
    campos.effect = dados.effect;
  }
  return { ok: true, pedido: { texto: dados.texto.trim(), voice_id: voiceId, ...campos } };
}

export function transcricaoIALigada(env) {
  return !!(flagLigada(env && env.TRANSCRICAO_IA) && env && env.AI && typeof env.AI.run === 'function');
}

export function estadoVozIA(env) {
  return {
    transcricao: transcricaoIALigada(env),
    ttsExterna: false,
    ttsMotivo: 'Síntese remota permanece desativada até haver contrato documentado e testado para a saída de áudio do modelo.'
  };
}

async function tratarTranscricao(request, env, json) {
  const tipo = mimeBase(request.headers.get('Content-Type'));
  if (!AUDIO_MIMES.includes(tipo)) return jsonErro(json, 'Tipo de áudio não permitido.', 415, { tiposAceitos: AUDIO_MIMES });
  if (!flagLigada(env && env.TRANSCRICAO_IA)) return jsonErro(json, 'Transcrição por IA está desativada neste Worker.', 404, { transcricao: false });
  if (!env || !env.AI || typeof env.AI.run !== 'function') return jsonErro(json, 'Workers AI não está ligado a este Worker.', 503);
  const lido = await lerLimitado(request, AUDIO_MAX_BYTES);
  if (lido.erro) return jsonErro(json, lido.erro, lido.status);
  if (!lido.bytes.byteLength) return jsonErro(json, 'Envie um arquivo de áudio.', 400);
  try {
    const saida = await executarComTempo(signal => env.AI.run(WHISPER_MODELO, lido.bytes, { signal }), WHISPER_TEMPO_MS);
    const texto = extrairTranscricao(saida);
    if (!texto) return jsonErro(json, 'A transcrição veio vazia.', 502);
    return json({ texto, modelo: WHISPER_MODELO });
  } catch (e) {
    if (e && e.name === 'TimeoutError') return jsonErro(json, 'A transcrição excedeu o tempo limite.', 504);
    return jsonErro(json, 'Não foi possível transcrever o áudio.', 502);
  }
}

async function tratarTTS(request, env, json) {
  const lido = await lerLimitado(request, JSON_MAX_BYTES);
  if (lido.erro) return jsonErro(json, lido.erro, lido.status);
  if (!flagLigada(env && env.TTS_EXTERNA)) return jsonErro(json, 'Síntese remota está desativada neste Worker.', 404, { ttsExterna: false });
  let dados;
  try { dados = JSON.parse(new TextDecoder().decode(lido.bytes)); } catch (e) { return jsonErro(json, 'JSON inválido.', 400); }
  const valido = validarPedidoTTS(dados, env);
  if (!valido.ok) return jsonErro(json, valido.erro, 400);
  // Não chamar o modelo: até haver documentação verificável do objeto devolvido, não sabemos identificar
  // uma URL de áudio sem risco de retornar base64/áudio sob outro campo ou confiar em texto controlado pelo modelo.
  // A função urlAudioSegura permite futura integração somente por URL HTTPS de hostname explicitamente autorizado;
  // nenhuma URL é buscada pelo Worker, evitando SSRF.
  return jsonErro(json, 'Síntese remota indisponível: formato de saída do provedor ainda não validado.', 503, {
    ttsExterna: false,
    modelo: MINIMAX_TTS_MODELO
  });
}

/**
 * Trata uma ação de voz. Recebe o request e os auxiliares JSON/CORS do Worker sem conhecer roteamento ou UI.
 * Áudio bruto em Content-Type áudio executa transcrição; application/json com acao "tts" pede TTS remoto.
 */
export async function tratarVozIA(request, env, json, cors) {
  if (request.method !== 'POST') return jsonErro(json, 'Use POST.', 405);
  const tamanho = request.headers.get('Content-Length');
  if (tamanho !== null) {
    const n = Number(tamanho);
    if (!Number.isFinite(n) || n < 0) return jsonErro(json, 'Content-Length inválido.', 400);
    if (n > AUDIO_MAX_BYTES) return jsonErro(json, 'Pedido grande demais.', 413);
  }
  const tipo = mimeBase(request.headers.get('Content-Type'));
  if (tipo === 'application/json') return tratarTTS(request, env, json);
  return tratarTranscricao(request, env, json);
}
