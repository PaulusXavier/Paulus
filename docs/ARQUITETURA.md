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

## Memória (v0.5.0, `client/memoria.mjs`)
O Paulus aprende com o uso **no aparelho**; nada é gravado no Worker. Onde a memória entra em cada pergunta:
- **Antes da busca:** `preferencias()` dá um fator de 1,0 a 1,3 aos documentos mais consultados (`buscar({ preferir })`; só reordena).
- **"abrir ...":** apelidos ensinados valem antes dos rótulos do app (e não pulam a confirmação).
- **Passo da IA:** vai junto o objeto `preferencias` (códigos fechados + ids de documentos). O Worker valida, escreve um bloco "PREFERÊNCIAS DESTA PESSOA" no prompt (só estilo) e ignora em tema de suicídio.
- **Depois da resposta:** `aprenderPergunta` (contagem + temas, com peso pequeno); o app chama `Paulus.avaliar(r, sinal)` quando a pessoa reage (👍/👎/mais curto/...).
- **Se a IA falhar:** resposta aprovada que combina (`deMemoria: true`) → trecho de norma → "não encontrei".
Tudo envelhece (meia-vida), tem limite de tamanho e é reconstruído pelo `memSanear` ao ler/importar. Detalhes de privacidade em [SEGURANCA](SEGURANCA.md).

## Pedido dinâmico (v0.6.0, `shared/pedido.mjs`)
Antes de buscar e de chamar a IA, o Paulus **lê o tipo do pedido por regra** (sem gastar cota de IA), no navegador e no Worker:

| Tipo | Exemplo | O que muda |
|---|---|---|
| `saudacao` | "oi", "obrigado" | prompt mínimo (~700 caracteres em vez de ~17 mil), modelo pequeno (o grande é a reserva), nenhuma norma, até 160 tokens |
| `refinamento` | "mais curto", "deixe mais formal", "de outro jeito" | a IA **reescreve a última resposta** (que vai inteira, até 3000 caracteres), a busca usa o assunto anterior (não as palavras do ajuste), até 3 trechos, até 1200 tokens, sem botões de ação; a habilidade do turno anterior continua (ofício segue ofício) |
| `seguimento` | "e para adolescente?", "e o horário?" | a busca e as habilidades herdam o assunto, inclusive em cadeia ("e para idoso?" depois de "e para adolescente?") |
| `consulta` | telefone, endereço, horário, "quantos" (com fichas) | temperatura 0,2: sem criatividade em dado de diretório |
| `normal` | o resto | como antes (900 tokens, temperatura 0,4); pergunta com muitas ideias busca um trecho a mais |

Pergunta curta com termo próprio do SUAS ("como funciona o BPC?") **não** é seguimento: se sustenta sozinha. Em tema de suicídio nada disso muda o protocolo (sem roteiro, sem ajuste de estilo).

O prompt também é montado por partes: sem fichas nem panorama (Toth, Grafia, Umbrella) entra a versão curta das regras de unidade, com o mesmo rigor ("NUNCA invente endereço, telefone...").
Se o modelo principal devolver texto vazio, o reserva tenta antes de dar erro.

### Conferência de citações (`shared/verificacao.mjs`)
O Worker informa quais artigos e leis estavam nos trechos que a IA leu (`citaveis: { a: [...], l: [...] }`, evento SSE ou campo do JSON). O navegador compara com o que a resposta citou; citação fora da lista vira **aviso** ("A IA citou art. 99, que não aparece nas normas consultadas. Confira..."). O texto não é alterado. Artigos já vistos nas respostas anteriores da conversa não avisam de novo. Worker antigo (sem `citaveis`): o navegador usa só as fontes que vieram.

### Memória
Cumprimento, ajuste e seguimento **não** entram nas "perguntas frequentes" nem nos temas aprendidos (antes, "oi" virava sugestão do mascote).

## Código compartilhado
`shared/` roda no navegador **e** no Worker, para o filtro e a busca serem idênticos nos dois lados:
- `pii.mjs`: filtro de dados pessoais.
- `crise.mjs`: detector de pedido de socorro e telefones.
- `busca.mjs`: busca BM25 na base de normas.
- `pedido.mjs`: tipo do pedido (cumprimento, ajuste, seguimento, consulta) e parâmetros da IA por situação.
- `verificacao.mjs`: conferência de artigos e leis citados pela IA.

`scripts/build.mjs` junta `shared/*` + `client/*` em `dist/paulus.v1.js` (um arquivo, sem `import`/`export`). Por isso, nesses arquivos: imports **em uma linha**, `export function/const` (sem `export {}`), e nomes de função que não se repetem entre módulos.

## Protocolo navegador ↔ Worker
Pedido `POST` JSON: `{ app, pergunta, pagina, historico:[{papel,texto}], fichas:[...], stream:true }`.
- `papel`: `usuario`, ou `paulus`/`argo` para as respostas.
- Resposta em streaming (`text/event-stream`): `data: {"fontes":[...]}` (se achou normas), vários `data: {"t":"pedaço"}`, `data: [DONE]`. Em erro no meio: `data: {"erro":"..."}`.
- Sem `stream`: JSON `{ resposta, fontes }`.
- Formato antigo do Argo também funciona: sem `app` (vale `argo`) e `contexto` no lugar de `fichas`.

### Interpretação da pergunta (`modo: "interpretar"`)
Antes de responder, o app pode pedir ao Worker que **só interprete** a pergunta: `{ modo: "interpretar", app, pergunta, historico }` devolve `{ interpretacao: { pergunta, intencao, bairro, esclarecer } | null }`. A IA lê a conversa, completa o que ficou subentendido ("e o horário?" vira "Qual o horário do CRAS Cauamé?"), corrige a digitação e escreve a pergunta na forma que o app sabe consultar com dados reais (`worker/interpretar.mjs`). Ela não responde, não busca e não inventa dado. Socorro e dado pessoal nunca chegam à IA nesse modo (voltam `interpretacao: null`); a reescrita é descartada se trouxer dado pessoal que a pergunta não tinha. Se a IA falhar (502) ou devolver lixo, o app segue com a pergunta original. No Argo, quem usa isso é `ArgoCerebro.interpretar` + `argoAssistantAskHybrid` (`js/app.js`).

### Habilidades
O Worker escolhe até 2 roteiros de `habilidades/` (`shared/habilidades.mjs`) pela pergunta e os coloca no prompt (`worker/prompt.mjs`, bloco HABILIDADES). Ficam fora do prompt quando nada combina e em tema de suicídio. Veja [HABILIDADES.md](HABILIDADES.md).

## Cada app
Um bloco em `worker/apps.mjs` (contexto para a IA) e outro em `client/skins.mjs` (nome do mascote, saudação, sugestões). O Worker rejeita app que não esteja em `apps.mjs`.
