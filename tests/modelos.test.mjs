import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELOS_3D, lerPedidoDeModelo, respostaDeModelo, urlDoModelo } from '../shared/modelos.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { juntar, construir } from '../scripts/build.mjs';
import { areaAnelKm2, simplificar, pontoDeRotulo } from '../scripts/montar-mapa-roraima.mjs';

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
  for (const id of ['modelo-3d-didatico', 'modelo-3d-didatico-dados', 'modelo-3d-didatico-qualidade', 'modelo-3d-mapa-roraima']) assert.ok(lista.some((h) => h.id === id), id);
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

// ------------------------------------------------------------------ mapa 3D de Roraima (v0.21.0)

const mapaHtml = () => html(MODELOS_3D.find((m) => m.id === 'mapa-roraima'));
function dadosDoMapa() {
  const t = mapaHtml(), i = t.indexOf('const DADOS = '), f = t.indexOf('};\n', i);
  return JSON.parse(t.slice(i + 'const DADOS = '.length, f + 1));
}
function dentroDoAnel(p, anel) {
  let c = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

test('mapa 3D: o catálogo tem o mapa de Roraima e o arquivo é único, sem rede e sem biblioteca', () => {
  const m = MODELOS_3D.find((x) => x.id === 'mapa-roraima');
  assert.ok(m && m.arquivo === 'mapa-roraima-3d-didatico-v1.html');
  const t = mapaHtml();
  assert.ok(!/<script[^>]+src=/i.test(t), 'script externo');
  assert.ok(!/https?:\/\//.test(t.replace(/"fonte":"[^"]*"/, '')), 'endereço de internet dentro do arquivo');
  assert.match(t, /<canvas id="mapa"/);
});

test('mapa 3D: 15 municípios, população soma a do estado, áreas do contorno perto das oficiais, rótulo dentro do contorno', () => {
  const d = dadosDoMapa();
  assert.equal(d.municipios.length, 15);
  assert.equal(new Set(d.municipios.map((m) => m.id)).size, 15);
  assert.equal(d.municipios.reduce((s, m) => s + m.pop, 0), d.estado.pop);
  const soma = d.municipios.reduce((s, m) => s + m.areaCalcKm2, 0);
  assert.ok(Math.abs(soma / d.estado.areaKm2 - 1) < 0.02, 'área total do contorno: ' + soma);
  for (const m of d.municipios) {
    assert.ok(m.anel.length >= 20, m.nome + ' com contorno pobre');
    for (const [x, y] of m.anel) assert.ok(x > -65 && x < -58.5 && y > -2 && y < 5.5, m.nome + ' fora de Roraima');
    assert.ok(dentroDoAnel(m.rotulo, m.anel), m.nome + ': rótulo fora do contorno');
    if (m.areaKm2) assert.ok(Math.abs(m.areaCalcKm2 / m.areaKm2 - 1) < 0.02, m.nome + ': área do contorno x oficial');
    assert.ok(m.pop > 0 && (m.indPct == null || (m.indPct >= 0 && m.indPct <= 100)));
  }
  const bv = d.municipios.find((m) => m.id === 'boa-vista');
  assert.ok(bv.capital && bv.pop === 413486);
  assert.deepEqual(d.municipios.filter((m) => m.capital).map((m) => m.id), ['boa-vista']);
});

test('mapa 3D: o gerador calcula área, simplifica e acha ponto de rótulo corretamente', () => {
  const quadrado = [[-60, 0], [-59, 0], [-59, 1], [-60, 1], [-60, 0]];
  const a = areaAnelKm2(quadrado);
  assert.ok(a > 12100 && a < 12500, 'área de 1° x 1° no Equador: ' + a);
  const reta = []; for (let i = 0; i <= 100; i++) reta.push([-60 + i / 100, 0.0001 * Math.sin(i)]); reta.push([-60, 0.5]); reta.push([-60 + 0, 0.0001]);
  const simples = simplificar(reta, 0.003);
  assert.ok(simples.length < reta.length && simples.length >= 4);
  assert.deepEqual(simples[0], reta[0]); assert.deepEqual(simples[simples.length - 1], reta[reta.length - 1]);
  const L = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10], [0, 0]];
  assert.ok(dentroDoAnel(pontoDeRotulo(L), L), 'rótulo de polígono em L cai dentro');
});

test('mapa 3D: o pedido é reconhecido (inclusive a frase de comparação) e não confunde com rota, ajuda ou mapa sem 3D', () => {
  for (const t of ['mapa 3d de roraima', 'me manda o mapa 3D de Roraima', 'faça um mapa 3d de roraima como o do sistema solar',
    'quero que a ia tenha a habilidade de fazer um mapa 3d de roraima como tem do sistema solar', 'mapa de Roraima em 3D', 'modelo 3d do mapa de roraima',
    'maquete 3D dos municípios de Roraima', 'me mande o mapa 3d']) {
    const r = lerPedidoDeModelo(t);
    assert.ok(r, t); assert.equal(r.modelo.id, 'mapa-roraima', t); assert.equal(r.novoTema, '', t);
  }
  for (const t of ['mapa de roraima', 'mapa de visitas', 'traçar rota no mapa de Boa Vista', 'quantos municípios tem Roraima', 'como fazer um mapa 3d de roraima',
    'dados do mapa 3d de roraima', 'como adaptar o modelo 3d?', 'mapa mental 3d', 'explique o mapa 3d de roraima']) {
    assert.equal(lerPedidoDeModelo(t), null, t);
  }
  assert.equal(lerPedidoDeModelo('me manda o modelo 3D do sistema solar').modelo.id, 'sistema-solar');
});

test('mapa 3D: resposta do mapa de Roraima e de outro lugar (base + caminho, com a grafia da pessoa)', () => {
  const a = respostaDeModelo('mapa 3d de roraima');
  assert.equal(a.modelo.id, 'mapa-roraima'); assert.equal(a.novoTema, '');
  assert.match(a.texto, /arquivo único/); assert.match(a.texto, /sem internet/); assert.match(a.texto, /Censo 2022/);
  assert.match(a.avisos.join(' '), /não representa relevo/);
  const b = respostaDeModelo('faça um mapa 3d de Rondônia');
  assert.equal(b.modelo.id, 'mapa-roraima'); assert.equal(b.novoTema, 'rondônia');
  assert.match(b.texto, /não monto o arquivo inteiro sozinho/); assert.match(b.texto, /Claude, no chat/); assert.match(b.texto, /GeoJSON/);
  assert.equal(respostaDeModelo('mapa 3d do Amazonas em 3D').novoTema, 'amazonas');
});

test('mapa 3D: no navegador, Paulus.perguntar entrega o mapa de Roraima para baixar', async () => {
  const Paulus = carregar();
  Paulus.init({ app: 'argo', minIntervaloMs: 0 });
  const r = await Paulus.perguntar('faça um mapa 3d de roraima como o do sistema solar');
  assert.equal(r.tipo, 'modelo');
  assert.equal(r.modelo.id, 'mapa-roraima');
  assert.equal(r.arquivos[0].nome, 'mapa-roraima-3d-didatico-v1.html');
  assert.equal(r.arquivos[0].url, 'modelos/mapa-roraima-3d-didatico-v1.html');
});

test('mapa 3D: a habilidade entra no pedido de ajuda com mapa 3D e não entra em rota ou texto', () => {
  const lista = lerTodas();
  const ids = (p) => escolherHabilidades(lista, p, [], 'argo').map((h) => h.id);
  assert.ok(ids('como fazer um mapa 3d de roraima para a equipe do CRAS').includes('modelo-3d-mapa-roraima'));
  assert.ok(ids('dados do mapa 3d de roraima: de onde vêm os números?').includes('modelo-3d-mapa-roraima'));
  for (const p of ['traçar rota entre as visitas no mapa de Boa Vista', 'modelo de ofício para o conselho', 'quantos habitantes tem Rorainópolis']) {
    assert.ok(!ids(p).includes('modelo-3d-mapa-roraima'), p);
  }
});

test('mapa 3D: o build copia o mapa para dist/modelos/', () => {
  const dist = construir();
  assert.ok(readdirSync(join(dist, 'modelos')).includes('mapa-roraima-3d-didatico-v1.html'));
});
