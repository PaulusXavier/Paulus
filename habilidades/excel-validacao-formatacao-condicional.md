---
id: excel-validacao-formatacao-condicional
nome: Excel: validação de dados e formatação condicional
quando: validação de dados excel; lista suspensa excel; menu suspenso excel; formatação condicional excel; destacar duplicados excel; destacar vencidos excel; barra de dados excel; escala de cores excel; proteger planilha excel; bloquear células excel
texto: sim
---
- Validação (Dados > Validação de Dados) previne o erro na origem. Lista suspensa: Permitir = Lista; a origem pode ser digitada separada por `;` (`Bairro A;Bairro B`) ou, melhor, um intervalo numa aba "Listas". Também há número inteiro entre, data entre, comprimento do texto e Personalizada com fórmula, como `=E(ÉNÚM(A2);NÚM.CARACT(A2)=11)` para um identificador de 11 dígitos. Use Mensagem de Entrada e Alerta de Erro para orientar. Colar valores por cima passa por cima da validação.
- Lista dependente (serviço → profissional): intervalos nomeados e `=INDIRETO(A2)` na origem da segunda lista, com nomes sem espaço.
- Formatação condicional (Página Inicial) pinta sem mexer nos valores: Realçar Regras (maior que, texto que contém, datas, valores duplicados), Barras de Dados, Escalas de Cor e Ícones.
- Com fórmula (Nova Regra > Usar uma fórmula): escreva para a primeira célula da seleção, com $ na coluna para pintar a linha inteira. `=HOJE()>$E2` pinta prazo vencido; `=E($F2="";HOJE()>$E2)` pinta vencido sem retorno registrado.
- Gerenciar Regras mostra a ordem, o "Aplica-se a" e "Parar se Verdadeiro". Regras demais deixam o arquivo lento e confuso.
- Cor sozinha não filtra, não exporta e não é lida por quem não distingue cores: ao lado dela, uma coluna "situação" com texto.
- Proteger: todas as células vêm bloqueadas. Desbloqueie as de digitação (Formatar Células > Proteção) e depois Revisão > Proteger Planilha. Isso evita erro sem querer e não é segurança: a senha da planilha é fraca. Para sigilo, senha do arquivo e controle de acesso (roteiro de dados sensíveis).
- Modelo para a equipe: abas Cadastro (Tabela com validação), Listas, Resumo (dinâmica protegida) e Leia-me.
