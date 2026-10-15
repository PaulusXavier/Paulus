# Segurança e privacidade

## Regra de ouro
**Dado de família nunca chega ao código do Paulus.** O módulo não é ligado a Firestore, planilhas, notas nem formulários. O filtro de dados pessoais é a segunda barreira, não a primeira.

## O que sai do aparelho (e só no passo da IA)
- A pergunta (até 500 caracteres), já filtrada.
- Até 6 mensagens recentes (600 caracteres cada), só as que passaram no filtro.
- Até 10 fichas do **diretório público** (nome, endereço, horário, telefone e serviços da unidade).
- O nome da aba aberta.
- Nunca: dados de famílias, planilhas, notas, resultados das buscas locais.

## Memória que aprende com o uso (v0.5.0)
O Paulus guarda, **no aparelho** (`localStorage`), o que aprendeu sobre o estilo e os hábitos da pessoa (`client/memoria.mjs`). O Worker continua sem gravar nada.

| O que guarda | Limite | Observação |
|---|---|---|
| Pontuação de estilo (curto, detalhado, exemplos) | 3 números | esmaece com o tempo (meia-vida de 60 dias) |
| Documentos mais consultados | 40 ids públicos | meia-vida de 45 dias |
| Perguntas repetidas (texto) | 150, até 140 caracteres | só as que passaram no filtro; aparecem como sugestão a partir da 2ª vez |
| Apelidos de tela | 40, até 40 caracteres | |
| Respostas que a pessoa aprovou com 👍 | 30, até 1800 caracteres | vencem em 6 meses; marcadas como "da memória" |
| Telas mais abertas | 40 | |

**Regras:**
- Cada texto passa de novo pelo filtro de dados pessoais ao gravar, ao ler do armazenamento e ao importar um arquivo (a memória é reconstruída campo a campo; o que não passa é descartado, inclusive `<`/`>`).
- **Pergunta sobre suicídio ou autolesão nunca é guardada** nem vira sugestão ou resposta aprovada. Pedido de socorro e pergunta bloqueada por dado pessoal nem chegam à memória.
- **O que sai do aparelho por causa da memória:** só um objeto `preferencias` com `tamanho` (`curto`/`detalhado`/`normal`), `exemplos` (sim/não) e até 3 ids de documentos públicos. Nunca perguntas, respostas guardadas nem apelidos. O Worker revalida tudo (lista fechada; ids que existam na base; o título vem da base) e ignora as preferências em tema de suicídio. Os ids dos documentos mais consultados dizem pouco sobre a pessoa, mas são um traço de uso: quem não quiser, usa `memoria: false`.
- **A pessoa manda:** pode ver (`Paulus.memoria.resumo()`), desligar, apagar tudo ou por parte, exportar e importar. Desligada, a memória não aprende nem é usada.
- Ajustes de estilo **nunca** alteram as regras de segurança, o escopo ou o uso de normas: o bloco do prompt diz isso e vem depois das regras.

**Limites conhecidos da memória:**
- O `localStorage` não é criptografado e pertence ao navegador: em **computador compartilhado**, quem abrir o mesmo navegador/perfil de usuário vê as perguntas repetidas e as respostas aprovadas. Use `perfil` (id da conta) e chame `Paulus.memoria.esquecer()` ao sair, ou `memoria: false` onde o aparelho é de uso comum.
- O filtro de dados pessoais é por padrão (como já dito acima): uma pergunta com nome escrito de forma incomum pode passar e ficar guardada no aparelho (nunca no servidor).
- Resposta aprovada é texto de IA de um dia específico: pode estar desatualizada. Por isso vence em 6 meses, aparece com data e com o aviso "confira a norma".

## Barreiras
| Camada | O que faz |
|---|---|
| Navegador | Detecta pedido de socorro primeiro, sem rede (assim "Nome: Maria Souza quer se matar" mostra os telefones). Depois bloqueia a pergunta com documento/telefone (9+ dígitos, ou número curto depois de RG/CPF/NIS...), e-mail, "nome + sobrenome" depois de palavras como nome, paciente, mãe ou criança (nomes de programas como "Bolsa Família" passam), tratamento + nome ("dona Maria Souza") ou endereço residencial. |
| Worker: origem | Só responde a sites listados em `ALLOWED_ORIGINS`. Pedido sem `Origin` leva 403. |
| Worker: app | Só aceita `app` cadastrado em `worker/apps.mjs`. |
| Worker: filtro | Repete o filtro de dados pessoais na pergunta e descarta, do histórico, mensagens do usuário com dado pessoal. |
| Worker: limite | 8 perguntas por minuto por IP (o navegador também limita). Para proteção mais forte, crie uma regra de Rate Limiting no painel da Cloudflare. |
| Worker: prompt | Pergunta, histórico, fichas e normas são tratados como conteúdo, não como instrução. Marcações `<...>` são removidas para ninguém "fechar" uma seção do prompt. |
| Worker: armazenamento | Não grava nada. Nem pergunta, nem resposta, nem o que o Paulus aprendeu (isso fica só no aparelho). O IP fica só na memória, por até um minuto. |
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
