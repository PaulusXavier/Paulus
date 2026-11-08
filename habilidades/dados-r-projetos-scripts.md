---
id: dados-r-projetos-scripts
nome: R: scripts, projetos e pastas
quando: projeto rstudio; script r; diretório de trabalho; working directory; caminho relativo; setwd; arquivo rproj; organizar pastas análise
---
- O console serve para testar. Análise de verdade vai em **script** (arquivo .R): o script, e não os objetos na memória, é a fonte da verdade. Ctrl/Cmd + Enter roda a linha ou a seleção; Ctrl/Cmd + Shift + S roda o script todo.
- Teste de sanidade: reinicie a sessão (Ctrl/Cmd + Shift + F10) e rode do topo ao fim. Se quebrar, faltava algo no código. Em Tools, Global Options, desmarque restaurar o workspace ao iniciar, para cada sessão começar limpa.
- Um **projeto do RStudio** por análise (File, New Project): cria uma pasta com um arquivo `.Rproj`. Ao abrir o projeto, o diretório de trabalho passa a ser essa pasta. `getwd()` mostra onde o R está; evite `setwd()`.
- Use caminhos **relativos** (`"dados/atendimentos.csv"`), com barra normal `/` mesmo no Windows, pois a barra invertida é caractere especial no R. Caminho absoluto (`C:/Users/...`) quebra quando outra pessoa ou outro computador abre o código.
- Pastas (prática sugerida): `dados/` (entrada, nunca editada à mão), `scripts/`, `resultados/` (tabelas e gráficos), `relatorios/`. Scripts numerados na ordem de execução: `01-importar.R`, `02-limpar.R`, `03-graficos.R`. Nomes sem espaço nem acento.
- `library()` no topo do script; `install.packages()` fora dele.
- "Arquivo não encontrado" quase sempre é caminho: peça `getwd()` e `list.files("dados")` antes de qualquer outra hipótese.
- Pasta com dado de pessoa não vai para nuvem pública nem para repositório do GitHub: veja o roteiro de dados de pessoas no R. O que for público usa dado fictício.
