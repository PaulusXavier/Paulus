---
id: dados-python-exemplo-atendimentos
nome: Python: primeira análise completa (atendimentos fictícios)
quando: primeira análise python; exemplo completo python; analisar atendimentos python; análise de atendimentos pandas; exemplo prático python; projeto prático python; relatório mensal python
---
- Objetivo: percorrer o ciclo (importar, conferir, resumir, gráfico, guardar, comunicar) com dado FICTÍCIO. Um passo por vez; peça que a pessoa rode e conte o que apareceu.
- Passo 0: `import pandas as pd`, `import matplotlib.pyplot as plt` e `atend = pd.DataFrame({"mes": ["jan", "jan", "fev", "fev", "mar", "mar"], "bairro": ["A", "B", "A", "B", "A", "B"], "atendimentos": [42, 18, 51, None, 47, 22]})`. Em trabalho real, entra `pd.read_csv()` de um arquivo agregado.
- Passo 1, conferir: `atend.info()` e `atend.isna().sum()`. Mostre o nulo de fevereiro no bairro B e pergunte o que ele significa (não registrou? não houve?).
- Passo 2, resumir: `resumo = atend.groupby("bairro", as_index=False).agg(total=("atendimentos", "sum"), meses_sem_dado=("atendimentos", lambda s: s.isna().sum()))`.
- Passo 3, proporção: `resumo["pct"] = resumo["total"] / resumo["total"].sum() * 100`.
- Passo 4, gráfico: `tab = atend.pivot(index="mes", columns="bairro", values="atendimentos").loc[["jan", "fev", "mar"]]`, depois `tab.plot.bar(title="Atendimentos por mês", ylabel="Atendimentos")`. Momento de ensino: sem o `.loc` com a ordem, os meses saem em ordem alfabética.
- Passo 5, guardar: `plt.savefig("resultados/atendimentos.png", dpi=300, bbox_inches="tight")` e `resumo.to_csv("resultados/resumo.csv", index=False)`.
- Passo 6, comunicar: dizer o que o gráfico mostra e o que NÃO se sabe (o mês sem dado).
- Próximo desafio: trocar o DataFrame por um CSV agregado, sem nome de pessoa, ou responder outra pergunta ("qual bairro mais cresceu?").
