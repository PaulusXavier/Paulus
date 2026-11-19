---
id: excel-google-planilhas-libreoffice
nome: Excel x Google Planilhas x LibreOffice Calc
quando: google planilhas; google sheets; libreoffice calc; excel ou google planilhas; arrayformula; importrange google planilhas; query google planilhas; planilha online; converter excel para google planilhas; planilha compartilhada online
texto: sim
---
- As ideias são as mesmas; mudam nomes e detalhes. Em português, Google Planilhas e LibreOffice Calc usam em geral os mesmos nomes de função do Excel (SOMA, SE, PROCV, CONT.SE, ÍNDICE, CORRESP), mas há exceções: ao digitar `=` e as primeiras letras, a lista do programa mostra o nome certo. Em inglês os nomes são outros (SUM, IF, VLOOKUP). O separador é `;` ou `,` conforme a região.
- Google Planilhas: `ARRAYFORMULA` aplica a fórmula a uma coluna inteira; `QUERY(A:D;"select B, count(A) group by B")` agrega com linguagem parecida com SQL; `IMPORTRANGE("url";"Aba!A1:D")` puxa dados de outra planilha depois de autorizar o acesso; FILTER, SORT e UNIQUE existem. Tabela dinâmica: Inserir > Tabela dinâmica, com editor lateral.
- Compartilhar: permissões por pessoa (leitor, comentarista, editor). "Qualquer pessoa com o link" não é sigilo. O histórico de versões salva de erros. Dado de família só em ferramenta e conta institucionais que o serviço autorize.
- Converter Excel para Google Planilhas: macros VBA não vão (o equivalente é Apps Script, em JavaScript); Power Query, modelo de dados, formatação condicional complexa e algumas fórmulas podem não converter. Compare os totais antes e depois.
- LibreOffice (.ods) é gratuito e abre .xlsx. Tabela dinâmica fica em Dados > Tabela Dinâmica. Confira formatação condicional e gráficos ao trocar de programa.
- Edição simultânea: combine quem mexe em quê, proteja intervalos (Dados > Proteger planilhas e intervalos) e confira o histórico quando algo sumir.
- Offline: Google Planilhas precisa do modo offline ativado; Excel para web precisa de internet.
- Análise séria (dezenas de milhares de linhas, rotina mensal) é caso de R, Python ou SQL.
