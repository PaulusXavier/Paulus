---
id: excel-importar-csv
nome: Excel: abrir e salvar CSV sem estragar (acentos, zeros, datas)
quando: abrir csv no excel; csv no excel; acentos errados excel; csv com ponto e vírgula; exportar para csv excel; salvar como csv excel; zeros à esquerda csv; datas invertidas csv; importar txt excel; csv utf-8 excel; arquivo do sicon excel; arquivo do cadúnico excel
texto: sim
---
- CSV é texto simples. Ao dar duplo clique, o Excel "chuta" codificação, separador e tipos, e daí vêm acento quebrado ("AtenÃ§Ã£o"), tudo numa coluna só, zero à esquerda sumindo (NIS, CEP, códigos), datas trocadas e número grande em notação científica (1,23E+10).
- Não abra por duplo clique. Use Dados > Obter Dados > De Arquivo > De Texto/CSV: origem do arquivo 65001 UTF-8 (acento quebrado costuma ser UTF-8 lido como Windows), delimitador `;` (comum nos sistemas públicos brasileiros) ou `,`, e em Transformar Dados defina como Texto as colunas de NIS, CPF, CEP e códigos. No Excel antigo: Dados > De Texto, e no passo 3 do assistente marque a coluna como Texto.
- Zero à esquerda em dado já aberto: `=TEXTO(A2;REPT("0";11))` para 11 dígitos; para CEP, `REPT("0";8)`. Se salvou e reabriu por duplo clique, os zeros somem de novo: o defeito é da abertura, não do arquivo.
- Mais de 15 dígitos (protocolos longos) perdem precisão se virarem número, e não há como recuperar: importe como Texto desde o início.
- Datas: confira se o arquivo usa dia/mês/ano ou mês/dia/ano. No assistente, formato da coluna Data: DMA. Procure datas com dia maior que 12 para ver se trocou.
- Decimal: no Brasil `1.234,56`; formato americano `1,234.56` vira texto. No Power Query, Alterar Tipo > Usando Localidade > Inglês (Estados Unidos).
- Exportar: Salvar como > CSV UTF-8 (delimitado por vírgulas). Dependendo da região, o separador sai `;`. Abra no Bloco de Notas para conferir o que o sistema de destino espera. Só a aba ativa é salva, fórmulas viram valores e formatos somem.
- Acima de 1.048.576 linhas, o Excel corta o arquivo em silêncio: use Power Query, modelo de dados, DuckDB, R ou Python.
- Arquivos de sistemas (Sicon, CadÚnico, Censo SUAS): o leiaute das colunas vem da documentação do sistema. Descreva as colunas, nunca cole dado de família no chat.
