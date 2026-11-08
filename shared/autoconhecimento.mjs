// Autoconhecimento (v0.10.0): o Paulus sabe o que ele mesmo é, tem e não faz, a partir do próprio repositório.
// Usado pelo Worker (worker/handler.mjs). Não chama IA nem rede; só regras e texto.
//
//   ehPerguntaSobreSi(pergunta)            a pergunta é sobre o próprio Paulus? ("o que você sabe fazer?" sim; "o que você sabe sobre o BPC?" não)
//   temasDaPergunta(pergunta)              quais partes da ficha a pergunta pede: fontes, habilidades, funcionamento, aprendizado, limites, confianca
//   montarAutoconhecimento({ versao, catalogo, habilidades, apps })   ficha montada do repositório (números, grupos, famílias de roteiros)
//   fichaComoTexto(ficha, pergunta, { app, pagina, modelos })         texto da ficha para o prompt (bloco <voce>), com teto de tamanho
//
// O que não dá para derivar do código é texto escrito à mão aqui: COMO_FUNCIONA, LIMITES, APRENDIZADO, CONFIANCA e LACUNAS.
// Quando o Paulus mudar de jeito de funcionar, revise essas constantes (veja docs/ARQUITETURA.md, seção Autoconhecimento).

import { limparMarcacao } from './pii.mjs';

export const TETO_FICHA = 6500;

// ------------------------------------------------------------------ texto escrito à mão

const COMO_FUNCIONA = [
  'Quando chega uma pergunta, um programa (não a IA) primeiro olha se há socorro ou dado pessoal; depois procura trechos na minha base de normas e escolhe até dois roteiros de trabalho que combinam com o pedido.',
  'Contas (renda per capita, valores, prazos) quem faz é um programa: o programa calcula e eu só explico o resultado. Eu não faço conta de cabeça.',
  'Em perguntas de análise ("posso?", "devo?", caso para pensar junto) a IA monta antes, em silêncio, um esqueleto com fatos, fonte, exceção e o que falta, e só então escreve a resposta.',
  'A resposta é escrita por um modelo de IA, só com o que veio da base, dos roteiros e do que o app mandou; o que for leitura minha eu digo que é leitura minha.'
];

const LIMITES = [
  'Não decido caso individual: ajudo a pensar, a achar a norma e a escrever, mas quem decide é a equipe técnica, com supervisão.',
  'Não navego na internet: só uso a minha base, os roteiros e o que o app me manda em cada pergunta.',
  'Não gravo a conversa nem lembro de conversas anteriores.',
  'Não vejo os dados dentro dos apps (famílias, planilhas, registros); só o que a pessoa escreve na pergunta ou o que o app manda como ficha pública.',
  'Não faço conta de cabeça e não invento número, artigo ou telefone: quando não consta, eu digo que não consta.'
];

const APRENDIZADO = [
  'Eu não guardo as conversas e não lembro delas depois que acabam; cada conversa começa do zero.',
  'Eu não aprendo sozinho com o uso: o que eu sei muda só quando alguém acrescenta documentos ou roteiros ao meu repositório e publica de novo.',
  'Dados pessoais de famílias não devem ser escritos aqui: se aparecerem, o programa recusa a pergunta antes de ela chegar à IA.'
];

const CONFIANCA = [
  'Posso errar. Por isso separo o que vem de fonte do que é suposição e digo o grau de segurança quando importa.',
  'Sou uma IA, não uma pessoa, e não substituo a equipe técnica nem a supervisão.',
  'Confira sempre a norma no texto original antes de usar numa decisão ou num documento oficial.'
];

const LACUNAS = [
  'Só sei o que está na minha base: se um documento não aparece na lista, eu não o tenho, e norma muda com o tempo.',
  'Legislação estadual e municipal só consta nos documentos de Roraima e de municípios listados; fora disso eu não conheço.',
  'Os textos foram extraídos de PDF e podem ter falhas de extração; os que ainda não foram comparados com o original aguardam conferência.'
];

// ------------------------------------------------------------------ pergunta sobre ele?

function norm(s) {
  return String(s == null ? '' : s).slice(0, 300).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:vc|voces)\b/g, 'voce').replace(/\b(?:o )?paulus\b/g, 'voce')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const SOBRE_SI = [
  /^o que voce (sabe fazer|faz|nao faz|nao sabe|ainda nao sabe|ainda nao faz|consegue fazer|pode fazer|sabe)( aqui| no app| por mim| comigo)?$/,
  /^(quem e voce( mesmo)?|quem te (criou|fez|programou|desenvolveu|construiu)|quem e seu criador|se apresente|apresente se|pode se apresentar|voce pode se apresentar)$/,
  /^como voce (funciona|decide|foi feito|foi feita|foi criado|foi criada|e feito|trabalha|responde|escolhe|aprende|pensa|sabe disso|chega nas respostas)\b/,
  /^de onde (vem(?: as)? (suas|tuas|essas) (respostas|informacoes)|voce (tira|pega|busca))\b/,
  /\b(suas|tuas) (habilidades|normas|fontes|funcoes|limites|limitacoes|capacidades)\b/,
  /^(quais|quantas|quantos|que|quais sao) (habilidades|normas|documentos|fontes|leis|roteiros|apps|aplicativos|temas|assuntos|decretos|resolucoes|tarefas)( \w+){0,2} voce (tem|conhece|sabe|usa|consulta|carrega)\b/,
  /^voce (tem|conhece|possui) (a |o |as |os |uma |um )?(loas|tipificacao|pnas|nob|constituicao|cf|cid 11|cid|lei|decreto|portaria|resolucao|norma|normas|documento|documentos)( \w+){0,3}$/,
  /^voce (guarda|grava|salva|armazena|le|acessa|abre|ve|ouve|lembra|esquece|aprende|pesquisa|navega|consulta|usa|entende|erra|mente|inventa|alucina|memoriza|compartilha|envia|sabe fazer|consegue|tem acesso|tem memoria|se conhece|e|eh)\b/,
  /^(posso confiar em voce|(em que|no que|com o que) voce (pode|consegue) (me )?ajudar|qual e a sua versao|qual a sua versao|que modelo voce usa|qual modelo voce usa|qual modelo de ia voce e|voce tem versao)\b/
];

export function ehPerguntaSobreSi(pergunta) {
  const t = norm(pergunta);
  if (!t || t.length > 200) return false;
  if (/\bartigo\b|\bart \d/.test(t)) return false;
  return SOBRE_SI.some(function (re) { return re.test(t); });
}

// ------------------------------------------------------------------ temas

const TEMAS = [
  ['fontes', /\b(normas?|documentos?|leis?|decretos?|fontes?|base|loas|pnas|tipificacao|nob|constituicao|portarias?|resolucoes?|cadernos?|trilhas?|de onde|tira|informacoes)\b/],
  ['habilidades', /\b(habilidades?|roteiros?|tarefas?)\b/],
  ['funcionamento', /\b(funciona|funcionamento|decide|decisao|feito|feita|criado|criada|construido|responde|respostas?|calcula|calculos?|conta|contas|modelo|versao|por dentro|raciocina|pensa|de onde|tira|informacoes)\b/],
  ['aprendizado', /\b(guarda|guardar|grava|gravar|salva|salvar|armazena|lembra|lembrar|esquece|memoria|memoriza|aprende|aprender|aprendizado|conversas?|historico)\b/],
  ['limites', /\b(nao faz|nao sabe|ainda nao|limites?|limitacoes|acessa|acesso|dados|planilhas?|internet|pesquisa|navega)\b/],
  ['confianca', /\b(confiar|confiavel|erra|errar|certeza|seguro|verdade)\b/]
];

export function temasDaPergunta(pergunta) {
  const t = norm(pergunta);
  if (!t) return [];
  return TEMAS.filter(function (x) { return x[1].test(t); }).map(function (x) { return x[0]; });
}

// ------------------------------------------------------------------ a ficha

function limpo(s, max) {
  return limparMarcacao(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

// Título curto para listas: sem parênteses finais, sem o que vem depois de ":" e com no máximo `max` caracteres.
function curto(titulo, max) {
  let t = limpo(titulo, 240).replace(/\s*\([^)]*\)?\s*$/, '').split(':')[0].trim();
  const limite = max || 60;
  if (t.length > limite) t = t.slice(0, limite).replace(/\s+\S*$/, '') + '…';
  return t;
}

function grupoDe(c) {
  const tipo = String((c && c.tipo) || 'norma');
  if (tipo === 'apoio') return 'apoio';
  if (tipo === 'referencia') return 'referencias';
  // Título que se declara "não é norma" (guias, orientações) vai para o material de apoio, qualquer que seja o tipo.
  if (/nao e norma/.test(norm((c && c.titulo) || ''))) return 'apoio';
  return 'normas';
}

const FAMILIAS = {
  condicionalidades: 'Condicionalidades do Bolsa Família',
  paif: 'PAIF', paf: 'PAF (Plano de Acompanhamento Familiar)', cras: 'CRAS como unidade', domicilio: 'Proteção Social Básica no Domicílio',
  psicossocial: 'Psicologia social e SUAS', raps: 'RAPS e saúde mental', avaliacao: 'Avaliação psicológica',
  psicodiagnostico: 'Psicodiagnóstico', psicopatologia: 'Psicopatologia', 'dados-r': 'Dados com R', 'dados-python': 'Dados com Python'
};

function chaveFamilia(id) {
  const p = String(id || '').split('-');
  return p[0] === 'dados' && p[1] ? 'dados-' + p[1] : p[0];
}

export function montarAutoconhecimento({ versao = '', catalogo = [], habilidades = [], apps = {} } = {}) {
  const docs = (Array.isArray(catalogo) ? catalogo : []).filter(function (c) { return c && c.doc; }).map(function (c) {
    return { doc: limpo(c.doc, 120), titulo: limpo(c.titulo || c.doc), ano: c.ano || '', tipo: String(c.tipo || 'norma'), trechos: Number(c.trechos) || 0, revisao: c.revisao || '', grupo: grupoDe(c) };
  });
  const grupos = { normas: [], referencias: [], apoio: [] };
  for (const d of docs) grupos[d.grupo].push(d);

  const lista = (Array.isArray(habilidades) ? habilidades : []).filter(function (h) { return h && h.id; });
  const porFamilia = new Map();
  for (const h of lista) {
    const k = chaveFamilia(h.id);
    if (!porFamilia.has(k)) porFamilia.set(k, []);
    porFamilia.get(k).push(h);
  }
  const familias = [];
  const avulsas = [];
  for (const [k, membros] of porFamilia) {
    if (membros.length >= 3) familias.push({ nome: FAMILIAS[k] || limpo(k.charAt(0).toUpperCase() + k.slice(1), 40), total: membros.length });
    else for (const h of membros) avulsas.push(limpo(h.nome || h.id, 80));
  }
  familias.sort(function (a, b) { return b.total - a.total; });

  const nomesApps = Object.keys(apps || {}).map(function (id) { return { id: id, nome: limpo((apps[id] && apps[id].nome) || id, 60) }; });

  return {
    versao: limpo(versao, 20),
    numeros: {
      documentos: docs.length,
      trechos: docs.reduce(function (s, d) { return s + d.trechos; }, 0),
      habilidades: lista.length,
      apps: nomesApps.length,
      pendentes: docs.filter(function (d) { return d.revisao === 'pendente'; }).length,
      conferidos: docs.filter(function (d) { return d.revisao === 'conferido'; }).length,
      normas: grupos.normas.length,
      referencias: grupos.referencias.length,
      apoio: grupos.apoio.length
    },
    grupos: grupos,
    familias: familias,
    avulsas: avulsas,
    apps: nomesApps
  };
}

// ------------------------------------------------------------------ ficha como texto

// "a; b; c … e mais K" até caber em `max` caracteres.
function juntar(itens, max) {
  let texto = '';
  let usados = 0;
  for (const it of itens) {
    const trecho = (usados ? '; ' : '') + it;
    if (texto.length + trecho.length > max) break;
    texto += trecho;
    usados++;
  }
  const resto = itens.length - usados;
  return texto + (resto > 0 ? (usados ? '; ' : '') + 'e mais ' + resto : '');
}

// Diagnósticos socioterritoriais são muitos e parecidos: entram como um item só.
function nomesDoGrupo(lista) {
  const diag = lista.filter(function (d) { return /diagnostico-socioterritorial/.test(d.doc); });
  const outros = lista.filter(function (d) { return !/diagnostico-socioterritorial/.test(d.doc); });
  const nomes = outros.map(function (d) { return curto(d.titulo, 60); });
  if (diag.length) nomes.push('diagnósticos socioterritoriais de municípios de Roraima (' + diag.length + ' documentos)');
  return nomes;
}

const SEGMENTOS_COMUNS = new Set(['guia', 'apoio', 'resumo', 'normas', 'leis', 'lei', 'decreto', 'portaria', 'resolucao', 'referencias', 'roraima', 'suas', 'paif', 'raps', 'cras', 'creas', 'mds', 'cfp', 'ref', 'dados', 'trilha', 'trilhas', 'condicionalidades', 'diagnostico', 'socioterritorial', 'anotada', 'extratos', 'bolsa', 'familia', 'gestao', 'plano', 'paulus']);

// Documentos que a pergunta cita pelo nome ("você tem a LOAS?"): o título curto inteiro, ou um pedaço marcante do identificador.
function documentosCitados(ficha, pergunta) {
  const q = ' ' + norm(pergunta) + ' ';
  const todos = [].concat(ficha.grupos.normas, ficha.grupos.referencias, ficha.grupos.apoio);
  const exatos = [];
  const parciais = [];
  for (const d of todos) {
    const chave = norm(curto(d.titulo, 60));
    if (chave.length >= 4 && q.indexOf(' ' + chave + ' ') !== -1) { exatos.push(d); continue; }
    const segmentos = String(d.doc).split('-').filter(function (s) { return s.length >= 4 && !/^\d+$/.test(s) && !SEGMENTOS_COMUNS.has(s); });
    if (segmentos.some(function (s) { return q.indexOf(' ' + s + ' ') !== -1; })) parciais.push(d);
  }
  return exatos.concat(parciais).slice(0, 4);
}

function rotulo(d) {
  return '- ' + curto(d.titulo, 70) + ' (' + (d.grupo === 'normas' ? 'norma' : d.grupo === 'referencias' ? 'referência técnica' : 'material de apoio') + (d.ano ? ', ' + d.ano : '') + ')';
}

function blocoFontes(ficha, pergunta) {
  const n = ficha.numeros;
  const linhas = ['O QUE HÁ NA MINHA BASE'];
  const citados = documentosCitados(ficha, pergunta);
  if (citados.length) linhas.push('Documentos que combinam com a pergunta:\n' + citados.map(rotulo).join('\n'));
  linhas.push('- Tenho ' + n.documentos + ' documentos (' + n.trechos + ' trechos): ' + n.normas + ' normas, ' + n.referencias + ' referências técnicas e ' + n.apoio + ' materiais de apoio.');
  if (ficha.grupos.normas.length) linhas.push('- Leis, decretos e textos sem marca de orientação (obrigam, cada um no seu alcance): ' + juntar(nomesDoGrupo(ficha.grupos.normas), 1500) + '.');
  if (ficha.grupos.referencias.length) linhas.push('- Referências técnicas e orientações (orientam, não obrigam): ' + juntar(nomesDoGrupo(ficha.grupos.referencias), 1600) + '.');
  if (ficha.grupos.apoio.length) linhas.push('- Material de apoio, resumos e dados (não é norma): ' + juntar(nomesDoGrupo(ficha.grupos.apoio), 1300) + '.');
  if (n.pendentes) linhas.push('- ' + n.pendentes + ' dos ' + n.documentos + ' documentos aguardam conferência com o original' + (n.conferidos ? '; ' + n.conferidos + ' já foram conferidos' : '') + '.');
  linhas.push('LACUNAS\n' + LACUNAS.map(function (x) { return '- ' + x; }).join('\n'));
  return linhas.join('\n');
}

function blocoHabilidades(ficha) {
  const n = ficha.numeros;
  const linhas = ['O QUE EU SEI FAZER'];
  linhas.push('- Sei fazer ' + n.habilidades + ' tarefas, em roteiros de trabalho que só entram na conversa quando o pedido combina com eles.');
  if (ficha.familias.length) linhas.push('- Em conjuntos: ' + ficha.familias.map(function (f) { return f.nome + ' (' + f.total + ')'; }).join('; ') + '.');
  if (ficha.avulsas.length) linhas.push('- Roteiros avulsos (gerais): ' + juntar(ficha.avulsas, 1400) + '.');
  return linhas.join('\n');
}

function blocoLista(titulo, itens) {
  return titulo + '\n' + itens.map(function (x) { return '- ' + x; }).join('\n');
}

export function fichaComoTexto(ficha, pergunta, opcoes) {
  const o = opcoes || {};
  const n = ficha.numeros;
  const temas = temasDaPergunta(pergunta);
  const citados = documentosCitados(ficha, pergunta);
  if (citados.length && temas.indexOf('fontes') === -1) temas.push('fontes');
  const geral = temas.length === 0;
  const tem = function (t) { return temas.indexOf(t) !== -1; };

  const app = o.app && o.app.nome ? limpo(o.app.nome, 60) : '';
  const pagina = limpo(o.pagina, 60);
  let identidade = 'Sou o Paulus, o assistente de IA que aparece nos apps de Paulo Xavier' + (ficha.versao ? ' (versão ' + ficha.versao + ')' : '') + '.';
  if (app) identidade += ' Neste momento estou no app ' + app + (pagina ? ', na aba "' + pagina + '"' : '') + '.';
  if (geral && ficha.apps.length) identidade += ' Estou em ' + ficha.apps.length + ' apps: ' + ficha.apps.map(function (a) { return a.nome; }).join(', ') + '.';

  const partes = [identidade];

  if (geral) {
    partes.push('Minha base tem ' + n.documentos + ' documentos e ' + n.trechos + ' trechos (' + n.normas + ' normas, ' + n.referencias + ' referências técnicas e ' + n.apoio + ' materiais de apoio)' + (n.pendentes ? '; ' + n.pendentes + ' deles aguardam conferência com o original' : '') + '.');
    let sei = 'Sei fazer ' + n.habilidades + ' tarefas (roteiros de trabalho)';
    if (ficha.familias.length) sei += ', entre elas: ' + ficha.familias.slice(0, 8).map(function (f) { return f.nome; }).join('; ');
    partes.push(sei + '.');
    partes.push(blocoLista('COMO EU FUNCIONO POR DENTRO', COMO_FUNCIONA.slice(0, 2)));
    partes.push(blocoLista('O QUE EU NÃO FAÇO', LIMITES));
    partes.push('Se quiser detalhes, pergunte, por exemplo, "quais normas você tem?", "quais habilidades você tem?" ou "como você funciona?".');
  } else {
    if (tem('fontes')) partes.push(blocoFontes(ficha, pergunta));
    if (tem('habilidades')) partes.push(blocoHabilidades(ficha));
    if (tem('funcionamento')) {
      const linhas = COMO_FUNCIONA.slice();
      const m = o.modelos;
      if (m && m.principal) {
        linhas.push('O modelo que escreve as respostas, neste momento: ' + limpo(m.principal, 80) + (m.reserva ? '; se ele falhar ou a cota acabar, passo para ' + limpo(m.reserva, 80) : '') + '.');
      }
      partes.push(blocoLista('COMO EU FUNCIONO POR DENTRO', linhas));
    }
    if (tem('aprendizado')) partes.push(blocoLista('O QUE EU GUARDO E LEMBRO', APRENDIZADO));
    if (tem('confianca')) partes.push(blocoLista('QUANTO CONFIAR EM MIM', CONFIANCA));
    if (tem('limites')) partes.push(blocoLista('O QUE EU NÃO FAÇO', LIMITES));
    else partes.push('Meus limites: ' + LIMITES.slice(0, 2).join(' '));
  }

  let texto = partes.join('\n\n');
  if (texto.length > TETO_FICHA) texto = texto.slice(0, TETO_FICHA).replace(/\n[^\n]*$/, '');
  return texto;
}
