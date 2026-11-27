// Respostas que o Worker dá SEM chamar a IA (poupa a cota gratuita do Workers AI).
//
//   respostaDeContagem(pergunta)            "quantas escolas tem no bairro Centro?", "quais UBS tem no Pricumã?", "qual bairro tem mais escolas?"
//   respostaDeFatoBoaVista(pergunta, base)  "quantos habitantes tem Boa Vista?", "qual o PIB?", "quando foi fundada?" (seção exata da base)
//   respostaDePolitica(pergunta, base)      "quando o benefício é bloqueado?", "qual o valor do Bolsa Família?" (seção exata dos guias curados)
//   respostaDaBase(pergunta, achados, ctx)  "o que é o PAIF?" (definição de SIGLA, com trecho de aderência alta que de fato a define)
//
// Cada função devolve { texto, fontes | escolhidos } ou null. Regra de ouro: na dúvida devolve null e a pergunta segue para a IA, como antes.
// Nada aqui interpreta caso, dá parecer ou completa número que a fonte não traz. O texto sai da fonte (diretório, mapa ou trecho da base)
// com a fonte citada e o aviso de que ela pode estar desatualizada ou incompleta.
//
// RESPOSTA_LOCAL="desligado" (wrangler.toml) desliga tudo isto e manda toda pergunta para a IA.

import { normalizar } from './busca.mjs';
import { DIRETORIO_BOA_VISTA } from './diretorio-boa-vista.mjs';
import { MAPA_BAIRROS } from './mapa-bairros.mjs';

const FONTE_DIRETORIO = {
  documento: 'Diretório de endereços do Argo SUAS',
  norma: 'Diretório de equipamentos e serviços do app Argo SUAS, cadastrado pela equipe do Argo. Não é cadastro oficial completo: endereço, telefone e bairro mudam',
  ano: 2026,
  tipo: 'apoio'
};

// Tema delicado (violência, crise, suicídio...): nunca sai de tabela, a IA e o cartão de socorro cuidam.
const RE_TEMA_SENSIVEL = /\b(?:suicid\w*|autolesao|automutil\w*|me matar|se matar|matar|violencia|violent\w*|abuso\w*|estupr\w*|maus tratos|agress\w*|ameaca\w*|denunci\w*|crise|surto|overdose|abandono|trafico|tortura|negligencia)\b/;

// Qualquer sinal de decisão, caso concreto, texto a produzir ou conta: a IA responde.
const RE_PEDE_MAIS = /\b(?:posso|devo|deve|pode(?:m)?|preciso|caso|situacao|dilema|etic[ao]s?|sigilo|recus\w*|e se|o que fazer|como (?:lidar|conduzir|abordar|proceder)|vale a pena|melhor|estou em duvida|nao sei|sera que|o que voce acha|explique|explica|compare|diferenca|resuma|resumo|escreva|redija|elabore|monte|crie|gere|faca|calcule|conta|simule|exemplo|passo a passo|minha|meu|nossa|nosso|aqui|vizinh\w*|essa familia|a familia|uma familia|ele|ela)\b/;

const MAX_PALAVRAS_PERGUNTA = 20;
const TETO_TRECHO = 700;

// Corta no fim de uma frase para o trecho caber numa resposta (a fonte completa segue citada).
function resumirTrechoLocal(texto, max) {
  const t = String(texto || '');
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('; '));
  return (fim > max * 0.5 ? corte.slice(0, fim + 1) : corte.replace(/\s+\S*$/, '')) + ' [...]';
}

// ------------------------------------------------------------------ bairros

// Duas fontes por bairro: o diretório do Argo (unidades que a equipe cadastrou, com nome) e o mapa colaborativo OpenStreetMap
// (contagem de lugares por categoria, mais ampla e menos confiável). As grafias do mesmo bairro viram uma chave só.
const SIN_CHAVE = {
  'treze de setembro': '13 de setembro', 'trinta e um de marco': '31 de marco', 'sen helio campos': 'senador helio campos',
  'santa teresa': 'santa tereza', 'nossa senhora aparecida': 'aparecida', 'conjunto cruviana': 'cruviana', 'conj cruviana': 'cruviana',
  'conjunto dr airton rocha': 'dr airton rocha', 'airton rocha': 'dr airton rocha', 'silvio botelho': 'dr silvio botelho', 'silvio leite': 'dr silvio leite',
  'equatorial': 'jardim equatorial', 'bairro uniao': 'uniao', 'joquei clube': 'joquei clube'
};
const NOME_FIXO = { '13 de setembro': '13 de Setembro', '31 de marco': '31 de Março', 'estados': 'Bairro dos Estados' };
// O campo "bairro" às vezes traz lixo (CEP, "andar térreo", nome de escola): isso não é bairro.
const RE_LIXO_BAIRRO = /^(?:cep\b|andar\b|antigo\b|profa?\b)/;
const RE_RURAL = /^(?:zona rural|rural|comunidades?)\b/;

function chaveDoBairro(bruto) {
  let n = normalizar(bruto);
  if (!n || RE_LIXO_BAIRRO.test(n)) return null;
  n = n.replace(/^bairro\s+(?:dos\s+)?/, '').replace(/^doutor\s+/, 'dr ').replace(/^doutora\s+/, 'dra ').replace(/^conj\s+/, 'conjunto ');
  return SIN_CHAVE[n] || n;
}
const limparNome = (b) => String(b).replace(/^\s*bairro\s+/i, '').replace(/^\s*Doutor\s/, 'Dr. ').replace(/^\s*Doutora\s/, 'Dra. ').trim();

const MAPA_ROTULO = { 'escolas': 'escolas', 'creches e pré-escolas': 'creches e pré-escolas', 'ensino superior': 'instituições de ensino superior', 'saúde': 'lugares de saúde', 'bancos': 'agências bancárias', 'assistência social': 'lugares de assistência social' };

// ------------------------------------------------------------------ categorias

const ESTADUAL_ESCOLA = /^(?:cem|ceep|e\.?\s?e\.?\s?i?\.?|col[eé]gio|esc\.)\b/i;
const grupoRe = (re) => (u) => re.test(u.grupo);

// [id, singular, plural, onde aparece na pergunta, predicado sobre a unidade do diretório, categoria do mapa (ou null), aviso]
const CATEGORIAS = [
  ['creche', 'creche', 'creches', /\b(?:creches?|proinfancia|nucleos? de creche|pre escolas?)\b/, grupoRe(/Creches e Proinf/), 'creches e pré-escolas', ''],
  ['escola', 'escola', 'escolas', /\b(?:escolas?|colegios?|ceems?|ensino fundamental|ensino medio)\b/,
    (u) => /^Rede Municipal - Escolas$/.test(u.grupo) || (u.grupo === 'Rede Estadual' && ESTADUAL_ESCOLA.test(u.nome)), 'escolas',
    'Para o número oficial de escolas, consulte o Censo Escolar (INEP) ou a Secretaria de Educação.'],
  ['superior', 'instituição de ensino superior', 'instituições de ensino superior', /\b(?:faculdades?|universidades?|ensino superior|instituicoes? de ensino superior)\b/, grupoRe(/^Ensino Superior$/), 'ensino superior', ''],
  ['cras', 'CRAS', 'CRAS', /\bcras\b/, grupoRe(/^CRAS\b/), null, ''],
  ['creas', 'CREAS', 'CREAS', /\bcreas\b/, grupoRe(/^CREAS\b/), null, ''],
  ['caps', 'CAPS', 'CAPS', /\bcaps\b/, grupoRe(/^CAPS\b/), null, ''],
  ['ubs', 'UBS', 'UBS', /\b(?:ubs|ubss|unidades? basicas? de saude|postos? de saude)\b/, (u) => /^UBS\b/.test(u.nome) || /^UBS\b/.test(u.grupo), null, ''],
  ['hospital', 'hospital', 'hospitais', /\bhospita(?:l|is)\b/, grupoRe(/^Hospitais$/), null, ''],
  ['delegacia', 'delegacia', 'delegacias', /\bdelegacias?\b/, grupoRe(/^Delegacias\b|^Distritos Policiais$/), null, ''],
  ['abrigo', 'abrigo', 'abrigos', /\b(?:abrigos?|casas? de passagem|acolhimento institucional)\b/, grupoRe(/^Abrigos\b|^Acolhimento Institucional$/), null, ''],
  ['conselho', 'conselho', 'conselhos', /\bconselhos?\b/, grupoRe(/^Conselhos\b/), null, ''],
  ['bombeiro', 'unidade do Corpo de Bombeiros', 'unidades do Corpo de Bombeiros', /\bbombeiros?\b/, grupoRe(/Bombeiros/), null, ''],
  ['banco', 'agência bancária', 'agências bancárias', /\b(?:bancos?|agencias? bancarias?)\b/, grupoRe(/^Bancos$/), 'bancos', ''],
  ['restaurante', 'Restaurante Cidadão', 'Restaurantes Cidadão', /\brestaurantes? cidadao\b/, grupoRe(/^Restaurante Cidad/), null, ''],
  ['saude', 'unidade de saúde', 'unidades de saúde', /\b(?:unidades? de saude|equipamentos? de saude|servicos? de saude|saude)\b/,
    grupoRe(/^(?:Aten[cç][aã]o B[aá]sica|UBS|CAPS|Hospitais|Urg[eê]ncia|Sa[uú]de|Gest[aã]o e Vigil[aâ]ncia em Sa[uú]de|Autismo)/), 'saúde',
    'No diretório entram UBS, CAPS, hospitais, urgência e outros serviços de saúde; no mapa, também consultórios e clínicas.'],
  ['suas', 'equipamento socioassistencial', 'equipamentos socioassistenciais', /\b(?:equipamentos? (?:socioassistenciais?|do suas|da assistencia social)|rede socioassistencial|unidades? do suas|assistencia social)\b/,
    grupoRe(/^(?:CRAS|CREAS|Abrigos|Acolhimento|Atendimento e Benef|Programas Socioeducativos|Restaurante Cidad|Aten[cç][aã]o [àa] Pessoa Idosa|Programas para Pessoa Idosa|Outros Equipamentos Socioassistenciais|CAS$|Rede de Prote)/), 'assistência social',
    'No diretório entram CRAS, CREAS, abrigos, acolhimento, benefícios eventuais, programas socioeducativos, Restaurante Cidadão e serviços para pessoa idosa.']
];
const GENERICA = ['todos', 'equipamento', 'equipamentos', /\b(?:equipamentos?|unidades?|servicos?|estabelecimentos?|locais|lugares)\b/, () => true, null, ''];

// Palavras que mostram que a pessoa quer outra coisa (gente, atendimento, vaga), não a contagem de lugares.
const RE_OUTRO_ASSUNTO = /\b(?:alunos?|matriculas?|vagas?|professores?|funcionarios?|profissionais|psicologos?|assistentes?|familias?|pessoas|criancas?|idosos?|beneficiarios?|atendimentos?|casos?|pacientes?|usuarios?|recebem|recebe|doencas?|orcamento|custo|salario|enderecos?|telefones?|horarios?)\b/;
// Outro lugar que não Boa Vista: as fontes não respondem.
const RE_OUTRO_LUGAR = /\b(?:roraima|estado|brasil|pais|pacaraima|rorainopolis|bonfim|canta|caracarai|mucajai|alto alegre|amajari|iracema|normandia|uiramuta|caroebe|sao luiz|sao joao da baliza|manaus|belem|macapa|brasilia)\b/;

const RE_QUANTOS = /\b(?:quant[oa]s?|numero de|total de|qual (?:o )?(?:total|numero))\b/;
const RE_LISTA = /\b(?:quais|liste|listar|lista|nomes? d[aeo]s?|me diga quais|mostre|relacione|cite)\b/;
const RE_RANKING = /\b(?:qual|quais)\s+(?:e\s+)?(?:o\s+)?bairros?\b.*\b(?:mais|maior|concentra|menos)\b|\bbairros? (?:com|que) (?:mais|maior|menos)\b|\bonde (?:tem|ha|existem?) mais\b/;
const RE_CIDADE = /\b(?:boa vista|bv|capital|cidade|municipio|no total|ao todo|em geral)\b/;

function categoriaDaPergunta(n) {
  for (const c of CATEGORIAS) if (c[3].test(n)) return { id: c[0], singular: c[1], plural: c[2], pred: c[4], osm: c[5], aviso: c[6], re: c[3] };
  if (GENERICA[3].test(n)) return { id: GENERICA[0], singular: GENERICA[1], plural: GENERICA[2], pred: GENERICA[4], osm: null, aviso: GENERICA[6], re: GENERICA[3], generica: true };
  return null;
}

// ------------------------------------------------------------------ índice (diretório + mapa)

const CACHE = new WeakMap();

function indiceDasFontes(diretorio, mapa) {
  if (CACHE.has(diretorio) && CACHE.get(diretorio).mapa === mapa) return CACHE.get(diretorio);
  const vistos = new Set();
  const unidades = [];
  const bairros = new Map(); // chave -> { nome, dir: [], osm: {t, c} | null }
  const pegar = (chave, nome) => { if (!bairros.has(chave)) bairros.set(chave, { nome: NOME_FIXO[chave] || limparNome(nome), dir: [], osm: null }); return bairros.get(chave); };
  for (const u of diretorio) {
    if (!u || !u.nome) continue;
    const k = normalizar(u.nome);
    if (vistos.has(k)) continue; // a mesma unidade em dois grupos (UBS em "Atenção Básica" e "UBS") conta uma vez
    vistos.add(k);
    const chave = chaveDoBairro(u.bairro);
    const un = { nome: String(u.nome).trim(), grupo: String(u.grupo || ''), chave: chave };
    unidades.push(un);
    if (chave) pegar(chave, u.bairro).dir.push(un);
  }
  const rural = { t: 0, c: {} };
  if (mapa && mapa.bairros) {
    for (const [nome, v] of Object.entries(mapa.bairros)) {
      if (RE_RURAL.test(normalizar(nome))) { rural.t += v.t; for (const [c, q] of Object.entries(v.c)) rural.c[c] = (rural.c[c] || 0) + q; continue; }
      const chave = chaveDoBairro(nome);
      if (!chave) continue;
      const b = pegar(chave, nome);
      if (!b.osm) b.osm = { t: 0, c: {} };
      b.osm.t += v.t;
      for (const [c, q] of Object.entries(v.c)) b.osm.c[c] = (b.osm.c[c] || 0) + q;
    }
  }
  const r = { mapa: mapa, unidades: unidades, bairros: bairros, rural: rural };
  CACHE.set(diretorio, r);
  return r;
}

const LOCATIVO = '(?:no|na|nos|nas|em|do|da|de|dos|das|ao|pelo|pela)\\s+(?:bairros?\\s+)?(?:o\\s+|a\\s+)?(?:do\\s+|da\\s+)?';
const VARIANTES = new Map(); // chave -> grafias que a pessoa pode digitar
for (const [v, c] of Object.entries(SIN_CHAVE)) { if (!VARIANTES.has(c)) VARIANTES.set(c, []); VARIANTES.get(c).push(v); }

// Bairro citado na pergunta (o de nome mais longo que casar). Devolve { chave, bairro } | { desconhecido } | null.
function bairroDaPergunta(n, indice) {
  let achado = null;
  for (const [chave, b] of indice.bairros) {
    const formas = [chave].concat(VARIANTES.get(chave) || []);
    if (NOME_FIXO[chave] === 'Bairro dos Estados') formas.push('bairro dos estados');
    for (const f of formas) {
      if (f.length < 4) continue;
      const re = new RegExp('\\b' + LOCATIVO + f.replace(/ /g, '\\s+') + '\\b(?!\\s+(?:pop|de\\s+referencia|dia))');
      if (re.test(n) && (!achado || f.length > achado.tam)) achado = { tam: f.length, chave: chave, bairro: b };
    }
  }
  if (achado) return achado;
  // "no bairro Xyz" com um nome que as fontes não têm: não é "zero", é "não consta".
  const m = /\bbairros?\s+(?:do\s+|da\s+)?([a-z0-9][a-z0-9 ]{2,40}?)(?:\s*$|\s+(?:tem|ha|existe|existem|possui)\b)/.exec(n);
  if (m) return { desconhecido: m[1].trim() };
  return null;
}

const plural = (k, singular, pluralForma) => (k === 1 ? singular : pluralForma);
const mesAno = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m[2]) - 1] + '/' + m[1] : ''; };

// ------------------------------------------------------------------ contagem

// diretorio e mapa são opcionais (testes): por padrão usa o diretório de Boa Vista e o mapa gerado em shared/mapa-bairros.mjs.
export function respostaDeContagem(pergunta, diretorio, mapa) {
  const dir = Array.isArray(diretorio) ? diretorio : DIRETORIO_BOA_VISTA;
  const mp = mapa === undefined ? MAPA_BAIRROS : mapa;
  const n = normalizar(String(pergunta == null ? '' : pergunta));
  if (!n || n.split(' ').length > 24) return null;
  if (RE_OUTRO_LUGAR.test(n) && !/\bboa vista\b/.test(n)) return null;
  if (RE_OUTRO_ASSUNTO.test(n) || RE_TEMA_SENSIVEL.test(n)) return null;

  const quer = { contar: RE_QUANTOS.test(n), listar: RE_LISTA.test(n), ranking: RE_RANKING.test(n) };
  if (!quer.contar && !quer.listar && !quer.ranking) return null;
  const cat = categoriaDaPergunta(n);
  if (!cat) return null;
  // "quantos ... CATEGORIA": a categoria tem de estar perto da palavra de quantidade (senão é outra pergunta).
  if (quer.contar && !quer.listar && !quer.ranking) {
    const perto = new RegExp('(?:quant[oa]s?|numero de|total de)\\s+(?:[a-z0-9]+\\s+){0,2}' + cat.re.source);
    if (!perto.test(n)) return null;
  }

  const indice = indiceDasFontes(dir, mp);
  const lugar = bairroDaPergunta(n, indice);
  const daCategoria = indice.unidades.filter(cat.pred);
  const rotulo = (k) => plural(k, cat.singular, cat.plural);
  const ate = mp && mp.data ? mesAno(mp.data) : '';
  const usaMapa = !!mp && (!!cat.osm || !!cat.generica);
  const fontes = [FONTE_DIRETORIO].concat(usaMapa ? [{ documento: 'Mapa de Boa Vista: lugares e serviços por bairro (OpenStreetMap)', norma: 'OpenStreetMap, ' + (mp.data || '') + ' (© colaboradores do OpenStreetMap, ODbL); mapa colaborativo, incompleto; não é cadastro oficial', ano: 2026, tipo: 'referencia' }] : []);
  const rodape = (usaMapa
    ? 'O mapa é colaborativo e o diretório traz só o que a equipe do Argo cadastrou: nenhum dos dois é cadastro oficial completo, e endereço e bairro mudam.'
    : 'Fonte: diretório do Argo, cadastro da equipe (não é cadastro oficial completo); endereço e bairro mudam, confirme com a unidade.') + (cat.aviso ? '\n' + cat.aviso : '');
  const resposta = (texto) => ({ texto: texto + '\n' + rodape, fontes: fontes });
  const linhaMapa = (tot) => '- Mapa colaborativo (OpenStreetMap, ' + ate + '): **' + tot + '** ' + (cat.osm && MAPA_ROTULO[cat.osm] ? (tot === 1 ? MAPA_ROTULO[cat.osm].replace(/s$/, '') : MAPA_ROTULO[cat.osm]) : rotulo(tot)) + '.\n';

  // Ranking: qual bairro tem mais
  if (quer.ranking && !(lugar && lugar.bairro)) {
    const menos = /\bmenos\b/.test(n);
    let ordem;
    let base;
    if (cat.osm && mp) {
      ordem = Array.from(indice.bairros.values()).map((b) => [b.nome, (b.osm && b.osm.c[cat.osm]) || 0]).filter((x) => x[1] > 0);
      base = 'no mapa colaborativo (OpenStreetMap, ' + ate + ')';
    } else {
      ordem = Array.from(indice.bairros.values()).map((b) => [b.nome, b.dir.filter(cat.pred).length]).filter((x) => x[1] > 0);
      base = 'no diretório do Argo (só entram as unidades com bairro na ficha)';
    }
    if (!ordem.length) return null;
    ordem.sort((a, b) => (menos ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0], 'pt-BR'));
    let t = 'Bairros com ' + (menos ? 'menos ' : 'mais ') + cat.plural + ' ' + base + ':\n' + ordem.slice(0, 5).map(([b, k]) => '- ' + b + ': ' + k).join('\n');
    const rur = cat.osm && indice.rural.c[cat.osm];
    if (rur) t += '\nFora dos bairros (zona rural e comunidades, no mapa): ' + rur + '.';
    return resposta(t);
  }

  // Bairro que as fontes não conhecem
  if (lugar && lugar.desconhecido) {
    return resposta('Não encontrei o bairro "' + lugar.desconhecido.replace(/\b[a-z]/g, (c) => c.toUpperCase()) + '" no diretório do Argo nem no mapa, então não consigo contar ' + cat.plural + ' nele. Pode ser grafia diferente ou um bairro sem lugares cadastrados; isso não quer dizer que não exista ' + cat.singular + ' lá.');
  }

  // Um bairro
  if (lugar && lugar.bairro) {
    const b = lugar.bairro;
    const doBairro = b.dir.filter(cat.pred);
    const semBairro = daCategoria.filter((u) => !u.chave).length;
    const nota = semBairro ? '\n' + semBairro + ' ' + rotulo(semBairro) + ' do diretório estão sem bairro na ficha e não entram na conta do diretório, então o número real pode ser maior.' : '';
    if (cat.generica) {
      const partes = [];
      if (b.osm) partes.push('- Mapa colaborativo (OpenStreetMap, ' + ate + '): **' + b.osm.t + '** lugares (' + Object.entries(b.osm.c).sort((x, y) => y[1] - x[1]).map(([c, q]) => c + ' ' + q).join('; ') + ').');
      if (b.dir.length) {
        const grupos = new Map();
        for (const u of b.dir) grupos.set(u.grupo, (grupos.get(u.grupo) || []).concat(u.nome));
        const lim = quer.listar ? 6 : 3;
        partes.push('- Diretório do Argo: **' + b.dir.length + '** ' + plural(b.dir.length, 'equipamento', 'equipamentos') + ':\n' +
          Array.from(grupos.entries()).sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0], 'pt-BR'))
            .map(([g, nomes]) => '  - ' + g + ' (' + nomes.length + '): ' + nomes.slice(0, lim).join('; ') + (nomes.length > lim ? '; e mais ' + (nomes.length - lim) : '')).join('\n'));
      }
      if (!partes.length) return resposta('Não há nenhum lugar cadastrado no bairro **' + b.nome + '** nem no diretório do Argo nem no mapa.');
      return resposta('No bairro **' + b.nome + '**:\n' + partes.join('\n'));
    }
    const noMapa = cat.osm && mp ? (b.osm ? (b.osm.c[cat.osm] || 0) : null) : null;
    let t = 'No bairro **' + b.nome + '**:\n';
    if (cat.osm && mp) t += b.osm ? linhaMapa(noMapa) : '- Mapa colaborativo: o bairro não aparece no mapa.\n';
    t += '- Diretório do Argo: **' + doBairro.length + '** ' + rotulo(doBairro.length) + (doBairro.length && (doBairro.length <= 12 || quer.listar) ? ':\n' + doBairro.slice(0, 20).map((u) => '  - ' + u.nome).join('\n') : '.');
    if (!doBairro.length && !noMapa) return resposta('Não há registro de ' + cat.singular + ' no bairro **' + b.nome + '** nem no diretório do Argo nem no mapa.' + nota);
    return resposta(t + nota);
  }

  // Cidade toda (sem bairro citado)
  if (cat.generica) {
    if (!(RE_CIDADE.test(n) || quer.contar)) return null;
    const grupos = new Map();
    for (const u of daCategoria) grupos.set(u.grupo, (grupos.get(u.grupo) || 0) + 1);
    const top = Array.from(grupos.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    let t = '';
    if (mp) t += '- Mapa colaborativo (OpenStreetMap, ' + ate + '): **' + mp.total + '** lugares com nome em Boa Vista, em ' + Object.keys(mp.categorias).length + ' categorias.\n';
    t += '- Diretório do Argo: **' + daCategoria.length + '** equipamentos e serviços cadastrados, em ' + grupos.size + ' grupos. Os maiores:\n' + top.map(([g, k]) => '  - ' + g + ': ' + k).join('\n');
    return resposta('Boa Vista:\n' + t + '\nPara ver um bairro, pergunte por exemplo "quantos equipamentos tem no Centro?".');
  }
  const noMapa = cat.osm && mp ? mp.categorias[cat.osm] : null;
  if (!daCategoria.length && !noMapa) return null;
  const comBairro = daCategoria.filter((u) => u.chave).length;
  let t = 'Em Boa Vista:\n';
  if (noMapa) t += '- Mapa colaborativo (OpenStreetMap, ' + ate + '): **' + noMapa + '** ' + (MAPA_ROTULO[cat.osm] || cat.plural) + '.\n';
  t += '- Diretório do Argo: **' + daCategoria.length + '** ' + rotulo(daCategoria.length) + (comBairro < daCategoria.length ? ' (' + comBairro + ' com bairro na ficha)' : '') + '.';
  if (quer.listar && daCategoria.length <= 25) t += '\n' + daCategoria.map((u) => '  - ' + u.nome + (u.chave ? ' (' + indice.bairros.get(u.chave).nome + ')' : '')).join('\n');
  return resposta(t);
}

// ------------------------------------------------------------------ dados de Boa Vista (seção exata da base)

// Cada linha aponta para UMA seção da base (documento + título da seção). O texto vem da própria base, então acompanha as atualizações;
// se a seção sumir, a linha deixa de responder e a pergunta segue para a IA. Casar palavra solta no texto errava (habitantes x habitacionais).
// [quando a pergunta casa, documento, começo do título da seção]
const FATOS_BOA_VISTA = [
  [/\b(?:habitantes|populacao|quantas pessoas (?:moram|vivem)|moradores|indigenas)\b/, 'roraima-municipios-2022', 'Boa Vista (RR), população do município'],
  [/\b(?:populacao|habitantes|cresceu|crescimento).*\b(?:tempo|decadas?|historia|evolucao|desde)\b|\bevolucao da populacao\b/, 'boa-vista-geografia-mapa', 'Boa Vista: população ao longo do tempo'],
  [/\b(?:area|tamanho|extensao|km2|quilometros quadrados|altitude|onde fica|localizacao|latitude|fica em que)\b/, 'boa-vista-geografia-mapa', 'Boa Vista: onde fica e números básicos do mapa'],
  [/\b(?:clima|chuva|chove|temperatura|relevo|vegetacao|lavrado|savana)\b/, 'boa-vista-geografia-mapa', 'Boa Vista: sítio, relevo, clima e vegetação'],
  [/\b(?:fundada|fundacao|fundou|aniversario|criada|criacao|virou municipio|9 de julho)\b/, 'boa-vista-historia-fundacao', 'Boa Vista: da freguesia ao município'],
  [/\b(?:quantos bairros|numero de bairros|lista de bairros|quais (?:sao )?os bairros)\b/, 'boa-vista-geografia-mapa', 'Boa Vista: quantos bairros tem, lista de 56 bairros (CepBrasil), parte 1'],
  [/\b(?:pib|produto interno)\b/, 'boa-vista-economia-pib', 'Boa Vista: tamanho da economia'],
  [/\b(?:setores da economia|principais setores|economia de boa vista|base da economia)\b/, 'boa-vista-economia-pib', 'Boa Vista: setores da economia'],
  [/\b(?:cadunico|cadastro unico).*\b(?:familias|pessoas|cadastrad\w+|quantas|quantos)\b|\b(?:familias|pessoas|quantas|quantos)\b.*\b(?:cadunico|cadastro unico)\b/, 'boa-vista-diagnostico-socioterritorial-2026', 'Boa Vista, Cadastro Único: quantas famílias e pessoas estão cadastradas'],
  [/\b(?:bolsa familia)\b.*\b(?:familias|pessoas|beneficiari\w+|quantas|quantos)\b|\b(?:familias|beneficiari\w+|quantas|quantos)\b.*\bbolsa familia\b/, 'boa-vista-diagnostico-socioterritorial-2026', 'Boa Vista, Programa Bolsa Família: famílias e pessoas beneficiárias'],
  [/\b(?:bpc|beneficio de prestacao continuada)\b.*\b(?:beneficiari\w+|quantos|quantas|pessoas)\b|\b(?:beneficiari\w+|quantos|quantas)\b.*\b(?:bpc|prestacao continuada)\b/, 'boa-vista-diagnostico-socioterritorial-2026', 'Boa Vista, BPC: beneficiários registrados'],
  [/\b(?:ivcad)\b/, 'boa-vista-diagnostico-socioterritorial-2026', 'IVCAD de Boa Vista: índice geral e dimensões'],
  [/\b(?:prefeito|prefeita)\b/, 'boa-vista-transporte-gestao-2026', 'Boa Vista: quem é o prefeito'],
  [/\b(?:passe livre)\b/, 'boa-vista-transporte-gestao-2026', 'Boa Vista: passe livre estudantil em 2026'],
  [/\b(?:onibus|transporte coletivo|tarifa|ciclovias?)\b/, 'boa-vista-transporte-gestao-2026', 'Boa Vista: transporte coletivo, tarifa e empresas'],
  [/\b(?:zona rural|assentamentos?|terras? indigenas?)\b/, 'boa-vista-geografia-mapa', 'Boa Vista: zona rural, assentamentos e terras indígenas'],
  [/\b(?:distancia|quantos km|quilometros)\b.*\b(?:manaus|pacaraima|caracarai|brasilia|bonfim|estrada)\b|\bdistancias? por estrada\b/, 'boa-vista-geografia-mapa', 'Boa Vista: distâncias por estrada'],
  [/\b(?:agua|esgoto|coleta de lixo|saneamento)\b/, 'boa-vista-geografia-mapa', 'Boa Vista: água, esgoto e coleta de lixo na cidade']
];
const RE_CAPITAL = /\b(?:boa vista|bv|capital (?:de roraima|roraimense)|a capital|da capital|na capital)\b/;
const RE_PERGUNTA_DE_DADO = /^(?:qual|quais|quant[oa]s?|quando|onde|quem|como (?:e|sao|esta|estao)|o que (?:e|sao)|de que|em que|me (?:diga|fale)|fale|diga)\b|\b(?:tem|ha|existem?)\b/;

// A pergunta cita um ano que a seção não traz ("população em 2010" x seção de 2022): não responde.
const RE_ANO = /\b(?:19|20)\d{2}\b/g;
function anoSemFonte(n, trecho) {
  const anos = n.match(RE_ANO) || [];
  if (!anos.length) return false;
  const tudo = normalizar((trecho.titulo || '') + ' ' + (trecho.referencia || '') + ' ' + String(trecho.texto || ''));
  return anos.some((a) => tudo.indexOf(a) === -1);
}

function acharSecao(base, docs, inicios) {
  for (const doc of docs) for (const ini of inicios) {
    const t = base.find((x) => x && x.doc === doc && normalizar(String(x.referencia || x.titulo || '')).indexOf(normalizar(ini)) === 0);
    if (t) return t;
  }
  return null;
}

// base: lista de trechos ({ doc, titulo, referencia, texto, tipo }). Devolve { texto, escolhidos: [{ trecho }] } | null.
export function respostaDeFatoBoaVista(pergunta, base) {
  if (!Array.isArray(base) || !base.length) return null;
  const n = normalizar(String(pergunta == null ? '' : pergunta));
  const palavras = n ? n.split(' ').length : 0;
  if (palavras < 3 || palavras > MAX_PALAVRAS_PERGUNTA) return null;
  if (!RE_CAPITAL.test(n) && !/\b(?:prefeito|prefeita)\b/.test(n)) return null;
  if (RE_PEDE_MAIS.test(n) || RE_TEMA_SENSIVEL.test(n) || !RE_PERGUNTA_DE_DADO.test(n)) return null;
  // Pergunta de outro lugar (Roraima inteiro, outro município) não é de Boa Vista.
  if (RE_OUTRO_LUGAR.test(n.replace(/\bcapital de roraima\b/g, ' '))) return null;
  const hit = FATOS_BOA_VISTA.filter((f) => f[0].test(n));
  if (!hit.length) return null;
  const escolhidos = [];
  for (const [, doc, inicio] of hit) {
    if (escolhidos.length >= 2) break;
    const t = acharSecao(base, [doc], [inicio]);
    if (t && !escolhidos.some((e) => e.trecho === t)) escolhidos.push({ trecho: t });
  }
  if (!escolhidos.length || escolhidos.some((e) => anoSemFonte(n, e.trecho))) return null;
  const porTrecho = escolhidos.length === 1 ? TETO_TRECHO + 300 : TETO_TRECHO - 100;
  const blocos = escolhidos.map((a, i) => {
    const t = a.trecho;
    const rotulo = [t.titulo || t.doc, t.referencia].filter(Boolean).join(' — ');
    return (escolhidos.length > 1 ? (i + 1) + ') ' : '') + (rotulo ? '**' + rotulo + '**\n' : '') + resumirTrechoLocal(t.texto, porTrecho);
  });
  const tecnico = escolhidos.some((a) => a.trecho.tipo && a.trecho.tipo !== 'norma');
  return { texto: blocos.join('\n\n') + '\n\n' + (tecnico ? 'Dado de material de apoio da base do Paulus (não é norma). Confira a fonte original antes de usar o número em documento.' : 'Trecho da base do Paulus. Confira a fonte oficial.'), escolhidos: escolhidos };
}

// ------------------------------------------------------------------ políticas públicas (perguntas frequentes, seção exata)

// Mesma ideia da tabela de Boa Vista: cada linha aponta para UMA seção de guia curado da base (Bolsa Família, CadÚnico). Busca livre
// trazia artigo errado ("valor do BPC" voltou um artigo sobre herdeiros), então aqui só entra pergunta que casa com a seção certa.
// [quando a pergunta casa, documentos onde procurar (na ordem), começo do título da seção]
const GBF = 'guia-bolsa-familia-cadunico-2026', BF26 = 'bolsa-familia-2026', CAD = 'cadunico-mds';
const ASSUNTO_PBF = /\b(?:bolsa familia|pbf|cadunico|cadastro unico|sicon|condicionalidades?|repercussao|primeira infancia|beneficio de renda|renda de cidadania)\b/;
const POLITICAS = [
  [/\b(?:valor(?:es)?|quanto (?:recebe|paga|e|ganha)|piso|primeira infancia|bpi|brc|beneficio complementar)\b/, [GBF, BF26], ['Valores dos benefícios', 'Valores do benefício em 2026']],
  [/\b(?:reajuste|aumento)\b/, [BF26], ['Reajuste de outubro de 2026']],
  [/\b(?:regra de protecao|renda acima de 218|retorno garantido|passou da renda)\b/, [GBF], ['Regra de proteção (renda acima de R$ 218)']],
  [/\b(?:quem (?:pode|tem direito)|quem recebe|elegiveis?|criterios?|renda per capita|como entrar|como participar|como conseguir)\b/, [GBF, BF26], ['Quem pode receber e como entrar', 'Como participar do Bolsa Família']],
  [/\b(?:calendario de pagamento|data de pagamento|datas? de pagamento|quando (?:paga|pagam|cai)|prazo para saque)\b/, [GBF, BF26], ['Pagamento: datas e prazo para saque', 'Calendário de pagamento de outubro a dezembro de 2026']],
  [/\b(?:sacar|saque|cartao|caixa tem)\b/, [GBF, BF26], ['Como sacar e movimentar o benefício', 'Como sacar o benefício']],
  [/\b(?:atualiz\w+).*\b(?:cadunico|cadastro unico)\b|\b(?:cadunico|cadastro unico)\b.*\batualiz\w+|\bprazo (?:de|para) atualiza\w+/, [GBF, CAD], ['Atualização do CadÚnico', 'Atualização cadastral do CadÚnico']],
  [/\b(?:qualificacao cadastral)\b/, [BF26], ['Ação de Qualificação Cadastral']],
  [/\b(?:o que e)\b.*\b(?:cadunico|cadastro unico)\b/, [CAD], ['O que é o Cadastro Único']],
  [/\b(?:quem pode se cadastrar|documentos? (?:para|do|de) (?:o )?(?:cadunico|cadastro unico)|o que levar|como (?:me |se )?cadastrar|como (?:fazer|faco) (?:o |meu )?(?:cadunico|cadastro unico))\b/, [CAD, GBF], ['Como se cadastrar no CadÚnico', 'Quem pode se cadastrar no CadÚnico e o que levar']],
  [/\b(?:efeitos? do descumprimento|descumprimento das condicionalidades|advertencia|bloqueio|suspensao|cancelamento)\b/, [GBF], ['Efeitos do descumprimento das condicionalidades']],
  [/\b(?:o que sao|quais sao|o que e)\b.*\bcondicionalidades?\b|\bcondicionalidades?\b.*\b(?:quais|o que)\b/, [GBF], ['Condicionalidades']],
  [/\b(?:bloquead[oa]|suspens[oa]|cancelad[oa]|bloqueou|bloqueio)\b/, [BF26], ['Perguntas frequentes: o benefício foi bloqueado']],
  [/\b(?:prazo|data) (?:de|do|para) recurso\b|\brecurso\b.*\b(?:prazo|ate quando|ate que dia)\b/, [GBF, BF26], ['Cronograma de repercussão 2026 e prazo de recurso', 'Cronograma de repercussão 2026']],
  [/\b(?:recurso on line|recurso online|recurso no sicon)\b/, [GBF, BF26], ['Recurso on-line no Sicon', 'Recurso on-line (Sicon)']],
  [/\b(?:devolucao|devolver)\b.*\b(?:valores?|beneficio)\b/, [GBF, BF26], ['Devolução voluntária de valores']],
  [/\b(?:canais?|telefone|contato|0800|alo)\b.*\bbolsa familia\b|\bbolsa familia\b.*\b(?:canais?|telefone|contato|0800|atendimento)\b/, [GBF, BF26], ['Atendimento e contatos', 'Canais de atendimento do Bolsa Família']],
  [/\b(?:significa|sigla)\b.*\b(?:brc|bpi|bco|bva|bvg|bnb)\b|\bsiglas?\b/, [BF26], ['Siglas do Bolsa Família e do CadÚnico']]
];
const RE_FORMA_POLITICA = /^(?:qual(?:is)?\b|quant[oa]s?\b|quando\b|quem\b|onde\b|o que (?:e|sao)\b|como (?:se |eu )?(?:faz|faco|fazer|saca|sacar|cadastra|cadastrar|atualiza|atualizar|entra|entrar|recorre|recorrer|funciona|devolver|participar|conseguir)\b|de que\b|em que\b|ate quando\b|o beneficio\b|o bolsa\b)/;

export function respostaDePolitica(pergunta, base) {
  if (!Array.isArray(base) || !base.length) return null;
  const n = normalizar(String(pergunta == null ? '' : pergunta));
  const palavras = n ? n.split(' ').length : 0;
  if (palavras < 3 || palavras > MAX_PALAVRAS_PERGUNTA) return null;
  if (!RE_FORMA_POLITICA.test(n) || RE_PEDE_MAIS.test(n) || RE_TEMA_SENSIVEL.test(n)) return null;
  if (!ASSUNTO_PBF.test(n) && !/\b(?:beneficio|bloquead[oa]|suspens[oa]|cancelad[oa])\b/.test(n)) return null;
  if (/\b(?:bpc|loas|aluguel social|beneficio eventual|auxilio brasil|inss|aposentadoria|pensao)\b/.test(n)) return null;
  if (RE_OUTRO_LUGAR.test(n)) return null;
  const hit = POLITICAS.filter((f) => f[0].test(n));
  // Mais de uma seção possível = pergunta ambígua ou composta: a IA responde.
  if (hit.length !== 1) return null;
  const t = acharSecao(base, hit[0][1], hit[0][2]);
  if (!t || anoSemFonte(n, t)) return null;
  const rotulo = [t.titulo || t.doc, t.referencia].filter(Boolean).join(' — ');
  const tecnico = t.tipo && t.tipo !== 'norma';
  return {
    texto: '**' + rotulo + '**\n' + resumirTrechoLocal(t.texto, 1100) + '\n\n' + (tecnico ? 'Trecho de guia de orientação da base do Paulus (não é norma legal). Valores e prazos mudam: confirme no MDS.' : 'Trecho da base de normas do Paulus. Confira o texto oficial vigente.'),
    escolhidos: [{ trecho: t }]
  };
}

// ------------------------------------------------------------------ definição de sigla, direto da base

const RE_DEFINICAO = /^(?:o que (?:e|sao|significa|quer dizer)\b)/;
// Documentos que não servem de resposta direta: fichas de unidade (são da consulta) e mapa de lugares.
const RE_DOC_FORA = /^(?:argo-|mapa-boa-vista-osm|diretorio)/;
// Palavras de ligação e de pergunta: não precisam estar no trecho.
const VAZIAS = new Set(('qual quais quanto quantos quanta quantas como onde quando quem sobre mais para pela pelo pelas pelos entre desde ate essa esse isso ' +
  'esta este aquele aquela tem tinha existe existem sao foi eram sera pode podem deve ficam fica estao esta uma uns umas dizer significa quer ano anos ' +
  'diga fale cidade municipio capital').split(' '));
// 7 letras: "habitantes" (habitan) não casa com "habitacionais" (habitac)
const radical = (w) => w.slice(0, 7);

// Palavras de conteúdo da pergunta (sem as de ligação), reduzidas ao radical de 7 letras: "habitantes" e "habitante" casam.
function termosDaPergunta(n) {
  return Array.from(new Set(n.split(' ').filter((w) => w.length >= 4 && !VAZIAS.has(w)).map(radical)));
}

// "O que é X?": o trecho tem de DEFINIR X (X seguido de "é", "consiste", "constitui"... perto do começo), não só mencionar X.
const ARTIGOS = new Set('o a os as um uma de do da dos das'.split(' '));
function defineOTermo(trecho, n) {
  const palavras = n.replace(RE_DEFINICAO, ' ').split(' ').filter((w) => w.length >= 3 && !ARTIGOS.has(w));
  if (!palavras.length || palavras.length > 4) return false;
  const re = new RegExp('\\b' + palavras.join('\\s+(?:[a-z0-9]+\\s+){0,2}?') + '\\b(?:\\s+[a-z0-9]+){0,3}?\\s+(?:e|consiste|constitui|sao|compreende|define|significa|refere)\\b');
  return re.test(normalizar(String(trecho.texto || '').slice(0, 600)));
}

// O trecho responde esta pergunta? Todos os termos têm de aparecer no título ou no começo do trecho.
function trechoCobre(trecho, termos, lugar) {
  if (!termos.length) return false;
  const tudo = normalizar((trecho.titulo || '') + ' ' + (trecho.referencia || '') + ' ' + String(trecho.texto || '').slice(0, 320));
  if (lugar && tudo.indexOf(lugar) === -1) return false; // perguntou de Boa Vista: o trecho tem de ser de Boa Vista
  return termos.every((t) => tudo.indexOf(t) !== -1);
}

// achados: resultado de buscarFontes (já com "aderencia"). ctx: { analise, partes, sobreSi, rota }, do que o Worker já sabe do pedido.
// Só responde "o que é <SIGLA>?" (PAIF, CRAS, CREAS, BPC...): é uma entidade específica. Conceito genérico, caso, análise e outro
// idioma seguem para a IA; fora definição de sigla, a busca livre errava (artigo trocado), então só as tabelas curadas respondem sem IA.
export function respostaDaBase(pergunta, achados, ctx) {
  if (!Array.isArray(achados) || !achados.length) return null;
  const c = ctx || {};
  if (c.analise || c.sobreSi || c.rota || (c.partes || 0) >= 2) return null;
  const n = normalizar(String(pergunta == null ? '' : pergunta));
  const palavras = n ? n.split(' ').length : 0;
  if (palavras < 3 || palavras > MAX_PALAVRAS_PERGUNTA) return null;
  if (RE_PEDE_MAIS.test(n) || RE_TEMA_SENSIVEL.test(n)) return null;
  const definicao = RE_DEFINICAO.test(n);
  if (!definicao) return null;
  if (!/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,7}\b/.test(String(pergunta == null ? '' : pergunta))) return null;
  const lugar = /\bboa vista\b/.test(n) ? 'boa vista' : '';
  const termos = termosDaPergunta(n.replace(/\bboa vista\b/g, ' '));
  // Só os 3 primeiros resultados, de aderência alta, fora das fichas de unidade e que de fato definem o termo.
  const altas = achados.slice(0, 3).filter((a) => a && a.trecho && a.aderencia === 'alta' && !RE_DOC_FORA.test(String(a.trecho.doc || '')) &&
    trechoCobre(a.trecho, termos, lugar) && defineOTermo(a.trecho, n));
  if (!altas.length) return null;
  const escolhidos = [];
  const docs = new Set();
  for (const a of altas) {
    if (escolhidos.length >= 2) break;
    const d = a.trecho.doc || a.trecho.titulo;
    if (docs.has(d)) continue;
    docs.add(d);
    escolhidos.push(a);
  }
  const porTrecho = escolhidos.length === 1 ? TETO_TRECHO + 200 : TETO_TRECHO - 150;
  const blocos = escolhidos.map((a, i) => {
    const t = a.trecho;
    const rotulo = [t.titulo || t.doc, t.referencia].filter(Boolean).join(' — ');
    return (escolhidos.length > 1 ? (i + 1) + ') ' : '') + (rotulo ? '**' + rotulo + '**\n' : '') + resumirTrechoLocal(t.texto, porTrecho);
  });
  const tecnico = escolhidos.some((a) => a.trecho.tipo && a.trecho.tipo !== 'norma');
  return {
    texto: blocos.join('\n\n') + '\n\n' + (tecnico ? 'Trecho de material de apoio ou orientação técnica da base do Paulus (não é norma legal: orienta, não obriga). Confira o documento original.' : 'Trecho da base de normas do Paulus, sem interpretação do seu caso. Confira o texto oficial vigente.'),
    escolhidos: escolhidos
  };
}
