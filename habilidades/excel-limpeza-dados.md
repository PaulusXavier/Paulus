---
id: excel-limpeza-dados
nome: Excel: limpar e padronizar uma base
quando: limpar dados excel; limpeza de dados excel; remover duplicados excel; duplicados excel; padronizar dados excel; dados sujos excel; números como texto excel; espaços sobrando excel; categorias diferentes excel; localizar e substituir excel; planilha bagunçada; células mescladas excel
texto: sim
---
- Ordem segura: copie o arquivo e trabalhe na cópia; olhe antes de mexer (o filtro de cada coluna mostra as variações); corrija; registre numa aba "Notas" o que mudou, quando e quantas linhas.
- Estrutura: cabeçalho único na primeira linha, uma linha por registro, uma informação por coluna, sem célula mesclada, sem subtítulo ou total no meio, sem coluna em branco. Para preencher o que a mesclagem desfeita deixou vazio: selecione a coluna > Ir Para Especial > Em branco, digite `=`, tecle a seta para cima e Ctrl+Enter.
- Espaços e invisíveis: ARRUMAR, LIMPAR, `SUBSTITUIR(A2;CARACT(160);" ")`.
- Mesma categoria escrita de formas diferentes ("CRAS Centro", "cras centro ", "Cras-Centro"): o filtro mostra as variantes; corrija com Localizar e Substituir ou com tabela de equivalência + PROCV. Lista suspensa na entrada impede que nasçam.
- Número como texto: canto verde > Converter em Número, ou `=VALOR(A2)`. Vírgula e ponto decimal trocados costumam vir de CSV: Texto para Colunas > Avançado define os separadores.
- Duplicados: Dados > Remover Duplicados apaga de verdade, então só em cópia, e escolha as colunas que definem a repetição (NIS sozinho não é NIS + data). Para só ver: formatação condicional > Valores Duplicados, ou coluna `=CONT.SE($A$2:$A2;A2)` (1 é a primeira ocorrência, 2 ou mais são repetidas). Repetido pode ser atendimento legítimo: confirme antes de apagar.
- Valores impossíveis (idade negativa ou acima de 120, data futura): `=SE(OU(D2<0;D2>120);"Revisar";"")` e filtre.
- Vazio, zero e "não informado" são coisas diferentes: decida e padronize, e diga quantos faltam antes de qualquer média.
- Para repetir a mesma limpeza todo mês sem refazer à mão, grave no Power Query (etapas aplicadas).
- Aba "Dicionário": nome da coluna, significado, formato e valores possíveis.
