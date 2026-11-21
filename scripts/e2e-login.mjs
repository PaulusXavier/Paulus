// Teste de ponta a ponta da tela de login, num navegador de verdade (Playwright + Chromium), com o Worker real.
// Uso:  node scripts/e2e-login.mjs        (precisa de:  npm i -D playwright  e  npx playwright install chromium)
// Não faz parte do "npm test" (que roda só o Node, sem navegador).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { criarHashDeSenha } from '../worker/auth.mjs';
import { juntar } from './build.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }

const PORTA = 8765, ORIGEM = 'http://localhost:' + PORTA, SENHA = 'senha-forte-2026';
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'knowledge/conhecimento.json'), 'utf8'));
const hash = await criarHashDeSenha(SENHA), hashOutro = await criarHashDeSenha('outra-senha-qualquer');
let env, manipulador;
function zerar() {
  env = { ALLOWED_ORIGINS: ORIGEM, AUTH_SEGREDO: 'x'.repeat(64), USUARIOS: JSON.stringify({ paulo: hash }), AI: { async run() { return { response: 'ok' }; } } };
  manipulador = criarManipulador({ base, apps: APPS });
}
zerar();

// site estático montado a partir do repositório
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'paulus-e2e-'));
fs.writeFileSync(path.join(site, 'paulus.v1.js'), juntar());
fs.copyFileSync(path.join(RAIZ, 'console/login.js'), path.join(site, 'login.js'));
fs.copyFileSync(path.join(RAIZ, 'icon-512.png'), path.join(site, 'icon-512.png'));
fs.copyFileSync(path.join(RAIZ, 'icon-192.png'), path.join(site, 'icon-192.png'));
fs.copyFileSync(path.join(RAIZ, 'manifest.webmanifest'), path.join(site, 'manifest.webmanifest'));
fs.writeFileSync(path.join(site, 'console.js'), "document.getElementById('st').textContent='CONSOLE ABERTO';");
const html = fs.readFileSync(path.join(RAIZ, 'console/index.html'), 'utf8');
fs.writeFileSync(path.join(site, 'index.html'), html.replace('<meta name="paulus-endpoint" content="">', '<meta name="paulus-endpoint" content="' + ORIGEM + '">'));
fs.writeFileSync(path.join(site, 'sem-login.html'), html);
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
const servidor = http.createServer(async (q, r) => {
  if (q.url === '/__zerar') { zerar(); r.end('ok'); return; }
  if (q.url === '/__trocar-contas') { env.USUARIOS = JSON.stringify({ outro: hashOutro }); r.end('ok'); return; }
  if (q.method === 'POST' || q.method === 'OPTIONS') {
    const partes = []; for await (const c of q) partes.push(c);
    const res = await manipulador(new Request(ORIGEM + q.url, { method: q.method, headers: { ...q.headers, 'cf-connecting-ip': '5.5.5.5' }, body: q.method === 'POST' ? Buffer.concat(partes) : undefined }), env);
    r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer())); return;
  }
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0], p = path.join(site, f);
  if (!fs.existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(p));
}).listen(PORTA);

// ---------------------------------------------------------------- mini executor de testes
const navegador = await chromium.launch();
const resultados = [];
async function teste(nome, fn, opcoes = {}) {
  await fetch(ORIGEM + '/__zerar');
  const ctx = await navegador.newContext({ viewport: opcoes.viewport || { width: 1280, height: 800 }, reducedMotion: opcoes.reduzido ? 'reduce' : 'no-preference' });
  const pg = await ctx.newPage(), erros = [];
  pg.on('pageerror', (e) => erros.push('JS: ' + e.message));
  pg.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 4\d\d|status of 5\d\d|net::ERR/.test(t)) erros.push('console: ' + t); });
  try { await fn(pg, ctx); if (erros.length) throw new Error('erros na página: ' + erros.join(' | ')); resultados.push([true, nome]); console.log('  ok   ' + nome); }
  catch (e) { resultados.push([false, nome, e.message]); console.log('  FALHA ' + nome + '\n        ' + String(e.message).split('\n')[0]); }
  await ctx.close();
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const igual = (a, b, m) => { if (a !== b) throw new Error(m + ' (veio ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); };
const abrir = async (pg, url = ORIGEM + '/') => { await pg.goto(url); await pg.waitForSelector('#lgu:not([disabled])', { timeout: 5000 }); };
const entrar = async (pg, senha = SENHA, lembrar = false) => { await pg.fill('#lgu', 'paulo'); await pg.fill('#lgp', senha); if (lembrar) await pg.check('#lgl'); await pg.click('#lgb'); };
const consoleAberto = (pg) => pg.waitForFunction(() => document.getElementById('st') && document.getElementById('st').textContent === 'CONSOLE ABERTO', null, { timeout: 5000 });
const noForm = async (pg) => { await pg.waitForSelector('#lgu:not([disabled])', { timeout: 5000 }); ok(await pg.isVisible('#lgform'), 'formulário deveria estar visível'); };

console.log('Tela de login · ponta a ponta');
await teste('abre sem erros, com ícone carregado e foco no usuário', async (pg) => {
  const reqs = []; pg.on('response', (r) => reqs.push(r.url() + ' ' + r.status()));
  await abrir(pg);
  ok(reqs.some((u) => /icon-512\.png 200/.test(u)), 'icon-512.png não carregou');
  igual(await pg.evaluate(() => document.activeElement.id), 'lgu', 'foco inicial');
  ok(await pg.isVisible('#lgform') && await pg.isVisible('#lgo') && await pg.isVisible('#lgbg'), 'elementos');
  const pintou = await pg.evaluate(() => ['lgo', 'lgbg'].map((id) => { const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; }));
  ok(pintou[0] && pintou[1], 'canvas do ícone ou do fundo está em branco');
  igual(await pg.evaluate(() => document.body.classList.contains('lock')), true, 'console deve ficar travado atrás do login');
  ok(!(await pg.evaluate(() => !!window.Paulus && document.getElementById('st').textContent === 'CONSOLE ABERTO')), 'console não deveria abrir antes do login');
});
await teste('o console.js só é pedido depois do login', async (pg) => {
  const urls = []; pg.on('request', (r) => urls.push(r.url()));
  await abrir(pg); await pg.waitForTimeout(400);
  ok(!urls.some((u) => /console\.js/.test(u)), 'console.js foi baixado antes de entrar');
  await entrar(pg); await consoleAberto(pg);
  ok(urls.some((u) => /console\.js/.test(u)), 'console.js deveria carregar depois do login');
});
await teste('envio vazio: avisa e não chama o servidor', async (pg) => {
  let n = 0; pg.on('request', (r) => { if (/\/login/.test(r.url()) && r.method() === 'POST') n++; });
  await abrir(pg); await pg.click('#lgb');
  ok(/Informe usuário e senha/.test(await pg.textContent('#lgs')), 'mensagem');
  igual(n, 0, 'pedidos a /login');
  igual(await pg.getAttribute('#lgu', 'aria-invalid'), 'true', 'aria-invalid');
  await pg.fill('#lgu', 'p'); igual(await pg.getAttribute('#lgu', 'aria-invalid'), 'false', 'aria-invalid some ao digitar');
});
await teste('teclado: Enter no usuário vai à senha; Esc limpa a senha; ordem do Tab', async (pg) => {
  await abrir(pg); await pg.fill('#lgu', 'paulo'); await pg.press('#lgu', 'Enter');
  igual(await pg.evaluate(() => document.activeElement.id), 'lgp', 'Enter deveria focar a senha');
  await pg.fill('#lgp', 'abc'); await pg.press('#lgp', 'Escape'); igual(await pg.inputValue('#lgp'), '', 'Esc');
  const ordem = []; await pg.focus('#lgu');
  for (let i = 0; i < 4; i++) { await pg.keyboard.press('Tab'); ordem.push(await pg.evaluate(() => document.activeElement.id)); }
  igual(ordem.join(','), 'lgp,lgv,lgl,lgb', 'ordem do Tab');
});
await teste('VER/OCULTAR alterna a senha e o rótulo acessível', async (pg) => {
  await abrir(pg);
  igual(await pg.getAttribute('#lgp', 'type'), 'password', 'inicial');
  await pg.click('#lgv'); igual(await pg.getAttribute('#lgp', 'type'), 'text', 'visível');
  igual(await pg.getAttribute('#lgv', 'aria-pressed'), 'true', 'aria-pressed'); igual(await pg.getAttribute('#lgv', 'aria-label'), 'Ocultar senha', 'rótulo');
  await pg.click('#lgv'); igual(await pg.getAttribute('#lgp', 'type'), 'password', 'oculta de novo');
});
await teste('aviso de Caps Lock aparece e some', async (pg) => {
  await abrir(pg); await pg.focus('#lgp');
  await pg.evaluate(() => document.getElementById('lgp').dispatchEvent(new KeyboardEvent('keydown', { key: 'A', modifierCapsLock: true, bubbles: true })));
  ok(await pg.isVisible('#lgc'), 'aviso deveria aparecer');
  await pg.evaluate(() => document.getElementById('lgp').dispatchEvent(new KeyboardEvent('keyup', { key: 'a', modifierCapsLock: false, bubbles: true })));
  ok(!(await pg.isVisible('#lgc')), 'aviso deveria sumir');
});
await teste('senha errada: mensagem, campos em erro, senha limpa e usuário mantido', async (pg) => {
  await abrir(pg); await entrar(pg, 'errada');
  await pg.waitForFunction(() => /incorretos/.test(document.getElementById('lgs').textContent));
  igual(await pg.inputValue('#lgp'), '', 'senha limpa'); igual(await pg.inputValue('#lgu'), 'paulo', 'usuário mantido');
  ok(await pg.$eval('#lgub', (e) => e.classList.contains('err')), 'campo em erro');
  igual(await pg.getAttribute('#lgp', 'aria-invalid'), 'true', 'aria-invalid');
  ok(await pg.$eval('#lc', (e) => e.classList.contains('tremer')), 'cartão deveria tremer');
  ok(await pg.isEnabled('#lgb'), 'botão volta a funcionar');
});
await teste('usuário inexistente recebe a MESMA mensagem da senha errada', async (pg) => {
  await abrir(pg); await pg.fill('#lgu', 'ninguem'); await pg.fill('#lgp', 'qualquer'); await pg.click('#lgb');
  await pg.waitForFunction(() => /incorretos/.test(document.getElementById('lgs').textContent));
  const a = await pg.textContent('#lgs');
  await pg.fill('#lgu', 'paulo'); await pg.fill('#lgp', 'errada'); await pg.click('#lgb');
  await pg.waitForFunction(() => /incorretos/.test(document.getElementById('lgs').textContent)); await pg.waitForTimeout(100);
  igual(await pg.textContent('#lgs'), a, 'mensagens diferem');
});
await teste('duplo clique envia só um pedido', async (pg) => {
  let n = 0; pg.on('request', (r) => { if (/\/login$/.test(r.url()) && r.method() === 'POST') n++; });
  await abrir(pg); await pg.fill('#lgu', 'paulo'); await pg.fill('#lgp', 'errada');
  await pg.dblclick('#lgb'); await pg.waitForTimeout(1500);
  igual(n, 1, 'pedidos a /login');
});
await teste('senha certa: console abre, sair aparece, sessão só na aba (sem "manter")', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  await pg.waitForFunction(() => document.getElementById('lg').hidden);
  ok(await pg.isVisible('#sair'), 'botão sair'); igual(await pg.evaluate(() => document.body.classList.contains('lock')), false, 'trava removida');
  const arm = await pg.evaluate(() => [!!sessionStorage.getItem('paulus.sessao'), !!localStorage.getItem('paulus.sessao'), !!localStorage.getItem('paulus.bloqueio')]);
  igual(arm.join(), 'true,false,false', 'onde a sessão ficou');
  ok(!(await pg.content()).includes(SENHA), 'a senha não pode ficar no HTML');
  igual(await pg.evaluate(() => document.getElementById('lgp').value), '', 'campo da senha limpo');
});
await teste('"Manter conectado" guarda a sessão no aparelho', async (pg) => {
  await abrir(pg); await entrar(pg, SENHA, true); await consoleAberto(pg);
  const arm = await pg.evaluate(() => [!!sessionStorage.getItem('paulus.sessao'), !!localStorage.getItem('paulus.sessao')]);
  igual(arm.join(), 'false,true', 'onde a sessão ficou');
});
await teste('recarregar mantém a sessão; sair volta ao login e limpa tudo', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  await pg.reload(); await consoleAberto(pg);
  await pg.click('#sair'); await noForm(pg);
  const arm = await pg.evaluate(() => [sessionStorage.getItem('paulus.sessao'), localStorage.getItem('paulus.sessao')]);
  igual(arm.join(), ',', 'sessão apagada');
  igual(await pg.inputValue('#lgu'), 'paulo', 'usuário lembrado para o próximo login');
});
await teste('sessão adulterada ou vencida cai no login com aviso', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  await pg.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('paulus.sessao')); s.token = s.token.slice(0, -3) + 'AAA'; sessionStorage.setItem('paulus.sessao', JSON.stringify(s)); });
  await pg.reload(); await noForm(pg);
  ok(/venceu|Entre de novo/i.test(await pg.textContent('#lgs')), 'aviso de sessão');
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  await pg.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('paulus.sessao')); s.expira = Date.now() - 1000; sessionStorage.setItem('paulus.sessao', JSON.stringify(s)); });
  await pg.reload(); await noForm(pg);
});
await teste('conta removida no servidor derruba a sessão ao voltar para a aba', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  await fetch(ORIGEM + '/__trocar-contas');
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await noForm(pg); ok(/encerrada|Entre de novo/i.test(await pg.textContent('#lgs')), 'aviso');
});
await teste('sair em uma aba derruba a outra (sessão mantida no aparelho)', async (pg, ctx) => {
  await abrir(pg); await entrar(pg, SENHA, true); await consoleAberto(pg);
  const p2 = await ctx.newPage(); await p2.goto(ORIGEM + '/'); await consoleAberto(p2);
  await pg.click('#sair'); await noForm(p2);
  ok(/outra aba/i.test(await p2.textContent('#lgs')), 'aviso de outra aba');
});
await teste('o Paulus recebe o token e 401 volta ao login', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
  const auth = []; pg.on('request', (r) => { if (r.method() === 'POST' && !/\/(login|sessao)$/.test(r.url())) auth.push(r.headers().authorization || ''); });
  await pg.evaluate((o) => { Paulus.init({ app: 'argo', endpoint: o, conhecimento: [], minIntervaloMs: 0, memoria: false }); return Paulus.perguntar('o que é CRAS?').catch(() => null); }, ORIGEM);
  await pg.waitForTimeout(600);
  ok(auth.length && /^Bearer [\w.-]+$/.test(auth[0]), 'cabeçalho Authorization ausente: ' + JSON.stringify(auth));
  await pg.route('**/', (r) => r.request().method() === 'POST' ? r.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGEM }, body: '{"erro":"Entre para usar o Paulus."}' }) : r.continue());
  await pg.evaluate(() => Paulus.perguntar('o que é CREAS?').catch(() => null));
  await noForm(pg);
});
await teste('bloqueio depois de 5 erros: contagem, campos travados e persiste ao recarregar', async (pg) => {
  await abrir(pg);
  for (let i = 0; i < 5; i++) { await pg.fill('#lgu', 'paulo'); await pg.fill('#lgp', 'errada' + i); await pg.click('#lgb'); await pg.waitForFunction(() => !document.getElementById('lgb').classList.contains('busy') && document.getElementById('lgs').textContent !== 'VERIFICANDO CREDENCIAIS…'); await pg.waitForTimeout(150); if (i < 4) await pg.waitForSelector('#lgb:not([disabled])'); }
  await pg.waitForFunction(() => /BLOQUEADO/.test(document.getElementById('lgs').textContent), null, { timeout: 5000 });
  ok(/Aguarde \d+:\d\d/.test(await pg.textContent('#lgb')), 'contagem no botão'); ok(await pg.isDisabled('#lgb') && await pg.isDisabled('#lgp'), 'campos travados');
  ok(await pg.evaluate(() => !!localStorage.getItem('paulus.bloqueio')), 'bloqueio guardado');
  await pg.reload(); await pg.waitForSelector('#lgu'); await pg.waitForFunction(() => /BLOQUEADO/.test(document.getElementById('lgs').textContent), null, { timeout: 5000 });
  ok(await pg.isDisabled('#lgb'), 'recarregar não pode destravar a tela');
  const r = await pg.evaluate((o) => fetch(o + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'paulo', senha: 'senha-forte-2026' }) }).then((x) => x.status), ORIGEM);
  igual(r, 429, 'servidor também recusa a senha certa durante o bloqueio');
});
await teste('sem rede ao abrir: com sessão guardada segue; sem sessão avisa', async (pg, ctx) => {
  await abrir(pg); await entrar(pg, SENHA, true); await consoleAberto(pg);
  await pg.route('**/sessao', (r) => r.abort()); await pg.reload(); await consoleAberto(pg);
  await pg.click('#sair'); await noForm(pg);
  await pg.unroute('**/sessao'); await pg.route('**/sessao', (r) => r.abort()); await pg.reload();
  await pg.waitForSelector('#lgu:not([disabled])'); ok(/SEM CONEX/i.test(await pg.textContent('#lgs')), 'aviso de conexão');
});
await teste('falha de rede ou erro 500 ao entrar: mensagem clara e tela segue usável', async (pg) => {
  await abrir(pg);
  await pg.route('**/login', (r) => r.abort()); await entrar(pg);
  await pg.waitForFunction(() => /SEM CONEX/i.test(document.getElementById('lgs').textContent)); ok(await pg.isEnabled('#lgb'), 'botão volta');
  await pg.unroute('**/login'); await pg.route('**/login', (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGEM }, body: '{}' }));
  await entrar(pg); await pg.waitForFunction(() => /falhou \(500\)/.test(document.getElementById('lgs').textContent));
  await pg.unroute('**/login'); await entrar(pg); await consoleAberto(pg);
});
await teste('ícone reage ao mouse, ao toque e à digitação sem erros', async (pg) => {
  await abrir(pg);
  await pg.mouse.move(100, 100); await pg.mouse.move(1100, 700, { steps: 8 });
  await pg.click('#lgo', { force: true }); await pg.focus('#lgp'); await pg.keyboard.type('abc', { delay: 30 });
  await pg.click('#lgv'); await pg.waitForTimeout(500);
  ok(await pg.isVisible('#lgform'), 'segue usável');
});
await teste('sem meta de endereço o console abre direto (sem login)', async (pg) => {
  await pg.goto(ORIGEM + '/sem-login.html'); await consoleAberto(pg); await pg.waitForFunction(() => document.getElementById('lg').hidden); ok(!(await pg.isVisible('#lgform')), 'não deveria mostrar login');
});
await teste('"reduzir movimento": funciona e não anima', async (pg) => {
  await abrir(pg); await entrar(pg); await consoleAberto(pg);
}, { reduzido: true });
await teste('celular pequeno (390×520): sem rolagem lateral e botão alcançável', async (pg) => {
  await abrir(pg);
  igual(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'rolagem lateral');
  await pg.locator('#lgb').scrollIntoViewIfNeeded(); const b = await pg.locator('#lgb').boundingBox();
  ok(b && b.y >= 0 && b.y + b.height <= 520 && b.width > 200, 'botão fora da tela: ' + JSON.stringify(b));
  await entrar(pg); await consoleAberto(pg);
}, { viewport: { width: 390, height: 520 } });
await teste('celular em paisagem (740×360)', async (pg) => {
  await abrir(pg); await pg.locator('#lgb').scrollIntoViewIfNeeded(); await entrar(pg); await consoleAberto(pg);
}, { viewport: { width: 740, height: 360 } });

await navegador.close(); servidor.close(); fs.rmSync(site, { recursive: true, force: true });
const falhas = resultados.filter((r) => !r[0]);
console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' testes passaram');
process.exit(falhas.length ? 1 : 0);
