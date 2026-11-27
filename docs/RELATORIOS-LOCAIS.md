# Relatórios locais no Paulus — etapas 1, 2 e 3

As tabelas e os relatórios são preparados no navegador. Os ficheiros não são anexados à conversa, enviados à IA nem gravados pelo fluxo. A etapa 1 cria o Excel **Famílias Recorrentes**; a etapa 2 divide a planilha do Território Volante por técnico; a etapa 3 cria PDFs individuais a partir dessa divisão.

## Etapa 1 — Famílias Recorrentes

1. Abra o console Paulus e escolha **Relatórios locais** no cabeçalho (ou em **Mais opções**, no telemóvel).
2. Selecione primeiro a planilha do mês anterior e depois a do mês atual. São aceites `.xlsx`, `.xls` e `.csv`, até 5 MB por ficheiro. A tabela tem de conter a coluna **Efeito** e um identificador do responsável (NIS ou CPF).
3. Confirme os meses e as quantidades indicadas e escolha **Gerar Excel**. O resultado é descarregado como `Famílias Recorrentes - [mês anterior] e [mês atual].xlsx`.

## Etapa 2 — Divisão por técnico: Território Volante

Esta função cria um Excel com uma aba de resumo e uma aba para cada técnico fixo do fluxo do Anona: Paulo Xavier (Psicólogo), Danilo Braga (Psicólogo) e Keomara Teles (Assistente Social). É específica para a tabela do **Território Volante**; não divide por uma coluna de técnico arbitrária.

1. Na janela **Relatórios locais**, carregue a planilha de condicionalidades do Território Volante em `.xlsx`, `.xls` ou `.csv` (máximo 5 MB). Se houver várias abas válidas, a que contém “Volante” no nome tem preferência; se não houver, é usada a primeira tabela compatível.
2. O cabeçalho deve estar entre as primeiras 25 linhas e incluir um campo de nome e pelo menos um campo entre **Efeito**, **Bairro** ou **NIS**, com registos abaixo. O mês é lido da coluna **Mês da Repercussão**, se existir, ou da linha de título **Período da Repercussão**.
3. Confirme o nome do ficheiro, o mês e as quantidades e escolha **Dividir e gerar Excel**. As famílias são ordenadas alfabeticamente pelo nome do responsável e repartidas em três blocos tão equilibrados quanto possível, com as sobras atribuídas aos primeiros técnicos. A divisão é por família, não por linha: os integrantes permanecem juntos; quando necessário, os campos da família são herdados da linha imediatamente anterior.
4. O Excel inclui o resumo com o número de famílias, a faixa alfabética e o mês, seguido pelas três abas com os registos de cada técnico. O ficheiro original não é alterado.

## Etapa 3 — Relatório Individual em PDF

1. Carregue a planilha na etapa 2. Assim que a divisão local ficar pronta, o Paulus prepara os relatórios PDF por técnico **em memória**; não é necessário descarregar e voltar a carregar o Excel.
2. Opcionalmente, mantenha marcada a opção **Visita** para incluir uma caixa por família no detalhamento, destinada a ser assinalada à mão.
3. Escolha **Gerar PDF(s) individual(is)**. Cada técnico com registos recebe um PDF A3 horizontal com capa-resumo (total de famílias, registos e contagem de famílias por efeito) e uma tabela detalhada. Quando houver mais de um técnico com dados, os PDFs são descarregados juntos num único ZIP; se só houver um relatório, descarrega-se apenas o PDF.
4. Os ficheiros usam o nome `Relatorio de Repercussao Individual - [técnico] - [mês].pdf`; o ZIP inclui a data de geração. A opção de PDF só está disponível enquanto a divisão atual permanecer na janela. Ao fechar a janela ou escolher **Limpar ficheiros**, os dados temporários são descartados.

O relatório inclui, quando presentes, NIS/CPF e nome do responsável, endereço, bairro, referência, NIS/nome do integrante, Motivo 1, Motivo 2 e Efeito. Identificadores numéricos têm os zeros à esquerda restaurados; campos familiares em branco nas linhas dos integrantes são herdados da família; integrantes duplicados são eliminados para a contagem. Nesta primeira versão, a ordem segue os dados da planilha: resumo e tabela estão implementados, mas a otimização da rota de visita e a divisão do detalhamento por blocos ficam para uma etapa posterior.

## Privacidade, dependências e limites

A leitura das planilhas, comparação, divisão e geração de PDF/ZIP acontecem no navegador. As bibliotecas XLSX, jsPDF e JSZip são recursos locais do Paulus; podem ser colocadas na cache offline do navegador. Os ficheiros dos utilizadores não são enviados para a rede nem para a IA, não são guardados em `localStorage` e são descartados da memória de trabalho ao fechar a janela. O Paulus mantém a sua ligação normal à IA para conversas, mas estes botões não fazem pedidos de IA e não consomem essa cota.

As etapas 1 a 3 estão implementadas. A divisão é fixa para os três técnicos do Território Volante e escolhe apenas uma aba da planilha de entrada; não combina abas de dados diferentes. O PDF é preparado a partir da divisão atual da etapa 2, usa apenas as colunas listadas acima e não altera os ficheiros originais. Os PDFs de Relatório Individual de planilhas organizadas fora desse fluxo e a união especializada de PDFs ficam para etapas futuras.
