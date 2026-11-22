// Voz própria do Paulus (v0.22.0): o Worker repassa o texto a um servidor de voz clonada (voz-servidor/, modelo aberto XTTS-v2)
// e devolve o áudio. Sem VOZ_URL o Worker responde 404 e o console fala com a voz do navegador, como antes.
// O áudio nunca é guardado aqui, e o servidor de voz só aceita o Worker (VOZ_TOKEN).

export const VOZ_MAX_CHARS = 1500;
export const VOZ_MAX_CORPO = 8000;
const VOZ_TEMPO_MS = 90000;

export function vozLigada(env) {
  return !!(env && typeof env.VOZ_URL === 'string' && /^https:\/\//i.test(env.VOZ_URL.trim()));
}

// Tira marcação de Markdown e corta no tamanho que o servidor de voz aceita (no fim de uma frase, se der).
export function textoParaVoz(bruto) {
  let t = String(bruto == null ? '' : bruto).replace(/[*_`#>|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > VOZ_MAX_CHARS) {
    t = t.slice(0, VOZ_MAX_CHARS);
    const fim = Math.max(t.lastIndexOf('. '), t.lastIndexOf('? '), t.lastIndexOf('! '));
    if (fim > VOZ_MAX_CHARS * 0.6) t = t.slice(0, fim + 1);
  }
  return t;
}

// request: já autenticado pelo handler. json(obj, status) e cors vêm do handler. fetchFn existe para os testes.
export async function tratarVoz(request, env, json, cors, fetchFn) {
  if (!vozLigada(env)) return json({ erro: 'Voz própria não está ligada neste Worker.' }, 404);
  if (Number(request.headers.get('Content-Length')) > VOZ_MAX_CORPO) return json({ erro: 'Pedido grande demais.' }, 413);
  const bruto = await request.text();
  if (bruto.length > VOZ_MAX_CORPO) return json({ erro: 'Pedido grande demais.' }, 413);
  let dados;
  try { dados = JSON.parse(bruto); } catch (e) { dados = null; }
  const texto = dados && typeof dados.texto === 'string' ? textoParaVoz(dados.texto) : '';
  if (!texto) return json({ erro: 'Sem texto para falar.' }, 400);
  const url = env.VOZ_URL.trim().replace(/\/+$/, '') + '/sintetizar';
  const cab = { 'Content-Type': 'application/json' };
  if (env.VOZ_TOKEN) cab.Authorization = 'Bearer ' + env.VOZ_TOKEN;
  let r;
  try {
    r = await (fetchFn || fetch)(url, { method: 'POST', headers: cab, body: JSON.stringify({ texto }), signal: AbortSignal.timeout(VOZ_TEMPO_MS) });
  } catch (e) {
    return json({ erro: 'Servidor de voz fora do ar.' }, 503);
  }
  if (!r.ok) return json({ erro: 'Servidor de voz não respondeu.' }, 503);
  const tipo = r.headers.get('Content-Type') || 'audio/wav';
  if (!/^audio\//i.test(tipo)) return json({ erro: 'Resposta inesperada do servidor de voz.' }, 502);
  return new Response(r.body, { status: 200, headers: Object.assign({}, cors, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }) });
}
