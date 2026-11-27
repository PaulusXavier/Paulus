// Gera o par de chaves VAPID dos avisos com o app fechado (docs/PUSH.md). Rode UMA vez:  node scripts/gerar-vapid.mjs
// - VAPID_PUBLICA entra no wrangler.toml, em [vars].
// - VAPID_PRIVADA entra como SEGREDO:  npx wrangler secret put VAPID_PRIVADA   (cole a linha JSON inteira)
// Não grave a chave privada no Git. Trocar o par depois cancela as assinaturas atuais (é só ativar de novo no app).
import { emB64u } from '../worker/push.mjs';

const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publica = emB64u(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)));
const privada = JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey));
console.log('\n1) No wrangler.toml, em [vars]:\n   VAPID_PUBLICA = "' + publica + '"\n   VAPID_CONTATO = "mailto:SEU-EMAIL@exemplo.org"');
console.log('\n2) No terminal:  npx wrangler secret put VAPID_PRIVADA\n   e cole a linha abaixo quando ele pedir:\n\n' + privada + '\n');
console.log('3) Publique de novo:  npx wrangler deploy\n');
