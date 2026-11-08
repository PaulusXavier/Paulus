---
id: dados-r-erros-ajuda
nome: R: entender erros e pedir ajuda
quando: erro no r; erro r; mensagem de erro r; could not find function; object not found; unexpected symbol; reprex; pedir ajuda r; stack overflow r; deu erro no rstudio
---
- Leia a mensagem inteira: ela costuma trazer a função e o problema. Traduza do inglês e explique em português.
- Erros comuns: `could not find function "x"` é `library()` esquecido ou nome digitado errado; `object 'x' not found` é nome errado, maiúscula ou a linha que cria o objeto não rodou; `unexpected symbol` ou `unexpected '}'` é vírgula, parêntese ou aspa faltando (o RStudio sublinha); `non-numeric argument to binary operator` é coluna de texto sendo usada como número (veja `glimpse()`); `package 'x' is not available` é nome errado ou R antigo; `cannot open file` é caminho (`getwd()`).
- Aviso (Warning) não é erro, mas leia: "NAs introduced by coercion" quer dizer que texto virou NA ao converter em número; "many-to-many" num join indica chave repetida.
- Depure em passos: rode o pipe até antes de cada `|>` e olhe o resultado de cada etapa; use `glimpse()`, `names()`, `class()`, `count()`.
- Pedir ajuda bem (reprex, exemplo mínimo reprodutível): poucas linhas de dado INVENTADO (`tribble()` ou `dput(head(df))` só com dado fictício), o código, a mensagem exata e o `sessionInfo()`. Há o pacote `reprex`.
- Nunca cole dado de família em fórum, chat ou IA, inclusive aqui.
- Onde aprender mais: `?funcao`, `vignette("dplyr")`, comunidades de R em português, Posit Community. Eu ajudo a interpretar a mensagem, mas não rodo o código.
- Peça sempre: o código, a mensagem exata e o que a pessoa esperava ver. Sem isso, não afirme a causa; ofereça as duas ou três hipóteses mais prováveis.
