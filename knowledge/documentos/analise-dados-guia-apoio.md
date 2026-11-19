---
doc: analise-dados-guia-apoio
titulo: Análise de dados no serviço: guia de apoio (não é norma)
norma: Síntese própria de apoio ao trabalho com dados no CRAS e na rede do SUAS: da pergunta ao relatório, com planilha, SQL, R e Python. Não reproduz nenhum texto. Definições oficiais de indicadores, sistemas e prazos vêm das fontes. Prática sugerida não é norma.
ano: 2026
tipo: apoio
revisao: pendente
---

<!--
Material de estudo, não norma. Serve para o Paulus explicar o caminho com as próprias palavras e indicar o roteiro certo. Os roteiros práticos estão em habilidades/analise-dados-*.md, habilidades/estatistica-*.md, habilidades/dados-r-*.md e habilidades/dados-python-*.md.
-->

## Ciclo de trabalho com dados

Pergunta e decisão; obter os dados; conferir e limpar; explorar e resumir; analisar; comunicar e agir; guardar para repetir. Pular a pergunta gera gráfico bonito que ninguém usa.

## Começar pela pergunta

O que a equipe quer decidir? Que dado existe? Que comparação responderia? Uma pergunta bem feita costuma pedir uma contagem bem feita, com denominador e período, antes de qualquer modelo.

## Qualidade e limpeza

Completude, validade, consistência, unicidade e atualidade. Conferir tipos, vazios, duplicados, categorias escritas de formas diferentes e valores impossíveis. Nunca editar o arquivo original; registrar cada decisão; manter um dicionário de dados.

## Planilha

Cabeçalho único, uma linha por registro, sem células mescladas. Fórmulas de contar, somar, buscar e datas; tabela dinâmica para resumir; validação de dados para prevenir erro. Limites: volume, fórmulas escondidas e controle de versão.

## SQL

Consulta que descreve o que se quer: selecionar, filtrar, agrupar e juntar tabelas. DuckDB e SQLite abrem arquivos locais. Conferir o número de linhas antes e depois de cada junção. Só consultar; alterar dados apenas em cópia.

## R e Python

R (tidyverse) e Python (pandas) importam, limpam, juntam, resumem, desenham e geram relatório. Script guarda o que foi feito e se repete no mês seguinte. A melhor linguagem é a que a equipe mantém.

## Medidas e indicadores

Contagem, proporção com denominador, taxa por mil, variação absoluta e percentual, média e mediana. Ficha de indicador: pergunta, fórmula, período, fonte, responsável, meta e limites. Contar atendimento não mede qualidade.

## Gráficos

Escolher pela pergunta: barras para comparar, linhas para o tempo, dispersão para relação, histograma para distribuição. Barras começam em zero; título que diz o achado; cor com propósito; mostrar o n. Poucos dados pedem tabela.

## Painéis

Poucos indicadores por tela, definidos, com data de atualização e fonte única alimentada por rotina. Dado agregado, sem lista de pessoas. Uso para entender e planejar, não para ranquear nem punir.

## Dados do SUAS e fontes públicas

RMA, Censo SUAS, CadÚnico, Vigilância Socioassistencial; IBGE, DATASUS, INEP e transparência. Atenção à data, ao nível territorial e ao conceito. Cruzar por código, não por nome. Conferir endereços e versões atuais.

## Pesquisa com questionário

Objetivo ligado a decisão, perguntas simples e neutras, pré-teste, consentimento, anonimato quando possível, taxa de resposta e distribuição de respostas. Cuidado com desejabilidade social quando o profissional aplica.

## Análise qualitativa

Análise de conteúdo ou temática: transcrever e anonimizar, codificar, agrupar em temas, conferir com outra pessoa, procurar casos que contrariem, triangular. Contar códigos mostra frequência, não importância.

## Ética, LGPD e anonimização

Finalidade, necessidade, segurança e transparência. Tirar o nome não anonimiza; combinações identificam. Usar código no lugar de NIS e CPF, agregar, suprimir célula pequena e guardar em local protegido. Dado de pessoa não vai para chat de IA.

## Comunicar resultados

Conclusão no começo, achados com um gráfico cada, limites e próximos passos. Frase de achado com número, comparação, denominador e período. Linguagem simples para equipe, gestão e famílias.

## Reprodutibilidade

Dados brutos intocados, scripts numerados, README, dicionário, ambiente registrado, semente fixa e backup. Código no GitHub sem dado de pessoa.

## Mapas

Coroplético com taxa, não contagem; junção por código da área; cuidado com áreas pequenas. Nunca mapear residência de família. Ferramentas: QGIS, sf e geopandas.

## Aprendizado de máquina e IA

Separar treino e teste, cuidado com vazamento e classes desbalanceadas, preferir modelos explicáveis. Não decidir caso individual nem excluir pessoas de benefício ou serviço por pontuação. IA generativa ajuda a escrever código, mas erra: conferir rodando.

## Mapa dos roteiros do Paulus

Visão geral e trilha; qualidade e limpeza; planilha e tabela dinâmica; SQL; gráficos; painéis; indicadores e fontes do SUAS; pesquisa; análise qualitativa; ética e LGPD; comunicar; reprodutibilidade; mapas; avaliação de serviço; aprendizado de máquina; índices compostos; leitura de resultados; glossário; estatística em 22 roteiros; R e Python.
