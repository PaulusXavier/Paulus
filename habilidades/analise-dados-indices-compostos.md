---
id: analise-dados-indices-compostos
nome: Índices compostos e pontuações (vulnerabilidade, risco, qualidade)
quando: índice composto; construir índice; índice de vulnerabilidade; escore composto; padronizar variáveis; normalização min max; pontuação de risco; combinar indicadores; ponderação de indicadores; ranking de territórios
---
- Papel: ajudar a combinar vários indicadores em um número só (por exemplo, para priorizar territórios) com os cuidados que isso exige.
- Antes de começar: por que um índice só? Muitas vezes uma tabela com os indicadores lado a lado é mais clara. Índice esconde o que o compõe.
- Passos: (1) definir o conceito (o que é "vulnerabilidade" aqui, para quem, por quê); (2) escolher indicadores que representem o conceito, com dado de qualidade e cobertura por todos os territórios; (3) tratar valores faltantes e atípicos; (4) deixar todos na mesma direção (alto = pior); (5) colocá-los na mesma escala; (6) decidir pesos; (7) somar ou combinar; (8) testar o quanto a classificação muda com outras escolhas; (9) documentar tudo.
- Padronização: z = (valor − média) ÷ desvio padrão; min-max = (valor − mínimo) ÷ (máximo − mínimo), de 0 a 1 (sensível a extremos); posto (ranking) ou percentil. Escolha e diga qual.
- Pesos: iguais (transparente, e é uma escolha); definidos pela equipe em consenso (técnica participativa); estatísticos (análise de componentes principais, que pede cuidado e leitura). Mostre a sensibilidade: o ranking muda muito se o peso mudar?
- Indicadores muito correlacionados contam o mesmo fator duas vezes.
- Interpretação: índice é relativo (posição entre os territórios), não absoluto. Território "médio" pode ainda ter grande necessidade. Mostre os componentes.
- Uso responsável: para planejar e priorizar ações, com a revisão humana. Não use como nota de pessoas, famílias ou profissionais. Famílias não são ranqueadas por pontuação sem política e sem critérios claros em norma; critérios oficiais (como os do CadÚnico) vêm das fontes.
- Código: Python `from sklearn.preprocessing import StandardScaler, MinMaxScaler`; R `scale(x)` e `(x - min(x)) / (max(x) - min(x))`.
- Para o território, use a taxa e junte por código da área.
