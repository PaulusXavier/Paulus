# DSM-5-TR no Paulus: guia compacto na base, texto completo só offline

## O que está na base

`knowledge/documentos/dsm5tr-guia-apoio.md` (26 KB, 42 seções de até ~700 caracteres, que é o máximo que a IA recebe por trecho): organização do manual, regras gerais, DSM x CID-11 e, por quadro, código CID-10-MC (conferido no sumário do PDF), núcleo, limiar de tempo e de quantidade de sintomas e diagnóstico diferencial. É texto próprio, não cópia dos critérios. Vai para o Worker e para o pacote `psicologia`.
O roteiro `habilidades/psicopatologia-dsm-consulta.md` ensina o Paulus a usar o guia e a não diagnosticar pessoa real.
Está `revisao: pendente`: compare os limiares com o manual e rode `npm run conferir -- dsm5tr-guia-apoio --conferido`.

## O que NÃO está na base (de propósito)

O PDF/TXT completo (~3,3 MB, 48 mil linhas). Motivos:
1. **Cota do Worker.** `worker-base.json` hoje comprime a ~1,75 MB (o guia do DSM somou só ~10 KB) e o limite gratuito da Cloudflare é 3 MB comprimido; o DSM inteiro soma ~0,87 MB comprimido.
2. **Direitos autorais.** O DSM-5-TR é obra protegida e o repositório publica `dist/` (GitHub Pages). A regra da base é "só documentos públicos e oficiais".

## Se quiser o texto completo, só no seu aparelho

Fora do Git e do Pages (não use `pacote`, que vai para `dist/`):

```bash
node scripts/importar-documento.mjs dsm5tr.txt --doc dsm5tr-completo --titulo "DSM-5-TR" \
  --norma "APA, DSM-5-TR" --ano 2022 --tipo referencia --max 900 --min 200
# depois de conferir, mova o .md para uma pasta local e mantenha fora do commit
```

Alternativa: dividir por capítulo (`--pagina-inicial`/`--pagina-final`) e carregar só o capítulo de que precisa, com `worker: nao`.
