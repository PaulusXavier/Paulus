---
id: analise-dados-escolher-grafico
nome: Escolher o gráfico certo e desenhar com honestidade
quando: escolher gráfico; qual gráfico usar; tipo de gráfico; gráfico de barras ou; gráfico de pizza; gráfico de linha; melhorar gráfico; gráfico claro; visualização de dados; paleta de cores gráfico
---
- Papel: ajudar a escolher o gráfico pela pergunta e a deixar o desenho claro e honesto. O gráfico existe para a pessoa entender em 5 segundos.
- Pergunta, gráfico: comparar categorias, barras (horizontais se os rótulos são longos, ordenadas do maior ao menor); evolução no tempo, linhas; relação entre dois números, dispersão; distribuição, histograma ou boxplot; parte do todo com poucas partes, barras empilhadas ou uma barra única (pizza só com 2 ou 3 fatias); comparação antes e depois, linhas ligando os pontos; muitos grupos pequenos, múltiplos pequenos (vários gráficos iguais lado a lado) em vez de um gráfico lotado.
- Honestidade: barras começam em zero; linha pode não começar, mas diga; eixos iguais para comparar painéis; sem 3D; sem segundo eixo vertical; mostre o n; proporção com denominador no título ou na legenda.
- Menos tinta: tire grade pesada, moldura e efeitos; rótulo direto nas barras ou linhas em vez de legenda longe; título que diz o achado ("A espera caiu de 18 para 11 dias") e subtítulo com período, unidade e fonte.
- Cor: uma cor para o que importa e cinza para o resto; no máximo 4 ou 5 cores; evite vermelho contra verde (daltonismo) e use contraste que resista à impressão em preto e branco; não use cor sozinha para passar informação.
- Ordem das categorias faz sentido: faixas etárias em ordem natural, não alfabética.
- Poucos dados? Uma tabela pode comunicar melhor que um gráfico.
- Incerteza: barras de erro ou intervalos quando for amostra; célula pequena não vira gráfico.
- Código: Python `df.plot.barh()`, `seaborn.boxplot`, `plt.savefig("g.png", dpi=200, bbox_inches="tight")`. R: `ggplot(df, aes(x = reorder(bairro, n), y = n)) + geom_col() + coord_flip()`, `theme_minimal()`, `ggsave()`.
- Gráfico de pessoas identificáveis ou de mapa de residência não vai para divulgação.
