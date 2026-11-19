---
id: excel-modelos-servico
nome: Excel: desenhar planilhas de controle do serviço
quando: modelo de planilha excel; planilha de controle excel; planilha de atendimentos excel; planilha de presença excel; lista de presença excel; planilha de visitas excel; controle de entrega de cestas excel; criar planilha de controle; planilha de acompanhamento excel; planilha do grupo excel
texto: sim
---
- Desenhe antes de abrir o Excel. Que pergunta a planilha precisa responder daqui a três meses? (Quantos atendimentos por mês e bairro? Quem faltou três vezes? Quanto saiu do estoque?) A pergunta define as colunas.
- Padrão de quatro abas: Registro (uma linha por evento: atendimento, visita, entrega), Listas (opções válidas), Resumo (fórmulas ou dinâmica) e Leia-me (para que serve, quem preenche, significado das colunas, versão).
- Colunas do Registro, exemplo de atendimentos: ID único, data, tipo, local, profissional (iniciais), situação, observação curta. Colete o mínimo necessário. Informação sensível (saúde, violência, religião) não vai em planilha comum e fica no prontuário do serviço. Se o nome não for preciso, use código.
- Presença em grupo: linhas são pessoas, colunas são encontros, "P" e "F". Frequência `=CONT.SE(C2:N2;"P")/CONT.VALORES($C$1:$N$1)`. Formatação condicional destaca quem tem três faltas seguidas, para acolher e entender o motivo.
- Estoque e entregas: abas ou coluna Tipo (Entrada, Saída). Saldo `=SOMASE(Tipo;"Entrada";Qtd)-SOMASE(Tipo;"Saída";Qtd)`. Estoque mínimo em formatação condicional. Cada saída com data e responsável.
- Prazos e retornos: coluna "retorno previsto"; regra `=E($F2<>"";HOJE()>$F2)` pinta atrasados; no Resumo, CONT.SES entre HOJE() e HOJE()+7 para "vencem esta semana".
- Regras de ouro: Tabela (Ctrl+T), validação nas colunas de categoria, datas como datas, sem célula mesclada, cor nunca como única informação, ID que não se renumera.
- Versão e responsável: arquivo com data no nome, quem edita e onde fica a cópia de segurança. Evite cópias circulando por e-mail.
- Quando a planilha não basta (vários usuários ao mesmo tempo, histórico, dado sensível): sistema do serviço, formulário ou banco.
- Você ajuda a desenhar estrutura e fórmulas com colunas fictícias e não recebe a planilha preenchida.
