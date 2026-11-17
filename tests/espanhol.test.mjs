import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { espDetectarIdioma, espIdiomaDoPedido, espParaBusca, espRespostaLocal, espInstrucaoParaIA, espTermosDoGlossario } from '../shared/espanhol.mjs';
import { ESP_GLOSSARIO, ESP_FALSOS_AMIGOS, ESP_FRASES } from '../shared/espanhol-dados.mjs';
import { detectarCrise } from '../shared/crise.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { ehSaudacao } from '../shared/pedido.mjs';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const lista = lerTodas();
const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));

test('espanhol: detecta o idioma sem confundir com português', () => {
  const es = ['Hola, necesito ayuda con el Cadastro Único', '¿Cómo me inscribo en el Bolsa Familia?', 'Quiero saber dónde queda la UBS', 'gracias', 'y para niños?', 'no quiero vivir más', 'mi hijo no va a la escuela, ¿qué pasa con el beneficio?'];
  const pt = ['qual o horário do CRAS?', 'Preciso de ajuda com o CadÚnico', 'não sei onde fica a UBS', 'Boa tarde, preciso de ajuda'];
  for (const q of es) assert.equal(espDetectarIdioma(q), 'es', q);
  for (const q of pt) assert.notEqual(espDetectarIdioma(q), 'es', q);
  assert.equal(espDetectarIdioma('ok'), 'indef');
});

test('espanhol: termo entre aspas não muda o idioma de quem escreve; pedido de texto em espanhol é reconhecido', () => {
  assert.equal(espIdiomaDoPedido('como se diz "necesito ayuda" em espanhol?', []).resposta, 'pt');
  const r = espIdiomaDoPedido('escreva uma carta em espanhol para a família', []);
  assert.equal(r.resposta, 'pt');
  assert.equal(r.textoEs, true);
  // mensagem neutra herda o idioma da conversa
  assert.equal(espIdiomaDoPedido('ok', [{ papel: 'usuario', texto: '¿Cómo me inscribo en el Bolsa Familia?' }]).resposta, 'es');
});

test('espanhol: a pergunta em espanhol ganha termos em português para a busca', () => {
  assert.match(espParaBusca('¿Cómo me inscribo en el Bolsa Familia?'), /cadastro/);
  assert.match(espParaBusca('mi hijo no va a la escuela, ¿qué pasa con el beneficio?'), /escola/);
  assert.match(espParaBusca('Tengo una pregunta sobre el BPC para persona mayor'), /idosa/);
  assert.equal(espParaBusca('qual o horário do CRAS?'), '');
});

test('espanhol: respostas locais (glossário, frases, falsos amigos, Venezuela)', () => {
  const g = espRespostaLocal('como se diz CRAS em espanhol?');
  assert.equal(g.tipoLocal, 'glossario');
  assert.match(g.texto, /Centro de Referencia de Asistencia Social/);
  assert.match(espRespostaLocal('como se diz certidão de nascimento em espanhol?').texto, /partida de nacimiento/);
  assert.match(espRespostaLocal('¿Cómo se dice partida de nacimiento en portugués?').texto, /certidão de nascimento/);
  assert.match(espRespostaLocal('como se diz abrigo em espanhol').texto, /agasalho/);
  assert.equal(espRespostaLocal('frases em espanhol para acolhida').tipoLocal, 'frases');
  assert.match(espRespostaLocal('frases em espanhol para violência').texto, /190/);
  assert.equal(espRespostaLocal('falsos amigos português espanhol').tipoLocal, 'falsos_amigos');
  assert.match(espRespostaLocal('falsos amigos português espanhol').texto, /me pega/);
  assert.match(espRespostaLocal('o que significa ahorita?').texto, /hora exata/);
  assert.equal(espRespostaLocal('vocabulário venezuelano').tipoLocal, 'venezuela');
  // não inventa: termo que não está no glossário ou pergunta comum não é resposta local
  assert.equal(espRespostaLocal('como se diz xyzabc em espanhol'), null);
  assert.equal(espRespostaLocal('o que é CRAS?'), null);
});

test('espanhol: os dados têm o tamanho esperado e nenhuma entrada vazia', () => {
  const n = Object.values(ESP_GLOSSARIO).reduce((a, b) => a + b.length, 0);
  assert.ok(n >= 100, String(n));
  for (const g of Object.values(ESP_GLOSSARIO)) for (const e of g) { assert.ok(e[0] && e[1]); }
  assert.ok(ESP_FALSOS_AMIGOS.length >= 15);
  assert.ok(Object.keys(ESP_FRASES).length >= 6);
  for (const [, [, frases]] of Object.entries(ESP_FRASES)) for (const f of frases) assert.ok(f[0] && f[1]);
});

test('espanhol: instrução para a IA só aparece quando o pedido é em espanhol ou pede texto em espanhol', () => {
  assert.equal(espInstrucaoParaIA(espIdiomaDoPedido('qual o horário do CRAS?', []), 'qual o horário do CRAS?', []), '');
  const q = '¿Cómo explico el Bolsa Familia a una madre?';
  const ins = espInstrucaoParaIA(espIdiomaDoPedido(q, []), q, []);
  assert.match(ins, /ESPAÑOL/);
  assert.match(ins, /embarazada/);
  assert.match(espInstrucaoParaIA(espIdiomaDoPedido('escreva em espanhol um bilhete para a família', []), 'escreva em espanhol um bilhete', []), /ESPANHOL/);
  assert.ok(espTermosDoGlossario(['como explicar o Bolsa Família e o Cadastro Único'], 6).length >= 2);
});

test('espanhol: socorro funciona em espanhol, com o cartão em espanhol e os números do Brasil', () => {
  const deve = ['quiero morir', 'me quiero matar', 'me voy a matar', 'no quiero vivir más', 'mi vida no tiene sentido', 'ya no aguanto más esta vida', 'quisiera desaparecer',
    'pienso en quitarme la vida', 'mi hija se corta los brazos', 'me dijeron que mi vecino quiere matarse', 'mi esposo me pega', 'mi marido me golpea todos los días', 'me va a matar',
    'me amenaza con matarme', 'mi hijo se desmayó', 'no respira el bebé', 'tomó muchas pastillas', 'la niña dijo que su padrastro abusó de ella', 'mi papá me pega',
    '¡auxilio!', '¡socorro!', 'estoy sufriendo violencia en casa', 'le dieron un tiro a mi hermano', 'voy a golpear a mi hijo', 'tengo ganas de lastimar a mi bebé',
    'el niño está encerrado sin comer hace dos días', 'hola quiero morirme', 'mi esposo me pega y no sé qué hacer', 'Maria Souza quiere matarse'];
  for (const q of deve) {
    const c = detectarCrise(q);
    assert.ok(c, 'deveria acionar o cartão: ' + q);
    assert.ok(c.telefones.length >= 1);
    assert.ok(c.telefones.every((t) => /^\d{3}$/.test(t.numero)));
  }
  const c = detectarCrise('quiero morir');
  assert.equal(c.idioma, 'es');
  assert.match(c.titulo, /Riesgo de vida/);
  assert.ok(c.telefones.some((t) => t.numero === '188') && c.telefones.some((t) => t.numero === '192'));
  assert.equal(c.pessoal, true);
  // quem relata um caso recebe o cuidado de terceiro, não o cartão pessoal
  assert.equal(detectarCrise('me dijeron que mi vecino quiere matarse').pessoal, false);
});

test('espanhol: pergunta técnica, expressão e queixa leve NÃO acionam o cartão', () => {
  const nao = ['¿Cómo evaluar el riesgo de suicidio?', '¿Cuál es el protocolo para casos de suicidio?', '¿Cómo me inscribo en el Cadastro Único?', 'Necesito ayuda con la cédula',
    'mi hijo no quiere ir a la escuela', '¿Qué es la violencia doméstica?', '¿Cuántos casos de violencia atiende el CREAS?', 'quiero morirme de risa', 'estoy cansado de esperar en la fila',
    'no aguanto más esta fila', 'voy a matar el tiempo', 'el niño pega un grito', 'me pega mucho el sol', 'ele me pega na escola', '¿Qué hago en caso de violencia doméstica?',
    'quiero inscribirme en el Bolsa Familia', '¿Dónde queda el CAPS?', 'No me alcanza la plata para comer', 'el bebé no respira bien por el catarro', '¿Cómo atender a una persona con riesgo de suicidio?',
    '¿Cómo abordar el tema del suicidio con adolescentes?', 'mi hijo se cayó pero está bien', 'Hola, buenos días'];
  for (const q of nao) assert.equal(detectarCrise(q), null, q);
});

test('espanhol: portunhol de quem relata violência aciona o cartão, mas "me pega na escola" não', () => {
  assert.ok(detectarCrise('Meu esposo me pega e eu não aguento mais'));
  assert.equal(detectarCrise('ele me pega na escola'), null);
  assert.equal(detectarCrise('meu pai me pega na escola todo dia'), null);
});

test('espanhol: o socorro em português continua igual', () => {
  const c = detectarCrise('quero morrer');
  assert.ok(c);
  assert.equal(c.subtipo, 'suicidio');
  assert.equal(c.idioma, undefined);
  assert.match(c.titulo, /Risco de vida/);
  assert.equal(detectarCrise('qual o endereço do pronto-socorro?'), null);
});

test('espanhol: dado pessoal em espanhol é barrado e a pergunta comum passa', () => {
  const deve = ['mi hijo se llama Juan Pérez y no va a la escuela', 'Mi nombre es María González', 'el niño llamado carlos rodriguez no asiste', 'su cédula es 12345678', 'cédula: V-12.345.678',
    'Juan Pérez recibe el bolsa familia', 'doña Maria Lopez vino hoy', 'mi teléfono es 0414-1234567', 'llámeme al +58 414 1234567', 'nació el 12/03/2015', 'vive en la calle 5 casa 12',
    'Pedro, 45 años, venezolano', 'MARIA GONZALEZ recibe ayuda', 'el paciente Luis Torres', 'pasaporte 123456789', 'mi esposo se llama pedro ramirez', 'fecha de nacimiento 05-10-2012'];
  for (const q of deve) assert.equal(temDadoPessoal(q), true, q);
  const nao = ['¿Cómo me inscribo en el Cadastro Único?', 'Hola, necesito ayuda con el Bolsa Familia', 'mi hijo no va a la escuela, ¿qué pasa con el beneficio?',
    '¿Dónde queda el CRAS Cristiana Vicente Nunes?', 'Necesito la cédula de identidad para el registro', '¿Qué documentos necesito para el BPC?', 'La familia llegó de Venezuela hace dos años',
    'Consejo Tutelar de Boa Vista', '¿Puedo recibir el Bolsa Familia si vivo en Boa Vista?', 'Hola, buenos días. Necesito información sobre la Operación Acogida',
    'Mi madre tiene 70 años y quiere el BPC', 'Centro de Referencia de Asistencia Social', 'Mi hijo nació en Venezuela', 'el CRAS atiende de lunes a viernes'];
  for (const q of nao) assert.equal(temDadoPessoal(q), false, q);
});

test('espanhol: cumprimentos em espanhol são saudação', () => {
  assert.equal(ehSaudacao('Hola, buenos días'), true);
  assert.equal(ehSaudacao('muchas gracias'), true);
  assert.equal(ehSaudacao('hola, necesito ayuda con el BPC'), false);
});

test('espanhol: existem os roteiros espanhol-* e cada pergunta chama o roteiro certo', () => {
  const es = lista.filter((h) => h.id.startsWith('espanhol-'));
  assert.ok(es.length >= 14, String(es.length));
  const ids = (q) => escolherHabilidades(lista, (q + ' ' + espParaBusca(q)).trim(), [], 'argo').map((h) => h.id);
  const casos = [
    ['quero aprender espanhol do trabalho', 'espanhol-visao-geral'],
    ['acolhida em espanhol, como receber venezuelano', 'espanhol-acolhida-atendimento'],
    ['falsos amigos espanhol', 'espanhol-falsos-amigos'],
    ['gíria venezuelana ahorita', 'espanhol-venezuela-regionalismos'],
    ['escreva em espanhol um bilhete para a família', 'espanhol-escrever-para-familia'],
    ['agendar em espanhol por telefone', 'espanhol-telefone-agendamento'],
    ['explicar bolsa familia em espanhol', 'espanhol-beneficios-explicar'],
    ['violência em espanhol, relato de violência espanhol', 'espanhol-violencia-protecao'],
    ['números em espanhol e horas em espanhol', 'espanhol-numeros-datas-horas'],
    ['treinar espanhol, simulação em espanhol', 'espanhol-estudar-por-situacao']
  ];
  for (const [q, id] of casos) assert.ok(ids(q).includes(id), q + ' -> ' + ids(q).join(','));
});

test('espanhol: o guia de apoio entra na base com trechos de até 700 caracteres', () => {
  const trechos = base.filter((t) => t.doc === 'espanhol-guia-apoio');
  assert.ok(trechos.length >= 10, String(trechos.length));
  assert.ok(trechos.every((t) => t.texto.length <= 700));
});

function ambiente() {
  const chamadas = [];
  const env = { ALLOWED_ORIGINS: 'https://paulusxavier.github.io', AI: { async run(modelo, params) { chamadas.push(params); return { response: 'Respuesta.' }; } } };
  return { env, chamadas };
}
const pedido = (corpo, ip) => new Request('https://paulus.exemplo.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://paulusxavier.github.io', 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo) });

test('espanhol (Worker): pergunta em espanhol leva a instrução de idioma; a de português não; dado pessoal recebe o aviso em espanhol', async () => {
  const m = criarManipulador({ base, apps: APPS, habilidades: lista });
  const a = ambiente();
  const r = await m(pedido({ pergunta: '¿Cómo me inscribo en el Bolsa Familia?' }, '9.9.9.1'), a.env);
  assert.equal(r.status, 200);
  const sistemaEs = a.chamadas.map((c) => c.messages.map((x) => x.content).join('\n')).join('\n');
  assert.match(sistemaEs, /IDIOMA: o\(a\) profissional escreveu em ESPAÑOL/);

  const b = ambiente();
  await m(pedido({ pergunta: 'Como faço a inscrição no Bolsa Família?' }, '9.9.9.2'), b.env);
  assert.doesNotMatch(b.chamadas.map((c) => c.messages.map((x) => x.content).join('\n')).join('\n'), /IDIOMA: o\(a\) profissional escreveu em ESPAÑOL/);

  const c = ambiente();
  const rp = await m(pedido({ pergunta: 'mi hijo se llama Juan Pérez y no va a la escuela' }, '9.9.9.3'), c.env);
  const j = await rp.json();
  assert.match(j.resposta, /Para proteger a las familias/);
  assert.equal(c.chamadas.length, 0);

  const d = ambiente();
  const rc = await m(pedido({ pergunta: 'mi esposo me pega y tengo miedo' }, '9.9.9.4'), d.env);
  const jc = await rc.json();
  assert.equal(jc.crise, true);
  assert.match(jc.resposta, /Relato de violencia/);
  assert.equal(d.chamadas.length, 0);
});
