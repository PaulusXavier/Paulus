// Olha os PDFs/TXTs de uma pasta ANTES de importar e diz o que há em cada um:
// se é lei (modo "norma") ou documento por capítulos (modo "documento"), onde acaba o sumário, qual cabeçalho/rodapé
// se repete, quantos trechos sairiam e se o PDF é escaneado (sem texto).
//
//   npm run inspecionar -- knowledge/entrada              mostra o relatório
//   npm run inspecionar -- knowledge/entrada --rascunho   também grava manifesto.rascunho.json (você completa norma, ano e tipo)
//
// Não grava nada em knowledge/documentos. PDFs precisam do `pdftotext` (poppler-utils).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { converterDocumento, acharRepetidas, limparLinha } from './importar-documento.mjs';
import { textoDoArquivo } from './ingerir.mjs';

const RE_SUMARIO = /(?:\.\s?){4,}\s*\d{1,4}\s*$|\.{4,}\s*\d{1,4}\s*$/;
const RE_ART = /^Art\.?\s*\d+/;

export function slugDoNome(nome) {
  return String(nome || '')
    .replace(/\.[A-Za-z0-9]{2,4}$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

// Título gravado nos metadados do PDF costuma ser lixo ("untitled", "Microsoft Word - arquivo.doc").
export function tituloUtil(titulo) {
  const t = String(titulo == null ? '' : titulo).trim();
  if (t.length < 4) return '';
  if (/^(untitled|sem t[ií]tulo|document\d*|documento\d*|slide\d*)$/i.test(t)) return '';
  if (/^microsoft (word|powerpoint|excel)\b/i.test(t)) return '';
  if (/\.(docx?|pdf|indd|txt|odt|rtf|pptx?)$/i.test(t)) return '';
  return t;
}

export function analisarTexto(texto, nomeArquivo, info) {
  const inf = info || {};
  const avisos = [];
  const bruto = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n');
  const temPaginas = bruto.includes('\f');
  const brutas = bruto.split('\f');
  if (brutas.length > 1 && brutas[brutas.length - 1].trim() === '') brutas.pop();
  const paginas = brutas.map(function (p) { return p.split('\n').map(limparLinha); });
  const caracteres = paginas.reduce(function (n, l) { return n + l.join('').length; }, 0);
  const total = inf.paginas || (temPaginas ? paginas.length : 0);
  const titulo = tituloUtil(inf.titulo);
  const docSugerido = slugDoNome(titulo) || slugDoNome(nomeArquivo);
  const base = { arquivo: nomeArquivo, titulo: titulo, docSugerido: docSugerido, paginas: total, avisos: avisos };

  const comTexto = paginas.filter(function (l) { return l.join('').length > 80; }).length;
  if (!caracteres || (temPaginas && comTexto < paginas.length * 0.2)) {
    avisos.push('PDF escaneado ou sem texto (' + comTexto + ' de ' + paginas.length + ' páginas com texto). Faça OCR antes (ocrmypdf entrada.pdf saida.pdf).');
    return Object.assign(base, { escaneado: true, modoSugerido: '', paginasDeSumario: [], paginaInicialSugerida: 1, cabecalhoRodapeRepetido: [], simulacao: { trechos: 0 } });
  }

  const linhas = [].concat.apply([], paginas);
  const artigos = linhas.filter(function (l) { return RE_ART.test(l); }).length;
  const modoSugerido = artigos >= 10 ? 'norma' : 'documento';

  // sumário: página com 3 ou mais linhas "Título ....... 12"
  const paginasDeSumario = [];
  paginas.forEach(function (l, i) { if (l.filter(function (x) { return RE_SUMARIO.test(x); }).length >= 3) paginasDeSumario.push(i + 1); });
  let paginaInicialSugerida = 1;
  while (paginasDeSumario.includes(paginaInicialSugerida) || (paginaInicialSugerida < Math.max(0, ...paginasDeSumario) && paginaInicialSugerida < 30)) paginaInicialSugerida++;
  if (!paginasDeSumario.length) paginaInicialSugerida = 1;

  const repetidas = temPaginas ? Array.from(acharRepetidas(paginas)) : [];

  let simulacao = { trechos: 0 };
  try {
    if (modoSugerido === 'documento') {
      const r = converterDocumento(bruto, { doc: docSugerido || 'doc', titulo: titulo || nomeArquivo, norma: 'x', ano: '2000' }, { paginaInicial: paginaInicialSugerida });
      simulacao = { trechos: r.trechos.length };
      r.avisos.forEach(function (a) { avisos.push(a); });
    } else simulacao = { trechos: artigos };
  } catch (e) { avisos.push('Simulação da importação falhou: ' + e.message); }

  if (!titulo) avisos.push('O PDF não traz um título útil nos metadados: confira o "titulo" no manifesto.');
  return Object.assign(base, { escaneado: false, modoSugerido: modoSugerido, paginasDeSumario: paginasDeSumario, paginaInicialSugerida: paginaInicialSugerida, cabecalhoRodapeRepetido: repetidas, simulacao: simulacao });
}

// Rascunho do manifesto: só quem tem texto. "norma" e "ano" ficam em branco DE PROPÓSITO (o validador recusa até você preencher):
// quem emitiu o documento e o ano da edição precisam vir do próprio documento, não de um palpite.
export function rascunhoDoManifesto(analises) {
  return analises.filter(function (a) { return !a.escaneado; }).map(function (a) {
    const e = {
      arquivo: a.arquivo,
      doc: a.docSugerido,
      titulo: a.titulo || String(a.arquivo).replace(/\.[A-Za-z0-9]{2,4}$/, ''),
      norma: '',
      ano: '',
      tipo: a.modoSugerido === 'norma' ? 'norma' : 'referencia'
    };
    if (a.modoSugerido === 'norma') e.modo = 'norma';
    else if (a.paginaInicialSugerida > 1) e.paginaInicial = a.paginaInicialSugerida;
    return e;
  });
}

function metadadosDoPdf(caminho) {
  try {
    const saida = execFileSync('pdfinfo', [caminho], { encoding: 'utf8' });
    const t = /^Title:\s*(.*)$/m.exec(saida), p = /^Pages:\s*(\d+)/m.exec(saida);
    return { titulo: t ? t[1] : '', paginas: p ? Number(p[1]) : 0 };
  } catch (e) { return {}; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const pasta = args.find(function (a) { return a.indexOf('--') !== 0; }) || join(fileURLToPath(import.meta.url), '..', '..', 'knowledge', 'entrada');
  const arquivos = readdirSync(pasta).filter(function (f) { return /\.(pdf|txt)$/i.test(f); }).sort();
  if (!arquivos.length) { console.error('Nenhum PDF ou TXT em ' + pasta); process.exit(1); }
  const analises = [];
  for (const f of arquivos) {
    try {
      const a = analisarTexto(textoDoArquivo(join(pasta, f)), f, /\.pdf$/i.test(f) ? metadadosDoPdf(join(pasta, f)) : {});
      analises.push(a);
      console.log('\n' + f + (a.paginas ? ' (' + a.paginas + ' páginas)' : ''));
      if (a.escaneado) { a.avisos.forEach(function (x) { console.log('  ATENÇÃO: ' + x); }); continue; }
      console.log('  modo sugerido: ' + a.modoSugerido + ' | trechos estimados: ' + a.simulacao.trechos + ' | doc: ' + a.docSugerido);
      if (a.paginasDeSumario.length) console.log('  sumário nas páginas ' + a.paginasDeSumario.join(', ') + ' → paginaInicial ' + a.paginaInicialSugerida);
      if (a.cabecalhoRodapeRepetido.length) console.log('  cabeçalho/rodapé repetido: ' + a.cabecalhoRodapeRepetido.slice(0, 3).join(' | '));
      a.avisos.forEach(function (x) { console.log('  ATENÇÃO: ' + x); });
    } catch (e) { console.error('\n' + f + ': ERRO ' + e.message); }
  }
  if (args.includes('--rascunho')) {
    const destino = join(pasta, 'manifesto.rascunho.json');
    writeFileSync(destino, JSON.stringify(rascunhoDoManifesto(analises), null, 2) + '\n');
    console.log('\nRascunho gravado em ' + destino + '. Complete "norma" e "ano" de cada item, confira o resto e renomeie para manifesto.json.');
  }
}
