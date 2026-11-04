// Comportamento "dinâmico" do Paulus (v0.6.0): o Paulus lê o tipo do pedido e muda busca, prompt e parâmetros da IA;
// confere as citações; e não aprende "oi" nem "mais curto" como pergunta frequente.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { montarMensagens, montarSistema, historicoComoMensagens } from '../worker/prompt.mjs';
import { classificarPedido, consultaDoPedido, ehSaudacao, ehRefinamento, perfilDaIA, trechosParaOPedido } from '../shared/pedido.mjs';
import { numerosCitaveis, citacoesSemFonte, artigosCitados, leisCitadas } from '../shared/verificacao.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { juntar } from '../scripts/build.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const H = [{ papel: 'usuario', texto: 'redija um ofício para o CAPS' }, { papel: 'paulus', texto: 'Segue o ofício: [CAMPOS]' }];

// ------------------------------------------------------------------ classificação do pedido

test('pedido: só cumprimento é saudação; cumprimento com pergunta não é', () => {
  for (const t of ['oi', 'Obrigado!', 'bom dia, tudo bem?', 'valeu', 'ok, entendi']) assert.equal(ehSaudacao(t), true, t);
  for (const t of ['oi, o que é CRAS?', 'obrigado, e o BPC?', 'o que é PAIF', '']) assert.equal(ehSaudacao(t), false, t);
});

test('pedido: ajuste da resposta anterior só vale com resposta anterior e mensagem curta', () => {
  for (const t of ['mais curto', 'deixe mais formal', 'resuma', 'de outro jeito', 'em tópicos', 'com exemplo', 'inclua o horário de atendimento', 'explique melhor']) {
    assert.equal(ehRefinamento(t, H), true, t);
    assert.equal(ehRefinamento(t, []), false, t + ' sem resposta anterior');
  }
  // perguntas novas que começam parecido NÃO são ajuste
  for (const t of ['explique o PAIF', 'resumo da LOAS', 'passo a passo do estudo social', 'como funciona o BPC?']) assert.equal(ehRefinamento(t, H), false, t);
  assert.equal(ehRefinamento('reescreva o ofício para o CAPS AD III informando que a família mudou de endereço e precisa de vaga prioritária urgente', H), false, 'tarefa nova e longa');
});

test('pedido: seguimento depende da conversa; pergunta com sigla própria do SUAS se sustenta sozinha', () => {
  assert.equal(classificarPedido('e para adolescente?', H), 'seguimento');
  assert.equal(classificarPedido('e o horário?', H), 'seguimento');
  assert.equal(classificarPedido('isso vale para indígenas?', H), 'seguimento');
  assert.equal(classificarPedido('como funciona o BPC?', H), 'normal');
  assert.equal(classificarPedido('o que é o PAIF?', H), 'normal');
  assert.equal(classificarPedido('e para adolescente?', []), 'normal', 'sem conversa não há de que depender');
  assert.equal(classificarPedido('qual o telefone do CRAS Cauamé?', H, { temFichas: true }), 'consulta');
});

test('pedido: a busca herda o assunto, pula "oi" e "mais curto" e segue a cadeia de seguimentos', () => {
  assert.equal(consultaDoPedido('mais curto', H, 'refinamento'), 'redija um ofício para o CAPS');
  const cadeia = [
    { papel: 'usuario', texto: 'quem tem direito ao BPC?' }, { papel: 'paulus', texto: 'x' },
    { papel: 'usuario', texto: 'e para idoso?' }, { papel: 'paulus', texto: 'y' },
    { papel: 'usuario', texto: 'mais curto' }, { papel: 'paulus', texto: 'z' },
    { papel: 'usuario', texto: 'obrigado' }, { papel: 'paulus', texto: 'por nada' }
  ];
  assert.equal(consultaDoPedido('e para pessoa com deficiência?', cadeia, 'seguimento'), 'quem tem direito ao BPC? e para idoso? e para pessoa com deficiência?');
  assert.equal(consultaDoPedido('mais formal', cadeia, 'refinamento'), 'quem tem direito ao BPC? e para idoso?');
  assert.equal(consultaDoPedido('o que é o PAIF?', cadeia, 'normal'), 'o que é o PAIF?');
});

test('pedido: parâmetros por situação mantêm os de rotina e mudam só o que precisa', () => {
  assert.deepEqual(perfilDaIA({ modo: 'normal' }), { max_tokens: 900, temperature: 0.4 });
  assert.deepEqual(perfilDaIA({ modo: 'normal', comTextoPronto: true }), { max_tokens: 1400, temperature: 0.5 });
  assert.equal(perfilDaIA({ modo: 'normal', pref: { tamanho: 'curto' } }).max_tokens, 500);
  assert.equal(perfilDaIA({ modo: 'consulta' }).temperature, 0.2);
  assert.equal(perfilDaIA({ modo: 'refinamento' }).max_tokens, 1200);
  assert.equal(perfilDaIA({ modo: 'saudacao' }).max_tokens, 160);
  assert.equal(perfilDaIA({ modo: 'refinamento', tema: true }).max_tokens, 900, 'tema de suicídio segue o protocolo');
  assert.equal(trechosParaOPedido('saudacao', 'oi', 4), 0);
  assert.equal(trechosParaOPedido('refinamento', 'mais curto', 4), 3);
  assert.equal(trechosParaOPedido('normal', 'qual a diferença entre atendimento e acompanhamento familiar no PAIF?', 4), 5);
  assert.equal(trechosParaOPedido('normal', 'o que é CRAS?', 4), 4);
});

// ------------------------------------------------------------------ Worker

function ambiente(extra = {}) {
  const chamadas = [];
  const env = Object.assign({
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(modelo, params) {
        chamadas.push({ modelo, params });
        if (params.stream) return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"Ok "}\n\ndata: {"response":"feito."}\n\ndata: [DONE]\n\n')); c.close(); } });
        return { response: 'Resposta completa.' };
      }
    }
  }, extra);
  return { env, chamadas };
}
let ipN = 0;
const pedido = (corpo) => new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': '8.8.' + Math.floor(++ipN / 200) + '.' + (ipN % 200) }, body: JSON.stringify(corpo) });
const sistemaDe = (c) => c.params.messages[0].content;

test('Worker: cumprimento usa prompt mínimo, modelo pequeno, nenhuma norma e resposta curta', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const j = await (await m(pedido({ app: 'toth', pergunta: 'bom dia!' }), env)).json();
  assert.equal(j.resposta, 'Resposta completa.');
  assert.deepEqual(j.fontes, []);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].modelo, '@cf/meta/llama-3.1-8b-instruct');
  assert.equal(chamadas[0].params.max_tokens, 160);
  assert.ok(sistemaDe(chamadas[0]).length < 1500, 'prompt mínimo');
  assert.ok(!/<normas>/.test(chamadas[0].params.messages.map(x => x.content).join('')));
});

test('Worker: cumprimento cai no modelo grande se o pequeno falhar', async () => {
  const usados = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(modelo) { usados.push(modelo); if (usados.length === 1) throw new Error('cota'); return { response: 'Oi!' }; } } };
  const m = criarManipulador({ base, apps: APPS });
  assert.equal((await m(pedido({ app: 'argo', pergunta: 'oi' }), env)).status, 200);
  assert.deepEqual(usados, ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
});

test('Worker: "mais curto" reescreve a última resposta inteira, com o assunto anterior na busca e sem botões', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const longa = 'Texto do ofício. '.repeat(120); // ~2000 caracteres
  await m(pedido({
    app: 'argo', pergunta: 'mais curto', acoes: [{ id: 'mapa', rotulo: 'Mapa' }],
    historico: [{ papel: 'usuario', texto: 'redija um ofício encaminhando para o CAPS' }, { papel: 'paulus', texto: longa }]
  }), env);
  const c = chamadas[0];
  assert.match(sistemaDe(c), /AJUSTE DA RESPOSTA ANTERIOR/);
  assert.ok(!/AÇÕES NO APP \(viram botões/.test(sistemaDe(c)));
  assert.equal(c.params.max_tokens, 1400, 'o roteiro de ofício (texto pronto) continua valendo no ajuste');
  const anterior = c.params.messages.filter(x => x.role === 'assistant')[0].content;
  assert.ok(anterior.length > 1900, 'a resposta anterior vai inteira, não cortada em 1200');
  assert.ok(sistemaDe(c).includes('Ofício, encaminhamento e contrarreferência'), 'a habilidade do turno anterior continua');
});

test('Worker: ajuste sem texto pronto usa 1200 tokens e temperatura intermediária', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'argo', pergunta: 'de outro jeito', historico: [{ papel: 'usuario', texto: 'o que é o CRAS?' }, { papel: 'paulus', texto: 'É a porta de entrada.' }] }), env);
  assert.equal(chamadas[0].params.max_tokens, 1200);
  assert.equal(chamadas[0].params.temperature, 0.45);
  assert.match(chamadas[0].params.messages.at(-1).content, /<normas>\n1\./, 'buscou pelo assunto anterior (o que é o CRAS), não por "de outro jeito"');
});

test('Worker: seguimento herda o assunto na busca de normas', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'argo', pergunta: 'e para idoso?', historico: [{ papel: 'usuario', texto: 'quem tem direito ao BPC?' }, { papel: 'paulus', texto: 'Idosos e pessoas com deficiência.' }] }), env);
  const usuario = chamadas[0].params.messages.at(-1).content;
  assert.match(usuario, /Benef[ií]cio de Presta[cç][aã]o Continuada|prestação continuada/i);
});

test('Worker: consulta de unidade (com fichas) usa temperatura baixa e as regras completas de território; sem fichas, a versão curta', async () => {
  const a = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'argo', pergunta: 'qual o telefone do CRAS Cauamé?', fichas: [{ nome: 'CRAS Cauamé', telefones: '(95) 3623-0000' }] }), a.env);
  assert.equal(a.chamadas[0].params.temperature, 0.2);
  assert.match(sistemaDe(a.chamadas[0]), /TERRITÓRIO: para "qual CRAS/);

  const b = ambiente();
  await m(pedido({ app: 'toth', pergunta: 'como estruturar o registro de um atendimento?' }), b.env);
  assert.equal(b.chamadas[0].params.temperature, 0.4);
  assert.doesNotMatch(sistemaDe(b.chamadas[0]), /TERRITÓRIO: para "qual CRAS/);
  assert.match(sistemaDe(b.chamadas[0]), /NUNCA invente endereço, telefone/, 'o rigor com fatos continua na versão curta');
  assert.ok(sistemaDe(b.chamadas[0]).length < sistemaDe(a.chamadas[0]).length + 4000);
});

test('Worker: resposta vazia do modelo principal tenta o modelo reserva', async () => {
  const usados = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(modelo) { usados.push(modelo); return usados.length === 1 ? { response: '' } : { response: 'Agora foi.' }; } } };
  const m = criarManipulador({ base, apps: APPS });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'o que é o CRAS?' }), env)).json();
  assert.equal(j.resposta, 'Agora foi.');
  assert.equal(usados.length, 2);
});

test('Worker: devolve os artigos e leis que a IA leu (citaveis), em JSON e em streaming', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'quem tem direito ao BPC?' }), env)).json();
  assert.ok(j.citaveis && Array.isArray(j.citaveis.a) && Array.isArray(j.citaveis.l));
  assert.ok(j.citaveis.a.length > 0, 'a LOAS está na base e tem artigos');
  const sse = await (await m(pedido({ app: 'argo', pergunta: 'quem tem direito ao BPC?', stream: true }), env)).text();
  assert.match(sse, /"citaveis":\{"a":\[/);
});

test('prompt: histórico mantém a última resposta maior só quando pedido', () => {
  const h = [{ papel: 'usuario', texto: 'a' }, { papel: 'paulus', texto: 'x'.repeat(2500) }, { papel: 'usuario', texto: 'b' }, { papel: 'paulus', texto: 'y'.repeat(2500) }];
  const normal = historicoComoMensagens(h);
  assert.equal(normal.filter(x => x.role === 'assistant').map(x => x.content.length).join(), '1200,1200');
  const ajuste = historicoComoMensagens(h, { maxUltimaResposta: 3000 });
  assert.equal(ajuste.filter(x => x.role === 'assistant').map(x => x.content.length).join(), '1200,2500');
  assert.equal(historicoComoMensagens(h, { maxUltimaResposta: 99999 }).filter(x => x.role === 'assistant')[1].content.length, 2500, 'teto absoluto de 3000');
});

test('prompt: tema de suicídio nunca recebe o bloco de ajuste nem roteiro', () => {
  const msgs = montarMensagens({ app: APPS.argo, achados: [], pergunta: 'mais curto', suicidio: true, modo: 'refinamento' });
  assert.doesNotMatch(msgs[0].content, /AJUSTE DA RESPOSTA ANTERIOR/);
  assert.match(montarSistema(APPS.argo, '', false, [], { modo: 'refinamento' }), /AJUSTE DA RESPOSTA ANTERIOR/);
});

// ------------------------------------------------------------------ conferência de citações

test('verificação: acha artigos e leis citados, em várias formas', () => {
  assert.deepEqual([...artigosCitados('Veja o art. 20, os arts. 17 e 18, o Art. 5º e o artigo 203.')].sort(), ['17', '18', '20', '203', '5']);
  assert.deepEqual([...leisCitadas('Lei nº 8.742/1993, Decreto 7.053 e Resolução CFP nº 06/2019. Lei Maria da Penha. A lei de 1993.').keys()].sort(), ['decreto 7053', 'lei 8742', 'resolucao 6']);
});

test('verificação: citação que a IA não leu vira aviso; a que leu, não', () => {
  const achados = [{ trecho: { referencia: 'art. 20, § 3º', titulo: 'LOAS', norma: 'Lei nº 8.742, de 7 de dezembro de 1993', texto: 'Art. 20. O benefício de prestação continuada...' } }];
  const c = numerosCitaveis(achados);
  assert.deepEqual(citacoesSemFonte('Pelo art. 20 da Lei 8.742, a renda é a do § 3º.', c), []);
  assert.deepEqual(citacoesSemFonte('Pelo art. 99 e pela Lei 12.435/2011.', c), ['art. 99', 'Lei 12.435']);
  assert.deepEqual(citacoesSemFonte('Pelo art. 20 e pelo art. 99.', c, [], ['Na resposta anterior citei o art. 99.']), [], 'o que já foi visto na conversa não avisa de novo');
  assert.deepEqual(citacoesSemFonte('Sem citação, só o período 2023-2026.', c), []);
  // sem "citaveis" (Worker antigo): usa as fontes que vieram
  assert.deepEqual(citacoesSemFonte('art. 20 e art. 50', null, [{ referencia: 'art. 20', norma: 'Lei 8.742' }]), ['art. 50']);
});

// ------------------------------------------------------------------ navegador

function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}
function fetchComWorker(resposta) {
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { return new ReadableStream({ start(c) { for (const p of resposta.split(' ')) c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ response: p + ' ' }) + '\n\n')); c.close(); } }); } } };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => manipular(new Request(url, { method: init.method, headers: { ...init.headers, Origin: ORIGEM, 'CF-Connecting-IP': '7.7.7.' + (++ipN % 200) }, body: init.body }), env);
}
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';

test('navegador: avisa quando a IA cita artigo que não estava nas normas consultadas', async () => {
  const P = carregar(fetchComWorker('Pelo art. 9999 da Lei 77.777 isso é obrigatório.'));
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, minIntervaloMs: 0, memoria: false });
  const r = await P.perguntar('quem tem direito ao BPC?', {});
  assert.equal(r.tipo, 'ia');
  assert.ok(r.avisos.some(a => /art\. 9999/.test(a) && /Lei 77\.777/.test(a)), r.avisos.join('|'));
});

test('navegador: cumprimento e ajuste não viram "perguntas frequentes"', async () => {
  const P = carregar(fetchComWorker('Oi! Posso ajudar com o SUAS.'));
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, minIntervaloMs: 0 });
  await P.perguntar('oi');
  await P.perguntar('oi');
  await P.perguntar('o que é o CRAS?');
  await P.perguntar('o que é o CRAS?');
  const freq = P.memoria.frequentes(10).map(x => x.texto.toLowerCase());
  assert.ok(!freq.includes('oi'), 'oi não é pergunta frequente: ' + freq.join('|'));
  assert.ok(freq.some(t => /cras/.test(t)));
});

test('navegador: sem IA, "mais curto" não devolve um trecho de norma aleatório', async () => {
  const P = carregar(async () => { throw new Error('sem rede'); });
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, minIntervaloMs: 0, memoria: false });
  const hist = [{ papel: 'usuario', texto: 'o que é o CRAS?' }, { papel: 'paulus', texto: 'É a porta de entrada da assistência social.' }];
  const r = await P.perguntar('mais curto', { historico: hist });
  assert.equal(r.tipo, 'sem_resposta');
  assert.match(r.texto, /ajustar/);
});
