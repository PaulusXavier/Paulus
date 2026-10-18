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

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


// Sinais de ideação suicida que a palavra "suicídio" não cobre (texto já sem acento e em minúsculas).
// Servem a duas listas: o cartão de crise e o "nunca é pergunta técnica". Só entram expressões que quase não têm outro sentido
// no trabalho do SUAS ("não aguento mais a demanda" NÃO entra; "não aguento mais viver" entra).
const SINAIS_SUICIDIO = [
  'nao (?:aguento|suporto|consigo) mais (?:viver|essa vida|esta vida|continuar vivo|continuar viva)',
  '(?:minha|sua|a) vida nao tem (?:mais )?sentido',
  'nao (?:vejo|tenho|tem|ve|ha) (?:mais )?(?:sentido em viver|sentido na vida|razao (?:pra|para) viver|motivo (?:pra|para) viver)',
  'quer(?:o|ia|endo)? (?:sumir|desaparecer) (?:de vez|para sempre|pra sempre|do mundo|deste mundo|dessa vida)',
  'quer(?:o|ia|endo)? (?:estar|ficar) morto|quer(?:o|ia|endo)? (?:estar|ficar) morta|quer(?:o|ia|endo)? nao ter nascido',
  'vontade de morrer|desejo de morrer|(?:seria|era|sera) melhor (?:se )?(?:eu |ela |ele )?(?:nao existisse|estivesse mort[oa]|sem mim)',
  '(?:dar|dando|por|pondo) fim (?:a |na |em )?(?:propria |minha |sua |a )?vida',
  '(?:me|se) (?:enforcar|enforcando|afogar|afogando|envenenar|envenenando)',
  '(?:me|se) jogar (?:da|do|de|embaixo|debaixo)',
  'pular (?:da|do|de) (?:ponte|predio|janela|viaduto|sacada|terraco|laje|cima)',
  // ideação indireta (ampliação do detector): cansaço de viver, desejo de não acordar, peso para os outros, despedida, meio já à mão
  'cansad[oa] de viver|cansei de viver',
  '(?:dormir|adormecer) (?:e )?(?:nunca|nao) mais acordar|dormir (?:pra|para) sempre|nao acordar mais',
  'nao quer(?:o|er|ia)? mais (?:estar aqui|existir|ficar aqui)',
  'ninguem (?:sentiria|sentira|ia sentir) (?:a )?(?:minha |sua )?falta',
  'melhor (?:pra|para) (?:todo mundo|todos|a familia|eles) (?:se (?:eu|ela|ele) (?:morresse|nao existisse|sumisse)|sem mim)',
  '(?:acabar|acabando) com (?:a )?(?:minha |sua )?dor de uma vez',
  '(?:por|pondo) fim (?:a )?(?:tudo|dor)',
  'so a morte (?:resolve|acaba|ajuda|me ajuda)',
  '(?:me|se) (?:atirar|lancar|jogar) (?:na|no) frente (?:de|do|da|dos|das)',
  '(?:carro|onibus|caminhao|trem) (?:me )?(?:atropelasse|pegasse)',
  '(?:me|se) dar (?:um )?tiro|tiro (?:na|em) (?:propria |minha |sua )?(?:cabeca|boca|peito)',
  '(?:usar|usarei|vou usar) (?:a arma|ela|isso|o veneno) em mim|(?:arma|revolver|pistola|veneno|chumbinho)[^.?!]{0,30}\\b(?:usar|usarei|vou usar|uso)\\b[^.?!]{0,10}\\bem mim',
  '(?:carta|bilhete) de despedida|me despedindo de todos|deixei (?:um )?bilhete',
  // autolesão relatada sem a palavra "automutilação"
  '(?:se|me) cortou(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)|me cortei(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)|se cortaram|(?:se|me) machuc(?:a|ando|ou|ava) de proposito|(?:se|me) fer(?:e|indo|iu|i) de proposito|(?:se|me) queim(?:a|ando|ou|ei) de proposito'
].join('|');

// Sinais de overdose e intoxicação além de "overdose" e "engoliu remédio".
const SINAIS_CLINICA = /\b(?:(?:tomou|tomei|tomaram|ingeriu|engoliu|bebeu) (?:varios|muitos|muitas|uma cartela|a cartela|todos os|todo o|um monte de)(?: \w+)? ?(?:comprimidos?|remedios?|medicamentos?|pilulas?|cartelas?)|(?:tomou|bebeu|ingeriu) (?:veneno|chumbinho|soda caustica))\b/;

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
const NAO_E_PESSOA = '(?!(?:a |o )?(?:fome|sede|saudade|aula|tempo|curiosidade|vontade|barata|mosquito|rato|ratos|formiga|insetos?|servico|trabalho|charada|duvida|duvidas|pendencia|pendencias|demanda|demandas|fila|filas|vaga|vagas|processo|processos|ligacao|ligacoes|ansiedade|dor)\\b)';
const AMEACA_MATAR_ME = /\b(?:vai|vao|quer|querem|prometeu|jurou|ameaca|ameacou|ameacando|ameacam|tentou|tentaram|tenta) (?:de |em )?me (?:matar|esfaquear|espancar|estrangular)\b/;
const AMEACA_TERCEIRO = new RegExp('\\b(?:(?:ameac(?:a|ou|ando|am|aram)|prometeu|jurou|disse que (?:vai|vao|quer)|(?:vai|vao|quer|querem|ia|queria)) (?:de )?matar ' + NAO_E_PESSOA + OBJETO_PESSOA + '\\b|ameac(?:a|ou|ando|am|aram)s? (?:de )?morte|ameac(?:a|as) de morte|medo de (?:ser )?(?:morta|morto|assassinad[oa]|agredid[oa]|espancad[oa])|medo (?:pela|por) (?:minha|a minha) vida|temo pela minha vida)');
// Quem diz que VAI machucar alguém (raiva, esgotamento de cuidador): outra conduta, outro texto.
const INTENCAO_AGREDIR = new RegExp('\\b(?:(?:vou|quero|vontade de|estou com vontade de|tenho vontade de|ia|penso em|pensando em) (?:matar|machucar|espancar|esfaquear) ' + NAO_E_PESSOA + '(?:o|a|os|as|n[oa]s?|meu|minha|meus|minhas|alguem|ela|ele|elas|eles|crianc\\w+|filh\\w+|menin\\w+|marido|esposa|mulher|bebe)\\b|(?:vou|quero|vontade de|estou com vontade de|tenho vontade de|ia|penso em|pensando em) (?:bater|surrar) (?:n[oa]s?|em) ?(?:meu|minha|meus|minhas|o|a|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|marido|esposa|mulher|alguem|ela|ele)\\b|(?:estou|to|ando) (?:perdendo|sem) (?:o )?controle (?:com|d[eao]s?) (?:meu|minha|meus|minhas|a|o|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|marido|esposa)|nao (?:consigo|aguento) me controlar (?:com|d[eao]s?) (?:meu|minha|meus|minhas|a|o|os|as)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+)|(?:bati|espanquei|machuquei|agredi) (?:n[oa]s?|em|o|a|os|as) ?(?:meu|minha|meus|minhas)? ?(?:filh\\w+|crianc\\w+|bebe|menin\\w+|esposa|marido|mulher))');
// Violência sofrida, dita por quem sofre, ou de um adulto contra criança/adolescente sem a palavra \"abuso\".
const VIOLENCIA_SOFRIDA = /\b(?:(?:me|nos) (?:bate|bateu|batem|espanca|espancou|agride|agrediu|estrangula|estrangulou|sufoca|sufocou|ameaca de morte)|(?:fui|foi|foram|fomos) (?:agredid|espancad|estuprad|abusad|violentad|molestad|ameacad)\w*|(?:padrasto|madrasta|pai|mae|tio|tia|avo|avos|primo|irmao|padrinho|vizinho|professor|pastor|patrao|marido|namorado|companheiro|ex) (?:me|nela|nele) (?:toca|tocou|forca|forcou)\b|(?:padrasto|madrasta|pai|mae|tio|tia|avo|avos|primo|irmao|padrinho|vizinho|professor|pastor|patrao|marido|namorado|companheiro|ex) (?:mexe|mexeu) comigo\b|(?:ele|ela) mexe com (?:a |o )?(?:sobrinh|filh|entead|net|menin|crianc)\w*|mexe com (?:a |o )?(?:sobrinh|filh|entead|net|menin|crianc)\w*|(?:abus|estupr|molest|violent)(?:ando|a|am) (?:a |o |as |os |da |do |das |dos |de )?(?:crianc\w*|menin\w*|filh\w*|sobrinh\w*|entead\w*|net[ao]s?|adolescent\w*|irma\w*|prim[ao]s?|mulher)\b|(?:sofrendo|sofre|sofreu|sofri) (?:abuso|violencia|maus tratos|agressao|agressoes)\b|(?:trancad[oa]|presa|preso) (?:em casa|no quarto|no comodo)|carcere privado|nao (?:deixa|deixou|deixam) (?:ela|ele|eu|a mulher|a menina|o menino) sair de casa)\b/;
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
const PRIMEIRA_PESSOA_EXTRA = /\b(?:minha vida nao tem (?:mais )?sentido|nao (?:aguento|suporto|consigo) mais (?:viver|essa vida|esta vida)|nao (?:vejo|tenho) (?:mais )?(?:sentido em viver|sentido na vida|razao (?:pra|para) viver|motivo (?:pra|para) viver)|quer(?:o|ia) (?:sumir|desaparecer)|(?:vou|quero|pensando em|penso em|ia) me (?:jogar|enforcar|afogar|envenenar)|vou pular|queria estar morto|queria estar morta|queria nao ter nascido|(?:vou|quero) dar fim a minha vida|(?:cansei|estou cansad[oa]|to cansad[oa]) de viver|nao quero mais (?:estar aqui|existir)|ninguem sentiria (?:a )?minha falta|melhor (?:pra|para) (?:todo mundo|todos) se eu (?:morresse|nao existisse)|(?:acabar|acabando) com (?:a )?minha dor de uma vez|(?:vou|quero) (?:por|pondo) fim a tudo|so a morte (?:me )?(?:resolve|ajuda)|(?:queria|quero) dormir (?:e nunca mais acordar|pra sempre|para sempre)|(?:vou|quero) me (?:atirar|lancar) na frente|me dar (?:um )?tiro|(?:vou|quero) usar (?:a arma|ela|isso) em mim|me atropelasse|usar [^.?!]{0,12}em mim|(?:queria|quero) [^.?!]{0,25}dormir (?:pra|para) sempre|(?:carta|bilhete) de despedida|me cortei(?! (?:com|na|no|ao|fazendo|cortando|durante|enquanto)\\b)|(?:me) (?:machuco|machucando|firo|ferindo) de proposito)\b/;
const RELATA_TERCEIRO = /\b(?:disse|disseram|falou|falaram|contou|relatou|verbalizou|mencionou)\b/;

// Devolve null se não for pedido de socorro.
export function detectarCrise(texto) {
  // "Pronto Socorro" é um serviço de saúde, não um pedido de socorro ("qual o endereço do pronto-socorro?")
  const t = semAcento(texto).replace(/pronto[ -]+socorro/g, 'pronto atendimento');
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
  return null;
}
