// Carrega vendor/pdf-lib.min.js (UMD) no Node dos testes sem instalar nada: o pacote não tem dependências.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

export function carregarPDFLib() {
  const codigo = readFileSync(join(AQUI, '..', 'vendor', 'pdf-lib.min.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', 'self', codigo).call(globalThis, m, m.exports, globalThis);
  return m.exports;
}
