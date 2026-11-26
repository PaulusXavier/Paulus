# Pesquisa pública e lembretes no Paulus

## Pesquisa em segundo plano

No console, use `/pesquisar pergunta`. O Worker cria uma investigação durável (`POST /investigacao`), e o console consulta `GET /investigacao/{id}` até o término. O identificador fica no `localStorage` deste aparelho para que uma recarga possa retomar o acompanhamento. A resposta mostra as fontes usadas e o estado da verificação. Links não encontrados nas fontes lidas são removidos da síntese; citações entre aspas não encontradas são marcadas. Essa conferência é mecânica e não valida a qualidade lógica ou a veracidade da fonte.

A investigação exige o Workflow `INVESTIGACAO` configurado no Worker. A pergunta passa pelo filtro de dados pessoais antes de qualquer busca. Não inclua informações identificáveis de pessoas atendidas.

## Lembretes

Os comandos `me lembre de X amanhã às 15h`, `meus lembretes`, `cancelar lembrete X`, `silenciar lembretes` e `ativar lembretes` são processados no aparelho. O agendamento fica no `localStorage`; o aviso dispara apenas com o Paulus aberto. Notificações do sistema são opcionais e dependem da permissão do navegador. Não use lembretes para dados sensíveis.

## Apagar e desfazer

As anotações apagadas podem ser restauradas pelo botão Desfazer enquanto o recibo local estiver válido (até 10 minutos). A memória local exige confirmação explícita antes de ser apagada. Desfazer uma anotação grava novamente no Firestore com o mesmo identificador.
