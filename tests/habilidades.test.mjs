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

test('condicionalidades: cada pergunta chama a habilidade certa, e a visão geral junto quando cabe', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'anona').map((h) => h.id);
  const casos = [
    ['família em descumprimento de condicionalidade', 'condicionalidades-pbf'],
    ['o benefício foi bloqueado, o que fazer?', 'condicionalidades-pbf'],
    ['o bolsa família da família foi suspenso', 'condicionalidades-pbf'],
    ['como fazer recurso no Sicon', 'condicionalidades-recurso'],
    ['como pedir a interrupção temporária dos efeitos', 'condicionalidades-recurso'],
    ['escrever o relatório para recurso do bolsa família', 'condicionalidades-recurso'],
    ['a criança está com a vacina atrasada no bolsa família', 'condicionalidades-saude'],
    ['gestante sem pré-natal registrado no bolsa família', 'condicionalidades-saude'],
    ['ofício para a UBS sobre pesagem das crianças', 'condicionalidades-saude'],
    ['baixa frequência escolar no Bolsa Família', 'condicionalidades-educacao'],
    ['criança fora da escola, família no bolsa família', 'condicionalidades-educacao'],
    ['o que é o sistema presença?', 'condicionalidades-educacao'],
    ['ofício para a escola sobre frequência', 'condicionalidades-educacao'],
    ['o cadastro está desatualizado e o benefício foi bloqueado', 'condicionalidades-cadastro'],
    ['o que é a ação de qualificação cadastral?', 'condicionalidades-cadastro'],
    ['família indígena no bolsa família com frequência baixa', 'condicionalidades-casos-especiais'],
    ['família quilombola e as condicionalidades do bolsa família', 'condicionalidades-casos-especiais'],
    ['família em situação de rua no bolsa família', 'condicionalidades-casos-especiais'],
    ['como monitorar as condicionalidades no município?', 'condicionalidades-gestao'],
    ['pauta de reunião intersetorial do bolsa família', 'condicionalidades-gestao'],
    ['como explicar o bloqueio para uma família com medo de perder o bolsa família', 'condicionalidades-conversa'],
    ['família reclama do bloqueio, como atender?', 'condicionalidades-conversa'],
    ['família mudou de município, bolsa família', 'condicionalidades-casos'],
    ['adolescente grávida e o bolsa família', 'condicionalidades-casos'],
    ['como inserir no PAIF as famílias em descumprimento', 'condicionalidades-paif'],
    ['como organizar um grupo de famílias em descumprimento', 'condicionalidades-paif'],
    ['para que serve o relatório de repercussão individual?', 'condicionalidades-anona'],
    ['como usar o território volante para dividir por técnico', 'condicionalidades-anona'],
    ['modelo de ofício à escola do bolsa família', 'condicionalidades-modelos'],
    ['preciso de um convite para a acolhida do bolsa família', 'condicionalidades-modelos'],
    ['como consultar o histórico no Sicon', 'condicionalidades-sicon'],
    ['a renda aumentou, a família perde o bolsa família?', 'bolsa-familia-regra-protecao'],
    ['o que é o retorno garantido?', 'bolsa-familia-regra-protecao']
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  assert.deepEqual(id('qual o valor do Bolsa Família em outubro?'), []);
  assert.deepEqual(id('quem tem direito ao Bolsa Família?'), []);
  // "Bolsa Família" + "acompanha" não pode puxar o roteiro do PAF.
  assert.ok(!id('Quem acompanha a vacina e o pré-natal no Bolsa Família?').includes('plano-acompanhamento-familiar'));
  // nunca mais de duas, e cada uma dentro do limite
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
});

test('PAIF: cada pergunta chama a habilidade certa; condicionalidades, PAF e perguntas comuns seguem como antes', () => {
  const lista = lerTodas();
  const id = (q, app = 'argo') => escolherHabilidades(lista, q, [], app).map((h) => h.id);
  const casos = [
    ['o que é o PAIF?', 'paif'],
    ['quais os objetivos do PAIF?', 'paif'],
    ['como fazer a acolhida particularizada no PAIF', 'paif-acolhida'],
    ['o que é o prontuário da família?', 'paif-acolhida'],
    ['como fazer o estudo social', 'paif-acolhida'],
    ['qual a diferença entre atendimento e acompanhamento?', 'paif-acompanhamento-familiar'],
    ['quando encerrar o acompanhamento familiar', 'paif-acompanhamento-familiar'],
    ['como planejar uma oficina com famílias', 'paif-oficinas-familias'],
    ['como organizar uma ação comunitária no território', 'paif-acoes-comunitarias'],
    ['preciso fazer uma campanha socioeducativa', 'paif-acoes-comunitarias'],
    ['quais os papéis na equipe do PAIF?', 'paif-equipe-gestao'],
    ['o que é o RMA?', 'paif-equipe-gestao'],
    ['qual a diferença entre PAIF e PAEFI?', 'paif-rede-articulacao'],
    ['como funciona a contrarreferência do PAIF com o CREAS', 'paif-rede-articulacao'],
    ['quem tem prioridade no PAIF?', 'paif-prioridades-busca-ativa'],
    ['busca ativa no PAIF em comunidade indígena', 'paif-prioridades-busca-ativa'],
    ['como orientar uma família sobre o BPC no PAIF', 'paif-bpc-idosos-deficiencia'],
    ['como montar um grupo de cuidadores', 'paif-bpc-idosos-deficiencia'],
    ['como funcionam os benefícios eventuais?', 'paif-beneficios-eventuais'],
    ['o que fazer em uma calamidade no CRAS', 'paif-beneficios-eventuais'],
    ['o que é pedagogia problematizadora?', 'paif-metodologia'],
    ['como usar temas geradores no grupo', 'paif-metodologia'],
    ['o que faz o psicólogo no PAIF?', 'paif-psicologia'],
    ['o que é o Criança Feliz?', 'paif-primeira-infancia'],
    ['como atender gestantes no PAIF', 'paif-primeira-infancia'],
    ['como trabalhar o PAIF com comunidade quilombola', 'paif-populacoes-tradicionais'],
    ['PAIF em território indígena', 'paif-populacoes-tradicionais'],
    ['modelo de convite para oficina', 'paif-modelos-texto'],
    ['modelo de relatório de encerramento do acompanhamento', 'paif-modelos-texto'],
    ['como avaliar o PAF?', 'paif-avaliacao-monitoramento'],
    ['quais indicadores do PAIF?', 'paif-avaliacao-monitoramento'],
    ['o que é matricialidade sociofamiliar?', 'paif-familia-genero-diversidade'],
    ['como incluir homens no PAIF', 'paif-familia-genero-diversidade'],
    ['família com transtorno mental no PAIF', 'paif-saude-mental'],
    ['como encaminhar para o CAPS no PAIF', 'paif-saude-mental'],
    ['como inserir no PAIF as famílias em descumprimento', 'condicionalidades-paif']
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
  assert.deepEqual(id('preciso montar o PAF de uma família'), ['plano-acompanhamento-familiar']);
  assert.deepEqual(id('como faço uma visita domiciliar?'), ['visita-domiciliar']);
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.deepEqual(id('quanto é o valor do Bolsa Família?'), []);
});

test('PAIF: as habilidades do PAIF não citam número de lei nem artigo e dizem "este guia recomenda" onde há número de guia', () => {
  const paif = lerTodas().filter((h) => h.id === 'paif' || h.id.startsWith('paif-'));
  assert.ok(paif.length >= 18);
  for (const h of paif) assert.ok(!/\b(art\.?|artigo|lei n|resolução)\b/i.test(h.instrucoes), h.id);
  const acomp = paif.find((h) => h.id === 'paif-acompanhamento-familiar');
  assert.ok(/este guia recomenda/i.test(acomp.instrucoes) && /NÃO é norma/.test(acomp.instrucoes));
});

test('habilidade do Anona só vale no Anona', () => {
  const lista = lerTodas();
  const q = 'para que serve o relatório de repercussão individual?';
  assert.ok(escolherHabilidades(lista, q, [], 'anona').some((h) => h.id === 'condicionalidades-anona'));
  assert.ok(!escolherHabilidades(lista, q, [], 'argo').some((h) => h.id === 'condicionalidades-anona'));
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
