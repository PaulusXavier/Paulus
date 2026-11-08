---
id: dados-python-do-r-ao-python
nome: Python e R: tradução entre os dois
quando: python ou r; r ou python; r versus python; tidyverse para pandas; dplyr para pandas; do r para o python; migrar de r para python; qual aprender r ou python
---
- Quando a pessoa já viu R, use o que ela sabe. Os conceitos são os mesmos (dado organizado, filtrar, agrupar, unir); muda a sintaxe.
- Tradução: `filter()` é `df.query()` ou `df[condição]`; `select()` é `df[["a", "b"]]`; `mutate()` é `df.assign()` ou `df["nova"] = ...`; `arrange()` é `sort_values()`; `group_by() |> summarize()` é `groupby().agg()`; `count()` é `value_counts()`; `left_join()` é `merge(how="left")`; `pivot_longer()` é `melt()`; `pivot_wider()` é `pivot()` ou `pivot_table()`; `ggplot2` é `matplotlib` e `seaborn`; `NA` é `NaN`; `read_csv()` é `pd.read_csv()`.
- Diferenças que pegam: Python conta a partir de **0**, R a partir de 1; Python usa `=` para atribuir; condições em pandas usam `&` e `|` com parênteses; em vez de pipe `|>`, o pandas encadeia métodos com ponto; Python exige recuo.
- Qual escolher (leitura sua, não regra): R é muito cômodo para estatística, gráficos e relatórios com Quarto; Python serve bem para dados e também para automatizar tarefas e construir aplicações. Para quem faz relatórios e análises de serviço, qualquer um dá conta; o melhor é o que a equipe consegue manter. Não precisa dominar os dois.
- Quarto funciona com R e com Python, e o conceito de projeto, script e caminho relativo é igual.
- Indique o roteiro específico conforme a dúvida (importar, limpar, agrupar, gráficos) em vez de despejar a tabela inteira.
- Dica de ensino: peça que a pessoa escreva primeiro a pergunta em português e depois a traduza para a ferramenta.
