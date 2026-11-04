import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedeAnalise, lerRaciocinio, montarMensagensRaciocinio, buscaDoRaciocinio, completarAchados, conferirRaciocinio } from '../worker/raciocinar.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { montarMensagens } from '../worker/prompt.mjs';

const ORIGEM = 'https://paulusxavier.github.io';

test('pedeAnalise: pergunta de análise sim; dado simples, saudação e ajuste não', () => {
  assert.equal(pedeAnalise('uma mãe com três filhos perdeu o benefício, devo registrar como visita ou como acolhida?', 'normal'), true);
  assert.equal(pedeAnalise('posso encaminhar uma família para o CREAS sem ela concordar com o acompanhamento?', 'normal'), true);
  assert.equal(pedeAnalise('qual o telefone do CRAS Cauamé?', 'consulta'), false);
  assert.equal(pedeAnalise('qual o horário do CRAS', 'normal'), false);
  assert.equal(pedeAnalise('obrigado pela ajuda', 'saudacao'), false);
  assert.equal(pedeAnalise('deixe mais formal esse ofício que você escreveu agora', 'refinamento'), false);
});

test('lerRaciocinio: lê linhas rotuladas, tolera lista e negrito, e descarta fora do formato', () => {
  const r = lerRaciocinio('- **FATOS:** mãe com três filhos\nFONTE: nada nas fontes\nEXCEÇÃO: se houve descumprimento\nFALTA: lei municipal\nCAMINHO: acolher e conferir a regra\nSEGURANCA: media');
  assert.ok(r);
  assert.match(r.texto, /^FATOS: mãe com três filhos/);
  assert.equal(r.campos.SEGURANCA, 'media');
  assert.equal(lerRaciocinio('SEM ANALISE'), null);
  assert.equal(lerRaciocinio(''), null);
  assert.equal(lerRaciocinio('Claro! Vou ajudar com isso.'), null);
  assert.equal(lerRaciocinio('FATOS: só isso'), null);
});

test('montarMensagens: <raciocinio> entra no prompt como rascunho; em suicídio e em ajuste não entra', () => {
  const app = APPS.umbrella;
  const base = { app, historico: [], fichas: [], achados: [], pergunta: 'posso encaminhar sem consentimento?', raciocinio: 'CAMINHO: conferir consentimento' };
  const normal = montarMensagens({ ...base, suicidio: false });
  assert.match(normal[normal.length - 1].content, /<raciocinio>\nCAMINHO: conferir consentimento\n<\/raciocinio>/);
  assert.match(normal[0].content, /NÃO é fonte/);
  const tema = montarMensagens({ ...base, suicidio: true });
  assert.doesNotMatch(tema[tema.length - 1].content, /<raciocinio>/);
  const aj = montarMensagens({ ...base, suicidio: false, modo: 'refinamento' });
  assert.doesNotMatch(aj[aj.length - 1].content, /<raciocinio>/);
  const sem = montarMensagens({ ...base, raciocinio: '', suicidio: false });
  assert.doesNotMatch(sem[0].content, /ESQUELETO DE ANÁLISE/);
});

function ambiente(extra = {}) {
  const chamadas = [];
  const env = Object.assign({
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(modelo, params) {
        chamadas.push({ modelo, params });
        const sistema = (params.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
        if (/módulo de RACIOCÍNIO/.test(sistema)) return { response: 'FATOS: mãe com três filhos\nFONTE: nada nas fontes\nEXCECAO: descumprimento\nFALTA: lei municipal\nCAMINHO: acolher e registrar como acolhida\nSEGURANCA: media' };
        return { response: 'Resposta final.' };
      }
    }
  }, extra);
  return { env, chamadas };
}
function pedido(corpo) {
  return new Request('https://paulus-ia.exemplo.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify(corpo) });
}
const base = [];

test('worker: pergunta de análise faz o passo de raciocínio e a resposta final recebe o esqueleto', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({ app: 'umbrella', pergunta: 'uma mãe com três filhos perdeu o benefício, devo registrar como visita ou como acolhida?', stream: false }), env);
  assert.equal(r.status, 200);
  assert.equal(chamadas.length, 2);
  const final = chamadas[1].params.messages;
  assert.match(final[final.length - 1].content, /<raciocinio>[\s\S]*registrar como acolhida/);
  assert.equal((await r.json()).resposta, 'Resposta final.');
});

test('worker: sem análise (dado simples), RACIOCINIO=desligado e falha do passo não derrubam a resposta', async () => {
  let { env, chamadas } = ambiente();
  let m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'umbrella', pergunta: 'o que é o PAIF no CRAS?', stream: false }), env);
  assert.equal(chamadas.length, 1);

  ({ env, chamadas } = ambiente({ RACIOCINIO: 'desligado' }));
  m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'umbrella', pergunta: 'devo registrar como visita ou como acolhida o atendimento de uma mãe com três filhos?', stream: false }), env);
  assert.equal(chamadas.length, 1);

  const falha = ambiente();
  const original = falha.env.AI.run;
  falha.env.AI.run = async function (modelo, params) {
    const s = (params.messages || []).filter(x => x.role === 'system').map(x => x.content).join('\n');
    if (/módulo de RACIOCÍNIO/.test(s)) throw new Error('cota');
    return original.call(this, modelo, params);
  };
  m = criarManipulador({ base, apps: APPS });
  const r = await m(pedido({ app: 'umbrella', pergunta: 'devo registrar como visita ou como acolhida o atendimento de uma mãe com três filhos?', stream: false }), falha.env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).resposta, 'Resposta final.');
});

test('worker: tema de suicídio nunca passa pelo passo de raciocínio', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  await m(pedido({ app: 'umbrella', pergunta: 'como devo conduzir a conversa com uma pessoa que fala em suicídio e o que posso fazer pela rede?', stream: false }), env);
  assert.ok(!chamadas.some(c => (c.params.messages || []).some(x => /módulo de RACIOCÍNIO/.test(x.content || ''))));
});

test('pedeAnalise: seguimento curto depois de uma pergunta de análise continua sendo análise', () => {
  const hist = [{ papel: 'usuario', texto: 'posso encaminhar uma família para o CREAS sem ela concordar com o acompanhamento?' }, { papel: 'paulus', texto: 'Depende de...' }];
  assert.equal(pedeAnalise('e se ela recusar?', 'seguimento', hist), true);
  assert.equal(pedeAnalise('e se ela recusar?', 'seguimento', [{ papel: 'usuario', texto: 'qual o horário do CRAS' }]), false);
});

test('lerRaciocinio: ALTERNATIVA e RISCO seguem para a resposta; BUSCA fica de fora do texto e vira termos de busca', () => {
  const r = lerRaciocinio('FATOS: mãe\nFONTE: nada nas fontes\nCAMINHO: acolher\nALTERNATIVA: visita, custa tempo\nRISCO: registro vira prova\nBUSCA: benefício eventual cesta básica critério renda\nSEGURANCA: media');
  assert.match(r.texto, /ALTERNATIVA: visita/);
  assert.match(r.texto, /RISCO: registro vira prova/);
  assert.doesNotMatch(r.texto, /BUSCA/);
  assert.equal(buscaDoRaciocinio(r), 'beneficio eventual cesta basica criterio renda');
  assert.equal(buscaDoRaciocinio(lerRaciocinio('FATOS: a\nCAMINHO: b\nBUSCA: nenhuma')), '');
  assert.equal(buscaDoRaciocinio(lerRaciocinio('FATOS: a\nCAMINHO: b\nBUSCA: Maria da Silva CPF 123.456.789-09')), '');
});

test('completarAchados: junta no máximo 2 trechos novos e não repete', () => {
  const t = (id) => ({ trecho: { id }, score: 1 });
  const r = completarAchados([t('a'), t('b')], [t('b'), t('c'), t('d'), t('e')]);
  assert.deepEqual(r.achados.map(x => x.trecho.id), ['a', 'b', 'c', 'd']);
  assert.equal(r.novos, 2);
});

test('conferirRaciocinio: artigo e valor fora das fontes viram ATENCAO; o que está nas fontes ou na pergunta passa', () => {
  const achados = [{ trecho: { referencia: 'art. 17', titulo: 'x', norma: 'NOB/SUAS 2012', texto: 'Compete ao CRAS (art. 17).' } }];
  const r = lerRaciocinio('FATOS: a\nFONTE: art. 17 da NOB e art. 99 da lei; paga R$ 777\nCAMINHO: b');
  const c = conferirRaciocinio(r, achados, ['pergunta sem número']);
  assert.match(c.texto, /ATENCAO: o rascunho cita art\. 99, R\$ 777/);
  assert.doesNotMatch(c.texto, /ATENCAO[^\n]*art\. 17\b/);
  const ok = conferirRaciocinio(lerRaciocinio('FATOS: renda R$ 218\nCAMINHO: b'), achados, ['renda de R$ 218 por pessoa']);
  assert.doesNotMatch(ok.texto, /ATENCAO/);
});

test('worker: BUSCA do raciocínio traz trechos novos para a resposta final', async () => {
  const trechos = [
    { id: 'x1', doc: 'doc-a', titulo: 'Benefícios eventuais', referencia: 'art. 22', norma: 'LOAS 1993', texto: 'Benefícios eventuais são previstos para situações de vulnerabilidade temporária, como cesta básica, conforme critério de renda definido pelo município.' },
    { id: 'x2', doc: 'doc-b', titulo: 'Registro técnico', referencia: 'cap. 2', norma: 'Orientação', texto: 'Registro de atendimento descreve fatos e observações sem rótulos.' }
  ];
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: ORIGEM, AI: { async run(modelo, params) {
    chamadas.push(params);
    const sistema = (params.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
    if (/módulo de RACIOCÍNIO/.test(sistema)) return { response: 'FATOS: mãe\nFONTE: nada nas fontes\nCAMINHO: acolher\nBUSCA: beneficio eventual cesta basica criterio renda\nSEGURANCA: baixa' };
    return { response: 'Resposta final.' };
  } } };
  const m = criarManipulador({ base: trechos, apps: APPS });
  const r = await m(pedido({ app: 'umbrella', pergunta: 'uma mãe com três filhos perdeu o trabalho, devo orientar sobre a cesta básica ou registrar apenas o atendimento?', stream: false }), env);
  assert.equal(r.status, 200);
  const final = chamadas[chamadas.length - 1].messages;
  assert.match(final[final.length - 1].content, /Benefícios eventuais/);
});
