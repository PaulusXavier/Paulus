---
doc: excel-guia-apoio
titulo: Excel no trabalho do serviço: guia de apoio (não é norma)
norma: Síntese própria de apoio ao uso do Excel no CRAS e na rede do SUAS: da base bem desenhada à tabela dinâmica, Power Query e macros, com cuidados de LGPD. Não reproduz nenhum texto. Nomes de funções em português podem variar entre versões e idiomas do Office; conferir na versão da pessoa. Regras, valores e prazos de programas vêm das normas, não da planilha.
ano: 2026
tipo: apoio
revisao: pendente
---

<!--
Material de estudo, não norma. Serve para o Paulus explicar o caminho com as próprias palavras e indicar o roteiro certo. Os roteiros práticos estão em habilidades/excel-*.md (33). Ele ensina e escreve fórmulas com dado fictício; não vê nem abre a planilha da pessoa.
-->

## O que o Paulus faz e não faz com Excel

Explica funções, escreve fórmulas e passos de tabela dinâmica, gráficos, Power Query e macros, ajuda a desenhar planilhas de controle e a achar a causa de um erro. Não abre o arquivo, não roda a fórmula, não vê dado real e não recebe planilha com dado de família. A pessoa descreve as colunas, usa exemplos fictícios, cola a fórmula e confere o resultado.

## Trilha de estudo

Cinco degraus: base (células, referências, SOMA, filtro); condicionais (SE, CONT.SES, SOMASES); procura, texto e data (PROCV, PROCX, ÍNDICE+CORRESP, DATADIF); resumo e visual (tabela dinâmica, gráficos, validação, formatação condicional); escala (Power Query, modelo de dados, matrizes dinâmicas, macros e a passagem para R, Python ou SQL). Vinte a trinta minutos por dia, de seis a oito semanas, levam do básico ao terceiro degrau.

## Base bem desenhada

Uma linha por registro, uma coluna por informação, cabeçalho na primeira linha, sem célula mesclada, sem total ou subtítulo no meio, sem coluna em branco. ID único por registro. Transformar a base em Tabela (Ctrl+T) faz fórmulas, validação, gráficos e tabelas dinâmicas crescerem junto. Metade dos erros de fórmula vem de base mal desenhada.

## Referências e fórmulas básicas

Referência relativa (B2), absoluta ($B$2) e mista (B$2); F4 alterna. Toda fórmula começa com `=`. Em português os argumentos se separam por `;`. SOMA, MÉDIA, MED, MÍNIMO, MÁXIMO, CONT.NÚM, CONT.VALORES e CONTAR.VAZIO cobrem a base. Percentual sempre com denominador dito. Número guardado como texto é a causa nº 1 de conta que não bate.

## Condicionais e procura

SE, E, OU, SES e SEERRO decidem; CONT.SE(S), SOMASE(S) e MÉDIASE(S) contam, somam e tiram média com condição (a soma é o último argumento no SOMASE e o primeiro no SOMASES). PROCV exige a chave na primeira coluna e FALSO no fim para ser exato; PROCX (365 e 2021) é mais seguro; ÍNDICE+CORRESP funciona em qualquer versão. #N/D quase sempre é espaço sobrando, número contra texto ou grafia diferente.

## Texto e datas

ESQUERDA, DIREITA, EXT.TEXTO, NÚM.CARACT, LOCALIZAR (não diferencia maiúscula) e PROCURAR (diferencia), ARRUMAR, SUBSTITUIR, TEXTO, VALOR, CONCAT e UNIRTEXTO. Identificadores como NIS, CPF e CEP são texto, para não perder zero à esquerda. Data é número de série: HOJE, DATA, DATADIF (idade), DIATRABALHOTOTAL e DIATRABALHO (dias úteis, com lista de feriados), FIMMÊS e TEXTO(...;"mm/aaaa"). A contagem de prazos vem da norma.

## Limpeza

Trabalhar em cópia. Olhar cada coluna com filtro, tirar espaços, padronizar categorias, converter número e data, tratar duplicados com cuidado (repetido pode ser atendimento legítimo), marcar valores impossíveis, anotar o que mudou e manter dicionário de dados. Rotina que se repete passa para o Power Query.

## Tabela dinâmica

Resume sem fórmula: Linhas, Colunas, Valores e Filtros. Contagem ou soma, percentual do total, datas agrupadas por mês e ano, faixas, segmentação de dados. Não atualiza sozinha (Atualizar Tudo). Guarda cópia dos dados: para compartilhar só o resumo, colar como valores em arquivo novo.

## Gráficos e aparência

Barras para comparar, linha para o tempo, dispersão para relação, histograma para distribuição. Eixo de barras em zero, título que diz a conclusão, poucas cores com sentido, cor nunca como única informação. Base de trabalho simples, aba de apresentação cuidada. Não mesclar células na base.

## Validação e formatação condicional

Lista suspensa, número, data e comprimento de texto previnem erro na digitação. Formatação condicional destaca vencidos, duplicados e metas, inclusive com fórmula. Proteger planilha evita erro acidental e não é segurança.

## Power Query e modelo de dados

Power Query (Obter Dados, Excel 2016 ou mais novo) importa, limpa e junta, guarda as etapas e atualiza com um clique; combina pastas de arquivos iguais; mescla por chave; anula dinamização. O Modelo de Dados e o Power Pivot relacionam tabelas e criam medidas em DAX; dependem da edição do Excel.

## Excel 365, 2021 e compatibilidade

FILTRO, ÚNICO, CLASSIFICAR, SEQUÊNCIA, PROCX e LET "derramam" resultados em várias células. Em versões antigas aparecem como #NOME?. Perguntar a versão de quem vai abrir o arquivo antes de sugerir.

## Erros e depuração

#DIV/0!, #N/D, #NOME?, #VALOR!, #REF!, #NÚM!, #NULO!, #DERRAM! e #### têm causas típicas. Avaliar Fórmula, Rastrear Precedentes e F9 ajudam. O erro mais perigoso é o que não avisa: filtro escondendo linha na soma, FALSO esquecido, intervalo que não pega linhas novas. Conferir com conta à mão e total contra soma das partes.

## Macros e automação

Macros gravadas e VBA (arquivo .xlsm) repetem sequências; Office Scripts e Power Automate no Excel para web. Antes de macro, tentar fórmula, dinâmica ou Power Query. Macro não tem desfazer, então testar em cópia. Nunca habilitar macro de origem desconhecida. Rotina mensal longa dura mais em Python ou R.

## Dados pessoais e LGPD

Dado de família só em local e ferramenta autorizados pelo serviço, no mínimo necessário, com código no lugar do NIS quando o nome não for preciso. Senha para abrir cifra o arquivo; proteger planilha e ocultar coluna não escondem nada. Inspecionar o documento antes de enviar. Célula pequena pode identificar alguém. Nunca colar planilha de família em chat de IA.

## CSV e sistemas públicos

Não abrir CSV por duplo clique: usar Dados > Obter Dados > De Texto/CSV, escolher UTF-8 e o separador, e importar NIS, CPF, CEP e códigos como Texto. Cuidado com datas dia/mês trocadas e número grande em notação científica. O Excel corta a 1.048.576 linhas em silêncio.

## Google Planilhas e LibreOffice

Mesmas ideias, nomes de função e recursos que variam (ARRAYFORMULA, QUERY, IMPORTRANGE no Google). Macros VBA não migram. Compartilhar por link não é sigilo. Conferir totais depois de converter.

## Quando passar para R, Python ou SQL

Limpeza repetida todo mês, muitas planilhas, centenas de milhares de linhas, necessidade de reprodução e estatística de verdade. Excel para digitar, resumir e conferir; script para repetir e documentar.

## Funções em português e inglês: soma, contagem e lógica

SUM = SOMA; AVERAGE = MÉDIA; MEDIAN = MED; MIN = MÍNIMO; MAX = MÁXIMO; COUNT = CONT.NÚM; COUNTA = CONT.VALORES; COUNTBLANK = CONTAR.VAZIO; COUNTIF(S) = CONT.SE(S); SUMIF(S) = SOMASE(S); AVERAGEIF(S) = MÉDIASE(S); MAXIFS = MÁXIMOSES; MINIFS = MÍNIMOSES; IF = SE; IFS = SES; AND = E; OR = OU; NOT = NÃO; IFERROR = SEERRO; IFNA = SEND; CHOOSE = ESCOLHER; ISNUMBER = ÉNÚM; SUMPRODUCT = SOMARPRODUTO; ROUND = ARRED; ROUNDUP = ARREDONDAR.PARA.CIMA; ROUNDDOWN = ARREDONDAR.PARA.BAIXO.

## Funções em português e inglês: procura, texto e data

VLOOKUP = PROCV; HLOOKUP = PROCH; XLOOKUP = PROCX; INDEX = ÍNDICE; MATCH = CORRESP; LEFT = ESQUERDA; RIGHT = DIREITA; MID = EXT.TEXTO; LEN = NÚM.CARACT; FIND = PROCURAR; SEARCH = LOCALIZAR; SUBSTITUTE = SUBSTITUIR; TRIM = ARRUMAR; CLEAN = LIMPAR; UPPER = MAIÚSCULA; LOWER = MINÚSCULA; PROPER = PRI.MAIÚSCULA; TEXTJOIN = UNIRTEXTO; TEXT = TEXTO; VALUE = VALOR; TODAY = HOJE; NOW = AGORA; DATE = DATA; DAY = DIA; MONTH = MÊS; YEAR = ANO; DATEDIF = DATADIF; NETWORKDAYS = DIATRABALHOTOTAL; WORKDAY = DIATRABALHO; EOMONTH = FIMMÊS; EDATE = DATAM; WEEKDAY = DIA.DA.SEMANA; DATEVALUE = DATA.VALOR.

## Funções em português e inglês: matrizes, estatística e outras

FILTER = FILTRO; SORT = CLASSIFICAR; SORTBY = CLASSIFICARPOR; UNIQUE = ÚNICO; SEQUENCE = SEQUÊNCIA; RANDBETWEEN = ALEATÓRIOENTRE; INDIRECT = INDIRETO; OFFSET = DESLOC; AGGREGATE = AGREGAR; STDEV.S = DESVPAD.A; STDEV.P = DESVPAD.P; VAR.S = VAR.A; MODE.SNGL = MODO.ÚNICO; QUARTILE.INC = QUARTIL.INC; PERCENTILE.INC = PERCENTIL.INC; SLOPE = INCLINAÇÃO; INTERCEPT = INTERCEPÇÃO; RANK.EQ = ORDEM.EQ; LARGE = MAIOR; SMALL = MENOR; ROW = LIN; COLUMN = COL; CHAR = CARACT. CORREL, SUBTOTAL, INT e LET mantêm o nome. Na dúvida, digitar `=` e as primeiras letras: a lista do Excel mostra o nome certo na versão da pessoa.
