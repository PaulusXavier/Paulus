---
id: excel-se-e-ou
nome: Excel: SE, E, OU, SES e SEERRO
quando: função se excel; se aninhado excel; função se e ou; função ses excel; seerro excel; fórmula condicional excel; faixa etária excel; classificar por faixa excel; função escolher excel
texto: sim
---
- `=SE(teste; se_verdadeiro; se_falso)`: `=SE(D2>=60;"Idoso";"Não idoso")`. Texto entre aspas, número sem.
- E, OU e NÃO dentro do teste: `=SE(E(D2>=18;D2<60);"Adulto";"Outro")`; `=SE(OU(F2="";G2="");"Faltam dados";"OK")`.
- Vários níveis, 2019 ou mais novo: `=SES(D2<12;"Criança";D2<18;"Adolescente";D2<60;"Adulto";VERDADEIRO;"Idoso")` (o VERDADEIRO final é o "senão"). Versão antiga: SE dentro de SE, `=SE(D2<12;"Criança";SE(D2<18;"Adolescente";SE(D2<60;"Adulto";"Idoso")))`. Com mais de quatro níveis, vire tabela de faixas + PROCV aproximado.
- Ordem importa: o Excel para no primeiro teste verdadeiro. Vá do mais restrito ao mais amplo.
- Armadilha do vazio: célula vazia vale 0 na comparação, então `D2<12` é VERDADEIRO para linha sem idade. Teste primeiro: `=SE(D2="";"";...)`.
- Erros: `=SEERRO(fórmula;"texto")` trata qualquer erro; `=SEND()` trata só #N/D, mais seguro com PROCV porque não esconde outros erros. Não use SEERRO para calar um erro que você não entendeu.
- ESCOLHER quando o resultado é 1, 2, 3...: `=ESCOLHER(DIA.DA.SEMANA(A2;2);"seg";"ter";"qua";"qui";"sex";"sáb";"dom")`.
- Conter um trecho: `=SE(ÉNÚM(LOCALIZAR("CRAS";B2));"tem";"não tem")`.
- Regras (idades de corte, limites) em células de parâmetro e referência com $, não digitadas dentro de cem fórmulas.
- Para somar o resultado depois, crie coluna auxiliar ("Meta atingida?") e use CONT.SE(coluna;"Sim").
