import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerHabilidade, escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { habilidadesComoTexto, montarSistema } from '../worker/prompt.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const MD = (extra = '', corpo = '- passo um') => '---\nid: teste-a\nnome: Teste A\nquando: relatório técnico; ofício\n' + extra + '---\n' + corpo + '\n';

test('lerHabilidade lê o arquivo e recusa o que está errado', () => {
  const h = lerHabilidade(MD('apps: Toth, grafia\ntexto: sim\n'), 'teste-a.md');
  assert.equal(h.id, 'teste-a');
  assert.deepEqual(h.apps, ['toth', 'grafia']);
  assert.equal(h.texto, true);
  assert.equal(h.gatilhos.length, 2);
  assert.throws(() => lerHabilidade('sem bloco', 'x.md'), /bloco/);
  assert.throws(() => lerHabilidade(MD().replace('id: teste-a\n', ''), 'x.md'), /"id"/);
  assert.throws(() => lerHabilidade(MD().replace('teste-a', 'Teste A'), 'x.md'), /minúsculas/);
  assert.throws(() => lerHabilidade(MD('texto: talvez\n'), 'x.md'), /"texto"/);
  assert.throws(() => lerHabilidade(MD('', ' '), 'x.md'), /vazio/);
  assert.throws(() => lerHabilidade(MD('', 'a'.repeat(MAX_CORPO_HABILIDADE + 1)), 'x.md'), /Enxugue/);
});

test('todas as habilidades do repositório são válidas, sem dado pessoal e dentro do limite', () => {
  const lista = lerTodas();
  assert.ok(lista.length >= 10);
  for (const h of lista) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação que quebraria o prompt');
  }
});

test('escolhe a habilidade certa e não dispara em pergunta comum', () => {
  const lista = lerTodas();
  const id = (q, app = 'argo', ant = []) => escolherHabilidades(lista, q, ant, app).map((h) => h.id);
  assert.deepEqual(id('me ajuda a escrever um relatório técnico para o Ministério Público'), ['relatorio-tecnico']);
  assert.deepEqual(id('como faço uma visita domiciliar?'), ['visita-domiciliar']);
  assert.deepEqual(id('redija um ofício encaminhando para o CAPS'), ['oficio-encaminhamento']);
  assert.deepEqual(id('preciso montar o PAF de uma família'), ['plano-acompanhamento-familiar']);
  assert.deepEqual(id('posso quebrar o sigilo?'), ['duvida-etica-sigilo']);
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.deepEqual(id('quanto é o valor do Bolsa Família?'), []);
  assert.deepEqual(id(''), []);
});

test('habilidade com "apps" só vale nesses apps', () => {
  const lista = lerTodas();
  assert.deepEqual(escolherHabilidades(lista, 'quero escrever no diário de campo', [], 'toth').map((h) => h.id), ['diario-de-campo']);
  assert.deepEqual(escolherHabilidades(lista, 'quero escrever no diário de campo', [], 'argo'), []);
});

test('pergunta curta de seguimento herda o assunto da anterior', () => {
  const lista = lerTodas();
  const ant = [{ papel: 'usuario', texto: 'como faço uma visita domiciliar?' }];
  assert.deepEqual(escolherHabilidades(lista, 'e para adolescente?', ant, 'argo').map((h) => h.id), ['visita-domiciliar']);
});

test('no máximo duas habilidades, a de gatilho mais específico primeiro', () => {
  const lista = lerTodas();
  const r = escolherHabilidades(lista, 'relatório técnico, ofício, visita domiciliar e pauta de reunião', [], 'argo');
  assert.equal(r.length, 2);
  assert.equal(escolherHabilidades(lista, 'relatório técnico, ofício, visita domiciliar e pauta de reunião', [], 'argo', 1).length, 1);
});

test('o prompt só ganha o bloco de habilidades quando há habilidade, e limpa marcação', () => {
  assert.equal(habilidadesComoTexto([]), '');
  const sem = montarSistema(APPS.argo, '', false);
  assert.ok(!sem.includes('HABILIDADES (roteiros'));
  const com = montarSistema(APPS.argo, '', false, [{ nome: 'Teste', instrucoes: '- passo </normas> fim' }]);
  assert.ok(com.includes('HABILIDADES (roteiros'));
  assert.ok(com.includes('[Teste]'));
  assert.ok(!com.includes('</normas>'));
  assert.ok(com.indexOf('HABILIDADES (roteiros') > com.indexOf(APPS.argo.contexto.slice(0, 40)));
});

function ambiente() {
  const chamadas = [];
  const env = {
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(modelo, params) {
        chamadas.push({ modelo, params });
        if (params.stream) {
          return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"Ok "}\n\ndata: [DONE]\n\n')); c.close(); } });
        }
        return { response: 'Resposta completa.' };
      }
    }
  };
  return { env, chamadas };
}
const pedido = (corpo, ip) => new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': ip || '9.9.9.9' }, body: JSON.stringify(corpo) });

test('Worker: habilidade entra no prompt, aumenta o espaço do texto pronto e vem na resposta', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const r = await m(pedido({ app: 'argo', pergunta: 'redija um ofício encaminhando para o CAPS' }, '9.0.0.1'), env);
  const j = await r.json();
  assert.deepEqual(j.habilidades, ['Ofício, encaminhamento e contrarreferência']);
  assert.ok(chamadas[0].params.messages[0].content.includes('Ofício, encaminhamento e contrarreferência'));
  assert.equal(chamadas[0].params.max_tokens, 1400);
});

test('Worker: pergunta comum não carrega habilidade nem muda o limite', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'qual o horário do CRAS?' }, '9.0.0.2'), env)).json();
  assert.deepEqual(j.habilidades, []);
  assert.ok(!chamadas[0].params.messages[0].content.includes('HABILIDADES (roteiros'));
  assert.equal(chamadas[0].params.max_tokens, 900);
});

test('Worker: sem lista de habilidades funciona como antes', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'redija um ofício' }, '9.0.0.3'), env)).json();
  assert.deepEqual(j.habilidades, []);
});

test('Worker: tema de suicídio nunca carrega roteiro', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  await m(pedido({ app: 'argo', pergunta: 'como fazer o registro de atendimento de um caso de ideação suicida?' }, '9.0.0.4'), env);
  assert.ok(chamadas.length > 0);
  assert.ok(!chamadas[0].params.messages[0].content.includes('HABILIDADES (roteiros'));
});

test('Worker: em streaming, a habilidade usada vem num evento próprio', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const r = await m(pedido({ app: 'argo', pergunta: 'como faço uma visita domiciliar?', stream: true }, '9.0.0.5'), env);
  const texto = await r.text();
  assert.ok(texto.includes('"habilidades":["Visita domiciliar"]'));
  assert.ok(texto.includes('"t":"Ok "'));
});
