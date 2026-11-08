---
id: dados-r-texto-datas-fatores
nome: R: texto, datas e fatores
quando: stringr; lubridate; forcats; texto no r; datas no r; converter data r; dmy; str_detect; fator no r; expressão regular r; regex no r; limpar nomes de bairro
---
- Texto (stringr): `str_to_lower()`, `str_squish()` (tira espaços sobrando), `str_replace_all()`, `str_detect(x, "padrão")` (dá TRUE ou FALSE, ótimo dentro de `filter()`), `str_sub()`, `str_c()`.
- Dado real vem como "Centro", "centro " e "CENTRO": padronize com `str_squish(str_to_title(bairro))` e confira com `count(bairro)` antes e depois. Para comparar sem acento: `stringi::stri_trans_general(x, "Latin-ASCII")`.
- Expressão regular: `.` qualquer caractere, `^` começo, `$` fim, `[0-9]+` um ou mais dígitos, `|` ou; `\\d` precisa de barra dupla dentro das aspas. Teste com `str_view()`. Não é preciso dominar no começo.
- Datas (lubridate): a função segue a ordem do texto: `dmy("07/11/2026")`, `ymd("2026-11-07")`. No Brasil o texto costuma ser dia/mês/ano, e usar a ordem errada gera data errada em silêncio: sempre confira com `range(datas)`. Extraia com `year()`, `month(x, label = TRUE)`, `wday()`; agrupe por mês com `floor_date(x, "month")`.
- Fatores (forcats) são para categoria com ordem própria (faixa etária, escolaridade, mês): `factor(x, levels = c("jan", "fev", "mar"))`. Sem isso, a ordem é alfabética e o gráfico sai com "abr, fev, jan". Outras: `fct_reorder()`, `fct_infreq()`, `fct_lump_n(x, 5)` (agrupa o resto em "Outros").
- `read_csv()` traz texto como character. Vire fator só quando a ordem importar.
- Nome, data de nascimento e idade de pessoa real são dado pessoal: nos exemplos, use só valores inventados.
