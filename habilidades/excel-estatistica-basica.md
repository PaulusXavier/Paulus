---
id: excel-estatistica-basica
nome: Excel: estatística básica (descritiva, correlação, histograma)
quando: estatística no excel; desvio padrão excel; correlação excel; percentil excel; quartil excel; moda excel; mediana excel; histograma excel; regressão no excel; análise de dados excel suplemento; ranking excel
texto: sim
---
- Descritiva: `=MED()`, `=MODO.ÚNICO()`, `=DESVPAD.A()` (amostra) e `=DESVPAD.P()` (população inteira), `=VAR.A()`, `=QUARTIL.INC(intervalo;1)`, `=PERCENTIL.INC(intervalo;0,9)`. Na dúvida entre amostra e população, DESVPAD.A.
- Média e mediana muito diferentes indicam distribuição assimétrica (renda, tempo de espera): mostre as duas.
- Associação: `=CORREL(A2:A100;B2:B100)` vai de −1 a 1. Correlação não é causa, exige números e muitos pares. Regressão simples: `=INCLINAÇÃO()` e `=INTERCEPÇÃO()`.
- Frequências: tabela dinâmica ou `=CONT.SES(faixa;">=18";faixa;"<30")`. Histograma: Inserir > Gráfico > Histograma (2016 ou mais novo), com os intervalos definidos por você.
- Proporção com margem: não há função pronta. `p ± 1,96*RAIZ(p*(1-p)/n)` é aproximação ruim com n pequeno ou p perto de 0 ou 1; para intervalo melhor, R ou Python.
- Ranking: `=ORDEM.EQ(B2;$B$2:$B$30;0)`; `=MAIOR(B2:B30;3)` é o terceiro maior; `=MENOR()`. Cuidado: ranking de unidades sem contexto vira cobrança injusta.
- Indicadores: taxa por mil `=casos/população*1000`; variação `=(novo-antigo)/antigo`; mostre o valor absoluto junto.
- Suplemento Ferramentas de Análise (Arquivo > Opções > Suplementos > Gerenciar: Suplementos do Excel > Ir): Estatística Descritiva, Teste t, ANOVA, Regressão, Histograma. A saída é uma tabela estática, que não recalcula quando os dados mudam: anote a data e a origem.
- Teste de hipótese, modelos, bootstrap e intervalos de confiança com rigor passam para R ou Python (roteiros de estatística e de dados). Excel é ótimo para descrever.
- Poucos casos pedem cautela: indique o n e não conclua.
