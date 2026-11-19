---
id: excel-power-query
nome: Excel: Power Query (importar, limpar, juntar e atualizar)
quando: power query; power query excel; power query juntar planilhas; power query vários meses; power query csv; o que é power query; obter dados excel; combinar planilhas power query; juntar arquivos de uma pasta excel; transformar dados excel; etapas aplicadas; mesclar consultas; atualizar consulta excel; anular dinamização; juntar planilhas de vários meses excel
texto: sim
---
- O que é: Dados > Obter Dados (Excel 2016 ou mais novo; no 2010 e 2013 é suplemento). Lê CSV, Excel, pastas e outras fontes, e grava a receita de limpeza (Etapas Aplicadas). No mês seguinte, Dados > Atualizar Tudo refaz tudo. O arquivo de origem não é alterado.
- Importar CSV: Obter Dados > De Arquivo > De Texto/CSV. Escolha a origem (UTF-8 se o acento vier quebrado), o delimitador (`;` ou `,`) e abra em Transformar Dados. Defina NIS, CPF e CEP como Texto (ABC) já na importação para não perder zeros.
- No editor: remover colunas, filtrar linhas, dividir coluna por delimitador, Formato > Cortar e Limpar, substituir valores, Preencher para Baixo (desfaz mesclagem), usar primeira linha como cabeçalho, mudar tipo, coluna condicional, Agrupar Por (como dinâmica) e Remover Duplicatas (só na consulta; a fonte fica intacta).
- Juntar 12 meses: Obter Dados > De Arquivo > De Pasta > Combinar e Transformar. Todas as planilhas com as mesmas colunas viram uma tabela, com o nome do arquivo numa coluna. Mês novo é jogar o arquivo na pasta e atualizar.
- Acrescentar Consultas empilha tabelas de mesmas colunas. Mesclar Consultas cruza por chave, como PROCV, com tipos de junção: externa esquerda, interna e anti-junção esquerda (quem está numa e não está na outra).
- Anular Dinamização de Colunas transforma planilha larga (meses em colunas) em "uma linha por registro", que a tabela dinâmica pede.
- Carregar: Fechar e Carregar Para... em Tabela, Somente Conexão ou Modelo de Dados. Se o caminho do arquivo mudar (outro computador), ajuste em Configurações da Fonte de Dados.
- Privacidade: a consulta guarda o caminho e muitas vezes uma cópia dos dados no arquivo. Dado de família segue a regra do serviço para armazenamento e compartilhamento.
- Fluxo que cresceu demais (milhões de linhas, dezenas de passos) é sinal para R, Python ou SQL.
