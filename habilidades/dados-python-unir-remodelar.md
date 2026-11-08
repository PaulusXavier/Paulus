---
id: dados-python-unir-remodelar
nome: Python: unir e remodelar tabelas (merge, concat, melt)
quando: merge pandas; concat pandas; unir tabelas python; juntar tabelas python; melt pandas; pivot pandas; formato longo python; formato largo python
---
- `merge` combina por **chave**: `atend.merge(bairros, on="cod_bairro", how="left")` mantém todas as linhas de `atend` e traz as colunas de `bairros`; sem correspondência, `NaN`. Nomes de chave diferentes: `left_on="cod", right_on="codigo"`. `how` aceita `"inner"`, `"left"`, `"right"`, `"outer"`.
- Antes de unir: a chave é única na tabela de consulta? `bairros["cod_bairro"].is_unique`. Use `validate="m:1"` para o pandas avisar se não for. Confira `len()` antes e depois: se aumentou, linhas foram duplicadas.
- Achar o que não casou: `merge(..., how="left", indicator=True)` e filtre `_merge == "left_only"`. Ótimo para código errado ou território faltando.
- Chaves de tipos diferentes (texto "01" e número 1) não se encontram; sufixos `_x` e `_y` aparecem em colunas repetidas (`suffixes=(...)`).
- Empilhar tabelas de mesma estrutura (um arquivo por mês): `pd.concat([jan, fev, mar], ignore_index=True)`.
- Planilha "larga" (uma coluna por mês) vira "longa" com `df.melt(id_vars="bairro", var_name="mes", value_name="atendimentos")`; o caminho inverso é `df.pivot(index="bairro", columns="mes", values="atendimentos")`, ou `pivot_table` se houver repetição.
- Por quê: contar, filtrar e plotar funcionam melhor com uma variável por coluna e uma observação por linha (a ideia de dado organizado, igual à do tidy do R).
- Uso típico: unir contagens por território à população para calcular taxa por mil habitantes, com tabelas agregadas, nunca com lista de pessoas.
- Unir por nome de pessoa é arriscado (homônimos, grafias), e esse tipo de dado não é para este chat.
