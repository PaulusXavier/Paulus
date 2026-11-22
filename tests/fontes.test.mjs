// Seleção e entrega de fontes: artigo pedido, fonte fraca fora, aderência e fontes realmente usadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarIndice, buscarFontes, referenciaExata, fonteDe, K_PADRAO } from '../shared/busca.mjs';
import { fontesUsadas, marcarFontesUsadas } from '../shared/verificacao.mjs';

const indice = criarIndice(JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8')));
const f = function (q, o) { return buscarFontes(indice, q, Object.assign({ k: K_PADRAO }, o || {})); };

test('fontes: "art. 17 da NOB/SUAS" traz o artigo 17 da NOB/SUAS, e só ele e o que é do mesmo documento', () => {
  const r = f('o que diz o art. 17 da NOB/SUAS 2012?');
  assert.ok(r.length >= 1);
  for (const x of r) { assert.equal(x.trecho.doc, 'nob-suas-2012'); assert.match(x.trecho.referencia, /^art\. 17/); assert.equal(x.aderencia, 'alta'); }
});

test('fontes: parágrafo e inciso pedidos vêm logo depois do artigo', () => {
  const p = f('art. 20 § 3º da Lei 8.742').map(function (x) { return x.trecho.referencia; });
  assert.ok(p.includes('art. 20, § 3º'), p.join(' | '));
  assert.ok(f('o que diz o art. 17, XV da NOB/SUAS')[0].trecho.referencia.endsWith('XV'));
});

test('fontes: artigo que a base não tem não vira trecho de outro documento', () => {
  const r = f('artigo 5 da Constituição Federal');
  assert.ok(r.every(function (x) { return x.trecho.doc === 'cf-1988-extratos' && x.aderencia === 'baixa'; }));
});

test('fontes: o documento citado vale para os trechos dele (Decreto 6.214, Lei 14.601)', () => {
  assert.ok(f('o que fala o Decreto 6.214 sobre o BPC?').every(function (x) { return x.trecho.doc === 'decreto-6214-2007' && x.aderencia !== 'baixa'; }));
  assert.ok(f('o que a Lei 14.601 diz sobre o benefício da primeira infância').some(function (x) { return x.trecho.doc === 'lei-14601-2023'; }));
});

test('fontes: o termo mais característico da pergunta tira a fonte que só repete palavras comuns', () => {
  const docs = f('como funciona o sigilo no registro do psicólogo?').map(function (x) { return x.trecho.doc; });
  assert.ok(!docs.includes('bolsa-familia-2026'), docs.join(', '));
});

test('fontes: pergunta de unidade com diretório traz menos fontes e nenhuma norma fraca', () => {
  const r = f('qual o telefone do CRAS Cauamé?', { modo: 'consulta', temDiretorio: true });
  assert.ok(r.length <= 3);
  assert.equal(r[0].trecho.doc, 'argo-enderecos-diretorio');
});

test('fontes: o que já funcionava continua (BPC, cesta básica, Censo SUAS, município)', () => {
  assert.ok(f('quem pode receber BPC').some(function (x) { return /decreto-6214|loas/.test(x.trecho.doc); }));
  assert.ok(f('aluguel social').some(function (x) { return x.trecho.doc === 'decreto-6307-2007'; }));
  assert.equal(f('quantos psicólogos no censo SUAS')[0].trecho.doc, 'censo-suas-2025-roraima-psicologos');
  assert.equal(f('quantas famílias no CadÚnico em Pacaraima')[0].trecho.doc, 'diagnostico-socioterritorial-pacaraima-2026');
  assert.equal(f('qual a diferença entre PAIF e PAEFI').length > 0, true);
});

test('fontes: aderência vai na fonte; sem pedido de artigo não há referência exata', () => {
  const r = f('o que é o PAIF?');
  assert.ok(['alta', 'media', 'baixa'].includes(fonteDe(r[0].trecho, r[0]).aderencia));
  assert.equal(referenciaExata(indice, 'o que é o PAIF?').exatos.length, 0);
});

test('fontesUsadas: separa o que a resposta usou do que só foi consultado', () => {
  const fontes = [
    { documento: 'NOB/SUAS 2012', norma: 'Resolução CNAS nº 33, de 2012', referencia: 'art. 17, XV' },
    { documento: 'LOAS', norma: 'Lei nº 8.742, de 1993', referencia: 'art. 24' },
    { documento: 'Bolsa Família (informações 2026)', norma: 'Material informativo do MDS', referencia: 'Canais de atendimento' }
  ];
  const texto = 'Segundo a NOB/SUAS 2012, art. 17, XV, a equipe deve... E a Lei 8.742, art. 24, também prevê isso.';
  assert.deepEqual(fontesUsadas(texto, fontes), [true, true, false]);
  const m = marcarFontesUsadas(texto, fontes.concat([fontes[2]]));
  assert.equal(m.length, 3);
  assert.equal(m[2].usada, false);
  assert.deepEqual(marcarFontesUsadas('Resposta geral sem citar nada.', fontes), fontes);
  // artigo diferente do citado: não conta como usada
  assert.deepEqual(fontesUsadas('Conforme a NOB/SUAS 2012, art. 99.', [fontes[0]]), [false]);
});
