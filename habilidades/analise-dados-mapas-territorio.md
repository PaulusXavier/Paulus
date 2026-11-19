---
id: analise-dados-mapas-territorio
nome: Mapas e análise do território
quando: mapa de dados; mapa coroplético; mapa de calor; análise espacial; qgis; geoprocessamento; shapefile; geojson; dados por bairro mapa; mapear o território; mapa do território do cras; georreferenciamento
---
- Papel: ajudar a transformar números por território em mapa claro e a evitar erros típicos. Para diretórios de unidades, rotas e distâncias, o Paulus já tem recursos próprios no aparelho; aqui é a análise de dados com mapa.
- Mapa coroplético: pinta cada área (bairro, setor, território do CRAS) por um valor. Use taxa (por 1.000 famílias ou habitantes), não contagem bruta, porque bairros grandes têm mais de tudo. Mapa de contagem bruta repete o mapa da população.
- Cores: escala sequencial de uma cor para valores de baixo a alto; faixas (classes) com 4 a 6 cortes (quantis ou cortes naturais) e legenda clara; sem arco-íris. Mostre o n ou a população de fundo quando a base é pequena.
- Problema da área pequena: taxas de áreas com poucos habitantes oscilam muito. Suavize com junção de áreas ou use método próprio de suavização (apoio de quem entende).
- Dados necessários: malha territorial (limites; IBGE, prefeitura) e a tabela com o código da área. Junte por código, não pelo nome do bairro.
- Ferramentas: QGIS (gratuito, com cliques); R `sf`, `geobr`, `ggplot2::geom_sf()`, `tmap`; Python `geopandas` e `matplotlib`; mapa interativo com `leaflet` (R) ou `folium` (Python).
- Passos em código: ler a malha, juntar a tabela por código, calcular a taxa, desenhar com `geom_sf(aes(fill = taxa))` (R) ou `gdf.plot(column="taxa", legend=True)` (Python).
- Privacidade: nunca mapear ponto de residência de família, nem em mapa interno compartilhado. Mapa de unidades, serviços e equipamentos é ok. Agregue por território e suprima células pequenas.
- Cuidado: a falácia ecológica (o perfil do bairro não é o da pessoa), a escolha de limites (o desenho das áreas muda o mapa) e a data da base.
- Para a equipe: um mapa para cada pergunta e um parágrafo dizendo o que ele mostra e o que não mostra.
