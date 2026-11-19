---
id: excel-texto
nome: Excel: funções de texto (separar, juntar, limpar)
quando: texto no excel; extrair texto excel; ext.texto; separar nome excel; texto para colunas; concatenar excel; unirtexto; maiúscula excel; arrumar espaços excel; substituir texto excel; preenchimento relâmpago; zeros à esquerda excel; cpf no excel; nis no excel
texto: sim
---
- Funções: `ESQUERDA(texto;n)`, `DIREITA`, `EXT.TEXTO(texto;início;n)`, `NÚM.CARACT`. `LOCALIZAR(trecho;texto)` não diferencia maiúscula e aceita curinga; `PROCURAR` diferencia. É o contrário do que muita gente imagina.
- Primeiro nome: `=ESQUERDA(A2;LOCALIZAR(" ";A2)-1)`. Para dividir em colunas, Dados > Texto para Colunas (delimitado, espaço).
- Limpar: `=ARRUMAR(A2)` tira espaços duplos e das pontas; `=LIMPAR(A2)` tira caracteres invisíveis; `=SUBSTITUIR(A2;CARACT(160);" ")` tira o espaço não separável que vem de sites e PDF. Padronizar: MAIÚSCULA, MINÚSCULA, PRI.MAIÚSCULA (confira "da", "de", "do").
- Juntar: `=A2&" "&B2`, `=CONCAT(A2:C2)`, `=UNIRTEXTO(", ";VERDADEIRO;A2:E2)` (2019 ou mais novo; o VERDADEIRO ignora vazios).
- Número e texto: `=TEXTO(A2;REPT("0";11))` devolve texto com zeros à esquerda (11 dígitos de NIS ou CPF); `=VALOR(A2)` volta a número. Formatar a coluna como Texto antes de colar ou importar evita o problema.
- Máscara de CPF sem mudar o valor: formato personalizado `000\.000\.000\-00`.
- Sem fórmula: Preenchimento Relâmpago (escreva um exemplo ao lado e tecle Ctrl+E), Texto para Colunas e Localizar e Substituir.
- Depois de transformar com fórmula, copie e Cole Especial > Valores para fixar; só apague a coluna original numa cópia do arquivo.
- Atalhos de letra mudam com o idioma do Office (localizar, substituir).
- No chat, só exemplo fictício; descreva o padrão ("Nome Sobrenome").
