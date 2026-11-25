# DSM-5-TR no Paulus: guia compacto na base, texto completo só offline

## O que está na base

`knowledge/documentos/dsm5tr-guia-apoio.md` (26 KB, 42 seções de até ~700 caracteres, que é o máximo que a IA recebe por trecho): organização do manual, regras gerais, DSM x CID-11 e, por quadro, código CID-10-MC (conferido no sumário do PDF), núcleo, limiar de tempo e de quantidade de sintomas e diagnóstico diferencial. É texto próprio, não cópia dos critérios. Vai para o Worker e para o pacote `psicologia`.
O roteiro `habilidades/psicopatologia-dsm-consulta.md` ensina o Paulus a usar o guia e a não diagnosticar pessoa real.
Está `revisao: pendente`: compare os limiares com o manual e rode `npm run conferir -- dsm5tr-guia-apoio --conferido`.

## Texto completo do DSM: como caber na cota

Medido com o PDF enviado (`worker-base.json` comprimido; hoje a base sem DSM comprime a 1,74 MB e o limite gratuito da Cloudflare é 3 MB, para o Worker inteiro):

| O que entra | Total comprimido | Custo do DSM |
|---|---|---|
| Importador padrão (`importar-documento`), texto inteiro | 2,53 MB | +0,79 MB (5.093 trechos, títulos "trecho N", sem busca boa) |
| `importar-dsm` com `criterios,diferencial` | 1,99 MB | +0,25 MB (159 transtornos, 1.956 trechos) |
| `importar-dsm` com `criterios,diferencial,diagnosticas` | 2,14 MB | +0,40 MB (2.947 trechos) |

O Worker só recebe 700 caracteres por trecho, então o script corta cada trecho em até 680, por transtorno e por seção (título com nome e código, ex.: "Esquizofrenia F20.9 · Critérios"), e descarta prevalência, curso, fatores de risco, cultura etc. Isso melhora a busca e a cota ao mesmo tempo.

```bash
node scripts/importar-dsm.mjs dsm5tr.txt --secoes criterios,diferencial            # offline (worker: nao)
node scripts/importar-dsm.mjs dsm5tr.txt --secoes criterios,diferencial --worker   # vai para o Worker
```

Opções de seção: `criterios, diferencial, diagnosticas, comorbidade, curso, prevalencia, associadas, risco, cultura, genero, marcadores, consequencias`.
O guia compacto `dsm5tr-guia-apoio` continua sendo a camada leve e em palavras próprias; o texto completo é a camada de consulta.

## Direitos autorais (leia antes de usar `--worker`)

O DSM-5-TR é obra protegida e o repositório publica `dist/` (GitHub Pages). A regra da base é "só documentos públicos e oficiais". O script gera `worker: nao` por padrão e o arquivo não deve ir para repositório aberto. Só use `--worker` se o Worker e o repositório forem privados e você tiver direito de uso.
