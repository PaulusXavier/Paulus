---
id: excel-procv-procx-indice
nome: Excel: PROCV, PROCX e ÍNDICE+CORRESP (procurar e cruzar)
quando: procv; procx; procv excel; procx excel; índice e corresp; vlookup; xlookup; buscar dados em outra aba excel; erro #n/d excel; procv não funciona; cruzar duas listas excel; procurar valor em outra planilha
texto: sim
---
- PROCV: `=PROCV(chave; tabela; nº_coluna; FALSO)`. O FALSO (ou 0) final é correspondência exata; esquecê-lo dá resultado errado sem aviso. A chave tem de estar na primeira coluna da tabela. Trave a tabela: `$A$2:$D$500`.
- PROCX (365 e 2021): `=PROCX(chave; col_chave; col_resultado; "não achei")`. Procura para qualquer lado, é exato por padrão e aceita texto para "não achou". Use só se todo mundo da equipe tem essa versão.
- ÍNDICE+CORRESP funciona em qualquer versão e procura para a esquerda: `=ÍNDICE($C$2:$C$500;CORRESP(F2;$A$2:$A$500;0))`. O 0 é exato.
- #N/D significa "não achei". Causas por ordem de frequência: espaço sobrando (ARRUMAR); número de um lado e texto do outro (NIS "123" é diferente de 123); grafia diferente; intervalo sem travar. Teste: `=A2=F2` e `=NÚM.CARACT(A2)`.
- Resposta controlada: `=SEND(PROCV(...);"Sem cadastro")`.
- PROCV devolve só a primeira ocorrência. Se a chave se repete, use tabela dinâmica ou SOMASES.
- Aproximado (VERDADEIRO) só para faixas ordenadas do menor ao maior, como idade ou renda → classe: `=PROCV(D2;$G$2:$H$6;2;VERDADEIRO)`.
- Quem está numa lista e não na outra: `=SE(ÉNÚM(CORRESP(A2;Lista2!A:A;0));"Está";"Não está")`. A lista dos que faltam serve para acompanhar e acolher, não para cobrar nem punir.
- Fórmula que aponta para outro arquivo guarda o caminho e quebra se o arquivo mudar de lugar: junte as abas no mesmo arquivo ou use Power Query.
- Chave boa é código (ID, NIS tratado como texto), nunca nome.
- Dado real de família não vai ao chat: descreva as colunas.
