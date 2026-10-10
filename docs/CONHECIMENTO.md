# Base de normas

É o que permite ao Paulus **citar a norma** (documento e artigo). Ela serve a três coisas:
1. **Navegador, offline:** quando não há internet ou a IA falha, o app mostra o trecho da norma que mais combina com a pergunta.
2. **Worker:** a cada pergunta, o Worker busca os 3 trechos mais próximos e os coloca no prompt como `<normas>`. A IA só pode citar artigo que esteja ali.
3. **Fontes:** o Worker devolve a lista (`documento`, `norma`, `ano`, `referencia`) para o app mostrar abaixo da resposta.

## Como está organizada
```
knowledge/
├── entrada/                       ← PDFs e manifesto.json de um lote novo (veja entrada/LEIA-ME.md)
├── documentos/*.md                ← um arquivo por documento (gerados pelos importadores; você confere e edita)
├── conhecimento.json              ← gerado, não edite (a base que o Worker e os apps leem)
└── catalogo.json                  ← gerado: a lista do que está carregado (documento, tipo, pacote, nº de trechos)
```

## Três tipos de documento (campo `tipo`)
O Paulus precisa saber o peso de cada trecho que cita. Sem isso, uma orientação técnica viraria "a lei diz".

| `tipo` | O que é | Exemplos | Como o Paulus fala |
|---|---|---|---|
| `norma` (padrão) | Lei, decreto, resolução: tem força normativa. Resoluções do CFP e do CNAS contam aqui. | LOAS, NOB/SUAS, Tipificação, Código de Ética (Res. CFP 010/2005) | "Segundo o art. X…" e pode dizer que é obrigatório |
| `referencia` | Orientação técnica oficial: orienta, não obriga | Referências Técnicas do CFP/CREPOP para CRAS e CREAS, Orientações Técnicas do MDS | "Segundo as Referências Técnicas…", nunca "a lei determina" |
| `apoio` | Material de apoio: cartilha, nota técnica, artigo | publicações de conselhos e universidades | "Material de apoio" |

O Paulus devolve o tipo em cada fonte (`fontes[i].tipo`, só quando não é norma) e, no modo offline, já avisa que o trecho não é norma legal. **Para o tipo aparecer na tela, o app precisa mostrá-lo** onde lista as fontes (ex.: "orientação técnica" ao lado do documento).

## Acrescentar ou corrigir uma norma
1. Crie `knowledge/documentos/NOME.md` (ou edite um existente):
   ```
   ---
   doc: tipificacao-2009
   titulo: Tipificação Nacional
   norma: Resolução CNAS nº 109, de 11 de novembro de 2009
   ano: 2009
   ---

   ## Proteção Social Básica, Serviço de Convivência e Fortalecimento de Vínculos

   Texto copiado da norma, sem resumir.
   ```
   - `doc`: identificador curto, só minúsculas, números e hífen. Não repita em outro arquivo.
   - Cada `## ...` é um **trecho citável**; o que vem depois do `##` é a referência mostrada ao usuário (ex.: `art. 17, XV`).
   - Um trecho por artigo ou inciso. Trechos curtos (até uns 700 caracteres) funcionam melhor na busca.
   - Arquivos que começam com `_` são ignorados (bom para rascunho).
2. `npm run build:conhecimento` (o teste `tests/conhecimento.test.mjs` avisa se você esquecer).
3. `npm test`, `npm run build`, publique o Worker e o site ([DEPLOY.md](DEPLOY.md)) e copie `dist/conhecimento.json` para os apps com cópia local (Argo).

## Alimentar com vários documentos (psicologia no SUAS e outros)
**Mandando os PDFs pelo Claude (o jeito mais simples): veja [ALIMENTAR-PELO-CLAUDE.md](ALIMENTAR-PELO-CLAUDE.md).** Abaixo, o fluxo manual, no seu computador.
Fluxo para um lote de PDFs. Detalhes e exemplo em [`knowledge/entrada/LEIA-ME.md`](../knowledge/entrada/LEIA-ME.md).
1. PDFs em `knowledge/entrada/` e uma entrada para cada um em `knowledge/entrada/manifesto.json` (`doc`, `titulo`, `norma`, `ano`, `tipo`, `pacote`, `url`).
2. `npm run ingerir` converte cada PDF em `knowledge/documentos/<doc>.md`. Para **lei, decreto e resolução com artigos**, use `"modo": "norma"` (um trecho por artigo). Para **referências técnicas e cartilhas** (capítulos e seções, sem artigos), o padrão `"modo": "documento"`: títulos, página e cabeçalho/rodapé são tratados.
3. **Confira por amostragem** com `npm run conferir -- <doc>` (mostra trechos do começo, do meio e do fim, com a página, para comparar com o PDF; vale olhar também uma página com tabela e uma com nota de rodapé). A importação avisa de PDF escaneado, palavras cortadas, sumário e trechos estranhos, e lista as seções reconhecidas. Estando certo: `npm run conferir -- <doc> --conferido`.
4. `npm run build:conhecimento` (mostra o catálogo e os documentos ainda por conferir) → `npm test` → `npm run build` e publique ([DEPLOY.md](DEPLOY.md)).

Cada trecho vira uma citação como `Capítulo 2 Atuação no CRAS, 2.1 Acolhimento e escuta qualificada, p. 45`. A página é a do PDF; se a numeração impressa começa mais adiante, use `deslocamento` (página impressa = página do PDF − N) para o Paulus citar a página que a pessoa vê no papel.

**Pacotes.** `pacote: psicologia` agrupa documentos. O `npm run build` gera `dist/conhecimento.json` (tudo) e, havendo mais de um pacote, `dist/conhecimento-psicologia.json`, `dist/conhecimento-geral.json`… Um app que só precisa do básico (ex.: Argo, que consulta o diretório) pode apontar `conhecimentoUrl` para o pacote mais leve; o Toth usa o completo. O Worker sempre busca em **tudo**.

**Tamanho.** Conte uns 4 trechos por página de texto (10 páginas ≈ 40 trechos). Uma dezena de documentos de 100 páginas passa de 3 MB de JSON, que é baixado uma vez e fica em cache no app (o GitHub Pages comprime na transferência). O Worker leva a base dentro do pacote publicado; confira o limite do seu plano da Cloudflare antes de passar de uns 8 MB de JSON.

## Importar uma norma inteira (sem digitar)
1. Copie o texto oficial (site do Planalto para leis; site do Ministério para resoluções do CNAS) e cole em um arquivo `.txt`. Se só houver PDF, extraia o texto (`pdftotext -layout arquivo.pdf norma.txt`).
2. Rode:
   ```bash
   node scripts/importar-norma.mjs norma.txt --doc loas-1993 --titulo "LOAS" --norma "Lei nº 8.742, de 7 de dezembro de 1993" --ano 1993
   ```
   Isso cria `knowledge/documentos/loas-1993.md` com um trecho por artigo (ou por inciso/parágrafo, nos artigos longos). Títulos, números de página, notas "(Redação dada...)" e artigos revogados ficam de fora.
3. **Leia o `.md` ao lado do texto oficial.** O programa avisa de palavras cortadas e artigos fora de ordem, mas não confere o conteúdo.
4. `npm run build:conhecimento`, `npm test` e publique ([DEPLOY.md](DEPLOY.md)).

## Estado atual
Veja `knowledge/catalogo.json` (gerado) para a lista exata. Hoje há a LOAS, extratos da CF/88, vários decretos, a Lei 14.601/2023, material do Bolsa Família e do CadÚnico, a RAPS e um **trecho** da NOB/SUAS 2012 (arts. 8º a 17).

Pacote `psicologia` (CFP/CREPOP, tipo `referencia`): CRAS, CREAS, gestão de riscos e desastres, álcool e outras drogas (2019), IST/HIV/aids (2020), serviços hospitalares do SUS (2019), sistema prisional (2021), educação básica (2019), atenção básica à saúde (2019), CAPS (2022), povos indígenas (2024), povos quilombolas (2025), medidas socioeducativas (2021), população em situação de rua (2025), mulher em situação de violência (2013), pessoas idosas (2025) e violência sexual contra crianças e adolescentes (2020), além do material para gestoras e gestores do SUAS (2ª edição, 2025, tipo `apoio`, que convive com a 1ª edição de 2011), além do relatório do Seminário de Psicologia e Políticas Públicas sobre refúgio, migração e apatridia (2024, tipo `apoio`). Os importados de `.txt` (álcool e drogas, IST/HIV/aids, hospitalar, prisional, CAPS, povos indígenas, quilombolas, relatório de migrações, SUAS 2025, população em situação de rua, mulher e pessoas idosas) não têm número de página: a fonte mostra só o capítulo/eixo. Reenvie o PDF original se quiser a página citada.\n\nFaltam (a alimentar): o texto oficial completo da NOB/SUAS 2012, a Tipificação Nacional (Res. CNAS 109/2009), a PNAS 2004 os documentos do IsesWeb que você indicar e **os documentos da psicologia no SUAS** (lista de sugestões em `knowledge/entrada/LEIA-ME.md`).

**Copie sempre do texto oficial** (Diário Oficial ou site do Ministério/do Conselho). Não peça a uma IA para "lembrar" a norma: um artigo inventado aqui aparece como citação oficial para o profissional.

## Como a busca funciona (e seus limites)
Busca por palavras (BM25) com raiz simples das palavras. Siglas (CadÚnico, PBF, BPC, LOAS, CFP, CRP, ECA, PAIF, PAEFI, SCFV...) entram no mesmo "conceito" que o nome por extenso: perguntar "ECA" acha tanto o trecho que diz "ECA" quanto o que diz "Estatuto da Criança e do Adolescente". Verbo e substantivo de mesma raiz se encontram pela própria raiz (atuar/atua/atuação, acolher/acolhimento); formas irregulares são unidas à mão em `ALIAS`. Não entende sentido: "quem cuida do Bolsa Família" só acha trecho que tenha palavras parecidas. Por isso a base deve usar os termos que as pessoas digitam. Para novas siglas, acrescente em `SIGLAS`; para novas formas de palavra, em `ALIAS` (`shared/busca.mjs`). Cada pergunta recebe os 4 trechos mais próximos (`K_PADRAO`).

Se uma pergunta importante não achar o trecho certo, em geral falta uma palavra: veja como o documento chama aquilo e acrescente a sigla ou o sinônimo.
