---
id: psicometria-tri
nome: Teoria de Resposta ao Item (TRI)
quando: teoria de resposta ao item; tri psicometria; modelo rasch; curva característica do item; parâmetro de dificuldade; parâmetro de discriminação; função de informação do item; modelo logístico de dois parâmetros; traço latente theta; tri enem
texto: sim
---
- Ideia: a TRI modela a probabilidade de a pessoa acertar (ou concordar com) cada item em função do seu nível no traço latente (theta) e das características do item. A medida é feita no nível do item, não só da soma.
- Parâmetros: a = discriminação (quão bem o item separa quem tem mais de quem tem menos do traço); b = dificuldade (nível de theta em que a chance é de 50% no 2PL); c = acerto casual (3PL, em múltipla escolha). Rasch ou 1PL: só b, com discriminação igual em todos os itens e exigência de medida mais estrita. Itens Likert usam modelos politômicos, como resposta gradual de Samejima e crédito parcial.
- Curva característica do item: gráfico da probabilidade de resposta em função de theta, em forma de S. Mudar a inclina a curva; mudar b a desloca para a direita ou para a esquerda. Bom jeito de ensinar: comece por essa figura.
- Função de informação: mostra em que faixa do traço o item, ou o teste inteiro, mede com mais precisão. O erro varia conforme o nível do traço; a teoria clássica supõe um erro só.
- Pressupostos: unidimensionalidade (um traço dominante), independência local (itens se relacionam só pelo traço) e curva do formato escolhido. Confira com análise fatorial e resíduos.
- Vantagens: itens e pessoas na mesma métrica, equalização de versões, testes adaptativos por computador e análise de DIF. Custos: amostras maiores (centenas, de preferência mais), software e conhecimento específicos.
- Theta nasce numa escala arbitrária (média 0, DP 1) e costuma ser transformado depois, por exemplo para média 500 e DP 100. Avaliações educacionais em larga escala, como o Enem, usam TRI.
- Código em R (pacote mirt): veja o roteiro de R. Material didático; não interprete dado de pessoa real.
