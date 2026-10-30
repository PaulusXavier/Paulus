import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerHabilidade, escolherHabilidades, MAX_CORPO_HABILIDADE } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';
import { habilidadesComoTexto, montarSistema } from '../worker/prompt.mjs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { criarIndice, buscar } from '../shared/busca.mjs';

const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const ORIGEM = 'https://paulusxavier.github.io';
const MD = (extra = '', corpo = '- passo um') => '---\nid: teste-a\nnome: Teste A\nquando: relatório técnico; ofício\n' + extra + '---\n' + corpo + '\n';

test('lerHabilidade lê o arquivo e recusa o que está errado', () => {
  const h = lerHabilidade(MD('apps: Toth, grafia\ntexto: sim\n'), 'teste-a.md');
  assert.equal(h.id, 'teste-a');
  assert.deepEqual(h.apps, ['toth', 'grafia']);
  assert.equal(h.texto, true);
  assert.equal(h.gatilhos.length, 2);
  assert.throws(() => lerHabilidade('sem bloco', 'x.md'), /bloco/);
  assert.throws(() => lerHabilidade(MD().replace('id: teste-a\n', ''), 'x.md'), /"id"/);
  assert.throws(() => lerHabilidade(MD().replace('teste-a', 'Teste A'), 'x.md'), /minúsculas/);
  assert.throws(() => lerHabilidade(MD('texto: talvez\n'), 'x.md'), /"texto"/);
  assert.throws(() => lerHabilidade(MD('', ' '), 'x.md'), /vazio/);
  assert.throws(() => lerHabilidade(MD('', 'a'.repeat(MAX_CORPO_HABILIDADE + 1)), 'x.md'), /Enxugue/);
});

test('todas as habilidades do repositório são válidas, sem dado pessoal e dentro do limite', () => {
  const lista = lerTodas();
  assert.ok(lista.length >= 10);
  for (const h of lista) {
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.equal(temDadoPessoal(h.instrucoes), false, h.id + ' tem dado pessoal');
    assert.ok(!/<\/?[a-z]/i.test(h.instrucoes), h.id + ' tem marcação que quebraria o prompt');
  }
});

test('escolhe a habilidade certa e não dispara em pergunta comum', () => {
  const lista = lerTodas();
  const id = (q, app = 'argo', ant = []) => escolherHabilidades(lista, q, ant, app).map((h) => h.id);
  assert.deepEqual(id('me ajuda a escrever um relatório técnico para o Ministério Público'), ['relatorio-tecnico']);
  assert.deepEqual(id('como faço uma visita domiciliar?'), ['visita-domiciliar']);
  assert.deepEqual(id('redija um ofício encaminhando para o CAPS'), ['oficio-encaminhamento']);
  assert.deepEqual(id('preciso montar o PAF de uma família'), ['plano-acompanhamento-familiar']);
  assert.deepEqual(id('posso quebrar o sigilo?'), ['duvida-etica-sigilo']);
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.deepEqual(id('quanto é o valor do Bolsa Família?'), []);
  assert.deepEqual(id(''), []);
});

test('condicionalidades: cada pergunta chama a habilidade certa, e a visão geral junto quando cabe', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'anona').map((h) => h.id);
  const casos = [
    ['família em descumprimento de condicionalidade', 'condicionalidades-pbf'],
    ['o benefício foi bloqueado, o que fazer?', 'condicionalidades-pbf'],
    ['o bolsa família da família foi suspenso', 'condicionalidades-pbf'],
    ['como fazer recurso no Sicon', 'condicionalidades-recurso'],
    ['como pedir a interrupção temporária dos efeitos', 'condicionalidades-recurso'],
    ['escrever o relatório para recurso do bolsa família', 'condicionalidades-recurso'],
    ['a criança está com a vacina atrasada no bolsa família', 'condicionalidades-saude'],
    ['gestante sem pré-natal registrado no bolsa família', 'condicionalidades-saude'],
    ['ofício para a UBS sobre pesagem das crianças', 'condicionalidades-saude'],
    ['baixa frequência escolar no Bolsa Família', 'condicionalidades-educacao'],
    ['criança fora da escola, família no bolsa família', 'condicionalidades-educacao'],
    ['o que é o sistema presença?', 'condicionalidades-educacao'],
    ['ofício para a escola sobre frequência', 'condicionalidades-educacao'],
    ['o cadastro está desatualizado e o benefício foi bloqueado', 'condicionalidades-cadastro'],
    ['o que é a ação de qualificação cadastral?', 'condicionalidades-cadastro'],
    ['família indígena no bolsa família com frequência baixa', 'condicionalidades-casos-especiais'],
    ['família quilombola e as condicionalidades do bolsa família', 'condicionalidades-casos-especiais'],
    ['família em situação de rua no bolsa família', 'condicionalidades-casos-especiais'],
    ['como monitorar as condicionalidades no município?', 'condicionalidades-gestao'],
    ['pauta de reunião intersetorial do bolsa família', 'condicionalidades-gestao'],
    ['como explicar o bloqueio para uma família com medo de perder o bolsa família', 'condicionalidades-conversa'],
    ['família reclama do bloqueio, como atender?', 'condicionalidades-conversa'],
    ['família mudou de município, bolsa família', 'condicionalidades-casos'],
    ['adolescente grávida e o bolsa família', 'condicionalidades-casos'],
    ['como inserir no PAIF as famílias em descumprimento', 'condicionalidades-paif'],
    ['como organizar um grupo de famílias em descumprimento', 'condicionalidades-paif'],
    ['para que serve o relatório de repercussão individual?', 'condicionalidades-anona'],
    ['como usar o território volante para dividir por técnico', 'condicionalidades-anona'],
    ['Resultado de um cálculo de frequência escolar do Bolsa Família, já feito pelo app: abril 11 presenças em 20 dias letivos = 55,0%. Explique.', 'condicionalidades-anona-calculadora'],
    ['modelo de ofício à escola do bolsa família', 'condicionalidades-modelos'],
    ['preciso de um convite para a acolhida do bolsa família', 'condicionalidades-modelos'],
    ['como consultar o histórico no Sicon', 'condicionalidades-sicon'],
    ['quais são os efeitos graduais do descumprimento?', 'condicionalidades-efeitos-gradacao'],
    ['o bloqueio perde a parcela?', 'condicionalidades-efeitos-gradacao'],
    ['só o jovem de 16 anos descumpriu, o que acontece?', 'condicionalidades-efeitos-gradacao'],
    ['qual o calendário das condicionalidades?', 'condicionalidades-calendario-ciclo'],
    ['até quando posso pedir recurso?', 'condicionalidades-calendario-ciclo'],
    ['o que é o arquivo NLOC?', 'condicionalidades-nloc-busca-ativa'],
    ['como atualizar escola e série no CadÚnico?', 'condicionalidades-nloc-busca-ativa'],
    ['como fazer uma reunião com a escola sobre frequência', 'condicionalidades-escola-parceria'],
    ['como orientar o operador do Sistema Presença', 'condicionalidades-escola-parceria'],
    ['a criança está com a vacina atrasada', 'condicionalidades-vacinacao'],
    ['como o agente comunitário de saúde ajuda na vacinação?', 'condicionalidades-vacinacao'],
    ['o que é o benefício variável gestante?', 'condicionalidades-pre-natal-gestante'],
    ['gestante sem pré-natal no bolsa família', 'condicionalidades-pre-natal-gestante'],
    ['como funciona a pesagem das crianças?', 'condicionalidades-nutricao'],
    ['insegurança alimentar bolsa família', 'condicionalidades-nutricao'],
    ['o que é exposição vexatória?', 'condicionalidades-vedacao-comunicacao'],
    ['podemos fazer lista pública de famílias em descumprimento?', 'condicionalidades-vedacao-comunicacao'],
    ['o município pode criar condicionalidade?', 'condicionalidades-vedacao-comunicacao'],
    ['as famílias em descumprimento têm prioridade no SUAS?', 'condicionalidades-prioridade-suas'],
    ['como evitar o cancelamento?', 'condicionalidades-cancelamento'],
    ['quando o bolsa família é cancelado por descumprimento?', 'condicionalidades-cancelamento'],
    ['meu filho faltou um dia, perco o benefício?', 'condicionalidades-faq-familia'],
    ['o que significa BVA?', 'condicionalidades-glossario'],
    ['siglas do bolsa família', 'condicionalidades-glossario'],
    ['família não localizada no CadÚnico', 'condicionalidades-familia-nao-localizada'],
    ['não consegui contato com a família em descumprimento', 'condicionalidades-familia-nao-localizada'],
    ['como fazer uma reunião com a UBS sobre o bolsa família', 'condicionalidades-ubs-parceria'],
    ['o que é o registro semestral de saúde?', 'condicionalidades-ubs-parceria'],
    ['como conduzir a comissão intersetorial', 'condicionalidades-comissao-intersetorial'],
    ['pauta intersetorial do bolsa família', 'condicionalidades-comissao-intersetorial'],
    ['por que a criança falta à escola?', 'condicionalidades-baixa-frequencia-motivos'],
    ['como escutar o adolescente que não vai à escola', 'condicionalidades-baixa-frequencia-motivos'],
    ['adolescente fora da escola bolsa família', 'condicionalidades-adolescentes'],
    ['família indígena aldeada e o bolsa família', 'condicionalidades-indigenas'],
    ['o DSEI acompanha as condicionalidades?', 'condicionalidades-indigenas'],
    ['como capacitar os operadores da escola', 'condicionalidades-capacitacao-equipe'],
    ['como é o benefício primeira infância?', 'condicionalidades-primeira-infancia'],
    ['a renda aumentou, a família perde o bolsa família?', 'bolsa-familia-regra-protecao'],
    ['o que é o retorno garantido?', 'bolsa-familia-regra-protecao'],
    ['quando as planilhas de condicionalidade ficam disponíveis no Sicon?', 'condicionalidades-planilhas-sicon'],
    ['onde baixo a lista de famílias em descumprimento no Sicon?', 'condicionalidades-planilhas-sicon'],
    ['o que é o arquivo do SigPBF com famílias em descumprimento?', 'condicionalidades-planilhas-sicon'],
    ['como alimentar o Sicon com dados?', 'condicionalidades-alimentar-sistemas'],
    ['quem registra a frequência escolar no Sistema Presença?', 'condicionalidades-alimentar-sistemas'],
    ['como a UBS registra a vacina do Bolsa Família?', 'condicionalidades-alimentar-sistemas'],
    ['como fazer o recurso no Sicon passo a passo', 'condicionalidades-recurso-passo-a-passo'],
    ['como fazer os recursos do Bolsa Família?', 'condicionalidades-recurso-passo-a-passo'],
    ['como fazer recurso no Sicon', 'condicionalidades-recurso-passo-a-passo'],
    ['o recurso foi indeferido, o que fazer?', 'condicionalidades-recurso-passo-a-passo'],
    ['como ativar a interrupção temporária no Sicon?', 'condicionalidades-interrupcao-temporaria'],
    ['como pedir a interrupção temporária dos efeitos', 'condicionalidades-interrupcao-temporaria'],
    ['quanto tempo dura a interrupção temporária?', 'condicionalidades-interrupcao-temporaria'],
    ['o que é o período de atenção do Bolsa Família?', 'condicionalidades-interrupcao-temporaria'],
    ['como interromper a condicionalidade da família?', 'condicionalidades-interrupcao-temporaria'],
    ['como preencher o acompanhamento familiar no Sicon?', 'condicionalidades-acompanhamento-sicon'],
    ['o que é o Sicon Histórico?', 'condicionalidades-sicon']
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  assert.deepEqual(id('qual o valor do Bolsa Família em outubro?'), []);
  assert.deepEqual(id('quem tem direito ao Bolsa Família?'), []);
  // "Bolsa Família" + "acompanha" não pode puxar o roteiro do PAF.
  assert.ok(!id('Quem acompanha a vacina e o pré-natal no Bolsa Família?').includes('plano-acompanhamento-familiar'));
  // nunca mais de duas, e cada uma dentro do limite
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
});

test('condicionalidades: nenhum roteiro fixa valor, percentual nem data (isso vem das normas fornecidas)', () => {
  const cond = lerTodas().filter((h) => h.id.startsWith('condicionalidades-') || h.id === 'bolsa-familia-regra-protecao');
  assert.ok(cond.length >= 39);
  for (const h of cond) {
    assert.ok(!/R\$\s*\d/.test(h.instrucoes), h.id + ' tem valor em reais');
    assert.ok(!/\d\s*%/.test(h.instrucoes), h.id + ' tem percentual');
    assert.ok(!/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(h.instrucoes), h.id + ' tem data');
    assert.ok(!/\b(art\.?|artigo|lei n|resolução)\b/i.test(h.instrucoes), h.id + ' cita artigo ou lei');
  }
});

test('condicionalidades ampliadas: cada pergunta chama o roteiro novo certo, sem mais de duas habilidades', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);
  const casos = [
    ['roteiro de atendimento de família em descumprimento no CRAS', 'condicionalidades-atendimento-cras-roteiro'],
    ['como é o primeiro atendimento de família em descumprimento no CRAS?', 'condicionalidades-atendimento-cras-roteiro'],
    ['quando os efeitos não se aplicam?', 'condicionalidades-efeitos-nao-aplicam'],
    ['falta de oferta do serviço impede o efeito do descumprimento?', 'condicionalidades-efeitos-nao-aplicam'],
    ['quais documentos anexar no recurso do Bolsa Família?', 'condicionalidades-documentacao-recurso'],
    ['como escrever a justificativa do recurso?', 'condicionalidades-documentacao-recurso'],
    ['quem é acompanhado na frequência escolar do Bolsa Família?', 'condicionalidades-frequencia-regras'],
    ['atividades complementares contam na frequência?', 'condicionalidades-frequencia-regras'],
    ['a escola não lançou a frequência, como corrigir?', 'condicionalidades-erro-registro-correcao'],
    ['a UBS não registrou o atendimento da criança', 'condicionalidades-erro-registro-correcao'],
    ['perdi o prazo do recurso, o que fazer?', 'condicionalidades-prazo-perdido'],
    ['criança mudou de escola, como fica o Bolsa Família?', 'condicionalidades-transferencia-mudanca-escola'],
    ['abandono informado pela escola no Bolsa Família', 'condicionalidades-transferencia-mudanca-escola'],
    ['criança com deficiência e frequência escolar no Bolsa Família', 'condicionalidades-pessoa-com-deficiencia-cuidador'],
    ['faltas por tratamento de saúde no Bolsa Família', 'condicionalidades-pessoa-com-deficiencia-cuidador'],
    ['Bolsa Família e serviço no domicílio', 'condicionalidades-ponte-servico-domicilio'],
    ['indicar família do Bolsa Família para o serviço no domicílio', 'condicionalidades-ponte-servico-domicilio'],
    ['prazo para sacar o Bolsa Família', 'condicionalidades-pagamento-saque'],
    ['onde saco o Bolsa Família sem conta?', 'condicionalidades-pagamento-saque'],
    ['como é calculado o Bolsa Família?', 'condicionalidades-valores-calculo'],
    ['como funciona o benefício complementar?', 'condicionalidades-valores-calculo'],
    ['como entrar no Bolsa Família?', 'condicionalidades-ingresso-unipessoal'],
    ['família unipessoal no Bolsa Família e entrevista domiciliar', 'condicionalidades-ingresso-unipessoal'],
    ['ressarcimento do Bolsa Família', 'condicionalidades-devolucao-ressarcimento-defesa'],
    ['como fazer a devolução voluntária do Bolsa Família?', 'condicionalidades-devolucao-ressarcimento-defesa'],
    ['posso compartilhar a senha do Sicon?', 'condicionalidades-sigilo-credenciais'],
    ['dados do Sicon por WhatsApp', 'condicionalidades-sigilo-credenciais'],
    ['informe do MDS é norma?', 'condicionalidades-fontes-normas'],
    ['diferença entre lei, decreto, portaria e informe', 'condicionalidades-fontes-normas'],
    ['checklist mensal do Bolsa Família', 'condicionalidades-checklist-mensal'],
    ['o que fazer todo mês nas condicionalidades?', 'condicionalidades-checklist-mensal'],
    ['telefone do Bolsa Família', 'condicionalidades-canais-atendimento'],
    ['onde reclamar do Bolsa Família?', 'condicionalidades-canais-atendimento'],
    ['o que o Paulus sabe sobre condicionalidades?', 'condicionalidades-indice'],
    ['erros comuns nas condicionalidades', 'condicionalidades-erros-comuns-tecnicos']
  ];
  for (const [q, esperado] of casos) {
    assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
    assert.ok(id(q).length <= 2, q);
  }
  // os roteiros que já existiam continuam respondendo o que respondiam
  assert.ok(id('como fazer recurso no Sicon').includes('condicionalidades-recurso-passo-a-passo'));
  assert.ok(id('como ativar a interrupção temporária no Sicon?').includes('condicionalidades-interrupcao-temporaria'));
  assert.ok(id('o que é o período de atenção do Bolsa Família?').includes('condicionalidades-interrupcao-temporaria'));
  assert.deepEqual(id('quanto é o valor do Bolsa Família?'), []);
});

test('condicionalidades ampliadas: são ao menos cinquenta e oito roteiros e todos liberam resposta longa', () => {
  const cond = lerTodas().filter((h) => h.id.startsWith('condicionalidades-') || h.id === 'bolsa-familia-regra-protecao');
  assert.ok(cond.length >= 58, String(cond.length));
  const novos = cond.filter((h) => /atendimento-cras-roteiro|efeitos-nao-aplicam|documentacao-recurso|frequencia-regras|erro-registro-correcao|prazo-perdido|transferencia-mudanca-escola|pessoa-com-deficiencia-cuidador|ponte-servico-domicilio|pagamento-saque|valores-calculo|ingresso-unipessoal|devolucao-ressarcimento-defesa|sigilo-credenciais|fontes-normas|checklist-mensal|canais-atendimento|indice|erros-comuns-tecnicos/.test(h.id));
  assert.equal(novos.length, 19);
  for (const h of novos) assert.ok(h.texto, h.id);
});

test('revisão: roteiro que manda entregar texto pronto precisa de "texto: sim" (resposta não é cortada)', () => {
  // Três habilidades antigas ainda não têm a marca; ficam fora até alguém decidir se devem ter.
  const pendentesDeDecisao = new Set(['condicionalidades-conversa', 'diario-de-campo', 'duvida-etica-sigilo']);
  const sem = lerTodas().filter(
    (h) => /entregue|entregar|rascunho com \[CAMPOS\]|texto pronto/i.test(h.instrucoes) && !h.texto && !pendentesDeDecisao.has(h.id)
  );
  assert.deepEqual(sem.map((h) => h.id), []);
});

test('revisão: perguntas comuns não carregam roteiro de condicionalidade nem de PAIF por engano', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);
  const indevidas = [
    'qual o calendário de vacinação do bebê?',
    'reunião com a escola sobre um aluno do SCFV',
    'qual o prazo do edital do concurso?',
    'obesidade infantil',
    'resposta para a família sobre o BPC',
    'próximos prazos do planejamento da equipe',
    'vigência do contrato da equipe',
    'recursos financeiros do CRAS',
    'alimentação no sistema prisional',
    'período de atenção da criança em sala',
    'como lançar a frequência do grupo do SCFV',
    'disponibilidade de vagas no CRAS'
  ];
  for (const q of indevidas) {
    const carregou = id(q).filter((x) => x.startsWith('condicionalidades-') || x === 'paif' || x.startsWith('paif-'));
    assert.deepEqual(carregou, [], q);
  }
});

test('PAIF: cada pergunta chama a habilidade certa; condicionalidades, PAF e perguntas comuns seguem como antes', () => {
  const lista = lerTodas();
  const id = (q, app = 'argo') => escolherHabilidades(lista, q, [], app).map((h) => h.id);
  const casos = [
    ['o que é o PAIF?', 'paif'],
    ['quais os objetivos do PAIF?', 'paif'],
    ['como fazer a acolhida particularizada no PAIF', 'paif-acolhida'],
    ['o que é o prontuário da família?', 'paif-acolhida'],
    ['como fazer o estudo social', 'paif-estudo-social'],
    ['qual a diferença entre estudo social e acolhida?', 'paif-estudo-social'],
    ['o que é o prontuário da família?', 'paif-acolhida'],
    ['qual a diferença entre atendimento e acompanhamento?', 'paif-acompanhamento-familiar'],
    ['quando encerrar o acompanhamento familiar', 'paif-acompanhamento-familiar'],
    ['como planejar uma oficina com famílias', 'paif-oficinas-familias'],
    ['como organizar uma ação comunitária no território', 'paif-acoes-comunitarias'],
    ['preciso fazer uma campanha socioeducativa', 'paif-acoes-comunitarias'],
    ['quais os papéis na equipe do PAIF?', 'paif-equipe-gestao'],
    ['o que é o RMA?', 'paif-equipe-gestao'],
    ['qual a diferença entre PAIF e PAEFI?', 'paif-rede-articulacao'],
    ['como funciona a contrarreferência do PAIF com o CREAS', 'paif-rede-articulacao'],
    ['quem tem prioridade no PAIF?', 'paif-prioridades-busca-ativa'],
    ['busca ativa no PAIF em comunidade indígena', 'paif-prioridades-busca-ativa'],
    ['como orientar uma família sobre o BPC no PAIF', 'paif-bpc-idosos-deficiencia'],
    ['como montar um grupo de cuidadores', 'paif-bpc-idosos-deficiencia'],
    ['como funcionam os benefícios eventuais?', 'paif-beneficios-eventuais'],
    ['o que fazer em uma calamidade no CRAS', 'paif-beneficios-eventuais'],
    ['o que é pedagogia problematizadora?', 'paif-metodologia'],
    ['como usar temas geradores no grupo', 'paif-metodologia'],
    ['o que faz o psicólogo no PAIF?', 'paif-psicologia'],
    ['o que é o Criança Feliz?', 'paif-primeira-infancia'],
    ['como atender gestantes no PAIF', 'paif-primeira-infancia'],
    ['como trabalhar o PAIF com comunidade quilombola', 'paif-populacoes-tradicionais'],
    ['PAIF em território indígena', 'paif-populacoes-tradicionais'],
    ['modelo de convite para oficina', 'paif-modelos-texto'],
    ['modelo de relatório de encerramento do acompanhamento', 'paif-modelos-texto'],
    ['como avaliar o PAF?', 'paif-avaliacao-monitoramento'],
    ['quais indicadores do PAIF?', 'paif-avaliacao-monitoramento'],
    ['o que é matricialidade sociofamiliar?', 'paif-familia-genero-diversidade'],
    ['como incluir homens no PAIF', 'paif-familia-genero-diversidade'],
    ['família com transtorno mental no PAIF', 'paif-saude-mental'],
    ['como encaminhar para o CAPS no PAIF', 'paif-saude-mental'],
    ['como fazer uma visita domiciliar no PAIF', 'paif-visita-domiciliar'],
    ['como articular o PAIF com o SCFV', 'paif-scfv-articulacao'],
    ['quem é a referência técnica do SCFV', 'paif-scfv-articulacao'],
    ['como fazer o cadastro no CadÚnico pelo PAIF', 'paif-cadunico-documentacao'],
    ['família sem documento no PAIF', 'paif-cadunico-documentacao'],
    ['como trabalhar com pessoa idosa no PAIF', 'paif-pessoa-idosa'],
    ['como combater o idadismo', 'paif-pessoa-idosa'],
    ['como acolher família venezuelana no PAIF', 'paif-migrantes-refugiados'],
    ['famílias migrantes no PAIF', 'paif-migrantes-refugiados'],
    ['como atender pessoa em situação de rua no CRAS', 'paif-situacao-de-rua'],
    ['como usar o IVCAD no planejamento', 'paif-diagnostico-territorio'],
    ['como fazer oficina sobre violência doméstica', 'paif-prevencao-violencias'],
    ['sigilo no PAIF e LGPD', 'paif-sigilo-prontuario'],
    ['a família recusa o acompanhamento, o que fazer?', 'paif-casos-praticos'],
    ['família mudou de bairro', 'paif-casos-praticos'],
    ['inclusão produtiva no PAIF', 'paif-trabalho-renda'],
    ['adolescente fora da escola no PAIF', 'paif-adolescentes-juventude'],
    ['passo a passo do PAIF', 'paif-passo-a-passo'],
    ['como trabalhar com famílias indígenas na cidade', 'paif-povos-indigenas'],
    ['indígenas em Boa Vista no CRAS', 'paif-povos-indigenas'],
    ['o que o CRAS faz em uma enchente?', 'paif-emergencias-desastres'],
    ['como montar um plano de contingência na assistência social', 'paif-emergencias-desastres'],
    ['qual a diferença entre trabalho interdisciplinar e multidisciplinar no CRAS?', 'paif-interdisciplinaridade'],
    ['divisão de tarefas entre assistente social e psicólogo no CRAS', 'paif-interdisciplinaridade'],
    ['como inserir no PAIF as famílias em descumprimento', 'condicionalidades-paif']
  ];
  for (const [q, esperado] of casos) assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
  for (const [q] of casos) assert.ok(id(q).length <= 2, q);
  assert.deepEqual(id('preciso montar o PAF de uma família'), ['plano-acompanhamento-familiar']);
  assert.deepEqual(id('como faço uma visita domiciliar?'), ['visita-domiciliar']);
  assert.deepEqual(id('qual o horário do CRAS?'), []);
  assert.deepEqual(id('quanto é o valor do Bolsa Família?'), []);
});

test('PAIF: as habilidades do PAIF não citam número de lei nem artigo e dizem "este guia recomenda" onde há número de guia', () => {
  const paif = lerTodas().filter((h) => h.id === 'paif' || h.id.startsWith('paif-'));
  assert.ok(paif.length >= 35);
  for (const h of paif) assert.ok(!/\b(art\.?|artigo|lei n|resolução)\b/i.test(h.instrucoes), h.id);
  const acomp = paif.find((h) => h.id === 'paif-acompanhamento-familiar');
  assert.ok(/este guia recomenda/i.test(acomp.instrucoes) && /NÃO é norma/.test(acomp.instrucoes));
});

test('acompanhamento no domicílio (PCD, pessoa idosa, primeira infância): cada pergunta chama o roteiro certo e não rouba as outras habilidades', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);
  const casos = [
    ['como funciona o serviço de proteção social básica no domicílio?', 'protecao-basica-domicilio'],
    ['o que é o SPSBD?', 'protecao-basica-domicilio'],
    ['como fazer acompanhamento domiciliar de pessoa idosa', 'protecao-basica-domicilio'],
    ['como fica o acompanhamento em domicílio da primeira infância?', 'protecao-basica-domicilio'],
    ['como cuidar de um idoso acamado no domicílio', 'domicilio-pessoa-idosa'],
    ['idosa que mora sozinha, o que observar na visita?', 'domicilio-pessoa-idosa'],
    ['pessoa com deficiência no domicílio, como planejar?', 'domicilio-pessoa-com-deficiencia'],
    ['barreiras no domicílio da família', 'domicilio-pessoa-com-deficiencia'],
    ['como fazer brincadeira na visita domiciliar com bebê', 'domicilio-primeira-infancia'],
    ['roteiro de visita a gestante', 'domicilio-primeira-infancia'],
    ['cuidadora sobrecarregada no domicílio', 'domicilio-cuidador'],
    ['como cuidar de quem cuida no domicílio', 'domicilio-cuidador'],
    ['plano de acompanhamento no domicílio com metas', 'domicilio-plano-metas'],
    ['modelo de registro de visita domiciliar', 'domicilio-registro-modelos'],
    ['serviço no domicílio e paif: como articular?', 'domicilio-rede-articulacao'],
    ['do Criança Feliz para o serviço no domicílio, o que mudou?', 'domicilio-transicao-crianca-feliz'],
    ['o Criança Feliz acabou?', 'domicilio-transicao-crianca-feliz'],
    ['suspeita de violência no domicílio', 'domicilio-violencia-negligencia'],
    ['maus-tratos de idoso em casa', 'domicilio-violencia-negligencia'],
    ['visita domiciliar indígena', 'domicilio-povos-migrantes-rua'],
    ['situação de rua no domicílio improvisado', 'domicilio-povos-migrantes-rua'],
    ['como é a supervisão do serviço no domicílio', 'domicilio-equipe-supervisao'],
    ['segurança do visitador', 'domicilio-equipe-supervisao'],
    ['a família não abre a porta na visita', 'domicilio-casos-praticos'],
    ['primeira visita no domicílio', 'domicilio-primeira-visita'],
    ['desligamento do serviço no domicílio', 'domicilio-encerramento-desligamento'],
    ['sofrimento emocional na visita domiciliar', 'domicilio-saude-mental-luto'],
    ['luto no domicílio', 'domicilio-saude-mental-luto'],
    ['puerpério no domicílio', 'domicilio-gestacao-puerperio'],
    ['adolescente grávida no domicílio', 'domicilio-gestacao-puerperio'],
    ['insegurança alimentar no domicílio', 'domicilio-alimentacao-seguranca-alimentar'],
    ['amamentação na visita domiciliar', 'domicilio-alimentacao-seguranca-alimentar'],
    ['BPC no domicílio, como orientar?', 'domicilio-beneficios-cadunico'],
    ['documentos na visita domiciliar', 'domicilio-beneficios-cadunico'],
    ['criança que não fala na visita domiciliar', 'domicilio-sinais-alerta-desenvolvimento'],
    ['alzheimer no domicílio', 'domicilio-demencia'],
    ['idoso confuso em casa', 'domicilio-demencia'],
    ['prevenção de quedas do idoso em casa', 'domicilio-casa-segura-quedas'],
    ['casa segura no domicílio', 'domicilio-casa-segura-quedas'],
    ['atividades para bebês no domicílio', 'domicilio-brincadeiras-por-idade'],
    ['brincadeira com materiais da casa', 'domicilio-brincadeiras-por-idade'],
    ['castigo físico na visita domiciliar', 'domicilio-parentalidade-limites'],
    ['parentalidade positiva no domicílio', 'domicilio-parentalidade-limites'],
    ['fotos na visita domiciliar', 'domicilio-lgpd-fotos-whatsapp'],
    ['whatsapp com famílias do serviço no domicílio', 'domicilio-lgpd-fotos-whatsapp'],
    ['contato por telefone no domicílio', 'domicilio-contato-remoto'],
    ['busca ativa no domicílio', 'domicilio-busca-ativa-elegiveis'],
    ['indicadores do serviço no domicílio', 'domicilio-monitoramento-indicadores'],
    ['implantar o serviço no domicílio', 'domicilio-implantacao-municipio'],
    ['diferença entre serviço no domicílio e agente comunitário de saúde', 'domicilio-diferencas-servicos'],
    ['solidão do idoso no domicílio', 'domicilio-convivencia-ponte-comunidade']
  ];
  for (const [q, esperado] of casos) {
    assert.ok(id(q).includes(esperado), q + ' -> ' + id(q));
    assert.ok(id(q).length <= 2, q);
  }
  // perguntas que já tinham dona continuam com ela
  assert.deepEqual(id('como faço uma visita domiciliar?'), ['visita-domiciliar']);
  assert.ok(id('o que é o Criança Feliz?').includes('paif-primeira-infancia'));
  assert.ok(!id('como fazer uma visita domiciliar no PAIF').some((x) => x.startsWith('domicilio-')));
  assert.ok(!id('qual o horário do CRAS?').some((x) => x.startsWith('domicilio-') || x === 'protecao-basica-domicilio'));
  assert.ok(!id('como montar um grupo de cuidadores').some((x) => x.startsWith('domicilio-')));
});

test('acompanhamento no domicílio: roteiros sem número de norma, dentro do limite e todos listados', () => {
  const dom = lerTodas().filter((h) => h.id === 'protecao-basica-domicilio' || h.id.startsWith('domicilio-'));
  assert.ok(dom.length >= 31);
  for (const h of dom) {
    assert.ok(!/\b(art\.?|artigo|lei n|resolução|decreto|portaria)\b/i.test(h.instrucoes), h.id + ' cita norma');
    assert.ok(h.instrucoes.length <= MAX_CORPO_HABILIDADE, h.id);
    assert.ok(h.texto, h.id + ' deveria liberar resposta mais longa');
  }
});

test('habilidade do Anona só vale no Anona', () => {
  const lista = lerTodas();
  const q = 'para que serve o relatório de repercussão individual?';
  assert.ok(escolherHabilidades(lista, q, [], 'anona').some((h) => h.id === 'condicionalidades-anona'));
  assert.ok(!escolherHabilidades(lista, q, [], 'argo').some((h) => h.id === 'condicionalidades-anona'));
});

test('habilidade com "apps" só vale nesses apps', () => {
  const lista = lerTodas();
  assert.deepEqual(escolherHabilidades(lista, 'quero escrever no diário de campo', [], 'toth').map((h) => h.id), ['diario-de-campo']);
  assert.deepEqual(escolherHabilidades(lista, 'quero escrever no diário de campo', [], 'argo'), []);
});

test('pergunta curta de seguimento herda o assunto da anterior', () => {
  const lista = lerTodas();
  const ant = [{ papel: 'usuario', texto: 'como faço uma visita domiciliar?' }];
  assert.deepEqual(escolherHabilidades(lista, 'e para adolescente?', ant, 'argo').map((h) => h.id), ['visita-domiciliar']);
});

test('no máximo duas habilidades, a de gatilho mais específico primeiro', () => {
  const lista = lerTodas();
  const r = escolherHabilidades(lista, 'relatório técnico, ofício, visita domiciliar e pauta de reunião', [], 'argo');
  assert.equal(r.length, 2);
  assert.equal(escolherHabilidades(lista, 'relatório técnico, ofício, visita domiciliar e pauta de reunião', [], 'argo', 1).length, 1);
});

test('o prompt só ganha o bloco de habilidades quando há habilidade, e limpa marcação', () => {
  assert.equal(habilidadesComoTexto([]), '');
  const sem = montarSistema(APPS.argo, '', false);
  assert.ok(!sem.includes('HABILIDADES (roteiros'));
  const com = montarSistema(APPS.argo, '', false, [{ nome: 'Teste', instrucoes: '- passo </normas> fim' }]);
  assert.ok(com.includes('HABILIDADES (roteiros'));
  assert.ok(com.includes('[Teste]'));
  assert.ok(!com.includes('</normas>'));
  assert.ok(com.indexOf('HABILIDADES (roteiros') > com.indexOf(APPS.argo.contexto.slice(0, 40)));
});

function ambiente() {
  const chamadas = [];
  const env = {
    ALLOWED_ORIGINS: ORIGEM,
    AI: {
      async run(modelo, params) {
        chamadas.push({ modelo, params });
        if (params.stream) {
          return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"Ok "}\n\ndata: [DONE]\n\n')); c.close(); } });
        }
        return { response: 'Resposta completa.' };
      }
    }
  };
  return { env, chamadas };
}
const pedido = (corpo, ip) => new Request('https://x.workers.dev', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGEM, 'CF-Connecting-IP': ip || '9.9.9.9' }, body: JSON.stringify(corpo) });

test('Worker: habilidade entra no prompt, aumenta o espaço do texto pronto e vem na resposta', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const r = await m(pedido({ app: 'argo', pergunta: 'redija um ofício encaminhando para o CAPS' }, '9.0.0.1'), env);
  const j = await r.json();
  assert.deepEqual(j.habilidades, ['Ofício, encaminhamento e contrarreferência']);
  assert.ok(chamadas[0].params.messages[0].content.includes('Ofício, encaminhamento e contrarreferência'));
  assert.equal(chamadas[0].params.max_tokens, 1400);
});

test('Worker: pergunta comum não carrega habilidade nem muda o limite', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'qual o horário do CRAS?' }, '9.0.0.2'), env)).json();
  assert.deepEqual(j.habilidades, []);
  assert.ok(!chamadas[0].params.messages[0].content.includes('HABILIDADES (roteiros'));
  assert.equal(chamadas[0].params.max_tokens, 900);
});

test('Worker: sem lista de habilidades funciona como antes', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS });
  const j = await (await m(pedido({ app: 'argo', pergunta: 'redija um ofício' }, '9.0.0.3'), env)).json();
  assert.deepEqual(j.habilidades, []);
});

test('Worker: tema de suicídio nunca carrega roteiro', async () => {
  const { env, chamadas } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  await m(pedido({ app: 'argo', pergunta: 'como fazer o registro de atendimento de um caso de ideação suicida?' }, '9.0.0.4'), env);
  assert.ok(chamadas.length > 0);
  assert.ok(!chamadas[0].params.messages[0].content.includes('HABILIDADES (roteiros'));
});

test('Worker: em streaming, a habilidade usada vem num evento próprio', async () => {
  const { env } = ambiente();
  const m = criarManipulador({ base, apps: APPS, habilidades: lerTodas() });
  const r = await m(pedido({ app: 'argo', pergunta: 'como faço uma visita domiciliar?', stream: true }, '9.0.0.5'), env);
  const texto = await r.text();
  assert.ok(texto.includes('"habilidades":["Visita domiciliar"]'));
  assert.ok(texto.includes('"t":"Ok "'));
});

test('condicionalidades: a base traz o guia do Sicon (planilhas, registro de dados, recurso e interrupção) e o diz como orientação', () => {
  const ind = criarIndice(base);
  const docs = (q) => buscar(ind, q, { k: 4 }).map((a) => a.trecho.doc);
  assert.ok(docs('quando a planilha de famílias em descumprimento fica disponível no Sicon').includes('sicon-condicionalidades-gestao'));
  assert.ok(docs('como cadastrar recurso no Sicon').includes('sicon-condicionalidades-gestao'));
  assert.ok(docs('o que é o período de atenção').includes('sicon-condicionalidades-gestao'));
  const trechos = base.filter((t) => t.doc === 'sicon-condicionalidades-gestao');
  assert.ok(trechos.length >= 10);
  // o documento é de apoio e avisa que não traz a data de disponibilização das listas: o Paulus não pode inventá-la
  assert.ok(trechos.some((t) => /não fixam o dia exato|não informa as datas/.test(t.texto)));
});

test('condicionalidades: os roteiros novos mandam usar as datas das normas e não inventar prazo', () => {
  const lista = lerTodas();
  for (const idh of ['condicionalidades-planilhas-sicon', 'condicionalidades-recurso-passo-a-passo', 'condicionalidades-interrupcao-temporaria']) {
    const h = lista.find((x) => x.id === idh);
    assert.ok(h && h.texto, idh);
    assert.match(h.instrucoes, /trechos fornecidos/, idh);
  }
  assert.match(lista.find((x) => x.id === 'condicionalidades-planilhas-sicon').instrucoes, /Nunca invente data/);
});

test('psicologia social: cada pergunta chama a habilidade certa e perguntas do dia a dia não disparam', () => {
  const lista = lerTodas();
  const id = (q) => escolherHabilidades(lista, q, [], 'argo').map((h) => h.id);
  const casos = [
    ['o que é psicologia social crítica?', 'psicossocial-visao-geral'],
    ['como a psicologia comunitária trabalha a conscientização?', 'psicossocial-comunitaria'],
    ['como lidar com os papéis no grupo operativo?', 'psicossocial-processos-grupais'],
    ['como combater o estigma e a xenofobia contra migrantes?', 'psicossocial-preconceito-estigma'],
    ['explique representações sociais e ancoragem', 'psicossocial-representacoes-sociais'],
    ['o que é identidade social e pertencimento?', 'psicossocial-identidade-pertencimento'],
    ['o que é sofrimento ético-político?', 'psicossocial-exclusao-sofrimento'],
    ['como funciona a dissonância cognitiva e a influência social?', 'psicossocial-atitudes-influencia'],
    ['o que é violência estrutural e desumanização?', 'psicossocial-poder-violencia'],
    ['como fazer uma cartografia social com a comunidade?', 'psicossocial-pesquisa-intervencao'],
    ['quero um plano de estudo de psicologia social', 'psicossocial-estudar'],
  ];
  for (const [pergunta, esperado] of casos) {
    assert.ok(id(pergunta).includes(esperado), pergunta + ' -> ' + id(pergunta).join(','));
  }
  for (const q of ['qual o horário do CRAS?', 'como fazer um recurso no Sicon?', 'como fazer uma visita domiciliar?', 'o que é o Bolsa Família?']) {
    assert.ok(!id(q).some((x) => x.startsWith('psicossocial-')), q);
  }
});
