import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarCitacoes, normalizarUrl } from '../shared/citacoes.mjs';
import { processarInvestigacao } from '../worker/investigacao-core.mjs';

const fontes = [{ title: 'Fonte oficial', url: 'https://example.org/politica', snippet: 'Resumo.', text: 'O programa atende famílias em situação de vulnerabilidade social no território.' }];

test('link que consta nas fontes é mantido (ignora barra final, âncora e pontuação)', () => {
  const r = verificarCitacoes('Veja https://example.org/politica/#x.', fontes);
  assert.equal(r.urlsRemovidas.length, 0);
  assert.equal(r.citacoes, 1);
  assert.equal(r.confiavel, true);
});

test('link inventado é removido e a síntese deixa de ser confiável', () => {
  const r = verificarCitacoes('Veja https://example.org/politica e https://inventado.gov.br/lei.', fontes);
  assert.deepEqual(r.urlsRemovidas, ['https://inventado.gov.br/lei']);
  assert.doesNotMatch(r.sintese, /inventado\.gov/);
  assert.match(r.sintese, /link removido/);
  assert.equal(r.confiavel, false);
});

test('aspas presentes na fonte passam; ausentes recebem marca; trecho curto é ignorado', () => {
  const ok = verificarCitacoes('Segundo https://example.org/politica, o programa “atende famílias em situação de vulnerabilidade social”.', fontes);
  assert.equal(ok.aspasNaoEncontradas.length, 0);
  const ruim = verificarCitacoes('Em https://example.org/politica consta “garante renda universal a todas as famílias do país”.', fontes);
  assert.equal(ruim.aspasNaoEncontradas.length, 1);
  assert.match(ruim.sintese, /citação não confirmada/);
  const curta = verificarCitacoes('É um “programa novo” https://example.org/politica', fontes);
  assert.equal(curta.aspasNaoEncontradas.length, 0);
});

test('síntese sem nenhuma fonte citada é sinalizada; citar pelo título basta', () => {
  assert.equal(verificarCitacoes('Texto solto sem fontes.', fontes).semCitacao, true);
  assert.equal(verificarCitacoes('Conforme a Fonte oficial, tudo certo.', fontes).semCitacao, false);
});

test('sem fontes nada é confiável', () => {
  const r = verificarCitacoes('Qualquer coisa', []);
  assert.equal(r.confiavel, false);
  assert.equal(r.semCitacao, false);
});

test('normalizarUrl rejeita esquemas estranhos', () => {
  assert.equal(normalizarUrl('javascript:alert(1)'), '');
  assert.equal(normalizarUrl('https://A.org/x/#h'), 'https://a.org/x');
});

test('investigação devolve verification e remove link inventado da síntese', async () => {
  const step = { async do(_n, cb) { return cb(); } };
  const r = await processarInvestigacao({}, step, { question: 'Como funciona a política pública?' }, {
    fakeAI: async (_p, { etapa }) => etapa === 'decomposicao'
      ? { response: JSON.stringify(['a?', 'b?', 'c?']) }
      : { response: 'Veja https://example.org/politica e https://falso.example.net/x.' },
    search: async () => [{ title: 'Fonte oficial', url: 'https://example.org/politica', snippet: 's' }],
    read: async (u) => ({ url: u, kind: 'html', status: 'ok', text: 'Conteúdo.' })
  });
  assert.deepEqual(r.verification.removedUrls, ['https://falso.example.net/x']);
  assert.equal(r.verification.reliable, false);
  assert.doesNotMatch(r.synthesis, /falso\.example/);
});
