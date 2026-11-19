---
id: excel-condicionais-somase-contse
nome: Excel: contar e somar com condição (CONT.SES, SOMASES)
quando: cont.se excel; cont.ses; somase excel; somases excel; médiase excel; contar com condição excel; somar com condição excel; contar por bairro excel; contar por mês excel; somar por categoria excel; curinga excel; contar sem duplicar excel
texto: sim
---
- Sintaxe: `=CONT.SE(intervalo; critério)`; `=CONT.SES(int1;crit1;int2;crit2)`; `=SOMASE(int_critério; critério; int_soma)`; `=SOMASES(int_soma; int1;crit1; int2;crit2)`. A soma vem por último no SOMASE e primeiro no SOMASES. Também MÉDIASE(S), MÁXIMOSES e MÍNIMOSES (2019 ou mais novo).
- Exemplo com colunas fictícias (bairro em B, data em C): `=CONT.SES(B2:B500;"Bairro A";C2:C500;">="&DATA(2026;3;1);C2:C500;"<"&DATA(2026;4;1))` conta março de 2026.
- Critério com operador vai entre aspas: ">=18", "<>Bairro A". Valor de uma célula: ">"&F1. Não vazio é "<>", vazio é "=".
- Curingas: `*` (qualquer trecho) e `?` (um caractere): "Boa*". Para achar o próprio asterisco, `~*`. Não diferencia maiúscula de minúscula.
- Os intervalos precisam ter o mesmo tamanho, senão #VALOR!.
- Armadilhas: número guardado como texto não casa; espaço sobrando ("Bairro A ") não casa (limpe com ARRUMAR); critério com mais de 255 caracteres dá erro.
- Contar pessoas distintas, não registros: 365 `=CONT.VALORES(ÚNICO(B2:B500))`; versões antigas `=SOMARPRODUTO(1/CONT.SE(B2:B500;B2:B500))`, sem células vazias no intervalo.
- OU entre condições: some dois CONT.SE; E: use CONT.SES.
- Conferência: a soma das partes tem de dar o total geral. Se não der, há categoria escrita de forma diferente.
- Com mais de dois ou três cruzamentos, a tabela dinâmica é mais rápida e erra menos.
