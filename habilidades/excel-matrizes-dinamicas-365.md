---
id: excel-matrizes-dinamicas-365
nome: Excel 365: FILTRO, ÚNICO, CLASSIFICAR, LET e matrizes dinâmicas
quando: filtro excel 365; função filtro excel; função único excel; função classificar excel; sequência excel; matrizes dinâmicas; derramamento excel; spill excel; função let; excel 365 funções novas; derram excel
texto: sim
---
- O Excel 365 e o 2021 têm fórmulas que devolvem vários valores e "derramam" nas células vizinhas: digita-se uma vez e o resultado ocupa o espaço necessário. `#DERRAM!` significa que há célula ocupada no caminho. `A2#` refere-se à área derramada inteira.
- `=ÚNICO(tbAtend[Bairro])` lista sem repetir; `=CONT.VALORES(ÚNICO(...))` conta distintos; `=CLASSIFICAR(ÚNICO(...))` põe em ordem; `=CLASSIFICARPOR(intervalo;chave;-1)` ordena por outra coluna, decrescente.
- `=FILTRO(tbAtend; (tbAtend[Bairro]="Bairro A")*(tbAtend[Ano]=2026); "nada encontrado")`. E é `*`, OU é `+`.
- Meses do ano: `=DATAM(DATA(2026;1;1);SEQUÊNCIA(12;1;0))`.
- Resumo vivo: ao lado de `=ÚNICO(tbAtend[Bairro])` em D2, `=CONT.SES(tbAtend[Bairro];D2#)` devolve a contagem de cada bairro e cresce sozinho.
- `=LET(r;B2/C2;SEERRO(r;0))` dá nome a partes da fórmula (evita repetir e fica legível). Também `PROCX`.
- Compatibilidade é o ponto crítico: aberto no Excel 2016 ou 2019, aparece `#NOME?` ou a fórmula vira matricial antiga com `@`. Pergunte a versão de quem vai abrir o arquivo; se a equipe mistura versões, use tabela dinâmica, PROCV e ÍNDICE+CORRESP. A versão aparece em Arquivo > Conta.
- Excel para web e Google Planilhas têm funções parecidas, com nomes e separadores que podem mudar.
- Fórmula derramada não pode estar dentro de uma Tabela (Ctrl+T): coloque ao lado.
- Os nomes em português podem variar um pouco entre versões: ao digitar `=` e as primeiras letras, a lista do Excel mostra o nome certo.
- Teste com dado fictício e descreva as colunas, sem colar dado real.
