import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { juntar } from '../scripts/build.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const ENDPOINT = 'https://paulus-ia.exemplo.workers.dev';

// Carrega o arquivo que vai para o navegador (dist/paulus.v1.js), não os módulos soltos.
function carregar(fetchFalso) {
  const sandbox = { self: {}, fetch: fetchFalso, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

// fetch falso que conversa com o handler do Worker de verdade
function fetchComWorker({ resposta = 'Cabe ao município.', falhar = false, capturas = [] } = {}) {
  const env = {
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(m, params) {
        if (falhar) throw new Error('x');
        const partes = resposta.split(' ').map(p => `data: ${JSON.stringify({ response: p + ' ' })}\n\n`);
        return new ReadableStream({ start(c) { for (const p of partes) c.enqueue(new TextEncoder().encode(p)); c.close(); } });
      }
    }
  };
  const manipular = criarManipulador({ base, apps: APPS });
  return async (url, init) => {
    capturas.push(JSON.parse(init.body));
    const req = new Request(url, { method: init.method, headers: { ...init.headers, Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }, body: init.body });
    return manipular(req, env);
  };
}

const semEspera = { minIntervaloMs: 0 };

test('o arquivo do navegador não tem import/export sobrando', () => {
  const codigo = juntar();
  assert.ok(!/^\s*(import|export)\b/m.test(codigo));
  assert.ok(typeof carregar(async () => { throw new Error('não deveria chamar'); }).init === 'function');
});

test('dado pessoal: bloqueia sem chamar a rede', async () => {
  let chamou = false;
  const P = carregar(async () => { chamou = true; });
  P.init({ app: 'argo', endpoint: ENDPOINT });
  const r = await P.perguntar('A Maria Souza, CPF 123.456.789-09, faltou');
  assert.equal(r.tipo, 'bloqueio');
  assert.equal(chamou, false);
});

test('pedido de socorro: telefones na hora, sem rede', async () => {
  let chamou = false;
  const P = carregar(async () => { chamou = true; });
  P.init({ app: 'argo', endpoint: ENDPOINT });
  const r = await P.perguntar('ela falou em suicídio');
  assert.equal(r.tipo, 'crise');
  assert.ok(r.telefones.length >= 2);
  assert.equal(chamou, false);
});

test('ação "abrir": executa; ação que mexe em dados pede confirmação', async () => {
  const P = carregar(async () => { throw new Error('sem rede'); });
  P.init({ app: 'argo' });
  let aberto = 0, apagado = 0;
  P.registrarAcao({ id: 'mapa', rotulos: ['mapa', 'mapa de unidades'], executar: () => { aberto++; } });
  P.registrarAcao({ id: 'apagar', rotulos: ['apagar notas'], confirmar: true, executar: () => { apagado++; } });

  assert.equal((await P.perguntar('abrir o mapa de unidades')).executada, true);
  assert.equal(aberto, 1);

  const r = await P.perguntar('abrir apagar notas');
  assert.equal(r.pedeConfirmacao, true);
  assert.equal(apagado, 0);
  r.confirmar();
  assert.equal(apagado, 1);

  assert.equal((await P.perguntar('abrir a lua')).tipo, 'acao_desconhecida');
});

test('busca no app roda no aparelho e não usa a rede', async () => {
  let chamou = false;
  const P = carregar(async () => { chamou = true; });
  P.init({ app: 'argo', endpoint: ENDPOINT });
  P.registrarBusca({ id: 'unidades', rotulos: ['unidade'], buscar: q => [{ titulo: 'CRAS Cauamé', detalhe: q }] });
  const r = await P.perguntar('buscar unidade cauame');
  assert.equal(r.tipo, 'busca');
  assert.equal(r.itens.length, 1);
  assert.equal(chamou, false);
});

test('sem IA: responde com a norma da base e cita a fonte', async () => {
  const P = carregar(async () => { throw new Error('sem rede'); });
  P.init({ app: 'argo', conhecimento: base });
  const r = await P.perguntar('Quem gere o Cadastro Único no município?');
  assert.equal(r.tipo, 'norma');
  assert.ok(r.fontes.some(f => f.referencia === 'art. 17, XV'));
  const nada = await P.perguntar('receita de bolo de cenoura');
  assert.equal(nada.tipo, 'sem_resposta');
});

test('com IA: streaming, fontes e histórico; envia só os campos combinados', async () => {
  const capturas = [];
  const P = carregar(fetchComWorker({ capturas }));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, fichas: () => [{ nome: 'CRAS Cauamé', telefones: '95 3623-0000' }] }, semEspera));
  const pedacos = [];
  let fontesRecebidas = null;
  const r = await P.perguntar('Quem gere o Cadastro Único no município?', { aba: 'Mapa', onToken: (t) => pedacos.push(t), onFontes: f => { fontesRecebidas = f; } });
  assert.equal(r.tipo, 'ia');
  assert.equal(r.texto.trim(), 'Cabe ao município.');
  assert.ok(pedacos.length >= 2);
  assert.ok(fontesRecebidas.some(f => f.referencia === 'art. 17, XV'));
  assert.ok(r.avisos[0].includes('IA'));

  assert.deepEqual(Object.keys(capturas[0]).sort(), ['app', 'fichas', 'historico', 'pagina', 'pergunta', 'stream']);

  await P.perguntar('e o prazo?');
  assert.equal(capturas[1].historico.length, 2);
  P.limpar();
  await P.perguntar('e agora?');
  assert.equal(capturas[2].historico.length, 0);
});

test('avisa quando a IA cita telefone que não está nas fichas', async () => {
  const P = carregar(fetchComWorker({ resposta: 'Ligue para (95) 99999-1111 agora' }));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, fichas: () => [{ nome: 'CRAS', telefones: '95 3623-0000' }] }, semEspera));
  const r = await P.perguntar('qual o telefone do CRAS Cauamé?');
  assert.ok(r.avisos.some(a => /telefone/.test(a)));
});

test('se a IA falhar, cai para a base de normas', async () => {
  const P = carregar(fetchComWorker({ falhar: true }));
  P.init(Object.assign({ app: 'argo', endpoint: ENDPOINT, conhecimento: base }, semEspera));
  const r = await P.perguntar('Quem gere o Cadastro Único no município?');
  assert.equal(r.tipo, 'norma');
});

test('limite local de perguntas seguidas', async () => {
  const P = carregar(fetchComWorker());
  P.init({ app: 'argo', endpoint: ENDPOINT, minIntervaloMs: 60000 });
  await P.perguntar('oi, tudo bem?');
  const r = await P.perguntar('e agora, tudo bem?');
  assert.equal(r.tipo, 'erro');
});

test('semAcoes: "mostre ..." vai para a IA em vez de virar ação desconhecida', async () => {
  const capturas = [];
  const P = carregar(fetchComWorker({ capturas }));
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, ...semEspera });
  const r = await P.perguntar('mostre os passos para encaminhar uma gestante', { semAcoes: true });
  assert.equal(r.tipo, 'ia');
  assert.equal(capturas.length, 1);
  const padrao = await P.perguntar('mostre os passos para encaminhar uma gestante');
  assert.equal(padrao.tipo, 'acao_desconhecida');
});

test('o app pode mandar o próprio histórico e as próprias fichas (Argo)', async () => {
  const capturas = [];
  const P = carregar(fetchComWorker({ capturas }));
  P.init({ app: 'argo', endpoint: ENDPOINT, conhecimento: base, ...semEspera });
  const fichas = [{ nome: 'CRAS Teste', grupo: 'CRAS', endereco: 'Rua A', horario: '8h-14h', telefones: '(95) 3000-0000', servicos: 'PAIF' }];
  const historico = [{ papel: 'usuario', texto: 'qual o CRAS do bairro?' }, { papel: 'argo', texto: 'O CRAS Teste atende o bairro.' }];
  const r = await P.perguntar('e o horário?', { semAcoes: true, fichas, historico });
  assert.equal(r.tipo, 'ia');
  assert.equal(capturas[0].fichas[0].nome, 'CRAS Teste');
  assert.deepEqual(capturas[0].historico.map(h => h.papel), ['usuario', 'argo']);
  // o histórico interno do Paulus não é usado nem alimentado quando o app manda o dele
  await P.perguntar('outra pergunta qualquer sobre o SUAS', { semAcoes: true, fichas: [], historico: [] });
  assert.deepEqual(capturas[1].historico, []);
});
