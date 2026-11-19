---
id: excel-calculos-do-servico
nome: Excel: cálculos do serviço (renda per capita, faixas, taxas, prazos)
quando: renda per capita excel; calcular renda per capita; linha de corte excel; faixa etária excel; taxa por mil excel; variação percentual excel; calcular percentual excel; cálculo no excel do cras; composição familiar excel; idade por data de nascimento excel
texto: sim
---
- Renda per capita: soma das rendas ÷ número de pessoas. Com uma linha por pessoa: `=SOMASES(tbPessoa[Renda];tbPessoa[IDFamília];A2)/CONT.SE(tbPessoa[IDFamília];A2)`; com uma linha por família: `=B2/C2`. O que entra como renda e o valor da linha de corte vêm da norma vigente, que muda.
- Parâmetros em aba própria: linha de corte em `$H$1`, com data de vigência e fonte ao lado, nunca escrita dentro da fórmula. Você não chuta valor: confira na norma ou na ficha do programa. Situação frente à linha: `=SE(D2<=$H$1;"Dentro";"Acima")`; veja na norma se é "até" ou "menos que".
- Idade: `=DATADIF(nascimento;referência;"Y")`, com a data de referência numa célula (31 de dezembro, ou a data do atendimento). Faixas com SES ou PROCV aproximado.
- Percentual e variação: `=B2/total` e `=(C2-B2)/B2`. Com base pequena o percentual engana (de 2 para 4 é +100%): mostre o valor absoluto junto.
- Taxa por mil: `=casos/população*1000`, com a população de fonte oficial (IBGE ou vigilância socioassistencial) e o ano dela.
- Renda: mostre média e mediana (`=MED()`), porque valores extremos puxam a média.
- Condicionalidades: % de cumprimento é cumpriram ÷ acompanhados; diga o denominador e o período. Veja os roteiros do Anona e do Sicon.
- Prazos: DIATRABALHO (úteis, com lista de feriados) ou soma de dias corridos, conforme a norma.
- Dinheiro: formato Moeda ou Contábil; ARRED só onde a regra pede. Para benefício, o sistema oficial é a referência e a planilha é conferência.
- Auditoria: refaça três casos à mão, compare e guarde a conferência na aba Leia-me.
- Valores e regras de benefício vêm das normas e fichas consultadas, não do que você lembra.
