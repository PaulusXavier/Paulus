import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { criarIndice, buscar } from '../shared/busca.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));

test('PAF: cada pergunta chama o roteiro certo do plano de acompanhamento familiar', () => {
  const lista = lerTodas();
  const id = (q, app = 'umbrella') => escolherHabilidades(lista, q, [], app).map((h) => h.id);
  const casos = [
    ['como escrever as metas do PAF?', 'paf-metas-estrategias'],
    ['exemplos de metas para família com criança fora da escola', 'paf-metas-estrategias'],
    ['como apresentar o PAF à família no primeiro encontro?', 'paf-compromissos-pactuacao'],
    ['o que são os compromissos do acompanhamento?', 'paf-compromissos-pactuacao'],
    ['como readequar o PAF quando a meta não foi alcançada?', 'paf-readequacao-historico'],
    ['como guardar o histórico do PAF?', 'paf-readequacao-historico'],
    ['a família não comparece ao acompanhamento, o que faço?', 'paf-adesao-encerramento'],
    ['como encerrar o PAF de uma família?', 'paf-adesao-encerramento'],
    ['qual a diferença entre acompanhamento particularizado e em grupo?', 'paf-acompanhamento-grupo-particularizado'],
    ['checklist para revisar meu PAF', 'paf-qualidade-checklist'],
    ['PAF para família migrante venezuelana', 'paf-situacoes-especificas'],
    ['quantas famílias em acompanhamento entram no RMA?', 'paf-registro-rma-contagem']
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
  // não rouba perguntas de outros temas
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.ok(!id('Quem acompanha a vacina e o pré-natal no Bolsa Família?').some((x) => x.startsWith('paf-')));
  assert.ok(!id('criança fora da escola, família no bolsa família').some((x) => x.startsWith('paf-')));
  assert.deepEqual(id('preciso montar o PAF de uma família'), ['plano-acompanhamento-familiar']);
});

test('PAF: os roteiros não fixam número de encontros, prazo nem artigo e não têm dado pessoal', () => {
  for (const h of lerTodas().filter((x) => x.id.startsWith('paf-'))) {
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id);
    assert.ok(!/\b(art\.?|artigo|lei n|resolução)\b/i.test(h.instrucoes.replace(/Referências do CFP/g, '')), h.id + ' cita artigo ou lei');
    assert.ok(!/\b\d+\s+encontros\b/i.test(h.instrucoes), h.id + ' fixa número de encontros');
  }
});

test('PAF: a base acha os trechos do guia do PAF e a definição do CFP', () => {
  const indice = criarIndice(base);
  const docs = (q) => buscar(indice, q, 4).map((r) => r.trecho.doc);
  assert.ok(docs('como escrever metas do PAF').includes('paif-paf-plano-acompanhamento'));
  assert.ok(docs('quando encerrar o acompanhamento familiar').includes('paif-paf-plano-acompanhamento'));
  assert.ok(docs('família que não adere ao acompanhamento').includes('paif-paf-plano-acompanhamento'));
  assert.ok(docs('diferença entre PAF e plano do CREAS').includes('paif-paf-plano-acompanhamento'));
  assert.ok(docs('o que é compromisso no acompanhamento familiar').some((d) => d === 'paif-paf-plano-acompanhamento' || d === 'cfp-ref-cras-2021'));
});

test('PAF: o guia é de apoio, está marcado como pendente de conferência e os roteiros ficam fora do Worker', () => {
  const guia = base.filter((v) => v.doc === 'paif-paf-plano-acompanhamento');
  assert.ok(guia.length >= 18);
  assert.ok(guia.every((v) => v.tipo === 'apoio'));
  const worker = JSON.parse(readFileSync(new URL('../knowledge/worker-base.json', import.meta.url), 'utf8'));
  assert.ok(worker.docs.some((d) => d[0] === 'paif-paf-plano-acompanhamento'));
  assert.ok(!worker.docs.some((d) => d[0] === 'paulus-roteiros-paf'));
  assert.ok(base.some((v) => v.doc === 'paulus-roteiros-paf'));
});


test('PAF: roteiros novos (potencialidades, escala, linguagem, construção, genograma, composição, histórico)', () => {
  const lista = lerTodas();
  const id = (q, app = 'umbrella') => escolherHabilidades(lista, q, [], app).map((h) => h.id);
  const casos = [
    ['como registrar as potencialidades da família?', 'paf-potencialidades'],
    ['como a escala de prioridades de atendimento funciona?', 'paf-escala-prioridades'],
    ['quem atender primeiro, qual a prioridade alta?', 'paf-escala-prioridades'],
    ['como escrever o paf sem rótulos, família desestruturada?', 'paf-linguagem-registro'],
    ['perguntas para construir o PAF com a família', 'paf-construcao-conjunta'],
    ['como fazer genograma e ecomapa?', 'paf-genograma-ecomapa'],
    ['metas do PAF para família com idoso', 'paf-metas-por-composicao'],
    ['o que o histórico de evolução registra?', 'paf-historico-umbrela']
  ];
  for (const [q, esperado] of casos) {
    const r = id(q);
    assert.ok(r.includes(esperado), q + ' -> ' + r);
    assert.ok(r.length <= 2, q);
  }
  // o histórico do Umbrela só vale no Umbrela
  assert.ok(!id('o que o histórico de evolução registra?', 'argo').includes('paf-historico-umbrela'));
  // não rouba perguntas de outros temas
  assert.ok(!id('qual o horário do CRAS?').some((x) => x.startsWith('paf-')));
  assert.ok(!id('como fazer visita domiciliar a pessoa idosa').some((x) => x.startsWith('paf-')));
});
