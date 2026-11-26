// Pedidos de socorro: resposta imediata, no aparelho, mesmo sem internet e sem IA.
// Não faz triagem nem avaliação clínica: só mostra os telefones e pede para acionar o serviço.

export const EMERGENCIAS = [
  { numero: '192', nome: 'SAMU' },
  { numero: '193', nome: 'Bombeiros' },
  { numero: '190', nome: 'Polícia Militar' },
  { numero: '188', nome: 'CVV (apoio emocional, 24h)' },
  { numero: '180', nome: 'Central de Atendimento à Mulher' },
  { numero: '100', nome: 'Disque Direitos Humanos' }
];

import { tipoDePerguntaSuicidio } from './suicidio.mjs';
import { espDetectarIdioma } from './espanhol.mjs';
import { ingDetectarIdioma } from './ingles.mjs';

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


// Sinais de ideação suicida que a palavra "suicídio" não cobre (texto já sem acento e em minúsculas).
// Servem a duas listas: o cartão de crise e o "nunca é pergunta técnica". Só entram expressões que quase não têm outro sentido
// no trabalho do SUAS ("não aguento mais a demanda" NÃO entra; "não aguento mais viver" entra).
const SINAIS_SUICIDIO = [
  'nao (?:aguento|suporto|consigo) mais (?:viver|essa vida|esta vida|continuar vivo|continuar viva)',
  '(?:minha|sua|a) vida nao tem (?:mais )?sentido',
  'nao (?:vejo|tenho|tem|ve|ha) (?:mais )?(?:sentido em viver|sentido na vida|razoes? (?:pra|para) viver|motivos? (?:pra|para) viver)|nao vejo motivos para continuar vivendo',
  'quer(?:o|ia|endo)? (?:sumir|desaparecer) (?:de vez|para sempre|pra sempre|do mundo|deste mundo|dessa vida)',
  'quer(?:o|ia|endo)? (?:estar|ficar) morto|quer(?:o|ia|endo)? (?:estar|ficar) morta|quer(?:o|ia|endo)? nao ter nascido',
  'vontade de morrer|desejo de morrer|(?:seria|era|sera) melhor (?:se )?(?:eu |ela |ele )?(?:nao existisse|estivesse mort[oa]|sem mim)',
  '(?:dar|dando|por|pondo) fim (?:a |na |em )?(?:propria |minha |sua |a )?vida',
  '(?:me|se) (?:enforcar|enforcando|afogar|afogando|envenenar|envenenando)',
  '(?:me|se) jogar (?:da|do|de|embaixo|debaixo)',
  'pular (?:da|do|de) (?:ponte|predio|janela|viaduto|sacada|terraco|laje|cima)',
  // revisão: ideação passiva, meio planejado e autolesão no presente
  'nao quer(?:o|ia|er)? mais acordar|(?:melhor|seria melhor) (?:eu )?nao estar mais aqui',
  '(?:vou|quero|ia|pensando em|penso em) tomar (?:todos|todo) (?:os |o )?(?:\\w+ )?(?:remedios?|comprimidos?|medicamentos?|cartela)',
  '(?:vou|quero|ia|pensando em|penso em) (?:me )?atirar em mim',
  '(?:me|se) (?:corto|corta|cortam)(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)',
  '(?:vontade|desejo|impulso) de (?:me|se) (?:machucar|ferir|cortar|furar|queimar)|quero me machucar',
  // ideação indireta (ampliação do detector): cansaço de viver, desejo de não acordar, peso para os outros, despedida, meio já à mão
  'cansad[oa] de viver|cansei de viver|a vida nao vale a pena|nao vale mais a pena viver',
  '(?:dormir|adormecer) (?:e )?(?:nunca|nao) mais acordar|dormir (?:pra|para) sempre|nao acordar mais|quer(?:o|ia) nao acordar nunca mais',
  'nao quer(?:o|er|ia)? mais (?:estar aqui|existir|ficar aqui)',
  'ninguem (?:sentiria|sentira|ia sentir) (?:a )?(?:minha |sua )?falta',
  'melhor (?:pra|para) (?:todo mundo|todos|a familia|eles) (?:se (?:eu|ela|ele) (?:morresse|nao existisse|sumisse)|sem mim)|todo mundo estaria melhor sem mim|todos estariam melhor sem mim',
  '(?:acabar|acabando) com (?:a )?(?:minha |sua )?dor de uma vez',
  '(?:por|pondo) fim (?:a )?(?:tudo|dor)',
  'so a morte (?:resolve|acaba|ajuda|me ajuda)',
  '(?:me|se) (?:atirar|lancar|jogar) (?:na|no) frente (?:de|do|da|dos|das)',
  '(?:carro|onibus|caminhao|trem) (?:me )?(?:atropelasse|pegasse)',
  '(?:me|se) dar (?:um )?tiro|tiro (?:na|em) (?:propria |minha |sua )?(?:cabeca|boca|peito)',
  '(?:usar|usarei|vou usar) (?:a arma|ela|isso|o veneno) em mim|(?:arma|revolver|pistola|veneno|chumbinho)[^.?!]{0,30}\\b(?:usar|usarei|vou usar|uso)\\b[^.?!]{0,10}\\bem mim',
  '(?:carta|bilhete) de despedida|me despedindo de todos|deixei (?:um )?bilhete',
  // autolesão relatada sem a palavra "automutilação"
  'cort(?:ou|ei|aram|ando) (?:os |as |meus |minhas |seus |suas )?(?:pulsos?|punhos?|veias?|pescoco)|(?:se|me) cortou(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)|me cortei(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)|se cortaram|(?:se|me) machuc(?:a|ando|ou|ava) de proposito|(?:se|me) fer(?:e|indo|iu|i) de proposito|(?:se|me) queim(?:a|ando|ou|ei) de proposito'
].join('|');

// Sinais de overdose e intoxicação além de "overdose" e "engoliu remédio".
const SINAIS_CLINICA = /\b(?:(?:tomou|tomei|tomaram|ingeriu|engoliu|bebeu) (?:varios|muitos|muitas|muito|uma cartela|a cartela|todos os|todo o|um monte de)(?: \w+)? ?(?:comprimidos?|remedios?|medicamentos?|pilulas?|cartelas?)|(?:tomou|bebeu|ingeriu) (?:veneno|chumbinho|soda caustica))\b/;

// Frases que, em qualquer pergunta, indicam alguém em risco (e não dúvida técnica).
const FRASE_DE_RISCO_BASE = /\b(me matar|se matar|quer(?:o|endo|er|ia)? morrer|nao quer(?:o|er)? mais viver|tirar (?:a |minha |sua |propria )*vida|acabar com (?:a |minha |sua )*vida|acabar com tudo|pensando em morrer|se cortando|me cortando|se cortar|me cortar)\b/;
const SINAIS_SUICIDIO_RE = new RegExp('\\b(?:' + SINAIS_SUICIDIO + ')\\b');
function fraseDeRisco(t) { return FRASE_DE_RISCO_BASE.test(t) || SINAIS_SUICIDIO_RE.test(t); }
// Caso concreto, relato ou momento: "ela falou em suicídio", "tentou ontem", "a usuária está com ideação".
const CASO_OU_MOMENTO = /\b(disse|disseram|falou|falaram|fala em|contou|relatou|verbalizou|mencionou|ameac\w+|tentou|tentando|esta com|estao com|estou com|ficou com|esteve com|hoje|ontem|agora|neste momento|nesse momento|acabou de|esta semana|essa semana)\b/;
// Pedido de método, meio, dose ou letalidade nunca é pergunta técnica.
const PEDIDO_DE_METODO = /\b(metodos?|meios?|doses?|dosagem|comprimidos?|quantos|quantas|letal\w*|indolor\w*|jeito|maneira|forma de (?:se|me)|como (?:se|me) matar)\b/;
// Quem fala de si.
const PRIMEIRA_PESSOA = /\b(me matar|quero morrer|nao quero mais viver|(?:tirar|acabar com) minha vida|me cortando|me cortar|(?:estou|to|ando) pensando em (?:morrer|suicid\w*)|penso em (?:morrer|suicid\w*)|tenho (?:vontade|pensamentos?|ideias?) de (?:morrer|me matar))\b/;

// Pergunta TÉCNICA geral sobre suicídio ("como avaliar o risco?", "quais os mitos?", "o que é posvenção?"): vai para a IA e a cartilha.
// Na dúvida, é socorro: relato de caso, momento, primeira pessoa, pedido de método e a palavra solta mantêm o cartão de crise.
export function ehPerguntaTecnicaSuicidio(texto) {
  const t = semAcento(texto);
  if (fraseDeRisco(t) || CASO_OU_MOMENTO.test(t) || PEDIDO_DE_METODO.test(t)) return false;
  return tipoDePerguntaSuicidio(t) !== null;
}

// Perguntas GERAIS ("o que fazer em caso de risco de vida?", "quantas crianças em perigo o CREAS atende?"): termos vagos
// como "em perigo" ou "risco de vida" não disparam o cartão, porque ali ninguém está pedindo socorro. Para ser geral, a frase
// precisa abrir como pergunta, trazer um sinal de generalidade E não ter marca de caso ou de momento ("hoje", "agora", "disse").
const GERAL_ABERTURA = /^(?:como|qual|quais|quanto|quantos|quantas|o que|quando|onde|existe|ha)\b/;
const GERAL_SINAL = /\b(?:caso de|casos de|em casos|fluxo|protocolo|procedimento|quantos?|quantas?|atende|atendem|quando (?:a |o |uma |um )?(?:crianca|adolescente|idos[oa]|mulher|pessoa|familia)s?)\b/;
// Relato de violência sexual ou de abuso só vira cartão quando há caso ("a criança relatou...", "hoje", "ontem"); sem caso é dúvida técnica.
const CASO_VIOLENCIA = new RegExp(CASO_OU_MOMENTO.source + '|\\b(?:revelou|relata|sofre|sofreu|sofrendo|vitima de)\\b');
function perguntaGeral(t, ignorarAmeaca) {
  // "ameaça" é marca de caso para suicídio e abuso, mas aqui é o próprio tema ("o que fazer em caso de ameaça de morte?")
  const base = ignorarAmeaca ? t.replace(/ameac\w+/g, ' ') : t;
  return GERAL_ABERTURA.test(t.trim()) && GERAL_SINAL.test(t) && !CASO_OU_MOMENTO.test(base);
}

// ---- ampliação: ameaça, violência relatada na primeira pessoa, agressão que o(a) cuidador(a) teme cometer, abandono e emergências clínicas ----
// Alguém ameaça MATAR a pessoa que escreve ou outra pessoa. Antes ia para o cartão de suicídio (\"vai me matar\" casava com \"me matar\").
const OBJETO_PESSOA = '(?:o|a|os|as|meu|minha|meus|minhas|seu|sua|seus|suas|ela|ele|elas|eles|alguem|todos|todas|esposa|marido|mulher|filh\\w+|crianc\\w+|menin\\w+|net[oa]s?|mae|pai)';
const NAO_E_PESSOA = '(?!(?:a |o )?(?:fome|sede|saudade|aula|tempo|curiosidade|vontade|barata|mosquito|rato|ratos|formiga|insetos?|servico|trabalho|charada|duvida|duvidas|pendencia|pendencias|demanda|demandas|fila|filas|vaga|vagas|processo|processos|ligacao|ligacoes|ansiedade|dor|prazo|prazos|relatorio|relatorios|tarefa|tarefas|planilha|planilhas|atraso|atrasos|lista|listas|pauta|pautas|agenda|ata|oficio|oficios|backlog|problema|problemas)\\b)';
const ARMA = '(?:uma |um |a |o )?(?:faca|facao|arma|revolver|pistola|espingarda|garrucha|foice|machado|tercado|pedaco de pau)';
// "me ameaçou com faca", "apontou uma arma pra ela": ameaça com arma é risco de vida mesmo sem a palavra "matar".
const AMEACA_MATAR_ME = new RegExp('\\b(?:vai|vao|quer|querem|prometeu|jurou|ameaca|ameacou|ameacando|ameacam|tentou|tentaram|tenta) (?:de |em )?me (?:matar|esfaquear|espancar|estrangular)\\b|\\b(?:me|nos|a minha|o meu|minha|meu|a|o) ?(?:\\w+ )?ameac(?:a|ou|ando|am|aram) (?:me |nos |ela |ele |a |o )?(?:com|de) ' + ARMA + '\\b|\\b(?:apontou|apontando|puxou|sacou|empunhou|empunhando) ' + ARMA + ' (?:pra|para|contra|na direcao d[eao]|em direcao a) (?:mim|nos|ela|ele|elas|eles|(?:minha |meu |a |o |sua |seu )?crianca|(?:minha |meu |a |o |sua |seu )?(?:menin[oa]|bebe|filh\\w+|mae|pai|marido|esposa|mulher))\\b');
const AMEACA_TERCEIRO = new RegExp('\\b(?:(?:ameac(?:a|ou|ando|am|aram)|prometeu|jurou|disse que (?:vai|vao|quer)|(?:vai|vao|quer|querem|ia|queria)) (?:de )?matar ' + NAO_E_PESSOA + OBJETO_PESSOA + '\\b|ameac(?:a|ou|ando|am|aram)s? (?:de )?morte|ameac(?:a|as) de morte|medo de (?:ser )?(?:morta|morto|assassinad[oa]|agredid[oa]|espancad[oa])|medo (?:pela|por) (?:minha|a minha) vida|temo pela minha vida)');
// Quem diz que VAI machucar alguém (raiva, esgotamento de cuidador): outra conduta, outro texto.
const INTENCAO_AGREDIR = new RegExp('\\b(?:(?:vou|quero|vontade de|estou com vontade de|tenho vontade de|ia|penso em|pensando em) (?:matar|machucar|espancar|esfaquear) ' + NAO_E_PESSOA + '(?:o|a|os|as|n[oa]s?|meu|minha|meus|minhas|alguem|ela|ele|elas|eles|crianc\\w+|filh\\w+|menin\\w+|marido|esposa|mulher|bebe)\\b|(?:vou|quero|vontade de|estou com vontade de|tenho vontade de|ia|penso em|pensando em) (?:bater|surrar) (?:n[oa]s?|em) ?(?:meu|minha|meus|minhas|o|a|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|marido|esposa|mulher|alguem|ela|ele)\\b|(?:estou|to|ando) (?:perdendo|sem) (?:o )?controle (?:com|d[eao]s?) (?:meu|minha|meus|minhas|a|o|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|marido|esposa)|nao (?:consigo|aguento) me controlar (?:com|d[eao]s?) (?:meu|minha|meus|minhas|a|o|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+)|(?:bati|espanquei|machuquei|agredi) (?:n[oa]s?|em|o|a|os|as) ?(?:meu|minha|meus|minhas)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|esposa|marido|mulher))');
// Violência sofrida, dita por quem sofre, ou de um adulto contra criança/adolescente sem a palavra \"abuso\".
const VIOLENCIA_SOFRIDA = /\b(?:abus(?:a|ou|am|aram|ando) de mim|(?:me|nos) (?:abus|molest|estupr)(?:a|ou|am|aram)|(?:me|nos) (?:bate|batendo(?! na porta)|bateu|batem|espanca|espancou|agride|agredindo|agrediu|estrangula|estrangulou|sufoca|sufocou|ameaca de morte)|(?:fui|foi|foram|fomos) (?:agredid|espancad|estuprad|abusad|violentad|molestad|ameacad)\w*|(?:padrasto|madrasta|pai|mae|tio|tia|avo|avos|primo|irmao|padrinho|vizinho|professor|pastor|patrao|marido|namorado|companheiro|ex) (?:me|nela|nele) (?:toca|tocou|forca|forcou)\b|(?:padrasto|madrasta|pai|mae|tio|tia|avo|avos|primo|irmao|padrinho|vizinho|professor|pastor|patrao|marido|namorado|companheiro|ex) (?:mexe|mexeu) comigo\b|(?:ele|ela) mexe com (?:a |o )?(?:sobrinh|filh|entead|net|menin|crianc)\w*|mexe com (?:a |o )?(?:sobrinh|filh|entead|net|menin|crianc)\w*|(?:abus|estupr|molest|violent)(?:ando|a|am) (?:a |o |as |os |da |do |das |dos |de )?(?:crianc\w*|menin\w*|filh\w*|sobrinh\w*|entead\w*|net[ao]s?|adolescent\w*|irma\w*|prim[ao]s?|mulher)\b|(?:sofrendo|sofre|sofreu|sofri) (?:abuso|violencia|maus tratos|agressao|agressoes)\b|(?:trancad[oa]|presa|preso) (?:em casa|no quarto|no comodo)|carcere privado|nao (?:deixa|deixou|deixam) (?:ela|ele|eu|a mulher|a menina|o menino) sair de casa)\b/;
// Criança, adolescente ou pessoa idosa em abandono, cárcere ou sem comida.
const ABANDONO = /\b(?:crianca|bebe|idos[oa]|menin[oa]|adolescent\w*)s?\b[^.?!]{0,40}?\b(?:abandonad[oa]s?|trancad[oa]s?|amarrad[oa]s?|acorrentad[oa]s?|sem (?:comer|comida) (?:ha|desde|por) (?:\w+ )?(?:dias|horas))\b/;
// Ferimento grave e emergência de saúde sem as palavras \"overdose\" ou \"desmaiou\".
// Ferimento por arma: saúde E polícia.
const FERIMENTO_ARMA = /\b(?:levou (?:um |dois |varios )?(?:tiros?|facadas?)|(?:foi|foram|esta|estao|ficou) (?:\w+ )?(?:balead|esfaquead)[oa]s?|balead[oa]|esfaquead[oa]|facada|tiroteio)\b/;
const CLINICA_AMPLA = /\b(?:(?:bebe|crianca|ele|ela|idos[oa]|ninguem|pessoa)?\s?nao (?:esta )?respira(?:ndo)?|sem respirar|parou de respirar|(?:esta|estava|ficou) (?:\w+ )?desmaiad[oa]|nao (?:acorda|acordou|desperta)(?! (?:cedo|de manha|para|pra|a tempo|no horario|sozinh\w*|facil|mais cedo))|nao (?:reage|reagiu|responde) (?:a nada|ao chamado|aos estimulos|quando chamo|quando chamamos)|sangrando (?:muito|bastante|sem parar)|sangramento (?:forte|intenso|que nao para)|hemorragia|(?:teve|esta tendo|estao tendo|sofreu) (?:um |uma )?(?:avc|derrame|infarto|ataque cardiaco|convulsao|parada cardiaca)|infartou|infartando|engasg(?:ou|ando|ada|ado)|afogou|afogando|afogad[oa]|(?:casa|barraco|quarto) (?:pegou|pegando) fogo|pegou fogo na (?:casa|barraco)|(?:foi|ficou|esta) (?:mordid|picad)[oa] (?:de|por|pela|pelo) (?:uma? )?(?:cobra|escorpiao)|levou choque eletrico)\b/;

const PADROES = [
  {
    // alguém ameaça matar quem escreve ("ele vai me matar"): proteção, não cartão de suicídio
    tipo: 'violencia',
    titulo: 'Ameaça de morte: proteja a pessoa e acione ajuda agora',
    re: AMEACA_MATAR_ME,
    geral: true,
    texto: 'AMEACA',
    numeros: ['190', '180', '100']
  },
  {
    tipo: 'suicidio',
    titulo: 'Risco de vida: acione ajuda agora',
    re: /\b(suicid\w*|me matar|se matar|ele se matar|ela se matar|quer(?:o|endo|er|ia)? morrer|nao quer(?:o|er)? mais viver|tirar (?:a |minha |sua |propria )*vida|acabar com (?:a |minha |sua )*vida|acabar com tudo|automutil\w*|autolesao|auto lesao|se cortando|me cortando|se cortar|me cortar|pensando em morrer|ideacao)\b/,
    extra: SINAIS_SUICIDIO_RE,
    numeros: ['192', '188', '193']
  },
  {
    tipo: 'violencia',
    titulo: 'Violência em andamento: acione ajuda agora',
    re: /\b((?:esta|estao|estou|estamos) (?:sendo )?(?:agredid|espancad|ameacad|estuprad|abusad|violentad|molestad)\w*|sendo (?:agredid|espancad|ameacad|estuprad|abusad|violentad|molestad)\w*|violencia (?:em curso|agora|em andamento)|abuso (?:em andamento|acontecendo agora))\b/,
    numeros: ['190', '180', '100']
  },
  {
    // termos vagos: só valem fora de pergunta geral; "socorro financeiro/social..." é pedido de benefício, não de ajuda
    tipo: 'violencia',
    titulo: 'Violência em andamento: acione ajuda agora',
    re: /\b(risco de vida|risco iminente|em perigo|correndo perigo|socorro(?! (?:financeiro|social|alimentar|emergencial|material|habitacional)))\b/,
    geral: true,
    numeros: ['190', '180', '100']
  },
  {
    // agressão física relatada (presente ou passado recente): "a vizinha apanha do marido", "ele bate na filha"
    tipo: 'violencia',
    titulo: 'Relato de violência: proteja a pessoa e acione a rede',
    re: /\b(?:apanh(?:a|am|ando|ou|aram|ei) (?:d[eoa]s?|em|muito|bastante|toda|todo|todos|todas|sempre|dele|dela)\b|espanc\w+|bat(?:e|eu|em|endo) (?:n[oa]s?|em) (?:filh\w*|espos\w*|mulher|marido|crianc\w*|menin\w*|adolescent\w*|mae|pai|net[oa]s?|namorad\w*|companheir\w*|idos\w*|avo\w*|irma\w*|bebe\w*|dela|dele)\b|bat(?:e|eu|em|endo) n(?:ele|ela|eles|elas)\b)/,
    texto: 'RELATO',
    numeros: ['190', '180', '100']
  },
  {
    // violência sexual e abuso: só com caso (ver CASO_VIOLENCIA)
    tipo: 'violencia',
    titulo: 'Relato de violência: proteja a pessoa e acione a rede',
    re: /\b(?:abuso sexual|abusad[oa]|abusou|estupr\w+|violencia sexual|violentad[oa]|molestad[oa]|molestou)\b/,
    exigeCaso: true,
    texto: 'RELATO',
    numeros: ['190', '180', '100']
  },
  {
    tipo: 'clinica',
    titulo: 'Emergência de saúde: acione ajuda agora',
    re: /\b(overdose|parou de respirar|(?:esta|ficou|estava|encontrei|encontramos) (?:\w+ )?(?:inconsciente|desacordad[oa])|desmaiou|convuls\w*|engoliu (?:remedio|veneno)s?)\b/,
    extra: SINAIS_CLINICA,
    numeros: ['192', '193']
  },
  {
    // ampliação: ameaça de morte a terceiros e violência relatada por quem sofre
    tipo: 'violencia',
    titulo: 'Ameaça de morte: proteja a pessoa e acione ajuda agora',
    re: AMEACA_TERCEIRO,
    geral: true,
    texto: 'AMEACA',
    numeros: ['190', '180', '100']
  },
  {
    tipo: 'violencia',
    titulo: 'Relato de violência: proteja a pessoa e acione a rede',
    re: VIOLENCIA_SOFRIDA,
    geral: true,
    texto: 'RELATO',
    numeros: ['190', '180', '100']
  },
  {
    tipo: 'violencia',
    titulo: 'Criança, adolescente ou pessoa idosa em risco: acione a rede agora',
    re: ABANDONO,
    geral: true,
    texto: 'RELATO',
    numeros: ['190', '100']
  },
  {
    // quem teme machucar alguém (cuidador esgotado, raiva): afastar, pedir apoio e proteger quem está perto
    tipo: 'agressao',
    titulo: 'Antes de machucar alguém: pare e peça apoio agora',
    re: INTENCAO_AGREDIR,
    texto: 'AGRESSAO',
    numeros: ['188', '190']
  },
  {
    tipo: 'clinica',
    titulo: 'Emergência de saúde: acione ajuda agora',
    re: CLINICA_AMPLA,
    geral: true,
    numeros: ['192', '193']
  },
  {
    tipo: 'clinica',
    titulo: 'Ferimento grave: acione ajuda agora',
    re: FERIMENTO_ARMA,
    geral: true,
    numeros: ['192', '190']
  }
];

const TEXTO_PADRAO = 'Se há risco de vida agora, ligue primeiro para um destes números. Depois, acione o serviço de referência do território e a coordenação. Se a sua dúvida for sobre o fluxo de atendimento, reformule a pergunta e eu ajudo.';

// Para quem escreve sobre si mesmo: acolhe, sem validar o desejo de morrer, e aponta o CVV e o SAMU.
const TEXTO_PESSOAL = 'Sinto muito que você esteja passando por isso. Você não precisa enfrentar essa dor sozinho(a). Ligue agora para o CVV, 188 (gratuito, 24 horas), ou, se estiver em perigo neste momento, para o SAMU, 192. Se puder, fique perto de alguém de confiança e peça que alguém fique com você. Se você é profissional e escreveu sobre um caso, reformule em terceira pessoa, sem identificar a pessoa.';

// Para o profissional diante de um caso: só os cuidados imediatos da cartilha ABP/CFM (2014). Não lista meios nem classifica o risco.
const TEXTO_TERCEIRO = 'Se há risco imediato, não deixe a pessoa sozinha: fique com ela, converse com calma e sem julgamento, e ligue para o SAMU (192). Se o perigo for imediato, peça uma ambulância, em vez de levá-la por conta própria. Lembre que perguntar não aumenta o risco e costuma trazer alívio (cartilha ABP/CFM, 2014). Depois, acione o serviço de referência (UBS ou CAPS) e a coordenação. Eu não classifico o risco de uma pessoa específica: isso é avaliação da equipe. Se a sua dúvida for geral (como avaliar, abordar ou encaminhar), pergunte sem relatar um caso e eu respondo com a cartilha.';

// Relato de violência (ela apanha, a criança contou de um abuso): protege primeiro, depois a rede. Não classifica o caso nem fala em sigilo.
const TEXTO_RELATO = 'Se a pessoa corre risco agora, ligue 190. Violência contra a mulher: 180. Contra criança, adolescente ou pessoa idosa: Disque 100. A suspeita de violência contra criança ou adolescente deve ser comunicada ao Conselho Tutelar. Depois, acione o CREAS ou o serviço de referência e a coordenação, e registre o que foi relatado sem pedir que a pessoa conte tudo de novo. Se a sua dúvida for sobre o fluxo, reformule sem relatar um caso e eu ajudo.';

// Ameaça de morte (a quem escreve ou a outra pessoa): protege primeiro, não confronta quem ameaça.
const TEXTO_AMEACA = 'Ameaça de morte é risco real e deve ser levada a sério. Se a pessoa ameaçada corre perigo agora, ligue 190. Violência contra a mulher: 180. Contra criança, adolescente ou pessoa idosa: Disque 100 e Conselho Tutelar, quando for criança ou adolescente. Não confronte quem ameaça e não deixe a pessoa ameaçada sozinha, se for possível. Depois, acione o CREAS ou o serviço de referência e a coordenação. Se a sua dúvida for sobre o fluxo, reformule sem relatar um caso e eu ajudo.';

// Quem diz que vai machucar alguém: acolhe sem julgar, pede para se afastar e protege quem está perto. Não dá sermão.
const TEXTO_AGRESSAO = 'Pare um instante: o mais importante agora é que ninguém se machuque. Se puder, afaste-se da situação (outro cômodo, a rua, um vizinho) e, se houver criança por perto, peça para outro adulto ficar com ela. Respire fundo e converse com alguém agora: CVV, 188 (gratuito, 24 horas). Se alguém estiver em perigo neste momento, ligue 190. Passada a crise, procure o CRAS, o CREAS ou a UBS: sentir esse limite é sinal de que você precisa de apoio, e a rede existe para isso. Se você é profissional e escreveu sobre um caso, reformule em terceira pessoa, sem identificar ninguém.';

// Quem fala de si, além de PRIMEIRA_PESSOA. Fica de fora se a frase relata o que outra pessoa disse ("ela falou que queria sumir").
const PRIMEIRA_PESSOA_EXTRA = /\b(?:minha vida nao tem (?:mais )?sentido|nao (?:aguento|suporto|consigo) mais (?:viver|essa vida|esta vida)|nao (?:vejo|tenho) (?:mais )?(?:sentido em viver|sentido na vida|razao (?:pra|para) viver|motivo (?:pra|para) viver)|quer(?:o|ia) (?:sumir|desaparecer)|(?:vou|quero|pensando em|penso em|ia) me (?:jogar|enforcar|afogar|envenenar)|vou pular|queria estar morto|queria estar morta|queria nao ter nascido|(?:vou|quero) dar fim a minha vida|(?:cansei|estou cansad[oa]|to cansad[oa]) de viver|nao quero mais (?:estar aqui|existir)|ninguem sentiria (?:a )?minha falta|melhor (?:pra|para) (?:todo mundo|todos) se eu (?:morresse|nao existisse)|(?:acabar|acabando) com (?:a )?minha dor de uma vez|(?:vou|quero) (?:por|pondo) fim a tudo|so a morte (?:me )?(?:resolve|ajuda)|(?:queria|quero) dormir (?:e nunca mais acordar|pra sempre|para sempre)|(?:vou|quero) me (?:atirar|lancar) na frente|me dar (?:um )?tiro|(?:vou|quero) usar (?:a arma|ela|isso) em mim|me atropelasse|usar [^.?!]{0,12}em mim|(?:queria|quero) [^.?!]{0,25}dormir (?:pra|para) sempre|(?:carta|bilhete) de despedida|me cortei(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\b)|(?:me) (?:machuco|machucando|firo|ferindo) de proposito|nao quer(?:o|ia) mais acordar|(?:melhor|seria melhor) eu nao estar mais aqui|(?:vou|quero|ia|pensando em|penso em) tomar (?:todos|todo) (?:os |o )?(?:\w+ )?(?:remedios?|comprimidos?|medicamentos?|cartela)|(?:vou|quero|ia|pensando em|penso em) (?:me )?atirar em mim|me corto(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\b)|(?:vontade|desejo|impulso) de me (?:machucar|ferir|cortar|furar|queimar))\b/;
const RELATA_TERCEIRO = /\b(?:disse|disseram|falou|falaram|contou|relatou|verbalizou|mencionou)\b/;

// Erro de digitação em duas palavras-chave ("me mattar", "vou me matr", "suisidio"). Distância de edição pequena e só nestes casos:
// "matar" só depois de "me"/"se" e a no máximo 1 letra; "suicídio/suicidar" a no máximo 2 letras e com 7+ letras. Outras palavras ("morrer",
// "cortar") ficam de fora de propósito: "correr" e "portar" virariam alarme falso.
function criseDistancia(a, b) {
  const m = a.length, n = b.length;
  let ant = [], atual = [];
  for (let j = 0; j <= n; j++) ant.push(j);
  for (let i = 1; i <= m; i++) {
    atual = [i];
    for (let j = 1; j <= n; j++) atual.push(Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
    ant = atual;
  }
  return ant[n];
}
function criseCorrigirGrafia(t) {
  const palavras = t.split(' ');
  let mudou = false;
  for (let i = 0; i < palavras.length; i++) {
    const w = palavras[i].replace(/[^a-z]/g, '');
    if (w.length >= 7 && w.length <= 10 && w !== 'suicidio' && w !== 'suicidar' && (criseDistancia(w, 'suicidio') <= 2 || criseDistancia(w, 'suicidar') <= 2) && /^su/.test(w)) { palavras[i] = 'suicidio'; mudou = true; }
    else if (i > 0 && /^(?:me|se)$/.test(palavras[i - 1]) && w.length >= 4 && w.length <= 6 && w !== 'matar' && criseDistancia(w, 'matar') <= 1 && /^m/.test(w) && /r$/.test(w)) { palavras[i] = 'matar'; mudou = true; }
  }
  return mudou ? palavras.join(' ') : t;
}

// Devolve null se não for pedido de socorro.
function detectarCrisePt(texto, jaCorrigido) {
  // "Pronto Socorro" é um serviço de saúde, não um pedido de socorro ("qual o endereço do pronto-socorro?")
  // Dígito entre letras vira a letra parecida ("su1c1dio" -> "suicidio"), para a grafia disfarçada não passar. Dígito solto fica como está.
  const t = semAcento(texto).replace(/([a-z])([013457])(?=[a-z])/g, function (_, l, d) { return l + ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' })[d]; }).replace(/pronto[ -]+socorro/g, 'pronto atendimento').replace(/\bmorr(?:er|endo|i|eu|o|emos|eram|erei) de (?:rir|risada|vergonha|fome|sede|sono|calor|frio|saudades?|medo|curiosidade|raiva|inveja|ciumes?|tedio|cansaco|preguica|pena|amores?)\b/g, ' ');
  // "morrer de rir", "morrendo de vergonha", "morro de saudade": expressão, não desejo de morrer (como já era no espanhol e no inglês)
  for (const p of PADROES) {
    if (!p.re.test(t) && !(p.extra && p.extra.test(t))) continue;
    if (p.geral && perguntaGeral(t, p.texto === 'AMEACA')) continue;
    if (p.exigeCaso && !CASO_VIOLENCIA.test(t)) continue;
    if (p.tipo === 'suicidio') {
      if (ehPerguntaTecnicaSuicidio(texto)) continue;
      const pessoal = PRIMEIRA_PESSOA.test(t) || (PRIMEIRA_PESSOA_EXTRA.test(t) && !RELATA_TERCEIRO.test(t));
      const numeros = pessoal ? ['188', '192'] : p.numeros;
      return {
        tipo: 'crise',
        subtipo: p.tipo,
        titulo: p.titulo,
        texto: pessoal ? TEXTO_PESSOAL : TEXTO_TERCEIRO,
        pessoal: pessoal,
        telefones: EMERGENCIAS.filter(e => numeros.includes(e.numero))
      };
    }
    return {
      tipo: 'crise',
      subtipo: p.tipo,
      titulo: p.titulo,
      texto: p.texto === 'RELATO' ? TEXTO_RELATO : p.texto === 'AMEACA' ? TEXTO_AMEACA : p.texto === 'AGRESSAO' ? TEXTO_AGRESSAO : TEXTO_PADRAO,
      telefones: EMERGENCIAS.filter(e => p.numeros.includes(e.numero))
    };
  }
  if (!jaCorrigido) {
    const corrigido = criseCorrigirGrafia(t);
    if (corrigido !== t) return detectarCrisePt(corrigido, true);
  }
  return null;
}


// =====================================================================================================================
// ESPANHOL (v0.18.0). Quem é atendido em Roraima escreve em espanhol ou em "portunhol"; o socorro não pode depender do idioma.
// Mesma lógica do português: o cartão sai no aparelho, sem IA, e vem em espanhol quando a mensagem é em espanhol, com os mesmos
// números do Brasil. Pergunta TÉCNICA geral ("¿cómo evaluar el riesgo de suicidio?") não gera cartão, como no português.
// Padrões ambíguos ("me pega") só valem com complemento de agressão. É um filtro por padrões, não uma garantia.
// =====================================================================================================================

const TEL_ES = {
  '192': 'SAMU (ambulancia)', '193': 'Bomberos', '190': 'Policía Militar', '188': 'CVV (apoyo emocional, 24 horas)',
  '180': 'Central de Atención a la Mujer', '100': 'Disque Derechos Humanos (Disque 100)'
};
function telefonesEs(numeros) { return numeros.map(function (n) { return { numero: n, nome: TEL_ES[n] }; }); }

function criseEsTexto(t) {
  return semAcento(t).replace(/[¿¡!?.,;:"“”()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const ES_TEXTO_PADRAO = 'Si hay riesgo de vida ahora, llame primero a uno de estos números. Después, active el servicio de referencia del territorio y la coordinación.';
const ES_TEXTO_PESSOAL = 'Siento mucho que esté pasando por esto. No tiene que enfrentar este dolor solo(a). Llame ahora al CVV, 188 (gratuito, 24 horas), o, si está en peligro en este momento, al SAMU, 192. Si puede, quédese cerca de alguien de confianza y pida que alguien se quede con usted. Si es profesional y escribió sobre un caso, reformule en tercera persona, sin identificar a la persona.';
const ES_TEXTO_TERCEIRO = 'Si hay riesgo inmediato, no deje a la persona sola: quédese con ella, hable con calma y sin juzgar, y llame al SAMU (192). Si el peligro es inmediato, pida una ambulancia en lugar de llevarla por su cuenta. Preguntar no aumenta el riesgo y suele traer alivio (cartilla ABP/CFM, 2014). Después, active el servicio de referencia (UBS o CAPS) y la coordinación. Yo no clasifico el riesgo de una persona concreta: eso es evaluación del equipo.';
const ES_TEXTO_RELATO = 'Si la persona corre riesgo ahora, llame al 190. Violencia contra la mujer: 180. Contra niños, adolescentes o personas mayores: Disque 100. La sospecha de violencia contra un niño o adolescente debe comunicarse al Consejo Tutelar (Conselho Tutelar). Después, active el CREAS o el servicio de referencia y la coordinación, y registre lo relatado sin pedir que la persona lo cuente todo de nuevo.';
const ES_TEXTO_AMEACA = 'Una amenaza de muerte debe tomarse en serio: proteja a la persona, aléjela del peligro si es posible y llame al 190. Violencia contra la mujer: 180. Después, active el CREAS y la coordinación.';
const ES_TEXTO_AGRESSAO = 'Antes de hacerle daño a alguien: aléjese, respire y pida apoyo ahora. Llame al CVV, 188 (24 horas). Si la persona corre riesgo, llame al 190. Proteja a quien está cerca y busque a su servicio de referencia después.';

// Verbos e termos (texto já sem acento, minúsculo e sem pontuação)
const ES_SUICIDIO = [
  'quiere (?:matarse|morirse|suicidarse)|se quiere matar|se va a matar|intento (?:suicidarse|matarse)|quiero morir(?:me)?\\b|quiero morirme|quisiera morir(?:me)?|quiero matarme|me quiero matar|me voy a matar|voy a matarme|quiero suicidarme|me voy a suicidar|pienso en suicidarme|pienso en matarme',
  'no quiero (?:seguir )?vivir|ya no quiero vivir|no quiero seguir viviendo|no puedo (?:mas )?vivir asi|ya no puedo mas con esta vida',
  '(?:mi|esta) vida no tiene sentido|no (?:le )?(?:veo|encuentro|tiene) sentido (?:a |en )?(?:la vida|vivir|seguir viviendo)|no tengo (?:razon|motivo) para vivir',
  'ya no aguanto (?:mas )?(?:esta |la )?vida|no aguanto mas vivir|no soporto mas vivir|estoy cansad[oa] de vivir',
  'quisiera (?:desaparecer|no existir|no haber nacido|estar muert[oa])|quiero desaparecer (?:para siempre|de este mundo)|seria mejor (?:si )?(?:yo )?(?:no existiera|estuviera muert[oa]|no estuviera)',
  '(?:pienso|pensando|pense) en (?:quitarme la vida|acabar con mi vida|terminar con mi vida|ponerle fin a mi vida)|quitarme la vida|acabar con mi vida|terminar con mi vida|poner fin a mi vida',
  '(?:vida|todo) sin mi seria mejor|mejor sin mi|nadie (?:me )?extranaria|nadie (?:sentiria|notaria) mi falta|seria mejor para todos sin mi',
  '(?:me voy a |quiero |pienso )?(?:tirar|lanzar|arrojar)(?:me)? (?:de|desde) (?:un |el |la )?(?:puente|edificio|ventana|balcon|terraza|techo|azotea)|saltar (?:del|de la|de un|desde)',
  '(?:me voy a |quiero |pienso en )?(?:ahorcar|ahogar|envenenar)(?:me)?\\b(?! de risa)',
  '(?:voy a|quiero|pienso en|estoy pensando en|queria) tomar(?:me)? (?:todas|todos|muchas|muchos|un monton de) (?:las |los )?(?:pastillas|pastilla|medicinas|medicamentos|tabletas|comprimidos)',
  '(?:me )?(?:corto|cortaba|corte) (?:los |las |el |la )?(?:brazos?|munecas?|piernas?|piel)|me hago dano a proposito|me lastimo a proposito|ganas de (?:cortarme|hacerme dano|lastimarme)',
  'me dispare|me voy a disparar|pegarme un tiro|darme un tiro|(?:tengo|con) (?:un )?(?:arma|revolver|pistola) para (?:matarme|quitarme)',
  'carta de despedida|me estoy despidiendo de todos|deje (?:una )?nota de despedida|dormir y no despertar|no quiero despertar'
].join('|');
const ES_SUICIDIO_TERCEIRO = '(?:mi|su|el|la) (?:hij[oa]|espos[oa]|marido|mujer|mama|papa|madre|padre|hermano|hermana|vecin[oa]|amig[oa]|paciente|usuari[oa]|nin[oa]|adolescente|tio|tia|abuel[oa]|pareja)';
const ES_SUICIDIO_PRIMEIRA = /\b(?:me quiero|quiero|quisiera|me voy a|voy a|pienso en|pensando en|estoy cansad[oa]|tengo ganas|no quiero|ya no (?:quiero|aguanto|puedo)|mi vida|me corto|me hago|me dispare|me lastimo)\b/;
const ES_RELATA_TERCEIRO = new RegExp('\\b' + ES_SUICIDIO_TERCEIRO + '\\b[^.]{0,40}\\b(?:quiere|se quiere|dice que quiere|habla de|amenaza con|intento|intento de|se corta|se cortaba|se hace dano|piensa en|dijo que|ha dicho)\\b|\\b(?:vecin[oa]|paciente|usuari[oa]|nin[oa]|adolescente|hij[oa])\\b[^.]{0,30}\\bquiere (?:matarse|morir|morirse|suicidarse)\\b');

const ES_VIOLENCIA_AGRESION = '(?:golpea|golpeo|golpearon|golpeaba|golpean|pega|pegaba|pegan|maltrata|maltrato|maltrataba|agrede|agredio|agreden|amenaza|amenazo|empuja|empujo|ahorca|ahorco|estrangula|patea|pateo|quema|quemo|encierra|encerro|insulta y golpea)';
const ES_RELATO_VIOLENCIA = [
  // "me pega" só com complemento de agressão (evita "me pega mucho el sol", "pega un grito")
  '\\bme (?:pega|pegaba|golpea|golpeaba|maltrata|maltrataba|agrede|agredio|empuja|empujo|patea|ahorca|estrangula|quema)\\b(?: (?:todos los dias|siempre|cada vez|muy fuerte|en (?:la |el )?(?:cara|cabeza|estomago|espalda)|a diario|delante de|frente a)|$| y\\b| porque\\b| cuando\\b| si\\b)',
  '\\b(?:mi|su|el|la|meu|minha) (?:espos[oa]|marido|mujer|pareja|novi[oa]|compan?er[oa]|padrastro|madrastra|papa|mama|padre|madre|tio|tia|abuel[oa]|hermano|hermana|ex) (?:me )?(?:pega|golpea|maltrata|agrede|amenaza|empuja|ahorca|patea|violenta)\\b',
  '\\b(?:le |les )?(?:pega|golpea|maltrata|agrede|patea|quema) (?:a )?(?:su |mi |la |el )?(?:hij[oa]|nin[oa]|bebe|esposa|mujer|madre|mama|anciano|abuel[oa])\\b',
  '(?:recibe|recibio|recibo|sufre|sufrio|sufri|sufro|sufren|sufriendo|sufrimos|sufrieron) (?:de )?(?:golpes|maltrato|violencia|abuso|agresiones|agresion|palizas)',
  'violencia (?:domestica|familiar|en (?:el|mi) hogar|en casa|de (?:mi|su) (?:pareja|esposo|marido))\\b[^.?]{0,30}\\b(?:sufro|sufriendo|vivo|vivimos|estoy|esta sufriendo|me)'
].join('|');
const ES_AMENAZA = '\\b(?:me va a matar|va a matarme|me quiere matar|quiere matarme|me amenaza con matarme|me amenazo con matarme|dijo que me va a matar|dijo que me mata|me mata si|nos va a matar|va a matar a (?:mi|la|el|su))\\b|\\bme amenaza de muerte\\b|\\bamenaza(?:s)? de muerte\\b[^.?]{0,20}\\b(?:recib|tengo|sufr|hacia)';
const ES_ABUSO = '\\b(?:abus(?:o|a|aron|aba|an) (?:de |a )?(?:mi|la|el|su|sus|un|una|ella|el|ellos|ellas|nosotros|nin[oa]s?)|abusad[oa]|violo a|me violaron|la violaron|lo violaron|violacion|violencia sexual|tocamientos|manoseo|manoseaba|molest(?:o|aba) sexualmente|acoso sexual)\\b';
const ES_ABUSO_CASO = /\b(?:mi|su|el|la|un|una|su)\b|\bme\b|\bella\b|\bnin[oa]s?\b|\bhij[oa]\b|\bdijo\b|\bcontó\b|\bconto\b|\bayer\b|\bhoy\b/;
const ES_ABANDONO = '\\b(?:(?:nin[oa]|bebe|menor|anciano|abuel[oa]|persona mayor)s? (?:esta |estan |estaba )?(?:encerrad[oa]s?|solo(?:s)?|abandonad[oa]s?|sin comer|sin cuidados?|atad[oa]s?)\\b[^.?]{0,40}\\b(?:dias?|horas?|sin comer|sin agua|desde)|(?:dejaron|dejo|dejan) (?:solo|sola|abandonad[oa])[^.?]{0,20}\\b(?:nin[oa]|bebe)|encerrad[oa] sin comer|sin comer hace (?:dos|tres|\\d+) dias)';
const ES_AGRESSAO = '\\b(?:voy a|quiero|tengo ganas de|siento ganas de|me dan ganas de|estoy a punto de) (?:golpear|pegar(?:le)?|lastimar|hacerle dano|matar|estrangular|ahorcar)(?:le|lo|la)? (?:a )?(?:mi |mis |su |al |a la |a un |a una )?(?:hij[oa]s?|nin[oa]s?|bebe|esposa|esposo|marido|mujer|madre|mama|papa|padre|anciano|abuel[oa]|pareja|vecin[oa])\\b|\\b(?:no aguanto|no soporto) mas (?:a )?(?:mi |mis |el |la )?(?:hij[oa]s?|nin[oa]s?|bebe)\\b[^.?]{0,25}\\b(?:voy a|ganas de) (?:golpear|pegar|lastimar)';
const ES_CLINICA = '\\b(?:sobredosis|se desmayo|desmayo|desmayada?|inconsciente|convuls\\w*|no respira|dejo de respirar|esta (?:inconsciente|desmayad[oa])|se ahoga|se esta ahogando|atragant\\w+|le dieron un tiro|disparo en|herida de bala|apunalad[oa]|se corto (?:muy )?(?:profundo|feo|mucho)|sangra mucho|sangrando mucho|hemorragia|ataque (?:al corazon|cardiaco)|infarto|tomo (?:muchas |muchos |todas |todos )?(?:pastillas|medicinas|medicamentos|veneno)|se tomo (?:el |un )?veneno|trago (?:veneno|lejia|cloro))\\b';
const ES_SOCORRO = '(?:^|\\s)(?:socorro|auxilio|ayuda urgente|necesito ayuda urgente|estoy en peligro|estamos en peligro|me estan matando|me esta matando|se esta muriendo|se esta desangrando)(?:\\s|$)';

// Pergunta técnica geral em espanhol sobre o tema (não gera cartão): "¿cómo evaluar el riesgo de suicidio?", "¿qué es la violencia doméstica?"
const ES_TECNICA = /^(?:como|que|cual(?:es)?|cuando|quien(?:es)?|donde|por que|para que|existe|hay|es obligatorio|debo|se debe|puedo|podemos|tengo que|tenemos que|que hago|que hacer)\b[^.]{0,120}\b(?:evaluar|abordar|detectar|identificar|prevenir|prevencion|atender|acompanar|notificar|protocolo|fluj[oa]|riesgo|factores|senales|mitos|guia|cartilla|norma|ley|diferencia|significa|es la|son los|caso de|casos de|trabajo|rol|papel)\b/;

function criseEsPerguntaTecnica(t) {
  if (/\b(?:mi|me|yo|estoy|quiero|tengo|voy|quisiera)\b/.test(t) && /\b(?:matar|morir|suicid|quitarme|despedir|desaparecer)\b/.test(t) && !/^(?:como|que) (?:evaluar|atender|abordar|hacer si|hago si)\b/.test(t)) return false;
  return ES_TECNICA.test(t);
}

const ES_PADROES = [
  { tipo: 'suicidio', titulo: 'Riesgo de vida: active ayuda ahora', re: new RegExp(ES_SUICIDIO), numeros: ['188', '192'] },
  { tipo: 'violencia', titulo: 'Amenaza de muerte: proteja a la persona y active ayuda ahora', re: new RegExp(ES_AMENAZA), texto: ES_TEXTO_AMEACA, numeros: ['190', '180', '100'] },
  { tipo: 'violencia', titulo: 'Relato de violencia: proteja a la persona y active la red', re: new RegExp(ES_ABUSO), exigeCaso: true, texto: ES_TEXTO_RELATO, numeros: ['190', '180', '100'] },
  { tipo: 'violencia', titulo: 'Relato de violencia: proteja a la persona y active la red', re: new RegExp(ES_RELATO_VIOLENCIA), texto: ES_TEXTO_RELATO, numeros: ['190', '180', '100'] },
  { tipo: 'violencia', titulo: 'Niño, adolescente o persona mayor en riesgo: active la red ahora', re: new RegExp(ES_ABANDONO), texto: ES_TEXTO_RELATO, numeros: ['190', '100'] },
  { tipo: 'agressao', titulo: 'Antes de hacer daño a alguien: pare y pida apoyo ahora', re: new RegExp(ES_AGRESSAO), texto: ES_TEXTO_AGRESSAO, numeros: ['188', '190'] },
  { tipo: 'clinica', titulo: 'Emergencia de salud: active ayuda ahora', re: new RegExp(ES_CLINICA), numeros: ['192', '193'], semBebeCatarro: true },
  { tipo: 'violencia', titulo: 'Violencia en curso: active ayuda ahora', re: new RegExp(ES_SOCORRO), curto: true, texto: ES_TEXTO_PADRAO, numeros: ['190', '180', '192'] }
];

function detectarCriseEs(texto) {
  const t = criseEsTexto(texto);
  if (!t) return null;
  if (criseEsPerguntaTecnica(t)) return null;
  // falsas alarmas comuns: expressões e queixas leves
  if (/\bmorir(?:me)? de (?:risa|verguenza|hambre|sueno|calor|frio|ganas)\b|\bmatar (?:el tiempo|la espera|el rato)\b|\bme muero de (?:risa|hambre|sueno|calor|frio|verguenza)\b|\bcansad[oa] de (?:esperar|la fila|la cola|hacer fila|hacer cola)\b/.test(t)) return null;
  for (const p of ES_PADROES) {
    if (!p.re.test(t)) continue;
    if (p.exigeCaso && !ES_ABUSO_CASO.test(t)) continue;
    // "socorro"/"auxilio" soltos só valem em mensagem curta ("pedido de socorro financeiro: ..." é outra coisa)
    if (p.curto && t.split(' ').length > 6) continue;
    if (p.tipo === 'clinica' && /\b(?:no respira bien|respira mal|catarro|gripe|resfriado|tos)\b/.test(t) && !/\b(?:no respira|dejo de respirar)\b(?! bien)/.test(t.replace(/no respira bien/g, ''))) continue;
    if (p.tipo === 'suicidio') {
      const terceiro = ES_RELATA_TERCEIRO.test(t);
      const pessoal = !terceiro && ES_SUICIDIO_PRIMEIRA.test(t);
      return {
        tipo: 'crise', subtipo: 'suicidio', titulo: p.titulo, idioma: 'es',
        texto: pessoal ? ES_TEXTO_PESSOAL : ES_TEXTO_TERCEIRO, pessoal: pessoal,
        telefones: telefonesEs(pessoal ? ['188', '192'] : ['192', '188'])
      };
    }
    return { tipo: 'crise', subtipo: p.tipo, titulo: p.titulo, idioma: 'es', texto: p.texto || ES_TEXTO_PADRAO, telefones: telefonesEs(p.numeros) };
  }
  return null;
}

function traduzirCartao(pt) {
  const mapa = {
    'Risco de vida: acione ajuda agora': 'Riesgo de vida: active ayuda ahora',
    'Relato de violência: proteja a pessoa e acione a rede': 'Relato de violencia: proteja a la persona y active la red',
    'Ameaça de morte: proteja a pessoa e acione ajuda agora': 'Amenaza de muerte: proteja a la persona y active ayuda ahora',
    'Emergência de saúde: acione ajuda agora': 'Emergencia de salud: active ayuda ahora',
    'Ferimento grave: acione ajuda agora': 'Herida grave: active ayuda ahora'
  };
  const textos = { 'violencia': ES_TEXTO_RELATO, 'agressao': ES_TEXTO_AGRESSAO, 'clinica': ES_TEXTO_PADRAO, 'suicidio': pt.pessoal ? ES_TEXTO_PESSOAL : ES_TEXTO_TERCEIRO };
  const nums = pt.telefones.map(function (x) { return x.numero; });
  return Object.assign({}, pt, { titulo: mapa[pt.titulo] || pt.titulo, texto: textos[pt.subtipo] || ES_TEXTO_PADRAO, telefones: telefonesEs(nums), idioma: 'es' });
}


// =====================================================================================================================
// INGLÊS (v0.19.0). Quem é atendido na fronteira com a Guiana, e quem escreve ao Paulus em inglês, também precisa do socorro.
// Mesma lógica do espanhol: o cartão sai no aparelho, sem IA, em inglês, com os números do Brasil. Pergunta TÉCNICA geral
// ("how do I assess suicide risk?") não gera cartão. Padrões ambíguos exigem complemento. É um filtro por padrões, não uma garantia.
// =====================================================================================================================

const TEL_EN = {
  '192': 'SAMU (ambulance)', '193': 'Fire department', '190': 'Military Police', '188': 'CVV (emotional support, 24 hours)',
  '180': 'Women\'s Helpline (Central de Atendimento à Mulher)', '100': 'Human Rights Hotline (Disque 100)'
};
function telefonesEn(numeros) { return numeros.map(function (n) { return { numero: n, nome: TEL_EN[n] }; }); }

function criseEnTexto(t) {
  return semAcento(t).replace(/['’‘`]/g, '').replace(/[!?.,;:"“”()\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const EN_TEXTO_PADRAO = 'If someone\'s life is at risk right now, call one of these numbers first. Then contact the reference service in your area and your coordination.';
const EN_TEXTO_PESSOAL = 'I am very sorry you are going through this. You do not have to face this pain alone. Call the CVV now at 188 (free, 24 hours) or, if you are in danger right now, SAMU at 192. If you can, stay close to someone you trust and ask them to stay with you. If you are a professional writing about a case, rewrite it in the third person, without identifying the person.';
const EN_TEXTO_TERCEIRO = 'If the risk is immediate, do not leave the person alone: stay with them, speak calmly and without judging, and call SAMU (192). If the danger is immediate, ask for an ambulance instead of taking them yourself. Asking does not increase the risk and often brings relief (ABP/CFM booklet, 2014). Afterwards, contact the reference service (UBS or CAPS) and your coordination. I do not classify the risk of a specific person: that is the team\'s assessment.';
const EN_TEXTO_RELATO = 'If the person is at risk now, call 190. Violence against women: 180. Against children, teenagers or older people: Disque 100. Suspected violence against a child or teenager must be reported to the Guardianship Council (Conselho Tutelar). Afterwards, contact the CREAS or the reference service and your coordination, and record what was said without asking the person to tell it all again.';
const EN_TEXTO_AMEACA = 'A death threat must be taken seriously: protect the person, move them away from danger if possible and call 190. Violence against women: 180. Afterwards, contact the CREAS and your coordination.';
const EN_TEXTO_AGRESSAO = 'Before hurting someone: step away, breathe and ask for support now. Call the CVV at 188 (24 hours). If the person is at risk, call 190. Protect whoever is nearby and contact your reference service afterwards.';

const EN_SUICIDIO = [
  'i (?:want|wanna|need) to (?:die|kill myself|end it all|end my life|disappear forever)|i (?:am|m|will|shall) (?:going to |gonna )?(?:kill myself|end my life|commit suicide)|im (?:going to |gonna )?kill myself|i will kill myself|i should (?:just )?(?:die|kill myself)',
  'i (?:do not|dont) want to (?:live|be here|exist|wake up|go on)|i no longer want to live|dont want to live anymore|do not want to live anymore',
  'i (?:cant|cannot|can not) (?:go on living|live like this|live anymore|keep living|go on like this)',
  'i (?:am|m) (?:so )?(?:tired|sick|done) of (?:living|life)|im (?:so )?(?:tired|sick|done) of (?:living|life)|(?:my )?life (?:is|has) no (?:meaning|point|purpose|sense)|no reason to live|nothing to live for|(?:life )?(?:is|isnt|is not) (?:not )?worth living',
  'i wish i (?:was|were) dead|i wish i (?:had never been born|would not wake up|wouldnt wake up|could disappear|did not exist|didnt exist)|better off (?:dead|without me)|everyone would be better off without me|no one would (?:miss|notice) me|nobody would (?:miss|notice) me',
  '\\bsuicidal\\b|(?:thinking|thought|thoughts?) (?:about|of) (?:suicide|killing myself|ending (?:it|my life)|ending it all)|suicidal thoughts|(?:i am|im|i feel) suicidal|suicide plan|(?:commit|committing|attempt|attempted|attempting) suicide|killed? myself|ending my life',
  '(?:wants|want|wanted|wanting|trying|tried|threatens|threatened|plans|planned|planning|talks about|talking about|keeps talking about|said (?:he|she|they) (?:wants|will)) to (?:kill (?:himself|herself|themselves|themself)|die|commit suicide|end (?:his|her|their) life)|(?:he|she|they) (?:is|are|was|were) (?:suicidal|going to kill (?:himself|herself|themselves))|(?:tried|attempted) (?:to )?(?:commit )?suicide|attempted suicide',
  'self ?harm(?:ing)?|(?:i )?(?:cut|cutting|hurt|hurting|harm|harming) (?:myself|my (?:arms?|wrists?|legs?|skin))(?: on purpose| again)?|i want to (?:cut|hurt) myself',
  '(?:jump|jumping|throw myself|throwing myself) (?:off|from|out of) (?:a |the |my )?(?:bridge|building|roof|balcony|window)|(?:hang|hanging|shoot|shooting|poison|poisoning|drown|drowning) myself|(?:take|taking|swallow|swallowed|swallowing) (?:all |a bunch of |too many |a lot of )(?:the |my |of the )?(?:pills|tablets|medication|medicine)',
  '(?:suicide|goodbye) (?:note|letter)|saying goodbye to everyone|(?:i )?left (?:a )?(?:suicide )?note'
].join('|');
const EN_SUICIDIO_TERCEIRO = /\b(?:he|she|they|my (?:son|daughter|child|kid|wife|husband|mother|mom|mum|father|dad|brother|sister|neighbou?r|friend|patient|client|user|teenager|boy|girl|partner|uncle|aunt|grand\w+)|the (?:patient|client|user|boy|girl|teenager|child|kid)|a (?:patient|client|user|boy|girl|teenager|child|kid)|someone|somebody)\b[^.]{0,40}\b(?:wants|want|wanted|tried|attempted|is suicidal|was suicidal|threatens|threatened|talks about|says|said|planning|plans|cuts|cut|keeps)\b/;
const EN_SUICIDIO_PRIMEIRA = /\b(?:i want|i wanna|i need|i am going|im going|im gonna|i will|i should|i do not want|i dont want|i no longer|i cant|i cannot|i can not|im tired|im sick|im done|i am tired|i am sick|i am done|my life|i wish|i feel suicidal|im suicidal|i am suicidal|i cut|i hurt myself|im thinking|i am thinking|i have been thinking|i keep thinking)\b/;

const EN_AMENAZA = '(?:he|she|they|my \\w+|someone|somebody) (?:is going to|is gonna|will|wants to|said (?:he|she|they) (?:will|would|is going to)|says (?:he|she|they) will|threatens? to|threatened to) kill (?:me|us|the (?:kids|children))|(?:going to|gonna|will|wants to) kill me\\b|\\b(?:received|receiving|got|get|have|having|gets|receive) (?:a )?death threats?|threatens? me with death|death threats? (?:against|to) (?:me|us|my)';
const EN_RELATO_VIOLENCIA = [
  '\\b(?:he|she|they|my \\w+) (?:hits|beats|slaps|chokes|strangles|punches|kicks|burns|locks|hit|beat|slapped|choked|punched|kicked) (?:me|us)\\b(?! (?:with|by|on|at|in|up in|up on) (?:a |the |an )?(?:ball|frisbee|pillow|snowball|toy|accident|chance|surprise))',
  '\\b(?:my|his|her) (?:husband|wife|partner|boyfriend|girlfriend|stepfather|stepmother|father|mother|dad|mom|mum|uncle|aunt|ex|boss|brother|sister) (?:hits|beats|hit|beat|slaps|slapped|chokes|choked|punches|punched|kicks|kicked|abuses|abused|threatens|threatened|rapes|raped|molests|molested|assaults|assaulted)\\b',
  '\\b(?:hits|beats|abuses|slaps|punches|kicks|molests|burns|neglects|hit|beat|abused|slapped|punched|kicked|molested) (?:his|her|their|my|the) (?:child|children|kids?|son|daughter|baby|wife|mother|mom|elderly|grandmother|grandfather)\\b',
  '\\bi (?:am|m|was|got|have been|ve been|am being|m being) (?:being )?(?:abused|beaten|attacked|raped|assaulted|molested|hit)\\b',
  '\\b(?:he|she|they) (?:raped|molested|sexually abused|sexually assaulted|touched) (?:me|my|her|him|them)\\b|(?:was|been|being|got) (?:raped|molested|sexually abused)\\b',
  '\\b(?:domestic|family) violence\\b[^.?]{0,30}\\b(?:i |we |my |at home|in my)'
].join('|');
const EN_ABANDONO = '\\b(?:(?:child|children|kids?|baby|infant|toddler|elderly (?:man|woman|person|mother|father)|grandmother|grandfather) (?:is |are |was |were )?(?:locked|alone|abandoned|left alone|tied)\\b[^.?]{0,40}\\b(?:days?|hours?|without food|without water|since)|(?:left|leaves|leave) (?:the )?(?:child|children|kids?|baby)\\b[^.?]{0,20}\\balone[^.?]{0,20}\\b(?:days?|hours?|night)|without (?:eating|food) for (?:two|three|\\d+) days)';
const EN_AGRESSAO = '\\b(?:i am going to|im going to|im gonna|i want to|i feel like|i might|im about to|i could) (?:hit|beat|hurt|strangle|choke|slap|kill)(?: up)? (?:my |the |this |his |her )?(?:child|children|kids?|son|daughter|baby|wife|husband|partner|mother|mom|dad|father|elderly|neighbou?r|him|her|them)\\b';
const EN_CLINICA = '\\b(?:overdose|overdosed|overdosing|not breathing|stopped breathing|isnt breathing|is not breathing|cant breathe|cannot breathe|(?:is|was|am) choking|(?:is|was) unconscious|unresponsive|fainted|(?:he|she|they|baby|child|man|woman|mother|father|person|patient) (?:just )?passed out|(?:having|had|is having) (?:a )?seizure|is seizing|bleeding (?:a lot|heavily|badly|out)|heavy bleeding|bleeding heavily|gunshot|was shot|got shot|been shot|stabbed|drowning)\\b';
const EN_SOCORRO = '(?:^|\\s)(?:help me|please help|help us|call (?:an )?ambulance|call the police|call 192|call 190|im in danger|were in danger|i am in danger|we are in danger|im being attacked|hes attacking me|shes attacking me|i need urgent help|i need help urgently|someone is dying|hes dying|shes dying|they are killing me|hes killing me|shes killing me)(?:\\s|$)|^help$';

// Pergunta técnica geral sobre o tema (não gera cartão): "how do I assess suicide risk?", "what is domestic violence?"
const EN_TECNICA = /^(?:how|what|which|when|who|where|why|is|are|do|does|should|must|can|could|whats|hows)\b[^.]{0,140}\b(?:assess|assessing|assessment|approach|approaching|handle|handling|identify|identifying|detect|detecting|prevent|prevention|protocol|flow|risk|risks|factors|signs|warning|notify|notifying|report|reporting|mandatory|law|legal|definition|define|mean|means|difference|types?|indicators|screen|screening|support|supporting|work with|working with|talk to|talking to|talk about|ask|asking|record|recording|referral|refer)\b/;
function criseEnPerguntaTecnica(t) {
  if (EN_SUICIDIO_PRIMEIRA.test(t) && /\b(?:die|kill myself|suicide|end my life|end it all)\b/.test(t) && !/^(?:how|what) (?:do i |to |should i |can i )?(?:assess|handle|approach|identify|talk|ask)/.test(t)) return false;
  return EN_TECNICA.test(t);
}

const EN_PADROES = [
  { tipo: 'suicidio', titulo: 'Risk to life: get help now', re: new RegExp(EN_SUICIDIO), numeros: ['188', '192'] },
  { tipo: 'violencia', titulo: 'Death threat: protect the person and get help now', re: new RegExp(EN_AMENAZA), texto: EN_TEXTO_AMEACA, numeros: ['190', '180', '100'] },
  { tipo: 'violencia', titulo: 'Report of violence: protect the person and activate the network', re: new RegExp(EN_RELATO_VIOLENCIA), texto: EN_TEXTO_RELATO, numeros: ['190', '180', '100'] },
  { tipo: 'violencia', titulo: 'Child or older person at risk: activate the network now', re: new RegExp(EN_ABANDONO), texto: EN_TEXTO_RELATO, numeros: ['190', '100'] },
  { tipo: 'agressao', titulo: 'Before hurting someone: stop and ask for support now', re: new RegExp(EN_AGRESSAO), texto: EN_TEXTO_AGRESSAO, numeros: ['188', '190'] },
  { tipo: 'clinica', titulo: 'Health emergency: get help now', re: new RegExp(EN_CLINICA), numeros: ['192', '193'] },
  { tipo: 'violencia', titulo: 'Violence in progress: get help now', re: new RegExp(EN_SOCORRO), curto: true, texto: EN_TEXTO_PADRAO, numeros: ['190', '180', '192'] }
];

// falsos alarmes comuns em inglês: expressões e brincadeiras
const EN_FALSO_ALARME = /\b(?:die|dying|died|dead) (?:of|from|for) (?:laughter|laughing|boredom|embarrassment|shame|hunger|heat|cold|thirst)\b|\b(?:die|dying|died) laughing\b|\bdying to\b|\b(?:kill|killing) (?:time|the time|the mood|the lights|the engine|the process|the app)\b|\bto die for\b|\bdead tired\b|\bmy phone (?:died|is dead)\b|\b(?:hit|hits) me (?:with|by) (?:a |the )?(?:ball|frisbee|pillow|snowball|toy)\b|\bhit me up\b|\bkilling it\b|\bkilled it\b|\bbattery (?:died|is dead)\b|\bshot (?:of|in the dark)\b|\bflu shot\b|\bvaccine shot\b|\bbooster shot\b|\bgot (?:my|a) shot\b/;

function detectarCriseEn(texto) {
  const t = criseEnTexto(texto);
  if (!t) return null;
  if (criseEnPerguntaTecnica(t)) return null;
  const limpo = t.replace(EN_FALSO_ALARME, ' ');
  for (const p of EN_PADROES) {
    if (!p.re.test(limpo)) continue;
    if (p.curto && limpo.split(' ').length > 6) continue;
    if (p.tipo === 'suicidio') {
      const terceiro = EN_SUICIDIO_TERCEIRO.test(limpo);
      const pessoal = !terceiro && EN_SUICIDIO_PRIMEIRA.test(limpo);
      return {
        tipo: 'crise', subtipo: 'suicidio', titulo: p.titulo, idioma: 'en',
        texto: pessoal ? EN_TEXTO_PESSOAL : EN_TEXTO_TERCEIRO, pessoal: pessoal,
        telefones: telefonesEn(pessoal ? ['188', '192'] : ['192', '188'])
      };
    }
    return { tipo: 'crise', subtipo: p.tipo, titulo: p.titulo, idioma: 'en', texto: p.texto || EN_TEXTO_PADRAO, telefones: telefonesEn(p.numeros) };
  }
  return null;
}

function traduzirCartaoEn(pt) {
  const mapa = {
    'Risco de vida: acione ajuda agora': 'Risk to life: get help now',
    'Relato de violência: proteja a pessoa e acione a rede': 'Report of violence: protect the person and activate the network',
    'Ameaça de morte: proteja a pessoa e acione ajuda agora': 'Death threat: protect the person and get help now',
    'Emergência de saúde: acione ajuda agora': 'Health emergency: get help now',
    'Ferimento grave: acione ajuda agora': 'Serious injury: get help now'
  };
  const textos = { 'violencia': EN_TEXTO_RELATO, 'agressao': EN_TEXTO_AGRESSAO, 'clinica': EN_TEXTO_PADRAO, 'suicidio': pt.pessoal ? EN_TEXTO_PESSOAL : EN_TEXTO_TERCEIRO };
  const nums = pt.telefones.map(function (x) { return x.numero; });
  return Object.assign({}, pt, { titulo: mapa[pt.titulo] || pt.titulo, texto: textos[pt.subtipo] || EN_TEXTO_PADRAO, telefones: telefonesEn(nums), idioma: 'en' });
}


// Entrada única: português, espanhol e inglês. Em espanhol, o cartão vem em espanhol; se só o detector do português reconhece, traduz o cartão.
export function detectarCrise(texto, jaCorrigido) {
  // Inglês (v0.19.0): os padrões em inglês são específicos, então valem mesmo quando o detector de idioma não tem certeza
  // ("my neighbor tried to commit suicide"). Em texto em inglês, o detector do português só vale para emergência de saúde ("overdose"), com o cartão traduzido.
  const en = detectarCriseEn(texto);
  if (en) return en;
  if (ingDetectarIdioma(texto) === 'en') {
    if (criseEnPerguntaTecnica(criseEnTexto(texto))) return null;
    const ptEn = detectarCrisePt(texto, jaCorrigido);
    return ptEn && ptEn.subtipo === 'clinica' ? traduzirCartaoEn(ptEn) : null;
  }
  const idioma = espDetectarIdioma(texto);
  if (idioma === 'es') {
    const es = detectarCriseEs(texto);
    if (es) return es;
    // frase em espanhol que o detector do português reconhece (ex.: palavra "suicidio" ou "overdose")
    const pt = detectarCrisePt(texto, jaCorrigido);
    if (pt) {
      if (pt.subtipo === 'suicidio' && criseEsPerguntaTecnica(criseEsTexto(texto))) return null;
      return traduzirCartao(pt);
    }
    return null;
  }
  const pt = detectarCrisePt(texto, jaCorrigido);
  if (pt) return pt;
  // portunhol de quem relata violência ("meu esposo me pega"): com parentesco e sem complemento de lugar, "me pega" quer dizer "me bate"
  if (/\b(?:meu|minha|seu|sua) (?:marido|esposo|esposa|companheir[oa]|namorad[oa]|padrasto|madrasta|pai|mae|ex)\b[^.?!]{0,10}\bme (?:pega|bate|golpeia)\b(?! (?:n[oa]s?|pel[oa]s?|de|em|a|o|as|os)\b)/.test(semAcento(texto))) {
    return { tipo: 'crise', subtipo: 'violencia', titulo: 'Relato de violência: proteja a pessoa e acione a rede', texto: TEXTO_RELATO, telefones: EMERGENCIAS.filter(function (e) { return ['190', '180', '100'].indexOf(e.numero) >= 0; }) };
  }
  // mensagem sem idioma claro ("¡socorro!", "auxilio"): tenta o espanhol também
  if (idioma === 'indef') return detectarCriseEs(texto);
  return null;
}
