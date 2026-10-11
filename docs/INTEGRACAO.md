# Ligar o Paulus a um app

O módulo não tem tela. Ele devolve um **resultado** (`r.tipo`) e o app decide como mostrar, normalmente no painel do mascote que já existe.

## 1. Argo SUAS (já tem IA própria)
O Worker novo aceita o formato do Argo atual, então a primeira etapa é só trocar o endereço:

1. Publique o Worker do Paulus ([DEPLOY.md](DEPLOY.md)).
2. Em `js/app.js` do Argo, troque `ARGO_IA.url` pelo endereço do novo Worker.
3. Confirme que o endereço termina em `.workers.dev` (senão, acrescente ao `connect-src` do CSP no `index.html`).

Ganho imediato: o Argo passa a responder norma **com citação** (documento e artigo). O resto do Argo (diretório, glossário, socorro) continua como está.

**Feito (etapa 2):** o Argo carrega uma cópia de `paulus.v1.js` e de `conhecimento.json` (em `js/` e `assets/`, sem depender do GitHub Pages) e usa `Paulus.perguntar` só para a ida à IA. O diretório, o glossário, o socorro e a memória da conversa continuam no `ArgoCerebro`, que decide primeiro e só chama o Paulus para o que sobrou. A função `argoStreamIA` (em `js/app.js`) chama:

```js
Paulus.perguntar(texto, {
  semAcoes: true,            // "abrir/buscar" o Argo já tratou antes
  fichas: payload.contexto,  // fichas do diretório, escolhidas pelo Argo
  historico: payload.historico, // conversa do Argo (inclui respostas do diretório)
  sinal, onToken, onFontes
});
```
`semAcoes`, `fichas` e `historico` por chamada existem para apps que já têm o próprio cérebro. Se `paulus.v1.js` não carregar, o Argo volta ao transporte antigo do `ArgoCerebro`. Quando o Paulus muda: `npm run build` aqui e copie `dist/paulus.v1.js` e `dist/conhecimento-geral.json` (como `assets/conhecimento.json`) para o Argo. Não use o `conhecimento.json` inteiro em app de celular.

**Desde a v0.2.0:**
- O Argo repassa o `panorama` (totais reais do diretório por grupo) que o `ArgoCerebro` já montava. Sem ele, "quantos CAPS existem?" chegava à IA só com fichas soltas e ela contava errado. Qualquer app com diretório pode mandar `panorama: 'texto com os totais'` (até 3000 caracteres) em `perguntar`.
- `Paulus.consultarNormas(texto, { historico })` consulta **só** a base de normas, no aparelho, sem IA e sem rede. Devolve `{ tipo: 'norma', texto, fontes, avisos }` ou `null`. O Argo a usa quando não há IA (offline ou desligada) e nenhuma resposta pronta serve (`argoAskNormasOffline`, em `js/app.js`). Se devolver `null`, o app mostra a resposta de reserva de sempre.
- O motivo das falhas do Worker não se perde mais. Limite por minuto (HTTP 429) volta como `{ tipo: 'erro', limite: true, texto }` (a norma offline não resolve; é só esperar). Cota do dia esgotada (502) ainda entrega a norma da base, ou, se não houver, `sem_resposta` com `motivo`.

**Ainda não feito:** `Paulus.registrarAcao`/`registrarBusca` no Argo (o `ArgoCerebro` já cobre abas e buscas).

## 2. Outros apps (Anona, Toth, Umbrella, ...)

```html
<script src="https://SEU-USUARIO.github.io/paulus/paulus.v1.js"></script>
```
CSP: acrescente `https://SEU-USUARIO.github.io` ao `script-src` e o endereço do Worker e do `conhecimento.json` ao `connect-src`.

```js
Paulus.init({
  app: 'anona',                                   // mesmo identificador de worker/apps.mjs
  endpoint: 'https://paulus-ia.SEU-NOME.workers.dev',
  conhecimentoUrl: 'https://SEU-USUARIO.github.io/paulus/conhecimento.json'
  // fichas: só dados PÚBLICOS. Se o app não tem diretório público, omita.
});

// O que o Paulus pode fazer neste app (só existe o que você registrar)
Paulus.registrarAcao({ id: 'calendario', rotulos: ['calendário', 'calendario pbf'], executar: () => abrirAba('calendario') });
Paulus.registrarAcao({ id: 'limpar', rotulos: ['apagar notas'], confirmar: true, executar: () => apagarNotas() });
Paulus.registrarBusca({ id: 'ferramentas', rotulos: ['ferramenta'], buscar: q => ferramentas.filter(f => f.nome.toLowerCase().includes(q)).map(f => ({ titulo: f.nome })) });
```

## 3. Mostrar o resultado (com segurança)
```js
async function enviar(texto) {
  const bolha = novaBolhaDoPaulus();
  const r = await Paulus.perguntar(texto, {
    aba: abaAtual(),
    onToken: (pedaco, tudo) => { bolha.textContent = tudo; }   // textContent, nunca innerHTML
  });
  if (r.tipo !== 'ia') bolha.textContent = r.texto;
  if (r.tipo === 'crise') mostrarTelefones(r.telefones);          // [{numero, nome}]
  if (r.tipo === 'busca') mostrarLista(r.itens);
  if (r.tipo === 'acao' && r.pedeConfirmacao) pedirConfirmacao(() => r.confirmar());
  if (r.fontes && r.fontes.length) mostrarFontes(r.fontes);       // documento, norma, referencia
  (r.avisos || []).forEach(mostrarAviso);                          // "Resposta gerada por IA..."
}
```
Tipos de `r.tipo`: `ia`, `norma`, `busca`, `acao`, `acao_desconhecida`, `crise`, `bloqueio`, `sem_resposta`, `erro`. Em `erro`, `r.limite === true` indica limite de perguntas (basta esperar); em `sem_resposta`, `r.motivo` traz o que o Worker informou, se informou.

Ao trancar o app ou tocar em "Nova conversa", chame `Paulus.limpar()`.

## 4. Incluir um app novo
1. Acrescente o identificador em `worker/apps.mjs` (com o texto de contexto) e em `client/skins.mjs`.
2. Rode `npm test`, publique o Worker de novo e rebuild do cliente (o Pages faz sozinho no push).

## 5. O que NUNCA fazer
- Ligar o Paulus ao Firestore, a planilhas, notas ou formulários.
- Passar dado de família em `fichas`.
- Inserir a resposta com `innerHTML`.
- Registrar ação que apaga ou altera dado sem `confirmar: true`.
