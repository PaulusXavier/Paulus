# Paulus

Copiloto de IA compartilhado pelos apps (Argo SUAS, Anona, Toth, Umbrella, Grafia). Em cada app ele aparece com o rosto do mascote daquele app.

**O que faz:** responde dúvidas de uso e do SUAS, abre telas, busca coisas dentro do app, cita a norma de onde tirou a resposta (artigo e documento) e **sabe fazer tarefas do trabalho** (habilidades): escrever registro, relatório e ofício, montar PAF, preparar visita, grupo e discussão de caso.

**Traça rotas (v0.12.0):** "traçar rota saindo do CRAS X: UBS Y, CAPS II e Conselho Tutelar, voltando ao CRAS X, de moto, 30 minutos em cada". Um programa no aparelho (`shared/rota.mjs`, sem IA e sem rede) lê o pedido, acha as unidades no diretório do app, escolhe a **melhor ordem** (busca exata, até 11 paradas), mede km e tempo, e devolve texto, link do app de mapas, esquema em SVG e GeoJSON. Entende "como chegar ao...", "de X até Y passando por...", "nessa ordem", "saindo daqui", a pé, bicicleta, moto e carro. É **estimativa** (linha reta × 1,3 a uma velocidade média, sem trânsito) e só vale **entre unidades, serviços e bairros**: endereço de residência de família é recusado. O app passa o diretório com coordenadas em `Paulus.init({ pontos })`; veja [INTEGRACAO](docs/INTEGRACAO.md#rotas-v0120).

**Mais dinâmico e com raciocínio melhor (v0.11.0):** o Paulus agora entende pedidos *sobre a própria resposta*: **continuar** ("continue", "tem mais?") retoma de onde parou sem repetir; **contestação** ("tem certeza?", "mas eu li que...") reanalisa contra as fontes, corrige se errou e mantém se a norma sustenta, sem ceder por educação; **por quê?** ("de onde tirou isso?", "qual a fonte?") explica o caminho e separa o que é norma do que é leitura. **Mensagem com várias perguntas** recebe uma busca de norma para cada parte e a IA responde todas, na ordem. O passo de raciocínio passou a rodar também em decisão curta ("Posso registrar isso como visita?") e na contestação. Tudo isso é regra, sem gastar IA para classificar.

**Faz conta (v0.9.0):** a IA não faz aritmética de cabeça: ela escreve a conta e um programa executa, exato. Pergunta que é só uma conta ("quanto é 15% de 1200?", "1518 - 218 - 164 - 58") é resolvida no próprio aparelho, sem rede e sem gastar cota; problema em palavras ("família de 4 pessoas, renda R$ 3.200, está dentro da linha?") passa por um passo em que a IA só escreve as contas, o programa calcula e a IA explica o resultado. Todo número da conta precisa vir da pergunta ou das fontes lidas; o que não vier é marcado como suposição. Veja [ARQUITETURA](docs/ARQUITETURA.md#cálculo-v090-sharedcalculomjs).

**Raciocina antes de responder (v0.9.1):** em pergunta de análise ("posso/devo", elegibilidade, caso pensado junto), a IA monta primeiro um esqueleto (fato, regra da fonte, exceção mais provável, o que falta, caminho) e só então responde, conferindo contra as fontes e dizendo o grau de segurança. Veja [ARQUITETURA](docs/ARQUITETURA.md#raciocínio-v091-workerraciocinarmjs).

**Dinâmico (v0.6.0):** lê o tipo do pedido (cumprimento, "mais curto", "e para adolescente?", consulta de unidade) e muda busca, prompt e tamanho da resposta; reescreve a resposta anterior quando você pede ajuste; e avisa quando a IA cita artigo ou lei que não estava nas normas consultadas. Veja [ARQUITETURA](docs/ARQUITETURA.md#pedido-dinâmico-v060-sharedpedidomjs).

**Conversa inteira (v0.8.0):** considera a conversa toda, não só as últimas trocas (janela de 5 trocas + resumo das perguntas antigas + estado firmado: unidade, bairro, município e assunto) e só pergunta de volta quando o dado falta de verdade; no mais, responde com a premissa mais provável. Veja [ARQUITETURA](docs/ARQUITETURA.md#conversa-inteira-v080-sharedconversamjs).

**Se compreende (v0.10.0):** o Paulus sabe o que ele mesmo é, tem e não faz. A pergunta sobre ele ("o que você sabe fazer?", "de onde vêm suas respostas?", "você guarda minhas conversas?", "quais normas você tem?") é reconhecida sem gastar IA e respondida com uma **ficha de si montada do próprio repositório** (versão, catálogo da base com o que está conferido e o que não, as habilidades, os apps, o jeito de funcionar, o que não faz e as lacunas conhecidas). Ensinou uma habilidade nova ou acrescentou um documento: a ficha muda sozinha. Nessas perguntas ele não busca norma nem cita artigo, e o que não consta na ficha ele diz que não sabe dizer de si. Veja [ARQUITETURA](docs/ARQUITETURA.md#autoconhecimento-v0100-sharedautoconhecimentomjs).

**CRAS a fundo:** 36 roteiros próprios (`habilidades/cras-*.md`) sobre o CRAS como unidade, além do PAIF: natureza e função, serviços, território e referenciamento, equipe de referência por faixa de famílias, coordenação, espaço físico, funcionamento mínimo, recepção e fluxo, pedidos frequentes, limites de competência, vigilância e busca ativa, equipes volantes e CRAS itinerante, passagem de caso ao CREAS, Censo SUAS e RMA, cofinanciamento, demanda maior que a equipe, primeiros dias de trabalho, controle social, contexto de Roraima, linguagem simples para a família, glossário, linha do tempo das normas, relatório de atividades, plano de ação anual, papéis profissionais, seguranças afiançadas, princípios e diretrizes, SCFV referenciado, casos práticos, perguntas de estudo, articulação com saúde e escola, ética e clientelismo, formação da equipe, indicadores de qualidade, rotina semanal e atendimento remoto com sigilo. Os roteiros se apoiam nos documentos que já estão na base (LOAS, Tipificação, NOB/SUAS, NOB-RH comentada, Resolução CNAS 17/2011 e referência técnica do CFP) e não repetem artigo nem número de lei: isso vem das fontes. Faixas de famílias, valores e composição de equipe mudam, então o Paulus manda conferir a norma vigente.

**RAPS a fundo:** oito documentos de apoio na base (Portaria 3.088/2011, normas posteriores até a revisão de 2026, Lei 10.216, Lei 13.840, Resolução CNJ 487, leis complementares, guia da RAPS e contexto de Boa Vista e Roraima, todos como resumos `revisao: pendente`) e 36 roteiros próprios (`habilidades/raps-*.md`): componentes e pontos de atenção, CAPS e suas modalidades, encaminhamento e contrarreferência, matriciamento e PTS, urgência e crise, internação, Unidade de Acolhimento, comunidades terapêuticas, SRT e Volta para Casa, CECO, Consultório na Rua, álcool e drogas, crianças e adolescentes, autismo e deficiência, benefícios, curatela, Justiça e medida de segurança, indígenas e migrantes, pessoa idosa, reabilitação e renda, direitos e denúncia, família e cuidadores, glossário, história da Reforma Psiquiátrica, gestão e financiamento. Valor de custeio, porte de município e prazo mudam: o Paulus manda conferir a norma vigente.

**PAF a fundo:** guia de apoio do Plano de Acompanhamento Familiar na base (`paif-paf-plano-acompanhamento`) e quinze roteiros próprios (`habilidades/paf-*.md`): metas e estratégias, encontro inicial e compromissos, revisão e histórico, família que falta ou some e encerramento, particularizado ou em grupo, checklist de qualidade, situações específicas (migrantes, indígenas, BPC, descumprimento...), registro/RMA, potencialidades da família, escala de prioridades, linguagem do registro (de rótulo para fato), conversa para construir o plano com a família, genograma e ecomapa, metas conforme a composição da família e o Histórico de Evolução no Umbrela. O que é prática sugerida vem marcado como tal; número de encontros, duração e famílias por técnico ele não afirma como norma. Os mesmos roteiros vão para a base dos apps com IA própria (`node scripts/gerar-roteiros-paf.mjs`).

**Avaliação psicológica:** guia de apoio na base (`cfp-avaliacao-psicologica-guia`, resumo das Res. CFP 31/2022 e 06/2019 e dos limites no CRAS, conferência pendente) e nove roteiros próprios (`habilidades/avaliacao-psicologica-*.md`): visão geral, limites no CRAS/SUAS, testes e SATEPSI, entrevista e observação, documentos e qual usar, relatório psicológico e multiprofissional, devolutiva, ética e direitos humanos, pedidos de laudo. O Paulus explica e ajuda a escrever, mas não avalia nem diagnostica pessoa real, não afirma que um teste está aprovado (manda conferir no SATEPSI) e só cita artigo que esteja nas fontes.

**Psicodiagnóstico:** guia de apoio conceitual na base (`psicodiagnostico-guia-apoio`) e cinco roteiros (`habilidades/psicodiagnostico-*.md`): o que é, etapas, hipóteses e diagnóstico diferencial, laudo e devolutiva, encaminhamento pela rede. Explica o método e ajuda a escrever; não faz nem sugere diagnóstico de pessoa real, e no CRAS orienta encaminhar à saúde.

**Psicopatologia:** guia de apoio conceitual (`psicopatologia-guia-apoio`) e cinco roteiros (`habilidades/psicopatologia-*.md`): modelos de compreensão, semiologia, quadros principais em visão descritiva, crise e rede, estigma e linguagem. Ensina e ajuda a descrever e registrar; não classifica nem sugere diagnóstico de pessoa real, não orienta medicação, e crise com risco de vida segue o fluxo de urgência.

**Dados com R:** guia de apoio na base (`r4ds-guia-apoio`) e quinze roteiros próprios (`habilidades/dados-r-*.md`), seguindo o ciclo de "R para Ciência de Dados" (pt.r4ds.hadley.nz): primeiros passos, scripts e projetos, importar, tidy, dplyr, ggplot2, texto/datas/fatores, joins, valores faltantes, funções, Quarto, erros e uma primeira análise completa. Ensina com dado fictício ou agregado; não roda código, não vê dados da pessoa e não aceita dado de família (há um roteiro de LGPD e cuidado). O livro é CC BY-NC-ND: os roteiros são texto próprio e indicam o capítulo, sem reproduzi-lo.

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

- Base de normas: veja `knowledge/catalogo.json`. Já preparada para receber os documentos da **psicologia no SUAS** (mandando os PDFs pelo Claude: [docs/ALIMENTAR-PELO-CLAUDE.md](docs/ALIMENTAR-PELO-CLAUDE.md)) (`npm run ingerir`, passo a passo em [docs/CONHECIMENTO.md](docs/CONHECIMENTO.md) e `knowledge/entrada/LEIA-ME.md`). A Tipificação Nacional (Res. CNAS 109/2009, texto integral) e a Res. CNAS/MDS 218/2025 (serviço no domicílio para gestantes e crianças de 0 a 6 anos) já estão na base, com conferência pendente. Ainda faltam o texto completo da NOB/SUAS 2012 e a PNAS 2004.
- O módulo é **sem tela**: o chat de cada app continua sendo o painel do mascote. **Argo SUAS, Umbrella, Anona, Toth e Grafia já estão ligados** (passo a passo em [docs/INTEGRACAO.md](docs/INTEGRACAO.md)).
- Os textos de `worker/apps.mjs` para Toth, Umbrella, Anona e Grafia foram escritos a partir do código e do README dos apps. Revise quando os apps mudarem.
