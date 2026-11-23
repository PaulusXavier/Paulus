// Mascote do Argo: o Paulus aprendeu as habilidades do barquinho (26 roteiros mascote-argo-* e um guia de apoio), só no app Argo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const lista = lerTodas();
const masc = lista.filter(h => h.id.startsWith('mascote-argo-'));
const ids = (q, anteriores = [], app = 'argo') => escolherHabilidades(lista, q, anteriores, app).map(h => h.id);

test('há 26 roteiros do mascote do Argo, dentro do teto, só no Argo, sem dado pessoal nem marcação', () => {
  assert.ok(masc.length >= 26, 'roteiros: ' + masc.length);
  for (const h of masc) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id + ' tem ' + h.instrucoes.length);
    assert.deepEqual(h.apps, ['argo'], h.id + ' deve valer só no Argo');
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação');
  }
});

test('nenhum roteiro do mascote tem gatilho de uma palavra só (casaria com qualquer pergunta que cite o mascote)', () => {
  for (const h of masc) for (const g of h.gatilhos) assert.ok(g.length >= 2, h.id + ': ' + JSON.stringify(g));
});

test('nenhum roteiro do mascote traz telefone, e-mail ou número de lei (isso vem das fichas e das normas)', () => {
  for (const h of masc) {
    assert.ok(!/\d{4,5}[-\s]\d{4}|0800|@/.test(h.instrucoes), h.id + ' tem telefone ou e-mail');
    assert.ok(!/\b(?:lei|decreto|portaria|resolu[cç][aã]o)\s+n?[º°o.]?\s*\d/i.test(h.instrucoes), h.id + ' cita número de norma');
  }
});

test('o pedido certo carrega o roteiro certo', () => {
  const casos = [
    ['o que o mascote sabe fazer?', 'mascote-argo-visao-geral'],
    ['como falo com o mascote', 'mascote-argo-como-conversar'],
    ['como uso o microfone do mascote', 'mascote-argo-voz-e-atalhos'],
    ['quando o mascote usa a IA?', 'mascote-argo-ia-e-conferencia'],
    ['o mascote guarda dados de famílias?', 'mascote-argo-privacidade-socorro'],
    ['o que o mascote não faz', 'mascote-argo-limites'],
    ['como gerar guia pelo mascote', 'mascote-argo-diretorio-fichas'],
    ['como pedir ao mascote qual cras atende um bairro', 'mascote-argo-territorio'],
    ['como o mascote conta quantas escolas tem no bairro', 'mascote-argo-boa-vista-numeros'],
    ['o mascote compara municípios de roraima', 'mascote-argo-municipios-roraima'],
    ['o mascote sabe quantos psicólogos tem nos CRAS no censo suas', 'mascote-argo-censo-suas-psicologos'],
    ['o mascote consulta CID-11?', 'mascote-argo-cid11'],
    ['o mascote responde sigilo do psicólogo', 'mascote-argo-base-psicologo-suas'],
    ['o mascote sabe sobre paif?', 'mascote-argo-base-paif-cadunico-raps'],
    ['o mascote sabe a matrícula escolar', 'mascote-argo-matricula-valores-pbf'],
    ['como o mascote lê pergunta de caso', 'mascote-argo-casos-e-pedidos'],
    ['como peço o resumo do meu dia mascote', 'mascote-argo-rotina-trabalho'],
    ['o mascote consulta a agenda', 'mascote-argo-agenda'],
    ['o mascote abre o SIBEC', 'mascote-argo-abrir-telas'],
    ['o mascote faz conta?', 'mascote-argo-calculos'],
    ['mascote traçar rota', 'mascote-argo-distancia-rota'],
    ['o mascote traduz para o espanhol?', 'mascote-argo-traducao'],
    ['mascote reduzir tamanho do pdf', 'mascote-argo-pdf-no-chat'],
    ['o que o mascote aprendeu', 'mascote-argo-aprendizado'],
    ['mascote quero desabafar', 'mascote-argo-conversa-solta'],
    ['escrever com o paulus', 'mascote-argo-escrever-com-paulus']
  ];
  for (const [q, esperado] of casos) {
    const r = ids(q);
    assert.ok(r.includes(esperado), q + ' → ' + JSON.stringify(r) + ' (esperava ' + esperado + ')');
  }
});

test('perguntas comuns do dia a dia não carregam roteiro do mascote', () => {
  const comuns = ['qual o telefone do CAPS II', 'qual CRAS atende o Caimbé?', 'quantas escolas tem no Caimbé?', 'o que é o PAIF',
    'como fazer uma visita domiciliar', 'como juntar dois pdfs', 'quais ferramentas tem no argo?', 'quando cai o bolsa família'];
  for (const q of comuns) assert.ok(!ids(q).some(i => i.startsWith('mascote-argo-')), q + ' → ' + JSON.stringify(ids(q)));
});

test('só vale no Argo: nos outros apps nenhum roteiro do mascote entra', () => {
  for (const app of ['anona', 'umbrella', 'toth', 'grafia', 'verbus']) {
    const r = ids('o que o mascote sabe fazer? como o mascote aprende e traça rota', [], app);
    assert.ok(!r.some(i => i.startsWith('mascote-argo-')), app + ' → ' + JSON.stringify(r));
  }
});
