---
id: estatistica-psi-anova-uma-via
nome: ANOVA de um fator, post hoc e medidas repetidas
quando: anova de uma via; análise de variância; comparar três grupos; comparar mais de dois grupos; teste post hoc; tukey bonferroni; comparações múltiplas; anova de medidas repetidas; esfericidade de mauchly; valor f da anova
texto: sim
---
- Papel: orientar escolha, leitura e relato da ANOVA com um fator. Material didático.
- Para quê: comparar médias de três ou mais condições. Fazer vários testes t infla o erro tipo I (taxa de erro de conjunto); a ANOVA faz um teste global.
- Ideia: compara a variação entre os grupos com a variação dentro dos grupos. F = variação entre ÷ variação dentro. F perto de 1: diferenças como as do acaso; F grande: grupos diferem além disso.
- Pressupostos (entre participantes): VD contínua aproximadamente normal em cada grupo, variâncias parecidas (teste de Levene; se violado, use Welch ou Brown-Forsythe) e independência. Grupos de tamanhos parecidos deixam o teste mais robusto.
- F significativo só diz que pelo menos um par difere. Para saber qual: comparações planejadas (decididas antes, por hipótese) ou post hoc (todos os pares, com correção: Tukey é comum; Bonferroni é mais conservador).
- Tamanho do efeito: eta quadrado (parcial) = parcela da variação da VD ligada ao fator.
- Medidas repetidas (mesmas pessoas em 3 ou mais ocasiões): pressupõe esfericidade (variâncias das diferenças parecidas); o teste de Mauchly checa. Se violada (p < 0,05), leia a linha corrigida (Greenhouse-Geisser).
- Relato: "F(2, 57) = 4,3; p = 0,018; eta² parcial = 0,13; Tukey mostra que A difere de C".
- Dados ordinais ou muito assimétricos: Kruskal-Wallis (grupos) ou Friedman (repetidas).
- Limite: diferença entre grupos não é efeito de política sem controle de confusão.
