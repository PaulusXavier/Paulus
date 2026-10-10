// Converte o TEXTO de um documento técnico (referências técnicas, cartilhas, orientações, resoluções longas do CFP...)
// em knowledge/documentos/NOME.md, no formato que o Paulus lê: trechos curtos, cada um com a seção e a página.
//
// Para LEIS e DECRETOS (que se dividem por "Art.") use scripts/importar-norma.mjs. Este aqui é para o que se
// organiza por capítulos e seções, sem artigos.
//
// Uso:
//   pdftotext referencias-cras.pdf referencias-cras.txt          (mantém uma "página" por \f; não use -layout em texto corrido)
//   node scripts/importar-documento.mjs referencias-cras.txt --doc cfp-ref-cras-2007 \
//        --titulo "Referências Técnicas para Atuação de Psicólogas(os) no CRAS/SUAS" \
//        --norma "CFP/CREPOP, Referências Técnicas para Atuação de Psicólogas(os) no CRAS/SUAS" --ano 2007 \
//        --tipo referencia --pacote psicologia --url https://...
//   npm run build:conhecimento
//
// Opções: --max 900 (tamanho máximo de um trecho)   --min 300 (junta parágrafos curtos até chegar perto disto)
//         --pagina-inicial N / --pagina-final N     (pula capa, sumário, referências; contam as páginas do PDF)
//         --deslocamento N   (página impressa = página do PDF - N; use quando a numeração impressa não começa na capa)
//         --sem-titulos      (não procura títulos: um só bloco corrido; use se os títulos saírem errados)
//         --sem-paginas      (não cita página)   --forcar (sobrescreve o .md)
//
// O que faz: tira cabeçalho e rodapé repetidos, números de página, linhas de sumário (....... 45), junta linhas quebradas e
// palavras cortadas pelo hífen, acha títulos (CAPÍTULO, 2.3 Título, TÍTULO EM MAIÚSCULAS) e corta em trechos por parágrafo.
// O que NÃO faz: não confere o conteúdo. Sempre abra o .md ao lado do PDF e confira POR AMOSTRAGEM
// (início, meio e fim; uma página com tabela; uma com nota de rodapé). Depois troque "revisao: pendente" por "conferido".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAIUSCULA = 'A-ZÀ-ÝÇ';
const MINUSCULA = 'a-zà-ÿç';
const RE_CAP = /^(CAP[IÍ]TULO|PARTE|SE[CÇ][AÃ]O|ANEXO|UNIDADE|M[OÓ]DULO)\s+([0-9IVXLC]+|[ÚU]NICO)\b\.?\s*(?:[-–—:.]\s*)?(.*)$/i;
const RE_NUM = new RegExp('^(\\d{1,2}(?:\\.\\d{1,2}){0,3})\\.?\\s+([' + MAIUSCULA + '].{2,98})$');
const RE_PAGINA = /^(?:p[áa]g(?:ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*(?:de\s*\d{1,4})?\s*[-–—]?$/i;
const RE_SUMARIO = /(?:\.\s?){4,}\s*\d{1,4}\s*$|\.{4,}\s*\d{1,4}\s*$/;
const RE_MARCADOR = /^(?:[•●○▪■◦·*\-–—]\s+|\(?[a-z]\)\s+|\(?\d{1,2}\)\s+)/;

export function limparLinha(bruta) {
  return bruta
    .replace(/\u00ad/g, '')
    .replace(/\ufb01/g, 'fi').replace(/\ufb02/g, 'fl').replace(/\ufb00/g, 'ff').replace(/\ufb03/g, 'ffi').replace(/\ufb04/g, 'ffl')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, '')
    .replace(/<!--|-->/g, ' ')
    .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formaDoRodape(linha) {
  return linha.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

function proporcaoMaiuscula(s) {
  const letras = s.replace(new RegExp('[^' + MAIUSCULA + MINUSCULA + ']', 'g'), '');
  if (!letras.length) return 0;
  return letras.replace(new RegExp('[^' + MAIUSCULA + ']', 'g'), '').length / letras.length;
}

// Cabeçalho/rodapé: linha (sem os números) que aparece no topo ou no pé de muitas páginas.
export function acharRepetidas(paginas) {
  const contagem = new Map();
  for (const linhas of paginas) {
    const nomes = new Set();
    const uteis = linhas.filter(Boolean);
    for (const l of uteis.slice(0, 3).concat(uteis.slice(-3))) nomes.add(formaDoRodape(l));
    for (const n of nomes) contagem.set(n, (contagem.get(n) || 0) + 1);
  }
  const comTexto = paginas.filter(function (l) { return l.some(Boolean); }).length;
  const minimo = Math.max(3, Math.ceil(comTexto * 0.3));
  const repetidas = new Set();
  // cabeçalho e rodapé são linhas curtas; uma frase longa repetida no topo de várias páginas é texto, não cabeçalho
  for (const [n, c] of contagem) if (c >= minimo && n.length > 2 && n.length <= 90) repetidas.add(n);
  return repetidas;
}

function ehTituloMaiusculo(linha) {
  if (linha.length < 5 || linha.length > 90) return false;
  if (RE_MARCADOR.test(linha) && !/^\d/.test(linha)) return false;
  if (/[.;,]$/.test(linha)) return false;
  const palavras = linha.split(' ').length;
  const letras = linha.replace(new RegExp('[^' + MAIUSCULA + MINUSCULA + ']', 'g'), '').length;
  return letras >= 5 && (palavras >= 2 || letras >= 8) && proporcaoMaiuscula(linha) >= 0.85;
}

// Tira cabeçalho/rodapé repetidos, número de página e linhas de sumário. `paginas` = lista de listas de linhas já limpas.
function limparPaginas(paginas, temPaginas) {
  const repetidas = temPaginas ? acharRepetidas(paginas) : new Set();
  let removidasSumario = 0;
  const saida = paginas.map(function (linhas) {
    const uteisIdx = [];
    linhas.forEach(function (l, i) { if (l) uteisIdx.push(i); });
    const bordas = new Set(uteisIdx.slice(0, 3).concat(uteisIdx.slice(-3)));
    return linhas.map(function (l, i) {
      if (!l) return '';
      if (RE_PAGINA.test(l)) return '';
      if (RE_SUMARIO.test(l)) { removidasSumario++; return ''; }
      if (bordas.has(i) && repetidas.has(formaDoRodape(l))) return '';
      return l;
    });
  });
  return { paginas: saida, removidasSumario: removidasSumario };
}

// Só a limpeza, devolvendo texto: serve para leis e resoluções em PDF (modo "norma"), que também trazem cabeçalho e rodapé.
export function limparTexto(texto) {
  const brutas = String(texto).replace(/\r\n?/g, '\n').split('\f');
  if (brutas.length > 1 && brutas[brutas.length - 1].trim() === '') brutas.pop();
  const limpo = limparPaginas(brutas.map(function (p) { return p.split('\n').map(limparLinha); }), brutas.length > 1);
  return limpo.paginas.map(function (l) { return l.join('\n'); }).join('\n\n');
}

// ctx: { isolada: linha sozinha entre linhas em branco, inicio: vem depois de linha em branco, lista: faz parte de uma lista numerada }
function classificar(linha, ctx, estado) {
  ctx = ctx || {};
  estado = estado || { ultimoNumero: 0 }; // numeração dos títulos já aceitos (vale entre páginas)
  let m = RE_CAP.exec(linha);
  if (m && linha.length <= 100 && !/[.;,]$/.test(linha)) {
    const resto = m[3] || '';
    // "Parte 2 do documento descreve..." no começo de uma frase não é título: só vale em MAIÚSCULAS, sozinho ou sem texto depois
    if (!resto || m[1] === m[1].toUpperCase() || (ctx.isolada && resto.length <= 80)) {
      estado.ultimoNumero = 0; // novo capítulo/anexo: a numeração recomeça
      return { nivel: 1, rotulo: (m[1] + ' ' + m[2]).toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }), titulo: resto };
    }
  }
  m = RE_NUM.exec(linha);
  if (m && !/[.;:,]$/.test(m[2])) {
    const nivel = m[1].split('.').length;
    const palavras = m[2].split(' ').length;
    const maiusc = proporcaoMaiuscula(m[2]) >= 0.6;
    // "1. Realizar escuta" é item de lista; "2.3 Atuação no PAIF" ou "1. INTRODUÇÃO" é título
    // item solto "1. Escuta individual" só vira título se continua a numeração dos títulos (2 → 3), não se volta ao 1
    const n = Number(m[1].split('.')[0]);
    const continua = n === estado.ultimoNumero + 1 || n === estado.ultimoNumero + 2;
    if (maiusc || (!ctx.lista && ((nivel > 1 && ctx.inicio && palavras <= 12) || (nivel === 1 && ctx.isolada && palavras <= 8 && continua)))) {
      estado.ultimoNumero = n;
      return { nivel: nivel, rotulo: m[1], titulo: m[2] };
    }
    return null;
  }
  if (ehTituloMaiusculo(linha)) return { nivel: 1, rotulo: '', titulo: linha };
  return null;
}

// Itens numerados seguidos (1., 2., 3. ...) na mesma página são lista, não títulos.
function indicesDeLista(linhas) {
  const cands = [];
  linhas.forEach(function (l, i) {
    const m = /^(\d{1,2})\.?\s+\S/.exec(l);
    if (m && !/^\d{1,2}\.\d/.test(l) && proporcaoMaiuscula(l.replace(/^\d{1,2}\.?\s+/, '')) < 0.6) cands.push({ i: i, n: Number(m[1]) });
  });
  const lista = new Set();
  let corrida = [];
  const fechar = function () { if (corrida.length >= 3) corrida.forEach(function (c) { lista.add(c.i); }); corrida = []; };
  for (const c of cands) {
    if (corrida.length && c.n === corrida[corrida.length - 1].n + 1) corrida.push(c);
    else { fechar(); corrida = [c]; }
  }
  fechar();
  return lista;
}

function tituloBonito(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (proporcaoMaiuscula(s) < 0.85) return s;
  const L = 'A-Za-zÀ-ÿ';
  const palavra = function (lista) { return new RegExp('(?<![' + L + '])(' + lista + ')(?![' + L + '])', 'g'); };
  return s.toLowerCase().replace(/(^|[\s(/-])([a-zà-ÿç])/g, function (_, a, b) { return a + b.toUpperCase(); })
    // preposições ficam minúsculas e siglas conhecidas ficam em maiúsculas
    .replace(palavra('Da|De|Do|Das|Dos|E|Em|Na|No|Nas|Nos|Para|Por|Com|A|O|As|Os|Às|Ao|Aos'), function (x) { return x.toLowerCase(); })
    .replace(palavra('Suas|Sus|Cras|Creas|Paif|Paefi|Scfv|Cfp|Crp|Crepop|Caps|Raps|Loas|Cnas|Mds|Eca|Pnas|Nob|Rh|Bpc|Pbf'), function (x) { return x.toUpperCase(); })
    .replace(/^./, function (c) { return c.toUpperCase(); });
}

function encurtar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return corte.replace(/\s+\S*$/, '') + '…';
}

// Junta as linhas de uma página em parágrafos. `largura` = tamanho típico de uma linha cheia.
function paragrafosDaPagina(linhasBrutas, largura, ctx) {
  const blocos = []; // { tipo:'titulo'|'texto', ... }
  let atual = null;
  const fechar = function () { if (atual) { blocos.push(atual); atual = null; } };
  let anterior = '';
  const emLista = indicesDeLista(linhasBrutas);
  for (let i = 0; i < linhasBrutas.length; i++) {
    const linha = linhasBrutas[i];
    if (!linha) { fechar(); anterior = ''; continue; }
    if (/^(?:SUM[ÁA]RIO|[ÍI]NDICE|CONTE[ÚU]DO)$/i.test(linha)) { fechar(); anterior = ''; continue; }
    const inicio = i === 0 || !linhasBrutas[i - 1];
    const t = classificar(linha, { inicio: inicio, isolada: inicio && (i === linhasBrutas.length - 1 || !linhasBrutas[i + 1]), lista: emLista.has(i) }, ctx);
    if (t) {
      fechar();
      const ultimo = blocos[blocos.length - 1];
      // "CAPÍTULO 2" seguido de "ATUAÇÃO NO CRAS" vira um título só
      if (ultimo && ultimo.tipo === 'titulo' && ultimo.nivel === t.nivel && !ultimo.titulo && !t.rotulo) ultimo.titulo = t.titulo;
      else if (ultimo && ultimo.tipo === 'titulo' && ultimo.nivel === 1 && !ultimo.rotulo && !t.rotulo && t.nivel === 1) ultimo.titulo += ' ' + t.titulo;
      else blocos.push({ tipo: 'titulo', nivel: t.nivel, rotulo: t.rotulo, titulo: t.titulo });
      anterior = '';
      continue;
    }
    const comecaItem = RE_MARCADOR.test(linha);
    const quebraPorFrase = anterior && /[.!?:;]$/.test(anterior) && anterior.length < largura * 0.7 && new RegExp('^[' + MAIUSCULA + '"“(]').test(linha);
    if (atual && (comecaItem || quebraPorFrase)) fechar();
    if (!atual) atual = { tipo: 'texto', linhas: [] };
    if (atual.linhas.length && /[A-Za-zÀ-ÿ]-$/.test(atual.linhas[atual.linhas.length - 1]) && new RegExp('^[' + MINUSCULA + ']').test(linha)) {
      // palavra cortada no fim da linha: junta sem o hífen
      atual.linhas[atual.linhas.length - 1] = atual.linhas[atual.linhas.length - 1].slice(0, -1) + linha;
      ctx.hifens++;
    } else atual.linhas.push(linha);
    anterior = linha;
  }
  fechar();
  return blocos.map(function (b) {
    return b.tipo === 'texto' ? { tipo: 'texto', texto: b.linhas.join(' ').replace(/\s+/g, ' ').trim() } : b;
  }).filter(function (b) { return b.tipo === 'titulo' || b.texto; });
}

function partirEmFrases(texto, max) {
  if (texto.length <= max) return [texto];
  const frases = texto.split(new RegExp('(?<=[.!?;:])\\s+(?=[' + MAIUSCULA + '0-9"“(•\\-–])'));
  const partes = [];
  let cur = '';
  const empurrar = function () { if (cur) { partes.push(cur); cur = ''; } };
  for (const f of frases) {
    if (f.length > max * 1.5) {
      empurrar();
      // frase gigante (tabela, lista sem pontuação): corta nas palavras
      let resto = f;
      while (resto.length > max) {
        let corte = resto.lastIndexOf(' ', max);
        if (corte < max * 0.5) corte = max;
        partes.push(resto.slice(0, corte).trim());
        resto = resto.slice(corte).trim();
      }
      cur = resto;
      continue;
    }
    if (cur && (cur + ' ' + f).length > max) empurrar();
    cur = cur ? cur + ' ' + f : f;
  }
  empurrar();
  return partes;
}

export function converterDocumento(texto, meta, opcoes) {
  const o = Object.assign({ max: 900, min: 300, semTitulos: false, semPaginas: false, paginaInicial: 1, paginaFinal: Infinity, deslocamento: 0 }, opcoes || {});
  const avisos = [];
  const bruto = String(texto).replace(/\r\n?/g, '\n');
  const temPaginas = bruto.includes('\f');
  const paginasBrutas = bruto.split('\f');
  if (paginasBrutas.length > 1 && paginasBrutas[paginasBrutas.length - 1].trim() === '') paginasBrutas.pop();

  // 1) limpar linha a linha
  let paginas = paginasBrutas.map(function (p) { return p.split('\n').map(limparLinha); });
  const totalPaginas = paginas.length;
  if (temPaginas && !o.semPaginas) {
    const fim = Math.min(o.paginaFinal, totalPaginas);
    paginas = paginas.map(function (linhas, i) { return (i + 1 >= o.paginaInicial && i + 1 <= fim) ? linhas : []; });
  }

  // 2) sinais de PDF escaneado / sem texto
  const comTexto = paginas.filter(function (l) { return l.join('').length > 80; }).length;
  const caracteres = paginas.reduce(function (n, l) { return n + l.join('').length; }, 0);
  if (!caracteres) throw new Error('O texto está vazio. Se o arquivo é um PDF escaneado (imagem), é preciso fazer OCR antes (ex.: ocrmypdf entrada.pdf saida.pdf) e extrair o texto de novo.');
  if (temPaginas && comTexto < paginas.filter(function (l) { return l.length; }).length * 0.6) avisos.push('Muitas páginas quase sem texto (' + comTexto + ' de ' + paginas.filter(function (l) { return l.length; }).length + '). Pode ser PDF escaneado ou com páginas de imagem: confira se nada ficou de fora.');
  if (/\ufffd/.test(bruto)) avisos.push('O texto tem caracteres quebrados (�). A extração do PDF perdeu acentos: tente outra ferramenta ou OCR.');

  // 3) tirar cabeçalho, rodapé, número de página e sumário
  const limpo = limparPaginas(paginas, temPaginas);
  paginas = limpo.paginas;
  const removidasSumario = limpo.removidasSumario;
  if (removidasSumario) avisos.push(removidasSumario + ' linha(s) de sumário (com pontinhos e número) foram removidas. Se o sumário em texto corrido ainda aparece no começo do .md, apague esses trechos ou use --pagina-inicial.');

  // 4) largura típica de uma linha cheia (para saber onde um parágrafo termina)
  const tamanhos = [];
  for (const linhas of paginas) for (const l of linhas) if (l.length > 30) tamanhos.push(l.length);
  tamanhos.sort(function (a, b) { return a - b; });
  const largura = tamanhos.length ? tamanhos[Math.floor(tamanhos.length * 0.8)] : 80;

  // 5) blocos (títulos e parágrafos) com a página de cada um
  const ctx = { hifens: 0, ultimoNumero: 0 };
  const itens = []; // { tipo, ..., pagina }
  paginas.forEach(function (linhas, i) {
    const pagina = temPaginas ? i + 1 : 0;
    // a página sem linha em branco entre parágrafos continua o texto da anterior: tratamos ao juntar abaixo
    for (const b of paragrafosDaPagina(linhas, largura, ctx)) itens.push(Object.assign({ pagina: pagina }, b));
  });
  if (ctx.hifens) avisos.push(ctx.hifens + ' palavra(s) cortada(s) pelo hífen foram juntadas. Se houver palavra composta de verdade (ex.: "guarda-chuva" no fim da linha), ela pode ter perdido o hífen.');

  // 6) parágrafos que atravessam a quebra de página voltam a ser um só
  const unidos = [];
  for (const it of itens) {
    const ult = unidos[unidos.length - 1];
    if (it.tipo === 'texto' && ult && ult.tipo === 'texto' && ult.pagina !== it.pagina && !/[.!?:;"”)]$/.test(ult.texto) && new RegExp('^[' + MINUSCULA + ']').test(it.texto)) {
      ult.texto += ' ' + it.texto;
      ult.paginaFim = it.pagina;
    } else unidos.push(Object.assign({}, it, { paginaFim: it.pagina }));
  }

  // 7) seções e trechos
  let cap = ''; // "Capítulo 2 Atuação no CRAS"
  let sub = ''; // "2.3 Atuação no PAIF"
  let achouTitulo = false;
  let numTitulos = 0;
  const trechos = [];
  let cur = null;
  const pag = function (n) { return n - o.deslocamento; };
  const rotuloSecao = function () { return [cap, sub].filter(Boolean).join(', '); };
  const fecharTrecho = function () {
    if (!cur || !cur.partes.length) { cur = null; return; }
    trechos.push({ secao: cur.secao, p1: cur.p1, p2: cur.p2, texto: cur.partes.join(' ').replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim() });
    cur = null;
  };
  const acrescentar = function (texto, p1, p2) {
    if (!cur) cur = { secao: rotuloSecao(), p1: p1, p2: p2, partes: [], tam: 0 };
    if (cur.tam && cur.tam + texto.length + 1 > o.max) { fecharTrecho(); cur = { secao: rotuloSecao(), p1: p1, p2: p2, partes: [], tam: 0 }; }
    cur.partes.push(texto);
    cur.tam += texto.length + 1;
    cur.p2 = p2;
    if (cur.tam >= o.min) fecharTrecho();
  };

  for (const it of unidos) {
    if (it.tipo === 'titulo' && !o.semTitulos) {
      fecharTrecho();
      achouTitulo = true;
      numTitulos++;
      const nome = ((it.rotulo ? it.rotulo + ' ' : '') + tituloBonito(it.titulo)).trim();
      if (it.nivel === 1) { cap = encurtar(nome || cap, 70); sub = ''; }
      else sub = encurtar(nome || sub, 70);
      continue;
    }
    if (it.tipo === 'titulo') { acrescentar((it.rotulo ? it.rotulo + ' ' : '') + it.titulo, it.pagina, it.pagina); continue; }
    for (const parte of partirEmFrases(it.texto, o.max)) acrescentar(parte, it.pagina, it.paginaFim || it.pagina);
  }
  fecharTrecho();
  if (!trechos.length) throw new Error('Nenhum trecho com texto foi gerado.');
  if (numTitulos > trechos.length * 1.5 && numTitulos > 20) avisos.push('Achei ' + numTitulos + ' "títulos" para ' + trechos.length + ' trechos: provavelmente há linhas em MAIÚSCULAS ou numeradas que não são títulos (legendas, listas). Confira as referências ou use --sem-titulos.');
  if (!achouTitulo && !o.semTitulos) avisos.push('Não achei nenhum título. Os trechos vão citar só a página. Se o documento tem capítulos, confira se o texto veio com os títulos em linhas separadas.');

  // 8) referências: "seção, p. N" — repetidas ganham "(parte n)"
  const vistas = {};
  for (const t of trechos) {
    const partesRef = [];
    if (t.secao) partesRef.push(t.secao);
    if (temPaginas && !o.semPaginas) {
      const a = pag(t.p1), b = pag(t.p2);
      partesRef.push(a === b || !b ? 'p. ' + a : 'p. ' + a + '-' + b);
    }
    t.referencia = partesRef.join(', ') || 'trecho ' + (trechos.indexOf(t) + 1);
    vistas[t.referencia] = (vistas[t.referencia] || 0) + 1;
    if (vistas[t.referencia] > 1) t.referencia += ' (parte ' + vistas[t.referencia] + ')';
  }

  // 9) conferências finais
  const curtos = trechos.filter(function (t) { return t.texto.length < 80; });
  if (curtos.length > trechos.length * 0.1) avisos.push(curtos.length + ' trecho(s) com menos de 80 caracteres (títulos soltos, legendas ou lixo de tabela). Dê uma olhada: ' + curtos.slice(0, 2).map(function (t) { return '"' + t.texto.slice(0, 40) + '"'; }).join(', ') + '.');
  const longos = trechos.filter(function (t) { return t.texto.length > o.max * 1.5; });
  if (longos.length) avisos.push(longos.length + ' trecho(s) com mais de ' + Math.round(o.max * 1.5) + ' caracteres.');
  if (temPaginas && comTexto > 0 && trechos.length < comTexto * 0.5) avisos.push('Poucos trechos para ' + comTexto + ' páginas com texto: pode haver páginas que não foram lidas (colunas, tabelas ou imagens). Confira.');
  const quebrados = trechos.filter(function (t) { return /(?:[A-Za-zÀ-ÿ] ){5,}/.test(t.texto); });
  if (quebrados.length) avisos.push(quebrados.length + ' trecho(s) com letras separadas por espaço (efeito de fonte ou tabela do PDF). Ex.: "' + quebrados[0].texto.slice(0, 40) + '".');

  const hoje = new Date().toISOString().slice(0, 10);
  const cab = ['---', 'doc: ' + meta.doc, 'titulo: ' + meta.titulo, 'norma: ' + meta.norma, 'ano: ' + meta.ano,
    'tipo: ' + (meta.tipo || 'referencia')];
  if (meta.pacote) cab.push('pacote: ' + meta.pacote);
  if (meta.url) cab.push('url: ' + meta.url);
  cab.push('revisao: pendente', '---');
  const md = cab.join('\n') + '\n\n' +
    '<!--\nGerado por scripts/importar-documento.mjs em ' + hoje + (temPaginas && !o.semPaginas ? ' (páginas = ' + (o.deslocamento ? 'página do PDF menos ' + o.deslocamento : 'páginas do PDF') + ')' : '') + '.\n' +
    'CONFIRA por amostragem com o documento original e troque "revisao: pendente" por "conferido".\n-->\n\n' +
    trechos.map(function (t) { return '## ' + t.referencia + '\n\n' + t.texto + '\n'; }).join('\n');
  return { md: md, trechos: trechos, avisos: avisos, paginas: temPaginas ? totalPaginas : 0 };
}

// Mostra as seções achadas, para a pessoa ver de relance se os títulos foram bem reconhecidos.
export function resumoDaEstrutura(trechos) {
  const secoes = [];
  for (const t of trechos) { const s = t.referencia.replace(/, p\. [\d-]+(?: \(parte \d+\))?$/, ''); if (secoes[secoes.length - 1] !== s) secoes.push(s); }
  const mostrar = secoes.slice(0, 8).map(function (s) { return '  · ' + s; }).join('\n');
  return 'Seções reconhecidas: ' + secoes.length + (secoes.length ? '\n' + mostrar + (secoes.length > 8 ? '\n  · …' : '') : '');
}

function lerArgumentos(argv) {
  const r = { arquivo: '', opcoes: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const nome = a.slice(2);
      if (['forcar', 'sem-titulos', 'sem-paginas'].includes(nome)) r.opcoes[nome] = true;
      else r.opcoes[nome] = argv[++i];
    } else if (!r.arquivo) r.arquivo = a;
  }
  return r;
}

export function opcoesDaLinha(op) {
  return {
    max: Number(op.max) || 900,
    min: Number(op.min) || 300,
    paginaInicial: Number(op['pagina-inicial']) || 1,
    paginaFinal: Number(op['pagina-final']) || Infinity,
    deslocamento: Number(op.deslocamento) || 0,
    semTitulos: !!op['sem-titulos'],
    semPaginas: !!op['sem-paginas']
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { arquivo, opcoes } = lerArgumentos(process.argv.slice(2));
  const falta = ['doc', 'titulo', 'norma', 'ano'].filter(function (c) { return !opcoes[c]; });
  if (!arquivo || falta.length) {
    console.error('Uso: node scripts/importar-documento.mjs documento.txt --doc ID --titulo "Nome" --norma "Órgão, publicação" --ano 2007 [--tipo referencia] [--pacote psicologia] [--url https://...]\nFalta: ' + (arquivo ? '' : 'arquivo ') + falta.map(function (c) { return '--' + c; }).join(' '));
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opcoes.doc)) { console.error('--doc só pode ter letras minúsculas, números e hífen.'); process.exit(1); }
  if (opcoes.tipo && !['norma', 'referencia', 'apoio'].includes(opcoes.tipo)) { console.error('--tipo deve ser norma, referencia ou apoio.'); process.exit(1); }
  if (opcoes.url && !/^https?:\/\//.test(opcoes.url)) { console.error('--url deve começar com http:// ou https://'); process.exit(1); }
  const destino = join(RAIZ, 'knowledge', 'documentos', opcoes.doc + '.md');
  if (existsSync(destino) && !opcoes.forcar) { console.error(destino + ' já existe. Use --forcar para sobrescrever.'); process.exit(1); }
  const r = converterDocumento(readFileSync(arquivo, 'utf8'), opcoes, opcoesDaLinha(opcoes));
  writeFileSync(destino, r.md);
  console.log(r.trechos.length + ' trecho(s)' + (r.paginas ? ' de ' + r.paginas + ' página(s)' : '') + ' gravados em knowledge/documentos/' + opcoes.doc + '.md');
  console.log(resumoDaEstrutura(r.trechos));
  r.avisos.forEach(function (a) { console.log('ATENÇÃO: ' + a); });
  console.log('Próximo passo: confira por amostragem e rode  npm run build:conhecimento');
}
