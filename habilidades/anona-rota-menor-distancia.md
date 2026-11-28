---
id: anona-rota-menor-distancia
nome: Anona — Rota de visita pela menor distância (geografia.json) e como a ordem aprende
quando: geografia.json anona; rota pela menor distância anona; ordem das visitas por distância anona; como a ordem é sugerida anona; apagar o que foi aprendido anona; ruas vizinhas anona; montar geografia anona; km estimado da rota anona
apps: anona
---
- Sem mapa, a ordem das folhas sai só do texto do endereço: nome de rua normalizado ("Cap. Ene Garcez" = "Capitão Ene Garcez"), ordem natural ("Rua 2" antes de "Rua 10") e, em cada rua, casas em serpentina (ímpares subindo, pares voltando). Integrantes da mesma família ficam juntos.
- Com o arquivo opcional `geografia.json` ao lado do `index.html`, as ruas passam a ser ordenadas pelo menor deslocamento (busca exata até 9 ruas) e o aviso informa os km estimados. O arquivo só traz o ponto central de RUAS e BAIRROS, nunca de casas. Sem o arquivo, tudo funciona como antes.
- Quem mantém o app gera o arquivo no repositório do Paulus: baixa do Overpass (OpenStreetMap) as ruas e bairros de Boa Vista com centro de cada elemento e roda `node scripts/montar-geografia.mjs overpass.json geografia.json`; depois sobe o `geografia.json` junto com o app. O bairro de cada rua é o do centro mais próximo (aproximação) e o centro de rua comprida é a mediana dos trechos: confira no mapa antes de publicar.
- A distância é estimada e não considera trânsito nem mão única. Para o trajeto de verdade, leve os endereços ao "Mapa e rotas".
- Aprende com seus ajustes: ao mexer na ordem com as setinhas ▲▼ e gerar o PDF, ruas que você pôs em sequência passam a contar como vizinhas na próxima vez. Só nome de rua e bairro, só neste aparelho. Em "Como a ordem é sugerida" aparece quanto foi aprendido, com o botão "Apagar o que foi aprendido".
- Nenhum endereço sai do aparelho nessa etapa e não há IA externa nem chave de API. Se o Paulus local não estiver carregado, o app usa a ordenação simples por rua e número e avisa.
- Folhas escaneadas (só imagem) são lidas por OCR no aparelho, só no quadro "Endereço da família"; confira o endereço lido antes de organizar.
