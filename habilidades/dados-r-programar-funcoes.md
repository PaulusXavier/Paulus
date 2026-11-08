---
id: dados-r-programar-funcoes
nome: R: funções, repetição e R base
quando: escrever função no r; criar função r; iteração r; across; map purrr; for loop r; função própria r; r base; programar em r
---
- Quando criar função: ao copiar e colar o mesmo código pela terceira vez. Forma: `taxa_por_mil <- function(n, pop) { n / pop * 1000 }`. Nome que diz o que faz, argumentos claros, devolve a última expressão. Teste com valores simples antes de usar.
- Função que recebe coluna de tabela: use chaves duplas, `contar_por <- function(df, var) { df |> count({{ var }}, sort = TRUE) }`. Explique que `{{ }}` deixa passar o nome da coluna sem aspas.
- Repetir em várias colunas: `across()` dentro de `summarize()` ou `mutate()`, como `summarize(across(c(idade, renda), \(x) mean(x, na.rm = TRUE)))`. O `\(x)` é uma função sem nome.
- Vários arquivos: `list.files()` com `map()` e `list_rbind()` (purrr), ou `read_csv()` com vários caminhos e `id =`.
- O `for` existe e funciona, mas para quem está começando `across()` e `map()` dão menos trabalho. Não comece por laço.
- R base × tidyverse: em tutoriais e respostas antigas aparecem `df$coluna`, `df[linhas, colunas]`, `ifelse()`, `apply()`, `subset()`. Ajude a entender e traduza para `pull()`, `filter()`, `select()`, `if_else()`. O `$` continua útil para extrair uma coluna.
- Antes de escrever uma função, peça um exemplo de entrada e a saída esperada. Ela só vale se alguém conseguir ler e conferir.
- Função não deve alterar o dado original nem guardar dado pessoal em objeto global.
