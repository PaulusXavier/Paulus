import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoDeDesenho, perfilDaIA } from '../shared/pedido.mjs';
import { montarMensagens, BLOCO_DESENHO } from '../worker/prompt.mjs';
import { APPS } from '../worker/apps.mjs';

test('pedidoDeDesenho: reconhece pedidos de desenho, esquema e fluxograma', () => {
  for (const t of ['desenhe um fluxograma do atendimento no CRAS', 'faça um desenho de um coração', 'Ilustre o ciclo da violência', 'monte um organograma da equipe', 'preciso de um diagrama do SUAS', 'crie um mapa mental sobre o PAIF', 'esboce um croqui da sala de atendimento', 'faça uma linha do tempo do SUAS', 'desenha um gato']) {
    assert.equal(pedidoDeDesenho(t), true, t);
  }
});

test('pedidoDeDesenho: pergunta comum e "desenho institucional" não viram pedido de imagem', () => {
  for (const t of ['o que é o CRAS?', 'qual o desenho institucional do SUAS?', 'como é o desenho do serviço de convivência?', 'quanto é 15% de 3200', '']) {
    assert.equal(pedidoDeDesenho(t), false, t);
  }
});

test('perfilDaIA: desenho ganha espaço grande; resposta comum continua igual', () => {
  assert.ok(perfilDaIA({ modo: 'consulta', comDesenho: true }).max_tokens >= 3000);
  assert.equal(perfilDaIA({ modo: 'consulta' }).max_tokens, 900);
  assert.equal(perfilDaIA({ modo: 'saudacao', comDesenho: true }).max_tokens, 160);
  assert.equal(perfilDaIA({ modo: 'x', tema: true, comDesenho: true }).max_tokens, 900);
});

const base = { app: APPS.argo, pagina: '', historico: [], fichas: [], achados: [], suicidio: false };

test('prompt: a regra de desenhar (SVG) só entra quando a pessoa pede desenho', () => {
  const com = montarMensagens({ ...base, pergunta: 'desenhe um fluxograma do atendimento' })[0].content;
  const sem = montarMensagens({ ...base, pergunta: 'o que é o CRAS?' })[0].content;
  assert.ok(com.includes('DESENHOS (SVG)') && com.includes('Você PODE desenhar'), 'sem a regra de desenho');
  assert.ok(!sem.includes('DESENHOS (SVG)'), 'a regra entrou sem pedido');
  assert.match(BLOCO_DESENHO, /foreignObject/);
});

test('prompt: em tema de suicídio a regra de desenho nunca entra', () => {
  const m = montarMensagens({ ...base, suicidio: true, pergunta: 'desenhe uma corda' })[0].content;
  assert.ok(!m.includes('DESENHOS (SVG)'));
});
