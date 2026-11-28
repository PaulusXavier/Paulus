// Carrega um módulo de console/ (script de navegador com "module.exports" opcional) mesmo com "type": "module" no package.json.
const fs = require('fs'), path = require('path');
module.exports = function carregar(nome) {
  const arq = path.join(__dirname, '..', 'console', nome), m = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(arq, 'utf8') + '\n//# sourceURL=' + arq)(m, m.exports);
  return m.exports;
};
