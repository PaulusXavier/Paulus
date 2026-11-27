# Relatórios locais no Paulus — etapas 1 a 6

As tabelas e os relatórios são preparados no navegador. Os ficheiros não são anexados à conversa, enviados à IA nem gravados pelo fluxo. A etapa 1 cria o Excel **Famílias Recorrentes**; a etapa 2 divide a planilha do Território Volante por técnico; a etapa 3 cria PDFs individuais a partir dessa divisão; a etapa 4 organiza o detalhamento desses PDFs por blocos de visita.

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
2. A opção **Visita** inclui uma caixa por família no detalhamento, destinada a ser assinalada à mão. Esta opção é independente da ordenação territorial.
3. Escolha **Gerar PDF(s) individual(is)**. Cada técnico com registos recebe um PDF A3 horizontal com capa-resumo (total de famílias, registos e contagem de famílias por efeito) e uma tabela detalhada. Quando houver mais de um técnico com dados, os PDFs são descarregados juntos num único ZIP; se só houver um relatório, descarrega-se apenas o PDF.
4. Os ficheiros usam o nome `Relatorio de Repercussao Individual - [técnico] - [mês].pdf`; o ZIP inclui a data de geração. A opção de PDF só está disponível enquanto a divisão atual permanecer na janela. Ao fechar a janela ou escolher **Limpar ficheiros**, os dados temporários são descartados.

## Etapa 4 — Blocos de visita e ordem local

A opção **Ordenar por blocos de visita e sugerir sequência local** vem marcada por omissão. O relatório agrupa os registos nesta ordem: **Bloco 1** — 13 de Setembro e Marechal Rondon; **Bloco 2** — Araceli e Nova Vida; **Outros bairros**. A classificação usa primeiro o campo **Bairro**; se estiver vazio, usa o texto de **Endereço** e **Referência do endereço**.

Dentro de cada bloco, os endereços são ordenados no aparelho pelo algoritmo existente `shared/visitas.mjs`, com o ponto textual de partida `Rua Santo Agostinho, 193 — Centenário`. A ordem segue bairro/rua/número, com serpentina de números ímpares e pares; endereços sem leitura suficiente ficam no fim e a capa mostra quantos não puderam ser ordenados. Cada bloco começa numa página própria, com uma faixa e as suas contagens; o cabeçalho da tabela repete-se quando o mesmo bloco continua noutra página. As linhas de uma família permanecem juntas.

Esta é uma **sugestão local baseada no texto**, não um serviço de roteamento: não consulta mapa, coordenadas, trânsito, distância nem tempo de viagem e não conhece condições reais da via. Confirme os endereços e ajuste a sequência conforme o conhecimento do território. Se desmarcar a opção, o PDF mantém a ordem original da planilha e não divide o detalhamento em blocos.

O relatório inclui, quando presentes, NIS/CPF e nome do responsável, endereço, bairro, referência, NIS/nome do integrante, Motivo 1, Motivo 2 e Efeito. Identificadores numéricos têm os zeros à esquerda restaurados; campos familiares em branco nas linhas dos integrantes são herdados da família; integrantes duplicados são eliminados para a contagem.

## Etapa 5 — Relatórios dos Abrigos (Operação Acolhida)

Junta as folhas resumo (PDF, uma por família) enviadas a cada abrigo — **Rondon 1, Rondon 5, PRA e Tuaronoko** — num único PDF por abrigo.

1. Na janela **Relatórios locais**, escolha o **mês de repercussão** (cronograma do ano mais recente cadastrado em `shared/relatorios-abrigos.mjs`).
2. Em cada abrigo, adicione os PDFs nos três grupos: **Famílias em Alerta**, **Famílias em Bloqueio** e **Famílias Suspensas**. Use ↑ e ↓ para ajustar a ordem e × para remover. Limite: 60 PDFs e 80 MB no total, somando todos os abrigos.
3. Escolha **Gerar PDF — [abrigo]**. O PDF tem A4 paisagem, com capa (mês de repercussão, referência de frequência de Educação e Saúde, **data limite de recurso**, quantidade por efeito e condicionalidades do Programa), uma divisória por efeito (grupos vazios são pulados) e as folhas na ordem escolhida.
4. O arquivo é `Abrigo [abrigo] - Repercussao [mês] - [data].pdf`. Depois de gerar, as folhas daquele abrigo são limpas, a menos que a opção **Manter as folhas** esteja marcada; os outros abrigos não são afetados.

**Todo início de ano:** adicione (sem apagar o ano anterior) a chave do ano novo em `CRONOGRAMAS_REPERCUSSAO_POR_ANO`, no formato de 2026, com os dados do comunicado de Condicionalidades. O ano mais recente passa a valer sozinho no menu, na tabela e nas capas.

PDFs criptografados ou inválidos são recusados com o nome do arquivo e o grupo. Esta etapa não lê endereço nem organiza por rota: isso é a Etapa 6.

## Etapa 6 — Rota de Visita: unificar folhas de família

Junta as folhas resumo (PDF, uma por família) das visitas do dia num único PDF, na ordem de visita: **Bloco 1 · Bairro Professora Araceli Souto Maior** e depois **Bloco 2 · Bairro 13 de Setembro**.

1. Adicione os PDFs em cada bloco (até 30 arquivos e 50 MB no total; PDF repetido, com o mesmo nome e tamanho, é recusado).
2. O Paulus lê o endereço de cada folha, um arquivo de cada vez. Lê **só o quadro "II - Endereço da família"** (rua, número e bairro): componentes, nomes e CPF não entram na leitura. Se a folha for escaneada (sem texto), o endereço é lido por OCR no aparelho e a linha avisa "confira com atenção". Se não achar, digite rua e número no campo da folha ou use **Tentar de novo**.
3. Quando termina de ler um bloco com pelo menos dois endereços, o Paulus organiza a rota sozinho (partida: Rua Santo Agostinho, nº 193 — Centenário). Dá para usar **Sugerir ordem de visita deste bloco** ou **Organizar rota** (os dois blocos). Folhas sem endereço ficam no fim do bloco.
4. Ajuste a ordem com ↑ e ↓. Ao gerar o PDF, o que você ajustou à mão vira aprendizado: as ruas que você pôs em sequência passam a contar como vizinhas na próxima ordem. **Só nomes de rua e bairro** são guardados (nunca número, nome ou arquivo), no `localStorage` deste aparelho; o botão **Apagar o que aprendi das ruas** remove tudo.
5. **Gerar PDF unificado da rota** cria: capa (partida e quantidade por bloco), página(s) de **roteiro** (a ordem com o endereço lido de cada folha, 19 por página), uma divisória por bloco e as folhas na ordem. O arquivo é `Visitas - Folhas de Familia Unificadas - [data].pdf`. Depois de gerar, as folhas são limpas, a menos que **Manter as folhas** esteja marcado.

**OCR (opcional):** a leitura de folhas escaneadas usa o tesseract.js e o idioma português, que ficam na pasta `vendor/tesseract` (cerca de 15 MB). Copie a pasta `vendor/tesseract` do Anona para `vendor/tesseract` do Paulus; o `npm run build` a copia para `dist/tesseract`. Sem essa pasta, o build avisa e as folhas escaneadas caem em "digite o endereço"; folhas com texto continuam funcionando.

A ordem é uma sugestão local baseada no texto, sem mapa, trânsito ou distância; confira os endereços antes de sair.

## Etapa 7 — Planilhas do MDS guardadas neste aparelho

1. Na janela **Relatórios locais**, envie a planilha bruta de Repercussão (.xlsx, .xls ou .csv, até 5 MB). O Paulus organiza por técnico do CRAS (aba **Resumo do território** com fórmulas + uma aba por técnico), baixa `Repercussão [Mês] de [Ano] (CRAS Cristiana).xlsx` e guarda uma cópia **só neste navegador** (IndexedDB). Nada vai à nuvem nem à IA. Bairros não reconhecidos são listados no aviso.
2. **Planilha guardada**: escolha uma da lista para baixar de novo, apagar ou usar nos itens abaixo.
3. **Filtrar por bairro**: escolha bairros (Ctrl/Command para vários) e baixe a planilha `_filtrada`; sem escolha, `_completa`.
4. **Relatórios individuais — técnicos gerais**: um PDF por aba de técnico (num ZIP), no mesmo formato do PDF da etapa 3. O Território Volante fica de fora (etapas 2 e 3). O mês vem do registro guardado.
5. **Backup**: baixa/restaura `.json` no mesmo formato do Anona (os dois apps leem o arquivo um do outro). Restaurar só acrescenta o que falta e valida cada campo.

A cópia guardada contém NIS, CPF e nomes. Fechar a janela não a apaga; use **Apagar esta** ou **Apagar todas**. Código: `shared/planilhas-mds.mjs` (testes em `tests/planilhas-mds.test.mjs`) e `console/planilhas-mds-ui.mjs`.

## Agenda — PDF das anotações

Na agenda, **PDF do mês** e **PDF de tudo** geram, no aparelho, um PDF com cabeçalho, anotações por dia (hora, tipo, caixa de conclusão), "Página X de Y" e aviso de LGPD no rodapé. Exige a agenda destrancada. Código: `console/agenda-pdf.mjs` (testes em `tests/agenda-pdf.test.mjs`).

## Privacidade, dependências e limites

A leitura das planilhas, comparação, divisão, ordenação e geração de PDF/ZIP acontecem no navegador. As bibliotecas XLSX, jsPDF e JSZip, bem como o módulo local de ordenação, são servidos pelo Paulus e podem ser colocados na cache offline do navegador. Os ficheiros dos utilizadores não são enviados para a rede nem para a IA, não são guardados em `localStorage` e são descartados da memória de trabalho ao fechar a janela. O Paulus mantém a sua ligação normal à IA para conversas, mas estes botões não fazem pedidos de IA e não consomem essa cota.

A divisão é fixa para os três técnicos do Território Volante e escolhe apenas uma aba da planilha de entrada; não combina abas de dados diferentes. O PDF é preparado a partir da divisão atual da etapa 2, usa apenas as colunas listadas acima e não altera os ficheiros originais. PDFs de Relatório Individual de planilhas organizadas fora desse fluxo ficam para etapas futuras.
