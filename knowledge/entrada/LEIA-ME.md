# Entrada de documentos

Pasta de trabalho para alimentar o Paulus com um **lote** de documentos (por exemplo, os da psicologia no SUAS).
Os PDFs ficam aqui (e fora do Git); o resultado vai para `../documentos/*.md`.

> Mandando os PDFs pelo Claude? Veja `docs/ALIMENTAR-PELO-CLAUDE.md`: ele faz estes passos por você.

## Passo a passo
1. (Opcional) `npm run inspecionar -- knowledge/entrada --rascunho` mostra o que há em cada PDF e já monta um rascunho do manifesto.
2. Copie os PDFs para esta pasta.
3. Copie `manifesto.exemplo.json` para `manifesto.json` e deixe **uma entrada por documento** (apague as de exemplo).
4. Rode, na raiz do projeto: `npm run ingerir`
   - precisa do `pdftotext` (Linux: `sudo apt install poppler-utils`; Mac: `brew install poppler`; Windows: poppler para Windows). Alternativa: salve o PDF como `.txt` e ponha o nome do `.txt` em `arquivo`.
   - entradas cujo `.md` já existe são puladas (assim você não perde a conferência nem as edições). Para **refazer** uma: `npm run ingerir -- --so cfp-ref-cras --forcar`; para todas: `-- --forcar`.
5. Leia os **avisos** e a lista de seções reconhecidas de cada documento. **Confira por amostragem**: `npm run conferir -- cfp-ref-cras` mostra 8 trechos espalhados (começo, meio e fim) com a página citada, para comparar com o PDF. Estando certo: `npm run conferir -- cfp-ref-cras --conferido`.
6. `npm run build:conhecimento` → `npm test` → `npm run build` → publique (veja `docs/DEPLOY.md`).

## Campos do manifesto
| Campo | Obrigatório | O que é |
|---|---|---|
| `arquivo` | sim | nome do PDF/TXT dentro desta pasta (sem caminho) |
| `doc` | sim | identificador curto: minúsculas, números e hífen; não repete |
| `titulo` | sim | nome que aparece na fonte, abaixo da resposta |
| `norma` | sim | a publicação por extenso **com o órgão que a emitiu** (ex.: `CFP/CREPOP, Referências Técnicas…` ou `Resolução CFP nº 010, de 21 de julho de 2005`) |
| `ano` | sim | ano da edição que você está importando |
| `tipo` | não | `norma` (lei, decreto, resolução), `referencia` (orientação técnica) ou `apoio` (cartilha, artigo). Se omitir: `norma` no modo `norma` e `referencia` no modo `documento` |
| `pacote` | não | agrupa documentos (ex.: `psicologia`); gera um `conhecimento-psicologia.json` no build |
| `url` | não | endereço do documento oficial (começa com `https://`; sem ele, apague o campo) |
| `modo` | não | `documento` (padrão: capítulos e seções; cita a página) ou `norma` (um trecho por "Art.") |
| `paginaInicial`, `paginaFinal` | não | pulam capa, sumário e referências finais (contam as páginas do PDF) |
| `deslocamento` | não | página impressa = página do PDF − N (para citar a página que a pessoa vê no papel) |
| `max`, `min` | não | tamanho máximo/mínimo de um trecho, em caracteres (padrão 900 e 300) |
| `semTitulos`, `semPaginas` | não | `true` se os títulos saírem errados ou se a página não importa |

## Como escolher o `modo`
- Tem "Art. 1º, Art. 2º…" → `norma` (Código de Ética, resoluções do CFP e do CNAS, leis, decretos).
- Tem capítulos e seções, sem artigos → `documento` (referências técnicas, orientações técnicas, cartilhas).

## Sugestões de documentos para a psicologia no SUAS
São candidatos; **confirme no site oficial (CFP, MDS/CNAS) qual é a edição vigente** e se a publicação pode ser reproduzida.
- Código de Ética Profissional do Psicólogo (Resolução CFP nº 010/2005) → `norma`
- Resolução do CFP sobre documentos escritos produzidos pela(o) psicóloga(o) (Resolução CFP nº 06/2019 e alterações) → `norma`
- Referências Técnicas para Atuação de Psicólogas(os) no CRAS/SUAS (CFP/CREPOP) → `referencia`
- Referências Técnicas para Atuação de Psicólogas(os) no CREAS (CFP/CREPOP) → `referencia`
- Resolução CNAS nº 17/2011 (profissionais de nível superior do SUAS) e a NOB-RH/SUAS → `norma`
- Orientações Técnicas do MDS sobre o PAIF e sobre o CREAS/PAEFI → `referencia`
- Tipificação Nacional de Serviços Socioassistenciais (Res. CNAS 109/2009) e PNAS 2004 → `norma`

## Cuidados
- Só documentos públicos e oficiais. **Nada com dado de pessoa** (prontuário, relatório de caso, ata com nomes): a base vai para o navegador e para o Worker.
- PDF escaneado (imagem) não tem texto: faça OCR antes (`ocrmypdf entrada.pdf saida.pdf`).
- PDF com duas colunas ou muitas tabelas pode sair desordenado: olhe essas páginas no `.md`.
