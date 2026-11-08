---
id: dados-r-importar
nome: R: importar CSV e planilhas
quando: importar csv r; ler csv r; read_csv; read_csv2; importar planilha r; read_excel; readr; csv ponto e vírgula r; encoding csv r; importar dados r; exportar csv r; write_csv
---
- readr (vem no tidyverse): `atend <- read_csv("dados/atendimentos.csv")`. A primeira linha vira nome de coluna e o resultado é um tibble. Confira com `glimpse(atend)`.
- CSV brasileiro costuma ter **ponto e vírgula** e **vírgula decimal** (exportação do Excel em português): use `read_csv2()`, ou `read_delim(arq, delim = ";", locale = locale(decimal_mark = ",", grouping_mark = "."))`.
- Acento estragado ("Ã§") é encoding: `locale = locale(encoding = "latin1")`; tente "UTF-8" e "latin1". Detalhes em `?locale`.
- Ausentes: por padrão só célula vazia vira NA. Se a fonte usa "-" ou "N/D", diga `na = c("", "-", "N/D")`.
- Tipos: o readr adivinha pelas primeiras linhas. Número que virou texto indica valor estranho ("12 anos"); `problems(atend)` lista as falhas. Controle com `col_types = cols(idade = col_integer())`. Código com zero à esquerda (município, CEP) leia como texto: `cols(.default = col_character())`.
- Nome de coluna com espaço ou acento: `janitor::clean_names()` (instale o janitor) ou `rename()`.
- Excel: `readxl::read_excel("arq.xlsx", sheet = "Planilha1", skip = 2)`. Aba com células mescladas, título decorativo e vários quadros precisa de limpeza; o ideal é uma linha de cabeçalho e uma observação por linha.
- Vários arquivos iguais (um por mês): `read_csv(list.files("dados", pattern = "\\.csv$", full.names = TRUE), id = "arquivo")`.
- Salvar: `write_csv()`; para abrir no Excel em português, `write_excel_csv2()`; `write_rds()` preserva os tipos.
- Para treinar sem arquivo: `tribble()` (por linha) ou `tibble()` (por coluna), com dado inventado.
