# Segurança e privacidade

## Regra de ouro
**Dado de família nunca chega ao código do Paulus.** O módulo não é ligado a Firestore, planilhas, notas nem formulários. O filtro de dados pessoais é a segunda barreira, não a primeira.

## O que sai do aparelho (e só no passo da IA)
- A pergunta (até 500 caracteres), já filtrada.
- Até 6 mensagens recentes (600 caracteres cada), só as que passaram no filtro.
- Até 5 fichas do **diretório público** (nome, endereço, horário, telefone e serviços da unidade).
- O nome da aba aberta.
- Nunca: dados de famílias, planilhas, notas, resultados das buscas locais.

## Barreiras
| Camada | O que faz |
|---|---|
| Navegador | Bloqueia a pergunta com documento/telefone (9+ dígitos), e-mail, "nome + sobrenome", tratamento + nome ("dona Maria Souza") ou endereço residencial. Detecta pedido de socorro sem rede. |
| Worker: origem | Só responde a sites listados em `ALLOWED_ORIGINS`. Pedido sem `Origin` leva 403. |
| Worker: app | Só aceita `app` cadastrado em `worker/apps.mjs`. |
| Worker: filtro | Repete o filtro de dados pessoais na pergunta e descarta, do histórico, mensagens do usuário com dado pessoal. |
| Worker: limite | 8 perguntas por minuto por IP (o navegador também limita). Para proteção mais forte, crie uma regra de Rate Limiting no painel da Cloudflare. |
| Worker: prompt | Pergunta, histórico, fichas e normas são tratados como conteúdo, não como instrução. Marcações `<...>` são removidas para ninguém "fechar" uma seção do prompt. |
| Worker: armazenamento | Não grava nada. Nem pergunta, nem resposta. O IP fica só na memória, por até um minuto. |
| Resposta | Sempre marcada como gerada por IA. Telefone citado que não está nas fichas gera alerta. |

## Limites conhecidos
- O filtro é por padrões, não uma garantia: um nome em minúsculas ou escrito de forma incomum pode passar.
- `ALLOWED_ORIGINS` evita uso por outros **sites**, mas não impede alguém de chamar o Worker de fora de um navegador forjando o cabeçalho `Origin`. O limite por IP e a cota diária reduzem o estrago; para mais, use Rate Limiting da Cloudflare.
- O modelo gratuito (Llama 3.1 8B) pode errar em questões técnicas finas. Por isso a citação de norma só vem da base própria e há o aviso "confira antes de usar em atendimento".
- O Paulus não decide caso individual, não dá parecer técnico, jurídico ou clínico.

## No app
- Mostre a resposta com `textContent`, **nunca** `innerHTML`.
- Ações que apagam ou alteram dados precisam de `confirmar: true`.
- Ao trancar o app ou em "Nova conversa", chame `Paulus.limpar()`.
