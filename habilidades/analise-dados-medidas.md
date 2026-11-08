---
id: analise-dados-medidas
nome: Escolher a medida certa e ler o resultado
quando: média ou mediana; qual medida usar; taxa por mil; taxa por 1000; variação percentual; correlação e causa; amostra pequena; interpretar resultado; interpretar gráfico; interpretar tabela; indicador de atendimentos
texto: sim
---
- Papel: ajudar a escolher a medida e a ler o resultado, sem conta de cabeça. Número que a pessoa colar entra na conta do programa; sem resultado nos cálculos feitos pelo programa, mostre a fórmula e o código e peça que ela rode.
- Contagem x proporção: o total mostra o tamanho; a proporção compara grupos diferentes. Sempre dizer o denominador ("38% das famílias acompanhadas", não "38%").
- Taxa por mil: para comparar territórios de tamanhos diferentes, casos ÷ população × 1000. Python: `df["taxa"] = df["casos"] / df["populacao"] * 1000`. R: `mutate(taxa = casos / populacao * 1000)`.
- Média x mediana: renda e tempo de espera têm valores extremos; a mediana (`median()`) resiste e a média é puxada. Mostre as duas quando divergem muito.
- Variação: diga a absoluta (+12 atendimentos) e a percentual ((novo − antigo) ÷ antigo × 100). Com base pequena o percentual engana: de 2 para 4 é +100%.
- Tendência: olhe pelo menos seis meses antes de falar em tendência; calendário escolar, férias e datas de pagamento explicam muita oscilação. Compare com o mesmo mês do ano anterior.
- Associação não é causa: dois indicadores que sobem juntos não provam que um causa o outro; diga o que mais poderia explicar. Correlação (`df.corr()`, `cor()`) só com número e com muitos pontos.
- Célula pequena: com poucos casos (menos de 5 é prática sugerida, e a gestão pode ter regra própria), agregue ou não mostre; nada de percentual por três pessoas, e pode identificar alguém.
- Dado ausente: nulo não é zero. Diga quantos faltam antes de qualquer média.
- Para a equipe: uma frase com o achado, o denominador, o período e o limite ("de janeiro a junho, 62% ...; não sabemos de quem não foi registrado").
- Estatística avançada (regressão, testes): só depois do básico; indique o capítulo de modelagem do guia de apoio e sugira apoio de quem entende, como a vigilância socioassistencial.
