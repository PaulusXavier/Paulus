---
id: psicometria-analise-fatorial
nome: Análise fatorial e dimensionalidade
quando: análise fatorial; análise fatorial exploratória; análise fatorial confirmatória; cargas fatoriais; kmo bartlett; análise paralela; índices de ajuste; rmsea cfi; dimensionalidade da escala; estrutura fatorial; matriz policórica
texto: sim
---
- Para que serve: ver quantas dimensões há nos itens e quais itens pertencem a cada uma (evidência de estrutura interna). Itens que se correlacionam muito formam um fator.
- AFE (exploratória): sem hipótese forte, o programa sugere a estrutura. AFC (confirmatória): testa uma estrutura definida de antemão, de preferência em outra amostra. Fazer AFE e AFC na mesma amostra e chamar de confirmação é erro comum.
- Passos da AFE: (1) conferir se os dados servem: amostra, correlações entre itens, KMO e teste de esfericidade de Bartlett; (2) decidir quantos fatores: análise paralela é mais recomendada que "autovalor maior que 1"; gráfico de declividade ajuda; (3) estimar: eixos principais ou máxima verossimilhança; para itens ordinais, partir da matriz policórica; (4) rotacionar: oblíqua (oblimin, promax) quando os fatores podem se correlacionar, o comum em psicologia; varimax impõe independência; (5) ler cargas, cargas cruzadas e itens fracos; (6) nomear os fatores pela teoria, não pelo programa.
- AFC e ajuste: qui-quadrado (sensível a amostra grande), CFI e TLI (referência comum: 0,95 ou mais), RMSEA (até cerca de 0,06 a 0,08), SRMR (até cerca de 0,08). São referências de Hu e Bentler, não limites rígidos, e nenhum índice decide sozinho. Olhe também as cargas e os resíduos. Não aceite "modificações" sem sentido teórico.
- Tamanho da amostra: não há número mágico. "10 pessoas por item" é aproximação; comunalidades altas e fatores bem definidos pedem menos. Amostra pequena dá estrutura instável.
- Itens com poucas categorias (Likert de 4 a 5 pontos): estimadores próprios para dados ordinais, como WLSMV, costumam ser preferidos.
- Estrutura fatorial é evidência, não prova de que o construto "existe".
- Código: veja os roteiros de R e de Python. Material didático; não interprete dado de pessoa real.
