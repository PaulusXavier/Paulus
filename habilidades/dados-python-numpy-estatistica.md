---
id: dados-python-numpy-estatistica
nome: Python: NumPy e estatística descritiva
quando: numpy; array numpy; np.where; np.select; estatística descritiva python; média mediana python; vetorização python; nan numpy
---
- NumPy guarda números em **arrays** e faz conta com todos os elementos de uma vez (vetorização): `idades = np.array([2, 5, 9])`; `idades * 12`; sem `for`. O pandas usa NumPy por baixo.
- Resumos: `idades.mean()`, `np.median(idades)`, `idades.std()`, `idades.min()`, `np.percentile(idades, 90)`. No DataFrame, `df["idade"].describe()`.
- Média sozinha engana quando há valores extremos (renda, tempo de espera): mostre também a mediana e a distribuição (histograma ou boxplot).
- Nulo é `np.nan`. `np.mean` com `nan` dá `nan`; use `np.nanmean`. No pandas, `mean()` já ignora ausentes, e vale dizer quantos foram ignorados.
- Condições vetorizadas: `np.where(df["idade"] < 18, "menor", "adulto")`; várias faixas com `np.select([c1, c2], ["a", "b"], default="c")` ou `pd.cut`.
- Correlação: `df[["idade", "renda"]].corr()`; correlação não é causa, e em amostra pequena oscila.
- Aleatório e reprodutível: `rng = np.random.default_rng(42)` para simular dado fictício de treino.
- Modelos (scikit-learn, statsmodels) existem, mas só depois do básico; explique que previsão sobre pessoas exige muita cautela ética e técnica.
- Exemplos com números inventados; nunca dado de pessoa real.
