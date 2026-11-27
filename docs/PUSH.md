# Avisos com o app fechado (Web Push)

Sem isto, a agenda só avisa com o Paulus aberto ou em segundo plano. Com isto, o **Worker** manda o aviso na hora certa, mesmo com o app fechado e o celular bloqueado.

## Como funciona (e o que o servidor vê)

1. No app, em **Agenda → Avisos → "Avisar mesmo com o app fechado"**, o navegador cria uma assinatura de push e o app a registra no Worker.
2. O app entrega ao Worker a lista dos próximos 14 dias: **hora**, um **código (hash)** e um **bloco cifrado**. A chave que cifra o bloco (AES-256-GCM) é criada no aparelho e fica no IndexedDB dele; **nunca sai do aparelho**.
3. Um **Durable Object** (um por usuário, SQLite) acorda por alarme na hora de cada aviso e o envia ao serviço de push do navegador (Google, Mozilla, Apple ou Microsoft), com a assinatura VAPID do Worker e criptografia RFC 8291.
4. O `sw.js` do aparelho decifra o bloco e mostra a notificação (com **Concluir** e **+10 min**; lembretes do chat têm **+10 min** e **+1 h**).

O Worker e o armazenamento dele veem só: a hora do aviso, o código e um bloco ilegível. **O texto das anotações não é visto.** "Esconder o texto na tela bloqueada" continua valendo (o texto escondido é o que vai cifrado).

## Ligar (uma vez)

```
node scripts/gerar-vapid.mjs
```

1. Copie `VAPID_PUBLICA` e `VAPID_CONTATO` para o `[vars]` do `wrangler.toml` (descomente as linhas).
2. `npx wrangler secret put VAPID_PRIVADA` e cole a linha JSON que o script mostrou. **Não** grave a chave privada no Git.
3. `npx wrangler deploy`. A primeira publicação aplica a migração do Durable Object (`push-v1`); nada precisa ser criado no painel.
4. No celular/computador: abra o Paulus **instalado** (no Android: menu ⋮ → "Instalar app"), permita as notificações e ligue **Avisar mesmo com o app fechado**. Use **Testar com o app fechado**: feche o app e o aviso chega em 10 s.

Exige o **login do Paulus ligado** (senha ou Firebase): o Worker usa a conta para separar os avisos de cada pessoa. Sem VAPID configurado, o recurso fica desligado e o resto do Worker não muda.

## Cota e limites

- Durable Objects com SQLite e alarmes funcionam no plano gratuito (limites diários generosos para uso individual).
- Até 5 aparelhos por usuário, 300 avisos por aparelho, 15 dias à frente, bloco de até 2000 caracteres.
- Aviso que não pôde ser entregue é tentado 3 vezes; passadas 6 h, é descartado. Assinatura que o navegador encerrou (404/410) é apagada.
- Só serviços de push conhecidos são aceitos como destino (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`).

## O que ainda depende do aparelho

- Os resumos (do dia e de amanhã) usam o que está marcado **na última vez que o app sincronizou**. Anotações mudadas em outro aparelho entram quando o Paulus abrir de novo.
- No Android, deixe a bateria do app em **Sem restrições** (Configurações → Apps → Paulus → Bateria) e não "force a parada" do app: isso cancela o push.
- No iPhone/iPad, o push só funciona com o Paulus **adicionado à Tela de Início** (iOS 16.4+).
- Se o navegador trocar a assinatura, o app a renova na próxima abertura.
- Com o Paulus visível na tela, quem avisa é o próprio app (o sistema não repete).

## Trocar as chaves

Gere outro par e repita os passos. As assinaturas antigas deixam de valer: ligue de novo no app.
