---
id: psicometria-codigo-r
nome: Psicometria com código em R
quando: código psicometria r; alfa de cronbach r; análise fatorial r; pacote psych r; pacote lavaan r; pacote mirt r; psicometria com r; confiabilidade com r
texto: sim
---
- Papel: escrever o código; a pessoa roda no computador do serviço e o Paulus não vê os dados. Nunca peça dado de pessoa colado no chat: use colunas e valores fictícios nos exemplos. Para Python, veja o roteiro próprio.
- Preparação: uma coluna por item (itens invertidos já recodificados), uma linha por pessoa, sem nome, CPF nem NIS no arquivo de análise. Conte os faltantes antes.
- Precisão: `library(psych)`; `alpha(itens)` (alfa, correlação item-total, alfa sem cada item); `omega(itens)`.
- Dados servem para fatorar? `KMO(itens)`; `cortest.bartlett(cor(itens), n = nrow(itens))`.
- AFE: `fa.parallel(itens, fa = "fa")` indica quantos fatores; `fa(itens, nfactors = 2, rotate = "oblimin", fm = "ml")`; para itens ordinais, `fa(itens, nfactors = 2, cor = "poly")`; `print(fa$loadings, cutoff = 0.30)`.
- AFC: `library(lavaan)`; `modelo <- 'F1 =~ i1 + i2 + i3' ` em uma linha por fator; `fit <- cfa(modelo, data = itens, ordered = names(itens))`; `fitMeasures(fit, c("cfi", "tli", "rmsea", "srmr"))`. Com estimador robusto para ordinais, peça as versões "scaled" ou "robust". `summary(fit, standardized = TRUE)` mostra as cargas.
- TRI: `library(mirt)`; `mod <- mirt(itens, 1, itemtype = "graded")`; `coef(mod, IRTpars = TRUE)`; `plot(mod, type = "trace")`; `itemfit(mod)`; `fscores(mod)`.
- Escores: `z <- as.numeric(scale(x))`; `T <- 50 + 10 * z`.
- Concordância: `library(irr)`; `kappa2(cbind(a1, a2))`; `icc(cbind(a1, a2))`.
- Banco para praticar: `psych::bfi` (itens de personalidade, dado aberto do pacote). Informe a versão dos pacotes, rode `install.packages("psych")` se faltar e peça a saída para interpretarem juntos; um índice de ajuste não é veredito.
