---
id: dados-python-erros-ajuda
nome: Python: entender erros e pedir ajuda
quando: erro python; erro no python; traceback; keyerror; modulenotfounderror; unicodedecodeerror; settingwithcopywarning; nameerror; indentationerror; pedir ajuda python
---
- Leia o **traceback** de baixo para cima: a última linha diz o tipo do erro e o motivo; as de cima mostram onde. Traduza do inglês e explique em português.
- Erros comuns: `NameError` (nome digitado errado ou célula anterior não rodada); `IndentationError` (recuo inconsistente: use 4 espaços); `SyntaxError` (dois-pontos, parêntese ou aspa faltando); `ModuleNotFoundError` (falta `pip install`, ou o pacote está em outro ambiente: confira se o `.venv` está ativo e o kernel do Jupyter é o certo); `FileNotFoundError` (pasta de trabalho errada); `UnicodeDecodeError` (encoding: `latin-1`); `ParserError` (separador: `sep=";"`).
- Pandas: `KeyError` é nome de coluna que não existe (maiúscula, espaço sobrando: veja `df.columns`); "truth value of a Series is ambiguous" é `and`/`or` no lugar de `&`/`|` com parênteses; `ValueError: could not convert string to float` é texto na coluna numérica (`pd.to_numeric(errors="coerce")`); `SettingWithCopyWarning` pede `.loc` ou `.copy()`.
- Aviso (Warning) não é erro, mas leia, principalmente os de mudança de versão.
- Depure em passos: rode a cadeia até antes de cada `.` e olhe `type()`, `.shape`, `.dtypes`, `.head()`.
- Pedir ajuda bem: exemplo mínimo com poucas linhas de dado INVENTADO, o código, o traceback completo e as versões (`pd.__version__`, `python --version`). Nunca cole dado de família em fórum, chat ou IA, inclusive aqui.
- Onde ler: documentação do pandas, `help(função)`, comunidades em português, Stack Overflow. Eu ajudo a interpretar o erro, mas não rodo o código.
- Peça o código, o traceback exato e o que a pessoa esperava ver; sem isso, ofereça as duas ou três hipóteses mais prováveis em vez de afirmar a causa.
