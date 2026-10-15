# Habilidades do Paulus

**Conhecimento** (a base de normas em `knowledge/`) diz *o que a regra diz*. **Habilidade** (`habilidades/`) diz *como fazer o trabalho*: escrever um relatório, preparar uma visita, conduzir uma discussão de caso. O Paulus já sabe o jeito de pensar de um psicólogo do SUAS (`worker/prompt.mjs`); as habilidades acrescentam o passo a passo de tarefas específicas.

## Como funciona
1. A pessoa pergunta ("me ajuda a escrever um relatório técnico para o MP").
2. O Worker compara a pergunta com os gatilhos (`quando:`) de cada habilidade (`shared/habilidades.mjs`). Pergunta curta de seguimento herda o assunto da anterior.
3. Entram no prompt **até 2** roteiros, os de gatilho mais específico. Sem combinação, nada entra e o custo é zero.
4. A resposta volta com o nome da habilidade usada (`habilidades` no JSON; evento `{"habilidades":[...]}` no streaming; `resultado.habilidades` e o gancho `onHabilidades` no navegador). O app pode mostrar uma etiqueta "Usei: Visita domiciliar".

Regras que **não mudam** com habilidade: endereço, telefone, artigo, número e valor só vêm de `<fichas>` e `<normas>`; dado pessoal continua barrado; tema de suicídio nunca carrega roteiro; e o Paulus não dá parecer nem diagnóstico.

## Ensinar uma habilidade nova
Crie `habilidades/<id>.md` (o nome do arquivo é o `id`):

```
---
id: grupo-de-cuidadores
nome: Grupo de cuidadores
quando: grupo de cuidadores; cuidador de idoso; grupo de mães
apps: umbrella            (opcional: só vale nesses apps)
texto: sim                (opcional: produz texto pronto; libera resposta mais longa)
---
- Passo 1...
- Passo 2...
```

- **`quando`**: gatilhos separados por `;`. Todas as palavras do gatilho precisam aparecer na pergunta (sem importar acento, plural nem ordem). Prefira gatilhos de 2 palavras ("visita domiciliar"); gatilho de uma palavra só para termos bem específicos ("ofício").
- **Roteiro**: linhas começando com `- `, no tom de um colega experiente, até **2200 caracteres** (o build recusa mais que isso, porque o texto gasta a cota gratuita da IA). Sem nome, telefone, artigo nem número de lei: isso vem das fontes.
- Depois: `npm run build:habilidades` (mostra a lista) e `npm test`. O `npm run build` e o `wrangler deploy` já refazem o pacote sozinhos; publique o Worker de novo ([DEPLOY.md](DEPLOY.md)).

## Pedir pelo Claude
Anexe o repositório e escreva, por exemplo: "ensine ao Paulus como fazer um parecer de visita de pós-acolhimento". O Claude escreve o `.md`, roda os testes e confere se o gatilho não dispara em perguntas comuns. **Você revisa o roteiro**: ele reflete a prática de quem o escreveu, não uma norma.

## Habilidades atuais
Registro técnico de atendimento · Relatório técnico ao Judiciário, MP ou Conselho · Ofício, encaminhamento e contrarreferência · Plano de Acompanhamento Familiar (PAF) · Escuta qualificada e acolhida · Discussão de caso em equipe · Visita domiciliar · Grupo, oficina e SCFV · Leitura do território e busca ativa · Acompanhamento de condicionalidades do Bolsa Família · Suspeita ou revelação de violência · Atendimento intercultural (migrantes e povos indígenas) · Álcool, drogas e redução de danos · Pauta, reunião de equipe e ata · Dúvida ética e sigilo · Diário de campo (Toth e Grafia).
