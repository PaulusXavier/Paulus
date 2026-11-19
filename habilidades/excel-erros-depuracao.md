---
id: excel-erros-depuracao
nome: Excel: entender e corrigir erros de fórmula
quando: erro no excel; erro de fórmula excel; excel #valor; excel #ref; excel #nome; excel #div/0; excel #núm; excel #nulo; referência circular; fórmula não calcula excel; excel mostra ####; avaliar fórmula; fórmula mostra texto excel
texto: sim
---
- `####`: coluna estreita demais (alargue) ou data e hora negativas.
- `#DIV/0!`: divisão por zero ou por célula vazia. `=SE(C2=0;"";B2/C2)`.
- `#N/D`: o valor procurado não foi achado (PROCV, CORRESP): espaço, número contra texto, grafia, intervalo (roteiro de PROCV).
- `#NOME?`: nome de função errado, função que a versão não tem (PROCX no 2016), texto sem aspas ou nome definido inexistente. Também aparece ao abrir arquivo com função nova numa versão antiga.
- `#VALOR!`: tipo errado (texto onde se espera número, espaço invisível), intervalos de tamanhos diferentes no SOMASES, data inválida. Ache o culpado com Fórmulas > Avaliar Fórmula.
- `#REF!`: a referência foi apagada (coluna, linha ou aba excluída, ou colada por cima). Ctrl+Z logo; depois não dá para adivinhar.
- `#NÚM!`: número impossível (raiz de negativo, DATADIF com início maior que o fim).
- `#NULO!`: espaço onde devia haver `;` ou `:`.
- `#DERRAM!`: há célula ocupada no caminho da matriz dinâmica.
- Referência circular: a fórmula depende do próprio resultado (a soma inclui a célula do total). Fórmulas > Verificação de Erros > Referências Circulares.
- Mostra a fórmula em vez do resultado: célula em formato Texto (mude e tecle F2 + Enter), ou cálculo em Manual (Fórmulas > Opções de Cálculo > Automático; F9 recalcula).
- O pior erro não avisa: número guardado como texto, FALSO esquecido no PROCV, filtro escondendo linha na SOMA, intervalo que não pega as linhas novas, formato escondendo casas. Confira com uma conta à mão e o total contra a soma das partes.
- Ferramentas: Avaliar Fórmula (passo a passo), Rastrear Precedentes e Dependentes, F9 na barra de fórmulas (avalia o trecho selecionado; Esc desfaz), Ctrl+` (mostra as fórmulas).
- Para ajudar bem, peça: o texto exato do erro, a fórmula, e o que há em cada célula referenciada (texto, número ou vazio), com dados fictícios.
