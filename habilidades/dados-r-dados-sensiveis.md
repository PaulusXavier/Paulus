---
id: dados-r-dados-sensiveis
nome: Dados de pessoas no R: LGPD e cuidado
quando: anonimizar dados; lgpd planilha; dados sensíveis análise; dados pessoais no r; github dados pessoais; pseudonimizar; planilha de famílias r; cadúnico no r; analisar dados cadúnico
---
- Princípio: aprender R com dado fictício ou **agregado** (contagens por território). Lista de famílias, prontuário, CadÚnico por pessoa ou qualquer coisa identificável não vai para este chat, fórum, IA nem repositório público. A LGPD distingue dado pessoal e sensível (saúde, por exemplo); confira o texto da lei e a orientação da gestão. O sigilo profissional continua valendo.
- Prática sugerida: analisar em computador do serviço, com acesso restrito; `dados/` fora de pasta pública; não subir ao GitHub (`.gitignore` com `dados/` e `*.csv`). O GitHub Pages publica o conteúdo do repositório: CSV com dado de pessoa ali é divulgação.
- Pseudonimização: troque nome e documentos por um código (`row_number()`) e guarde a tabela de correspondência separada e protegida. Reduz o risco, mas não anonimiza: bairro, idade e composição familiar juntos podem identificar alguém.
- Agregação: relatório com contagens por território. Célula com pouquíssimos casos pode identificar a pessoa: agrupe categorias ou omita. O limite (por exemplo, menos de 5) é prática sugerida, e a gestão pode ter regra própria.
- Minimização: `select()` logo no começo, só com as colunas que a pergunta exige.
- Nada de nome de pessoa em exemplo, comentário ou nome de arquivo.
- Se a pessoa colar dado real, não analise: avise com gentileza que não deve compartilhar e mostre como fazer o mesmo com dados fictícios no mesmo formato.
- Isto não é parecer jurídico. Dúvida sobre base legal e compartilhamento vai para a gestão e para o responsável por proteção de dados do órgão.
