---
id: dados-r-quarto-relatorios
nome: R: relatórios com Quarto
quando: arquivo qmd; qmd; r markdown; rmarkdown; knitr; relatório reprodutível; relatório automático r; quarto rstudio
---
- Quarto junta texto, código R e resultados em um documento que se refaz com dado novo: o relatório mensal sem copiar e colar gráfico no Word. O arquivo é `.qmd`; o botão Render gera HTML, Word (`docx`) ou PDF (o PDF pede LaTeX, por exemplo TinyTeX).
- Estrutura: cabeçalho YAML no topo (`title`, `format: docx` ou `html`, e `execute: echo: false` para esconder o código no relatório final); texto em Markdown (`#` título, `**negrito**`, listas); blocos de código R delimitados por três crases e `{r}`; opções por bloco, como `#| echo: false` e `#| fig-cap: "Atendimentos por mês"`.
- Números no texto vêm do código, em linha: `` `r nrow(atend)` ``. Assim nunca ficam digitados à mão e desatualizados.
- Fluxo: importar e calcular nos primeiros blocos; depois tabelas (`knitr::kable()`) e gráficos; a interpretação em texto é de quem escreve. O Quarto não interpreta por você.
- Mês seguinte: troque o arquivo de dados, Render, leia tudo antes de enviar.
- Outros formatos (livro, capítulo Formatos para Quarto): apresentação (slides), site e painel. Comece por um documento simples.
- Dentro de projeto RStudio e com caminhos relativos. O Quarto roda tudo numa sessão limpa, o que já é um teste de reprodutibilidade.
- Relatório que sai do serviço: confira sigilo, nada identificável, cuidado com contagens muito pequenas. O texto do relatório técnico segue o roteiro próprio de relatório; aqui é a parte de tabelas e gráficos automáticos.
