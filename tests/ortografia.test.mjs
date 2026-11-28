// Ortografia por dicionário (o corretor do Verbus no Paulus): a parte sem navegador, a regra nova de espaço e a ligação dos arquivos.
// O dicionário em si (Worker com Hunspell) só roda no navegador; aqui o resultado dele é simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ortPalavras, ortAgrupar, ortAplicar, ortEscolhasSeguras, ortResumo, ortSugestaoSegura, ORT_EXTRA } from '../shared/ortografia.mjs';
import { revisarTexto, respostaDeRevisao } from '../shared/revisao-texto.mjs';
import { juntar } from '../scripts/build.mjs';

const lerTexto = (c) => readFileSync(new URL('../' + c, import.meta.url), 'utf8');
const nomes = (l) => l.map((p) => p.palavra);

test('ortPalavras: confere palavra comum e pula sigla, nome no meio da frase, e-mail, endereço e número', () => {
  const t = 'A familia da Maria usa o CRAS. Escreva para joao@mail.com ou veja https://exemplo.gov.br/pagina e o item 12a. Joao atende.';
  const p = nomes(ortPalavras(t));
  assert.ok(p.includes('familia'));
  assert.ok(p.includes('Joao'), 'maiúscula que abre frase é conferida');
  assert.ok(!p.includes('Maria'), 'nome próprio no meio da frase fica de fora');
  assert.ok(!p.includes('CRAS'));
  assert.ok(!p.includes('joao') && !p.includes('mail') && !p.includes('exemplo') && !p.includes('pagina'));
  assert.ok(!p.includes('12a'));
});

test('ortPalavras: início de linha e de item de lista contam como início de frase; ignora o que a pessoa adicionou', () => {
  const t = 'Pauta:\nReuniao com a equipe\n- Visita ao bairro\nVeja o termo xpto.';
  const p = nomes(ortPalavras(t, ['xpto']));
  assert.ok(p.includes('Reuniao') && p.includes('Visita'));
  assert.ok(!p.includes('xpto'));
});

test('ortPalavras: guarda cada ocorrência com a posição certa', () => {
  const t = 'nao sei, nao vou';
  const p = ortPalavras(t).filter((x) => x.palavra === 'nao');
  assert.deepEqual(p.map((x) => x.inicio), [0, 9]);
});

test('ortAgrupar: junta ocorrências, só traz o que o dicionário recusou e limpa sugestões ruins', () => {
  const t = 'A familia, a familia e reuniao.';
  const palavras = ortPalavras(t);
  const res = {
    A: { ok: true, sug: null }, a: { ok: true, sug: null }, e: { ok: true, sug: null },
    familia: { ok: false, sug: ['afamilia', 'família', 'familiar', 'fami lia', 'familia'] },
    reuniao: { ok: false, sug: ['reunia-o', 'reuni ao', 'reunião'] }
  };
  const g = ortAgrupar(t, palavras, res);
  assert.equal(g.length, 2);
  const f = g.find((x) => x.palavra === 'familia');
  assert.equal(f.inicios.length, 2);
  assert.deepEqual(f.sugestoes, ['família', 'afamilia', 'familiar'], 'acento corrigido primeiro; sem espaço; sem a própria palavra');
  assert.equal(f.seguro, true);
  const r = g.find((x) => x.palavra === 'reuniao');
  assert.deepEqual(r.sugestoes, ['reunião']);
});

test('ortAgrupar: sem sugestão do mesmo vocábulo, não é troca segura', () => {
  const t = 'veja xyzabc aqui';
  const g = ortAgrupar(t, ortPalavras(t), { veja: { ok: true }, aqui: { ok: true }, xyzabc: { ok: false, sug: ['xyz', 'abc'] } });
  assert.equal(g.length, 1);
  assert.equal(g[0].seguro, false);
  assert.deepEqual(ortEscolhasSeguras(g), {});
});

test('ortSugestaoSegura: só acento ou cedilha', () => {
  assert.equal(ortSugestaoSegura('beneficio', 'benefício'), true);
  assert.equal(ortSugestaoSegura('acao', 'ação'), true);
  assert.equal(ortSugestaoSegura('casa', 'casa'), false);
  assert.equal(ortSugestaoSegura('casa', 'cada'), false);
});

test('ortAplicar: troca todas as ocorrências, respeita maiúscula e não mexe no resto', () => {
  const t = 'Reuniao hoje. Na reuniao de amanha, REUNIAO.';   // caixa alta é tratada como sigla e fica de fora
  const palavras = ortPalavras(t);
  const res = { Reuniao: { ok: false, sug: ['Reunião'] }, reuniao: { ok: false, sug: ['reunião'] }, REUNIAO: { ok: false, sug: ['reunião'] } };
  const g = ortAgrupar(t, palavras, res);
  const novo = ortAplicar(t, g, ortEscolhasSeguras(g));
  assert.equal(novo, 'Reunião hoje. Na reunião de amanha, REUNIAO.');
});

test('ortAplicar: sem escolha o texto fica igual, e texto base diferente do original não é alterado', () => {
  const t = 'a familia chegou';
  const g = ortAgrupar(t, ortPalavras(t), { a: { ok: true }, chegou: { ok: true }, familia: { ok: false, sug: ['família'] } });
  assert.equal(ortAplicar(t, g, {}), t);
  assert.equal(ortAplicar('outro texto qualquer', g, { familia: 'família' }), 'outro texto qualquer');
});

test('ortAplicar: aceita a sugestão que a pessoa escolheu, não só a primeira', () => {
  const t = 'o benefcio chegou';
  const g = ortAgrupar(t, ortPalavras(t), { o: { ok: true }, chegou: { ok: true }, benefcio: { ok: false, sug: ['benefício', 'beneficio'] } });
  assert.equal(ortAplicar(t, g, { benefcio: 'beneficio' }), 'o beneficio chegou');
});

test('ortResumo: fala de quantas palavras e de quantas já estão marcadas', () => {
  assert.match(ortResumo([], 40), /40 palavras/);
  const g = [{ palavra: 'a', seguro: true }, { palavra: 'b', seguro: false }];
  assert.match(ortResumo(g, 10), /2 palavras fora do dicionário \(1 com acento/);
});

test('ORT_EXTRA: traz o vocabulário do trabalho social', () => {
  for (const w of ['condicionalidade', 'socioassistencial', 'matriciamento']) assert.ok(ORT_EXTRA.split(' ').includes(w), w);
});

test('revisão por regras: falta espaço depois da pontuação, sem pegar e-mail, hora ou endereço', () => {
  const r = revisarTexto('Ontem,a equipe visitou a familia;depois voltou.');
  assert.equal(r.corrigido, 'Ontem, a equipe visitou a família; depois voltou.');
  for (const ok of ['Escreva para joao@mail.com,maria@mail.com depois.', 'A visita é às 14:30 de hoje.', 'Veja http://exemplo.gov.br/a,b agora.']) {
    assert.ok(!revisarTexto(ok).apontamentos.some((a) => a.regra.startsWith('Falta espaço')), ok);
  }
});

test('respostaDeRevisao: devolve o texto original para o dicionário conferir', () => {
  const r = respostaDeRevisao('corrija a ortografia e a gramática: A familia nao veio.');
  assert.equal(r.original, 'A familia nao veio.');
  assert.equal(r.corrigido, 'A família não veio.');
});

test('pacote do navegador: Paulus.ortografia está exposto e funciona', () => {
  const ctx = { self: {}, console };
  ctx.window = ctx.self;
  vm.createContext(ctx);
  vm.runInContext(juntar(), ctx);
  const O = ctx.self.Paulus.ortografia;
  assert.equal(typeof O.palavras, 'function');
  assert.equal(typeof O.agrupar, 'function');
  assert.equal(typeof O.aplicar, 'function');
  assert.equal(typeof O.escolhasSeguras, 'function');
  assert.ok(O.extra.length > 100);
  assert.equal(JSON.stringify(nomes(O.palavras('A familia chegou'))), JSON.stringify(['familia', 'chegou']));   // JSON: o vm cria arrays de outro contexto
});

test('ligação dos arquivos: dicionário, build, cache offline, tela e script do console', () => {
  for (const f of ['pt.aff', 'pt.dic', 'spell-worker.js', 'LICENSE-dicionario.txt', 'LICENSE-hunspell-asm.txt']) {
    assert.ok(existsSync(new URL('../vendor/spell/' + f, import.meta.url)), 'falta vendor/spell/' + f);
  }
  assert.ok(statSync(new URL('../vendor/spell/pt.dic', import.meta.url)).size > 1000000, 'pt.dic parece incompleto');
  const build = lerTexto('scripts/build.mjs');
  assert.match(build, /shared\/ortografia\.mjs/);
  assert.match(build, /'ortografia\.js'/);
  assert.match(build, /vendor', 'spell'/);
  const sw = lerTexto('sw.js');
  for (const u of ['ortografia.js', 'spell/pt.aff', 'spell/pt.dic', 'spell/spell-worker.js']) assert.ok(sw.includes("'" + u + "'"), 'sw.js sem ' + u);
  assert.match(lerTexto('console/index.html'), /<script src="ortografia\.js"><\/script>/);
  assert.match(lerTexto('console/console.js'), /PaulusOrtografia\.painel\(/);
});

test('console/ortografia.js: sintaxe válida e expõe PaulusOrtografia', () => {
  const codigo = lerTexto('console/ortografia.js');
  assert.doesNotThrow(() => new vm.Script(codigo));
  assert.match(codigo, /window\.PaulusOrtografia = \{/);
  assert.match(codigo, /spell\/spell-worker\.js/);
  assert.doesNotMatch(codigo, /\bfetch\(|XMLHttpRequest|sendBeacon/, 'o texto nunca sai do aparelho');
});
