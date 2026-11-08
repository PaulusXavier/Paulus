---
id: dados-python-relatorios
nome: Python: relatórios, Excel e rotina automática
quando: relatório python; relatório automático python; nbconvert; to_excel; exportar excel python; quarto python; automatizar relatório python; script py
---
- Notebook como relatório: `jupyter nbconvert --to html caderno.ipynb` gera uma página. Esconda o código se quiser só os resultados. Quarto também roda Python: arquivo `.qmd` com blocos de código `{python}`, saída em HTML, Word ou PDF.
- Números no texto vêm do código (`f"Foram {len(df)} atendimentos"`), nunca digitados à mão.
- Excel: `df.to_excel("resultados/resumo.xlsx", index=False)`; várias abas com `with pd.ExcelWriter("resumo.xlsx") as w:` e `df1.to_excel(w, sheet_name="Por bairro")`. Precisa de `openpyxl`.
- Rotina mensal (prática sugerida): um script `relatorio.py` que lê `dados/` do mês, calcula, grava gráficos e tabelas em `resultados/`. No mês seguinte, troque o arquivo e rode. Funções (`def`) evitam copiar código.
- Estrutura do script: importar; ler; limpar; calcular; salvar. Uma etapa por função, com nomes claros.
- Notebooks **guardam as saídas** (tabelas e gráficos) dentro do arquivo `.ipynb`: se a saída mostrar dado de pessoa, o arquivo vira vazamento. Limpe antes de compartilhar (`jupyter nbconvert --clear-output --inplace caderno.ipynb`).
- Relatório que sai do serviço: confira sigilo, nada identificável, cuidado com contagens muito pequenas. O texto do relatório técnico segue o roteiro próprio de relatório; aqui é a parte de tabelas e gráficos.
- Revise sempre: o código automatiza a conta, não a interpretação.
