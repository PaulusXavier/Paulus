# Relatórios locais no Paulus — etapa 1

Esta primeira etapa acrescenta ao console o relatório **Famílias Recorrentes**, inspirado no fluxo correspondente do Anona. O relatório cruza duas planilhas de condicionalidades (mês anterior e mês atual), identifica famílias pelo NIS do responsável ou, quando necessário, pelo CPF e cria um ficheiro Excel com resumo, lista consolidada e separadores por técnico. Famílias que mudaram de técnico ficam numa aba própria.

## Como usar

1. Abra o console Paulus e escolha **Relatórios locais** no cabeçalho (ou em **Mais opções**, no telemóvel).
2. Selecione primeiro a planilha do mês anterior e depois a do mês atual. São aceites `.xlsx`, `.xls` e `.csv`, até 5 MB por ficheiro. A tabela tem de conter a coluna **Efeito** e um identificador do responsável (NIS ou CPF).
3. Confirme os meses e as quantidades indicadas e escolha **Gerar Excel**. O resultado é descarregado como `Famílias Recorrentes - [mês anterior] e [mês atual].xlsx`.

## Privacidade e limites desta etapa

A leitura, comparação e criação do Excel acontecem no navegador. Os ficheiros desta ferramenta não são anexados à conversa, não são gravados em `localStorage`, não são enviados à rede nem à IA e são descartados da memória de trabalho ao fechar a janela. O Paulus mantém a sua ligação normal à IA para conversas, mas este botão não faz qualquer pedido de IA e não consome essa cota.

Esta etapa cobre apenas **Famílias Recorrentes**. A divisão de planilhas por técnico, os PDFs de Relatório Individual e a união de PDFs ainda ficam para etapas posteriores. O fluxo exige os dois meses em formato de tabela de condicionalidades; não modifica os originais.
