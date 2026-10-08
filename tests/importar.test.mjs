import test from 'node:test';
import assert from 'node:assert/strict';
import { converterNorma } from '../scripts/importar-norma.mjs';
import { lerDocumento } from '../scripts/build-knowledge.mjs';

const META = { doc: 'lei-de-teste', titulo: 'Lei de Teste', norma: 'Lei fictícia nº 1, de 2000', ano: '2000' };

// Texto FICTÍCIO, só para testar o formato.
const TEXTO = `LEI Nº 1, DE 2000
O PRESIDENTE DA REPÚBLICA faz saber:
CAPÍTULO I
DAS DISPOSIÇÕES GERAIS
Art. 1º A lei de teste organiza o serviço de
exemplo em todo o território. (Redação dada pela Lei nº 2, de 2001)
12
Art. 2º Os serviços de exemplo têm por objetivos:
I - proteger o ambiente de testes;
II – garantir que os testes
passem sempre.
Art. 3º-A. Fica criado o selo de exemplo.
Art. 4º (Revogado pela Lei nº 3, de 2002)
Art. 5º Os municípios devem manter o cadastro em dia:
I - atualizar os dados todo mês, conforme a regra de teste definida pela lei fictícia e pelas normas complementares da lei de teste;
II - informar as mudanças ao órgão responsável, conforme a regra de teste definida pela lei fictícia e pelas normas complementares da lei de teste;
III - guardar os registros pelo prazo definido, conforme a regra de teste definida pela lei fictícia e pelas normas complementares da lei de teste.
§ 1º O descumprimento gera aviso.
Parágrafo único. Vale para todos.`;

test('importar: um trecho por artigo, com título, página e nota editorial fora', () => {
  const r = converterNorma(TEXTO, META);
  const t = Object.fromEntries(r.trechos.map(x => [x.referencia, x.texto]));
  assert.equal(t['art. 1º'], 'A lei de teste organiza o serviço de exemplo em todo o território.');
  assert.equal(t['art. 3º-A'], 'Fica criado o selo de exemplo.');
  assert.ok(!('art. 4º' in t), 'revogado não entra');
  assert.ok(!/12|CAPÍTULO|PRESIDENTE/.test(Object.values(t).join(' ')));
});

test('importar: artigo curto com incisos fica inteiro', () => {
  const t = converterNorma(TEXTO, META).trechos.find(x => x.referencia === 'art. 2º');
  assert.match(t.texto, /objetivos: I - proteger/);
  assert.match(t.texto, /garantir que os testes passem sempre\./);
});

test('importar: artigo longo vira um trecho por inciso e por parágrafo', () => {
  const refs = converterNorma(TEXTO, META, { max: 300 }).trechos.map(x => x.referencia);
  for (const r of ['art. 5º, I', 'art. 5º, II', 'art. 5º, III', 'art. 5º, § 1º', 'art. 5º, parágrafo único']) assert.ok(refs.includes(r), r);
  const inc = converterNorma(TEXTO, META, { max: 300 }).trechos.find(x => x.referencia === 'art. 5º, II');
  assert.match(inc.texto, /^Os municípios devem manter o cadastro em dia: informar as mudanças/);
});

test('importar: o .md gerado é lido de volta pelo build-knowledge', () => {
  const r = converterNorma(TEXTO, META, { max: 300 });
  const lidos = lerDocumento(r.md, 'lei-de-teste.md');
  assert.deepEqual(lidos.map(x => x.referencia), r.trechos.map(x => x.referencia));
  assert.deepEqual(lidos.map(x => x.texto), r.trechos.map(x => x.texto));
  assert.equal(lidos[0].id, 'lei-de-teste#1');
});

test('importar: texto sem "Art." dá erro claro; hífen de fim de linha gera aviso', () => {
  assert.throws(() => converterNorma('só um parágrafo qualquer', META), /Art\./);
  assert.ok(converterNorma('Art. 1º A assis-\ntência é um direito.', META).avisos.some(a => /hífen/.test(a)));
});
