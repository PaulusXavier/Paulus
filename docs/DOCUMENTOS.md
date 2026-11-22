# Anexar documentos para o Paulus ajudar

No console, o clipe anexa **PDF com texto, DOCX, TXT, MD ou CSV**. Depois é só perguntar ("resuma este documento", "o que diz sobre o prazo de recurso?"). O documento fica "em uso" (chip verde acima do campo) nas próximas perguntas até você clicar no ✕ ou abrir uma nova conversa.

## Como funciona (e a privacidade)
- O arquivo é lido **no aparelho**; ele não é enviado inteiro.
- Para cada pergunta, o Paulus escolhe até ~12 mil caracteres: os trechos que mais combinam com a pergunta (e o começo).
- Trechos com **dado pessoal** (e-mail, CPF/NIS/RG, nome depois de "Sr./Sra./nome:" etc.) **ficam de fora**, no aparelho e de novo no Worker. A resposta avisa quantos ficaram de fora. Se nenhum trecho puder ser usado, o Paulus diz isso e não responde como se tivesse lido.
- O texto do documento é tratado como dado: ordens escritas dentro dele são ignoradas.
- O Worker não grava nada. Os trechos vão à IA (Cloudflare Workers AI) só na hora da pergunta.
- **PDF escaneado** (imagem dentro de PDF) ainda não é lido. Para isso, tire uma foto ou print da página e anexe como imagem (veja abaixo).
- Pedidos de **editar PDF** (juntar, girar, numerar...) continuam sendo feitos no aparelho, sem IA, e não leem o texto.

## Anexar foto ou print (o Paulus "enxerga")
O clipe também aceita **JPG, PNG e WebP**: cartaz, print de tela, tabela, gráfico, formulário em branco, foto de um local. Pergunte normalmente ("o que diz este cartaz?", "resuma esta tabela", "explique este gráfico"). Sem texto, o Paulus descreve a imagem. Uma foto por pergunta.

**Como funciona**
1. O navegador **reduz a foto no aparelho** (lado maior de 1280 px, JPEG). Ao redesenhar, EXIF e GPS somem.
2. O Worker confere formato, tamanho e assinatura do arquivo e chama um **modelo de visão** do Workers AI (padrão `@cf/meta/llama-3.2-11b-vision-instruct`; reserva `@cf/meta/llama-4-scout-17b-16e-instruct`) para **copiar o texto** da imagem e **descrevê-la**. Não gravamos nada.
3. A leitura passa pelo **filtro de dados pessoais, linha a linha**: nome, CPF/RG/NIS, telefone, e-mail e endereço de residência saem e viram "[linha omitida: dado pessoal]". Se nada sobrar, o Paulus diz que não conseguiu usar a imagem.
4. Só o texto limpo vai ao Paulus (dentro de `<imagem_anexada>`, tratado como dado, nunca como instrução). Ele diz "na imagem", avisa o que está [ilegível] e pede para conferir números e nomes no original.
5. A leitura volta ao navegador e fica **"em uso"** (chip verde): as próximas perguntas seguem como documento anexado, **sem enviar a foto de novo**.

**Limite que precisa estar claro para a equipe:** o modelo de visão **vê a foto inteira** antes do filtro (ela passa pela IA da Cloudflare, sem ser gravada). O filtro protege o que chega ao Paulus e ao histórico, não o que o modelo de visão enxerga. Por isso: **não anexe foto com rosto, nome, documento ou endereço de pessoa atendida**; prefira material público (cartaz, norma, gráfico, tela sem dados). O console avisa ao anexar. Para desligar de vez, use `VISAO = "desligado"` no `wrangler.toml`.

**Outros limites:** a leitura pode errar letra pequena, tabela torta e número trocado; o Paulus não reconhece pessoa pelo rosto; HEIC (iPhone) depende do navegador abrir o arquivo (se não abrir, compartilhe como JPG). "Editar PDF" com foto (juntar fotos em PDF, colocar assinatura escaneada) continua no aparelho, sem IA.

**Publicar:** publique o Worker de novo (`npx wrangler deploy`) e faça o push do site. Na primeira leitura o Worker aceita sozinho a licença da Meta do modelo Llama 3.2 Vision (exigida uma vez por conta da Cloudflare).

## Para ler PDF: instalar o leitor (uma vez)
O PDF precisa do leitor pdf.js (Mozilla, licença Apache-2.0). Baixe o pacote `pdfjs-dist` (npm ou a página de releases do pdf.js) e copie estes dois arquivos da pasta `build/` para a pasta `vendor/` do repositório, com **estes nomes**:
- `pdf.min.mjs`
- `pdf.worker.min.mjs`

O build copia os dois para o site. Sem eles, DOCX, TXT, MD e CSV funcionam; o PDF mostra "Falta instalar o leitor de PDF".

## Publicar
1. Publique o **Worker** de novo (`npx wrangler deploy`): ele passou a aceitar o campo `documento`.
2. Faça o push para o site (o GitHub Pages refaz o `paulus.v1.js`).
