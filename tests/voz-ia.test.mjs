import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_MAX_BYTES,
  MINIMAX_TTS_MODELO,
  WHISPER_MODELO,
  estadoVozIA,
  tratarVozIA,
  urlAudioSegura,
  validarPedidoTTS
} from '../worker/voz-ia.mjs';

const CORS = { 'Access-Control-Allow-Origin': 'https://app.example' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
});
const request = (body, contentType = 'audio/webm', extra = {}) => new Request('https://worker.example/voz-ia', {
  method: 'POST',
  headers: { 'Content-Type': contentType, ...extra },
  body
});
const reply = (req, env = {}) => tratarVozIA(req, env, json, CORS);

test('transcrição desativada por omissão e não invoca Workers AI', async () => {
  let chamadas = 0;
  const env = { AI: { async run() { chamadas++; return { text: 'oi' }; } } };
  assert.deepEqual(estadoVozIA(env), {
    transcricao: false,
    ttsExterna: false,
    ttsMotivo: 'Síntese remota permanece desativada até haver contrato documentado e testado para a saída de áudio do modelo.'
  });
  const r = await reply(request(new Uint8Array([1, 2, 3])), env);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).transcricao, false);
  assert.equal(chamadas, 0);
});

test('transcreve bytes de áudio com o modelo Whisper, devolve JSON e preserva CORS', async () => {
  let chamada;
  const audio = new Uint8Array([0, 1, 2, 255]);
  const env = {
    TRANSCRICAO_IA: 'ligado',
    AI: { async run(...args) { chamada = args; return { text: '  Olá, Paulus!  ' }; } }
  };
  const r = await reply(request(audio, 'audio/webm; codecs=opus'), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://app.example');
  assert.deepEqual(await r.json(), { texto: 'Olá, Paulus!', modelo: WHISPER_MODELO });
  assert.equal(chamada[0], '@cf/openai/whisper');
  assert.ok(chamada[1] instanceof Uint8Array);
  assert.deepEqual(Array.from(chamada[1]), Array.from(audio));
  assert.ok(chamada[2].signal instanceof AbortSignal);
});

test('recusa MIME não permitido, áudio vazio e binding ausente sem chamada à IA', async () => {
  let chamadas = 0;
  const env = { TRANSCRICAO_IA: 'ligado', AI: { async run() { chamadas++; return { text: 'x' }; } } };
  assert.equal((await reply(request('x', 'application/octet-stream'), env)).status, 415);
  assert.equal((await reply(request(new Uint8Array(0)), env)).status, 400);
  assert.equal((await reply(request(new Uint8Array([1]), 'audio/wav'), { TRANSCRICAO_IA: 'ligado' })).status, 503);
  assert.equal(chamadas, 0);
});

test('limita o tamanho declarado e real do áudio', async () => {
  const env = { TRANSCRICAO_IA: 'ligado', AI: { async run() { throw new Error('não deve chamar'); } } };
  const declared = request(new Uint8Array([1]), 'audio/wav', { 'Content-Length': String(AUDIO_MAX_BYTES + 1) });
  assert.equal((await reply(declared, env)).status, 413);
  const oversized = request(new Uint8Array(AUDIO_MAX_BYTES + 1), 'audio/wav');
  const r = await reply(oversized, env);
  assert.equal(r.status, 413);
  assert.match((await r.json()).erro, /grande demais/);
});

test('JSON TTS está desativado por omissão e nunca chama o provedor', async () => {
  let chamadas = 0;
  const env = { AI: { async run() { chamadas++; } } };
  const r = await reply(request(JSON.stringify({ acao: 'tts', texto: 'Olá', voice_id: 'voz' }), 'application/json'), env);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).ttsExterna, false);
  assert.equal(chamadas, 0);
});

test('valida allowlist de voz, limites de texto, valores e efeitos para a interface TTS', () => {
  const env = { TTS_VOICE_IDS: 'pt-br-1,pt-br-2', TTS_EFFECTS: 'warm,bright' };
  const valido = validarPedidoTTS({
    acao: 'tts', texto: 'Olá', voice_id: 'pt-br-1', speed: 1.1, volume: 2, pitch: -2,
    emotion: 'neutral', effect: 'warm'
  }, env);
  assert.deepEqual(valido, {
    ok: true,
    pedido: { texto: 'Olá', voice_id: 'pt-br-1', speed: 1.1, volume: 2, pitch: -2, emotion: 'neutral', effect: 'warm' }
  });
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'outro' }, env).erro, /voice_id/);
  assert.match(validarPedidoTTS({ texto: 'x'.repeat(1501), voice_id: 'pt-br-1' }, env).erro, /1500/);
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'pt-br-1', speed: 999 }, env).erro, /speed/);
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'pt-br-1', emotion: 'exploit' }, env).erro, /Efeito/);
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'pt-br-1', effect: 'remote' }, env).erro, /Efeito/);
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'pt-br-1', extra: 'campo' }, env).erro, /Campo/);
  assert.match(validarPedidoTTS({ texto: 'oi', voice_id: 'pt-br-1', volume: NaN }, env).erro, /volume/);
});

test('TTS validado mantém retorno desativado até confirmar formato do modelo e não faz chamada', async () => {
  let chamadas = 0;
  const env = { TTS_EXTERNA: 'ligado', TTS_VOICE_IDS: 'voz-pt', AI: { async run() { chamadas++; } } };
  const corpo = { acao: 'tts', texto: 'Olá', voice_id: 'voz-pt' };
  const r = await reply(request(JSON.stringify(corpo), 'application/json'), env);
  assert.equal(r.status, 503);
  const j = await r.json();
  assert.equal(j.ttsExterna, false);
  assert.equal(j.modelo, MINIMAX_TTS_MODELO);
  assert.equal(chamadas, 0);
});

test('TTS malformado e JSON excedendo o teto são recusados', async () => {
  const env = { TTS_EXTERNA: 'ligado', TTS_VOICE_IDS: 'voz-pt' };
  assert.equal((await reply(request('{ruim', 'application/json'), env)).status, 400);
  const corpo = JSON.stringify({ acao: 'tts', texto: 'a'.repeat(9000), voice_id: 'voz-pt' });
  const r = await reply(request(corpo, 'application/json'), env);
  assert.equal(r.status, 413);
});

test('URLs só passam por HTTPS e hostname exato explicitamente autorizado; nada é buscado', () => {
  const env = { TTS_AUDIO_HOSTS: 'audio.provider.example,cdn.provider.example' };
  assert.equal(urlAudioSegura('https://audio.provider.example/file.wav', env), 'https://audio.provider.example/file.wav');
  assert.equal(urlAudioSegura('http://audio.provider.example/file.wav', env), '');
  assert.equal(urlAudioSegura('https://evil.example/file.wav', env), '');
  assert.equal(urlAudioSegura('https://sub.audio.provider.example/file.wav', env), '');
  assert.equal(urlAudioSegura('https://user@audio.provider.example/file.wav', env), '');
  assert.equal(urlAudioSegura('https://127.0.0.1/file.wav', { TTS_AUDIO_HOSTS: '127.0.0.1' }), '');
});

test('timeout da transcrição aborta o binding e responde 504 em JSON', async () => {
  let sinal;
  const timeoutOriginal = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => timeoutOriginal(fn, ms === 45000 ? 0 : ms, ...args);
  try {
    const env = {
      TRANSCRICAO_IA: 'ligado',
      AI: { run(modelo, bytes, opcoes) { sinal = opcoes.signal; return new Promise(() => {}); } }
    };
    const r = await reply(request(new Uint8Array([1]), 'audio/wav'), env);
    assert.equal(r.status, 504);
    assert.match((await r.json()).erro, /tempo limite/);
    assert.equal(sinal.aborted, true);
  } finally {
    globalThis.setTimeout = timeoutOriginal;
  }
});
