# Base de normas

É o que permite ao Paulus **citar a norma** (documento e artigo). Ela serve a três coisas:
1. **Navegador, offline:** quando não há internet ou a IA falha, o app mostra o trecho da norma que mais combina com a pergunta.
2. **Worker:** a cada pergunta, o Worker busca os 3 trechos mais próximos e os coloca no prompt como `<normas>`. A IA só pode citar artigo que esteja ali.
3. **Fontes:** o Worker devolve a lista (`documento`, `norma`, `ano`, `referencia`) para o app mostrar abaixo da resposta.

## Como está organizada
```
knowledge/
├── documentos/nob-suas-2012.md    ← VOCÊ edita estes (um arquivo por norma)
└── conhecimento.json              ← gerado, não edite
```

## Acrescentar ou corrigir uma norma
1. Crie `knowledge/documentos/NOME.md` (ou edite um existente):
   ```
   ---
   doc: tipificacao-2009
   titulo: Tipificação Nacional
   norma: Resolução CNAS nº 109, de 11 de novembro de 2009
   ano: 2009
   ---

   ## Proteção Social Básica, Serviço de Convivência e Fortalecimento de Vínculos

   Texto copiado da norma, sem resumir.
   ```
   - `doc`: identificador curto, só minúsculas, números e hífen. Não repita em outro arquivo.
   - Cada `## ...` é um **trecho citável**; o que vem depois do `##` é a referência mostrada ao usuário (ex.: `art. 17, XV`).
   - Um trecho por artigo ou inciso. Trechos curtos (até uns 700 caracteres) funcionam melhor na busca.
   - Arquivos que começam com `_` são ignorados (bom para rascunho).
2. `npm run build:conhecimento` (o teste `tests/conhecimento.test.mjs` avisa se você esquecer).
3. `npm test`, `npm run build`, publique o Worker e o site ([DEPLOY.md](DEPLOY.md)) e copie `dist/conhecimento.json` para os apps com cópia local (Argo).

## Importar uma norma inteira (sem digitar)
1. Copie o texto oficial (site do Planalto para leis; site do Ministério para resoluções do CNAS) e cole em um arquivo `.txt`. Se só houver PDF, extraia o texto (`pdftotext -layout arquivo.pdf norma.txt`).
2. Rode:
   ```bash
   node scripts/importar-norma.mjs norma.txt --doc loas-1993 --titulo "LOAS" --norma "Lei nº 8.742, de 7 de dezembro de 1993" --ano 1993
   ```
   Isso cria `knowledge/documentos/loas-1993.md` com um trecho por artigo (ou por inciso/parágrafo, nos artigos longos). Títulos, números de página, notas "(Redação dada...)" e artigos revogados ficam de fora.
3. **Leia o `.md` ao lado do texto oficial.** O programa avisa de palavras cortadas e artigos fora de ordem, mas não confere o conteúdo.
4. `npm run build:conhecimento`, `npm test` e publique ([DEPLOY.md](DEPLOY.md)).

## Estado atual
Só um **trecho** da NOB/SUAS 2012 (arts. 8º a 17, 11 trechos). Faltam:
- o texto oficial completo da NOB/SUAS 2012;
- Tipificação Nacional de Serviços Socioassistenciais (Res. CNAS 109/2009);
- LOAS (Lei 8.742/1993) e a PNAS 2004;
- os documentos do IsesWeb.

**Copie sempre do texto oficial** (Diário Oficial ou site do Ministério). Não peça a uma IA para "lembrar" a norma: um artigo inventado aqui aparece como citação oficial para o profissional.

## Como a busca funciona (e seus limites)
Busca por palavras (BM25) com raiz simples das palavras e siglas expandidas (CadÚnico, PBF, BPC, LOAS...). Não entende sentido: "quem cuida do Bolsa Família" só acha trecho que tenha palavras parecidas. Por isso a base deve usar os termos que as pessoas digitam. Para novas siglas, acrescente em `SIGLAS` (`shared/busca.mjs`).
