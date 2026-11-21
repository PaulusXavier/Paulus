---
id: modelo-3d-didatico-dados
nome: Dados do modelo 3D didático
quando: dados modelo 3d; campos modelo 3d; adaptar modelo 3d; trocar tema modelo 3d; novo tema modelo 3d; licoes quiz modelo 3d
texto: sim
---
- No arquivo-base o conteúdo está em cinco listas no começo do script. Escreva cada uma como a pessoa vai colar: uma lista por vez, com os campos na ordem abaixo.
- THEMES (cores de fundo): name, bgTop, bgBottom, nebulaA, nebulaB, nebulaC, milkyWay.
- BODIES (cada corpo): id (minúsculo, único), name, category, subtitle, color, artRadius, realRadius, diameterKm, orbitRadius, speed, spinSpeed, tilt, tiltDeg, gravity, au, orbitalVelKmS; desc, fact; stats (label e value); atmosphere (gas e pct); layers (name, pct, color); moons (só nomes para exibir); didactic com comparison, why e concept.
- Somas: layers e atmosphere devem fechar 100. Corpo central: orbitRadius 0 e speed 0.
- MOONS: parentId (id de um corpo), name, radius, dist, speed (negativo gira ao contrário), color, phase.
- LESSONS: targetId (id que exista em BODIES), zoom, title numerado, body, formula. Cada lição ensina uma ideia só, em ordem do simples ao complexo.
- QUIZ_QUESTIONS: q, options (4 alternativas), answer (posição começando em 0), explanation. Alternativas erradas precisam ser plausíveis, nunca absurdas, e a explicação diz por que as outras não servem.
- Antes de entregar, confira: ids sem repetição, targetId e parentId existentes, answer entre 0 e 3, somas fechando, unidades iguais em todos os corpos.
- Escrevo os dados, mas não os valido por programa: quem cola testa abrindo o arquivo e conferindo se algum painel ficou vazio.
