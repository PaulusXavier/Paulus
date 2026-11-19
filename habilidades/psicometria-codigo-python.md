---
id: psicometria-codigo-python
nome: Psicometria com código em Python
quando: código psicometria python; alfa de cronbach python; análise fatorial python; pingouin psicometria; factor analyzer python; psicometria com python; confiabilidade com python; curva roc python
texto: sim
---
- Papel: escrever o código; a pessoa roda no computador do serviço e o Paulus não vê os dados. Nunca peça dado de pessoa colado no chat: use colunas e valores fictícios nos exemplos. Para R, veja o roteiro próprio.
- Preparação: `itens = pd.read_csv("itens.csv")`, uma coluna por item (itens invertidos já recodificados), uma linha por pessoa, sem nome, CPF nem NIS. Confira faltantes com `itens.isna().sum()`.
- Precisão: `import pingouin as pg`; `pg.cronbach_alpha(data=itens)` devolve o alfa e o intervalo de confiança.
- Dados servem para fatorar? `from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity`; `calculate_bartlett_sphericity(itens)`; `calculate_kmo(itens)`.
- AFE: `fa = FactorAnalyzer(n_factors=2, rotation="oblimin")`; `fa.fit(itens)`; `fa.loadings_`; `fa.get_eigenvalues()` ajuda no gráfico de declividade; `fa.get_factor_variance()`.
- AFC: o pacote `semopy` aceita a descrição `"F1 =~ i1 + i2 + i3"` em `Model(desc)`, `.fit(itens)` e `semopy.calc_stats(modelo)` (CFI, TLI, RMSEA). Para itens ordinais e TRI, o R (lavaan e mirt) é mais completo: diga isso.
- Escores: `z = (x - x.mean()) / x.std(ddof=1)`; `T = 50 + 10 * z`.
- Concordância: `from sklearn.metrics import cohen_kappa_score`; `cohen_kappa_score(a1, a2)`.
- Triagem: `from sklearn.metrics import roc_curve, roc_auc_score`; `fpr, tpr, cortes = roc_curve(y, escore)`; `roc_auc_score(y, escore)`; escolher o corte exige julgamento, não só o número.
- Instalação: `pip install pingouin factor_analyzer semopy`. Informe as versões e peça a saída para interpretarem juntos; um índice de ajuste não é veredito.
