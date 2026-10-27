# Paulus

Copiloto de IA compartilhado pelos apps (Argo SUAS, Anona, Toth, Umbrella, Grafia). Em cada app ele aparece com o rosto do mascote daquele app.

**O que faz:** responde dúvidas de uso e do SUAS, abre telas, busca coisas dentro do app, cita a norma de onde tirou a resposta (artigo e documento) e **sabe fazer tarefas do trabalho** (habilidades): escrever registro, relatório e ofício, montar PAF, preparar visita, grupo e discussão de caso.

**Faz conta (v0.9.0):** a IA não faz aritmética de cabeça: ela escreve a conta e um programa executa, exato. Pergunta que é só uma conta ("quanto é 15% de 1200?", "1518 - 218 - 164 - 58") é resolvida no próprio aparelho, sem rede e sem gastar cota; problema em palavras ("família de 4 pessoas, renda R$ 3.200, está dentro da linha?") passa por um passo em que a IA só escreve as contas, o programa calcula e a IA explica o resultado. Todo número da conta precisa vir da pergunta ou das fontes lidas; o que não vier é marcado como suposição. Veja [ARQUITETURA](docs/ARQUITETURA.md#cálculo-v090-sharedcalculomjs).

**Dinâmico (v0.6.0):** lê o tipo do pedido (cumprimento, "mais curto", "e para adolescente?", consulta de unidade) e muda busca, prompt e tamanho da resposta; reescreve a resposta anterior quando você pede ajuste; e avisa quando a IA cita artigo ou lei que não estava nas normas consultadas. Veja [ARQUITETURA](docs/ARQUITETURA.md#pedido-dinâmico-v060-sharedpedidomjs).

**Conversa inteira (v0.8.0):** considera a conversa toda, não só as últimas trocas (janela de 5 trocas + resumo das perguntas antigas + estado firmado: unidade, bairro, município e assunto) e só pergunta de volta quando o dado falta de verdade; no mais, responde com a premissa mais provável. Veja [ARQUITETURA](docs/ARQUITETURA.md#conversa-inteira-v080-sharedconversamjs).

**Aprende com o uso (v0.5.0):** estilo de resposta (curto, detalhado, com exemplos), documentos e perguntas frequentes, apelidos para as telas e respostas que você aprovou. **Tudo no aparelho** (nada vai para o servidor) e sob seu controle: ver, desligar, exportar e apagar. Veja [INTEGRACAO](docs/INTEGRACAO.md) (v0.5.0) e [SEGURANCA](docs/SEGURANCA.md).

**O que não faz:** não guarda dado de família, não lê planilha nem registro dos apps e não decide caso individual.

```
app (navegador)                            Worker (Cloudflare)             Workers AI
 ├─ paulus.v1.js  ──── só pergunta filtrada, ─────▶ filtra de novo,  ─────▶ modelo
 │    ├ filtro de dados pessoais            histórico curto e                (gratuito)
 │    ├ socorro (telefones, offline)        fichas PÚBLICAS                  
 │    ├ ações e buscas do app (local)       ◀──── texto em streaming + fontes
 │    └ base de normas (offline)            busca as normas na PRÓPRIA base
 └─ mascote (rosto)                         não grava nada
```

## Estrutura

| Pasta | O que tem |
|---|---|
| `shared/` | filtro de dados pessoais, detector de socorro e busca nas normas (usados no navegador **e** no Worker) |
| `client/` | módulo do navegador (`paulus.mjs`), as "peles" de cada app (`skins.mjs`) e a memória que aprende com o uso (`memoria.mjs`) |
| `worker/` | o Worker: `handler.mjs` (lógica), `prompt.mjs`, `apps.mjs` (um bloco por app) |
| `knowledge/` | base de normas: `documentos/*.md` → `conhecimento.json` |
| `habilidades/` | roteiros de trabalho (relatório, ofício, visita, PAF...) que o Paulus carrega quando o pedido combina; veja [docs/HABILIDADES.md](docs/HABILIDADES.md) |
| `scripts/` | `build.mjs` (gera `dist/`), `build-knowledge.mjs` (base e catálogo), `build-habilidades.mjs` (habilidades), `ingerir.mjs` (lote de PDFs), `importar-documento.mjs` (referências técnicas) e `importar-norma.mjs` (leis, por artigo) |
| `tests/` | testes (`npm test`), sem dependências |
| `docs/` | arquitetura, segurança, integração, conhecimento e deploy |

## Começar

```bash
npm test                  # roda todos os testes
npm run build:conhecimento
npm run build:habilidades
npm run build             # gera dist/paulus.v1.js e dist/conhecimento.json
```

Não há dependências para instalar. Precisa de Node 20 ou mais novo.

Para publicar, siga [docs/DEPLOY.md](docs/DEPLOY.md). Para ligar a um app, [docs/INTEGRACAO.md](docs/INTEGRACAO.md). Outros documentos: [ARQUITETURA](docs/ARQUITETURA.md), [SEGURANCA](docs/SEGURANCA.md), [CONHECIMENTO](docs/CONHECIMENTO.md).

## Uso no app (resumo)

```html
<script src="https://SEU-USUARIO.github.io/paulus/paulus.v1.js"></script>
<script>
  Paulus.init({
    app: 'anona',
    endpoint: 'https://paulus-ia.SEU-NOME.workers.dev',
    conhecimentoUrl: 'https://SEU-USUARIO.github.io/paulus/conhecimento.json',
    fichas: (texto, aba) => []   // só dados PÚBLICOS (ex.: diretório de unidades)
  });
  Paulus.registrarAcao({ id: 'calendario', rotulos: ['calendário', 'calendario pbf'], executar: () => abrirAba('calendario') });
  Paulus.perguntar('quem gere o Cadastro Único no município?', { onToken: (t, tudo) => mostrar(tudo) })
    .then(r => mostrarResultado(r));
  // no 👍/👎/"mais curto": Paulus.avaliar(r, 'bom' | 'ruim' | 'mais_curto' | 'mais_detalhe' | 'outro_jeito' | 'copiou')
  // sugestões do mascote: Paulus.sugestoesPessoais(3)   // r.tipo: ia | norma | busca | acao | calculo | crise | bloqueio | sem_resposta | erro
</script>
```

## Estado atual

- Base de normas: veja `knowledge/catalogo.json`. Já preparada para receber os documentos da **psicologia no SUAS** (mandando os PDFs pelo Claude: [docs/ALIMENTAR-PELO-CLAUDE.md](docs/ALIMENTAR-PELO-CLAUDE.md)) (`npm run ingerir`, passo a passo em [docs/CONHECIMENTO.md](docs/CONHECIMENTO.md) e `knowledge/entrada/LEIA-ME.md`). Ainda faltam o texto completo da NOB/SUAS 2012, a Tipificação Nacional e a PNAS 2004.
- O módulo é **sem tela**: o chat de cada app continua sendo o painel do mascote. **Argo SUAS, Umbrella, Anona, Toth e Grafia já estão ligados** (passo a passo em [docs/INTEGRACAO.md](docs/INTEGRACAO.md)).
- Os textos de `worker/apps.mjs` para Toth, Umbrella, Anona e Grafia foram escritos a partir do código e do README dos apps. Revise quando os apps mudarem.
