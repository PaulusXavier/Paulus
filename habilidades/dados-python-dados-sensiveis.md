---
id: dados-python-dados-sensiveis
nome: Dados de pessoas no Python: LGPD e cuidado
quando: anonimizar dados python; lgpd python; dados pessoais python; dados sensíveis python; github dados pessoais python; pseudonimizar python; planilha de famílias python; cadúnico python; jupyter dados pessoais
---
- Princípio: aprender Python com dado fictício ou **agregado** (contagens por território). Lista de famílias, prontuário, CadÚnico por pessoa ou qualquer coisa identificável não vai para este chat, fórum, IA, Colab nem repositório público. A LGPD distingue dado pessoal e sensível (saúde, por exemplo); confira o texto da lei e a orientação da gestão. O sigilo profissional continua valendo.
- Prática sugerida: analisar em computador do serviço, com acesso restrito; `dados/` fora de pasta pública; `.gitignore` com `dados/`, `*.csv` e `*.xlsx`. O GitHub Pages publica o conteúdo do repositório: arquivo com dado de pessoa ali é divulgação.
- **Notebook guarda a saída**: tabela com nomes impressa por `df.head()` fica dentro do `.ipynb`. Limpe as saídas antes de compartilhar ou versionar (`jupyter nbconvert --clear-output --inplace`, ou `nbstripout`).
- Pseudonimização: troque nome e documentos por um código e guarde a tabela de correspondência separada e protegida. Reduz o risco, mas não anonimiza: bairro, idade e composição familiar juntos podem identificar alguém. Hash de CPF sozinho é fraco, porque a lista de CPFs possíveis é pequena e dá para refazer.
- Agregação: relatório por território. Célula com pouquíssimos casos pode identificar a pessoa: agrupe ou omita. O limite (por exemplo, menos de 5) é prática sugerida, e a gestão pode ter regra própria.
- Minimização: `usecols` ou `df[["colunas"]]` logo no começo, só o que a pergunta exige. Nada de nome de pessoa em exemplo, comentário ou nome de arquivo.
- Se a pessoa colar dado real, não analise: avise com gentileza e mostre como fazer o mesmo com dados fictícios.
- Isto não é parecer jurídico: dúvida sobre base legal e compartilhamento vai para a gestão e para o responsável por proteção de dados do órgão.
