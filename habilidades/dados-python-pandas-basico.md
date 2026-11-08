---
id: dados-python-pandas-basico
nome: Python: pandas básico (selecionar, filtrar, ordenar)
quando: pandas básico; dataframe pandas; selecionar colunas pandas; filtrar linhas pandas; loc iloc; query pandas; sort_values; assign pandas; series pandas
---
- `DataFrame` é a tabela (linhas × colunas); `Series` é uma coluna. Primeira olhada: `df.head()`, `df.info()`, `df.describe()`, `df.columns`.
- Coluna: `df["idade"]`; várias: `df[["bairro", "idade"]]` (colchetes duplos). Nome de coluna com espaço só funciona com colchetes.
- Filtrar: `df[df["ano"] == 2026]`. Duas condições usam `&` e `|` com **parênteses**: `df[(df["ano"] == 2026) & (df["bairro"] == "A")]`. Lista de valores: `df["bairro"].isin(["A", "B"])`. Erro clássico: usar `and`/`or`, que dá "truth value of a Series is ambiguous". Alternativa legível: `df.query("ano == 2026 and bairro == 'A'")`.
- `loc` escolhe por nome (`df.loc[df["ano"] == 2026, ["bairro", "n"]]`); `iloc` por posição.
- Ordenar: `df.sort_values("n", ascending=False)`. Renomear: `df.rename(columns={"antigo": "novo"})`.
- Nova coluna: `df["pct"] = df["n"] / df["n"].sum() * 100`, ou em cadeia, `df.assign(pct=lambda d: d["n"] / d["n"].sum() * 100)`. Faixas: `pd.cut(df["idade"], bins=[0, 12, 18, 60, 120], labels=["criança", "adolescente", "adulto", "idoso"], right=False)`.
- Encadear com ponto deixa a análise legível: `df.query(...).sort_values(...).head()`.
- Para trabalhar sem alterar o original: `df2 = df.copy()`. Isso evita o aviso `SettingWithCopyWarning`.
- Método: traduza a pergunta em português ("quantos atendimentos por mês no bairro A?") em filtrar, agrupar, resumir. Confira com um caso que a pessoa já sabe.
- Exemplos só com dado fictício.
