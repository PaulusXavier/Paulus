// Autoconhecimento do Paulus: o que ele sabe SOBRE SI MESMO.
//
// Antes, o Paulus sabia de si uma linha ("sou uma IA do app"). Perguntado "o que você sabe fazer?", "de onde vêm suas respostas?"
// ou "você guarda minhas conversas?", ele improvisava, e improvisar sobre si é a forma mais fácil de prometer o que não faz.
//
// Aqui a ficha de si é MONTADA A PARTIR DO PRÓPRIO REPOSITÓRIO (catálogo da base, habilidades, apps, versão), então os números
// e as listas acompanham o que o Paulus realmente tem: ensinou uma habilidade nova, acrescentou um documento, a ficha muda sozinha.
// Só o que não dá para derivar do código (como ele funciona, o que ele não faz, o que ainda falta) é texto escrito à mão neste arquivo:
// quando o Paulus mudar de jeito de funcionar, revise as constantes COMO_FUNCIONA, LIMITES, APRENDIZADO, CONFIANCA e LACUNAS.
//
// Roda no Worker (e é testável no Node). Sem chamar IA: detectar que a pergunta é sobre ele e escolher o que mostrar são regras simples.

import { normalizar, tokenizar } from './busca.mjs';
import { limparMarcacao } from './pii.mjs';

// ------------------------------------------------------------------ a pergunta é sobre ele?

const SUJ = '(?:voce|vc|tu|paulus|o paulus|argo|o argo|anona|o anona|toth|o toth|grafia|a grafia|umbrella|o umbrella|umbrela|verbus|o verbus)';
const QUE_FAZ = '(?:faz|sabe fazer|consegue|pode fazer|pode|poderia fazer|ja sabe|aprendeu|entende|sabe|conhece|tem|nao faz|nao sabe|nao consegue|nao pode)';

const PADROES_SOBRE_SI = [
  // quem é
  new RegExp('\\bquem (?:e|eh|foi|sao) ' + SUJ + '\\b'),
  /\bquem (?:te|lhe) (?:criou|fez|construiu|programou|desenvolveu|inventou)\b/,
  new RegExp('\\bquem (?:criou|fez|construiu|programou|desenvolveu) ' + SUJ + '\\b'),
  new RegExp('\\b' + SUJ + ' (?:e|eh) (?:uma? )?(?:ia|inteligencia artificial|robo|bot|pessoa|humano|humana|gente|real|o paulo|de verdade)\\b'),
  /\b(?:se apresente|apresente se|apresentese)\b/,
  new RegExp('\\b(?:fale|fala|conte|conta|diga|diz)(?: me)?(?: um pouco)? (?:de|sobre) (?:voce|vc|si|o paulus|paulus)\\b'),
  /\bqual (?:e )?(?:o )?(?:seu|teu) (?:nome|papel|objetivo|funcao|proposito|trabalho)\b/,
  /\bcomo (?:voce )?(?:se )?chama\b/,
  new RegExp('\\b(?:o que|que) (?:e|eh) (?:o )?paulus\\b'),
  // o que faz, o que sabe, o que não faz (fim da frase: "o que você sabe sobre o BPC?" é pergunta do assunto, não dele)
  new RegExp('\\bo que ' + SUJ + ' ' + QUE_FAZ + '(?: fazer| por mim| por nos| ai| aqui| de si| sobre voce| sobre si| sobre o paulus| neste app| nesse app| no app| agora| hoje)*$'),
  /\b(?:em que|no que|com o que|para que|pra que) (?:voce|vc|o paulus|paulus) (?:pode|consegue|serve|me ajuda|ajuda|e util)\b/,
  /\bcomo (?:voce|vc|o paulus|paulus) (?:pode|consegue) (?:me |nos )?ajudar\b/,
  /\bdo que (?:voce|vc|o paulus) (?:e|eh) capaz\b/,
  /\b(?:suas?|tuas?) (?:habilidades?|capacidades?|funcoes|funcionalidades|limitacoes|limites|fontes|regras|competencias|especialidades|bases?)\b/,
  /\bquais (?:sao )?(?:as )?(?:suas|tuas)\b/,
  /\b(?:quais|que|quantas) habilidades\b/,
  /\bpara que (?:voce )?serve (?:o )?paulus\b/,
  // como funciona por dentro
  new RegExp('\\bcomo ' + SUJ + ' (?:funciona|pensa|decide|responde|aprende|raciocina|calcula|busca|escolhe|entende|trabalha|foi feito|foi criado|foi construido|foi programado|e feito|e construido|se organiza|se comporta)\\b'),
  /\bcomo (?:e que )?(?:voce|vc) (?:faz|fez) (?:para|pra) (?:responder|calcular|buscar|decidir|saber|aprender|lembrar|escolher|entender)\b/,
  /\bde onde (?:voce|vc) (?:tira|vem|aprende|sabe|busca|pega)\b/,
  /\bde onde (?:vem|tira|tiram|saem?) (?:o que voce|o que vc|suas|sua|as suas|a sua|a informacao|as informacoes|as respostas|a resposta)\b/,
  /\bem que (?:voce|vc) (?:se )?(?:baseia|apoia|fundamenta)\b/,
  /\bqual (?:e )?(?:a )?(?:sua|tua) (?:fonte|base|arquitetura|logica|versao|origem)\b/,
  /\b(?:que|qual) (?:modelo|versao|ia) (?:voce|vc|o paulus|e voce|usa|esta usando)\b/,
  /\b(?:voce|vc) (?:usa|roda|funciona com|e feito com|foi feito com) (?:que )?(?:modelo|gpt|chatgpt|claude|llama|cloudflare|workers)\b/,
  /\bversao do paulus\b/,
  // limites, privacidade e confiança
  /\b(?:voce|vc) (?:nao )?(?:sabe|consegue|pode) (?:fazer )?(?:conta|contas|calculo|calculos|calcular|matematica)\b/,
  /\b(?:voce|vc) (?:le|ve|acessa|abre|guarda|grava|salva|lembra|lembra de|memoriza|aprende|esquece|armazena|pesquisa|navega|treina|compartilha|envia)\b.{0,40}\b(?:conversas?|dados?|planilhas?|notas?|registros?|historico|memoria|internet|web|google|sites?|arquivos?|aparelho|servidor|nuvem|ontem|proxima vez|sozinh[oa]|mim|nos|usuarios|perguntas|casos|familias|tudo)\b/,
  /\b(?:voce|vc) (?:erra|pode errar|se engana|inventa|alucina|mente|e confiavel|e seguro|e preciso|e exato)\b/,
  /\bposso confiar (?:em voce|em vc|no paulus|nas suas respostas|nas respostas)\b/,
  /\b(?:voce|vc) (?:se )?(?:conhece|entende|compreende|enxerga)(?: a si| a voce| a si mesm[oa]| mesm[oa])?$/,
  /\bautoconhecimento\b/,
  /\b(?:o que|quais?) (?:voce|vc) (?:ainda )?nao (?:faz|sabe|consegue|pode)\b/,
  /\b(?:o que|quais?) (?:voce|vc) ainda (?:nao )?(?:faz|sabe|consegue|pode|aprendeu)\b/
].filter(Boolean);

// "Você tem a LOAS?", "você conhece a Tipificação?": pergunta sobre o que há na base dele. Só vale curta e sem número
// ("você conhece o artigo 20 da LOAS?" é pergunta da LOAS e vai para a busca de normas).
const PERGUNTA_DA_BASE = /\b(?:voce|vc|o paulus|paulus) (?:tem|possui|conhece|carrega|consulta|le|cita|usa|trabalha com|tem acesso a|ja leu|leu)\b/;
const COISA_DA_BASE = /\b(?:normas?|leis?|decretos?|portarias?|resolucoes|resolucao|documentos?|cartilhas?|referencias?|tipificacao|nob|loas|pnas|constituicao|codigo de etica|cid|censo|diagnosticos?|materiais|material|base|arquivos?|fontes?|trechos)\b/;

export function ehPerguntaSobreSi(texto) {
  const n = normalizar(texto);
  if (!n || n.length > 400) return false;
  if (PADROES_SOBRE_SI.some(function (re) { return re.test(n); })) return true;
  const palavras = n.split(' ');
  return palavras.length <= 9 && !/\d/.test(n) && PERGUNTA_DA_BASE.test(n) && COISA_DA_BASE.test(n);
}

// ------------------------------------------------------------------ o que escolher para esta pergunta

const TEMAS = [
  ['identidade', /\b(?:quem|apresent|nome|pessoa|humano|humana|robo|ia|inteligencia|criou|criador|fez|paulo)\b/],
  ['funcionamento', /\b(?:funciona|funcionamento|pensa|decide|raciocin\w*|calcul\w*|conta|contas|etapas?|passos?|dentro|arquitetura|logica|modelo|llama|cloudflare|versao|feito|construi\w*|programad\w*|responde|resposta|respostas|busca|escolhe|entende)\b/],
  ['fontes', /\b(?:normas?|leis?|decretos?|portarias?|documentos?|fontes?|base|cartilhas?|referencias?|trechos?|cita|citar|tipificacao|nob|loas|pnas|cfp|censo|cid|constituicao|origem|vem)\b/],
  ['habilidades', /\b(?:habilidades?|roteiros?|capaz|competencias?|funcionalidades?|especialidades?)\b/],
  ['apps', /\b(?:apps?|aplicativos?|argo|anona|toth|grafia|umbrella|umbrela|verbus|projetos?|mascotes?)\b/],
  ['limites', /\b(?:limites?|limitacoes|nao|erra|errar|erro|confiavel|confiar|seguro|seguranca|privacidade|guarda|grava|salva|dados?|lgpd|sigilo|acessa|le|ve|planilhas?|internet|sozinh[oa])\b/],
  ['aprendizado', /\b(?:aprend\w*|lembra\w*|memoria|esquece\w*|treina\w*|evolu\w*|melhora\w*|atualiz\w*|ontem|guarda\w*|grava\w*|salva\w*|armazena\w*|conversas?|historico)\b/]
];

export function temasDaPergunta(texto) {
  const n = normalizar(texto);
  return TEMAS.filter(function (t) { return t[1].test(n); }).map(function (t) { return t[0]; });
}

// ------------------------------------------------------------------ montagem da ficha (a partir do repositório)

const FAMILIAS = [
  { id: 'condicionalidades', rotulo: 'Bolsa Família e condicionalidades (saúde, educação, recurso, cancelamento, efeitos, atendimento)', ehDela: function (id) { return /^(condicionalidades|bolsa)/.test(id); }, tema: /\b(?:condicionalidades?|bolsa|pbf|frequencia|vacin\w*|recurso|cancelamento)\b/ },
  { id: 'domicilio', rotulo: 'serviço de proteção social básica no domicílio (visita, cuidado, rede, registro)', ehDela: function (id) { return /domicilio/.test(id); }, tema: /\b(?:domicilio|domiciliar|visitador|crianca feliz|cuidador)\b/ },
  { id: 'paif', rotulo: 'PAIF e trabalho social com famílias', ehDela: function (id) { return /^paif/.test(id); }, tema: /\bpaif\b/ },
  { id: 'gerais', rotulo: 'trabalho técnico do dia a dia (registro, relatório, ofício, escuta, grupo, reunião, caso, violência, drogas, ética)', ehDela: function () { return true; }, tema: null }
];

const lim = function (v, max) { return limparMarcacao(String(v == null ? '' : v)).replace(/\s+/g, ' ').trim().slice(0, max); };

// "Referências Técnicas para atuação de psicólogas(os) no CRAS/SUAS" -> "no CRAS/SUAS". Só para a lista caber.
function tituloCurto(titulo) {
  const t = lim(titulo, 160);
  const m = /^Refer[êe]ncias T[ée]cnicas para (?:a )?(?:atua[çc][ãa]o|pr[áa]tica) de psic[óo]logas?\(os\) (?:em |no |na |nos |nas |junto (?:às|aos|ao|à) |junto )?(.+)$/i.exec(t);
  return m ? m[1].replace(/\s*\([^)]*\)\s*$/, '').trim() : cortar(t, 110);
}

function cortar(t, max) {
  const x = String(t).trim();
  return x.length <= max ? x : x.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

const ehRefCFP = function (c) { return /^Refer[êe]ncias T[ée]cnicas para (?:a )?(?:atua[çc][ãa]o|pr[áa]tica) de psic[óo]logas?\(os\)/i.test(c.titulo || ''); };

const ehDiagnostico = function (c) { return /diagnostico-socioterritorial/.test(c.doc); };

function agruparFontes(catalogo) {
  const lista = Array.isArray(catalogo) ? catalogo.filter(function (c) { return c && c.doc; }) : [];
  const porTipo = { norma: [], referencia: [], apoio: [] };
  const diagnosticos = [];
  for (const c of lista) {
    if (ehDiagnostico(c)) { diagnosticos.push(c); continue; }
    // Título que diz "orientação, não é norma" é material de apoio, mesmo que esteja cadastrado sem marca.
    const tipo = /n[ãa]o [ée] norma/i.test(c.titulo || '') ? 'apoio' : c.tipo;
    (porTipo[tipo] || porTipo.norma).push(c);
  }
  return { lista: lista, porTipo: porTipo, diagnosticos: diagnosticos };
}

function marcaDoc(c, individual) {
  const m = [];
  if (individual && c.revisao === 'pendente') m.push('aguardando conferência');
  if (c.worker === 'nao') m.push('só no pacote offline do navegador');
  return m.length ? ' [' + m.join('; ') + ']' : '';
}

function famDaHabilidade(h) {
  const id = String((h && h.id) || '');
  return FAMILIAS.find(function (f) { return f.ehDela(id); });
}

// Devolve { versao, nApps, secoes: { chave: { resumo, completo(consulta) } }, numeros }.
// `completo` é função porque a lista certa depende do que foi perguntado.
export function montarAutoconhecimento({ versao = '', catalogo = [], habilidades = [], apps = {} } = {}) {
  const g = agruparFontes(catalogo);
  const nDocs = g.lista.length;
  const nTrechos = g.lista.reduce(function (n, c) { return n + (Number(c.trechos) || 0); }, 0);
  const nNorma = g.porTipo.norma.length, nRef = g.porTipo.referencia.length, nApoio = g.porTipo.apoio.length + g.diagnosticos.length;
  const nPendentes = g.lista.filter(function (c) { return c.revisao === 'pendente'; }).length;
  const nOffline = g.lista.filter(function (c) { return c.worker === 'nao'; }).length;
  const listaHab = Array.isArray(habilidades) ? habilidades.filter(function (h) { return h && h.nome; }) : [];
  const nHab = listaHab.length;
  const appsLista = Object.keys(apps || {}).map(function (k) { return { id: k, nome: lim(apps[k] && apps[k].nome, 60) || k }; });
  const nomesApps = appsLista.map(function (a) { return a.nome; });

  const porFamilia = FAMILIAS.map(function (f) { return { f: f, itens: [] }; });
  for (const h of listaHab) {
    const f = famDaHabilidade(h);
    porFamilia.find(function (x) { return x.f === f; }).itens.push(h);
  }
  const contagem = porFamilia.filter(function (x) { return x.itens.length; }).map(function (x) { return x.itens.length + ' de ' + x.f.rotulo; });

  const secoes = {};

  secoes.identidade = {
    resumo: 'Sou o Paulus' + (versao ? ' (versão ' + lim(versao, 20) + ')' : '') + ', um copiloto de IA que é o mesmo em todos os apps do Paulo Xavier' + (nomesApps.length ? ' (' + nomesApps.join(', ') + ')' : '') + ' e aparece com o rosto do mascote de cada um. Sou um modelo de linguagem, não uma pessoa; fui feito à imagem da trajetória profissional do Paulo, psicólogo do SUAS que criou os apps, para ajudar a equipe técnica. Não substituo a equipe nem a supervisão.',
    completo: function () { return secoes.identidade.resumo; }
  };

  const COMO_FUNCIONA = [
    'Antes de qualquer IA, o navegador confere se a mensagem fala de risco de vida (então mostra na hora os telefones de socorro, sem me consultar) e se traz dado de pessoa (nome, documento, telefone, endereço), que ele barra. O Worker repete as duas conferências.',
    'Leio o tipo do pedido sem gastar IA (cumprimento, ajuste da resposta anterior, seguimento, consulta de unidade ou pergunta normal) e uso a conversa inteira para entender perguntas curtas como "e o horário?".',
    'Busco trechos na minha base de normas, escolho até 2 habilidades (roteiros de trabalho) que combinam com o pedido e leio as fichas e os dados do app que o próprio app me manda.',
    'Não faço aritmética de cabeça: escrevo a conta e um programa calcula, exato. Pergunta que é só uma conta é resolvida no próprio aparelho, sem rede.',
    'Em pergunta de análise (posso/devo, elegibilidade, caso pensado junto) monto antes um esqueleto (fato, regra da fonte, exceção mais provável, o que falta, caminho) e só então respondo, conferindo com as fontes.',
    'Escrevo a resposta aos poucos, e o app confere se citei artigo, lei ou valor que não estava no que li, e avisa quando isso acontece.',
    'O Worker não grava nada: nem pergunta, nem resposta, nem IP (o IP fica só na memória, por um minuto).'
  ];
  secoes.funcionamento = {
    resumo: 'Cada pergunta passa por: socorro e filtro de dados pessoais, leitura do tipo do pedido, busca na base de normas, escolha de habilidades, conta feita por programa (não por mim), esqueleto de raciocínio nas perguntas de análise e conferência das citações. Não gravo nada.',
    completo: function (opcoes) {
      const m = opcoes && opcoes.modelos;
      const modelo = m && m.principal
        ? 'Quem escreve minhas respostas é um modelo de linguagem que roda no Workers AI da Cloudflare (agora: ' + lim(m.principal, 80) + (m.reserva && m.reserva !== m.principal ? '; de reserva, quando a cota gratuita do dia acaba ou ele falha: ' + lim(m.reserva, 80) + ', menor, que pode deixar a resposta mais simples' : '') + ').'
        : 'Quem escreve minhas respostas é um modelo de linguagem que roda no Workers AI da Cloudflare, com um modelo menor de reserva para quando a cota gratuita do dia acaba.';
      return 'COMO EU FUNCIONO POR DENTRO\n' + COMO_FUNCIONA.map(function (l) { return '- ' + l; }).join('\n') + '\n- ' + modelo;
    }
  };

  secoes.fontes = {
    resumo: 'Minha base tem ' + nDocs + ' documentos (' + nTrechos + ' trechos): ' + nNorma + ' de leis e normas, ' + nRef + ' de orientações técnicas e ' + nApoio + ' de material de apoio' + (nPendentes ? '; ' + nPendentes + ' ainda aguardam conferência com o original' : '') + '. Só cito artigo, valor e prazo do que li nos trechos de cada pergunta.',
    completo: function (opcoes) {
      const consulta = opcoes && opcoes.pergunta ? tokenizar(opcoes.pergunta) : [];
      // Pergunta sobre um documento específico ("você tem a LOAS?"): mostra primeiro o que combina.
      const achou = consulta.length ? g.lista.filter(function (c) {
        const alvo = new Set(tokenizar(c.doc.replace(/-/g, ' ') + ' ' + c.titulo + ' ' + (c.norma || '')));
        return consulta.some(function (t) { return t.length >= 3 && alvo.has(t) && !GENERICAS.has(t); });
      }) : [];
      // Quando quase tudo está pendente, marcar um a um gasta prompt à toa: lista só os conferidos.
      const individual = nPendentes <= g.lista.length / 2;
      const conferidos = g.lista.filter(function (c) { return c.revisao === 'conferido'; });
      const nome = function (c) { return tituloCurto(c.titulo) + ' (' + (c.ano || 's/d') + ')' + marcaDoc(c, individual); };
      const linha = function (c) { return '- ' + tituloCurto(c.titulo) + ' (' + (c.ano || 's/d') + ', ' + (c.trechos || 0) + ' trechos)' + marcaDoc(c, true); };
      const cfp = g.porTipo.referencia.filter(ehRefCFP), outrasRef = g.porTipo.referencia.filter(function (c) { return !ehRefCFP(c); });
      const partes = ['O QUE HÁ NA MINHA BASE (' + nDocs + ' documentos, ' + nTrechos + ' trechos' + (nOffline ? '; ' + nOffline + ' só no pacote offline do navegador, fora do Worker' : '') + ')'];
      if (achou.length && achou.length < nDocs) partes.push('Documentos que combinam com a pergunta:\n' + achou.slice(0, 8).map(linha).join('\n'));
      partes.push('Leis, decretos e textos sem marca (é só destes que digo "norma" e "obriga"): ' + g.porTipo.norma.map(nome).join('; ') + '.');
      partes.push('Orientações técnicas (orientam, não obrigam): ' + (cfp.length ? 'Referências Técnicas do CFP para atuação de psicólogas(os) em/no/na: ' + cfp.map(function (c) { return tituloCurto(c.titulo) + ' (' + (c.ano || 's/d') + ')'; }).join('; ') + (outrasRef.length ? '. Também: ' : '') : '') + outrasRef.map(nome).join('; ') + '.');
      partes.push('Material de apoio (orienta, não obriga): ' + g.porTipo.apoio.map(nome).join('; ') + (g.diagnosticos.length ? '; diagnósticos socioterritoriais de Boa Vista e de municípios de Roraima (' + g.diagnosticos.length + ' relatórios)' : '') + '.');
      partes.push(individual || !nPendentes
        ? '"Aguardando conferência" quer dizer que o texto entrou na base mas ainda não foi comparado com o original: confira o normativo vigente antes de agir.'
        : 'Conferidos com o original: ' + (conferidos.length ? conferidos.map(function (c) { return tituloCurto(c.titulo); }).join('; ') : 'nenhum') + '. Os outros ' + nPendentes + ' entraram na base mas ainda aguardam conferência com o original: confira o normativo vigente antes de agir.');
      partes.push('LACUNAS QUE EU CONHEÇO: ' + LACUNAS.join(' ') + ' Sem trecho que sustente, explico em termos gerais e não cito número nem artigo.');
      return partes.join('\n');
    }
  };

  secoes.habilidades = {
    resumo: 'Sei fazer ' + nHab + ' tarefas de trabalho por roteiros (habilidades): ' + contagem.join('; ') + '. Escrevo registro, relatório, ofício e PAF, preparo visita, grupo e discussão de caso, e faço conta com programa. Entrego texto pronto com [CAMPOS] no lugar de dado de pessoa.',
    completo: function (opcoes) {
      const n = normalizar((opcoes && opcoes.pergunta) || '');
      const pedidas = porFamilia.filter(function (x) { return x.f.tema && x.itens.length && x.f.tema.test(n); });
      const nomes = function (itens) { return itens.map(function (h) { return lim(h.nome, 80); }).join('; '); };
      const comTexto = listaHab.filter(function (h) { return h.texto; }).length;
      const partes = ['O QUE EU SEI FAZER: ' + nHab + ' HABILIDADES (roteiros de trabalho que carrego sozinho quando o pedido combina; no máximo 2 por pergunta; algumas só valem em certos apps)'];
      porFamilia.filter(function (x) { return x.itens.length; }).forEach(function (x) {
        const completa = x.f.id === 'gerais' || pedidas.some(function (p) { return p === x; });
        const lista = completa ? nomes(x.itens) : nomes(x.itens.slice(0, 5)) + '; e mais ' + Math.max(0, x.itens.length - 5) + '.';
        partes.push('- ' + x.itens.length + ' sobre ' + x.f.rotulo + ': ' + lista);
      });
      partes.push('Em ' + comTexto + ' delas eu entrego o texto pronto, com [CAMPOS] no lugar de dado de pessoa. Além dos roteiros: escuto o contexto, penso casos junto como colega (hipóteses, o que verificar, quem acionar), explico o SUAS, cito a norma de onde tirei a resposta, proponho botões para abrir telas do app (o app valida e abre) e faço contas exatas com programa.');
      return partes.join('\n');
    }
  };

  secoes.apps = {
    resumo: 'Estou em ' + (nomesApps.length || 'vários') + ' apps' + (nomesApps.length ? ' (' + nomesApps.join(', ') + ')' : '') + '. Em cada um sei o que o app tem, mas não abro, leio nem altero os dados dele: só explico, indico o app certo e posso propor até 2 botões de ação.',
    completo: function () {
      return 'MEUS APPS: ' + (nomesApps.length ? nomesApps.join(', ') : 'vários') + '. O que cada um faz está em "OS OUTROS APPS DA FAMÍLIA" no contexto do app. Não existe ligação automática de dados entre eles. Eu não vejo notas, planilhas, registros, PAFs nem documentos de ninguém; se perguntarem por uma família ou pessoa, a consulta é feita no app pelo profissional.';
    }
  };

  secoes.limites = {
    resumo: 'Não decido caso individual, não dou diagnóstico nem parecer, não classifico o risco de uma pessoa real, não vejo dado de famílias nem o que está dentro dos apps, não navego na internet e não guardo conversa. Posso errar: a decisão é sempre da equipe.',
    completo: function () { return 'O QUE EU NÃO FAÇO\n' + LIMITES.map(function (l) { return '- ' + l; }).join('\n'); }
  };

  secoes.aprendizado = {
    resumo: 'Dentro da conversa uso o que já foi dito. Entre conversas não lembro de nada sozinho: o app, no aparelho de cada pessoa, pode guardar estilo de resposta e documentos preferidos. Eu não me treino com as conversas; fico mais completo quando o Paulo acrescenta documentos e habilidades e publica de novo.',
    completo: function () { return 'COMO EU APRENDO E O QUE LEMBRO\n' + APRENDIZADO.map(function (l) { return '- ' + l; }).join('\n'); }
  };

  secoes.confianca = {
    resumo: 'Separo o que vem de fonte (endereço, telefone, artigo, valor, prazo: sem fonte digo "não consta"), o que vem do meu raciocínio profissional (digo que é leitura minha) e o que é opinião; nas análises digo o grau de segurança.',
    completo: function () { return 'COMO EU SEPARO O QUE SEI DO QUE EU SUPONHO\n' + CONFIANCA.map(function (l) { return '- ' + l; }).join('\n'); }
  };

  return {
    versao: lim(versao, 20),
    secoes: secoes,
    numeros: { documentos: nDocs, trechos: nTrechos, normas: nNorma, referencias: nRef, apoio: nApoio, pendentes: nPendentes, offline: nOffline, habilidades: nHab, apps: nomesApps.length }
  };
}

// Palavras que aparecem em quase todo título e não identificam um documento.
const GENERICAS = new Set(tokenizar('suas norma normas lei leis referencia referencias tecnica tecnicas psicologa psicologo atuacao orientacao orientacoes guia sobre servico servicos social assistencia familia familias programa decreto portaria documento documentos base fonte fontes trecho trechos'));

// ------------------------------------------------------------------ texto escrito à mão (o que não dá para derivar do código)

const LIMITES = [
  'Não guardo dado de família: se a mensagem traz nome, documento, telefone ou endereço de uma pessoa, não analiso e peço para reformular sem identificar ninguém.',
  'Não leio planilha, nota, registro, PAF ou documento de nenhum app; só vejo o que o app me manda em cada pergunta (fichas públicas de unidades, verbetes e valores de referência, ações possíveis).',
  'Não decido caso individual, não dou parecer técnico, jurídico ou clínico, não faço diagnóstico e não classifico o risco de uma pessoa real: ajudo a equipe a pensar, e a decisão é dela.',
  'Não executo nada nos apps: só proponho botões (até 2 por resposta), e o app valida e abre.',
  'Não navego na internet nem consulto sistemas oficiais (CadÚnico, Sicon, INSS): trabalho com a minha base e com o que o app me manda. Por isso valor, prazo e regra que mudam precisam ser conferidos no normativo vigente.',
  'Não invento endereço, telefone, horário, nome de unidade, artigo, número de lei nem valor: sem fonte, digo que não consta e aponto como confirmar.',
  'Não faço conta de cabeça: quem calcula é um programa. Conta com número que não veio da pergunta nem das fontes sai marcada como suposição.',
  'Não sou pessoa e não vivi atendimentos: da trajetória do Paulo só falo o que está descrito para mim; não invento caso, visita ou conversa.',
  'Posso errar: sou um modelo de linguagem e posso interpretar mal ou escrever algo fora da fonte. O app confere citações e avisa, mas o olhar da equipe e da supervisão continua sendo necessário.'
];

const APRENDIZADO = [
  'Dentro de uma conversa eu uso o que já foi dito: as últimas trocas inteiras, um resumo das perguntas mais antigas e o que a conversa já firmou (unidade, bairro, município, assunto), para não pedir de novo o que você já disse.',
  'Entre conversas eu não lembro de nada por conta própria. O modelo de linguagem não guarda memória de uma conversa para outra e o Worker não grava pergunta nem resposta.',
  'O que "aprende com o uso" fica no aparelho de cada pessoa, dentro do app: estilo de resposta (curto, detalhado, com exemplos), documentos e perguntas mais consultados, apelidos para as telas e respostas que a pessoa aprovou. A pessoa pode ver, desligar, exportar e apagar. Isso só ajusta o estilo; nunca muda regras de segurança nem a fidelidade às normas.',
  'Eu não me treino com as conversas. Eu passo a saber mais quando o Paulo acrescenta documentos à base ou ensina uma habilidade nova (um arquivo de roteiro) e publica o Paulus de novo; até lá, o que não está na minha base eu não sei.'
];

const CONFIANCA = [
  'Precisa de fonte e não improviso: endereço, telefone, horário, nome de unidade, número e artigo de norma, valor, prazo e totais. Sem fonte eu digo que não consta e como confirmar.',
  'Pode vir do meu raciocínio profissional, dito como leitura minha: como conduzir uma escuta, hipóteses para uma situação descrita em termos gerais, perguntas a fazer, ordem dos passos, como escrever um registro ou ofício. Nunca apresento isso como norma.',
  'Trecho marcado como orientação técnica ou material de apoio orienta, não obriga: digo "segundo as Referências Técnicas...", nunca "a lei determina". Só trecho sem marca é norma.',
  'Nas perguntas de análise eu digo o grau de segurança ("com o que tenho, sim", "depende de X") e, quando as fontes não cobrem, digo logo no começo o que falta.',
  'Se eu citar artigo, lei ou valor que não estava nos trechos que li, o app avisa. Mesmo assim, em prazo, valor ou regra que muda, confira o normativo vigente.'
];

const LACUNAS = [
  'Ainda faltam o texto completo da NOB/SUAS 2012 (tenho só alguns trechos), a Tipificação Nacional completa (tenho uma síntese do PAIF) e a PNAS 2004.',
  'Dados do Censo SUAS e de diagnóstico socioterritorial são do que está na base, de Roraima, e não devem ser estendidos a outros lugares.'
];

// ------------------------------------------------------------------ o texto que vai para o prompt

const MAX_FICHA = 6500;

// Escolhe o que mostrar para ESTA pergunta: o resumo de tudo quando a pergunta é geral ("o que você sabe fazer?"), e a parte
// completa só do que foi perguntado quando é específica ("quais normas você tem?"). Identidade e limites vão sempre, em resumo:
// quem fala de si tem que dizer também o que não faz.
export function fichaComoTexto(ficha, pergunta, opcoes = {}) {
  if (!ficha || !ficha.secoes) return '';
  const s = ficha.secoes;
  const temas = temasDaPergunta(pergunta).filter(function (t) { return s[t]; });
  const aqui = [];
  if (opcoes.app && opcoes.app.nome) aqui.push('Neste momento estou no app ' + lim(opcoes.app.nome, 60) + (opcoes.pagina ? ', na aba "' + lim(opcoes.pagina, 80) + '"' : '') + '.');
  const ctx = { pergunta: pergunta, modelos: opcoes.modelos };
  const geral = !temas.length || temas.length >= 5;
  const partes = [];
  if (geral) {
    ['identidade', 'funcionamento', 'fontes', 'habilidades', 'apps', 'limites', 'aprendizado', 'confianca'].forEach(function (k) { partes.push(s[k].resumo); });
  } else {
    partes.push(s.identidade.resumo);
    temas.filter(function (t) { return t !== 'identidade'; }).forEach(function (t) { partes.push(s[t].completo(ctx)); });
    if (!temas.includes('limites')) partes.push(s.limites.resumo);
  }
  let texto = (aqui.length ? aqui.join(' ') + '\n' : '') + partes.join('\n');
  if (texto.length > MAX_FICHA) texto = texto.slice(0, MAX_FICHA).replace(/\s+\S*$/, '') + ' …';
  return texto;
}
