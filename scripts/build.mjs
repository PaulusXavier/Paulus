// Gera os arquivos que vão para o ar:
//   dist/paulus.v1.js       módulo do navegador (shared/*.mjs + client/*.mjs em um arquivo só, sem import/export)
//   dist/conhecimento.json  base de normas (cópia de knowledge/conhecimento.json)
//
// Uso: npm run build   (antes, rode npm run build:conhecimento se mudou algo em knowledge/documentos)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Ordem importa: quem é usado vem antes de quem usa.
const MODULOS = ['shared/pii.mjs', 'shared/crise.mjs', 'shared/busca.mjs', 'client/skins.mjs', 'client/paulus.mjs'];

const CABECALHO = '/*! Paulus v1 — gerado por scripts/build.mjs. Não edite: altere shared/ e client/. */\n(function (root) {\n\'use strict\';\n';
const RODAPE = '})(typeof self !== \'undefined\' ? self : this);\n';
const EXPORTA_NA_PAGINA = 'root.Paulus = Paulus;\nif (typeof module === \'object\' && module.exports) module.exports = Paulus;';

function tirarModulo(codigo) {
  return codigo
    // imports (sempre em UMA linha) viram linha em branco
    .replace(/^import\s[^\n]*;[ \t]*$/gm, '')
    // export default Paulus  ->  publica no navegador
    .replace(/^export default Paulus;[ \t]*$/m, EXPORTA_NA_PAGINA)
    // export function / const / class  ->  sem o "export"
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
}

export function juntar() {
  const blocos = MODULOS.map(function (caminho) {
    const codigo = readFileSync(join(RAIZ, caminho), 'utf8').replace(/\s+$/, '') + '\n';
    return '// ---- ' + caminho + ' ----\n' + tirarModulo(codigo);
  });
  const corpo = blocos.join('\n');
  if (/^\s*(import|export)\b/m.test(corpo)) {
    throw new Error('Sobrou import/export no arquivo do navegador. Use imports em UMA linha e "export function/const".');
  }
  return CABECALHO + corpo + RODAPE;
}

export function construir() {
  const saida = join(RAIZ, 'dist');
  mkdirSync(saida, { recursive: true });
  writeFileSync(join(saida, 'paulus.v1.js'), juntar());
  const base = join(RAIZ, 'knowledge', 'conhecimento.json');
  if (!existsSync(base)) throw new Error('Falta knowledge/conhecimento.json. Rode: npm run build:conhecimento');
  copyFileSync(base, join(saida, 'conhecimento.json'));
  return saida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pasta = construir();
  console.log('Pronto: ' + pasta + '/paulus.v1.js e conhecimento.json');
}
