import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoDeDesenho, perfilDaIA } from '../shared/pedido.mjs';
import { montarMensagens, BLOCO_DESENHO } from '../worker/prompt.mjs';
import { APPS } from '../worker/apps.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';

test('pedidoDeDesenho: reconhece pedidos de desenho, esquema e fluxograma', () => {
  for (const t of ['desenhe um fluxograma do atendimento no CRAS', 'faça um desenho de um coração', 'Ilustre o ciclo da violência', 'crie uma imagem vetorial de uma casa', 'draw a poster about community care', 'faça um gráfico com estes dados', 'monte um organograma da equipe', 'preciso de um diagrama do SUAS', 'crie um mapa mental sobre o PAIF', 'esboce um croqui da sala de atendimento', 'faça uma linha do tempo do SUAS', 'desenha um gato']) {
    assert.equal(pedidoDeDesenho(t), true, t);
  }
});

test('pedidoDeDesenho: pergunta comum e "desenho institucional" não viram pedido de imagem', () => {
  for (const t of ['o que é o CRAS?', 'qual o desenho institucional do SUAS?', 'como é o desenho do serviço de convivência?', 'vi uma imagem bonita na parede', 'quanto é 15% de 3200', '']) {
    assert.equal(pedidoDeDesenho(t), false, t);
  }
});

test('habilidade de desenho: ativa em pedidos explícitos, não em menções incidentais', () => {
  const lista = lerTodas();
  const selecionar = (pergunta) => escolherHabilidades(lista, pergunta).filter((h) => h.id === 'paulus-desenho-visual');
  assert.equal(selecionar('crie uma imagem vetorial de uma casa').length, 1);
  assert.equal(selecionar('desenhe um fluxograma do atendimento').length, 1);
  assert.equal(selecionar('vi uma imagem bonita na parede').length, 0);
  const habilidade = lista.find((h) => h.id === 'paulus-desenho-visual');
  assert.ok(habilidade && habilidade.instrucoes.length <= 2200);
  assert.match(habilidade.instrucoes, /acessíveis|acessibilidade/);
  assert.match(habilidade.instrucoes, /não invente valores/i);
});

test('perfilDaIA: desenho ganha espaço grande; resposta comum continua igual', () => {
  assert.equal(perfilDaIA({ modo: 'consulta', comDesenho: true }).max_tokens, 5000);
  assert.equal(perfilDaIA({ modo: 'consulta' }).max_tokens, 900);
  assert.equal(perfilDaIA({ modo: 'saudacao', comDesenho: true }).max_tokens, 160);
  assert.equal(perfilDaIA({ modo: 'x', tema: true, comDesenho: true }).max_tokens, 900);
});

const base = { app: APPS.argo, pagina: '', historico: [], fichas: [], achados: [], suicidio: false };

test('prompt: a regra de desenhar (SVG) só entra quando a pessoa pede desenho', () => {
  const com = montarMensagens({ ...base, pergunta: 'desenhe um fluxograma do atendimento' })[0].content;
  const sem = montarMensagens({ ...base, pergunta: 'o que é o CRAS?' })[0].content;
  assert.ok(com.includes('DESENHOS VETORIAIS (SVG)') && com.includes('Você consegue criar desenhos'), 'sem a regra de desenho');
  assert.ok(!sem.includes('DESENHOS (SVG)'), 'a regra entrou sem pedido');
  assert.match(BLOCO_DESENHO, /foreignObject/);
  assert.match(BLOCO_DESENHO, /viewBox=\"0 0 1000 750\"/);
  assert.match(BLOCO_DESENHO, /Fluxograma:/);
  assert.match(BLOCO_DESENHO, /[Nn]ão invente pontos/);
});

test('prompt: em tema de suicídio a regra de desenho nunca entra', () => {
  const m = montarMensagens({ ...base, suicidio: true, pergunta: 'desenhe uma corda' })[0].content;
  assert.ok(!m.includes('DESENHOS (SVG)'));
});
