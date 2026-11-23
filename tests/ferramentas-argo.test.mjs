// Ferramentas do Argo: o Paulus aprendeu a aba Ferramentas (16 cartões) em roteiros, num guia de apoio e em duas contas no aparelho.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { respostaDoPedido, valorPorExtenso } from '../shared/calculo-mais.mjs';

const lista = lerTodas();
const ferr = lista.filter(h => h.id.startsWith('ferramentas-argo-'));
const ids = (q, anteriores = [], app = 'argo') => escolherHabilidades(lista, q, anteriores, app).map(h => h.id);

test('há 23 roteiros das Ferramentas do Argo, dentro do teto, só no Argo, sem dado pessoal nem marcação', () => {
  assert.ok(ferr.length >= 23, 'roteiros: ' + ferr.length);
  for (const h of ferr) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id + ' tem ' + h.instrucoes.length);
    assert.deepEqual(h.apps, ['argo'], h.id + ' deve valer só no Argo');
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação');
  }
});

test('cada uma das 16 ferramentas tem roteiro próprio', () => {
  const catalogo = [
    'Relógio, cronômetro e temporizador', 'Calculadora', 'Renda per capita', 'Idade e datas', 'Gerador de QR Code', 'Contador de atendimentos',
    'Calculadora de prazos', 'Conferir NIS e CPF', 'Porcentagens', 'Soma e média de uma lista', 'Valor por extenso', 'Link de WhatsApp',
    'Formatar texto', 'Acompanhamento de famílias', 'Analisador de planilha', 'Bloco de notas'
  ];
  const nomes = ferr.map(h => h.nome.toLowerCase()).join(' | ');
  const marcas = ['relógio', 'calculadora do argo', 'renda per capita', 'idade e datas', 'qr code', 'contador de atendimentos', 'calculadora de prazos',
    'nis e cpf', 'porcentagens', 'soma e média', 'valor por extenso', 'link de whatsapp', 'formatar texto', 'acompanhamento de famílias', 'analisador de planilha', 'bloco de notas'];
  assert.equal(marcas.length, catalogo.length);
  for (const m of marcas) assert.ok(nomes.includes(m), 'falta roteiro de: ' + m);
});

test('os 16 cartões do app citados no código do Argo continuam batendo com os roteiros (se o app estiver ao lado)', () => {
  // O repositório do Argo não vem junto no Paulus; este teste só roda se o arquivo existir (ARGO_APP_JS=caminho de js/app.js).
  const f = process.env.ARGO_APP_JS;
  if (!f) return;
  const src = readFileSync(f, 'utf8');
  const bloco = /const TOOLS_CATALOG = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(bloco, 'TOOLS_CATALOG não achado');
  const n = (bloco[1].match(/id: '/g) || []).length;
  assert.equal(n, 16, 'o app agora tem ' + n + ' ferramentas: atualize os roteiros ferramentas-argo-*');
});

test('o pedido certo carrega o roteiro certo', () => {
  const casos = [
    ['quais ferramentas tem no argo?', 'ferramentas-argo-visao-geral'],
    ['o que a aba ferramentas faz', 'ferramentas-argo-visao-geral'],
    ['como criar um alarme no argo', 'ferramentas-argo-relogio'],
    ['como usar o cronômetro', 'ferramentas-argo-relogio'],
    ['o temporizador toca se eu trocar de aba?', 'ferramentas-argo-relogio'],
    ['como funciona a calculadora do argo, tem memória?', 'ferramentas-argo-calculadora'],
    ['como usar a ferramenta de renda per capita', 'ferramentas-argo-renda-per-capita'],
    ['o que significam as faixas da renda per capita na ferramenta', 'ferramentas-argo-renda-per-capita'],
    ['como ver a idade em meses de um bebê na ferramenta idade e datas', 'ferramentas-argo-idade-datas'],
    ['como gerar um qr code', 'ferramentas-argo-qr-code'],
    ['como usar o contador de atendimentos', 'ferramentas-argo-contador-atendimentos'],
    ['a calculadora de prazos conta feriados?', 'ferramentas-argo-prazos'],
    ['como conferir nis no argo', 'ferramentas-argo-nis-cpf'],
    ['como funciona o dígito verificador do cpf na ferramenta', 'ferramentas-argo-nis-cpf'],
    ['como acrescentar percentual a um valor na calculadora de porcentagem', 'ferramentas-argo-porcentagens'],
    ['como fazer a soma e média de uma lista de valores', 'ferramentas-argo-soma-media-lista'],
    ['como escrever o valor por extenso para o recibo', 'ferramentas-argo-valor-extenso'],
    ['como abrir conversa no whatsapp sem salvar contato', 'ferramentas-argo-whatsapp-link'],
    ['como convidar várias pessoas para um grupo de whatsapp', 'ferramentas-argo-whatsapp-convite-grupo'],
    ['como padronizar nomes e tirar acentos', 'ferramentas-argo-formatar-texto'],
    ['como ver os retornos vencidos no acompanhamento de famílias', 'ferramentas-argo-acompanhamento-familias'],
    ['como achar duplicados no analisador de planilha', 'ferramentas-argo-analisador-planilha'],
    ['como exportar as notas em pdf no bloco de notas', 'ferramentas-argo-bloco-de-notas'],
    ['o que as ferramentas deixam salvo no aparelho', 'ferramentas-argo-privacidade'],
    ['qual ferramenta do argo uso para contar dias úteis', 'ferramentas-argo-qual-ferramenta'],
    ['como combinar as ferramentas do argo na rotina do dia', 'ferramentas-argo-rotina-do-dia'],
    ['abre a calculadora pra mim', 'ferramentas-argo-paulus-e-ferramentas'],
    ['meu alarme não tocou', 'ferramentas-argo-problemas-comuns']
  ];
  for (const [q, esperado] of casos) {
    const r = ids(q);
    assert.ok(r.includes(esperado), 'pergunta: ' + q + ' → ' + JSON.stringify(r) + ' (esperava ' + esperado + ')');
  }
});

test('só vale no Argo: nos outros apps nenhum roteiro de ferramenta entra', () => {
  for (const app of ['anona', 'umbrella', 'toth', 'grafia', 'verbus']) {
    const r = ids('quais ferramentas tem no argo? como usar o bloco de notas e o cronômetro', [], app);
    assert.ok(!r.some(i => i.startsWith('ferramentas-argo-')), app + ' → ' + JSON.stringify(r));
  }
});

test('não rouba perguntas dos outros roteiros', () => {
  const mantem = [
    ['como calcular renda per capita no excel', 'excel-calculos-do-servico'],
    ['quero aprender excel do zero', 'excel-visao-geral'],
    ['como fazer a soma de uma coluna no excel', 'excel-formulas-basicas'],
    ['como calcular idade no excel com datadif', 'excel-datas-horas'],
    ['como calcular dias úteis no excel', 'excel-datas-horas'],
    ['como juntar dois pdfs', null]
  ];
  for (const [q, esperado] of mantem) {
    const r = ids(q);
    if (esperado) assert.ok(r.includes(esperado), q + ' → ' + JSON.stringify(r));
    assert.ok(!r.some(i => i.startsWith('ferramentas-argo-')), q + ' puxou roteiro de ferramenta: ' + JSON.stringify(r));
  }
});

test('perguntas comuns do SUAS não puxam roteiro de ferramenta', () => {
  for (const q of ['como escrever um relatório técnico para o Ministério Público', 'o que é o PAIF', 'como fazer uma visita domiciliar',
    'quem tem direito ao BPC', 'qual o telefone do CAPS II', 'como funciona o CadÚnico', 'o que é SCFV', 'como registrar o atendimento no prontuário']) {
    const r = ids(q);
    assert.ok(!r.some(i => i.startsWith('ferramentas-argo-')), q + ' → ' + JSON.stringify(r));
  }
});

test('o guia de apoio está na base, é de apoio e fica no pacote geral', () => {
  const md = readFileSync(new URL('../knowledge/documentos/ferramentas-argo-guia-apoio.md', import.meta.url), 'utf8');
  assert.match(md, /^doc: ferramentas-argo-guia-apoio$/m);
  assert.match(md, /^tipo: apoio$/m);
  assert.match(md, /^revisao: pendente$/m);
  assert.ok(!/^pacote:/m.test(md), 'o guia das ferramentas do Argo vai no pacote geral (o app usa esse pacote)');
  const cat = JSON.parse(readFileSync(new URL('../knowledge/catalogo.json', import.meta.url), 'utf8'));
  const arr = Array.isArray(cat) ? cat : (cat.documentos || Object.values(cat));
  assert.ok(JSON.stringify(arr).includes('ferramentas-argo-guia-apoio'), 'o catálogo não lista o guia (rode npm run build:conhecimento)');
});

test('no aparelho: valor por extenso', () => {
  const casos = [
    [1, 'um real'], [2, 'dois reais'], [21, 'vinte e um reais'], [100, 'cem reais'], [101, 'cento e um reais'], [1000, 'mil reais'],
    [1001, 'mil e um reais'], [1234, 'mil duzentos e trinta e quatro reais'], [2000, 'dois mil reais'], [1000000, 'um milhão de reais'],
    [1000001, 'um milhão e um reais'], [2500000, 'dois milhões e quinhentos mil reais'], [0.01, 'um centavo'], [0.5, 'cinquenta centavos'],
    [1621.5, 'mil seiscentos e vinte e um reais e cinquenta centavos']
  ];
  for (const [v, t] of casos) assert.equal(valorPorExtenso(v), t, String(v));
  assert.equal(valorPorExtenso(0), '');
  assert.equal(valorPorExtenso(1e12), null);
  const pedidos = [
    ['valor por extenso de 1621,50', 'R$ 1.621,50 (mil seiscentos e vinte e um reais e cinquenta centavos)'],
    ['1.621,50 por extenso', 'R$ 1.621,50 (mil seiscentos e vinte e um reais e cinquenta centavos)'],
    ['1621.50 por extenso', 'R$ 1.621,50 (mil seiscentos e vinte e um reais e cinquenta centavos)'],
    ['escreva 350 reais por extenso', 'R$ 350,00 (trezentos e cinquenta reais)'],
    ['valor por extenso de R$ 1.000.000', 'R$ 1.000.000,00 (um milhão de reais)']
  ];
  for (const [q, t] of pedidos) {
    const r = respostaDoPedido(q);
    assert.ok(r, q);
    assert.ok(r.texto.includes(t), q + ' → ' + r.texto);
  }
});

test('no aparelho: acréscimo e desconto em porcentagem, sem roubar a variação percentual', () => {
  assert.match(respostaDoPedido('acrescentar 10% a 1621').texto, /= 1\.783,1$/);
  assert.match(respostaDoPedido('aumentar 1621 em 10%').texto, /= 1\.783,1$/);
  assert.match(respostaDoPedido('descontar 15% de 200').texto, /= 170$/);
  assert.match(respostaDoPedido('reduzir 200 em 15%').texto, /= 170$/);
  assert.match(respostaDoPedido('de 1500 para 1621 qual a variação').texto, /variação percentual/);
  assert.match(respostaDoPedido('quanto é 15% de 1200?').texto, /= 180$/);
  // com contexto de caso, vai para a IA com a conta pronta (não responde sozinho)
  assert.equal(respostaDoPedido('acrescentar 10% a 1621 para o benefício eventual do CRAS desta família'), null);
});

test('o aviso de privacidade dos roteiros: NIS, CPF e telefone não são pedidos no chat', () => {
  for (const id of ['ferramentas-argo-nis-cpf', 'ferramentas-argo-whatsapp-link', 'ferramentas-argo-formatar-texto', 'ferramentas-argo-paulus-e-ferramentas']) {
    const h = lista.find(x => x.id === id);
    assert.match(h.instrucoes, /filtro/i, id + ' deve lembrar do filtro de dado pessoal');
  }
});

test('o README e o HABILIDADES.md citam as ferramentas do Argo', () => {
  const rd = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const hb = readFileSync(new URL('../docs/HABILIDADES.md', import.meta.url), 'utf8');
  assert.match(rd, /Ferramentas do Argo/);
  assert.match(hb, /Ferramentas do Argo/);
});
