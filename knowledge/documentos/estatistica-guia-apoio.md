---
doc: estatistica-guia-apoio
titulo: Estatística para o trabalho no SUAS: guia de apoio (não é norma)
norma: Síntese própria de apoio ao estudo de estatística aplicada ao serviço social e à psicologia, a partir de conceitos de uso corrente em livros-texto abertos (como OpenIntro Statistics e Think Stats, em inglês, ambos de acesso livre). Não reproduz nenhum texto. Prática sugerida não é norma.
ano: 2026
tipo: apoio
revisao: pendente
---

<!--
Material de estudo, não norma. Serve para o Paulus explicar conceitos com as próprias palavras e indicar o roteiro certo. Os roteiros práticos estão em habilidades/estatistica-*.md.
-->

## Para que serve a estatística no serviço

Contar bem, comparar grupos, territórios e períodos, medir a incerteza do número e evitar conclusões fortes demais. Não prova caso individual e não decide por ninguém. Dado administrativo mostra quem foi registrado, não toda a população.

## Tipos de variável

Nominal (grupos sem ordem), ordinal (com ordem), discreta (contagem) e contínua (medida). O tipo decide a conta, o gráfico e o teste. NIS, CPF, CEP e telefone são identificadores e ficam como texto.

## Medidas de resumo

Posição: média, mediana e moda. Dispersão: amplitude, quartis, amplitude interquartil, variância e desvio padrão. Em dado assimétrico (renda, espera) a mediana descreve melhor que a média. Sempre dizer o n e quantos valores faltam.

## Distribuição e valores atípicos

Olhar o histograma ou o boxplot antes de escolher o resumo ou o teste. Valor atípico se confere (erro ou caso real) e não se apaga para melhorar o resultado. Testes de normalidade têm uso limitado: o gráfico informa mais.

## Amostra, população e vieses

Quem foi registrado não é toda a população. Vieses comuns: seleção, não resposta, sobrevivência, desejabilidade social e cobertura. Mais gente não corrige amostra viesada. Dizer como a amostra foi obtida e a taxa de resposta.

## Incerteza e intervalo de confiança

O erro padrão cai com a raiz de n. O intervalo de confiança de 95% é a faixa de valores compatíveis com os dados. Para proporção com poucos casos, o intervalo de Wilson é preferível ao simples. Mostrar sempre o n.

## Teste de hipótese e p-valor

O p-valor é a raridade dos dados se a hipótese nula e o modelo fossem verdadeiros. Não é a chance de a hipótese ser verdadeira, nem o tamanho do efeito. Resultado sem significância não prova ausência de diferença (falta de poder). Muitos testes inflam o erro; combinar a pergunta antes.

## Escolha do teste

Resultado numérico e dois grupos independentes: t de Welch ou Mann-Whitney. Mesmos indivíduos antes e depois: t pareado ou Wilcoxon. Três ou mais grupos: ANOVA ou Kruskal-Wallis. Categoria contra categoria: qui-quadrado ou Fisher (contagens esperadas baixas); McNemar para pareado.

## Tamanho do efeito

Diferença bruta (pontos percentuais, dias), risco relativo, razão de chances, d de Cohen, V de Cramér, r. Referências de pequeno, médio e grande são só indicações; o contexto decide a importância prática. Mostrar o intervalo do efeito.

## Correlação e regressão

Pearson (linear) e Spearman (postos). Gráfico de dispersão primeiro. A regressão linear descreve associação média mantendo as outras variáveis fixas; a logística trata resultado sim ou não e dá razão de chances. Conferir resíduos, valores influentes, multicolinearidade e poucos casos.

## Séries no tempo

Tendência, sazonalidade e ruído. Comparar com o mesmo mês do ano anterior; média móvel suaviza; menos de 12 pontos não permite falar em tendência. Mudança de sistema ou de regra de registro quebra a série.

## Causalidade

Associação não é causa: confusão, seleção, regressão à média, maturação e eventos externos. Grupo de comparação, medida antes e depois nos dois grupos e várias medidas antes fortalecem a conclusão. Juntar com o olhar qualitativo.

## Probabilidade e triagem

Frequências naturais ajudam a entender taxa base, falso positivo e valor preditivo. Resultado positivo de triagem indica avaliação, não diagnóstico. Risco absoluto importa mais que o relativo.

## Psicometria básica

Confiabilidade (teste-reteste, consistência interna, concordância entre avaliadores), validade (conteúdo, critério, construto), escores (z, T, percentil), erro padrão de medida e pontos de corte com sensibilidade e especificidade. A conferência de instrumentos para uso profissional é no SATEPSI.

## Armadilhas

Denominador esquecido, pontos percentuais x percentual, base pequena, paradoxo de Simpson, falácia ecológica, viés de sobrevivência, escolha de período, muitas comparações, correlação espúria, média de médias e gráfico enganoso.

## Reamostragem

Bootstrap e testes de permutação calculam incerteza com o computador quando a fórmula não serve (dado pequeno, torto, medida incomum). Não corrigem amostra viesada.

## Trilha de estudo sugerida

Variáveis e tabelas; resumo e gráficos; proporção e denominador; amostra e incerteza; comparar grupos; tamanho do efeito; correlação e regressão; séries; causalidade e armadilhas. Prática com dado fictício ou agregado.

## Materiais abertos para estudar

OpenIntro Statistics e Think Stats (inglês, acesso livre); Fundamentals of Data Visualization, de Claus Wilke (inglês, acesso livre); documentação do pandas, SciPy, statsmodels e do tidyverse. Conferir endereços e edições atuais.

## Cuidado com dados de pessoas

Aprender com dado fictício ou agregado. Dado de família não vai para o chat nem para nuvem pública. Conferir a LGPD e a orientação da gestão.
