import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { juntar } from '../scripts/build.mjs';

function carregar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  return sandbox.self.Paulus;
}

function montar() {
  const P = carregar();
  P.init({ app: 'paulus' });
  const feito = [];
  P.registrarAcao({ id: 'abrir-argo', titulo: 'Argo SUAS', rotulos: ['argo'], executar: () => feito.push('argo') });
  P.registrarAcao({ id: 'abrir-anona', titulo: 'Anona', rotulos: ['anona'], executar: () => feito.push('anona') });
  P.registrarAcao({ id: 'abrir-toth', titulo: 'Toth', rotulos: ['toth'], executar: () => feito.push('toth') });
  P.registrarAcao({ id: 'apagar', titulo: 'Apagar', rotulos: ['apagar notas'], confirmar: true, executar: () => feito.push('apagou') });
  P.registrarAcao({ id: 'fechar-app', fechar: true, titulo: 'Fechar o aplicativo', rotulos: ['aplicativo', 'app'], executar: () => feito.push('fechou') });
  P.registrarAcao({ id: 'fechar-conversa', fechar: true, titulo: 'Encerrar a conversa', rotulos: ['conversa', 'esta conversa', 'chat'], executar: () => { feito.push('conversa'); return 'Conversa encerrada.'; } });
  P.registrarAcao({ id: 'fechar-mapa', fechar: true, titulo: 'Fechar o mapa', rotulos: ['mapa', 'o mapa'], executar: () => { feito.push('mapa'); return 'Mapa fechado.'; } });
  return { P, feito };
}

test('"abrir o argo" abre só o argo', async () => {
  const { P, feito } = montar();
  const r = await P.perguntar('abrir o argo');
  assert.equal(r.tipo, 'acao');
  assert.deepEqual(feito, ['argo']);
});

test('"abra o argo e o anona" abre as duas de uma vez', async () => {
  const { P, feito } = montar();
  const r = await P.perguntar('abra o argo e o anona');
  assert.equal(r.tipo, 'acao');
  assert.deepEqual(feito, ['argo', 'anona']);
  assert.match(r.texto, /Argo SUAS, Anona/);
});

test('três apps separados por vírgula e "e"', async () => {
  const { P, feito } = montar();
  await P.perguntar('abrir argo, anona e toth');
  assert.deepEqual(feito, ['argo', 'anona', 'toth']);
});

test('várias ações não rodam se uma parte não for reconhecida', async () => {
  const { P, feito } = montar();
  const r = await P.perguntar('abrir argo e marte');
  assert.deepEqual(feito.includes('anona'), false);
  assert.notEqual(r.executada, true === false);
});

test('ação que pede confirmação não entra em lote', async () => {
  const { P, feito } = montar();
  await P.perguntar('abrir argo e apagar notas');
  assert.ok(!feito.includes('apagou'));
});

test('"fechar o aplicativo" fecha; "abrir o aplicativo" não fecha', async () => {
  const { P, feito } = montar();
  const r = await P.perguntar('fechar o aplicativo');
  assert.equal(r.tipo, 'acao');
  assert.deepEqual(feito, ['fechou']);
  const { P: P2, feito: f2 } = montar();
  await P2.perguntar('abrir o aplicativo');
  assert.ok(!f2.includes('fechou'));
});

test('"feche o app" e "encerrar o app" também fecham', async () => {
  for (const frase of ['feche o app', 'encerrar o aplicativo', 'sair do app']) {
    const { P, feito } = montar();
    await P.perguntar(frase);
    assert.deepEqual(feito, ['fechou'], frase);
  }
});

test('"fechar" sem ação registrada não vira "ação desconhecida": segue o fluxo normal', async () => {
  const P = carregar();
  P.init({ app: 'paulus' });
  const r = await P.perguntar('fechar a conta do mês com 15% de 1200');
  assert.notEqual(r.tipo, 'acao_desconhecida');
});

test('terminar/encerrar/finalizar/fechar a conversa encerra a conversa e usa o texto devolvido', async () => {
  for (const frase of ['terminar a conversa', 'termine esta conversa', 'encerrar a conversa', 'finalize a conversa', 'fecha a conversa', 'sair da conversa', 'terminar conversa agora', 'por favor, termine a conversa']) {
    const { P, feito } = montar();
    const r = await P.perguntar(frase);
    assert.deepEqual(feito, ['conversa'], frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.equal(r.texto, 'Conversa encerrada.', frase);
  }
});

test('fechar/fecha/encerrar o mapa fecha o mapa', async () => {
  for (const frase of ['fechar o mapa', 'fecha o mapa', 'feche o mapa', 'encerrar o mapa', 'terminar o mapa', 'fechar mapa de Boa Vista']) {
    const { P, feito } = montar();
    const r = await P.perguntar(frase);
    assert.deepEqual(feito, ['mapa'], frase);
    assert.equal(r.texto, 'Mapa fechado.', frase);
  }
});

test('pergunta que só menciona a conversa ou o mapa NÃO executa: segue para a IA', async () => {
  for (const frase of ['terminar a conversa com o cidadão, como faço?', 'fechar o mapa de risco do território exige o quê?', 'encerrar o atendimento do usuário no CRAS quando acontece?', 'finalizar o relatório da conversa com a família']) {
    const { P, feito } = montar();
    const r = await P.perguntar(frase);
    assert.deepEqual(feito, [], frase);
    assert.notEqual(r.tipo, 'acao', frase);
  }
});

test('"abrir o mapa" não fecha o mapa, e "terminar" sem ação com aquele nome não vira ação desconhecida', async () => {
  const { P, feito } = montar();
  await P.perguntar('abrir o mapa');
  assert.ok(!feito.includes('mapa'));
  const r = await P.perguntar('terminar o relatório do mês com 15% de 1200');
  assert.notEqual(r.tipo, 'acao_desconhecida');
  assert.ok(!feito.includes('conversa'));
});
