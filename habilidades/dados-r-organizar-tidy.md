---
id: dados-r-organizar-tidy
nome: R: dados organizados (tidy) e pivotagem
quando: dados organizados; tidy data; pivot_longer; pivot_wider; formato longo; formato largo; tidyr; alongar dados; transformar colunas em linhas
---
- As três regras do dado organizado (tidy): cada variável em uma coluna, cada observação em uma linha, cada valor em uma célula. dplyr e ggplot2 esperam isso.
- Planilha de gabinete costuma ser "larga": uma coluna por mês (`jan`, `fev`, `mar`) ou por faixa etária. "Mês" é uma variável, e deixá-la nos nomes das colunas atrapalha contar, filtrar e plotar.
- Alongar: `atend |> pivot_longer(cols = jan:mar, names_to = "mes", values_to = "atendimentos")`. Três decisões: quais colunas, nome da coluna que recebe os nomes antigos, nome da que recebe os valores. `cols = !bairro` quer dizer "todas menos bairro".
- Alargar (caminho inverso, bom para tabela de apresentação): `pivot_wider(names_from = mes, values_from = atendimentos)`. Se a mesma combinação aparece em mais de uma linha, o resultado vira lista e dá aviso: resuma antes com `count()` ou `summarize()`.
- Nome de coluna com duas informações ("f_0a5", "m_0a5"): `names_to = c("sexo", "faixa")` e `names_sep = "_"`.
- Alongar pode gerar NA onde a célula estava vazia; `values_drop_na = TRUE` descarta.
- Planilha com totais, subtotais e células mescladas no meio dos dados quebra o tidy: remova antes de importar ou com `filter()`, e calcule totais no R.
- Mini exercício: `tribble()` com 3 bairros e 3 meses em colunas, alongar, somar por bairro, alargar de volta.
- Quando a pessoa mostrar `names()` ou `glimpse()` de uma tabela fictícia, aponte qual variável está escondida nos nomes das colunas.
