---
id: dados-r-visualizar-ggplot2
nome: R: gráficos com ggplot2
quando: ggplot2; ggplot; gráfico no r; gráfico em r; geom_bar; geom_point; geom_col; facet_wrap; histograma no r; ggsave; gráfico de barras no r
---
- Gráfico é uma pilha de camadas somadas com `+`: dados (`ggplot(atend, ...)`), mapeamento (`aes(x = mes, y = n, fill = bairro)`), geometria (`geom_col()`, `geom_line()`, `geom_point()`, `geom_boxplot()`, `geom_histogram()`), facetas (`facet_wrap(~ bairro)`), rótulos (`labs(title =, x =, y =, caption =)`) e tema.
- Receita: `ggplot(por_mes, aes(x = mes, y = n)) + geom_col() + labs(title = "Atendimentos por mês", x = NULL, y = "Atendimentos")`. O `+` fica no fim da linha, nunca no começo da seguinte.
- Qual geom: uma categórica, `geom_bar()` (conta sozinho); categórica com número já somado, `geom_col()`; uma numérica, histograma ou densidade; numérica por categoria, boxplot; duas numéricas, pontos; tempo, linha.
- Dentro de `aes()` vai o que vem de uma coluna; fora, o que é fixo (`geom_point(color = "blue")`).
- Proporção por categoria: `position = "fill"`. Muitas categorias: ordene com `fct_reorder()` ou troque os eixos.
- Salvar: `ggsave("resultados/grafico.png", width = 8, height = 5, dpi = 300)`.
- Comunicação: título que diz a conclusão, eixos com unidade, fonte em `caption`, pouco enfeite. Cores que daltônico distingue: `scale_fill_viridis_d()` ou `scale_color_colorblind()` (ggthemes). Barras sempre com eixo a partir do zero.
- Território com poucas pessoas num gráfico pode identificar alguém: agrupe ou omita.
- Para praticar: `library(dados)` e a tabela `pinguins`, antes dos dados do trabalho.
