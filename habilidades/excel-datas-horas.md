---
id: excel-datas-horas
nome: Excel: datas e horas (idade, prazos, dias úteis)
quando: datas no excel; data excel; idade no excel; datadif; calcular idade excel; diferença entre datas excel; dias úteis excel; diatrabalhototal; data como texto excel; data errada excel; fimmês; prazo em dias excel; mês e ano excel
texto: sim
---
- Data é número de série (dias desde 01/01/1900) e hora é fração do dia. Por isso `=B2-A2` dá a diferença em dias (formate o resultado como Geral ou Número).
- Funções: `=HOJE()` (muda todo dia; para gravar a data fixa, Ctrl+;), `=AGORA()`, `=DATA(2026;11;19)`, `=DIA()`, `=MÊS()`, `=ANO()`, `=FIMMÊS(A2;0)` (último dia do mês), `=DATAM(A2;3)` (soma 3 meses), `=DIA.DA.SEMANA(A2;2)` (segunda = 1).
- Idade: `=DATADIF(A2;HOJE();"Y")` em anos completos; "M" meses; "YM" meses que sobram. A função existe mas não aparece na lista. Início maior que o fim dá #NÚM!. Para idade em uma data de referência, ponha a data numa célula no lugar de HOJE().
- Dias úteis: `=DIATRABALHOTOTAL(A2;B2;Feriados)` (conta as duas pontas) e `=DIATRABALHO(A2;10;Feriados)` para prazo em 10 dias úteis. Mantenha uma lista de feriados, inclusive municipais. Se o prazo é corrido ou útil, e de quando conta, vem da norma ou do ofício, não se adivinha.
- Mês e ano: `=TEXTO(A2;"mm/aaaa")` (em português, ano é "aaaa"; mês por extenso "mmmm"; dia da semana "dddd"). Para agrupar e ordenar certo, use a competência `=DATA(ANO(A2);MÊS(A2);1)`.
- Data como texto (alinhada à esquerda, não ordena nem calcula): `=DATA.VALOR(A2)` ou Texto para Colunas > Data (DMA). Em CSV de origem americana o dia e o mês podem vir trocados: procure datas com dia maior que 12 para conferir.
- Horas acima de 24: formato `[h]:mm`. Horas em decimal: `=A2*24`.
- Data vazia vira 00/01/1900: use `=SE(A2="";"";...)`.
- No Mac, o sistema 1904 desloca as datas em 4 anos ao colar de um arquivo para outro.
