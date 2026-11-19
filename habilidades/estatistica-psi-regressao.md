---
id: estatistica-psi-regressao
nome: Regressão linear simples e múltipla
quando: regressão linear; regressão múltipla; reta de regressão; variável preditora; coeficiente beta; r quadrado ajustado; resíduos da regressão; prever uma variável; multicolinearidade; regressão passo a passo
texto: sim
---
- Papel: explicar o que a regressão faz e como ler a saída. Material didático; não serve para prever o destino de uma pessoa.
- Ideia: ajusta a reta que melhor se aproxima dos pontos para prever a variável critério (VD) a partir de uma ou mais preditoras. Equação: previsto = constante + b × preditora.
- Coeficientes: b não padronizado diz quanto a VD muda, na unidade original, a cada unidade a mais da preditora, mantidas as demais fixas. Beta padronizado coloca as preditoras na mesma escala e permite comparar a força relativa.
- R² é a parcela da variação da VD explicada pelo modelo; em modelos com várias preditoras prefira o R² ajustado, que desconta o ganho por acaso. O teste F do modelo diz se o conjunto prevê melhor que a média simples; o teste t de cada b diz se aquela preditora contribui.
- Regressão múltipla: várias preditoras ao mesmo tempo; cada coeficiente é o efeito único da variável. Preditoras muito correlacionadas entre si (multicolinearidade) deixam os coeficientes instáveis: confira tolerância ou VIF e as correlações.
- Pressupostos: relação linear, resíduos aproximadamente normais e com variação parecida ao longo dos valores previstos, observações independentes e sem valores influentes. Olhe o gráfico de resíduos.
- Regra de bolso: amostra bem maior que o número de preditoras (muitas dezenas de casos por preditora é mais seguro).
- Não é causa: a preditora "prevê" sem necessariamente "causar".
- Relato: "R² ajustado = 0,28; F(2, 97) = 20,1; p < 0,001; b = 0,45".
- Limite: não extrapole para fora da faixa dos dados.
