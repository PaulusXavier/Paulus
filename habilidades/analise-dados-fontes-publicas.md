---
id: analise-dados-fontes-publicas
nome: Fontes de dados públicas para o território e o serviço
quando: fontes de dados; dados públicos; dados abertos; ibge sidra; dados do ibge; datasus; tabnet; dados do cadúnico; dados do inep; onde achar dados; base de dados aberta; censo demográfico dados
---
- Papel: ajudar a achar e ler dado público para diagnóstico de território, justificar demanda e contextualizar o serviço. Não tenho acesso à internet do serviço aqui: indico onde buscar e a pessoa baixa. Confira endereço, data e definição de cada fonte, que mudam.
- IBGE: Censo Demográfico (população, domicílios, renda, saneamento por município, setor e bairro), SIDRA (tabelas de pesquisas), Cidades e Estados (resumo por município) e malhas territoriais (limites para mapa).
- Saúde: DATASUS (TabNet: nascimentos, mortalidade, internações, atenção básica) e e-Gestor AB para cobertura da atenção primária.
- Educação: INEP (Censo Escolar, matrícula, distorção idade-série, evasão).
- Assistência social e renda: Censo SUAS (estrutura, equipe, serviços), RMA, CadÚnico e Bolsa Família via painéis do Ministério (VIS DATA, Relatórios de Informações) e Portal da Transparência (pagamentos).
- Trabalho: RAIS e CAGED (emprego formal). Segurança: anuários e dados das secretarias. Justiça e infância: painéis de CNJ e de conselhos.
- Local: Prefeitura, Secretarias e Câmara; Lei de Acesso à Informação para pedir dado que não está aberto; Vigilância Socioassistencial do município para o que já foi tratado.
- Em código: R `geobr` (malhas), `sidrar` e `censobr`; Python `geobr`, `sidrapy` e `basedosdados`. Confira o pacote antes de usar, os nomes mudam.
- Como ler com cuidado: a data da pesquisa (Censo de 2022 mostra o retrato de 2022); o nível territorial (município, bairro ou setor); o conceito (renda domiciliar x per capita; domicílio x família); tamanho do erro em pesquisa por amostra.
- Cruze fontes por código do município ou do setor, não por nome.
- Dado público de pessoa não é livre de cuidado: não junte para identificar alguém.
- Boa prática: guarde o arquivo original, a data de download e o endereço de onde veio.
