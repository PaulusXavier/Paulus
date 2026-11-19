---
id: excel-formulas-basicas
nome: Excel: fórmulas básicas (soma, média, contagem, porcentagem)
quando: fórmulas básicas excel; somar no excel; soma no excel; média no excel; contar no excel; cont.valores; cont.núm; porcentagem no excel; arredondar no excel; ordem das operações excel; como somar coluna excel
texto: sim
---
- Soma `=SOMA(B2:B30)` (Alt+= faz sozinha); média `=MÉDIA(B2:B30)` (ignora vazios, mas o zero entra); mediana `=MED()`; `=MÍNIMO()` e `=MÁXIMO()`.
- Contar: CONT.NÚM conta só números; CONT.VALORES conta células preenchidas (texto também); CONTAR.VAZIO conta as vazias. Quantos registros: `=CONT.VALORES(A2:A500)`, numa coluna sem buracos.
- Porcentagem: `=B2/B$20` com formato %; variação `=(C2-B2)/B2`; parte de um valor `=B2*15%`. Diga sempre o denominador. Divisão por zero: `=SE(C2=0;"";B2/C2)`.
- Arredondar: `=ARRED(B2;2)`, ARREDONDAR.PARA.CIMA, ARREDONDAR.PARA.BAIXO e `=INT()`. Formato com duas casas só esconde o resto, o valor continua inteiro. Em dinheiro, arredonde só onde a regra manda e confira com o sistema oficial.
- Ordem das operações: parênteses, potência (^), multiplicação e divisão, soma e subtração. `=(B2+C2)/2` não é `=B2+C2/2`.
- Texto com número: `="Total: "&B2`; o `&` junta. Para formatar na junção: `="Taxa: "&TEXTO(B2;"0,0%")`.
- Comparações (=, <>, >, <, >=, <=) dão VERDADEIRO ou FALSO; em conta, VERDADEIRO vale 1.
- Sem fórmula: a barra de status (rodapé) mostra soma, média e contagem da seleção.
- A fórmula aparece como texto em vez do resultado? A célula está em formato Texto: mude para Geral, F2 e Enter.
- Confira somando à mão duas ou três linhas, e o total contra a soma das partes. Número guardado como texto é a causa nº 1 de soma que "não bate".
- Entregue a fórmula com as células do exemplo, onde colar e como arrastar.
