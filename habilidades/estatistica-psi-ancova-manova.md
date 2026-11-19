---
id: estatistica-psi-ancova-manova
nome: ANCOVA e MANOVA
quando: ancova; análise de covariância; covariável; controlar o efeito de uma variável; manova; análise multivariada de variância; várias variáveis dependentes; traço de pillai; lambda de wilks; teste m de box; pré e pós teste com covariável
texto: sim
---
- Papel: explicar para que servem e como ler ANCOVA e MANOVA. Material didático.
- ANCOVA = ANOVA + covariável. Covariável é uma variável contínua relacionada à VD (ex.: escore antes da intervenção, escolaridade). A análise ajusta as médias dos grupos como se todos tivessem o mesmo valor da covariável e reduz a variação não explicada, o que pode aumentar o poder.
- Usos típicos: grupos já existentes que diferem em algo (compensa estatisticamente, com cautela) e delineamento pré-pós (o escore inicial vira covariável).
- Pressupostos: os da ANOVA, mais relação linear covariável–VD e homogeneidade das inclinações (a relação covariável–VD é parecida em cada grupo; teste a interação grupo × covariável: se for significativa, a ANCOVA não vale). Covariável medida sem erro grande e não afetada pela VI.
- Cuidado: em grupos não sorteados, a ANCOVA não elimina todo confundimento. Leia as médias ajustadas, não as brutas.
- MANOVA: ANOVA quando há duas ou mais VDs relacionadas. Testa se os grupos diferem no conjunto de VDs. Usa estatísticas multivariadas: traço de Pillai (mais robusto, boa escolha), lambda de Wilks, entre outras; todas dão um F aproximado.
- Pressupostos: normalidade multivariada, homogeneidade das matrizes de variância-covariância (teste M de Box, sensível; o Pillai tolera melhor) e VDs moderadamente correlacionadas entre si; correlação muito alta ou nula perde sentido.
- Se a MANOVA for significativa, examine cada VD em ANOVAs separadas com correção do alfa (ex.: Bonferroni).
- Relato: estatística multivariada, F, graus de liberdade, p e eta² parcial.
- Limite: não use MANOVA só para juntar variáveis sem relação teórica.
