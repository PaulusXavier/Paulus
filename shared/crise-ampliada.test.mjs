// Ampliação do detector de crise: relatos que antes passavam direto para o modelo e perguntas gerais que antes
// disparavam o cartão sem ninguém pedir socorro. Cada frase aqui veio de uma lacuna encontrada na revisão do detector.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarCrise, ehPerguntaTecnicaSuicidio } from '../shared/crise.mjs';

const numeros = r => r.telefones.map(t => t.numero);

test('crise: ideação sem a palavra "suicídio" mostra o cartão de suicídio', () => {
  for (const t of [
    'não aguento mais viver assim',
    'não suporto mais essa vida',
    'queria sumir de vez',
    'quero desaparecer para sempre',
    'vou me jogar da ponte',
    'ele disse que vai se jogar do prédio',
    'pensando em me enforcar',
    'minha vida não tem mais sentido',
    'não vejo mais sentido em viver',
    'o usuário falou que vai dar fim à própria vida',
    'seria melhor sem mim',
    'queria estar morta',
    'vou pular da janela'
  ]) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'suicidio', t);
    assert.ok(numeros(r).includes('192'), t);
  }
});

test('crise: quem fala de si recebe o texto para a própria pessoa (188 e 192); relato de terceiro, não', () => {
  for (const t of ['vou me jogar da ponte', 'minha vida não tem mais sentido', 'queria sumir de vez', 'não aguento mais viver']) {
    const r = detectarCrise(t);
    assert.equal(r.pessoal, true, t);
    assert.deepEqual(numeros(r).sort(), ['188', '192'], t);
  }
  const terceiro = detectarCrise('ela falou que queria sumir de vez');
  assert.ok(terceiro && terceiro.subtipo === 'suicidio');
  assert.ok(!terceiro.pessoal);
  assert.match(terceiro.texto, /não deixe a pessoa sozinha/);
});

test('crise: sinal de risco na frase nunca vira "pergunta técnica", mesmo junto de pergunta técnica', () => {
  const t = 'minha vida não tem sentido, como avaliar o risco de suicídio?';
  assert.equal(ehPerguntaTecnicaSuicidio(t), false);
  assert.equal(detectarCrise(t).subtipo, 'suicidio');
});

test('crise: overdose e intoxicação além da palavra "overdose"', () => {
  for (const t of ['ela tomou vários comprimidos de uma vez', 'ele tomou uma cartela de remédio', 'a criança bebeu veneno', 'ingeriu muitos medicamentos']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'clinica', t);
    assert.ok(numeros(r).includes('192'), t);
  }
});

test('crise: relato de agressão e de violência sexual mostra o cartão de relato, com Disque 100, 180 e 190', () => {
  for (const t of [
    'a vizinha apanha do marido toda noite',
    'ele bate na filha de 6 anos',
    'o pai bateu nela ontem',
    'criança relatou abuso sexual pelo padrasto',
    'a adolescente contou que sofreu estupro',
    'hoje uma mulher chegou dizendo que foi violentada'
  ]) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'violencia', t);
    assert.deepEqual(numeros(r).sort(), ['100', '180', '190'], t);
    assert.match(r.titulo, /Relato de violência/, t);
    assert.match(r.texto, /Conselho Tutelar/, t);
  }
});

test('crise: o cartão de relato não classifica o caso nem lista meios', () => {
  const r = detectarCrise('ele bate na filha de 6 anos');
  assert.ok(!/risco (baixo|médio|alto)/i.test(r.texto));
  assert.ok(!/sigilo/i.test(r.texto));
});

test('crise: perguntas gerais com "risco de vida", "em perigo" ou "socorro" não disparam o cartão', () => {
  for (const t of [
    'o que fazer em caso de risco de vida?',
    'quantas crianças em perigo atende o CREAS?',
    'qual o fluxo quando criança está em perigo?',
    'pedido de socorro financeiro: como solicitar benefício eventual?',
    'qual o endereço do pronto-socorro?',
    'quais os casos de risco iminente que o CREAS atende?'
  ]) assert.equal(detectarCrise(t), null, t);
});

test('crise: o mesmo termo vago, com caso ou momento, continua mostrando o cartão', () => {
  for (const t of [
    'o que fazer, ela está em perigo agora',
    'a criança está em perigo',
    'risco de vida',
    'socorro',
    'como ajudar a mulher que está em perigo?'
  ]) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'violencia', t);
  }
});

test('crise: dúvida técnica sobre violência sexual (sem caso) vai para a IA e a base de normas', () => {
  for (const t of ['como identificar abuso sexual contra criança?', 'o que é estupro de vulnerável?', 'qual o fluxo para violência sexual?', 'como funciona a escuta especializada de violência sexual?']) {
    assert.equal(detectarCrise(t), null, t);
  }
});

test('crise: frases comuns do trabalho que lembram as novas expressões NÃO disparam', () => {
  for (const t of [
    'não aguento mais a demanda do CRAS',
    'vou apanhar o formulário na recepção',
    'ele bate na porta do CRAS toda semana',
    'o usuário quer sumir do cadastro',
    'preciso me jogar no planejamento do SCFV',
    'abuso de álcool e outras drogas no território',
    'o prontuário desapareceu do arquivo',
    'qual o horário do CAPS?'
  ]) assert.equal(detectarCrise(t), null, t);
});

test('crise: "notificar" e "notificação" são a mesma pergunta técnica sobre suicídio', () => {
  for (const t of ['como notificar tentativa de suicídio?', 'como faço a notificação de tentativa de suicídio', 'quem deve notificar uma tentativa de suicídio?']) {
    assert.equal(detectarCrise(t), null, t);
    assert.equal(ehPerguntaTecnicaSuicidio(t), true, t);
  }
});
