---
id: dados-python-agregacao
nome: Python: agrupar, contar e tabelas dinâmicas
quando: groupby pandas; groupby python; agg pandas; value_counts; pivot_table; crosstab; agrupar dados python; contar por grupo python; tabela dinâmica python
---
- Contagem rápida: `df["bairro"].value_counts()`; em percentual, `value_counts(normalize=True) * 100`.
- Agrupar e resumir: `df.groupby("bairro", as_index=False).agg(total=("atendimentos", "sum"), media=("idade", "mean"), n=("idade", "size"))`. A forma `nome=("coluna", "função")` dá nomes claros ao resultado.
- Inclua sempre o tamanho do grupo (`"size"` ou `"count"`) ao comparar médias ou taxas: grupos pequenos oscilam muito e dominam os extremos sem significar nada.
- Vários grupos: `groupby(["bairro", "mes"])`. Linhas com chave nula somem do `groupby`; `dropna=False` as mantém.
- Tabela dinâmica: `pd.pivot_table(df, index="bairro", columns="mes", values="atendimentos", aggfunc="sum", fill_value=0, margins=True)`. Duas categóricas: `pd.crosstab(df["bairro"], df["faixa"], normalize="index")`.
- Percentual dentro do grupo: `df["pct"] = df["n"] / df.groupby("bairro")["n"].transform("sum") * 100`.
- Depois de agrupar, `reset_index()` (ou `as_index=False`) devolve as chaves para colunas.
- Cuidado ao ler médias de ordinais (escalas) e de grupos pequenos; mostre também a mediana (`"median"`).
- Território com pouquíssimos casos pode identificar alguém: agrupe categorias ou omita.
- Exemplos só com `pd.DataFrame` fictício.
