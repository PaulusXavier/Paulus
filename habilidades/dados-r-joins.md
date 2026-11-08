---
id: dados-r-joins
nome: R: unir tabelas (joins)
quando: left_join; inner_join; anti_join; join_by; chave primária; chave estrangeira; uniões no r; unir tabelas r; juntar tabelas r
---
- Join combina duas tabelas por uma **chave**: coluna que identifica a observação (chave primária em uma tabela, chave estrangeira na outra). Exemplo: `atend` com `cod_bairro` e `bairros` com o nome e a região.
- Antes de unir: a chave é única e sem NA? `bairros |> count(cod_bairro) |> filter(n > 1)` deve voltar vazio. Sem chave natural, crie uma (`row_number()`).
- `atend |> left_join(bairros, join_by(cod_bairro))` mantém todas as linhas de `atend` e acrescenta colunas; sem correspondência, NA. É a primeira escolha. Nomes diferentes: `join_by(cod == codigo)`.
- `inner_join()` fica só com o que combina; `full_join()` mantém tudo dos dois; `right_join()` é raro.
- `anti_join(atend, bairros, join_by(cod_bairro))` mostra as linhas SEM correspondência: ótimo para achar código errado ou território faltando. `semi_join()` mantém só quem tem correspondência, sem acrescentar colunas.
- Confira `nrow()` antes e depois. Se aumentou, a chave não era única e linhas foram duplicadas. O aviso "many-to-many" é alarme, não detalhe.
- Colunas de mesmo nome nas duas tabelas ganham sufixos `.x` e `.y`: resolva com `join_by` ou `rename()`. Chaves de tipos diferentes (texto "01" e número 1) não se encontram: acerte o tipo.
- Uso típico: unir contagens por território à população do território para calcular taxa por mil habitantes. Trabalhe com tabelas agregadas, nunca com lista de pessoas.
- Unir por nome de pessoa é arriscado (homônimos, grafias): prefira um identificador, e esse tipo de dado não é para este chat.
