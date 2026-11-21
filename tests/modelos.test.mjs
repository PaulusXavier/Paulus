import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELOS_3D, lerPedidoDeModelo, respostaDeModelo, urlDoModelo } from '../shared/modelos.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { juntar, construir } from '../scripts/build.mjs';

const RAIZ = new URL('../', import.meta.url);
const html = (m) => readFileSync(new URL('modelos/' + m.arquivo, RAIZ), 'utf8');

test('modelos: cada modelo do catálogo existe, é um .html único e não puxa nada da internet', () => {
  assert.ok(MODELOS_3D.length >= 1);
  const ids = new Set();
  for (const m of MODELOS_3D) {
    assert.ok(!ids.has(m.id), 'id repetido ' + m.id); ids.add(m.id);
    assert.match(m.arquivo, /^[a-z0-9-]+\.html$/);
    assert.ok(existsSync(new URL('modelos/' + m.arquivo, RAIZ)), m.arquivo);
    const t = html(m);
    assert.match(t, /^<!DOCTYPE html>/i);
    assert.ok(!/(src|href)\s*=\s*["']https?:\/\//i.test(t), m.id + ' carrega arquivo externo');
    assert.ok(!/url\(\s*["']?https?:/i.test(t) && !/@import/i.test(t), m.id + ' usa CSS externo');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(t), m.id + ' faz chamada de rede');
    assert.ok(m.recursos.length >= 3 && m.resumo.length > 40 && m.nome && m.versao);
  }
});

test('modelos: a base do Sistema Solar tem as listas de dados e elas se ligam entre si', () => {
  const t = html(MODELOS_3D.find((m) => m.id === 'sistema-solar'));
  for (const lista of ['THEMES', 'BODIES', 'LESSONS', 'QUIZ_QUESTIONS', 'MOONS']) assert.match(t, new RegExp('const ' + lista + ' = \\['), lista);
  const ids = [...t.matchAll(/\n {8}id: "([a-z]+)"/g)].map((x) => x[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids de corpo repetidos');
  assert.ok(ids.includes('sun') && ids.includes('earth'));
  for (const x of t.matchAll(/targetId: "([a-z]+)"/g)) assert.ok(ids.includes(x[1]), 'lição aponta para corpo que não existe: ' + x[1]);
  for (const x of t.matchAll(/parentId: "([a-z]+)"/g)) assert.ok(ids.includes(x[1]), 'lua de corpo que não existe: ' + x[1]);
  const respostas = [...t.matchAll(/answer: (\d+)/g)].map((x) => +x[1]);
  assert.ok(respostas.length >= 5 && respostas.every((n) => n >= 0 && n <= 3));
});

test('modelos: reconhece o pedido do modelo e não confunde com modelo de texto, pergunta de astronomia ou pedido de ajuda', () => {
  for (const t of ['me manda o modelo 3D do sistema solar', 'quero um modelo didático 3d', 'me mande o simulador 3d do sistema solar', 'me manda o arquivo do sistema solar', 'faça um modelo 3d do corpo humano', 'modelo 3d do átomo']) {
    assert.ok(lerPedidoDeModelo(t), t);
  }
  for (const t of ['modelo de ofício', 'me manda um modelo de relatório técnico', 'modelo didático de PAF', 'quantos planetas tem o sistema solar?', 'explique o sistema solar',
    'faça um resumo sobre o sistema solar', 'qual a base do sistema solar', 'dados do modelo 3d do átomo', 'roteiro de modelo 3d de célula', 'como adaptar o modelo 3d?', 'revisar o modelo 3d', 'você sabe fazer modelo 3d?', '']) {
    assert.equal(lerPedidoDeModelo(t), null, t);
  }
});

test('modelos: Sistema Solar entrega a base; tema novo entrega a base e diz o que dá para fazer (com a grafia da pessoa)', () => {
  const a = respostaDeModelo('me manda o modelo 3D do sistema solar');
  assert.equal(a.modelo.id, 'sistema-solar'); assert.equal(a.novoTema, '');
  assert.match(a.texto, /arquivo único/); assert.match(a.texto, /sem internet/);
  const b = respostaDeModelo('faça um modelo 3D do corpo humano igual ao que eu mandei');
  assert.equal(b.modelo.id, 'sistema-solar'); assert.equal(b.novoTema, 'corpo humano');
  assert.match(b.texto, /não monto o arquivo inteiro sozinho/); assert.match(b.texto, /Claude, no chat/);
  assert.equal(respostaDeModelo('crie um modelo 3D de célula').novoTema, 'célula');
  assert.equal(respostaDeModelo('quero um modelo 3d').novoTema, '', 'sem tema, a base é o Sistema Solar');
});

test('modelos: urlDoModelo usa modelos/ por padrão e aceita outra pasta', () => {
  const m = MODELOS_3D[0];
  assert.equal(urlDoModelo(m), 'modelos/' + m.arquivo);
  assert.equal(urlDoModelo(m, 'https://x.github.io/paulus/modelos'), 'https://x.github.io/paulus/modelos/' + m.arquivo);
});

function carregar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

test('modelos: no navegador, Paulus.perguntar responde no aparelho com tipo "modelo" e o arquivo para baixar', async () => {
  const Paulus = carregar();
  Paulus.init({ app: 'argo', minIntervaloMs: 0 });
  const r = await Paulus.perguntar('me manda o modelo 3D do sistema solar');
  assert.equal(r.tipo, 'modelo');
  assert.equal(r.arquivos[0].nome, 'sistema-solar-3d-didatico-v6.html');
  assert.equal(r.arquivos[0].url, 'modelos/sistema-solar-3d-didatico-v6.html');
  assert.equal(r.modelo.id, 'sistema-solar');
  assert.ok(Array.isArray(Paulus.modelos.catalogo) && typeof Paulus.modelos.baixar === 'function');
  Paulus.init({ app: 'argo', minIntervaloMs: 0, modelosUrl: 'https://x.github.io/paulus/modelos/' });
  assert.match((await Paulus.perguntar('quero o simulador 3d do sistema solar')).arquivos[0].url, /^https:\/\/x\.github\.io\/paulus\/modelos\/sistema-solar/);
});

test('modelos: a opção semModelos devolve a pergunta ao fluxo normal', async () => {
  const Paulus = carregar();
  Paulus.init({ app: 'argo', minIntervaloMs: 0 });
  const r = await Paulus.perguntar('me manda o modelo 3D do sistema solar', { semModelos: true });
  assert.notEqual(r.tipo, 'modelo');
});

test('modelos: as três habilidades existem e só entram quando o pedido é de modelo 3D', () => {
  const lista = lerTodas();
  const ids = (p) => escolherHabilidades(lista, p, [], 'umbrella').map((h) => h.id);
  for (const id of ['modelo-3d-didatico', 'modelo-3d-didatico-dados', 'modelo-3d-didatico-qualidade']) assert.ok(lista.some((h) => h.id === id), id);
  assert.ok(ids('como fazer um modelo 3d didático para a escola?').includes('modelo-3d-didatico'));
  const dados = ids('quais os dados do modelo 3d de átomo?');
  assert.ok(dados.includes('modelo-3d-didatico-dados'), dados.join(','));
  assert.ok(ids('checklist para revisar o modelo 3d').includes('modelo-3d-didatico-qualidade'));
  for (const p of ['como escrever um relatório técnico', 'modelo de ofício para o conselho', 'quantos planetas tem o sistema solar', 'montar o PAF da família']) {
    assert.ok(!ids(p).some((i) => i.startsWith('modelo-3d')), p);
  }
});

test('modelos: o build copia modelos/*.html para dist/modelos/ e o módulo entra no pacote do navegador', () => {
  assert.match(juntar(), /shared\/modelos\.mjs/);
  const dist = construir();
  const copiados = readdirSync(join(dist, 'modelos'));
  for (const m of MODELOS_3D) assert.ok(copiados.includes(m.arquivo), m.arquivo);
  assert.equal(readFileSync(join(dist, 'modelos', MODELOS_3D[0].arquivo), 'utf8'), html(MODELOS_3D[0]));
});
