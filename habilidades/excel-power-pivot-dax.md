---
id: excel-power-pivot-dax
nome: Excel: modelo de dados, Power Pivot e medidas DAX
quando: power pivot; dax excel; modelo de dados excel; medidas dax; relacionamentos excel; contagem distinta excel; calculate dax; modelo relacional excel; relacionar tabelas excel
texto: sim
---
- Modelo de Dados: várias tabelas relacionadas por chave dentro do Excel (sem PROCV), alimentando uma só tabela dinâmica. Power Pivot é a janela que gerencia o modelo e escreve medidas em DAX. Existe no Microsoft 365 e em edições profissionais do desktop; pode faltar em edições domésticas, no Excel para web e no Mac mais antigo. Confira em Dados > Gerenciar Modelo de Dados.
- Quando vale: tabelas de nível diferente (famílias, pessoas, atendimentos, unidades), contagem distinta, indicadores que a dinâmica comum não faz, mais de um milhão de linhas, ou para evitar dez colunas de PROCV.
- Passos: transforme cada base em Tabela (Ctrl+T) e nomeie; Dados > Relações, ligando a chave da tabela "muitos" (atendimentos[IDFamília]) à da tabela "um" (famílias[IDFamília], valores únicos). Insira a dinâmica a partir do modelo e use campos das duas tabelas juntos.
- Medidas em DAX (nomes de função em inglês mesmo no Excel em português; o separador segue a região): `Atendimentos := COUNTROWS(Atend)`; `Famílias := DISTINCTCOUNT(Atend[IDFamília])`; `Total := SUM(Atend[Valor])`; `Taxa := DIVIDE([Visitas];[Atendimentos])`; `Visitas := CALCULATE(COUNTROWS(Atend); Atend[Tipo]="visita")`.
- Datas: crie tabela Calendário (uma linha por dia, com ano, mês, trimestre) e relacione à data do registro. Assim agrupa por mês e compara com o mesmo período do ano anterior (SAMEPERIODLASTYEAR).
- Medida não é coluna calculada: a medida calcula na hora, conforme os filtros da dinâmica; a coluna calcula linha a linha e ocupa memória. Prefira medida.
- Privacidade: o modelo guarda os dados no arquivo. Com NIS ou nome, trate o arquivo como sensível.
- Se só precisa juntar bases e resumir, Power Query + tabela dinâmica bastam. Para rotina e estatística de verdade, R, Python ou SQL.
- DAX é o mesmo de Power BI: o estudo vale se a ideia é chegar a painéis.
