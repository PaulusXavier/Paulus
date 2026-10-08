// Converte o TEXTO de uma norma (copiado do site oficial ou extraído do PDF) em knowledge/documentos/NOME.md,
// já no formato que o Paulus lê: um trecho citável por artigo (ou por inciso/parágrafo, quando o artigo é longo).
//
// Uso:
//   node scripts/importar-norma.mjs norma.txt --doc loas-1993 --titulo "LOAS" \
//        --norma "Lei nº 8.742, de 7 de dezembro de 1993" --ano 1993
//   npm run build:conhecimento
//
// Opções: --max 700 (tamanho máximo de um trecho, em caracteres)  --manter-notas  --forcar (sobrescreve o .md)
//
// O que faz: acha cada "Art. N", pula títulos (CAPÍTULO, SEÇÃO...), números de página e artigos revogados/vetados,
// tira as notas editoriais "(Redação dada pela ...)" e junta as linhas quebradas do PDF.
// O que NÃO faz: não confere o conteúdo. Sempre leia o .md gerado ao lado do texto oficial.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const RE_ART = /^Art\.?\s*(\d+)\s*[ºo°]?(?:\s*-\s*([A-Z]{1,2}))?\s*(?:[.\-–—:]\s*)?(.*)$/;
const RE_PAR = /^(?:§\s*(\d+)\s*[ºo°]?|Par[aá]grafo\s+[uú]nico)\s*[.\-–—:]?\s*(.*)$/i;
const RE_INC = /^([IVXLC]+)\s*[-–—]\s*(.*)$/;
const RE_NOTA = /\s*\((?:Reda[cç][aã]o dada|Inclu[ií]d[oa]|Revogad[oa]|Vide|Regulamento|Vig[eê]ncia|Produ[cç][aã]o de efeito|Reda[cç][aã]o anterior|Vetado)[^)]*\)/gi;

function ordinal(n) { return Number(n) <= 9 ? n + 'º' : String(n); }

function ehTitulo(linha) {
  // CAPÍTULO I, SEÇÃO II, DO CONCEITO...: sem nenhuma letra minúscula
  return linha.length > 2 && !/[a-zà-ÿ]/.test(linha) && /[A-ZÀ-Ý]/.test(linha);
}

function dividirEmArtigos(texto, manterNotas, avisos) {
  const artigos = [];
  let atual = null;
  let hifen = 0;
  for (let bruta of texto.split(/\r?\n/)) {
    let linha = bruta.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!linha || /^\d{1,4}$/.test(linha) || ehTitulo(linha)) continue;
    if (!manterNotas) linha = linha.replace(RE_NOTA, '').trim();
    if (!linha) continue;
    if (/[A-Za-zÀ-ÿ]-$/.test(linha)) hifen++;
    const m = RE_ART.exec(linha);
    if (m) {
      atual = { num: m[1], suf: m[2] || '', linhas: [] };
      artigos.push(atual);
      if (m[3]) atual.linhas.push(m[3].trim());
      continue;
    }
    if (!atual) continue; // preâmbulo: ementa, "O PRESIDENTE DA REPÚBLICA..."
    atual.linhas.push(linha);
  }
  if (hifen) avisos.push(hifen + ' linha(s) terminam em hífen (palavra cortada no fim da linha do PDF). Procure "-" no .md e junte as palavras.');
  return artigos;
}

function agruparBlocos(linhas) {
  const caput = [];
  const itens = [];
  let atual = null;
  for (const linha of linhas) {
    let m;
    if ((m = RE_PAR.exec(linha))) {
      atual = { tipo: 'par', rotulo: m[1] ? '§ ' + ordinal(m[1]) : 'parágrafo único', linhas: [linha] };
      itens.push(atual);
    } else if ((m = RE_INC.exec(linha))) {
      if (atual && atual.tipo === 'par') atual.linhas.push(linha); // inciso de parágrafo fica no parágrafo
      else { atual = { tipo: 'inc', rotulo: m[1], linhas: [m[2]] }; itens.push(atual); }
    } else if (atual) atual.linhas.push(linha);
    else caput.push(linha);
  }
  return { caput: caput.join(' ').trim(), itens: itens };
}

export function converterNorma(texto, meta, opcoes) {
  const o = Object.assign({ max: 700, manterNotas: false }, opcoes || {});
  const avisos = [];
  const trechos = [];
  const artigos = dividirEmArtigos(String(texto), o.manterNotas, avisos);
  if (!artigos.length) throw new Error('Não encontrei nenhuma linha começando com "Art." no texto.');

  let ultimo = 0;
  for (const a of artigos) {
    const rotulo = 'art. ' + ordinal(a.num) + (a.suf ? '-' + a.suf : '');
    const inteiro = a.linhas.join(' ').replace(/\s+/g, ' ').trim();
    if (!inteiro || /^\(?\s*(revogado|vetado)/i.test(inteiro)) continue;
    if (Number(a.num) < ultimo && !a.suf) avisos.push(rotulo + ' aparece depois do art. ' + ultimo + ': confira se não é uma citação no meio do texto.');
    ultimo = Math.max(ultimo, Number(a.num));

    if (inteiro.length <= o.max) { trechos.push({ referencia: rotulo, texto: inteiro }); continue; }

    const { caput, itens } = agruparBlocos(a.linhas);
    const incisos = itens.filter(function (i) { return i.tipo === 'inc'; });
    if (!itens.length) {
      trechos.push({ referencia: rotulo, texto: inteiro });
      avisos.push(rotulo + ' é longo (' + inteiro.length + ' caracteres) e não tem incisos nem parágrafos para dividir.');
      continue;
    }
    if (caput && !incisos.length) trechos.push({ referencia: rotulo, texto: caput });
    for (const it of itens) {
      const corpo = it.linhas.join(' ').replace(/\s+/g, ' ').trim();
      if (!corpo || /^\(?\s*(revogado|vetado)/i.test(corpo)) continue;
      if (it.tipo === 'inc') {
        trechos.push({ referencia: rotulo + ', ' + it.rotulo, texto: (caput.replace(/\s*:\s*$/, '') + ' ' + corpo).trim() });
      } else {
        trechos.push({ referencia: rotulo + ', ' + it.rotulo, texto: corpo });
      }
    }
  }
  if (!trechos.length) throw new Error('Nenhum trecho com texto foi gerado.');
  const longos = trechos.filter(function (t) { return t.texto.length > o.max * 2; });
  if (longos.length) avisos.push(longos.length + ' trecho(s) com mais de ' + o.max * 2 + ' caracteres (a busca funciona melhor com trechos curtos).');

  const md = '---\n' +
    'doc: ' + meta.doc + '\ntitulo: ' + meta.titulo + '\nnorma: ' + meta.norma + '\nano: ' + meta.ano + '\n---\n\n' +
    '<!--\nGerado por scripts/importar-norma.mjs em ' + new Date().toISOString().slice(0, 10) + '.\n' +
    'CONFIRA cada trecho com o texto oficial antes de publicar.\n-->\n\n' +
    trechos.map(function (t) { return '## ' + t.referencia + '\n\n' + t.texto + '\n'; }).join('\n');
  return { md: md, trechos: trechos, avisos: avisos };
}

function lerArgumentos(argv) {
  const r = { arquivo: '', opcoes: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const nome = a.slice(2);
      if (nome === 'forcar' || nome === 'manter-notas') r.opcoes[nome] = true;
      else r.opcoes[nome] = argv[++i];
    } else if (!r.arquivo) r.arquivo = a;
  }
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { arquivo, opcoes } = lerArgumentos(process.argv.slice(2));
  const falta = ['doc', 'titulo', 'norma', 'ano'].filter(function (c) { return !opcoes[c]; });
  if (!arquivo || falta.length) {
    console.error('Uso: node scripts/importar-norma.mjs norma.txt --doc ID --titulo "Nome" --norma "Lei nº ..., de ..." --ano 2000\nFalta: ' + (arquivo ? '' : 'arquivo ') + falta.map(function (c) { return '--' + c; }).join(' '));
    process.exit(1);
  }
  const destino = join(RAIZ, 'knowledge', 'documentos', opcoes.doc + '.md');
  if (existsSync(destino) && !opcoes.forcar) { console.error(destino + ' já existe. Use --forcar para sobrescrever.'); process.exit(1); }
  const r = converterNorma(readFileSync(arquivo, 'utf8'), opcoes, { max: Number(opcoes.max) || 700, manterNotas: !!opcoes['manter-notas'] });
  writeFileSync(destino, r.md);
  console.log(r.trechos.length + ' trecho(s) gravados em knowledge/documentos/' + opcoes.doc + '.md');
  r.avisos.forEach(function (a) { console.log('ATENÇÃO: ' + a); });
  console.log('Próximo passo: leia o .md e rode  npm run build:conhecimento');
}
