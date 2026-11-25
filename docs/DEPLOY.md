# Publicar o Paulus

São duas publicações separadas:

| O quê | Onde | Para quê |
|---|---|---|
| **Worker** (`worker/`) | Cloudflare | a IA em si (Workers AI, gratuito, sem chave de API) |
| **Site estático** (`dist/`) | GitHub Pages | `paulus.v1.js` e `conhecimento.json`, que os apps carregam |

Antes de tudo: `npm test` precisa passar. (`knowledge/conhecimento.json` e `indice.json` não estão no Git: o `npm test`, o `npm run build` e o `wrangler deploy` os geram a partir de `knowledge/documentos/*.md`.)

## 1. Worker na Cloudflare

Conta gratuita em cloudflare.com (sem cartão). O nome do Worker é `paulus-ia` (está em `wrangler.toml`; o Argo já aponta para ele).

### Opção A: pelo terminal
```bash
npx wrangler login
npx wrangler deploy
```
O terminal mostra o endereço, algo como `https://paulus-ia.SEU-NOME.workers.dev`.

### Opção B: sem terminal (liga o GitHub à Cloudflare)
1. **Workers & Pages → Create → Import a repository** e escolha o repositório `paulus`.
2. Nome do Worker: `paulus-ia`. Comando de deploy: `npx wrangler deploy` (o padrão).
3. A cada push na `main`, a Cloudflare publica de novo.

> Não dá para colar o código no editor do painel: o Worker tem vários arquivos e a base de normas entra no pacote na hora de publicar.

### Configuração (já está no `wrangler.toml`)
- **Workers AI** ligado com o nome `AI` (`[ai] binding = "AI"`).
- **`ALLOWED_ORIGINS`**: os sites que podem usar o Paulus, separados por vírgula, sem barra no fim e sem caminho.
  Certo: `https://paulusxavier.github.io`. Errado: `https://paulusxavier.github.io/Argo/` (o navegador envia só o domínio).
  Se um app novo estiver em outro domínio, acrescente-o aqui e publique de novo.
- `MODELO`, `MODELO_RESERVA` e `MODELO_INTERPRETE` (opcionais): outro modelo da lista de Workers AI. Padrão: Llama 3.3 70B como principal e Llama 3.1 8B como reserva (assume sozinho quando a cota gratuita do dia acaba ou o principal falha). Cada pergunta usa até duas chamadas à IA (interpretar e responder); o limite do Worker é de 16 chamadas por minuto por pessoa.

> Se você mudar variáveis só pelo painel e depois publicar pelo `wrangler.toml`, o painel é sobrescrito. Mude no `wrangler.toml`.

### Testar o Worker
```bash
curl -i -X POST https://paulus-ia.SEU-NOME.workers.dev \
  -H "Origin: https://paulusxavier.github.io" -H "Content-Type: application/json" \
  -d '{"app":"argo","pergunta":"Quem gere o Cadastro Único no município?"}'
```
- `200` com `{"resposta": "...", "fontes": [...]}`: funcionando.
- `403 Origem não permitida`: `ALLOWED_ORIGINS` não tem o endereço do seu site.
- `500 Workers AI não está ligado`: falta o binding `AI`.
- `502`: a IA falhou (cota do dia acabou ou erro do modelo). O app usa a base offline.

Sem o cabeçalho `Origin` o Worker responde `403` de propósito.

## 2. Site estático (GitHub Pages)

1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Dê push na `main`. O workflow `.github/workflows/pages.yml` roda os testes, gera `dist/` e publica.
3. Ficam no ar:
   - `https://SEU-USUARIO.github.io/paulus/paulus.v1.js`
   - `https://SEU-USUARIO.github.io/paulus/conhecimento.json`

Para testar o build no computador: `npm run build` e confira a pasta `dist/`.

## 3. Depois de publicar
- **Argo SUAS:** ele usa cópias locais. Copie `dist/paulus.v1.js` para `js/paulus.v1.js` e `dist/conhecimento-geral.json` (pacote leve, ~0,4 MB; **não** o `conhecimento.json` inteiro, que passa de 8 MB) para `assets/conhecimento.json` (atenção: `assets/`, não `assets/img/`). Se mudou o texto das normas, publique o Worker de novo também.
- **Outros apps:** carregam do GitHub Pages; veja [INTEGRACAO.md](INTEGRACAO.md).
- **Cota:** o plano gratuito dá 10.000 "neurons" por dia no Workers AI. Acabando, a IA para até 00:00 UTC (20h em Roraima) e os apps usam a base offline. Não há cobrança por excesso no plano gratuito.

## Login do console (opcional, recomendado)

Sem configuração, o Worker segue aberto como antes. Para exigir login:

1. `node scripts/criar-usuario.mjs --segredo` → copie o texto gerado e rode `npx wrangler secret put AUTH_SEGREDO`.
2. `node scripts/criar-usuario.mjs paulo` (pede a senha sem mostrar) → rode `npx wrangler secret put USUARIOS` e cole o JSON `{"paulo":"pbkdf2$100000$..."}` (várias contas: junte as linhas).
3. Em `console/index.html`, preencha `<meta name="paulus-endpoint" content="https://paulus-ia.SEU-USUARIO.workers.dev">`.
4. `npx wrangler deploy` e `npm run build`.

Sessão de 12 h (30 dias com "Manter conectado"); 5 erros seguidos na mesma conta+IP bloqueiam por 30 s, dobrando a cada erro (até 15 min). Além do bloqueio por conta+IP, há um teto de 20 tentativas de login por minuto por IP (qualquer usuário), para quem troca de usuário a cada tentativa. Os dois contadores ficam na memória do Worker (valem por instância). O código está em `worker/auth.mjs` (PBKDF2-SHA256 com 100.000 voltas, o máximo que o Workers aceita; sessão assinada com HMAC-SHA256, nada é gravado) e os testes em `tests/auth.test.mjs`. Remover a conta de `USUARIOS` derruba a sessão dela na hora. O `console.js` só é carregado depois de entrar.

## Login pelo Firebase (vários apps, uma conta só)

Use isto quando vários apps compartilham o Paulus: cada pessoa tem uma conta no **Firebase Authentication** e o mesmo login vale em todos os apps (desde que usem o **mesmo projeto Firebase**). O Worker confere o token do Google, sem guardar senha nenhuma.

**1. No Firebase (console.firebase.google.com)**
1. Crie um projeto (ou use o que os apps já usam). Anote o **ID do projeto** (Configurações do projeto → Geral).
2. **Authentication → Sign-in method → E-mail/senha → Ativar.**
3. **Authentication → Users → Add user**: crie cada conta (e-mail e senha). Quem entra é quem você criou aqui.
4. **Authentication → Settings → User actions**: desmarque **Enable create (sign-up)**. Sem isso, qualquer pessoa que souber a chave web do app poderia criar uma conta própria.
5. Em Configurações do projeto → Geral, copie a **Chave de API da Web** (ela é pública por desenho; não é segredo).

**2. No Worker** (`wrangler.toml`, seção `[vars]`)
```toml
FIREBASE_PROJECT_ID = "meu-projeto-123"
# opcional, recomendado: só estes e-mails (verificados) entram
# FIREBASE_EMAILS = "paulo@exemplo.org,ana@exemplo.org"
# FIREBASE_DOMINIOS = "prefeitura.exemplo.gov.br"
```
Faça o commit; o deploy reconstrói o Worker. A partir daí o Worker responde `401` a quem não mandar um token válido. O login por senha (`AUTH_SEGREDO` e `USUARIOS`) continua funcionando junto, se estiver configurado.

**3. No Console** (`console/index.html`): preencha `<meta name="paulus-firebase-key" content="SUA_CHAVE_WEB">`. A tela de login passa a pedir **e-mail e senha** do Firebase. A sessão se renova sozinha (o ID token dura 1 h; "Manter conectado" guarda o token de renovação neste aparelho).

**4. Nos outros apps**: eles entram pelo SDK do Firebase deles e passam o token ao Paulus:
```js
// depois de entrar com o Firebase Auth (signInWithEmailAndPassword...)
Paulus.init({ app: 'argo', endpoint: 'https://paulus-ia.SEU-USUARIO.workers.dev',
  token: () => auth.currentUser ? auth.currentUser.getIdToken() : '' });   // o SDK renova o token sozinho
```
`token` aceita texto, função ou função assíncrona. Se a resposta for `401`, o app deve mandar a pessoa entrar de novo (`aoNegar`).

**Cuidados**
- Os apps precisam estar no mesmo projeto Firebase do `FIREBASE_PROJECT_ID`; token de outro projeto é recusado.
- Remover a conta no Firebase não derruba na hora um token já emitido: ele vale até vencer (até 1 h). Para cortar acesso na hora, tire o e-mail de `FIREBASE_EMAILS` e publique de novo.
- O Worker busca as chaves públicas do Google (googleapis.com) e as guarda por 1 h; se o Google não responder e não houver cópia, ninguém entra até voltar.

## Cota da IA no console (opcional)

O botão de medidor do cabeçalho (ou `/cota`) abre o painel da cota: quanto da franquia diária da IA já foi usado, a hora em que ela acaba no ritmo de hoje e a hora em que renova. A franquia gratuita do Workers AI é de **10.000 neurons por dia**, somados entre todos os modelos, e **renova às 00:00 UTC** (20:00 em Boa Vista). Sem nada configurado o painel já mostra a hora da renovação; para ele mostrar também o **consumo**, o Worker precisa ler as análises da sua conta Cloudflare. A Cloudflare não tem uma rota "quanto me resta"; o consumo vem da API de análises (GraphQL, conjunto `aiInferenceAdaptiveGroups`).

1. No painel da Cloudflare, copie o **ID da conta** (Workers & Pages, coluna da direita; é um código de 32 letras e números).
2. Crie um token só de leitura: **Meu perfil → Tokens de API → Criar token → Criar token personalizado**. Permissão: **Conta → Análises da conta → Leitura** (*Account Analytics: Read*), só para a sua conta. Não dê nenhuma outra permissão. Copie o token (ele só aparece uma vez).
3. Guarde os dois como **segredos do Worker** (não vão para o Git nem para o `wrangler.toml`):

```bash
npx wrangler secret put COTA_CF_CONTA   # cole o ID da conta
npx wrangler secret put COTA_CF_TOKEN   # cole o token de leitura
```

Pelo painel: Workers & Pages → `paulus-ia` → Settings → Variables and Secrets → Add (tipo *Secret*). Esse token é **diferente** do `CLOUDFLARE_API_TOKEN` usado pelo GitHub Actions para publicar o Worker (aquele tem permissão de publicar; este só lê números). Os segredos ficam no Worker e sobrevivem às próximas publicações.

Notas:
- O painel só mostra números agregados (neurons por hora e por modelo); não passa pergunta, resposta, conversa nem dado de família. A rota `/cota` exige o mesmo login das demais.
- Os números vêm das análises da Cloudflare e podem **atrasar alguns minutos** em relação ao painel oficial (Workers AI → uso), que é a fonte de verdade. O Worker guarda o resultado por 1 minuto, então abrir o painel várias vezes não multiplica consultas.
- "Acaba às..." é estimativa: usa o ritmo das últimas horas e some quando a franquia dura até a renovação.
- Se a sua conta usa o plano **Workers Paid**, a franquia de 10.000 neurons por dia continua valendo, mas o que passa dela é cobrado (US$ 0,011 por mil neurons) em vez de a IA parar; o painel avisa e estima esse custo.

Além do consumo, o painel mostra números derivados do mesmo dado agregado: gasto médio por chamada, quantas chamadas ainda cabem, projeção do total no fim do dia (se o ritmo recente continuar), hora de pico, até que hora a Cloudflare já tem dados e, por modelo, a parte do consumo, o gasto por chamada e os tokens. São contas sobre o que a Cloudflare devolve; sem consumo no dia, esses campos ficam vazios em vez de inventar um valor.

**Histórico de 7 dias:** a mesma consulta à Cloudflare pede hoje e os 6 dias anteriores (dias UTC, que são os da franquia), então não há chamada extra. O painel mostra um gráfico dos 7 dias, o total de ontem, a média diária, o maior dia, quantos dias a franquia esgotou e quanto hoje está acima ou abaixo do normal **no mesmo ponto do dia** (só as horas já fechadas, para não comparar meio dia com um dia inteiro). Sem nenhum dia anterior com uso, o histórico não aparece. Se a Cloudflare cortar a lista (limite de 2.000 leituras), o painel avisa que o histórico pode estar incompleto. Para pedir só o dia de hoje, defina `COTA_HISTORICO = "desligado"` no `wrangler.toml`. Para outra franquia, defina a variável `COTA_NEURONS` no `wrangler.toml`.
- Mensagem "A Cloudflare recusou a leitura": o token está sem a permissão de análises da conta, ou o ID da conta está errado.

## Atualização automática

**Neste repositório** (`.github/workflows/pages.yml`): a cada push na `main` (e toda segunda de manhã) o GitHub roda os testes, gera o `dist/` e publica o site. Se os segredos da Cloudflare existirem, publica também o Worker, que reconstrói sozinho a base e as habilidades (`wrangler.toml → [build]`). Se um teste falhar, nada é publicado.

Para ligar o Worker: no Cloudflare, **My Profile → API Tokens → Create Token** com o modelo *Edit Cloudflare Workers*; depois, no GitHub, **Settings → Secrets and variables → Actions** e crie `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (o ID aparece na página inicial da conta). Os segredos do login (`AUTH_SEGREDO`, `USUARIOS`) ficam na Cloudflare e não são tocados pelo deploy.

**O que chega sozinho aos apps**
- `dist/versao.json` traz a versão e a impressão digital de cada arquivo; só muda quando o conteúdo muda.
- Apps que carregam do GitHub Pages: o `Paulus.init({ conhecimentoUrl })` revalida a base a cada abertura (se nada mudou, o servidor responde 304 e nada é baixado de novo), e o `paulus.v1.js` vem do site já atualizado.
- Console instalado (PWA): o `sw.js` publicado leva a impressão digital no nome do cache, então cada publicação troca o cache e o aparelho atualiza na abertura seguinte.
- Apps com cópia local (Argo, por exemplo): copie `.github/app-workflows/sincronizar-paulus.yml` para `.github/workflows/` do repositório do app e ajuste o bloco `env` (endereço do Paulus e caminhos dos arquivos). Todo dia o app compara com o `versao.json` e, se houver novidade, baixa os arquivos, confere (JSON válido, script sem erro de sintaxe) e faz o commit sozinho. Sem novidade, não faz nada.
