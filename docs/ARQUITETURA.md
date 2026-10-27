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
O Worker informa quais artigos e leis estavam nos trechos que a IA leu (`citaveis: { a: [...], l: [...], v: [...] }`, evento SSE ou campo do JSON; `v` são os valores em R$ que estavam nas normas, fichas, base do app, panorama ou na própria conversa). O navegador compara com o que a resposta citou; citação (artigo, lei ou valor em R$) fora da lista vira **aviso** ("A IA citou art. 99, que não aparece nas normas consultadas. Confira..."). O texto não é alterado. Artigos já vistos nas respostas anteriores da conversa não avisam de novo. Worker antigo (sem `citaveis`): o navegador usa só as fontes que vieram.

### Memória
Cumprimento, ajuste e seguimento **não** entram nas "perguntas frequentes" nem nos temas aprendidos (antes, "oi" virava sugestão do mascote).

## Conversa inteira (v0.8.0, `shared/conversa.mjs`)
Antes, só as 6 últimas mensagens (3 trocas) iam para a IA: o que foi dito antes disso (bairro da família, unidade em foco, assunto) sumia e o mascote voltava a pedir o dado. Agora, por regra e sem gastar cota:

| Peça | O que faz |
|---|---|
| Janela maior | as últimas **10 mensagens** (5 trocas) vão inteiras; a janela começa sempre numa pergunta da pessoa |
| `<conversa_anterior>` | as perguntas mais antigas viram um resumo (até 12, 160 caracteres cada, sem dado pessoal, sem cumprimento) |
| `estado` (opcional, vem do app) | `{ unidade, bairro, municipio, assunto, intencao }`: o que a conversa já firmou. O Worker valida de novo (campos fechados, curtos, sem dado pessoal) e escreve o bloco `<estado_da_conversa>` |
| Esclarecimento por regra | `deveEsclarecer`: o modelo só pode perguntar de volta se o dado falta na mensagem, no estado e na conversa, e só para `territorio`, `ubs_psicologo` e `diretorio`. Conceito, norma, CID, contagem e "outro" respondem com a premissa dita em voz alta. Não repete a pergunta que acabou de fazer |
| Prompt | "Responda primeiro, pergunte depois": entrega o que dá para afirmar e, no fim, uma linha com o que mudaria a resposta |

| Resposta que só perguntou | `soPerguntou(texto)`: se a IA devolve só uma pergunta de esclarecimento e a conversa já está em andamento, o app repete **uma vez** com `semPerguntar: true`; o Worker acrescenta o bloco "RESPONDA SEM PERGUNTAR" (premissa dita em voz alta, uma linha no fim com o que mudaria). Falhou ou perguntou de novo: vale a primeira. Não vale em tema de suicídio |
| Validade do estado (Argo) | o que foi firmado envelhece: unidade, bairro e município valem 12 turnos sem serem reafirmados, o assunto 8 e a intenção 4 |

A interpretação (`modo: "interpretar"`) recebe o mesmo estado e a mesma conversa, e devolve também `unidade`. O app guarda o que ela descobriu (`bairro`, `unidade`) para os próximos turnos. Apps sem estado estruturado (Toth, Grafia...) ganham a janela maior e o resumo das perguntas antigas sem fazer nada. API para os apps: `Paulus.perguntar(texto, { estado })` e `Paulus.conversa.*`.

## Código compartilhado
`shared/` roda no navegador **e** no Worker, para o filtro e a busca serem idênticos nos dois lados:
- `pii.mjs`: filtro de dados pessoais.
- `crise.mjs`: detector de pedido de socorro e telefones.
- `busca.mjs`: busca BM25 na base de normas.
- `pedido.mjs`: tipo do pedido (cumprimento, ajuste, seguimento, consulta) e parâmetros da IA por situação.
- `conversa.mjs`: janela do histórico, resumo das perguntas antigas, estado da conversa e regra do esclarecimento.
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


## Resiliência do streaming
Se o fluxo do modelo grande falhar ou terminar sem nenhum texto antes de sair qualquer pedaço, o Worker chama o modelo de reserva (sem stream) e envia a resposta no lugar: a pessoa não vê erro. Se o fluxo cair no meio da resposta, o texto parcial não é emendado por outro modelo; o navegador recebe `{"erro":"A resposta foi interrompida."}`.


## Cálculo (v0.9.0, shared/calculo.mjs)

Modelo de linguagem erra conta; programa não. Por isso a IA nunca faz aritmética: ela escreve, o programa executa.

**Motor (`shared/calculo.mjs`, navegador e Worker).** Interpretador próprio, sem `eval`: `+ - * / ^`, parênteses, `%` (com a leitura de calculadora: `1200 + 15%` = 1380), comparações (`<= >= ==`, resultado SIM/NÃO), `raiz`, `media`, `min`, `max`, `arred`, `teto`, `piso`, `abs` e `#n` (resultado da conta n). Números no jeito brasileiro (`1.518,50`, `R$ 3.200`, `15,04%`). Sem ruído de ponto flutuante (0,1 + 0,2 = 0,3), arredondamento comercial e limites contra conta gigante ou expoente absurdo. Sem BigInt nem lookbehind (Safari antigo).

**Três caminhos, do mais barato ao mais caro:**

1. *Só a conta* (\"quanto é 15% de 1200?\"): o cliente resolve no aparelho (`respostaDeConta`), `tipo: 'calculo'`, sem rede nem cota.
2. *Conta com mais assunto* (\"calcule a renda per capita 3200 / 4\"): o Worker acha a conta (`contasConfiaveis`) e a IA recebe `<calculos>` já resolvido.
3. *Problema em palavras*: `pareceProblemaDeCalculo` aciona o passo de planejamento (`worker/planejar.mjs`): uma chamada com temperatura 0 em que a IA só escreve linhas `CONTA: rótulo | expressão | unidade` (e `FALTA:` quando falta dado), vendo as mesmas normas, fichas e base do app da resposta. O programa executa e a resposta final recebe `<calculos>`. Se o passo falhar, a resposta sai como antes.

**Contra invenção de número.** Todo número literal da conta precisa constar na pergunta, na conversa ou nas fontes lidas (normas, fichas, base do app); constantes de unidade (12, 100, 365...) são livres. O que sobrar é marcado com ⚠ no `<calculos>` e o prompt obriga a IA a apresentar como suposição. Número por extenso (\"três mil\") libera inteiros novos. Dado que falta vira `FALTA:`, nunca chute.

**Verificador.** Resultados da conta (inteiros e em centavos) e os números que a própria pessoa escreveu entram em `citaveis.v`; sem isso, o aviso \"valor sem fonte\" dispararia em toda resposta calculada.

**Não confundir com conta.** Datas, \"Lei 8.742/1993\", \"art. 20, § 3º\", \"CRAS 14 - 18h\" e faixas como \"10-20\" são mascarados; sem palavra de conta (\"quanto é\", \"calcule\", \"soma\"...) só vira resposta direta se houver operador claro.

**Filtro de dados pessoais.** `1518 - 218 - 164 - 58` somava 12 dígitos e era barrado como documento. Agora cadeia com operador entre espaços passa quando a mensagem tem palavra ou símbolo de conta e cada número tem até 8 dígitos. CPF, NIS e telefone (`95-3623-1234`, `123.456.789-01`) continuam barrados.

**Prompt.** O bloco `CONTAS E RACIOCÍNIO NUMÉRICO` só entra em pergunta quantitativa (poupa cota). O trecho \"Como pensar antes de responder\" ganhou etapas explícitas (fato, regra, aplicação, exceção, conclusão com grau de segurança) e a conferência de unidade, período e critério (per capita ou total). Temperatura 0,2 em pergunta de conta. `MODELO_CALCULO` (opcional) troca o modelo do passo de planejamento.
