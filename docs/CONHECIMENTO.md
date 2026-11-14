# Base de conhecimento (normas e referências técnicas)

A base de normas do Paulus são arquivos `.md` em `knowledge/documentos/`. O build os transforma em JSON (`npm run build:conhecimento`); o navegador e o Worker leem só esse JSON.

> Atenção à diferença entre as duas pastas:
> - `knowledge/documentos/` = **o que a regra diz** (norma, referência técnica, material de apoio). Começa com `doc:`.
> - `habilidades/` = **como fazer o trabalho** (roteiros). Começa com `id:`. Veja [HABILIDADES.md](HABILIDADES.md).
>
> Um roteiro dentro de `knowledge/documentos/` (ou o contrário) quebra o build com "falta `doc` no começo do arquivo". Os testes (`tests/revisao-2026-11.test.mjs`) conferem isso.

## Formato de um documento

```markdown
---
doc: nob-suas-2012                 (identificador curto: minúsculas, números e hífen; não repete)
titulo: NOB/SUAS 2012              (nome que aparece na fonte)
norma: Resolução CNAS nº 33, de 12 de dezembro de 2012
ano: 2012
tipo: norma                        (opcional: norma | referencia | apoio; padrão norma)
pacote: psicologia                 (opcional: gera conhecimento-<pacote>.json no build)
url: https://...                   (opcional: documento oficial)
worker: nao                        (opcional: fica só nos pacotes offline, fora do Worker, para poupar o limite de tamanho)
revisao: pendente                  (opcional: pendente | conferido)
---
## art. 17, XV
Texto do trecho, copiado da norma.
```

Cada `## referência` vira um trecho citável. Comentários `<!-- ... -->` são ignorados. A lista do que está carregado fica em `knowledge/catalogo.json` (versionado); `conhecimento.json`, `indice.json` e `worker-base.json` são gerados e ficam fora do Git.

## Três jeitos de trazer um documento

1. **Lei ou decreto (por artigo):** `node scripts/importar-norma.mjs norma.txt --doc loas-1993 --titulo "LOAS" --norma "Lei nº 8.742, de 7 de dezembro de 1993" --ano 1993`. Para edições da Câmara dos Deputados, limpe antes: `node scripts/limpar-camara.mjs bruto.txt limpo.txt`.
2. **Referência técnica, cartilha ou resolução longa (por capítulos):** `pdftotext arquivo.pdf arquivo.txt` e depois `node scripts/importar-documento.mjs arquivo.txt --doc ... --titulo ... --norma ... --ano ... --tipo referencia --pacote psicologia`. Opções úteis: `--pagina-inicial`, `--pagina-final`, `--deslocamento`, `--max`, `--min`, `--sem-titulos`, `--sem-paginas`, `--forcar`.
3. **Em lote (vários PDFs):** ponha os PDFs em `knowledge/entrada/`, descreva cada um em `knowledge/entrada/manifesto.json` (modelo em `manifesto.exemplo.json`; passo a passo em `knowledge/entrada/LEIA-ME.md`) e rode `npm run ingerir`. Para ver o que há em cada PDF antes: `npm run inspecionar -- knowledge/entrada --rascunho`.

Também dá para mandar os PDFs numa conversa com o Claude: [ALIMENTAR-PELO-CLAUDE.md](ALIMENTAR-PELO-CLAUDE.md).

## Conferência (obrigatória antes de confiar)

Os importadores escrevem `revisao: pendente`: eles **não conferem o conteúdo**. Compare com o documento oficial:

```bash
npm run conferir -- cfp-ref-cras              # mostra 8 trechos espalhados, com a página citada
npm run conferir -- cfp-ref-cras --quantos 12
npm run conferir -- cfp-ref-cras --conferido  # estando certo, troca para "revisao: conferido"
```

O build lista como `ATENÇÃO` tudo o que ainda está pendente. O Paulus só cita artigo que esteja nas fontes lidas e avisa quando a IA cita algo de fora.

## Depois de mudar a base

```bash
npm run build:conhecimento   # gera os JSON e o catálogo
npm test                     # o pretest já refaz o build
npm run build                # gera dist/
```

Cuidados: só documentos públicos e oficiais, **nada com dado de pessoa**; PDF escaneado precisa de OCR antes; o que não está no PDF não entra na base. Documentos muito grandes que o Worker não precisa levam `worker: nao` (o pacote do Worker precisa caber no limite do plano gratuito da Cloudflare).


## Mapa de Boa Vista (OpenStreetMap)

`node scripts/importar-mapa.mjs overpass-lugares.json` gera `knowledge/documentos/mapa-boa-vista-osm.md` (escolas, saúde, assistência social, segurança, órgãos públicos, templos etc., por bairro, com resumo e contagem). A consulta Overpass para colar em overpass-turbo.eu está no cabeçalho do script; exporte como JSON bruto. Depois rode `npm run build:conhecimento`.

Por que OpenStreetMap e não Google Maps: o Google não permite copiar o mapa em massa e a página dele não entrega a lista de lugares sem JavaScript e chave de API. O OSM é aberto (ODbL) e o documento cita a fonte. É colaborativo e incompleto, por isso sai `revisao: pendente` e `worker: nao` (só nos pacotes offline); endereço e telefone de serviço oficial continuam vindo do diretório do Argo.
