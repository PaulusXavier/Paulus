import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gerarVersao } from '../scripts/build.mjs';

function pasta(conteudoJs) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paulus-versao-'));
  fs.writeFileSync(path.join(d, 'paulus.v1.js'), conteudoJs);
  fs.writeFileSync(path.join(d, 'conhecimento-geral.json'), '[]');
  fs.writeFileSync(path.join(d, 'sw.js'), "var V = 'paulus-console-v3';\nvar BASE = [];\n");
  return d;
}

test('versao.json: mesma entrada, mesma impressão digital; mudou o conteúdo, mudou o build e o cache do sw.js', () => {
  const a = pasta('a'), b = pasta('a'), c = pasta('b');
  const ia = gerarVersao(a), ib = gerarVersao(b), ic = gerarVersao(c);
  assert.equal(ia.build, ib.build);
  assert.notEqual(ia.build, ic.build);
  assert.match(ia.versao, /^\d+\.\d+\.\d+$/);
  assert.ok(ia.arquivos['paulus.v1.js'].sha256 && ia.arquivos['paulus.v1.js'].bytes === 1);
  assert.ok(!('console.js' in ia.arquivos), 'arquivo ausente não entra');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a, 'versao.json'), 'utf8')).build, ia.build);
  assert.match(fs.readFileSync(path.join(a, 'sw.js'), 'utf8'), new RegExp("var V = 'paulus-console-" + ia.build + "';"));
  assert.notEqual(fs.readFileSync(path.join(a, 'sw.js'), 'utf8'), fs.readFileSync(path.join(c, 'sw.js'), 'utf8'));
});

test('versao.json: sw.js sem a linha do cache é erro claro, não publicação silenciosa', () => {
  const d = pasta('x'); fs.writeFileSync(path.join(d, 'sw.js'), 'self.skipWaiting();');
  assert.throws(() => gerarVersao(d), /nome do cache/);
});

test('workflows: o do repositório testa antes de publicar e o modelo dos apps valida o que baixa', () => {
  const r = (f) => fs.readFileSync(new URL('../.github/' + f, import.meta.url), 'utf8');
  const pages = r('workflows/pages.yml');
  assert.match(pages, /needs: testar/);
  assert.match(pages, /npm test/);
  assert.match(pages, /wrangler-action/);
  const app = r('app-workflows/sincronizar-paulus.yml');
  assert.match(app, /node --check/);
  assert.match(app, /JSON\.parse/);
  assert.match(app, /versao\.json/);
});
