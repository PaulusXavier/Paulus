---
id: ferramentas-argo-nis-cpf
nome: Conferir NIS e CPF — dígito verificador, o que mostra e o que não
quando: conferir nis; conferir cpf; validar nis; validar cpf; dígito verificador; nis e cpf; nis cpf ferramenta; conferir número do nis
apps: argo
---
- A ferramenta confere só o formato e o dígito verificador, para pegar erro de digitação na hora do atendimento. Não diz se o número existe no CadÚnico nem de quem é.
- Como funciona: a pessoa digita ou cola o número. Com 11 dígitos, o app testa os dois, NIS e CPF, e mostra qual confere ("Confere" ou "Não confere", com o motivo). Com 11 dígitos não dá para saber se o número é de um tipo ou de outro: veja qual dos dois confere. Com 9 ou 10 dígitos só vale como CPF com zeros à esquerda apagados (o Excel faz isso). Menos de 9: faltam dígitos. Mais de 11: dígitos demais.
- Dígitos todos iguais nunca conferem. O NIS tem 11 dígitos; o NIS/PIS/NIT e o número do CadÚnico são coisas ligadas, mas confirmar o cadastro só no sistema do CadÚnico.
- Nada é salvo nem enviado.
- IMPORTANTE para você: número de NIS ou CPF digitado no chat é dado pessoal e o filtro o barra. Não peça nem repita o número. Diga para abrir o cartão e conferir lá; indique o botão. Se perguntarem "como se calcula o dígito", explique a ideia (pesos e módulo 11) sem usar número real.
- Para conferir uma lista inteira (planilha), indique o Analisador de planilha, que tem os botões Conferir NIS e Conferir CPF e mostra só os 3 últimos dígitos.
