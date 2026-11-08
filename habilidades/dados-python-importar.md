---
id: dados-python-importar
nome: Python: importar CSV e Excel com pandas
quando: ler csv pandas; importar csv pandas; separador csv pandas; read_csv pandas; ler csv python; importar csv python; read_excel pandas; importar excel python; encoding csv python; to_csv pandas; dataframe csv
---
- `import pandas as pd` e `atend = pd.read_csv("dados/atendimentos.csv")`. Confira com `atend.head()`, `atend.info()` (tipos e nulos) e `atend.shape`.
- CSV brasileiro costuma vir com **ponto e vírgula** e **vírgula decimal**: `pd.read_csv(arq, sep=";", decimal=",", thousands=".")`.
- Acento estragado ("Ã§") ou `UnicodeDecodeError` é encoding: `encoding="latin-1"` ou `"utf-8"`; arquivos do Excel às vezes são `"utf-8-sig"`.
- Ausentes: `na_values=["-", "N/D", "99"]` diz o que vira `NaN`.
- Tipos: código com zero à esquerda (município, CEP) leia como texto: `dtype={"cod_municipio": str}`. Número que veio como texto (`object`) indica valor estranho: `pd.to_numeric(col, errors="coerce")` e olhe o que virou NaN.
- Só o necessário: `usecols=["mes", "bairro", "atendimentos"]` (minimização de dados). Datas: veja o roteiro de datas.
- Excel: `pd.read_excel("arq.xlsx", sheet_name="Plan1", skiprows=2)`; precisa do `openpyxl` (`pip install openpyxl`). Células mescladas e quadros múltiplos na mesma aba pedem limpeza; o ideal é uma linha de cabeçalho e uma observação por linha.
- Vários arquivos: `pd.concat([pd.read_csv(f) for f in Path("dados").glob("*.csv")], ignore_index=True)`.
- Salvar: `df.to_csv("resultados/resumo.csv", index=False)`; para abrir no Excel em português, `sep=";", decimal=",", encoding="utf-8-sig"`. `df.to_excel(..., index=False)`.
- Para treinar sem arquivo: `pd.DataFrame({...})` com dado inventado.
