---
id: dados-r-primeiros-passos
nome: R: primeiros passos (objetos, funções, pacotes)
quando: primeiros passos r; instalar pacote r; install.packages; library tidyverse; console rstudio; vetor r; objeto r; atribuição r; snake_case
---
- R é uma calculadora que guarda resultados em objetos: `total <- 120 + 35`. O `<-` lê-se "recebe" (atalho no RStudio: Alt + `-`): nome à esquerda, valor à direita. R diferencia maiúscula de minúscula.
- Vetor: `idades <- c(2, 5, 9)`. A conta vale para todos os elementos de uma vez (`idades * 12`). Texto vai entre aspas: `bairros <- c("Bairro A", "Bairro B")`.
- Função: `nome(argumento = valor)`, como `mean(idades)` ou `seq(1, 10, by = 3)`. Ajuda: `?mean`. Os argumentos têm nome; confira na ajuda em vez de adivinhar.
- Comentário começa com `#`. Explique o porquê do código, não o óbvio.
- Nomes: minúsculas, números e `_` (snake_case), sem espaço nem acento, e que digam o conteúdo (`atend_mes`, não `x1`).
- Pacotes: instale uma vez no console, `install.packages("tidyverse")`, nunca dentro de script compartilhado. Carregue a cada sessão com `library(tidyverse)`. O tidyverse traz ggplot2, dplyr, tidyr, readr e outros. Também dá para chamar uma função sem carregar: `pacote::funcao()`. Para praticar: `library(dados)`.
- Erros do começo: o console mostra `+` em vez de `>` quando falta fechar aspas ou parêntese (aperte Esc); "object not found" é erro de digitação ou a linha que cria o objeto ainda não rodou; "could not find function" é `library()` esquecido.
- Por trecho: diga o que ele faz, o que deve aparecer na tela e proponha um mini exercício ("troque os valores e rode de novo").
- Iniciante não precisa de listas, tipos nem R base agora. Uma ideia por vez.
