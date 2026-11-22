# Anexar documentos para o Paulus ajudar

No console, o clipe anexa **PDF com texto, DOCX, TXT, MD ou CSV**. Depois é só perguntar ("resuma este documento", "o que diz sobre o prazo de recurso?"). O documento fica "em uso" (chip verde acima do campo) nas próximas perguntas até você clicar no ✕ ou abrir uma nova conversa.

## Como funciona (e a privacidade)
- O arquivo é lido **no aparelho**; ele não é enviado inteiro.
- Para cada pergunta, o Paulus escolhe até ~12 mil caracteres: os trechos que mais combinam com a pergunta (e o começo).
- Trechos com **dado pessoal** (e-mail, CPF/NIS/RG, nome depois de "Sr./Sra./nome:" etc.) **ficam de fora**, no aparelho e de novo no Worker. A resposta avisa quantos ficaram de fora. Se nenhum trecho puder ser usado, o Paulus diz isso e não responde como se tivesse lido.
- O texto do documento é tratado como dado: ordens escritas dentro dele são ignoradas.
- O Worker não grava nada. Os trechos vão à IA (Cloudflare Workers AI) só na hora da pergunta.
- Não lê fotos nem PDF escaneado (precisa de OCR). Se for o caso, o Paulus avisa.
- Pedidos de **editar PDF** (juntar, girar, numerar...) continuam sendo feitos no aparelho, sem IA, e não leem o texto.

## Para ler PDF: instalar o leitor (uma vez)
O PDF precisa do leitor pdf.js (Mozilla, licença Apache-2.0). Baixe o pacote `pdfjs-dist` (npm ou a página de releases do pdf.js) e copie estes dois arquivos da pasta `build/` para a pasta `vendor/` do repositório, com **estes nomes**:
- `pdf.min.mjs`
- `pdf.worker.min.mjs`

O build copia os dois para o site. Sem eles, DOCX, TXT, MD e CSV funcionam; o PDF mostra "Falta instalar o leitor de PDF".

## Publicar
1. Publique o **Worker** de novo (`npx wrangler deploy`): ele passou a aceitar o campo `documento`.
2. Faça o push para o site (o GitHub Pages refaz o `paulus.v1.js`).
