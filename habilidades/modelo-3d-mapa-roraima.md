---
id: modelo-3d-mapa-roraima
nome: Mapa 3D de Roraima (modelo didático)
quando: mapa 3d; mapa 3d de roraima; mapa roraima 3d; maquete 3d roraima; municipios de roraima 3d; mapa em relevo roraima; dados mapa 3d roraima; novo mapa 3d
texto: sim
---
- Existe um modelo pronto: "Roraima 3D · Edição Didática" (v1). É um arquivo único .html que abre no navegador do celular ou do computador, sem internet e sem instalar nada. Quem pede "mapa 3D de Roraima" recebe o arquivo pelo botão de baixar, no aparelho; o código dele não passa pela IA.
- O que traz: os 15 municípios em relevo, com altura e cor por população, área, densidade ou percentual indígena; ficha de cada município; ranking; lições guiadas (capital, território, densidade, povos indígenas, fronteiras); desafio com perguntas e jogo de achar o município no mapa; giro, zoom, modo plano e bússola.
- De onde vêm os números: população do Censo 2022 (IBGE), área oficial e percentual indígena, nos municípios em que o Argo informa, vêm do arquivo do Argo (municipios-rr.json). A densidade é calculada no mapa (população ÷ área). Onde o Argo não informa a área, o mapa usa a área calculada do contorno e marca com "≈". Contornos: IBGE, via geodata-br (CC0).
- Como ler com a equipe: a altura é exagerada para comparar municípios, não é relevo. Município em cinza está sem dado, e isso não quer dizer zero (por exemplo, só alguns municípios têm o percentual indígena no Argo).
- Para atualizar quando os dados do Argo mudarem: editar scripts/modelos/mapa-roraima.dados.json e rodar "npm run montar:mapa-roraima -- mun.json" (o mun.json é o GeoJSON dos municípios do IBGE). Os valores do mapa devem ser conferidos nas fontes oficiais antes de entrar em relatório.
- Outro estado, região ou cidade: o motor de desenho serve, mas eu não monto sozinho um arquivo de milhares de linhas. Escrevo os dados e o roteiro (objetivo, o que a altura mostra, lições, perguntas do quiz) e digo que o arquivo se monta no Claude, no chat, anexando o mapa de Roraima e pedindo "faça no estilo deste".
- Mapa não leva dado de pessoa nem de família, só números por município. Nada de ponto de residência.
- Texto sempre em português do Brasil. Número só o que a pessoa passou ou o que o arquivo traz; estimativa, marque como estimativa.
