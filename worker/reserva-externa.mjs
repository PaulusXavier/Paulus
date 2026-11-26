// IA de reserva EXTERNA: entra só DEPOIS que a cota gratuita da Cloudflare (Workers AI) recusa a chamada.
//
// Uso individual, sem fins comerciais (veja USO-INDIVIDUAL.md). Fica DESLIGADA até você definir as três variáveis abaixo.
// Funciona com qualquer provedor de API compatível com a OpenAI (rota /chat/completions): Groq, Google Gemini (endpoint OpenAI-compatível),
// OpenRouter, Together, Mistral e outros. Os nomes de modelo mudam com frequência: confira o atual na documentação do provedor.
//
//   IA_EXTERNA_URL     base da API, https, sem barra no fim (ex.: https://api.groq.com/openai/v1). Se já terminar em /chat/completions, vale como está.
//   IA_EXTERNA_MODELO  nome do modelo no provedor
//   IA_EXTERNA_CHAVE   chave da API (SEGREDO: npx wrangler secret put IA_EXTERNA_CHAVE)
// Opcional:
//   IA_EXTERNA = "desligado"   desliga mesmo com as três definidas
//
// PRIVACIDADE. Os dados que vão ao provedor externo são os mesmos que iriam à Cloudflare (pergunta e conversa já filtradas de dado pessoal,
// trechos públicos de norma, fichas públicas). Mesmo assim há casos que NUNCA saem do Worker para uma terceira empresa:
//   - foto ou PDF escaneado (o texto lido da imagem);
//   - documento anexado;
//   - conversa sobre suicídio ou autolesão (a pergunta atual e as últimas mensagens da pessoa).
// Nesses casos o comportamento é o de antes: 503 de cota, e o app responde com a base de normas.

const TEMPO_LIMITE_MS = 25000;
const MAX_SAIDA = 2000;

function texto(v) { return typeof v === 'string' ? v.trim() : ''; }

export function externaLigada(env) {
  if (!env) return false;
  if (texto(env.IA_EXTERNA).toLowerCase() === 'desligado') return false;
  return !!(configExterna(env));
}

// { url, modelo, chave } ou null. Só https (a chave viaja no cabeçalho).
export function configExterna(env) {
  if (!env) return null;
  const base = texto(env.IA_EXTERNA_URL).replace(/\/+$/, '');
  const modelo = texto(env.IA_EXTERNA_MODELO);
  const chave = texto(env.IA_EXTERNA_CHAVE);
  if (!base || !modelo || !chave) return null;
  if (!/^https:\/\//i.test(base)) return null;
  const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
  return { url: url, modelo: modelo, chave: chave };
}

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

const RE_SENSIVEL = /suicid|ideacao|autolesa|automutila|auto-?agress|me matar|se matar|tirar (?:a )?(?:minha|propria) vida|acabar com (?:a )?(?:minha )?vida|quero morrer|nao quero (?:mais )?viver|pensando em morrer|me cortar|me machucar/;

// A pergunta atual ou as últimas mensagens da PESSOA falam de suicídio ou autolesão? (Respostas anteriores do Paulus não contam.)
export function conversaSensivel(pergunta, historico) {
  if (RE_SENSIVEL.test(semAcento(pergunta))) return true;
  const lista = Array.isArray(historico) ? historico : [];
  const dela = lista.filter(function (h) { return h && h.papel === 'usuario'; }).slice(-4);
  return dela.some(function (h) { return RE_SENSIVEL.test(semAcento(h.texto)); });
}

// Pode este pedido ir ao provedor externo? motivo: por que NÃO (para teste e registro; nada disso vai à pessoa).
export function podeUsarExterna(env, pedido) {
  const p = pedido || {};
  if (!externaLigada(env)) return { ok: false, motivo: 'desligada' };
  if (p.imagem) return { ok: false, motivo: 'imagem' };
  if (p.documento) return { ok: false, motivo: 'documento' };
  if (p.sensivel || conversaSensivel(p.pergunta, p.historico)) return { ok: false, motivo: 'sensivel' };
  return { ok: true, motivo: '' };
}

// Chama o provedor. Devolve no mesmo formato "choices" que o handler já lê, marcado com externa:true.
// Qualquer falha (rede, HTTP, formato, tempo) lança Error: o handler volta ao 503 de cota.
export async function chamarExterna(env, mensagens, ajuste) {
  const cfg = configExterna(env);
  if (!cfg) throw new Error('reserva externa desligada');
  const aj = ajuste || {};
  const corpo = {
    model: cfg.modelo,
    messages: mensagens,
    max_tokens: Math.min(MAX_SAIDA, aj.max_tokens || 900),
    temperature: aj.temperature != null ? aj.temperature : 0.4,
    stream: false
  };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(function () { ctl.abort(); }, TEMPO_LIMITE_MS) : null;
  let resp;
  try {
    resp = await globalThis.fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.chave },
      body: JSON.stringify(corpo),
      signal: ctl ? ctl.signal : undefined
    });
  } finally { if (timer) clearTimeout(timer); }
  if (!resp || !resp.ok) throw new Error('reserva externa: HTTP ' + (resp ? resp.status : 'sem resposta'));
  const j = await resp.json();
  const msg = j && j.choices && j.choices[0] && j.choices[0].message;
  const conteudo = msg && typeof msg.content === 'string' ? msg.content : '';
  // Alguns modelos de raciocínio deixam o pensamento entre <think>...</think>: só a resposta vale.
  const limpo = conteudo.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!limpo) throw new Error('reserva externa: resposta vazia');
  return { response: limpo, externa: true };
}
