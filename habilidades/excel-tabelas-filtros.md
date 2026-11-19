---
id: excel-tabelas-filtros
nome: Excel: Tabela (Ctrl+T), filtros e classificação
quando: ctrl+t excel; tabela do excel; formatar como tabela; referências estruturadas; filtro no excel; filtrar dados excel; classificar dados excel; ordenar no excel; congelar painéis; filtro avançado; subtotal excel
texto: sim
---
- Formatar como Tabela (Ctrl+T, com cabeçalhos) estende fórmulas, formatação e validação para as linhas novas, filtra, dá nome (aba Design, campo do nome, como tbAtend) e alimenta tabela dinâmica e gráfico sem ajustar intervalo.
- Referências estruturadas: `=SOMA(tbAtend[Valor])`, `=[@Valor]*2` (linha atual), `=CONT.SES(tbAtend[Bairro];"Bairro A")`. Legíveis e não quebram quando a lista cresce.
- Filtro (Ctrl+Shift+L): por valor, texto (contém, começa com), número (maior que, 10 primeiros) e data (este mês). Vários filtros se somam. Limpe os filtros antes de copiar totais.
- Atenção: SOMA conta também as linhas que o filtro escondeu. `=SUBTOTAL(103;B2:B500)` conta só as visíveis e `=SUBTOTAL(109;B2:B500)` soma só as visíveis. A barra de status mostra a contagem do que está filtrado.
- Classificar (Dados > Classificar) aceita vários níveis. Clique numa célula da tabela ou selecione tudo, nunca só uma coluna: classificar uma coluna isolada descola os dados das outras linhas, erro grave e quase invisível. Mantenha uma coluna de ID ou de ordem de entrada para poder restaurar.
- Filtro avançado (Dados > Avançado): critérios numa área própria, copia o resultado para outro lugar e extrai únicos.
- Congelar painéis (Exibir) mantém cabeçalho e primeira coluna à vista. Para copiar só as linhas filtradas, Alt+; seleciona as células visíveis.
- No 365, FILTRO, CLASSIFICAR e ÚNICO fazem o mesmo por fórmula, e a tabela aceita.
- Subtotais por grupo (Dados > Subtotal) exigem ordenar antes e põem totais no meio da base. Para análise, prefira a tabela dinâmica.
- Linha oculta continua entrando em fórmulas, cópia e envio: ocultar não protege dado.
