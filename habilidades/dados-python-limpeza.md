---
id: dados-python-limpeza
nome: Python: limpar dados com pandas
quando: limpar dados pandas; limpeza de dados python; fillna; dropna; valores nulos pandas; nan pandas; drop_duplicates; astype pandas; str.strip pandas; padronizar texto pandas
---
- Comece olhando: `df.info()`, `df.isna().sum()` (nulos por coluna), `df["bairro"].value_counts(dropna=False)` (variações de grafia), `df.duplicated().sum()`.
- Nomes de coluna: `df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")`.
- Texto: `df["bairro"] = df["bairro"].str.strip().str.title()`. Sem acento para comparar: `.str.normalize("NFKD").str.encode("ascii", "ignore").str.decode("ascii")`. Substituir: `.str.replace(...)`; achar: `.str.contains("padrão", na=False)`.
- Tipos: `df["n"] = pd.to_numeric(df["n"], errors="coerce")`; categoria com ordem: `pd.Categorical(col, categories=[...], ordered=True)`.
- Ausentes: `NaN` é o nulo. `fillna(0)` só quando "não informado" realmente puder ser zero; `dropna(subset=["n"])` remove linhas; códigos de ausência (99, "N/D") viram nulo com `replace({99: np.nan})`. Conta com NaN costuma ignorá-lo (`mean()`), mas diga quantos foram: `df["n"].isna().sum()`.
- Duplicados: `df.drop_duplicates(subset=["mes", "bairro"])` depois de olhar quais são; duplicata pode ser registro legítimo.
- Valor implausível (idade 250, data de 1900): `df[df["idade"] > 120]` para olhar; decida com a equipe, não apague em silêncio.
- Registre cada mudança no código, nunca na planilha original; relate no trabalho quantas linhas foram afetadas.
- No SUAS, "sem informação" também é achado: pode indicar falha de registro no serviço.
