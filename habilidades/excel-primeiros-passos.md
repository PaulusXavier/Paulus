---
id: excel-primeiros-passos
nome: Excel: primeiros passos (células, referências, formatos)
quando: primeiros passos no excel; células e intervalos; referência absoluta; referência relativa; cifrão na fórmula; f4 excel; alça de preenchimento; formatar células excel; colar especial; nomear intervalo; pasta de trabalho e planilha
texto: sim
---
- Pasta de trabalho é o arquivo; planilha é a aba; célula é coluna + linha (B3); intervalo é B3:B20. Os argumentos de uma função se separam por `;` no Excel em português (`,` no inglês).
- Toda fórmula começa com `=`. Clicar nas células monta a referência; Enter confirma, Esc cancela, F2 edita.
- Referência relativa (B2) muda ao copiar; absoluta ($B$2) não muda; mista ($B2 ou B$2) trava só coluna ou só linha. F4 alterna. Exemplo: `=B2/$B$20` copiado para baixo mantém o total fixo.
- Alça de preenchimento (quadradinho no canto da célula): arrastar, ou duplo clique para copiar a fórmula até o fim da lista vizinha; também gera séries (meses, 1, 2, 3).
- Tipo de dado: número alinha à direita, texto à esquerda. Número guardado como texto (canto verde) não soma. NIS e CPF são identificadores, não quantidades: formate a coluna como Texto antes de colar, senão somem os zeros à esquerda.
- Formato muda a aparência, não o valor: 0,5 pode aparecer como 50%; data é um número de série. Ctrl+1 abre Formatar Células.
- Colar Especial (Ctrl+Alt+V): Valores (tira a fórmula e deixa o resultado), Formatos, Transpor.
- Nome para intervalo (Fórmulas > Gerenciador de Nomes) deixa `=SOMA(Atendimentos)` legível; a Tabela (Ctrl+T) já faz isso.
- Salve versões com data no nome e guarde o original intacto. Ctrl+Z não volta depois de fechar o arquivo.
- Região e idioma mudam como se digita: separador de lista (`;` ou `,`) e decimal (vírgula ou ponto). Se a fórmula do exemplo não "pega", confira isso primeiro.
