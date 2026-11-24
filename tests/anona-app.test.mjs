// O Paulus aprendeu o app Anona inteiro: 32 roteiros anona-* (só valem no Anona), um guia de apoio e a descrição do app no Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const lista = lerTodas();
const an = lista.filter(h => h.id.startsWith('anona-'));
const ids = (q, anteriores = [], app = 'anona') => escolherHabilidades(lista, q, anteriores, app).map(h => h.id);

test('há 32 roteiros do Anona, dentro do teto, só no Anona, sem dado pessoal nem marcação', () => {
  assert.ok(an.length >= 32, 'roteiros: ' + an.length);
  for (const h of an) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id + ' tem ' + h.instrucoes.length);
    assert.deepEqual(h.apps, ['anona'], h.id + ' deve valer só no Anona');
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação');
  }
});

test('cada parte do app tem roteiro próprio', () => {
  const partes = ['visão geral', 'qual recurso', 'entrar', 'instalar', 'calendário', 'seu nis', 'notas', 'exportar', 'destaques', 'sicon', 'legenda', 'calculadora',
    'preencher', 'passo 1', 'passo 2', 'passo 3', 'passo 4', 'passo 5', 'passo 6', 'limpar', 'mapa e rotas: buscar', 'paradas', 'acompanhar', 'offline', 'rotas salvas',
    'o que sai', 'mascote', 'cartões', 'segurança', 'problemas', 'manutenção', 'rotina mensal'];
  const nomes = an.map(h => h.nome.toLowerCase()).join(' | ');
  for (const p of partes) assert.ok(nomes.includes(p), 'falta roteiro de: ' + p);
});

test('o pedido certo carrega o roteiro certo', () => {
  const casos = [
    ['o que o anona faz?', 'anona-visao-geral'],
    ['qual recurso do anona uso para dividir as famílias entre os técnicos', 'anona-qual-recurso'],
    ['esqueci minha senha do anona', 'anona-entrar-conta'],
    ['como instalar o anona no celular', 'anona-instalar-offline-atualizacao'],
    ['o anona funciona sem internet?', 'anona-instalar-offline-atualizacao'],
    ['como navegar pelo calendário do anona e ir para hoje', 'anona-calendario'],
    ['como digitar o final do nis no anona', 'anona-seu-nis-pagamento'],
    ['como salvar uma nota com ênfase no anona', 'anona-notas-do-dia'],
    ['como baixar o pdf das anotações do anona', 'anona-exportar-imprimir'],
    ['o que é o cronograma de repercussão do anona', 'anona-destaques-cronograma'],
    ['o que é recurso on-line no anona', 'anona-sicon-recurso-online'],
    ['o que significa o código de motivo 20a', 'anona-legenda-motivos'],
    ['como usar a calculadora de faltas do anona, panorama do ano', 'anona-calculadora-uso'],
    ['quantas faltas ainda posso ter? como preencher falando com o anona', 'anona-assistente-presenca'],
    ['como guardar a planilha do mds no anona e fazer backup', 'anona-planilha-mds-guardar'],
    ['como funciona a divisão por técnico do território volante', 'anona-divisao-territorio-volante'],
    ['como usar famílias recorrentes no anona', 'anona-familias-recorrentes'],
    ['como gerar o relatório individual com gráfico de efeitos no anona', 'anona-relatorio-individual'],
    ['como unificar folhas de família na rota de visita do anona', 'anona-rota-visita-unificar'],
    ['relatório dos abrigos da operação acolhida no anona', 'anona-abrigos-acolhida'],
    ['como limpar arquivos no anona e desfazer', 'anona-limpar-privacidade-planilhas'],
    ['como buscar um endereço no mapa e rotas do anona', 'anona-mapa-buscar-rota'],
    ['como colocar várias paradas e definir o tempo de visita no mapa do anona', 'anona-mapa-paradas-horarios'],
    ['como usar o acompanhar com gps e concluir parada no anona', 'anona-mapa-acompanhar-campo'],
    ['como baixar o mapa offline do anona', 'anona-mapa-offline'],
    ['como enviar aos meus aparelhos a rota salva no anona', 'anona-mapa-salvar-enviar'],
    ['o que o mapa do anona envia para a internet', 'anona-mapa-privacidade'],
    ['o paulus no anona vê as minhas notas?', 'anona-mascote-paulus'],
    ['onde ficam os valores em vigor e a devolução voluntária no anona', 'anona-cartoes-informativos'],
    ['o anona é seguro? lgpd e dados de famílias', 'anona-seguranca-lgpd'],
    ['o anona não funciona, deu erro', 'anona-problemas-comuns'],
    ['como cadastrar 2027 no anona', 'anona-manutencao-anual'],
    ['qual a rotina mensal da equipe usando o anona', 'anona-rotina-mensal-equipe']
  ];
  const falhas = [];
  for (const [q, esperado] of casos) {
    const r = ids(q);
    if (!r.includes(esperado)) falhas.push(q + ' → ' + JSON.stringify(r) + ' (esperava ' + esperado + ')');
  }
  assert.deepEqual(falhas, []);
});

test('só vale no Anona: nos outros apps nenhum roteiro anona-* entra', () => {
  for (const app of ['argo', 'umbrella', 'toth', 'grafia', 'verbus']) {
    for (const q of ['o que o anona faz?', 'como usar o mapa e rotas do anona com paradas', 'como guardar a planilha do mds no anona']) {
      const r = ids(q, [], app);
      assert.ok(!r.some(i => i.startsWith('anona-')), app + ' / ' + q + ' → ' + JSON.stringify(r));
    }
  }
});

test('roteiros antigos de condicionalidades continuam valendo', () => {
  assert.ok(ids('interpretar o resultado da calculadora de faltas, frequência escolar baixa').some(i => i === 'condicionalidades-anona-calculadora' || i.startsWith('anona-calculadora')));
});

test('perguntas comuns do SUAS não puxam roteiro do Anona', () => {
  for (const q of ['como escrever um relatório técnico para o Ministério Público', 'o que é o PAIF', 'como fazer uma visita domiciliar',
    'quem tem direito ao BPC', 'qual o telefone do CAPS II', 'como funciona o CadÚnico', 'o que é SCFV', 'como registrar o atendimento no prontuário']) {
    const r = ids(q);
    assert.ok(!r.some(i => i.startsWith('anona-')), q + ' puxou ' + JSON.stringify(r));
  }
});

test('o Worker descreve o Mapa e rotas, o passo a passo das planilhas e os roteiros do Anona', () => {
  const src = readFileSync(new URL('../worker/apps.mjs', import.meta.url), 'utf8');
  assert.match(src, /MAPA E ROTAS/);
  assert.match(src, /anona-\*/);
});
