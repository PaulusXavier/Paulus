import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisarTexto, respostaDeRevisao } from '../shared/revisao-texto.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';

const lista = lerTodas();
const ids = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);

test('português: existem os roteiros portugues-* e cada um respeita o limite', () => {
  const p = lista.filter((h) => h.id.startsWith('portugues-'));
  assert.ok(p.length >= 24, String(p.length));
});

test('português: cada pergunta chama o roteiro certo', () => {
  const casos = [
    ['quero aprender português o máximo possível', 'portugues-visao-geral'],
    ['quando usar crase?', 'portugues-crase'],
    ['onde colocar vírgula?', 'portugues-virgula-pontuacao'],
    ['regras de acentuação', 'portugues-acentuacao'],
    ['o que mudou no acordo ortográfico?', 'portugues-acordo-ortografico'],
    ['socioassistencial tem hífen?', 'portugues-hifen'],
    ['mal ou mau?', 'portugues-mal-mau-porque'],
    ['diferença entre cessão e sessão', 'portugues-paronimos-homonimos'],
    ['haver ou existir concordância verbal', 'portugues-concordancia-verbal'],
    ['quando eu vir ou vier?', 'portugues-verbos-conjugacao'],
    ['o que é gerundismo?', 'portugues-vicios-linguagem'],
    ['como tratar a autoridade no ofício: vossa senhoria ou vossa excelência', 'portugues-redacao-oficial'],
    ['termos corretos no SUAS: pessoa com deficiência ou deficiente?', 'portugues-termos-suas'],
    ['revise meu texto', 'portugues-revisao-de-texto']
  ];
  for (const [q, id] of casos) assert.ok(ids(q).includes(id), q + ' -> ' + ids(q).join(','));
});

test('português: perguntas comuns do trabalho não chamam roteiro de português', () => {
  for (const q of ['qual o horário do CRAS?', 'quanto é o valor do Bolsa Família?', 'quais as regras do CRAS?', 'o que fazem os psicólogos no CRAS?', 'como funciona o BPC?', 'posso quebrar o sigilo?']) {
    assert.deepEqual(ids(q).filter((x) => x.startsWith('portugues-')), [], q);
  }
});

test('corretor: acha erros comuns e aplica só trocas seguras', () => {
  const r = revisarTexto('A CRAS atendeu 12 familias as 14hs, etc... Haja visto o prazo, para mim fazer isso. Fazem dois anos que  nao vem. Vou estar enviando.');
  assert.ok(r.apontamentos.length >= 9, String(r.apontamentos.length));
  assert.match(r.corrigido, /O CRAS/);
  assert.match(r.corrigido, /famílias/);
  assert.match(r.corrigido, /às 14h/);
  assert.match(r.corrigido, /etc\./);
  assert.match(r.corrigido, /haja vista/i);
  assert.match(r.corrigido, /para eu fazer/);
  assert.match(r.corrigido, /Faz dois anos/);
  assert.match(r.corrigido, /que não vem/);
  assert.doesNotMatch(r.corrigido, /  /);
  assert.match(r.corrigido, /Vou estar enviando/); // gerundismo só aponta, não reescreve
});

test('corretor: texto certo não gera apontamento', () => {
  const r = revisarTexto('A equipe do CRAS visitou a família na terça-feira, às 14h, e encaminhou o relatório.');
  assert.deepEqual(r.apontamentos, []);
  assert.equal(r.corrigido, 'A equipe do CRAS visitou a família na terça-feira, às 14h, e encaminhou o relatório.');
  assert.deepEqual(revisarTexto('Ele foi a pé até a UBS e saiu a partir das 8h.').apontamentos, []);
  assert.equal(revisarTexto('').corrigido, '');
});

test('corretor: crase errada é apontada e corrigida', () => {
  const r = revisarTexto('Ela foi à pé e à partir de hoje fala à ele.');
  assert.equal(r.corrigido, 'Ela foi a pé e a partir de hoje fala a ele.');
});

test('pedido de correção: só com pedido e texto depois de ":"', () => {
  const r = respostaDeRevisao('corrija a ortografia e a gramática: Maria Silva disse que a CRAS atende as 8hs.');
  assert.ok(r && /o CRAS atende às 8h/.test(r.corrigido));
  assert.equal(respostaDeRevisao('qual o horário do CRAS?'), null);
  assert.equal(respostaDeRevisao('corrija: '), null);
  assert.equal(respostaDeRevisao('como escrever um relatório: passo a passo'), null);
});

test('Paulus (pacote do navegador): corrigir texto roda no aparelho e não vai ao histórico', async () => {
  const { juntar } = await import('../scripts/build.mjs');
  assert.match(juntar(), /revisarTexto/);
  const guia = readFileSync(new URL('../knowledge/documentos/portugues-guia-apoio.md', import.meta.url), 'utf8');
  assert.match(guia, /tipo: apoio/);
});
