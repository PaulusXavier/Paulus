# Publicar o Paulus

São duas publicações separadas:

| O quê | Onde | Para quê |
|---|---|---|
| **Worker** (`worker/`) | Cloudflare | a IA em si (Workers AI, gratuito, sem chave de API) |
| **Site estático** (`dist/`) | GitHub Pages | `paulus.v1.js` e `conhecimento.json`, que os apps carregam |

Antes de tudo: `npm test` precisa passar.

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
- `MODELO` e `MODELO_RESERVA` (opcionais): outro modelo da lista de Workers AI.

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
- **Argo SUAS:** ele usa cópias locais. Copie `dist/paulus.v1.js` para `js/paulus.v1.js` e `dist/conhecimento.json` para `assets/conhecimento.json` (atenção: `assets/`, não `assets/img/`). Se mudou o texto das normas, publique o Worker de novo também.
- **Outros apps:** carregam do GitHub Pages; veja [INTEGRACAO.md](INTEGRACAO.md).
- **Cota:** o plano gratuito dá 10.000 "neurons" por dia no Workers AI. Acabando, a IA para até 00:00 UTC (20h em Roraima) e os apps usam a base offline. Não há cobrança por excesso no plano gratuito.
