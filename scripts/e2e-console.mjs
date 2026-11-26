// Teste de ponta a ponta do Console (console/console.js) num navegador de verdade, com o Worker real e uma IA de mentira em fluxo.
// Uso:  npm run build && node scripts/e2e-console.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { criarManipulador } from '../worker/handler.mjs'; import { APPS } from '../worker/apps.mjs'; import { criarHashDeSenha } from '../worker/auth.mjs'; import { carregarPDFLib } from '../tests/pdflib-carregar.mjs';
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }
const ESPERA = Number(process.env.E2E_ESPERA) || 1;
const PORTA = 8766, ORIGEM = 'http://localhost:' + PORTA, SENHA = 'senha-forte-2026';
const dist = path.join(RAIZ, 'dist'); if (!fs.existsSync(path.join(dist, 'paulus.v1.js'))) throw new Error('Rode antes: npm run build');
const base = JSON.parse(fs.readFileSync(path.join(dist, 'conhecimento.json'), 'utf8'));
const hash = await criarHashDeSenha(SENHA);
const perguntasIA = []; let demora = 0, respostaFixa = null, ultimoMax = 0;
const MD = 'O **CRAS** é a porta de entrada.\n\n- Item *um*\n- Item dois\n\n| Serviço | Sigla |\n|---|---|\n| Proteção e Atendimento Integral à Família | PAIF |\n\n```\nconst x = 1;\n```\n\n[link bom](https://example.com) e [link ruim](javascript:alert(1)) <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>';
function ia() {
  return { async run(_m, p) {
    perguntasIA.push(p.messages[p.messages.length - 1].content); ultimoMax = Math.max(ultimoMax, p.max_tokens || 0);
    const T = respostaFixa || MD;
    if (!p.stream) return { response: T };
    const enc = new TextEncoder(); const pedacos = T.match(/[\s\S]{1,12}/g);
    return new ReadableStream({ async start(c) { for (const t of pedacos) { if (demora) await new Promise((r) => setTimeout(r, demora)); c.enqueue(enc.encode('data: ' + JSON.stringify({ response: t }) + '\n\n')); } c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
  } };
}
const manipulador = criarManipulador({ base, apps: APPS });
const env = { ALLOWED_ORIGINS: ORIGEM, AUTH_SEGREDO: 'x'.repeat(64), USUARIOS: JSON.stringify({ paulo: hash }), AI: ia() };
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json', '.json': 'application/json' };
// O index.html publicado já traz o endereço do Worker real e a chave do Firebase: o teste troca o endereço pelo servidor de teste e tira o Firebase.
const html = fs.readFileSync(path.join(RAIZ, 'console/index.html'), 'utf8').replace(/(<meta name="paulus-endpoint" content=")[^"]*(")/, '$1' + ORIGEM + '$2').replace(/(<meta name="paulus-firebase-key" content=")[^"]*(")/, '$1$2').replace(/connect-src 'self'/, "connect-src 'self' " + ORIGEM);
const servidor = http.createServer(async (q, r) => {
  if (q.method === 'POST' || q.method === 'OPTIONS') {
    const partes = []; for await (const c of q) partes.push(c);
    const res = await manipulador(new Request(ORIGEM + q.url, { method: q.method, headers: { ...q.headers, 'cf-connecting-ip': '5.5.5.5' }, body: q.method === 'POST' ? Buffer.concat(partes) : undefined }), env);
    r.writeHead(res.status, Object.fromEntries(res.headers));
    if (res.body) { const lt = res.body.getReader(); for (;;) { const x = await lt.read(); if (x.done) break; r.write(Buffer.from(x.value)); } } r.end(); return;
  }
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  if (f === '/index.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html); return; }
  const p = path.join(dist, f); if (!fs.existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(p));
}).listen(PORTA);
const navegador = await chromium.launch(); const resultados = [];
async function teste(nome, fn, op = {}) {
  const ctx = await navegador.newContext({ viewport: op.viewport || { width: 1280, height: 800 }, acceptDownloads: true, permissions: op.permissions, geolocation: op.geolocation });
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', (e) => erros.push('JS: ' + e.message));
  pg.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of [45]\d\d|net::ERR/.test(t)) erros.push('console: ' + t); });
  try { await fn(pg); if (erros.length) throw new Error('erros na página: ' + erros.join(' | ')); resultados.push(true); console.log('  ok    ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + String(e.message).split('\n')[0]); }
  await ctx.close();
}
const ok = (c, m) => { if (!c) throw new Error(m); };
async function abrir(pg) {
  await pg.goto(ORIGEM + '/'); await pg.waitForSelector('#lgu:not([disabled])', { timeout: 8000 });
  await pg.fill('#lgu', 'paulo'); await pg.fill('#lgp', SENHA); await pg.click('#lgb');
  await pg.waitForSelector('#q', { state: 'visible', timeout: 8000 }); await pg.waitForFunction(() => document.getElementById('st').textContent === 'EM ESPERA', null, { timeout: 8000 });
}
const enviar = async (pg, t) => { await pg.fill('#q', t); await pg.press('#q', 'Enter'); };
const ultima = (pg) => pg.locator('#log .m.p').last();
const fim = (pg) => pg.waitForFunction(() => document.getElementById('go').textContent === 'Enviar', null, { timeout: 15000 });

console.log('Console · ponta a ponta');
await teste('abre após o login, com boas-vindas, atalhos e foco na pergunta', async (pg) => {
  await abrir(pg); ok(await pg.locator('.hi').count() === 1, 'sem boas-vindas'); ok(await pg.locator('#tb button').count() >= 5, 'sem botões de tarefa');
  ok(await pg.evaluate(() => document.activeElement.id) === 'q', 'foco fora da pergunta');
});
await teste('conta feita no aparelho: 15% de 3200 = 480, sem chamar a IA', async (pg) => {
  perguntasIA.length = 0; await abrir(pg); await enviar(pg, 'quanto é 15% de 3200?'); await fim(pg);
  ok(/480/.test(await ultima(pg).innerText()), 'resultado errado: ' + await ultima(pg).innerText()); ok(perguntasIA.length === 0, 'chamou a IA');
});
await teste('pedido de socorro mostra telefones clicáveis', async (pg) => {
  await abrir(pg); await enviar(pg, 'estou pensando em me matar'); await fim(pg);
  ok(await ultima(pg).locator('a[href^="tel:"]').count() >= 1, 'sem telefones'); 
});
await teste('dado pessoal (CPF) é bloqueado e não vai à IA', async (pg) => {
  perguntasIA.length = 0; await abrir(pg); await enviar(pg, 'o CPF dela é 123.456.789-09, o que faço?'); await fim(pg);
  ok(perguntasIA.length === 0, 'CPF chegou à IA'); ok((await ultima(pg).innerText()).length > 20, 'sem aviso');
});
await teste('pergunta à IA: resposta em fluxo, Markdown desenhado, sem XSS nem link javascript:', async (pg) => {
  perguntasIA.length = 0; await abrir(pg); await enviar(pg, 'explique o papel do CRAS no território'); await fim(pg);
  const m = ultima(pg); ok(perguntasIA.length >= 1, 'IA não foi chamada');
  ok(await m.locator('strong').first().innerText() === 'CRAS', 'sem negrito'); ok(await m.locator('ul li').count() === 2, 'sem lista');
  ok(await m.locator('table th').count() === 2 && await m.locator('table td').count() === 2, 'sem tabela'); ok(/const x = 1;/.test(await m.locator('.cb pre').innerText()), 'sem bloco de código');
  ok(await m.locator('a[href="https://example.com"]').count() === 1, 'link bom sumiu'); ok(await m.locator('a[href^="javascript"]').count() === 0, 'link javascript: passou');
  ok(await m.locator('img[src="x"], script').count() === 0, 'HTML cru virou elemento'); ok(await pg.evaluate(() => !window.__xss), 'XSS executou');
  ok(await m.locator('button:has-text("Copiar")').count() >= 1, 'sem copiar');
});
await teste('botão Parar descarta a resposta e libera o campo', async (pg) => {
  await abrir(pg); demora = 400; try { await enviar(pg, 'explique o papel do CRAS no território'); await pg.waitForFunction(() => document.getElementById('go').textContent === 'Parar', null, { timeout: 5000 }); await pg.click('#go'); await fim(pg); } finally { demora = 0; }
  ok(await pg.locator('#log .m.p').count() === 0, 'resposta ficou na tela');
});
await teste('menu de atalhos: "/" abre, filtra e Enter escolhe', async (pg) => {
  await abrir(pg); await pg.fill('#q', '/'); await pg.dispatchEvent('#q', 'input'); await pg.waitForSelector('#sl div'); ok(await pg.locator('#sl div').count() >= 8, 'poucos atalhos');
  await pg.fill('#q', '/con'); await pg.dispatchEvent('#q', 'input'); ok(await pg.locator('#sl div').count() === 1, 'filtro falhou'); await pg.press('#q', 'Enter');
  ok((await pg.inputValue('#q')).startsWith('quanto é'), 'atalho não preencheu: ' + await pg.inputValue('#q')); ok(await pg.isHidden('#sl'), 'menu não fechou');
});
await teste('PDF anexado: "numerar as páginas" gera arquivo para baixar', async (pg) => {
  const L = carregarPDFLib(); const d = await L.PDFDocument.create(); d.addPage(); d.addPage(); const bytes = Buffer.from(await d.save());
  await abrir(pg); await pg.setInputFiles('#fi', { name: 'teste.pdf', mimeType: 'application/pdf', buffer: bytes });
  ok(await pg.locator('#fl .fc').count() === 1, 'chip do anexo não apareceu');
  await enviar(pg, 'numerar as páginas'); await fim(pg);
  ok(await pg.locator('#fl .fc').count() === 0, 'anexo não foi limpo'); const b = ultima(pg).locator('button:has-text("⤓")'); ok(await b.count() === 1, 'sem botão de baixar: ' + await ultima(pg).innerText());
  const [dl] = await Promise.all([pg.waitForEvent('download'), b.click()]); ok(/\.pdf$/i.test(dl.suggestedFilename()), 'nome do download: ' + dl.suggestedFilename());
});
await teste('anexos PPTX e ODS são aceitos pelo seletor do console', async (pg) => {
  await abrir(pg);
  await pg.setInputFiles('#fi', [
    { name: 'apresentacao.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('pptx') },
    { name: 'planilha.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: Buffer.from('ods') }
  ]);
  ok(await pg.locator('#fl .fc').count() === 2, 'não aceitou os dois formatos Office/OpenDocument');
  ok(/apresentacao\.pptx/.test(await pg.innerText('#fl')) && /planilha\.ods/.test(await pg.innerText('#fl')), 'nomes dos anexos não apareceram');
});
await teste('arquivo de tipo errado é recusado', async (pg) => {
  await abrir(pg); await pg.setInputFiles('#fi', { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  ok(await pg.locator('#fl .fc').count() === 0, 'aceitou .exe'); ok(/formato não suportado/.test(await pg.innerText('#pi')), 'sem aviso');
});
await teste('nova conversa limpa tudo; salvar conversa baixa .md com a pergunta', async (pg) => {
  await abrir(pg); await enviar(pg, 'quanto é 2+2'); await fim(pg);
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ex')]); const txt = fs.readFileSync(await dl.path(), 'utf8');
  ok(/\.md$/.test(dl.suggestedFilename()) && /quanto é 2\+2/.test(txt) && /\*\*Paulus:\*\*/.test(txt), 'conteúdo do .md: ' + txt.slice(0, 120));
  await pg.click('#nv'); ok(await pg.locator('#log .m').count() === 0 && await pg.locator('.hi').count() === 1, 'não limpou');
});
await teste('Shift+Enter quebra linha, Enter envia; campo vazio não envia', async (pg) => {
  await abrir(pg); await pg.press('#q', 'Enter'); ok(await pg.locator('#log .m').count() === 0, 'enviou vazio');
  await pg.fill('#q', 'a'); await pg.press('#q', 'Shift+Enter'); ok((await pg.inputValue('#q')).includes('\n'), 'sem quebra'); ok(await pg.locator('#log .m').count() === 0, 'enviou no Shift+Enter');
});
await teste('sugestão da boas-vindas envia a pergunta ao clicar', async (pg) => {
  await abrir(pg); await pg.locator('.hi .ch').first().click(); await fim(pg); ok(await pg.locator('#log .m.u').count() === 1, 'pergunta não apareceu');
});
await teste('celular (390×760): barra não cobre a conversa e nada rola de lado', async (pg) => {
  await abrir(pg); await enviar(pg, 'quanto é 2+2'); await fim(pg);
  const g = await pg.evaluate(() => ({ l: document.getElementById('log').getBoundingClientRect().bottom, b: document.getElementById('bar').getBoundingClientRect().top, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(g.l <= g.b + 1, 'conversa passa por baixo da barra: ' + JSON.stringify(g)); ok(g.sw <= g.iw, 'rolagem horizontal');
}, { viewport: { width: 390, height: 760 } });
const SHOT = process.env.SHOT_DIR;
const SVG_IA = '<svg viewBox="0 0 400 200" width="9999" height="9999">' +
  '<rect width="400" height="200" fill="#ffffff" onclick="window.__xss=3"/>' +
  '<script>window.__xss=4</script>' +
  '<g id="g1" style="fill:url(http://evil.example/x)" onload="window.__xss=5">' +
  '<circle cx="100" cy="100" r="50" fill="#37e6ff" stroke="#036" stroke-width="4"/>' +
  '<image href="https://evil.example/track.png" x="0" y="0" width="10" height="10"/>' +
  '<foreignObject x="0" y="0" width="50" height="50"><div xmlns="http://www.w3.org/1999/xhtml">oi</div></foreignObject>' +
  '<a href="javascript:window.__xss=6"><rect x="200" y="60" width="120" height="80" fill="url(#g)" rx="8"/></a>' +
  '<text x="260" y="108" font-size="16" text-anchor="middle" font-family="sans-serif">Olá, CRAS</text>' +
  '</g></svg>';
await teste('IA desenha: bloco svg vira desenho na tela (limpo, sem script), com baixar SVG e PNG; espaço de resposta maior', async (pg) => {
  perguntasIA.length = 0; ultimoMax = 0;
  respostaFixa = 'Aqui está o desenho.\n\n```svg\n' + SVG_IA + '\n```\n\nPosso ajustar as cores.';
  try {
    await abrir(pg); await enviar(pg, 'desenhe um círculo azul e uma caixa com o texto Olá, CRAS'); await fim(pg);
    await pg.waitForSelector('#log .dw img', { timeout: 5000 * ESPERA });
    ok(perguntasIA.length >= 1, 'o pedido de desenho deveria ir à IA');
    ok(ultimoMax >= 3000, 'sem espaço extra para o SVG: max_tokens=' + ultimoMax);
    ok(await pg.locator('#log pre').count() === 0, 'o código SVG apareceu como texto em vez de desenho');
    const src = decodeURIComponent((await pg.getAttribute('#log .dw img', 'src')).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
    for (const proibido of [/<script/i, /onclick|onload/i, /<image/i, /foreignObject/i, /javascript:/i, /evil\.example/i, /\bstyle=/i, /<a[\s>]/i, /\bhref=/i]) ok(!proibido.test(src), 'sobrou no SVG: ' + proibido + ' -> ' + src);
    ok(/<circle/.test(src) && /Olá, CRAS/.test(src) && /viewBox="0 0 400 200"/.test(src), 'o desenho limpo perdeu as formas boas: ' + src);
    ok(!/\swidth="9999"/.test(src), 'width/height do SVG não foram normalizados');
    ok(await pg.evaluate(() => !window.__xss), 'script do SVG rodou');
    ok(await pg.evaluate(() => { const i = document.querySelector('#log .dw img'); return i.complete && i.naturalWidth > 0; }), 'o navegador não conseguiu desenhar a imagem');
    const [dsvg] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 * ESPERA }), pg.click('#log .dw button:has-text("SVG")')]);
    ok(dsvg.suggestedFilename() === 'desenho-paulus.svg', 'nome do SVG: ' + dsvg.suggestedFilename());
    const [dpng] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 * ESPERA }), pg.click('#log .dw button:has-text("PNG")')]);
    ok(dpng.suggestedFilename() === 'desenho-paulus.png', 'nome do PNG: ' + dpng.suggestedFilename());
  } finally { respostaFixa = null; }
});
await teste('IA desenha: enquanto o SVG chega aparece "Desenhando…"; SVG quebrado cai de volta em bloco de código', async (pg) => {
  respostaFixa = 'Segue.\n\n```svg\n' + SVG_IA + '\n```\n'; demora = 120;
  try {
    await abrir(pg); await enviar(pg, 'desenhe um círculo azul');
    await pg.waitForSelector('#log .dwp', { timeout: 8000 * ESPERA });
    ok(await pg.locator('#log pre').count() === 0, 'o código apareceu aos poucos em vez de "Desenhando…"');
    demora = 0; await fim(pg);
    ok(await pg.locator('#log .dw img').count() === 1 && await pg.locator('#log .dwp').count() === 0, 'depois de pronto deveria ficar só o desenho');
    // SVG quebrado (tag aberta): não some nem quebra a tela, vira bloco de código
    respostaFixa = 'Tentei.\n\n```svg\n<svg viewBox="0 0 10 10"><rect width="5" height="5">\n```\n';
    await pg.waitForTimeout(1500);   // o cliente recusa perguntas com menos de 1,2 s de intervalo ("uma pergunta de cada vez")
    await enviar(pg, 'desenhe um quadrado'); await fim(pg);
    ok(await pg.locator('#log pre').count() === 1, 'SVG inválido deveria aparecer como código: ' + (await pg.innerText('#log')).slice(-400));
    ok(await pg.locator('#log .dw img').count() === 1, 'o desenho anterior deveria continuar');
  } finally { respostaFixa = null; demora = 0; }
});
await teste('Meus sistemas: botão abre o painel com 12 links e "Abrir todos"; /sistemas e Escape; /sibec abre a aba', async (pg) => {
  await abrir(pg); await pg.click('#sx'); ok(await pg.locator('#sxp').isVisible(), 'painel não abriu');
  ok(await pg.locator('#sxp .sx-lista a[target=_blank]').count() === 12, 'não são 12 links');
  ok(/Abrir todos \(12\)/.test(await pg.locator('#sxp .sx-todos').textContent()), 'sem Abrir todos');
  if (SHOT) { await pg.mouse.move(600, 600); await pg.waitForTimeout(3500); await pg.screenshot({ path: SHOT + '/painel-desktop.png', clip: { x: 760, y: 0, width: 520, height: 130 } }); }
  await pg.keyboard.press('Escape'); ok(await pg.locator('#sxp').isHidden(), 'Escape não fechou');
  await pg.fill('#q', '/sis'); ok(await pg.locator('#sl').isVisible(), 'sem lista de atalhos');
  await pg.press('#q', 'Enter'); await pg.waitForTimeout(150);
  const [nova] = await Promise.all([pg.context().waitForEvent('page', { timeout: 4000 }), (async () => { await pg.fill('#q', 'chama o cadunico'); await pg.press('#q', 'Enter'); })()]);
  await nova.close().catch(() => {});
});
await teste('Meus sistemas no celular: vai para o menu e o painel cabe na tela', async (pg) => {
  await abrir(pg); await pg.click('#mn'); await pg.click('#sx'); ok(await pg.locator('#sxp').isVisible(), 'painel não abriu');
  const g = await pg.evaluate(() => { const r = document.getElementById('sxp').getBoundingClientRect(); return { l: r.left, r: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth }; });
  ok(g.l >= 0 && g.r <= g.iw && g.sw <= g.iw, 'painel vaza: ' + JSON.stringify(g));
  if (SHOT) { await pg.waitForTimeout(3500); await pg.screenshot({ path: SHOT + '/painel-celular.png' }); }
}, { viewport: { width: 390, height: 760 } });
// Rota a partir da posição do aparelho: o mapa de lugares de teste vai para dist/ só durante este teste.
const lugaresTeste = path.join(dist, 'lugares-boa-vista.json'); const tinha = fs.existsSync(lugaresTeste);
if (!tinha) fs.writeFileSync(lugaresTeste, JSON.stringify({ fonte: 'teste', gerado: '2026-11-21', cats: ['saude', 'assistencia'], bairros: [['Centro', 2.8235, -60.6758]], lugares: [['CAPS Teste Um', 0, 0, 2.8300, -60.6800, '', ''], ['CRAS Teste Dois', 1, 0, 2.8500, -60.7000, '', '']] }));
await teste('rota "saindo daqui" usa a posição do aparelho: sai com km e a posição não aparece na tela', async (pg) => {
  await abrir(pg); await enviar(pg, 'traçar rota saindo daqui: CAPS Teste Um e CRAS Teste Dois'); await fim(pg);
  const t = await ultima(pg).innerText(); ok(/Sua posição/.test(t) && /km/.test(t), 'sem rota a partir da posição: ' + t.slice(0, 200));
  ok(!/2\.8235|-60\.6758/.test(await pg.innerText('body')), 'coordenada apareceu na tela');
  ok(/OBTIDA/.test(await pg.innerText('#kp')), 'painel de posição: ' + await pg.innerText('#kp'));
}, { permissions: ['geolocation'], geolocation: { latitude: 2.8235, longitude: -60.6758, accuracy: 20 } });
await teste('localização negada: rota ainda sai (link por nome) e o painel mostra NEGADA', async (pg) => {
  await abrir(pg); await enviar(pg, 'traçar rota saindo daqui: CAPS Teste Um e CRAS Teste Dois'); await fim(pg);
  ok(/permita a localização/.test(await ultima(pg).innerText()), 'sem orientação: ' + await ultima(pg).innerText());
  ok(/NEGADA/.test(await pg.innerText('#kp')), 'painel: ' + await pg.innerText('#kp'));
});
await teste('pergunta que não fala da posição não pede localização', async (pg) => {
  await abrir(pg); await enviar(pg, 'quanto é 2+2'); await fim(pg); ok(/NÃO USADA/.test(await pg.innerText('#kp')), 'pediu GPS à toa');
}, { permissions: ['geolocation'], geolocation: { latitude: 2.8235, longitude: -60.6758 } });
// Mapa da rota (Leaflet): tiles e servidor de rotas simulados, sem rede externa.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/PEgAAAABJRU5ErkJggg==', 'base64');
async function simularMapa(pg, estado) {
  await pg.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await pg.route('https://routing.openstreetmap.de/**', (r) => { estado.url = r.request().url(); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 8123, duration: 960, geometry: { type: 'LineString', coordinates: [[-60.6758, 2.8235], [-60.68, 2.83], [-60.70, 2.85]] } }] }) }); });
}
await teste('rota com posição mostra o MAPA: marcadores numerados, linha, atribuição OSM e botão Pelas ruas', async (pg) => {
  const est = {}; await simularMapa(pg, est); pg.on('dialog', (d) => d.accept());
  await abrir(pg); await enviar(pg, 'traçar rota saindo daqui: CAPS Teste Um e CRAS Teste Dois'); await fim(pg);
  await pg.waitForSelector('#log .mapa .leaflet-tile-loaded', { timeout: 8000 });
  ok(await pg.locator('#log .mapa .pin').count() === 3, 'marcadores: ' + await pg.locator('#log .mapa .pin').count());
  ok(await pg.locator('#log .mapa path.leaflet-interactive').count() >= 1, 'sem linha da rota');
  ok(/OpenStreetMap/.test(await pg.innerText('#log .mapa .leaflet-control-attribution')), 'sem atribuição');
  ok(await pg.evaluate(() => !!document.querySelector('.mapa .leaflet-tooltip-pane') && !window.__xss), 'painel de dicas');
  await pg.click('#log button:has-text("Pelas ruas")'); await pg.waitForFunction(() => /Pelas ruas: 8,1 km · 16 min/.test(document.querySelector('.mleg').innerText), null, { timeout: 6000 });
  ok(/routed-car\/route\/v1\/driving\/-60\.6758/.test(est.url || ''), 'url do servidor de rotas: ' + est.url);
}, { permissions: ['geolocation'], geolocation: { latitude: 2.8235, longitude: -60.6758, accuracy: 20 } });
await teste('"mostrar o mapa de Boa Vista" abre o mapa no aparelho, sem chamar a IA; Onde estou põe o marcador EU', async (pg) => {
  perguntasIA.length = 0; await simularMapa(pg, {});
  await abrir(pg); await enviar(pg, 'mostrar o mapa de Boa Vista'); await pg.waitForSelector('#log .mapa .leaflet-tile-loaded', { timeout: 8000 });
  ok(perguntasIA.length === 0, 'chamou a IA'); await pg.click('#log button:has-text("Onde estou")'); await pg.waitForSelector('#log .mapa .pin.eu', { timeout: 6000 });
}, { permissions: ['geolocation'], geolocation: { latitude: 2.8235, longitude: -60.6758, accuracy: 20 } });
await teste('mapa sem internet (tiles falham): a rota continua desenhada e o aviso aparece', async (pg) => {
  await pg.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await abrir(pg); await enviar(pg, 'traçar rota saindo daqui: CAPS Teste Um e CRAS Teste Dois'); await fim(pg);
  await pg.waitForSelector('#log .mapa .pin', { timeout: 8000 }); await pg.waitForFunction(() => /INDISPONÍVEL/.test(document.querySelector('.mleg').innerText), null, { timeout: 8000 });
}, { permissions: ['geolocation'], geolocation: { latitude: 2.8235, longitude: -60.6758 } });
await teste('voz do navegador: escolhe sozinha a voz masculina natural, deixa trocar e usa velocidade e tom ao falar', async (pg) => {
  await pg.addInitScript(() => {
    const V = [['Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR'], ['Google português do Brasil', 'pt-BR'], ['Microsoft Antonio Online (Natural) - Portuguese (Brazil)', 'pt-BR'], ['Samantha', 'en-US']].map(([name, lang]) => ({ name, lang, voiceURI: name, localService: false, default: false }));
    window.__ditas = [];
    const ss = { getVoices: () => V, speak: (u) => { window.__ditas.push({ voz: u.voice && u.voice.name, taxa: u.rate, tom: u.pitch, texto: u.text }); setTimeout(() => u.onend && u.onend(), 5); }, cancel() {}, addEventListener() {}, removeEventListener() {}, speaking: false };
    Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await abrir(pg); await pg.click('#vc'); await pg.waitForSelector('#vp', { state: 'visible' });
  const auto = await pg.locator('#vsel option').first().innerText(); ok(/Antonio/.test(auto), 'a automática não escolheu a masculina natural: ' + auto);
  const opcoes = await pg.locator('#vsel option').allInnerTexts(); ok(!opcoes.some((t) => /Samantha/.test(t)), 'listou voz de outro idioma'); ok(opcoes.length === 4, 'lista errada: ' + opcoes.length);
  await pg.click('#vp button:has-text("TESTAR")'); let d = await pg.evaluate(() => window.__ditas); ok(d.length === 1 && /Antonio/.test(d[0].voz) && d[0].taxa === 0.95 && d[0].tom === 0.9, 'teste falou errado: ' + JSON.stringify(d));
  await pg.selectOption('#vsel', { index: 2 }); await pg.evaluate(() => { const r = document.querySelector('#vp input[aria-label="Tom da voz"]'); r.value = '0.7'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.click('#vp button:has-text("TESTAR")'); d = await pg.evaluate(() => window.__ditas); ok(!/Antonio/.test(d[1].voz) && d[1].tom === 0.7, 'não usou a escolha: ' + JSON.stringify(d[1]));
  await pg.reload(); await abrir(pg).catch(() => {}); await pg.click('#vc'); ok((await pg.inputValue('#vp input[aria-label="Tom da voz"]')) === '0.7', 'não guardou a escolha');
  await pg.keyboard.press('Escape'); ok(await pg.locator('#vp').isHidden(), 'Escape não fechou');
});
if (!tinha) fs.unlinkSync(lugaresTeste);
await navegador.close(); servidor.close();
const n = resultados.filter(Boolean).length; console.log('\n' + n + '/' + resultados.length + ' passaram'); process.exit(n === resultados.length ? 0 : 1);
