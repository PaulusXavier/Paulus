// Teste de ponta a ponta do Console (console/console.js) num navegador de verdade, com o Worker real e uma IA de mentira em fluxo.
// Uso:  npm run build && node scripts/e2e-console.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { criarManipulador } from '../worker/handler.mjs'; import { APPS } from '../worker/apps.mjs'; import { criarHashDeSenha } from '../worker/auth.mjs'; import { carregarPDFLib } from '../tests/pdflib-carregar.mjs';
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }
const PORTA = 8766, ORIGEM = 'http://localhost:' + PORTA, SENHA = 'senha-forte-2026';
const dist = path.join(RAIZ, 'dist'); if (!fs.existsSync(path.join(dist, 'paulus.v1.js'))) throw new Error('Rode antes: npm run build');
const base = JSON.parse(fs.readFileSync(path.join(dist, 'conhecimento.json'), 'utf8'));
const hash = await criarHashDeSenha(SENHA);
const perguntasIA = []; let demora = 0;
const MD = 'O **CRAS** é a porta de entrada.\n\n- Item *um*\n- Item dois\n\n| Serviço | Sigla |\n|---|---|\n| Proteção e Atendimento Integral à Família | PAIF |\n\n```\nconst x = 1;\n```\n\n[link bom](https://example.com) e [link ruim](javascript:alert(1)) <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>';
function ia() {
  return { async run(_m, p) {
    perguntasIA.push(p.messages[p.messages.length - 1].content);
    if (!p.stream) return { response: MD };
    const enc = new TextEncoder(); const pedacos = MD.match(/[\s\S]{1,12}/g);
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
await teste('arquivo de tipo errado é recusado', async (pg) => {
  await abrir(pg); await pg.setInputFiles('#fi', { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  ok(await pg.locator('#fl .fc').count() === 0, 'aceitou .exe'); ok(/só PDF/.test(await pg.innerText('#pi')), 'sem aviso');
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
if (!tinha) fs.unlinkSync(lugaresTeste);
await navegador.close(); servidor.close();
const n = resultados.filter(Boolean).length; console.log('\n' + n + '/' + resultados.length + ' passaram'); process.exit(n === resultados.length ? 0 : 1);
