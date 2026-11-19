---
id: excel-formulas-avancadas
nome: Excel: fórmulas avançadas (SOMARPRODUTO, nomes, auxiliares)
quando: somarproduto excel; indireto excel; desloc excel; nomes definidos excel; fórmula matricial excel; agregar excel; fórmula longa excel; fórmula complicada excel; fórmulas avançadas excel; ctrl+shift+enter; dois critérios procv
texto: sim
---
- SOMARPRODUTO multiplica matrizes e soma. Condição múltipla sem SES: `=SOMARPRODUTO((B2:B500="Bairro A")*(F2:F500>=18))` conta linhas que cumprem as duas (E é `*`, OU é `+`); `=SOMARPRODUTO((B2:B500="Bairro A")*D2:D500)` soma. Texto onde se espera número dá #VALOR!.
- Pessoas distintas: `=SOMARPRODUTO(1/CONT.SE(A2:A500;A2:A500))`, sem células vazias no intervalo.
- Fórmula matricial antiga: Ctrl+Shift+Enter, aparece entre chaves `{}`. No 365 digita-se normal. Em lista grande fica lenta.
- Nomes definidos (Fórmulas > Definir Nome): `=SOMA(Renda)`, e constantes como `LinhaCorte`. Deixam a fórmula legível e centralizam o parâmetro.
- INDIRETO e DESLOC são voláteis (recalculam sempre) e quebram quando a estrutura muda. Evite em arquivo grande; INDIRETO só na lista dependente.
- SUBTOTAL(109;...) e AGREGAR ignoram linhas ocultas e, no AGREGAR, também erros, conforme a opção escolhida.
- Procurar por dois critérios: o mais simples e visível é coluna auxiliar que junta as chaves (`=A2&"|"&B2`) e PROCV nela. No 365, `=PROCX(1;(A:A=x)*(B:B=y);C:C)`. Em versão antiga, ÍNDICE+CORRESP matricial com Ctrl+Shift+Enter.
- Fórmula gigante é impossível de auditar. Quebre em colunas auxiliares, cada passo com cabeçalho claro, ou use LET no 365. Legibilidade é o limite real (o técnico é 64 níveis de SE).
- Outra aba: `='Aba 2'!B2` (aspas simples se o nome tem espaço). Outro arquivo guarda o caminho e quebra se mudar de lugar.
- `=LIN()` e `=COL()` dão a posição; `=ÍNDICE(intervalo;linha;coluna)` busca por posição.
- Documente a lógica num comentário ou nota (Revisão) e na aba Leia-me. Ctrl+` mostra todas as fórmulas para revisão.
