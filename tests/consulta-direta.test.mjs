// Consulta de unidade sem IA: telefone, endereço e horário de UMA unidade saem da ficha; qualquer dúvida segue para a IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaDiretaDaFicha } from '../shared/consulta-direta.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

const CAUAME = { nome: 'CRAS Cauamé', grupo: 'CRAS', endereco: 'Av. Carlos Pereira de Melo, 207 - Jardim Floresta, Boa Vista-RR', horario: 'Segunda a sexta, 08:00 às 18:00', telefones: '(95) 98410-1337', servicos: 'PAIF', descricao: 'CRAS da zona norte.' };
const UNIAO = { nome: 'CRAS União', grupo: 'CRAS', endereco: 'R. Hilda Sobral Guedes, 81 - Bairro União, Boa Vista-RR', horario: 'Segunda a sexta, 08:00 às 18:00', telefones: '(95) 98405-9001', servicos: 'PAIF', descricao: '' };
const ITINERANTE = { nome: 'CRAS Itinerante', grupo: 'CRAS', endereco: 'R. Maj. Manoel Corrêa, 620 - São Francisco, Boa Vista-RR', horario: 'N/A', telefones: 'N/A', servicos: '', descricao: '' };
const RODOVIA = { nome: 'UBS Vila Jardim', grupo: 'UBS', endereco: 'Vila Jardim', horario: '', telefones: '', servicos: '', descricao: '' };
const FICHAS = [CAUAME, UNIAO, ITINERANTE, RODOVIA];

test('consulta direta: telefone de uma unidade sai da ficha', () => {
  const r = respostaDiretaDaFicha('qual o telefone do CRAS Cauamé?', FICHAS);
  assert.ok(r);
  assert.equal(r.unidade, 'CRAS Cauamé');
  assert.match(r.texto, /\(95\) 98410-1337/);
  assert.ok(!/98405-9001/.test(r.texto), 'não pode trazer o telefone de outra unidade');
  assert.match(r.texto, /confirme com a unidade/i);
});

test('consulta direta: telefone, endereço e horário juntos viram lista, e só o que foi pedido entra', () => {
  const r = respostaDiretaDaFicha('telefone, endereço e horário do CRAS União', FICHAS);
  assert.match(r.texto, /Telefone: \(95\) 98405-9001/);
  assert.match(r.texto, /Endereço: R\. Hilda Sobral Guedes, 81/);
  assert.match(r.texto, /Horário: Segunda a sexta/);
  const so = respostaDiretaDaFicha('onde fica o CRAS Cauamé', FICHAS);
  assert.match(so.texto, /Av\. Carlos Pereira de Melo, 207/);
  assert.ok(!/- Telefone|98410/.test(so.texto));
});

test('consulta direta: dado que a ficha não tem não é inventado, e endereço só de bairro vem com aviso', () => {
  const sem = respostaDiretaDaFicha('telefone e horário do CRAS Itinerante', FICHAS);
  assert.match(sem.texto, /Telefone: não informado na ficha do Argo/);
  assert.match(sem.texto, /Horário: não informado na ficha do Argo/);
  const bairro = respostaDiretaDaFicha('qual o endereço da UBS Vila Jardim', FICHAS);
  assert.match(bairro.texto, /só informa o bairro ou a rodovia/);
});

test('consulta direta: na dúvida devolve null e a pergunta segue para a IA', () => {
  const nao = (p, fichas) => assert.equal(respostaDiretaDaFicha(p, fichas || FICHAS), null, p);
  nao('qual o telefone do CRAS?');                                   // genérico: serve a mais de uma unidade
  nao('telefone do CRAS Pintolândia');                               // unidade que não veio nas fichas
  nao('como encaminho uma família para o CRAS Cauamé? qual o telefone'); // pede mais que o dado
  nao('telefone do CRAS Cauamé do bairro Caimbé');                   // pede o território, não o dado da ficha
  nao('quais os telefones dos CRAS');                                // várias unidades
  nao('o que o CRAS Cauamé oferece');                                // sem pedido de telefone, endereço ou horário
  nao('telefone do CRAS Cauamé e do CRAS União');                    // duas unidades
  nao('qual o telefone do CRAS Cauamé', []);                         // sem fichas
  nao('qual o telefone do CRAS Cauamé', [CAUAME, Object.assign({}, CAUAME, { endereco: 'Outro endereço, 1' })]); // duas fichas com o mesmo nome e endereços diferentes
});

function ambiente() {
  const chamadas = [];
  return { chamadas, env: { ALLOWED_ORIGINS: 'https://paulusxavier.github.io', AI: { async run(m, p) { chamadas.push(m); return { response: 'Resposta da IA.' }; } } } };
}
const pedir = (m, env, corpo) => m(new Request('https://x/', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://paulusxavier.github.io' }, body: JSON.stringify(Object.assign({ app: 'argo', historico: [], fichas: FICHAS }, corpo)) }), env);

test('consulta direta no Worker: não chama a IA, em JSON e em streaming', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const a = ambiente();
  const j = await (await pedir(m, a.env, { pergunta: 'qual o telefone do CRAS Cauamé?' })).json();
  assert.match(j.resposta, /98410-1337/);
  assert.equal(j.direta, true);
  const s = await (await pedir(m, a.env, { pergunta: 'qual o telefone do CRAS Cauamé?', stream: true })).text();
  assert.match(s, /98410-1337/);
  assert.match(s, /\[DONE\]/);
  assert.equal(a.chamadas.length, 0, 'nenhuma chamada à IA');
});

test('consulta direta no Worker: pergunta ambígua ou com explicação ainda vai para a IA', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const a = ambiente();
  const j = await (await pedir(m, a.env, { pergunta: 'qual o telefone do CRAS?' })).json();
  assert.equal(j.resposta, 'Resposta da IA.');
  assert.ok(a.chamadas.length >= 1);
});

test('consulta direta no Worker: CONSULTA_DIRETA="desligado" volta ao caminho da IA', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const a = ambiente();
  a.env.CONSULTA_DIRETA = 'desligado';
  const j = await (await pedir(m, a.env, { pergunta: 'qual o telefone do CRAS Cauamé?' })).json();
  assert.equal(j.resposta, 'Resposta da IA.');
  assert.ok(a.chamadas.length >= 1);
});

test('consulta direta no Worker: pergunta com dado pessoal continua barrada antes de tudo', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const a = ambiente();
  const j = await (await pedir(m, a.env, { pergunta: 'telefone do CRAS Cauamé, o CPF da dona é 123.456.789-09' })).json();
  assert.ok(!/98410-1337/.test(j.resposta));
  assert.equal(a.chamadas.length, 0);
});
