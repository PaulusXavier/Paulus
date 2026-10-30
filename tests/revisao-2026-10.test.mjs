// Regressões da revisão de outubro/2026: cada caso aqui foi um defeito encontrado e corrigido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { expandirBase } from '../shared/base-compacta.mjs';

test('pii: e-mail é detectado em tempo linear (texto grande sem espaço não trava)', () => {
  const t0 = Date.now();
  assert.equal(temDadoPessoal('a'.repeat(60000)), false);
  assert.equal(temDadoPessoal('a-'.repeat(30000)), false);
  assert.equal(temDadoPessoal('<a'.repeat(30000)), false);
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  for (const e of ['joao.silva@gmail.com', 'escreva para a@b.com.br, por favor', 'fulano@sub.dominio.org']) assert.equal(temDadoPessoal(e), true, e);
  for (const n of ['x@y', '@a.com', 'a @ b.com', 'oi a@b.c']) assert.equal(temDadoPessoal(n), false, n);
});

test('pii: telefone fixo de 8 dígitos, com DDD entre parênteses ou rotulado, é dado pessoal', () => {
  for (const t of ['o telefone dela é (95) 3623-1234', 'telefone 3623-1234', 'whatsapp 98123 4567', 'contato: 95 3623 1234', 'fone (95)98123-4567']) assert.equal(temDadoPessoal(t), true, t);
  for (const t of ['o Disque Social é o 121', 'ligue 188', 'o benefício é de 3623 reais', 'a Portaria 1.058 de 2025', 'o ano de 2026-2027']) assert.equal(temDadoPessoal(t), false, t);
});

test('pii: data de nascimento e nome em minúsculas depois de gatilho forte', () => {
  for (const t of ['nasceu em 12/03/2015', 'data de nascimento 12/03/2015 da criança', 'a criança chamada joão pedro faltou', 'o nome dela é maria aparecida souza', 'a menina de nome ana clara mora longe']) assert.equal(temDadoPessoal(t), true, t);
  for (const t of ['a criança chamada para consulta faltou', 'o nome completo é obrigatório no cadastro', 'o usuário chamado de emergência', 'o SUAS nasceu em 2005', 'a lei nasceu em 1993']) assert.equal(temDadoPessoal(t), false, t);
});

test('crise: ideação passiva, meio planejado, autolesão atual e abuso relatado em primeira pessoa', () => {
  const cartao = { 'não quero mais acordar amanhã': 'suicidio', 'melhor eu não estar mais aqui': 'suicidio', 'vou tomar todos os remédios da caixa': 'suicidio',
    'me corto quando fico nervosa': 'suicidio', 'tenho vontade de me machucar': 'suicidio', 'penso em atirar em mim': 'suicidio', 'su1c1dio': 'suicidio', 'meu pai abusa de mim': 'violencia' };
  for (const [t, sub] of Object.entries(cartao)) { const r = detectarCrise(t); assert.ok(r, t); assert.equal(r.subtipo, sub, t); }
  // não pode virar alarme em frase de trabalho
  for (const t of ['me corto com a faca quando cozinho', 'qual o prazo do recurso?', 'o CRAS 3 atende às 8h', 'a meta de 2026 foi batida', 'como funciona o PAEFI para vítimas de abuso sexual?']) assert.equal(detectarCrise(t), null, t);
});

test('worker: histórico malformado não derruba o Worker e exceção vira 500 em JSON com CORS', async () => {
  const R = new URL('../knowledge/', import.meta.url);
  const base = expandirBase(JSON.parse(readFileSync(new URL('worker-base.json', R), 'utf8')));
  const env = { ALLOWED_ORIGINS: 'https://x.io', AI: { run: async () => ({ response: 'ok' }) } };
  const h = criarManipulador({ base, apps: APPS });
  const pedir = (corpo, e) => h(new Request('https://w.dev/', { method: 'POST', headers: { Origin: 'https://x.io', 'CF-Connecting-IP': '9.9.9.' + Math.floor(Math.random() * 250) }, body: JSON.stringify(corpo) }), e || env);
  const r1 = await pedir({ pergunta: 'o que é o PAIF?', historico: [{ papel: 'assistente', texto: { toString: 1 } }, null, 5, { papel: 'usuario', texto: 'x'.repeat(30000) }] });
  assert.equal(r1.status, 200);
  const r2 = await pedir({ pergunta: 'o que é o PAIF?' }, { ALLOWED_ORIGINS: 'https://x.io', AI: { run: () => { throw new TypeError('boom'); } } });
  assert.ok([200, 502].includes(r2.status));
  // exceção inesperada (aqui: a leitura do corpo falha): precisa virar 500 em JSON COM o CORS do app
  const falso = { method: 'POST', headers: new Headers({ Origin: 'https://x.io' }), text: async () => { throw new Error('boom'); } };
  const r3 = await h(falso, env);
  assert.equal(r3.status, 500);
  assert.equal(r3.headers.get('Access-Control-Allow-Origin'), 'https://x.io');
  assert.equal(typeof (await r3.json()).erro, 'string');
});

test('pii: nome em CAIXA ALTA pega; sigla e instituição em caixa alta não', () => {
  for (const t of ['MARIA DA SILVA recebe bolsa', 'JOAO PEDRO faltou ontem', 'o nome dela é MARIA APARECIDA']) assert.equal(temDadoPessoal(t), true, t);
  for (const t of ['BOLSA FAMILIA RECEBE REAJUSTE', 'O CRAS ATENDE AS FAMILIAS', 'PAIF E PAEFI SAO SERVICOS DO SUAS', 'QUAL O PRAZO DO RECURSO NO SICON?']) assert.equal(temDadoPessoal(t), false, t);
});

test('crise: erro de digitação em "matar" e "suicídio" (sem alarme falso em palavras vizinhas)', () => {
  for (const t of ['eu quero me mattar', 'vou me matr', 'pensando em suisidio', 'ele falou em sucidio']) assert.ok(detectarCrise(t), t);
  for (const t of ['preciso me portar bem na reunião', 'vou me mudar para o centro', 'quero correr de manhã', 'o prazo vai se encerrar', 'me ajuda a montar o relatório']) assert.equal(detectarCrise(t), null, t);
});

test('worker: ficha, baseApp e panorama com dado de pessoa são descartados; telefone e endereço de unidade passam', async () => {
  const { montarMensagens } = await import('../worker/prompt.mjs');
  const R = new URL('../knowledge/', import.meta.url);
  const base = expandirBase(JSON.parse(readFileSync(new URL('worker-base.json', R), 'utf8')));
  let prompt = '';
  const env = { ALLOWED_ORIGINS: 'https://x.io', AI: { run: async (m, p) => { prompt += JSON.stringify(p.messages); return { response: 'ok' }; } } };
  const h = criarManipulador({ base, apps: APPS });
  const corpo = { pergunta: 'qual o telefone do CRAS?', fichas: [
    { nome: 'CRAS Pintolândia', endereco: 'Rua das Flores, 100', telefone: '(95) 3623-0000' },
    { nome: 'CRAS Fake', sobre: 'contato: fulano@mail.com' },
    { nome: 'Caso', sobre: 'a criança chamada joão pedro recebe bolsa' }
  ], baseApp: [{ titulo: 'Valor', texto: 'CPF 123.456.789-01' }], panorama: 'total 10; nome dela é maria souza' };
  const r = await h(new Request('https://w.dev/', { method: 'POST', headers: { Origin: 'https://x.io', 'CF-Connecting-IP': '8.8.8.8' }, body: JSON.stringify(corpo) }), env);
  assert.equal(r.status, 200);
  assert.ok(prompt.includes('Pintol'), 'ficha pública deve passar');
  for (const x of ['fulano@mail.com', 'joão pedro', '123.456.789-01', 'maria souza']) assert.ok(!prompt.includes(x), x);
});

test('worker: usa o limitador global da Cloudflare quando existe (429) e ignora se ele falhar', async () => {
  const R = new URL('../knowledge/', import.meta.url);
  const base = expandirBase(JSON.parse(readFileSync(new URL('worker-base.json', R), 'utf8')));
  const h = criarManipulador({ base, apps: APPS });
  const pedir = env => h(new Request('https://w.dev/', { method: 'POST', headers: { Origin: 'https://x.io', 'CF-Connecting-IP': '7.7.7.7' }, body: JSON.stringify({ pergunta: 'o que é o PAIF?' }) }), env);
  const ia = { run: async () => ({ response: 'ok' }) };
  assert.equal((await pedir({ ALLOWED_ORIGINS: 'https://x.io', AI: ia, LIMITADOR: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal((await pedir({ ALLOWED_ORIGINS: 'https://x.io', AI: ia, LIMITADOR: { limit: async () => { throw new Error('fora do ar'); } } })).status, 200);
});
