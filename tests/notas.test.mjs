import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../console/notas.js', import.meta.url), 'utf8'), sandbox);
const interpretar = (texto, opcoes) => sandbox.window.PaulusNotas.interpretar(texto, opcoes);

test('notas: perguntas naturais sobre agenda e pendências mostram tarefas', () => {
  for (const pergunta of [
    'O que tenho que fazer?',
    'O que tenho de fazer?',
    'Quais tarefas tenho de fazer?',
    'Minhas tarefas',
    'Minhas tarefas pendentes',
    'Minhas anotações da agenda',
    'Mostra a minha agenda',
    'Mostrar as tarefas',
    'Quais tarefas tenho de fazer?',
    'O que está pendente?'
  ]) {
    assert.deepEqual(JSON.parse(JSON.stringify(interpretar(pergunta))), { acao: 'ver', lista: 'tarefas' }, pergunta);
  }
});

test('notas: adicionar na agenda mantém acentos e classifica como tarefa', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('Anotar preparar a reunião na agenda'))), {
    acao: 'add', lista: 'tarefas', itens: ['Preparar a reunião']
  });
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('Criar tarefa: revisar o relatório'))), {
    acao: 'add', lista: 'tarefas', itens: ['Revisar o relatório']
  });
});

test('notas: compras continuam na lista antiga e não se misturam com tarefas', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('Adicionar leite à lista de compras'))), {
    acao: 'add', lista: 'compras', itens: ['Leite']
  });
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('O que falta na lista?'))), { acao: 'ver', lista: 'compras' });
});

test('notas: concluir uma tarefa não é interpretado como compra', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('Concluí preparar a reunião'))), {
    acao: 'feito', lista: 'tarefas', alvo: 'preparar a reunião', todos: false
  });
});

test('notas: ditado no modo de anotação respeita a categoria selecionada', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(interpretar('Telefonar para a escola', { modoNota: true }))), {
    acao: 'add', lista: 'tarefas', itens: ['Telefonar para a escola']
  });
});
