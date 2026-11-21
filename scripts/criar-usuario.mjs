// Gera os segredos do login do Worker (veja docs/DEPLOY.md).
//   node scripts/criar-usuario.mjs --segredo     escreve um AUTH_SEGREDO aleatório
//   node scripts/criar-usuario.mjs paulo         pede a senha sem mostrar e escreve {"paulo":"pbkdf2$..."}
import { randomBytes } from 'node:crypto';
import { criarHashDeSenha, normalizarUsuario, MAX_SENHA, MAX_USUARIO } from '../worker/auth.mjs';

const arg = process.argv[2];
if (!arg || arg === '--ajuda' || arg === '-h') {
  console.log('Uso:\n  node scripts/criar-usuario.mjs --segredo\n  node scripts/criar-usuario.mjs <usuario>');
  process.exit(arg ? 0 : 1);
}
if (arg === '--segredo') {
  console.log(randomBytes(32).toString('base64url'));
  process.exit(0);
}
const nome = normalizarUsuario(arg);
if (!nome || nome.length > MAX_USUARIO || /["\\\s]/.test(nome)) { console.error('Usuário inválido (até ' + MAX_USUARIO + ' caracteres, sem espaço nem aspas).'); process.exit(1); }

function pedirSenha(texto) {
  return new Promise((resolve) => {
    const em = process.stdin;
    if (!em.isTTY) { let s = ''; em.setEncoding('utf8'); em.on('data', (d) => { s += d; }); em.on('end', () => resolve(s.split(/\r?\n/)[0])); return; }
    process.stderr.write(texto);
    let s = '';
    em.setRawMode(true); em.resume(); em.setEncoding('utf8');
    em.on('data', function f(c) {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') { em.setRawMode(false); em.pause(); em.removeListener('data', f); process.stderr.write('\n'); resolve(s); return; }
        if (ch === '\u0003') { process.stderr.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') s = s.slice(0, -1); else s += ch;
      }
    });
  });
}

const senha = await pedirSenha('Senha para "' + nome + '": ');
if (!senha || senha.length < 10) { console.error('Use uma senha de pelo menos 10 caracteres.'); process.exit(1); }
if (senha.length > MAX_SENHA) { console.error('Senha longa demais (máximo ' + MAX_SENHA + ').'); process.exit(1); }
if (process.stdin.isTTY) { const de = await pedirSenha('Repita a senha: '); if (de !== senha) { console.error('As senhas não conferem.'); process.exit(1); } }
console.log(JSON.stringify({ [nome]: await criarHashDeSenha(senha) }));
