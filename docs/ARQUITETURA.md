# Arquitetura

```
app (navegador)                            Worker (Cloudflare)             Workers AI
 ├─ paulus.v1.js  ──── só pergunta filtrada, ─────▶ filtra de novo,  ─────▶ modelo
 │    ├ filtro de dados pessoais            histórico curto e                (gratuito)
 │    ├ socorro (telefones, offline)        fichas PÚBLICAS
 │    ├ ações e buscas do app (local)       ◀──── texto em streaming + fontes
 │    └ base de normas (offline)            busca as normas na PRÓPRIA base
 └─ mascote (rosto)                         não grava nada
```

## Ordem de cada pergunta (`client/paulus.mjs`)
1. Pedido de socorro → telefones de emergência na hora, sem rede (vem antes do filtro).
2. Dado pessoal na pergunta → bloqueia; nada sai do aparelho.
3. "abrir ..." → ação registrada pelo app (pede confirmação se mexe em dados).
4. "buscar ..." → busca registrada pelo app, executada no aparelho; o resultado não vai para a IA.
5. Base de normas offline.
6. IA (Worker), em streaming.
7. Se a IA falhar ou estiver offline → trecho da norma ou "não encontrei".
Os passos 3 e 4 são pulados com `{ semAcoes: true }` (apps que já tratam isso, como o Argo).
Apps com fluxo próprio, que só querem a norma quando não há IA, usam `Paulus.consultarNormas(texto)` (só o passo 5).

## Código compartilhado
`shared/` roda no navegador **e** no Worker, para o filtro e a busca serem idênticos nos dois lados:
- `pii.mjs`: filtro de dados pessoais.
- `crise.mjs`: detector de pedido de socorro e telefones.
- `busca.mjs`: busca BM25 na base de normas.

`scripts/build.mjs` junta `shared/*` + `client/*` em `dist/paulus.v1.js` (um arquivo, sem `import`/`export`). Por isso, nesses arquivos: imports **em uma linha**, `export function/const` (sem `export {}`), e nomes de função que não se repetem entre módulos.

## Protocolo navegador ↔ Worker
Pedido `POST` JSON: `{ app, pergunta, pagina, historico:[{papel,texto}], fichas:[...], stream:true }`.
- `papel`: `usuario`, ou `paulus`/`argo` para as respostas.
- Resposta em streaming (`text/event-stream`): `data: {"fontes":[...]}` (se achou normas), vários `data: {"t":"pedaço"}`, `data: [DONE]`. Em erro no meio: `data: {"erro":"..."}`.
- Sem `stream`: JSON `{ resposta, fontes }`.
- Formato antigo do Argo também funciona: sem `app` (vale `argo`) e `contexto` no lugar de `fichas`.

## Cada app
Um bloco em `worker/apps.mjs` (contexto para a IA) e outro em `client/skins.mjs` (nome do mascote, saudação, sugestões). O Worker rejeita app que não esteja em `apps.mjs`.
