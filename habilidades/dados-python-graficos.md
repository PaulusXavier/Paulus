---
id: dados-python-graficos
nome: Python: gráficos (matplotlib, seaborn)
quando: matplotlib; seaborn; gráfico python; gráfico em python; plot pandas; savefig; histograma python; gráfico de barras python
---
- Três níveis: `df.plot` (rápido, usa matplotlib), `matplotlib` (controle total) e `seaborn` (estatística e estética, a partir do DataFrame). Para quem inicia: pandas e seaborn.
- Rápido: `df.plot.bar(x="mes", y="atendimentos")`. Controle: `import matplotlib.pyplot as plt`, `fig, ax = plt.subplots(figsize=(8, 5))`, `ax.bar(df["mes"], df["n"])`, `ax.set(title="Atendimentos por mês", xlabel="", ylabel="Atendimentos")`, `plt.show()`.
- seaborn: `import seaborn as sns`; `sns.barplot(data=df, x="mes", y="n", hue="bairro")`, `sns.histplot(data=df, x="idade")`, `sns.boxplot(data=df, x="bairro", y="idade")`, `sns.lineplot(...)`.
- Qual gráfico: uma categórica, barras de contagem (`sns.countplot`); número por categoria, boxplot; uma numérica, histograma; duas numéricas, dispersão (`sns.scatterplot`); tempo, linha.
- Salvar: `fig.savefig("resultados/grafico.png", dpi=300, bbox_inches="tight")`.
- Comunicação: título que diz a conclusão, eixos com unidade, fonte, pouco enfeite, barras a partir do zero. Cores que daltônico distingue: `sns.set_palette("colorblind")`.
- Ordem das categorias: o eixo segue a ordem dos dados; ordene antes (`sort_values`) ou use categoria ordenada.
- Muitos rótulos: gire (`plt.xticks(rotation=45)`) ou troque para barras horizontais (`barh`).
- Território com poucas pessoas em um gráfico pode identificar alguém: agrupe ou omita.
- Para praticar, `sns.load_dataset("penguins")` (exige internet) ou `pd.DataFrame` fictício.
