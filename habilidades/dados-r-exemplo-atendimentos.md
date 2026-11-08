---
id: dados-r-exemplo-atendimentos
nome: R: primeira análise completa (atendimentos fictícios)
quando: primeira análise r; exemplo completo r; analisar atendimentos no r; análise de atendimentos mensais; relatório mensal no r; exemplo prático r; projeto prático r
---
- Objetivo: percorrer o ciclo inteiro (importar, organizar, transformar, visualizar, comunicar) com dado FICTÍCIO, em poucas linhas. Um passo por vez; peça que a pessoa rode e conte o que apareceu.
- Passo 0: `library(tidyverse)` e `atend <- tribble(~mes, ~bairro, ~atendimentos, "jan", "A", 42, "jan", "B", 18, "fev", "A", 51, "fev", "B", NA, "mar", "A", 47, "mar", "B", 22)`. Em trabalho real, aqui entraria `read_csv()` de um arquivo agregado.
- Passo 1, conferir: `glimpse(atend)`. Mostre o NA de fevereiro no bairro B e pergunte o que ele significa (não registrou? não houve?).
- Passo 2, resumir: `resumo <- atend |> group_by(bairro) |> summarize(total = sum(atendimentos, na.rm = TRUE), meses_sem_dado = sum(is.na(atendimentos)))`.
- Passo 3, proporção: `resumo |> mutate(pct = total / sum(total) * 100)`.
- Passo 4, gráfico: `atend |> mutate(mes = factor(mes, levels = c("jan", "fev", "mar"))) |> ggplot(aes(x = mes, y = atendimentos, fill = bairro)) + geom_col(position = "dodge") + labs(title = "Atendimentos por mês", x = NULL, y = "Atendimentos")`. Momento de ensino: sem o `factor()` os meses saem em ordem alfabética.
- Passo 5, guardar: `ggsave("resultados/atendimentos.png")` e `write_csv(resumo, "resultados/resumo.csv")`.
- Passo 6, comunicar: dizer o que o gráfico mostra e o que NÃO se sabe (o mês sem dado). Depois, o texto pode ir para um relatório em Quarto.
- Próximo desafio: trocar o `tribble()` por um CSV agregado, sem nome de pessoa, ou responder outra pergunta ("qual bairro mais cresceu?").
