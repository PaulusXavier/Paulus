import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaLocalEstudo } from '../shared/idioma-estudo.mjs';
import { respostaLocalDeIdioma } from '../shared/idioma.mjs';

test('tutor local oferece aulas numeradas nos dois idiomas', () => {
  const es = respostaLocalEstudo('aula 2 de espanhol');
  assert.equal(es.idioma, 'es');
  assert.equal(es.tipoLocal, 'aula');
  assert.match(es.texto, /aula 2: Pronomes, ser e estar/);
  assert.match(es.texto, /ESTAR/);

  const en = respostaLocalEstudo('aula 3 de inglês');
  assert.equal(en.idioma, 'en');
  assert.equal(en.tipoLocal, 'aula');
  assert.match(en.texto, /aula 3: Presente simples e rotina/);
  assert.match(en.texto, /doesn.t work/);
});

test('tutor local oferece curso, vocabulário temático, gramática e pronúncia', () => {
  const curso = respostaLocalEstudo('curso básico de inglês');
  assert.equal(curso.tipoLocal, 'curso');
  assert.match(curso.texto, /4 semanas/);
  assert.match(curso.texto, /sem gastar a cota/);

  const vocab = respostaLocalEstudo('vocabulário de viagem em espanhol');
  assert.equal(vocab.tipoLocal, 'vocabulario');
  assert.match(vocab.texto, /Vocabulário de espanhol — viagem/);
  assert.match(vocab.texto, /autobús/);

  const gram = respostaLocalEstudo('gramática de inglês');
  assert.equal(gram.tipoLocal, 'gramatica');
  assert.match(gram.texto, /do\/does/);

  const pron = respostaLocalEstudo('pronúncia de espanhol');
  assert.equal(pron.tipoLocal, 'pronuncia');
  assert.match(pron.texto, /ñ/);
});

test('exercícios incluem gabarito e pedidos combinados mostram opções dos dois idiomas', () => {
  const exercicio = respostaLocalEstudo('exercício de inglês');
  assert.equal(exercicio.tipoLocal, 'exercicio');
  assert.match(exercicio.texto, /Answer key/);
  assert.match(exercicio.texto, /went/);

  const ambos = respostaLocalEstudo('quero aprender espanhol e inglês');
  assert.equal(ambos.idioma, 'es');
  assert.equal(ambos.tipoLocal, 'curso');
  assert.match(ambos.texto, /Espanhol/);
  assert.match(ambos.texto, /Inglês/);
});

test('roteador de idiomas encaminha pedidos didáticos e deixa perguntas gerais fora do tutor', () => {
  const local = respostaLocalDeIdioma('curso de espanhol');
  assert.equal(local.idioma, 'es');
  assert.equal(local.tipoLocal, 'curso');
  assert.match(local.texto, /Trilha local de espanhol/);

  assert.equal(respostaLocalDeIdioma('Qual é a população atual da Espanha?'), null);
});

test('aula sem repetir o idioma herda a escolha explícita do histórico', () => {
  const historico = [{ papel: 'usuario', texto: 'Quero estudar inglês' }];
  const resultado = respostaLocalEstudo('aula 4', historico);
  assert.equal(resultado.idioma, 'en');
  assert.match(resultado.texto, /Ações acontecendo agora/);
});
