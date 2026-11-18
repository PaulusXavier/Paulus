import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingDetectarIdioma, ingTextoEmIngles, ingParaBusca, ingRespostaLocal, ingInstrucaoParaIA, ingTermosDoGlossario } from '../shared/ingles.mjs';
import { ING_GLOSSARIO, ING_FALSOS_AMIGOS, ING_FRASES, ING_GUIANA } from '../shared/ingles-dados.mjs';
import { idiomaDoPedido, respostaLocalDeIdioma, avisoPessoalNoIdioma } from '../shared/idioma.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { ehSaudacao } from '../shared/pedido.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const lista = lerTodas();
const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));

test('inglês: detecta o idioma sem confundir com português nem espanhol', () => {
  const en = ['Hello, I need help with the Bolsa Familia', 'How do I apply for the BPC for my mother?', 'thanks', 'hi', 'Where is the nearest CRAS?',
    'my son does not go to school, what happens to the benefit?', 'Good morning', 'What documents do I need to register?', 'I need help with CadÚnico', 'Can you explain the CadUnico?'];
  const nao = ['qual o horário do CRAS?', 'Preciso de ajuda com o CadÚnico', 'Hola, necesito ayuda', 'bom dia', 'como faço o download do app online', 'explique o feedback do usuário',
    'o que é o BPC?', 'what? não entendi', 'mi hijo no va a la escuela', 'só a morte resolve', 'ele come na escola', 'mi hijo son dos'];
  for (const q of en) assert.equal(ingDetectarIdioma(q), 'en', q);
  for (const q of nao) assert.notEqual(ingDetectarIdioma(q), 'en', q);
  assert.equal(ingDetectarIdioma('ok'), 'indef');
});

test('inglês: idioma do pedido (português, espanhol e inglês) e herança da conversa', () => {
  const h = [{ papel: 'usuario', texto: 'How do I apply for Bolsa Familia?' }];
  assert.equal(idiomaDoPedido('Where is the CRAS?', []).resposta, 'en');
  assert.equal(idiomaDoPedido('Hola, necesito ayuda', []).resposta, 'es');
  assert.equal(idiomaDoPedido('qual o horário do CRAS?', []).resposta, 'pt');
  assert.equal(idiomaDoPedido('ok', h).resposta, 'en');
  assert.equal(idiomaDoPedido('and for children?', h).resposta, 'en');
  assert.equal(idiomaDoPedido('obrigado', h).resposta, 'pt');
  assert.equal(idiomaDoPedido('gracias', h).resposta, 'es');
  assert.equal(idiomaDoPedido('escreva um e-mail em inglês para a família', []).textoEn, true);
  assert.equal(ingTextoEmIngles('como faço o cadastro?'), false);
});

test('inglês: a busca recebe os termos em português', () => {
  const t = ingParaBusca('How do I apply for the BPC for my mother who has a disability?');
  assert.match(t, /cadastro|inscricao/);
  assert.match(t, /deficiencia/);
  assert.match(t, /mae/);
  assert.equal(ingParaBusca('Como faço a inscrição?'), '');
  assert.match(ingParaBusca('my son does not go to school, what happens to the benefit?'), /escola/);
});

test('inglês: vocabulário, frases e falsos amigos respondem no aparelho', () => {
  const r1 = ingRespostaLocal('como se diz certidão de nascimento em inglês?');
  assert.equal(r1.tipoLocal, 'glossario');
  assert.match(r1.texto, /birth certificate/);
  const r2 = ingRespostaLocal('How do you say birth certificate in Portuguese?');
  assert.match(r2.texto, /certidão de nascimento/);
  assert.match(ingRespostaLocal('como se diz CRAS em inglês').texto, /Social Assistance Reference Center/);
  assert.match(ingRespostaLocal('frases em inglês para acolhida').texto, /Good morning, welcome/);
  assert.match(ingRespostaLocal('frases em inglês para violência').texto, /Are you safe/);
  assert.equal(ingRespostaLocal('falsos amigos português inglês').tipoLocal, 'falsos_amigos');
  assert.match(ingRespostaLocal('vocabulário da Guiana').texto, /Guiana/);
  assert.equal(ingRespostaLocal('o que é CRAS?'), null);
  assert.equal(ingRespostaLocal('como se diz xyzabc em inglês'), null);
  // o roteador de idiomas não mistura os dois
  assert.equal(respostaLocalDeIdioma('falsos amigos português inglês').idioma, 'en');
  assert.equal(respostaLocalDeIdioma('falsos amigos português espanhol').idioma, 'es');
  assert.match(respostaLocalDeIdioma('como se diz abrigo em espanhol').texto, /albergue/);
  assert.match(respostaLocalDeIdioma('como se diz abrigo em inglês').texto, /shelter/);
});

test('inglês: os dados estão completos e o nome oficial do serviço fica em português', () => {
  const todos = Object.values(ING_GLOSSARIO).flat();
  assert.ok(todos.length >= 90, String(todos.length));
  assert.ok(todos.every((e) => e[0] && e[1]));
  assert.ok(ING_FALSOS_AMIGOS.length >= 20 && ING_GUIANA.length >= 8);
  for (const k of ['acolhida', 'documentos', 'saude', 'violencia', 'beneficios', 'telefone', 'despedida']) assert.ok(ING_FRASES[k][1].length >= 4, k);
  assert.ok(ingTermosDoGlossario(['Bolsa Familia and BPC'], 8).length >= 2);
  const i = ingInstrucaoParaIA({ resposta: 'en' }, 'How do I apply for the Bolsa Familia?', []);
  assert.match(i, /INGLÊS/);
  assert.equal(ingInstrucaoParaIA({ resposta: 'pt', textoEn: false }, 'x', []), '');
});

test('inglês: socorro mostra o cartão em inglês com os números do Brasil', () => {
  const deve = ['I want to die', 'I want to kill myself', 'i dont want to live anymore', "I'm thinking about suicide", 'my neighbor tried to commit suicide', 'my son is suicidal',
    'he wants to kill himself', 'I cut myself again', 'my husband beats me', 'he hits me every day', 'I get death threats', 'he is going to kill me', 'she hits her child', 'he raped me',
    'the baby is not breathing', 'he took an overdose', 'she is unconscious', 'help me', 'please help', 'I am going to hit my child', 'the child was locked alone for three days',
    'I wish I was dead', 'life is not worth living', 'I want to jump off a bridge'];
  for (const q of deve) { const c = detectarCrise(q); assert.ok(c, q); assert.equal(c.idioma, 'en', q); assert.ok(c.telefones.length >= 1, q); }
  const c = detectarCrise('I want to kill myself');
  assert.equal(c.pessoal, true);
  assert.deepEqual(c.telefones.map((t) => t.numero), ['188', '192']);
  assert.match(c.titulo, /Risk to life/);
  assert.match(detectarCrise('my husband beats me').titulo, /violence/i);
});

test('inglês: pergunta técnica e expressão não disparam o cartão', () => {
  const nao = ['how do I assess suicide risk?', 'What is domestic violence?', 'I want to die laughing', 'he hit me with a ball', 'I am dying to know about the BPC', 'What are the warning signs of suicide?',
    'Hello, I need help with the Bolsa Familia', 'I need help', 'Where is the emergency department?', 'my phone died', 'I got my flu shot', 'how should I report child abuse?', 'Is reporting violence mandatory?',
    'What is the number for SAMU?', 'How do I talk to a person who is suicidal?', 'killing time at the CRAS', 'I am tired of waiting in line', 'what is the help line for women?', 'the child needs a vaccine shot'];
  for (const q of nao) assert.equal(detectarCrise(q), null, q);
});

test('inglês: o socorro em português e em espanhol continua igual', () => {
  const pt = detectarCrise('quero morrer');
  assert.equal(pt.idioma, undefined);
  assert.match(pt.titulo, /Risco de vida/);
  assert.equal(detectarCrise('Quiero morir').idioma, 'es');
  assert.equal(detectarCrise('qual o endereço do pronto-socorro?'), null);
  assert.equal(detectarCrise('Qual o horário do CRAS?'), null);
});

test('inglês: dado pessoal em inglês é barrado e a pergunta comum passa', () => {
  const deve = ["my son's name is John Smith and he does not go to school", 'My name is Maria Gonzalez', 'his name is john smith', 'the child called Carlos Rodriguez does not attend', 'her passport number is A1234567',
    'passport 123456789', 'ID card: 12345678', 'John Smith receives Bolsa Familia', 'Mrs. Lopez came today', 'Mr Singh came yesterday', 'my phone number is 0414-1234567', 'call me at +592 600 1234',
    'born on 12/03/2015', 'date of birth 05-10-2012', 'born on March 12, 2015', 'he lives at 12 Main Street', 'she lives on Rua das Flores number 12', 'Peter, 45 years old, from Guyana',
    'MARIA GONZALEZ receives help', 'the patient Luis Torres', 'I am Maria Silva and I need help', "I'm John Smith", 'my neighbor Pedro Ramirez hits his wife', 'Family Smith Brown needs help', 'my email is a@b.com'];
  for (const q of deve) assert.equal(temDadoPessoal(q), true, q);
  const nao = ['How do I apply for the Bolsa Familia?', 'Hello, I need help with the CadUnico', 'my son does not go to school, what happens to the benefit?', 'Where is the CRAS Cristiana Vicente Nunes?',
    'What documents do I need for the BPC?', 'The family arrived from Guyana two years ago', 'Child Protection Council of Boa Vista', 'Can I receive Bolsa Familia if I live in Boa Vista?',
    'Good morning. I need information about Operation Welcome', 'My mother is 70 years old and wants the BPC', 'Social Assistance Reference Center', 'My son was born in Guyana', 'The CRAS is open Monday to Friday',
    'I am very worried about my son', 'I am looking for help', 'This is a question about the BPC', 'How do I say birth certificate in Portuguese?', 'What is the phone number of the CRAS?', 'I need an ID to register',
    'The child needs a passport', 'Child Labor Eradication Program', 'my number of children is three', 'what is the date of birth required on the form?', 'I was born in 1990', 'Family Health Strategy',
    'Mother and child care', 'What is the deadline for the CadÚnico update?'];
  for (const q of nao) assert.equal(temDadoPessoal(q), false, q);
  assert.match(avisoPessoalNoIdioma({ resposta: 'en' }, 'pt'), /To protect families/);
  assert.equal(avisoPessoalNoIdioma({ resposta: 'pt' }, 'AVISO'), 'AVISO');
});

test('inglês: cumprimentos em inglês são saudação', () => {
  assert.equal(ehSaudacao('Hello, good morning'), true);
  assert.equal(ehSaudacao('thank you'), true);
  assert.equal(ehSaudacao('hello, I need help with the BPC'), false);
});

test('inglês: existem os roteiros ingles-* e cada pedido chama o roteiro certo', () => {
  const en = lista.filter((h) => h.id.startsWith('ingles-'));
  assert.ok(en.length >= 18, String(en.length));
  const ids = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);
  const casos = [
    ['quero aprender inglês do trabalho', 'ingles-visao-geral'],
    ['acolhida em inglês, como receber guianense', 'ingles-acolhida-atendimento'],
    ['falsos amigos inglês', 'ingles-falsos-amigos'],
    ['inglês da guiana, crioulo guianense', 'ingles-guiana-crioulo'],
    ['escrever em inglês um bilhete para a família', 'ingles-escrever-para-familia'],
    ['agendar em inglês por telefone', 'ingles-telefone-agendamento'],
    ['explicar bolsa família em inglês', 'ingles-beneficios-explicar'],
    ['violência em inglês, relato de violência em inglês', 'ingles-violencia-protecao'],
    ['números em inglês e horas em inglês', 'ingles-numeros-datas-horas'],
    ['treinar inglês, simulação em inglês', 'ingles-estudar-por-situacao'],
    ['ler artigo em inglês de psicologia', 'ingles-ler-artigos-psicologia'],
    ['escrever e-mail em inglês', 'ingles-escrever-email-profissional']
  ];
  for (const [q, id] of casos) assert.ok(ids(q).includes(id), q + ' -> ' + ids(q).join(','));
});

test('inglês: o guia de apoio entra na base com trechos de até 700 caracteres', () => {
  const trechos = base.filter((t) => t.doc === 'ingles-guia-apoio');
  assert.ok(trechos.length >= 10, String(trechos.length));
  assert.ok(trechos.every((t) => t.texto.length <= 700));
});

function ambiente() {
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: 'https://paulusxavier.github.io', AI: { async run(modelo, params) { chamadas.push(params); return { response: 'Answer.' }; } } };
  return { env, chamadas };
}
const pedido = (corpo, ip) => new Request('https://paulus.exemplo.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://paulusxavier.github.io', 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo) });

test('inglês (Worker): pergunta em inglês leva a instrução de idioma; a de português não; dado pessoal e socorro respondem em inglês sem IA', async () => {
  const m = criarManipulador({ base, apps: APPS, habilidades: lista });
  const a = ambiente();
  const r = await m(pedido({ pergunta: 'How do I apply for the Bolsa Familia?' }, '8.8.8.1'), a.env);
  assert.equal(r.status, 200);
  assert.match(a.chamadas.map((c) => c.messages.map((x) => x.content).join('\n')).join('\n'), /IDIOMA: o\(a\) profissional escreveu em INGLÊS/);

  const b = ambiente();
  await m(pedido({ pergunta: 'Como faço a inscrição no Bolsa Família?' }, '8.8.8.2'), b.env);
  assert.doesNotMatch(b.chamadas.map((c) => c.messages.map((x) => x.content).join('\n')).join('\n'), /INGLÊS/);

  const c = ambiente();
  const jp = await (await m(pedido({ pergunta: "my son's name is John Smith and he does not go to school" }, '8.8.8.3'), c.env)).json();
  assert.match(jp.resposta, /To protect families/);
  assert.equal(c.chamadas.length, 0);

  const d = ambiente();
  const jc = await (await m(pedido({ pergunta: 'my husband beats me and I am afraid' }, '8.8.8.4'), d.env)).json();
  assert.equal(jc.crise, true);
  assert.match(jc.resposta, /Report of violence/);
  assert.equal(d.chamadas.length, 0);

  const e = ambiente();
  await m(pedido({ pergunta: 'thanks' }, '8.8.8.5'), e.env);
  assert.match(e.chamadas.map((x) => x.messages.map((y) => y.content).join('\n')).join('\n'), /inglês simples/);
});

test('inglês (cliente): vocabulário no aparelho, aviso e socorro em inglês, sem rede', async () => {
  const mod = await import('../client/paulus.mjs');
  const P = mod.default;
  const r = await P.perguntar('como se diz certidão de nascimento em inglês?');
  assert.equal(r.tipo, 'ingles');
  assert.match(r.texto, /birth certificate/);
  const bloq = await P.perguntar('My name is Maria Gonzalez and I need help');
  assert.equal(bloq.tipo, 'bloqueio');
  assert.match(bloq.texto, /To protect families/);
  const crise = await P.perguntar('I want to kill myself');
  assert.equal(crise.tipo, 'crise');
});
