// Importa VÁRIOS documentos de uma vez, a partir de knowledge/entrada/manifesto.json.
//
//   1. Ponha os PDFs (ou .txt) em knowledge/entrada/
//   2. Descreva cada um em knowledge/entrada/manifesto.json (veja manifesto.exemplo.json e knowledge/entrada/LEIA-ME.md)
//   3. npm run ingerir            (cria knowledge/documentos/<doc>.md para cada entrada nova)
//   4. confira por amostragem, depois: npm run build:conhecimento && npm test
//
// PDFs são lidos com o programa `pdftotext` (pacote poppler-utils; no Windows, "poppler"). Entradas cujo .md já existe são puladas;
// use  npm run ingerir -- --forcar  para refazer todas, ou  npm run ingerir -- --so cfp-ref-cras-2007 --forcar  para refazer uma.
// Refazer APAGA a conferência e as edições feitas à mão no .md: por isso exige --forcar.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { converterDocumento, resumoDaEstrutura, limparTexto } from './importar-documento.mjs';
import { converterNorma } from './importar-norma.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'knowledge', 'entrada');
const DESTINO = join(RAIZ, 'knowledge', 'documentos');
const ID = /^[a-z0-9][a-z0-9-]*$/;

export function validarManifesto(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('manifesto.json precisa ser uma lista com pelo menos um documento.');
  const ids = new Set();
  lista.forEach(function (e, i) {
    const onde = 'manifesto.json, item ' + (i + 1) + (e && e.doc ? ' (' + e.doc + ')' : '');
    if (!e || typeof e !== 'object') throw new Error(onde + ': deve ser um objeto.');
    for (const c of ['arquivo', 'doc', 'titulo', 'norma', 'ano']) if (!e[c]) throw new Error(onde + ': falta "' + c + '".');
    if (!ID.test(e.doc)) throw new Error(onde + ': "doc" só pode ter letras minúsculas, números e hífen.');
    if (ids.has(e.doc)) throw new Error(onde + ': "doc" repetido.');
    ids.add(e.doc);
    if (!Number.isInteger(Number(e.ano))) throw new Error(onde + ': "ano" precisa ser um número.');
    if (e.url && !/^https?:\/\//.test(e.url)) throw new Error(onde + ': "url" deve começar com http:// ou https:// (ou apague o campo).');
    if (e.tipo && !['norma', 'referencia', 'apoio'].includes(e.tipo)) throw new Error(onde + ': "tipo" deve ser norma, referencia ou apoio.');
    if (e.pacote && !ID.test(e.pacote)) throw new Error(onde + ': "pacote" só pode ter letras minúsculas, números e hífen.');
    if (e.modo && !['documento', 'norma'].includes(e.modo)) throw new Error(onde + ': "modo" deve ser documento ou norma.');
    if (/[\\/]|\.\./.test(e.arquivo)) throw new Error(onde + ': "arquivo" deve ser só o nome do arquivo dentro de knowledge/entrada/.');
  });
  return lista;
}

export function textoDoArquivo(caminho) {
  if (/\.pdf$/i.test(caminho)) {
    try {
      return execFileSync('pdftotext', ['-enc', 'UTF-8', caminho, '-'], { encoding: 'utf8', maxBuffer: 400 * 1024 * 1024 });
    } catch (e) {
      if (e && e.code === 'ENOENT') throw new Error('Não achei o programa "pdftotext". Instale o poppler (Linux: sudo apt install poppler-utils; Mac: brew install poppler; Windows: poppler for Windows) ou converta o PDF para .txt e troque o nome em "arquivo".');
      throw e;
    }
  }
  return readFileSync(caminho, 'utf8');
}

export function converterEntrada(e, texto) {
  const modo = e.modo || 'documento';
  // sem "tipo": lei/resolução (modo norma) é norma; referência técnica/cartilha (modo documento) é referencia
  const meta = { doc: e.doc, titulo: e.titulo, norma: e.norma, ano: String(e.ano), tipo: e.tipo || (modo === 'norma' ? 'norma' : 'referencia'), pacote: e.pacote, url: e.url };
  if (modo === 'norma') {
    // PDF de resolução também traz cabeçalho, rodapé e número de página no meio dos artigos
    const r = converterNorma(limparTexto(texto), meta, { max: Number(e.max) || 700 });
    // a importação de normas não conhece pacote/url: acrescenta no começo do arquivo
    const extras = (e.tipo && e.tipo !== 'norma' ? 'tipo: ' + e.tipo + '\n' : '') + (e.pacote ? 'pacote: ' + e.pacote + '\n' : '') + (e.url ? 'url: ' + e.url + '\n' : '') + 'revisao: pendente\n';
    r.md = r.md.replace(/^(ano: .*\n)/m, '$1' + extras);
    return r;
  }
  return converterDocumento(texto, meta, {
    max: Number(e.max) || 900, min: Number(e.min) || 300,
    paginaInicial: Number(e.paginaInicial) || 1, paginaFinal: Number(e.paginaFinal) || Infinity,
    deslocamento: Number(e.deslocamento) || 0, semTitulos: !!e.semTitulos, semPaginas: !!e.semPaginas
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const forcar = args.includes('--forcar');
  const so = args.includes('--so') ? args[args.indexOf('--so') + 1] : '';
  // --entrada <pasta com os PDFs> e --manifesto <arquivo>: servem para apontar para uma pasta de envio (ex.: os arquivos anexados no chat)
  const valor = function (nome) { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : ''; };
  const pastaEntrada = valor('--entrada') || ENTRADA;
  const caminhoManifesto = valor('--manifesto') || join(pastaEntrada, 'manifesto.json');
  if (!existsSync(caminhoManifesto)) { console.error('Falta o manifesto: ' + caminhoManifesto + '. Rode  npm run inspecionar -- <pasta> --rascunho  para gerar um rascunho, ou copie manifesto.exemplo.json e ajuste.'); process.exit(1); }
  let lista;
  try { lista = validarManifesto(JSON.parse(readFileSync(caminhoManifesto, 'utf8'))); } catch (e) { console.error('ERRO: ' + e.message); process.exit(1); }
  let feitos = 0, falhas = 0;
  const criados = [];
  for (const e of lista) {
    if (so && e.doc !== so) continue;
    const destino = join(DESTINO, e.doc + '.md');
    if (existsSync(destino) && !forcar) { console.log('pulei    ' + e.doc + ' (já existe; para refazer e perder a conferência e as edições use --forcar)'); continue; }
    const origem = join(pastaEntrada, e.arquivo);
    if (!existsSync(origem)) { console.error('FALTA    ' + e.doc + ': não achei ' + origem); falhas++; continue; }
    try {
      const r = converterEntrada(e, textoDoArquivo(origem));
      writeFileSync(destino, r.md);
      console.log('ok       ' + e.doc + ': ' + r.trechos.length + ' trecho(s)' + (r.paginas ? ' de ' + r.paginas + ' página(s)' : ''));
      if (r.trechos[0] && r.trechos[0].secao !== undefined) console.log(resumoDaEstrutura(r.trechos).replace(/^/gm, '         '));
      r.avisos.forEach(function (a) { console.log('         ATENÇÃO: ' + a); });
      feitos++;
      criados.push('knowledge/documentos/' + e.doc + '.md');
    } catch (err) {
      console.error('ERRO     ' + e.doc + ': ' + err.message);
      falhas++;
    }
  }
  console.log('\n' + feitos + ' documento(s) importado(s)' + (falhas ? ', ' + falhas + ' com problema' : '') + '. Próximo passo: conferir por amostragem e rodar  npm run build:conhecimento');
  if (criados.length) console.log('Arquivos novos:\n  ' + criados.join('\n  ') + '\nDepois do build:conhecimento, também mudam: knowledge/conhecimento.json e knowledge/catalogo.json');
  if (falhas) process.exit(1);
}
