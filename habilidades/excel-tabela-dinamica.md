---
id: excel-tabela-dinamica
nome: Excel: tabela dinâmica (resumir sem fórmula)
quando: tabela dinâmica; tabela dinâmica excel; criar tabela dinâmica; tabela dinâmica não atualiza; segmentação de dados; gráfico dinâmico; agrupar por mês tabela dinâmica; campos da tabela dinâmica; pivot table excel; resumir dados excel
texto: sim
---
- É o jeito mais rápido de contar e somar por grupo. Prepare a base: cabeçalho em todas as colunas, sem mescladas nem linhas vazias, e transforme em Tabela (Ctrl+T) para a dinâmica crescer junto.
- Criar: clique na base > Inserir > Tabela Dinâmica. Arraste campos: Linhas (categoria, como bairro), Colunas (segunda divisão, como mês), Valores (o que contar ou somar), Filtros (recortes).
- Contagem ou soma: campo de texto em Valores vira Contagem, de número vira Soma. Para trocar, clique no campo > Configurações do Campo de Valor (contagem, soma, média, máximo, mínimo). Para contar registros, use um campo sempre preenchido, como o ID.
- Percentuais: Valores > Mostrar Valores Como > % do Total Geral, da Coluna ou da Linha. Ao reportar, diga qual é o denominador.
- Datas: botão direito numa data > Agrupar > Meses e Anos. Se não agrupa, há texto ou vazio na coluna. Faixas (0 a 17, 18 a 59, 60 ou mais): Agrupar com início, fim e intervalo.
- Segmentação de Dados (botões de filtro) e Linha do Tempo ficam em Análise da Tabela Dinâmica > Inserir. O Gráfico Dinâmico acompanha a tabela.
- Não atualiza sozinha: Alt+F5 ou Dados > Atualizar Tudo depois de mudar a base. Linhas novas que não entram indicam intervalo fixo: use Tabela ou Alterar Fonte de Dados.
- Problemas comuns: "(vazio)" por células sem dado; categoria com grafia diferente aparecendo duas vezes; número contado em vez de somado porque há texto na coluna.
- Contagem de pessoas distintas: marque "Adicionar estes dados ao Modelo de Dados" e use Contagem Distinta.
- Privacidade: a dinâmica guarda uma cópia dos dados de origem. Para compartilhar só o resumo, copie e cole como Valores num arquivo novo. Resumo com poucos casos (1 a 4 pessoas) pode identificar alguém.
