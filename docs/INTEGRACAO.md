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

**Desde a v0.3.0 (interação com o mascote):**
- A IA termina respostas explicativas com `SUGESTÕES: a | b | c`. O Paulus tira esse rótulo do texto (inclusive durante o streaming, em `onToken`) e devolve `r.sugestoes` (até 3 perguntas curtas) para o app mostrar como botões.
- No Worker, o prompt agora define a persona (primeira pessoa, sem "Olá/Claro!", honesta quando o dado não consta) e o bloco do Argo diz que a IA aparece como o mascote.
- No Argo, o mascote usa isso para: botões de continuação, lista de fontes que abre e fecha, humor que acompanha o que foi dito ("não consta" → carinha de dúvida; telefone fora do diretório → preocupado), fases no cabeçalho ("procurando no diretório…", "consultando as normas…", "escrevendo…"), cabeça que inclina enquanto você digita e assente enquanto ele escreve, 👍 com coração e 👎 com opções de "explicar de outro jeito"/"mais curto", e "↻ Tentar de novo" quando a IA falha. Para outros apps: copie as mesmas ideias de `mountAssistant` em `argo-mascot.js`.
- Depois de mudar o prompt, publique o Worker de novo (`npm run deploy:worker`); sem isso a IA não envia as sugestões (o app continua funcionando, só sem os botões).

**Ainda não feito:** `Paulus.registrarAcao`/`registrarBusca` no Argo (o `ArgoCerebro` já cobre abas e buscas).

## 1b. Umbrella (PAF/PAIF do CRAS)

**Feito.** O Umbrella carrega uma cópia local de `paulus.v1.js` e de `conhecimento.json` (pacote *geral*),
como o Argo. A ligação inteira está em `paulus-umbrella.js` (no Umbrella): o clique no mascote abre um painel
de conversa, e o `app.js` só tem dois ganchos (`paulusAbrir` no clique do mascote e `paulusEncerrar` ao sair da conta).

- **Sem dados de família.** O Umbrella guarda PAFs, mas a integração não lê `state.pafs`, anexos nem Firestore,
  não passa `fichas` e **não registra buscas sobre os PAFs** (de propósito: seria ligar o Paulus a dados de família).
- **Ações registradas** (mesmas funções dos botões do topo): `registros`, `prioridades`, `graficos`, `configuracoes` e
  `novo-paf` (com `confirmar: true`, porque `newPAF()` salva um PAF em branco na hora).
- **Pergunta com dado pessoal:** o Paulus bloqueia antes de qualquer rede e o painel oculta a mensagem na tela.
- **Fim de sessão** (sair, inatividade, conta desativada): `Paulus.limpar()` e o painel é removido.
- **CSP** (`index.html`): `connect-src` ganhou `https://*.workers.dev`. `script-src` não muda (cópia local).
- **Service worker** (`sw.js`): guarda `paulus.v1.js`, `paulus-umbrella.js` e `conhecimento.json` para uso offline.
- O texto de `worker/apps.mjs` para o Umbrella foi escrito a partir do README e do código do app; revise quando o app mudar
  (abas, seções do PAF, regras como o botão "Família desistiu"). **Depois de mudar, publique o Worker de novo.**
- Falta no Umbrella: botões 👍/👎 e "↻ Tentar de novo" (o Argo tem).

## 1c. Anona (condicionalidades do Bolsa Família)

**Feito.** Mesma estrutura do Umbrella: cópia local de `paulus.v1.js` e de `conhecimento.json` (pacote *geral*, `dist/conhecimento-geral.json` renomeado) e a ligação inteira em `paulus-anona.js` (no Anona).

- **Painel:** abre ao tocar no mascote, só com a conta logada (sem login o mascote segue dando dicas). `anona-mascot.js` ganhou `AnonaMascot.aoClicar(fn)`; se `fn` devolver `true`, a dica aleatória não aparece.
- **Sem dados de família.** O Anona guarda notas e planilhas, mas a integração não lê `notes`, planilhas, PDFs nem Firestore, não passa `fichas` e **não registra buscas** (de propósito). Pergunta com NIS, CPF, nome ou endereço é bloqueada antes de qualquer rede e a mensagem é ocultada na tela.
- **Ações registradas** (só rolam a página até o cartão; nada que altere dado): `calendario`, `nis`, `sicon`, `destaques`, `territorio`, `exportar`, `sacar`, `devolucao`, `participar`, `condicionalidades`, `cadunico`, `cronograma`, `recurso`, `motivos`. O app é uma página única; a ação procura o `<h2>` pelo título. Se mudar o título de um cartão, ajuste `registrarAcoes()` em `paulus-anona.js`.
- **Fim de sessão:** o `index.html` dispara o evento `anona:auth` em `runAuthUI`; ao sair da conta, `Paulus.limpar()` e o painel é removido.
- **Endereço do Worker:** constante `ENDPOINT` no topo de `paulus-anona.js` (o mesmo do Argo). Já aponta para `https://paulus-ia.paulo-ae18.workers.dev`; com a constante vazia, a IA fica desligada e só a base de normas offline responde.
- **Worker:** o `ALLOWED_ORIGINS` precisa conter o domínio do Anona (`https://paulusxavier.github.io` já serve, se o Anona estiver nele). O texto de `worker/apps.mjs` foi reescrito a partir do README e do código do Anona. **Publique o Worker de novo** (`npm run deploy:worker`).
- **Service worker** (`sw.js`, v23): guarda `paulus.v1.js`, `paulus-anona.js` e `conhecimento.json` para uso offline. O Anona não tem CSP, então nada a acrescentar.
- O painel tem Copiar, 👍/👎 (só no aparelho; 👎 oferece "explicar de outro jeito" e "mais curto") e "↻ Tentar de novo" quando a IA falha.

## 1d. Toth (Diário de Campo)

**Feito.** Mesma estrutura do Anona: cópia local de `paulus.v1.js` e de `conhecimento.json` (pacote *geral*, `dist/conhecimento-geral.json` renomeado) e a ligação inteira em `paulus-toth.js` (no Toth).

- **Painel:** abre ao tocar no mascote, só com a conta logada (sem login o mascote segue dando dicas). `toth-mascot.js` ganhou `TothMascot.aoClicar(fn)`; se `fn` devolver `true`, a dica aleatória não aparece.
- **Sem dados de caso.** O diário guarda relatos de atendimento, mas a integração não lê `registros`, o formulário, a busca, nem o Firestore, não passa `fichas` e **não registra buscas** (de propósito). Pergunta com nome, documento, telefone ou endereço é bloqueada antes de qualquer rede e a mensagem é ocultada na tela.
- **Ações registradas** (só navegação): as seis abas (`aba-todos`, `aba-atendimento`, `aba-visita`, `aba-visitatecnica`, `aba-grupo`, `aba-pendente`), `novo-registro` (só abre o formulário, não salva) e `exportar-json/csv/word/pdf` (com `confirmar: true`, porque baixam os relatos). Importar backup, excluir e sair **não** são ações do Paulus.
- **Fim de sessão:** o `app.js` dispara o evento `toth:auth` em `onAuthStateChanged` (e guarda `window.__tothLogado`); ao sair da conta, `Paulus.limpar()` e o painel é removido.
- **Endereço do Worker:** constante `ENDPOINT` no topo de `paulus-toth.js` (o mesmo do Argo e do Anona). O `ALLOWED_ORIGINS` já serve se o Toth estiver em `https://paulusxavier.github.io`.
- **Service worker** (`sw.js`, v32): guarda `paulus.v1.js`, `paulus-toth.js` e `conhecimento.json` para uso offline. O Toth não tem CSP, então nada a acrescentar.
- O painel tem Copiar, "Mais curto", sugestões, fontes que abrem e fecham, telefones de emergência em caso de crise e "↻ Tentar de novo" quando a IA falha. Falta 👍/👎 (o Anona tem).
- O texto de `worker/apps.mjs` para o Toth foi reescrito a partir do código do app. **Publique o Worker de novo** (`npm run deploy:worker`); sem isso a IA ainda usa o texto antigo (só o nome do app).
- Quando o Paulus mudar: `npm run build` aqui e copie `dist/paulus.v1.js` e `dist/conhecimento-geral.json` (como `conhecimento.json`) para o Toth.

## 1e. Grafia (bloco de notas)

**Feito.** Mesma estrutura do Toth: cópia local de `paulus.v1.js` e de `conhecimento.json` (pacote *geral*, `dist/conhecimento-geral.json` renomeado) e a ligação inteira em `paulus-grafia.js` (no Grafia).

- **Painel:** abre ao tocar no mascote do topo (caderninho), só com a conta logada. O painel usa o mesmo desenho do mascote do app (clonado do `<template id="mascot-template">`).
- **Sem dados de nota.** A integração não lê `allNotes`, o modal de nota, o campo de busca nem o Firestore, não passa `fichas` e **não registra buscas** (de propósito). Pergunta com nome, documento, telefone ou endereço é bloqueada antes de qualquer rede e a mensagem é ocultada na tela.
- **Ações registradas** (só navegação, nada salva ou apaga): `nova-nota` (clica em "+ Nova nota"; abre a nota em branco) e `buscar-notas` (foca o campo de busca).
- **Fim de sessão:** o `app.js` dispara o evento `grafia:auth` em `onAuthStateChanged` (e guarda `window.__grafiaLogado`); ao sair da conta, `Paulus.limpar()` e o painel é removido.
- **Endereço do Worker:** constante `ENDPOINT` no topo de `paulus-grafia.js` (o mesmo dos outros apps). O `ALLOWED_ORIGINS` já serve se o Grafia estiver em `https://paulusxavier.github.io`.
- **CSP** (`index.html`): `connect-src` ganhou `https://*.workers.dev`. `script-src` não muda (cópia local).
- **Estados do mascote:** o `<svg class="mascot">` tem `data-estado` (`repouso`, `pensando`, `escrevendo`, `atento`, `duvida`, `ouvindo`, `dormindo`), trocado por `estado()` em `paulus-grafia.js`. Mapeamento: fase "pensando…" → `pensando`; "escrevendo…" → `escrevendo`; `r.tipo` `crise`/`bloqueio` → `atento`; `sem_resposta`/`erro` → `duvida`; digitando no campo → `ouvindo`; sem internet → `dormindo`. As animações ficam em `style.css` e respeitam `prefers-reduced-motion`. O mascote só muda de aparência: não lê nota, título nem busca.
- **Service worker** (`service-worker.js`, v21): guarda `paulus.v1.js`, `paulus-grafia.js` e `conhecimento.json` para uso offline.
- O painel tem Copiar, "Mais curto", sugestões, fontes que abrem e fecham, telefones de emergência em caso de crise, Parar e "↻ Tentar de novo". Falta 👍/👎.
- O texto de `worker/apps.mjs` para o Grafia foi escrito a partir do código e do README do app. **Publique o Worker de novo** (`npm run deploy:worker`); sem isso o Worker rejeita `app: 'grafia'` (app desconhecido).
- Quando o Paulus mudar: `npm run build` aqui e copie `dist/paulus.v1.js` e `dist/conhecimento-geral.json` (como `conhecimento.json`) para o Grafia.

## 2. Outros apps

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
