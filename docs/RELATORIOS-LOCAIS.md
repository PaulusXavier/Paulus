# Relatórios locais no Paulus — etapas 1 e 2

Esta primeira etapa acrescenta ao console o relatório **Famílias Recorrentes**, inspirado no fluxo correspondente do Anona. O relatório cruza duas planilhas de condicionalidades (mês anterior e mês atual), identifica famílias pelo NIS do responsável ou, quando necessário, pelo CPF e cria um ficheiro Excel com resumo, lista consolidada e separadores por técnico. Famílias que mudaram de técnico ficam numa aba própria.

## Como usar

1. Abra o console Paulus e escolha **Relatórios locais** no cabeçalho (ou em **Mais opções**, no telemóvel).
2. Selecione primeiro a planilha do mês anterior e depois a do mês atual. São aceites `.xlsx`, `.xls` e `.csv`, até 5 MB por ficheiro. A tabela tem de conter a coluna **Efeito** e um identificador do responsável (NIS ou CPF).
3. Confirme os meses e as quantidades indicadas e escolha **Gerar Excel**. O resultado é descarregado como `Famílias Recorrentes - [mês anterior] e [mês atual].xlsx`.

## Etapa 2 — Divisão por técnico: Território Volante

Esta função cria um novo Excel com uma aba de resumo e uma aba por técnico fixo do fluxo do Anona: Paulo Xavier (Psicólogo), Danilo Braga (Psicólogo) e Keomara Teles (Assistente Social). É específica para a tabela de condicionalidades do **Território Volante**; não divide por uma coluna de técnico arbitrária.

1. Na janela **Relatórios locais**, carregue a planilha do Território Volante em `.xlsx`, `.xls` ou `.csv` (máximo 5 MB). Se houver várias abas válidas, a que contém “Volante” no nome tem preferência; se não houver, é usada a primeira tabela compatível.
2. O cabeçalho deve estar entre as primeiras 25 linhas e incluir um campo de nome e pelo menos um campo entre **Efeito**, **Bairro** ou **NIS**, com registos abaixo. O mês é lido da coluna **Mês da Repercussão**, se existir, ou da linha de título **Período da Repercussão**.
3. Confirme o nome do ficheiro, o mês e as quantidades e escolha **Dividir e gerar Excel**. As famílias são ordenadas alfabeticamente pelo nome do responsável e repartidas em três blocos tão iguais quanto possível, com as sobras atribuídas aos primeiros técnicos. A divisão é por família, não por linha: os integrantes permanecem juntos; quando necessário, os campos da família são herdados da linha imediatamente anterior.
4. O Excel inclui o resumo com o número de famílias, a faixa alfabética e o mês, seguido pelas três abas com os registos de cada técnico. O ficheiro original não é alterado.

## Privacidade e limites

A leitura, comparação e criação do Excel acontecem no navegador. Os ficheiros desta ferramenta não são anexados à conversa, não são gravados em `localStorage`, não são enviados à rede nem à IA e são descartados da memória de trabalho ao fechar a janela. O Paulus mantém a sua ligação normal à IA para conversas, mas este botão não faz qualquer pedido de IA e não consome essa cota.

As etapas 1 e 2 estão implementadas. A divisão é fixa para os três técnicos do Território Volante e escolhe apenas uma aba da planilha de entrada; não combina abas de dados diferentes. Linhas não vazias abaixo do cabeçalho são mantidas. Os PDFs de Relatório Individual e a união de PDFs ficam para etapas futuras. Nenhum dos dois fluxos implementados altera os ficheiros originais.
