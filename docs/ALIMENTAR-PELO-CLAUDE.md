# Alimentar o Paulus mandando os PDFs pelo Claude

Em vez de rodar os comandos no seu computador, você pode anexar os PDFs numa conversa com o Claude (com este repositório aberto) e pedir:
"importe estes documentos para a base do Paulus".

O Claude segue os mesmos passos de [CONHECIMENTO.md](CONHECIMENTO.md):
1. `npm run inspecionar -- <pasta dos anexos> --rascunho` para ver o que há em cada PDF (lei ou documento por capítulos, sumário, PDF escaneado).
2. Monta o `manifesto.json`. **`norma` (quem emitiu) e `ano` vêm do próprio documento**; o Claude pergunta se não estiverem claros, em vez de chutar.
3. `npm run ingerir -- --entrada <pasta> --manifesto <arquivo>` cria os `.md` em `knowledge/documentos/`, com `revisao: pendente`.
4. `npm run conferir -- <doc>` mostra trechos do começo, do meio e do fim com a página citada. **Você compara com o PDF**; estando certo, `npm run conferir -- <doc> --conferido`.
5. `npm run build:conhecimento`, `npm test` e publicar ([DEPLOY.md](DEPLOY.md)).

Cuidados: só documentos públicos e oficiais, **nada com dado de pessoa**; PDF escaneado precisa de OCR antes; e o Claude não "completa" artigo que faltou no texto: o que não está no PDF não entra na base.
