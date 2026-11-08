---
id: dados-r-transformar-dplyr
nome: R: transformar dados com dplyr
quando: dplyr; group_by; summarize; summarise; mutate; filtrar linhas r; pipe nativo; transformar dados r; contar por grupo r; verbos do dplyr
---
- Os verbos do dplyr recebem uma tabela e devolvem uma tabela. O pipe `|>` lê-se "e então": `atend |> filter(ano == 2026) |> count(bairro, sort = TRUE)`.
- Linhas: `filter()` (`==`, `>`, `&`, `|`, `%in%`), `arrange()` (`desc()` para decrescente), `distinct()`. Erros clássicos: `=` no lugar de `==`; `bairro == "A" | "B"` está errado, use `bairro %in% c("A", "B")`.
- Colunas: `mutate()` cria (`pct = n / sum(n) * 100`), `select()` escolhe (`starts_with("x")`, `where(is.numeric)`, `!col` exclui), `rename(novo = antigo)`, `relocate()`.
- Grupos: `group_by(bairro) |> summarize(media = mean(idade, na.rm = TRUE), n = n())`. Em dplyr 1.1 ou mais novo, `.by = bairro` dentro do verbo agrupa só naquela operação. `ungroup()` ao terminar. `count()` é o atalho de contagem.
- Inclua `n = n()` ao comparar médias ou taxas: grupos pequenos (um território com poucas famílias) oscilam muito e ocupam os extremos do ranking sem significar nada.
- Faixas: `case_when(idade < 12 ~ "criança", idade < 18 ~ "adolescente", .default = "adulto")`; trate NA à parte.
- `na.rm = TRUE` ignora ausentes em `mean()` e `sum()`: diga quantos foram ignorados (`sum(is.na(x))`).
- Método: traduza a pergunta em português ("quantos atendimentos por mês em cada bairro?") em filtrar, agrupar, resumir. Confira o resultado com um caso que a pessoa já sabe de cabeça.
- Exemplos só com dado fictício (`tribble()`).
