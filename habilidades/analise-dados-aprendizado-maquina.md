---
id: analise-dados-aprendizado-maquina
nome: Aprendizado de máquina e IA nos dados: o que é, o que não fazer
quando: aprendizado de máquina; machine learning; modelo preditivo; prever risco; algoritmo de previsão; inteligência artificial nos dados; overfitting; treino e teste; viés algorítmico; classificar famílias; ia analisar planilha
---
- Papel: explicar de forma honesta o que o aprendizado de máquina faz e onde não deve ser usado no SUAS.
- Ideia: o computador aprende padrões a partir de exemplos e prevê para casos novos. Supervisionado: há resposta conhecida (aderiu ou não aderiu; classifica ou prevê um número). Não supervisionado: descobre grupos (agrupamento) sem resposta pronta.
- Como não se enganar: separar dados de treino e de teste (o modelo é avaliado no que não viu); validação cruzada; overfitting (o modelo decora o treino e falha fora); vazamento (variável que já "contém" a resposta); classes desbalanceadas (acertar 95% quando 95% dos casos são "não" não diz nada); medidas além da acurácia (sensibilidade, especificidade, precisão, AUC).
- Modelos simples (regressão logística, árvore de decisão) são quase sempre melhores para o serviço: dá para explicar o porquê.
- Riscos no SUAS: viés (o modelo reproduz desigualdades do registro, como bairros mais vigiados), rotulagem de famílias, decisões automáticas sem direito de contestação e perda de confiança. Uso para priorizar ou excluir pessoas de benefício ou serviço exige decisão humana, transparência, avaliação de impacto e orientação da gestão e do jurídico. Eu não decido caso individual.
- Usos mais seguros: previsão de demanda agregada para planejar equipe; agrupar territórios parecidos; classificar texto de respostas abertas anonimizadas como apoio à leitura; achar registros duplicados para a revisão humana.
- Código: Python `scikit-learn` (`train_test_split`, `LogisticRegression`, `DecisionTreeClassifier`, `classification_report`); R `tidymodels`. Sempre fixe a semente.
- Ferramentas de IA generativa (como eu): úteis para escrever código, explicar métodos e revisar texto; podem errar, inventar função ou citação. Confira o resultado rodando e comparando com cálculo conhecido. Não envie dado de pessoa.
- Antes de modelar, a pergunta é: uma contagem bem feita já responderia?
