---
id: dados-r-faltantes
nome: R: valores faltantes (NA)
quando: valores faltantes r; dados faltantes r; na.rm; is.na; coalesce; na_if; complete tidyr; valor ausente r
---
- Faltante **explícito** é a célula com `NA`. **Implícito** é a linha que simplesmente não existe: o bairro sem atendimento em março não aparece na tabela daquele mês. Distinguir os dois é o ponto central.
- Conta com NA devolve NA: `mean(x)` dá NA. `na.rm = TRUE` ignora os ausentes, mas diga quantos foram: `sum(is.na(x))`. `x == NA` não funciona; use `is.na(x)` e `filter(!is.na(x))`.
- `coalesce(x, 0)` troca NA por um valor, só quando faz sentido: "não informado" não é o mesmo que "zero atendimentos". `na_if(x, 99)` e `na_if(x, "Não informado")` transformam códigos de ausência em NA de verdade.
- `tidyr::fill()` preenche com o valor de cima (planilha com célula mesclada ou cabeçalho que só aparece na primeira linha do grupo).
- Implícitos: `complete(bairro, mes, fill = list(n = 0))` cria as combinações que faltam, para o gráfico mostrar o mês sem atendimento. `anti_join()` revela quem não aparece em outra tabela.
- Nível de fator sem observação some da contagem; `.drop = FALSE` mantém.
- NaN vem de contas como 0/0; `is.nan()` o identifica.
- Pergunte de onde vêm os NA: não preenchido, não se aplica, não coletado, recusa. Isso muda o tratamento e o que se escreve no relatório. Relate quantos faltaram e como foram tratados em vez de escondê-los.
- No SUAS, "sem informação" também é achado: pode indicar falha de registro no serviço.
