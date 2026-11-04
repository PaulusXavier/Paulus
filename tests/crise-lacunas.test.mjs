// Lacunas do detector de crise encontradas num teste com frases reais (51 de 67 frases de risco não mostravam o cartão).
// Cada frase abaixo veio dessa lista. O que não pode acontecer: pessoa em risco sem os telefones, ou dúvida técnica do dia a dia virando alarme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarCrise } from '../shared/crise.mjs';

const numeros = r => r.telefones.map(t => t.numero);

test('REGRESSÃO: quem é ameaçado de morte recebe 190/180/100, nunca o cartão de suicídio', () => {
  for (const t of ['meu marido vai me matar', 'ele disse que vai me matar', 'ela ameaça me matar se eu sair de casa', 'ele me ameaça de morte']) {
    const r = detectarCrise(t);
    assert.ok(r, t);
    assert.equal(r.subtipo, 'violencia', t);
    assert.ok(!r.pessoal, t);
    assert.deepEqual(numeros(r).sort(), ['100', '180', '190'], t);
    assert.ok(!/CVV|Sinto muito/.test(r.texto), t);
  }
  // quem fala de si continua no cartão de suicídio
  assert.equal(detectarCrise('quero me matar').subtipo, 'suicidio');
});

test('ideação indireta (sem a palavra "suicídio") mostra o cartão e, falando de si, o texto pessoal com 188 e 192', () => {
  const deSi = ['cansei de viver', 'estou cansado de viver', 'queria dormir e nunca mais acordar', 'não quero mais estar aqui', 'ninguém sentiria minha falta',
    'melhor para todo mundo se eu morresse', 'quero acabar com a minha dor de uma vez por todas', 'vou pôr fim a tudo', 'só a morte resolve',
    'vou me atirar na frente do ônibus', 'queria que um carro me atropelasse', 'tenho uma arma e vou usar em mim', 'quero tomar remédio para dormir pra sempre'];
  for (const t of deSi) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'suicidio', t);
    assert.equal(r.pessoal, true, t);
    assert.deepEqual(numeros(r).sort(), ['188', '192'], t);
  }
  for (const t of ['o paciente diz que não tem mais motivo para viver', 'ela se cortou ontem', 'ele está se machucando de propósito']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'suicidio', t);
    assert.ok(!r.pessoal, t);
  }
});

test('ameaça de morte a terceiros e violência relatada por quem sofre', () => {
  for (const t of ['ele ameaçou matar a esposa', 'vai matar a mulher hoje à noite', 'o marido disse que vai matar ela', 'ele quer matar o filho', 'estou com medo de ser morta pelo meu ex',
    'estou sendo estuprada', 'fui agredida agora', 'me bate todo dia', 'meu padrasto me toca', 'o pai está abusando da menina', 'o tio mexe com a sobrinha',
    'criança de 8 anos sofrendo abuso', 'ela foi trancada em casa pelo companheiro']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'violencia', t);
    assert.ok(numeros(r).includes('190'), t);
    assert.ok(numeros(r).includes('100') || numeros(r).includes('180'), t);
  }
});

test('criança ou pessoa idosa abandonada ou trancada: Disque 100 e Conselho Tutelar', () => {
  for (const t of ['a criança foi encontrada sozinha, abandonada, com fome', 'idoso abandonado sem comida em casa', 'bebê trancado no quarto']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'violencia', t);
    assert.ok(numeros(r).includes('100'), t);
  }
});

test('quem diz que vai machucar alguém recebe o cartão para quem está no limite: afastar, 188 e 190, sem sermão', () => {
  for (const t of ['vou matar meu marido', 'vou machucar a criança', 'tenho vontade de bater no meu filho', 'estou perdendo o controle com meu filho', 'vou matar alguém']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'agressao', t);
    assert.deepEqual(numeros(r).sort(), ['188', '190'], t);
    assert.match(r.texto, /afaste-se/, t);
    assert.ok(!/culpa|crime|errad|vergonha/i.test(r.texto), t);
  }
});

test('emergência de saúde além de "overdose": respiração, desmaio, AVC/infarto, sangramento, ferimento, engasgo', () => {
  for (const t of ['bebê não respira', 'ele está infartando', 'está tendo um infarto', 'teve um AVC', 'não acorda', 'está desmaiada', 'está sangrando muito',
    'levou um tiro', 'foi esfaqueado', 'criança engasgou', 'pegou fogo na casa']) {
    const r = detectarCrise(t);
    assert.ok(r && r.subtipo === 'clinica', t);
    assert.ok(numeros(r).includes('192'), t);
  }
});

test('o dia a dia do trabalho NÃO vira alarme: expressões parecidas, perguntas gerais e figuras de linguagem', () => {
  for (const t of [
    'estou cansada de viajar para o interior', 'cansei de esperar o benefício', 'vou matar a fome das famílias com cesta básica', 'matar aula é motivo de condicionalidade?',
    'vou matar o tempo até a reunião', 'ele quer matar a charada do formulário', 'o adolescente não acorda cedo para ir à escola', 'ele não acorda no horário do SCFV',
    'quero acabar com a fila do atendimento', 'por fim, a reunião acabou', 'o que fazer em caso de ameaça de morte?', 'qual o fluxo para criança abandonada?',
    'quantas crianças em situação de abandono o CREAS atende?', 'o que é violência doméstica?', 'como identificar maus tratos contra idoso?',
    'qual o protocolo para criança trancada em casa?', 'prevenção de afogamento no território', 'como orientar sobre picada de cobra na comunidade?',
    'o pai bate na porta do CRAS toda semana', 'ele bate o ponto às 8h', 'a mãe mexe com artesanato na oficina', 'o professor mexe com a turma toda',
    'vou usar em mim o planejamento que você sugeriu', 'o estagiário se cortou com papel, preciso de seguro?', 'vou bater a meta do PAIF',
    'estou perdendo o controle do orçamento do CRAS', 'idoso sem comida precisa de benefício eventual', 'criança sem comer na escola aparece na condicionalidade?',
    'o prontuário foi trancado no arquivo', 'a sala está trancada, quem tem a chave?', 'tiro de letra o relatório', 'cartas de despedida do SCFV para a turma',
    'criança com sangramento nasal frequente na escola: como encaminhar para a UBS?'
  ]) assert.equal(detectarCrise(t), null, t);
});
