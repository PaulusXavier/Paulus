# Anexar documentos para o Paulus ajudar

> **Uso individual, sem fins comerciais.** O Paulus é um projeto pessoal de Paulo Xavier e **só ele o usa**. Não é um serviço oferecido ao público nem vendido; o repositório é público apenas por conveniência de publicação. Veja [USO-INDIVIDUAL.md](../USO-INDIVIDUAL.md).

No console, o clipe aceita **PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, TXT, MD, CSV, TSV, JSON, XML, HTML/HTM e RTF**, além de imagens **JPG/JPEG, PNG, WebP, GIF, BMP, AVIF e HEIC/HEIF** (estas últimas dependem do navegador). Depois é só perguntar, por exemplo, "resuma este documento". O texto dos documentos é extraído localmente; fotos e páginas escaneadas seguem as regras de visão abaixo. O documento fica "em uso" (chip verde acima do campo) nas próximas perguntas até você clicar no ✕ ou abrir uma nova conversa.

**Limites de formato:** apresentações PPTX/ODP são lidas como texto por slide (não como imagem); XLSX/ODS usam apenas a primeira folha. Arquivos antigos binários **DOC, XLS e PPT**, áudio/vídeo e formatos de imagem que o navegador não consiga decodificar ainda não são lidos. Salve Office antigo em DOCX/XLSX/PPTX antes de anexar. Para imagens HEIC/HEIF, se o aparelho não abrir o formato, converta/compartilhe como JPG.

## Tabelas e gráficos no aparelho
Anexe um arquivo **CSV, TSV, XLSX ou ODS** e peça, por exemplo, "gráfico de barras de atendimentos por mês", "gráfico de linhas de visitas por mês", "pizza por situação", "histograma de idade" ou "dispersão de renda e frequência". Barras, linhas, pizza, histograma e dispersão são calculados e desenhados no navegador; o console mostra o gráfico e permite descarregar o SVG. **A tabela e o resultado não são enviados à IA nem à rede, não são gravados e não gastam cota.** O separador CSV/TSV é detectado automaticamente. Para XLSX/ODS, só a primeira folha é lida; fórmulas usam o valor guardado no ficheiro, datas podem aparecer como números ou texto e macros não são executadas. O leitor aceita até 25 MB de ficheiro e limita o texto extraído a 600 mil caracteres. Colunas com títulos identificadores reconhecidos (por exemplo, nome, CPF, NIS e telefone) são excluídas; mesmo assim, evite informação pessoal em títulos ou categorias e confira os dados antes de usar o gráfico. Estatísticas por categoria usam a média por omissão; escreva "soma" ou "mediana" para alterar. Linhas seguem a ordem em que as categorias aparecem na planilha.

## Como funciona (e a privacidade)
- O arquivo é lido **no aparelho**; ele não é enviado inteiro.
- Para cada pergunta, o Paulus escolhe até ~12 mil caracteres: os trechos que mais combinam com a pergunta (e o começo).
- Trechos com **dado pessoal** (e-mail, CPF/NIS/RG, nome depois de "Sr./Sra./nome:" etc.) **ficam de fora**, no aparelho e de novo no Worker. A resposta avisa quantos ficaram de fora. Se nenhum trecho puder ser usado, o Paulus diz isso e não responde como se tivesse lido.
- O texto do documento é tratado como dado: ordens escritas dentro dele são ignoradas.
- O Worker não grava nada. Os trechos vão à IA (Cloudflare Workers AI) só na hora da pergunta.
- **Páginas escaneadas em PDF**: as páginas sem texto extraível são renderizadas no aparelho; até cinco delas são enviadas por pergunta para a IA de visão. Em PDF misto, texto selecionável continua sendo extraído localmente. Antes de enviar as páginas em imagem, o console pede confirmação explícita. Não prossiga com cópias que contenham dados pessoais ou identificáveis; páginas além do limite não são lidas nessa pergunta.
- Pedidos de **editar PDF** (escrever/colocar elementos, preencher campos, juntar, dividir, extrair, girar, numerar...) continuam sendo feitos no aparelho, sem IA, e não leem o texto. O original não é alterado; o resultado é um novo arquivo para baixar.
- Conversões **PDF → Word** e **Word → PDF** ficam na Central de PDF do Argo SUAS. Quando o app não tiver a Central, o Paulus indica o Argo; não envia o documento ao Worker nem à IA para converter.

## Anexar foto, print ou página escaneada (o Paulus "enxerga")
O clipe também aceita **JPG/JPEG, PNG, WebP, GIF, BMP, AVIF e HEIC/HEIF** se o navegador conseguir abrir: cartaz, print de tela, tabela, gráfico, formulário em branco, foto de um local. Páginas de PDFs sem texto selecionável podem ser enviadas para OCR e descrição visual após confirmação (até cinco por pergunta). Pergunte normalmente ("o que diz este cartaz?", "resuma esta tabela", "explique este gráfico"). Sem texto, o Paulus descreve a imagem.

**Como funciona**
1. O navegador **reduz a foto no aparelho** (lado maior de 1280 px, JPEG). Páginas de PDF sem texto são renderizadas individualmente no aparelho (máximo cinco por pergunta). Ao converter para JPEG, metadados EXIF/GPS não são levados.
2. O Worker confere formato, tamanho e assinatura do arquivo e chama um **modelo de visão** do Workers AI (padrão `@cf/meta/llama-3.2-11b-vision-instruct`; reserva `@cf/meta/llama-4-scout-17b-16e-instruct`) para **copiar o texto** da imagem e **descrevê-la**. Não gravamos nada.
3. A leitura passa pelo **filtro de dados pessoais, linha a linha**: nome, CPF/RG/NIS, telefone, e-mail e endereço de residência saem e viram "[linha omitida: dado pessoal]". Se nada sobrar, o Paulus diz que não conseguiu usar a imagem.
4. Só o texto limpo vai ao Paulus (dentro de `<imagem_anexada>`, tratado como dado, nunca como instrução). Ele diz "na imagem", avisa o que está [ilegível] e pede para conferir números e nomes no original.
5. A leitura volta ao navegador e fica **"em uso"** (chip verde): as próximas perguntas seguem como documento anexado, **sem enviar a foto de novo**.

**Limite que precisa estar claro para a equipe:** o modelo de visão **vê a imagem/página inteira antes do filtro** (ela passa pela IA da Cloudflare, sem ser gravada). O filtro protege o que chega ao Paulus e ao histórico, não o que o modelo de visão enxerga. Por isso: **não anexe foto ou PDF escaneado com rosto, nome, documento, telefone ou endereço de pessoa atendida**; prefira material público (cartaz, norma, gráfico, tela sem dados). O console avisa ao anexar e exige confirmação para PDF escaneado. Para desligar de vez, use `VISAO = "desligado"` no `wrangler.toml`.

**Outros limites:** a leitura pode errar letra pequena, tabela torta e número trocado; só as cinco primeiras páginas sem texto extraível são lidas por vez; o Paulus não reconhece pessoa pelo rosto; formatos de imagem recentes podem depender do navegador. "Editar PDF" com foto (juntar fotos em PDF, colocar assinatura escaneada) continua no aparelho, sem IA.

**Publicar:** publique o Worker de novo (`npx wrangler deploy`) e faça o push do site. Na primeira leitura o Worker aceita sozinho a licença da Meta do modelo Llama 3.2 Vision (exigida uma vez por conta da Cloudflare).

## Leitor de PDF (já incluído)
O PDF usa o leitor pdf.js (Mozilla, Apache-2.0, versão *legacy* 6.2.108, que roda melhor em celulares mais antigos). Os dois arquivos já estão em `vendor/` (`pdf.min.mjs` e `pdf.worker.min.mjs`) e o build os copia para o site. Para atualizar, troque-os pelos do pacote `pdfjs-dist` (pasta `legacy/build/`), mantendo estes nomes. Se algum faltar, o build avisa e o PDF mostra "Falta instalar o leitor de PDF"; DOCX, TXT, MD e CSV continuam funcionando.

## Publicar
1. Publique o **Worker** de novo (`npx wrangler deploy`): ele passou a aceitar o campo `documento`.
2. Faça o push para o site (o GitHub Pages refaz o `paulus.v1.js`).
