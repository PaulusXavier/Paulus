import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { criarIndice, buscar } from '../shared/busca.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));

test('mapa de Boa Vista: cada pergunta chama o roteiro certo', () => {
  const lista = lerTodas();
  const id = (q, app = 'argo') => escolherHabilidades(lista, q, [], app).map((h) => h.id);
  const casos = [
    ['como é o mapa de Boa Vista?', 'mapa-boa-vista-ler-a-cidade'],
    ['por que Boa Vista tem cidade em leque?', 'mapa-boa-vista-ler-a-cidade'],
    ['como me oriento em Boa Vista pelo centro cívico', 'mapa-boa-vista-ler-a-cidade'],
    ['quantos bairros tem Boa Vista?', 'mapa-boa-vista-zonas-bairros'],
    ['em que zona fica o bairro Cauamé', 'mapa-boa-vista-zonas-bairros'],
    ['quais são os bairros de Boa Vista na zona oeste de Boa Vista', 'mapa-boa-vista-zonas-bairros'],
    ['onde começa a avenida Ville Roy?', 'mapa-boa-vista-vias-pontes'],
    ['fala da ponte dos Macuxis', 'mapa-boa-vista-vias-pontes'],
    ['como é a BR-174 em Boa Vista', 'mapa-boa-vista-vias-pontes'],
    ['quais os igarapés de Boa Vista?', 'mapa-boa-vista-rios-alagamento'],
    ['por que tem alagamento em Boa Vista?', 'mapa-boa-vista-rios-alagamento'],
    ['o que é a zona rural de Boa Vista?', 'mapa-boa-vista-zona-rural-fronteira'],
    ['qual a distância de Boa Vista a Pacaraima?', 'mapa-boa-vista-zona-rural-fronteira'],
    ['para onde Boa Vista cresce?', 'mapa-boa-vista-expansao-urbana'],
    ['quais as praças de Boa Vista?', 'mapa-boa-vista-pracas-espacos-publicos'],
    ['como usar o mapa no trabalho do CRAS?', 'mapa-boa-vista-usar-no-cras'],
    ['posso confiar no mapa de Boa Vista?', 'mapa-boa-vista-o-que-sabe-fontes'],
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
  // não rouba perguntas de outros temas
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.ok(!id('quanto é o valor do Bolsa Família?').some((x) => x.startsWith('mapa-boa-vista')));
  assert.ok(!id('como escrever as metas do PAF?', 'umbrella').some((x) => x.startsWith('mapa-boa-vista')));
});

test('mapa de Boa Vista: roteiros sem dado pessoal, sem marcação e sem endereço de família', () => {
  for (const h of lerTodas().filter((x) => x.id.startsWith('mapa-boa-vista-'))) {
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id);
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id);
    assert.ok(h.instrucoes.length > 600, h.id + ' curto demais');
  }
});

test('mapa de Boa Vista: a base acha os trechos da geografia e eles ficam no Worker', () => {
  const indice = criarIndice(base);
  const docs = (q) => buscar(indice, q, 5).map((r) => r.trecho.doc);
  assert.ok(docs('Boa Vista foi planejada em leque quem fez o plano').includes('boa-vista-geografia-mapa'));
  assert.ok(docs('onde fica a Ponte dos Macuxis e quando foi inaugurada').includes('boa-vista-geografia-mapa'));
  assert.ok(docs('quais bairros a avenida Ville Roy atravessa e de onde vem o nome').includes('boa-vista-geografia-mapa'));
  assert.ok(docs('por que alagam as lagoas de Boa Vista').includes('boa-vista-geografia-mapa'));
  assert.ok(docs('lista de bairros de Boa Vista zona oeste Censo 2000').includes('boa-vista-geografia-mapa'));
  assert.ok(docs('assentamento Nova Amazônia Murupu Truaru').includes('boa-vista-geografia-mapa'));
  const trechos = base.filter((v) => v.doc === 'boa-vista-geografia-mapa');
  assert.ok(trechos.length >= 30);
  assert.ok(trechos.every((v) => v.tipo === 'apoio'));
  assert.ok(trechos.every((v) => v.texto.length <= 700), 'trecho maior que o que a IA recebe');
  const worker = JSON.parse(readFileSync(new URL('../knowledge/worker-base.json', import.meta.url), 'utf8'));
  assert.ok(worker.docs.some((d) => d[0] === 'boa-vista-geografia-mapa'));
});

test('mapa de Boa Vista: o documento não traz endereço de residência nem telefone', () => {
  const md = readFileSync(new URL('../knowledge/documentos/boa-vista-geografia-mapa.md', import.meta.url), 'utf8');
  // nomes de personagens históricos (autor do plano, governadores) são públicos; aqui só barra o que seria dado de família
  assert.ok(!/\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(md), 'telefone');
  assert.ok(!/[\w.]+@[\w.]+\.\w+/.test(md), 'e-mail');
  assert.ok(!/\d{9,}/.test(md.replace(/[.\s]/g, '')), 'sequência longa de números');
  assert.ok(!/\b(mora|moro|reside)\b/i.test(md), 'endereço de residência');
});
