---
id: dados-python-datas
nome: Python: datas e séries no tempo
quando: to_datetime; datas pandas; datas python; resample pandas; dt.month; série temporal python; converter data python; datetime python
---
- Texto de data vira data com `pd.to_datetime`. No Brasil o texto é dia/mês/ano: `pd.to_datetime(df["data"], format="%d/%m/%Y", errors="coerce")` ou `dayfirst=True`. A ordem errada gera data errada em silêncio: confira com `df["data"].min()` e `df["data"].max()`. Datas inválidas viram `NaT`.
- Partes: `df["data"].dt.year`, `.dt.month`, `.dt.day_name()`; mês como período: `.dt.to_period("M")`.
- Ao importar: `pd.read_csv(arq, parse_dates=["data"], dayfirst=True)`.
- Contar por mês: `df.groupby(df["data"].dt.to_period("M")).size()`; ou com a data como índice, `df.set_index("data").resample("MS")["n"].sum()` (`"MS"` é início do mês; `"W"` semana).
- Mês sem registro não aparece no `groupby`: `resample` os cria com zero ou `NaN`, o que evita gráfico com buraco escondido. Diga se é zero real ou falta de dado.
- Diferença entre datas: `(fim - inicio).dt.days`. Idade ou tempo de acompanhamento depende de data de referência explícita: escreva-a no código.
- Ordem dos meses em texto ("jan", "fev") sai alfabética; use datas ou `pd.Categorical(..., ordered=True)`.
- Data de nascimento e datas de atendimento de pessoa real são dado pessoal; nos exemplos, valores inventados.
