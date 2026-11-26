// Pesquisa Web sem chave e leitura limitada de páginas públicas.
// Conteúdo remoto é dado não confiável; nunca o trate como instrução executável.
// PDFs: o Worker não dispõe aqui de extractor robusto sem dependências; devolvemos
// metadados e quantidade de bytes lidos, sem tentar interpretar ou inventar texto.

const URL_DDG = 'https://html.duckduckgo.com/html/';
const MAX_REDIRECTS = 3;
const TEMPO_LIMITE_MS = 10000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_PAGINA_BYTES = 1_500_000;
const MAX_PDF_BYTES = 1_000_000;
const MAX_TEXTO = 24_000;
const MAX_RESULTADOS = 10;

function limitarInteiro(valor, padrao, minimo, maximo) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(minimo, Math.min(maximo, Math.floor(n))) : padrao;
}

function ip4Privado(host) {
  const pedacos = host.split('.');
  if (pedacos.length !== 4 || pedacos.some(p => !/^\d{1,3}$/.test(p))) return null;
  const nums = pedacos.map(Number);
  if (nums.some(n => n > 255)) return null;
  const [a, b, c] = nums;
  const bloqueado = a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 255 && b === 255 && c === 255);
  return bloqueado;
}

function expandirIpv6(host) {
  let s = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (s.includes('%')) return null;
  if (s.includes('.')) {
    const ultimo = s.slice(s.lastIndexOf(':') + 1);
    const nums = ultimo.split('.').map(Number);
    if (nums.length !== 4 || nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hextets = [((nums[0] << 8) | nums[1]).toString(16), ((nums[2] << 8) | nums[3]).toString(16)];
    s = s.slice(0, s.lastIndexOf(':') + 1) + hextets.join(':');
  }
  if (!s.includes(':')) return null;
  const duplo = s.indexOf('::');
  let partes;
  if (duplo >= 0) {
    const esquerda = s.slice(0, duplo) ? s.slice(0, duplo).split(':') : [];
    const direita = s.slice(duplo + 2) ? s.slice(duplo + 2).split(':') : [];
    const faltam = 8 - esquerda.length - direita.length;
    if (faltam < 1) return null;
    partes = esquerda.concat(Array(faltam).fill('0'), direita);
  } else {
    partes = s.split(':');
    if (partes.length !== 8) return null;
  }
  if (partes.length !== 8 || partes.some(p => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return partes.map(p => parseInt(p, 16));
}

function ipv6NaoPublico(host) {
  const h = expandirIpv6(host);
  if (!h) return true;
  const primeira = h[0];
  // Permite apenas unicast global atualmente alocado (2000::/3); exclui ULA,
  // link-local, loopback, multicast, unspecified e faixas especiais/reservadas.
  if ((primeira & 0xe000) !== 0x2000) return true;
  if (primeira === 0x2001 && h[1] === 0x0db8) return true; // documentação
  if (primeira === 0x2002 || (primeira === 0x2001 && h[1] === 0)) return true; // 6to4/Teredo
  // IPv4-mapped IPv6, inclusive representações compatíveis, herdam os bloqueios IPv4.
  const mapped = h.slice(0, 5).every(x => x === 0) && (h[5] === 0xffff || h[5] === 0);
  if (mapped) {
    const v4 = [(h[6] >> 8) & 255, h[6] & 255, (h[7] >> 8) & 255, h[7] & 255].join('.');
    return ip4Privado(v4) === true;
  }
  return false;
}

/** Valida URLs externas públicas: somente HTTPS, sem credenciais ou IP/host local. */
export function validarUrlPublicaHttps(valor, base) {
  let url;
  try { url = base ? new URL(String(valor), base) : new URL(String(valor)); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') ||
      host.endsWith('.test') || host.endsWith('.invalid')) return null;
  // WHATWG URL canoniza formatos IPv4 alternativos (p.ex. 127.1 e inteiro decimal).
  if (/^\[.*\]$/.test(host)) {
    if (ipv6NaoPublico(host)) return null;
  } else if (/^[\d.]+$/.test(host)) {
    if (ip4Privado(host) !== false) return null;
  } else {
    // Host DNS de rótulo único é tipicamente intranet e não é aceito como público.
    if (!host.includes('.')) return null;
  }
  return url;
}

function decodificarEntidades(s) {
  return String(s || '').replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, ent) => {
    const e = ent.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos' || e === '#39') return "'";
    if (e === 'nbsp') return ' ';
    let cp;
    if (e.startsWith('#x')) cp = parseInt(e.slice(2), 16);
    else if (e.startsWith('#')) cp = parseInt(e.slice(1), 10);
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
    try { return String.fromCodePoint(cp); } catch { return '\ufffd'; }
  });
}

function atributo(tag, nome) {
  const re = new RegExp('(?:^|\\s)' + nome + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = String(tag).match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function suprimirElemento(tag, atributos) {
  if (/^(script|style|noscript|template|svg|iframe|object|embed|canvas|form|button|select|textarea|nav|header|footer|aside|menu)$/i.test(tag)) return true;
  if (/\shidden(?:\s|=|\/|>)/i.test(atributos) || /\baria-hidden\s*=\s*["']?true/i.test(atributos)) return true;
  const rotulos = (atributo(atributos, 'class') + ' ' + atributo(atributos, 'id')).toLowerCase();
  return /(?:^|[\s_-])(nav(?:igation)?|menu|sidebar|cookie|consent|banner|breadcrumb|toolbar|social|share|advert(?:isement)?|promo|newsletter)(?:$|[\s_-])/.test(rotulos);
}

const TAGS_BLOCO = /^(address|article|blockquote|br|dd|div|dl|dt|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul)$/i;
const TAGS_VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

/** Extrai texto legível de HTML, removendo scripts, estilos e navegação comum. */
export function extrairTextoHtml(html, opcoes) {
  const opts = opcoes || {};
  const max = limitarInteiro(opts.maxChars, MAX_TEXTO, 1, MAX_TEXTO);
  const origem = String(html || '').slice(0, MAX_PAGINA_BYTES);
  const tokens = origem.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</gi) || [];
  const pilha = [];
  const saida = [];
  const apensar = txt => { if (txt) saida.push(txt); };
  for (const token of tokens) {
    if (token.startsWith('<!--') || /^<!/i.test(token)) continue;
    const fechamento = token.match(/^<\s*\/\s*([\w:-]+)/);
    if (fechamento) {
      const nome = fechamento[1].toLowerCase();
      let idx = -1;
      for (let i = pilha.length - 1; i >= 0; i--) if (pilha[i].tag === nome) { idx = i; break; }
      if (idx >= 0) pilha.splice(idx);
      if (!pilha.some(x => x.suprimir) && TAGS_BLOCO.test(nome)) apensar('\n');
      continue;
    }
    const abertura = token.match(/^<\s*([\w:-]+)([\s\S]*?)>$/);
    if (abertura) {
      const nome = abertura[1].toLowerCase();
      const attrs = abertura[2] || '';
      const suprimir = suprimirElemento(nome, attrs) || pilha.some(x => x.suprimir);
      if (!suprimir && TAGS_BLOCO.test(nome)) apensar('\n');
      if (!TAGS_VOID.test(nome) && !/\/\s*>$/.test(token)) pilha.push({ tag: nome, suprimir });
      continue;
    }
    if (!pilha.some(x => x.suprimir)) apensar(decodificarEntidades(token).replace(/[\t\r\n ]+/g, ' '));
  }
  const texto = saida.join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: texto.slice(0, max), truncated: texto.length > max || origem.length >= MAX_PAGINA_BYTES };
}

function textoDeHtml(html) {
  return decodificarEntidades(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function hrefPublico(href) {
  const limpo = decodificarEntidades(href).trim();
  let alvo;
  try { alvo = new URL(limpo, URL_DDG); } catch { return null; }
  if (/^(?:duckduckgo\.com|html\.duckduckgo\.com)$/i.test(alvo.hostname)) {
    const encaminhado = alvo.searchParams.get('uddg');
    if (encaminhado) { try { alvo = new URL(encaminhado); } catch { return null; } }
  }
  return validarUrlPublicaHttps(alvo.href);
}

/** Interpreta os resultados HTML do DuckDuckGo, tolerando variações no markup. */
export function parseResultadosDuckDuckGo(html, quantidade) {
  const limite = limitarInteiro(quantidade, 5, 1, MAX_RESULTADOS);
  const origem = String(html || '');
  const anchors = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(origem)) && anchors.length < MAX_RESULTADOS * 4) {
    if (!/\bresult__a\b/i.test(atributo(m[1], 'class'))) continue;
    const href = atributo(m[1], 'href');
    const url = hrefPublico(href);
    const title = textoDeHtml(m[2]);
    if (!url || !title) continue;
    anchors.push({ start: m.index, end: re.lastIndex, url: url.href, title });
  }
  const resultados = [];
  for (let i = 0; i < anchors.length && resultados.length < limite; i++) {
    const a = anchors[i];
    const fim = i + 1 < anchors.length ? anchors[i + 1].start : Math.min(origem.length, a.end + 12000);
    const trecho = origem.slice(a.end, fim);
    const tags = /<([a-z]+)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
    let sm;
    let snippet = '';
    while ((sm = tags.exec(trecho))) {
      if (/\bresult__snippet\b/i.test(atributo(sm[2], 'class'))) { snippet = textoDeHtml(sm[3]); break; }
    }
    resultados.push({ title: a.title, url: a.url, snippet });
  }
  return resultados;
}

function fetchInjetado(fetchFn) {
  const fn = fetchFn || globalThis.fetch;
  if (typeof fn !== 'function') throw new Error('fetch indisponível');
  return fn;
}

async function comLimite(fetchFn, url, init, callback, timeoutMs) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (ctl) ctl.abort();
      reject(new Error('tempo limite excedido'));
    }, timeoutMs);
  });
  const operacao = (async () => {
    const resp = await fetchFn(url, { ...init, signal: ctl ? ctl.signal : undefined });
    if (!resp) throw new Error('sem resposta');
    return await callback(resp);
  })();
  try { return await Promise.race([operacao, timeout]); }
  finally { clearTimeout(timer); }
}

async function lerBytes(resp, maxBytes) {
  const cabecalho = Number(resp.headers && resp.headers.get && resp.headers.get('content-length'));
  if (Number.isFinite(cabecalho) && cabecalho > maxBytes) throw new Error('conteúdo excede o limite de bytes');
  if (resp.body && typeof resp.body.getReader === 'function') {
    const reader = resp.body.getReader();
    const blocos = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const bloco = value instanceof Uint8Array ? value : new Uint8Array(value);
        if (total + bloco.byteLength > maxBytes) {
          const restante = maxBytes - total;
          if (restante > 0) blocos.push(bloco.slice(0, restante));
          total = maxBytes;
          try { await reader.cancel(); } catch {}
          return { bytes: concatenar(blocos, total), truncated: true, size: total };
        }
        blocos.push(bloco);
        total += bloco.byteLength;
      }
      return { bytes: concatenar(blocos, total), truncated: false, size: total };
    } finally { try { reader.releaseLock(); } catch {} }
  }
  if (typeof resp.arrayBuffer === 'function') {
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength > maxBytes) return { bytes: buf.slice(0, maxBytes), truncated: true, size: maxBytes };
    return { bytes: buf, truncated: false, size: buf.byteLength };
  }
  if (typeof resp.text === 'function') {
    const txt = await resp.text();
    const buf = new TextEncoder().encode(txt);
    if (buf.byteLength > maxBytes) return { bytes: buf.slice(0, maxBytes), truncated: true, size: maxBytes };
    return { bytes: buf, truncated: false, size: buf.byteLength };
  }
  return { bytes: new Uint8Array(), truncated: false, size: 0 };
}

function concatenar(blocos, tamanho) {
  const saida = new Uint8Array(tamanho);
  let offset = 0;
  for (const b of blocos) { saida.set(b.subarray(0, tamanho - offset), offset); offset += b.byteLength; if (offset >= tamanho) break; }
  return saida;
}

async function requisitarSeguro(urlInicial, opcoes, limiteBytes) {
  const opts = opcoes || {};
  const fetchFn = fetchInjetado(opts.fetchFn);
  const tempo = limitarInteiro(opts.timeoutMs, TEMPO_LIMITE_MS, 50, 30000);
  let atual = validarUrlPublicaHttps(urlInicial);
  if (!atual) throw new Error('URL pública HTTPS inválida');
  for (let saltos = 0; saltos <= MAX_REDIRECTS; saltos++) {
    const resposta = await comLimite(fetchFn, atual.href, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.1' }
    }, async resp => {
      const status = Number(resp.status || 0);
      if ([301, 302, 303, 307, 308].includes(status)) {
        const loc = resp.headers && resp.headers.get && resp.headers.get('location');
        if (!loc) throw new Error('redirecionamento sem destino');
        return { redirect: loc, status };
      }
      if (!resp.ok) throw new Error('HTTP ' + status);
      const headerType = resp.headers && resp.headers.get && resp.headers.get('content-type') || '';
      const max = limiteBytes || (/application\/pdf/i.test(headerType) || /\.pdf(?:$|[?#])/i.test(atual.href) ? MAX_PDF_BYTES : MAX_PAGINA_BYTES);
      const body = await lerBytes(resp, max);
      return { status, headerType, body, url: atual.href };
    }, tempo);
    if (resposta.redirect) {
      if (saltos >= MAX_REDIRECTS) throw new Error('limite de redirecionamentos excedido');
      const destino = validarUrlPublicaHttps(resposta.redirect, atual.href);
      if (!destino) throw new Error('redirecionamento para URL não pública');
      atual = destino;
      continue;
    }
    return resposta;
  }
  throw new Error('limite de redirecionamentos excedido');
}

/** Pesquisa no DuckDuckGo HTML sem chave e retorna título, URL HTTPS e trecho. */
export async function buscarWeb(pergunta, opcoes) {
  const consulta = String(pergunta || '').trim().slice(0, 500);
  if (!consulta) throw new Error('consulta vazia');
  const opts = opcoes || {};
  const quantidade = limitarInteiro(opts.limit, 5, 1, MAX_RESULTADOS);
  const url = new URL(URL_DDG);
  url.searchParams.set('q', consulta);
  const fetchFn = fetchInjetado(opts.fetchFn);
  const tempo = limitarInteiro(opts.timeoutMs, TEMPO_LIMITE_MS, 50, 30000);
  const html = await comLimite(fetchFn, url.href, {
    method: 'GET', redirect: 'manual', headers: { Accept: 'text/html' }
  }, async resp => {
    if (!resp.ok) throw new Error('DuckDuckGo HTTP ' + Number(resp.status || 0));
    const tipo = resp.headers && resp.headers.get && resp.headers.get('content-type') || '';
    if (tipo && !/text\/html|application\/xhtml\+xml/i.test(tipo)) throw new Error('resposta de busca não é HTML');
    const body = await lerBytes(resp, MAX_HTML_BYTES);
    if (body.truncated) throw new Error('resultados de busca excedem o limite de bytes');
    return new TextDecoder().decode(body.bytes);
  }, tempo);
  return parseResultadosDuckDuckGo(html, quantidade);
}

/** Lê página pública HTTPS, seguindo redirects manualmente e revalidando cada destino. */
export async function lerPaginaWeb(url, opcoes) {
  const resposta = await requisitarSeguro(url, opcoes);
  const tipo = (resposta.headerType.split(';')[0] || '').trim().toLowerCase();
  const bytes = resposta.body;
  const parecePdf = tipo === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(resposta.url) ||
    (bytes.size >= 5 && new TextDecoder().decode(bytes.bytes.slice(0, 5)) === '%PDF-');
  if (parecePdf) {
    return {
      url: resposta.url,
      contentType: tipo || 'application/pdf',
      kind: 'pdf',
      status: 'pdf_text_extraction_unavailable',
      bytes: bytes.size,
      truncated: bytes.truncated,
      text: ''
    };
  }
  if (tipo && !/^(text\/html|application\/xhtml\+xml)(?:$|;)/i.test(resposta.headerType)) {
    throw new Error('tipo de conteúdo não suportado');
  }
  const html = new TextDecoder('utf-8').decode(bytes.bytes);
  const extraido = extrairTextoHtml(html, opcoes);
  return {
    url: resposta.url,
    contentType: tipo || 'text/html',
    kind: 'html',
    status: 'ok',
    text: extraido.text,
    truncated: bytes.truncated || extraido.truncated,
    bytes: bytes.size
  };
}

/** Baixa PDF público com redirects revalidados e limite estrito de 1 MB. */
export async function baixarPdfPublico(url, opcoes) {
  const resposta = await requisitarSeguro(url, opcoes, MAX_PDF_BYTES);
  const mime = (resposta.headerType.split(';')[0] || '').trim().toLowerCase();
  const bytes = resposta.body;
  if (bytes.truncated) throw new Error('PDF truncado por exceder o limite de bytes');
  if (bytes.size < 5) throw new Error('PDF contém bytes insuficientes');
  if (mime && mime !== 'application/pdf') throw new Error('tipo de conteúdo incompatível com PDF');
  const assinatura = bytes.bytes[0] === 0x25 && bytes.bytes[1] === 0x50 && bytes.bytes[2] === 0x44 &&
    bytes.bytes[3] === 0x46 && bytes.bytes[4] === 0x2d;
  if (mime !== 'application/pdf' && !assinatura) throw new Error('resposta não é um PDF válido');
  return { url: resposta.url, contentType: 'application/pdf', bytes: bytes.bytes };
}
