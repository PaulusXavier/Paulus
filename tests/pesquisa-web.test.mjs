import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarWeb,
  baixarPdfPublico,
  extrairTextoHtml,
  lerPaginaWeb,
  parseResultadosDuckDuckGo,
  validarUrlPublicaHttps
} from '../worker/pesquisa-web.mjs';

function resposta(status, body = '', headers = {}) {
  return new Response(body, { status, headers });
}

const htmlResultados = `<!doctype html><div class="results">
  <div class="result results_links">
    <a class="result__a" href="https://example.org/artigo?a=1&amp;b=2"><b>Artigo &amp; pesquisa</b></a>
    <a class="result__snippet">Resumo &lt;seguro&gt; da página.</a>
  </div>
  <div class='result results_links'><a href="/l/?uddg=https%3A%2F%2Fdocs.example.com%2Fguia" class="result__a">Guia</a>
    <div class="result__snippet">Segundo trecho</div></div>
</div>`;

test('parser DuckDuckGo tolera classes/aspas e decodifica entidades e redirects do buscador', () => {
  const itens = parseResultadosDuckDuckGo(htmlResultados, 5);
  assert.equal(itens.length, 2);
  assert.deepEqual(itens[0], {
    title: 'Artigo & pesquisa',
    url: 'https://example.org/artigo?a=1&b=2',
    snippet: 'Resumo <seguro> da página.'
  });
  assert.equal(itens[1].url, 'https://docs.example.com/guia');
  assert.equal(itens[1].snippet, 'Segundo trecho');
});

test('busca sem chave chama DuckDuckGo com a consulta e respeita limite de resultados', async () => {
  let chamada;
  const resultado = await buscarWeb('política pública', {
    limit: 1,
    fetchFn: async (url, init) => {
      chamada = { url: new URL(url), init };
      return resposta(200, htmlResultados, { 'content-type': 'text/html; charset=utf-8' });
    }
  });
  assert.equal(chamada.url.hostname, 'html.duckduckgo.com');
  assert.equal(chamada.url.searchParams.get('q'), 'política pública');
  assert.equal(chamada.init.redirect, 'manual');
  assert.equal(resultado.length, 1);
});

test('validação URL aceita HTTPS público e rejeita esquemas, credenciais, localhost e IPs privados/reservados', () => {
  assert.equal(validarUrlPublicaHttps('https://www.example.com/path').hostname, 'www.example.com');
  for (const url of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://localhost/',
    'https://app.localhost/',
    'https://intranet/',
    'https://127.0.0.1/',
    'https://127.1/',
    'https://2130706433/',
    'https://10.1.2.3/',
    'https://172.16.0.1/',
    'https://192.168.1.1/',
    'https://169.254.169.254/latest/',
    'https://[::1]/',
    'https://[fd00::1]/',
    'https://[fe80::1]/',
    'https://[2001:db8::1]/'
  ]) assert.equal(validarUrlPublicaHttps(url), null, url);
});

test('leitura HTML remove scripts, estilos, navegação e menus; conserva texto e marca truncamento', async () => {
  const pagina = '<html><head><style>.x{}</style><script>IGNORE_SCRIPT</script></head>' +
    '<body><nav>MENU_SUPRIMIDO</nav><div class="cookie-banner">COOKIE_SUPRIMIDO</div>' +
    '<main><h1>Título &amp; texto</h1><p>Conteúdo público.</p></main></body></html>';
  const r = await lerPaginaWeb('https://public.example/page', {
    fetchFn: async () => resposta(200, pagina, { 'content-type': 'text/html; charset=utf-8' })
  });
  assert.equal(r.kind, 'html');
  assert.match(r.text, /Título & texto/);
  assert.match(r.text, /Conteúdo público\./);
  assert.doesNotMatch(r.text, /IGNORE_SCRIPT|MENU_SUPRIMIDO|COOKIE_SUPRIMIDO|\.x/);
  assert.equal(r.status, 'ok');

  const extraido = extrairTextoHtml('<p>abcdef</p>', { maxChars: 4 });
  assert.equal(extraido.text, 'abcd');
  assert.equal(extraido.truncated, true);
});

test('bloqueia redirect para host privado e redirect inseguro nunca vira chamada subsequente', async () => {
  const chamadas = [];
  await assert.rejects(() => lerPaginaWeb('https://public.example/start', {
    fetchFn: async url => {
      chamadas.push(String(url));
      return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } });
    }
  }), /redirecionamento para URL não pública/);
  assert.equal(chamadas.length, 1);
});

test('segue no máximo três redirects e revalida destinos HTTPS públicos', async () => {
  const chamadas = [];
  const fetchFn = async url => {
    chamadas.push(String(url));
    const n = chamadas.length;
    if (n <= 3) return new Response(null, { status: 302, headers: { location: `/p${n + 1}` } });
    return resposta(200, '<p>fim</p>', { 'content-type': 'text/html' });
  };
  const final = await lerPaginaWeb('https://public.example/p1', { fetchFn });
  assert.equal(final.text, 'fim');
  assert.equal(chamadas.length, 4);
  await assert.rejects(() => lerPaginaWeb('https://public.example/p1', {
    fetchFn: async () => new Response(null, { status: 302, headers: { location: '/loop' } })
  }), /limite de redirecionamentos excedido/);
});

test('timeout encerra requisição mesmo se fetchFn ignorar AbortSignal', async () => {
  await assert.rejects(() => buscarWeb('teste', {
    timeoutMs: 50,
    fetchFn: () => new Promise(() => {})
  }), /tempo limite excedido/);
});

test('recusa resposta acima do limite Content-Length', async () => {
  await assert.rejects(() => buscarWeb('teste', {
    fetchFn: async () => resposta(200, 'x', {
      'content-type': 'text/html',
      'content-length': '2000000'
    })
  }), /limite de bytes/);
});

test('identifica PDF e devolve estado e contagem de bytes sem fingir extração de texto', async () => {
  const r = await lerPaginaWeb('https://public.example/documento.pdf', {
    fetchFn: async () => resposta(200, '%PDF-1.7\nconteúdo binário', { 'content-type': 'application/pdf' })
  });
  assert.equal(r.kind, 'pdf');
  assert.equal(r.status, 'pdf_text_extraction_unavailable');
  assert.equal(r.contentType, 'application/pdf');
  assert.ok(r.bytes > 5);
  assert.equal(r.text, '');
});

test('recusa tipos de conteúdo não HTML', async () => {
  await assert.rejects(() => lerPaginaWeb('https://public.example/data', {
    fetchFn: async () => resposta(200, '{"ok":true}', { 'content-type': 'application/json' })
  }), /tipo de conteúdo não suportado/);
});

test('baixa PDF público validado pelo MIME e retorna Uint8Array sem metadados extras', async () => {
  const conteudo = '%PDF-1.7\nconteúdo do documento';
  let chamada;
  const pdf = await baixarPdfPublico('https://public.example/documento', {
    fetchFn: async (url, init) => {
      chamada = { url, init };
      return resposta(200, conteudo, { 'content-type': 'application/pdf; charset=binary' });
    }
  });
  assert.equal(chamada.url, 'https://public.example/documento');
  assert.equal(chamada.init.redirect, 'manual');
  assert.equal(pdf.url, 'https://public.example/documento');
  assert.equal(pdf.contentType, 'application/pdf');
  assert.ok(pdf.bytes instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(pdf.bytes), conteudo);
  assert.deepEqual(Object.keys(pdf).sort(), ['bytes', 'contentType', 'url']);
});

test('aceita assinatura %PDF- quando o MIME não foi informado', async () => {
  const pdf = await baixarPdfPublico('https://public.example/arquivo', {
    fetchFn: async () => resposta(200, new TextEncoder().encode('%PDF-1.4\nconteúdo'))
  });
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(new TextDecoder().decode(pdf.bytes).slice(0, 5), '%PDF-');
});

test('rejeita PDF truncado, MIME incompatível, bytes insuficientes e conteúdo inválido', async () => {
  const fetchWith = body => async () => body;
  const grande = new Uint8Array(1_000_001);
  grande.set(new TextEncoder().encode('%PDF-1.7'));
  await assert.rejects(() => baixarPdfPublico('https://public.example/file', {
    fetchFn: fetchWith(resposta(200, grande, { 'content-type': 'application/pdf' }))
  }), /truncado|limite de bytes/);
  await assert.rejects(() => baixarPdfPublico('https://public.example/file', {
    fetchFn: async () => resposta(200, '%PDF-1.7', { 'content-type': 'text/plain' })
  }), /incompatível/);
  await assert.rejects(() => baixarPdfPublico('https://public.example/file', {
    fetchFn: async () => resposta(200, new TextEncoder().encode('%PDF'))
  }), /insuficientes/);
  await assert.rejects(() => baixarPdfPublico('https://public.example/file', {
    fetchFn: async () => resposta(200, new TextEncoder().encode('not-a-pdf'))
  }), /não é um PDF válido/);
});
