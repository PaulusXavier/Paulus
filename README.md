# Paulus

Copiloto de IA compartilhado pelos apps (Argo SUAS, Anona, Toth, Umbrella). Em cada app ele aparece com o rosto do mascote daquele app.

**O que faz:** responde dúvidas de uso e do SUAS, abre telas, busca coisas dentro do app e cita a norma de onde tirou a resposta (artigo e documento).

**O que não faz:** não guarda dado de família, não lê planilha nem registro dos apps e não decide caso individual.

```
app (navegador)                            Worker (Cloudflare)             Workers AI
 ├─ paulus.v1.js  ──── só pergunta filtrada, ─────▶ filtra de novo,  ─────▶ modelo
 │    ├ filtro de dados pessoais            histórico curto e                (gratuito)
 │    ├ socorro (telefones, offline)        fichas PÚBLICAS                  
 │    ├ ações e buscas do app (local)       ◀──── texto em streaming + fontes
 │    └ base de normas (offline)            busca as normas na PRÓPRIA base
 └─ mascote (rosto)                         não grava nada
```

## Estrutura

| Pasta | O que tem |
|---|---|
| `shared/` | filtro de dados pessoais, detector de socorro e busca nas normas (usados no navegador **e** no Worker) |
| `client/` | módulo do navegador (`paulus.mjs`) e as "peles" de cada app (`skins.mjs`) |
| `worker/` | o Worker: `handler.mjs` (lógica), `prompt.mjs`, `apps.mjs` (um bloco por app) |
| `knowledge/` | base de normas: `documentos/*.md` → `conhecimento.json` |
| `scripts/` | `build.mjs` (gera `dist/paulus.v1.js`) e `build-knowledge.mjs` |
| `tests/` | testes (`npm test`), sem dependências |
| `docs/` | arquitetura, segurança, integração, conhecimento e deploy |

## Começar

```bash
npm test                  # roda todos os testes
npm run build:conhecimento
npm run build             # gera dist/paulus.v1.js e dist/conhecimento.json
```

Não há dependências para instalar. Precisa de Node 20 ou mais novo.

Para publicar, siga [docs/DEPLOY.md](docs/DEPLOY.md). Para ligar a um app, [docs/INTEGRACAO.md](docs/INTEGRACAO.md). Outros documentos: [ARQUITETURA](docs/ARQUITETURA.md), [SEGURANCA](docs/SEGURANCA.md), [CONHECIMENTO](docs/CONHECIMENTO.md).

## Uso no app (resumo)

```html
<script src="https://SEU-USUARIO.github.io/paulus/paulus.v1.js"></script>
<script>
  Paulus.init({
    app: 'anona',
    endpoint: 'https://paulus-ia.SEU-NOME.workers.dev',
    conhecimentoUrl: 'https://SEU-USUARIO.github.io/paulus/conhecimento.json',
    fichas: (texto, aba) => []   // só dados PÚBLICOS (ex.: diretório de unidades)
  });
  Paulus.registrarAcao({ id: 'calendario', rotulos: ['calendário', 'calendario pbf'], executar: () => abrirAba('calendario') });
  Paulus.perguntar('quem gere o Cadastro Único no município?', { onToken: (t, tudo) => mostrar(tudo) })
    .then(r => mostrarResultado(r));   // r.tipo: ia | norma | busca | acao | crise | bloqueio | sem_resposta | erro
</script>
```

## Estado atual

- Base de normas: só um **trecho** da NOB/SUAS 2012 (arts. 8º a 17). Faltam o texto oficial completo, a Tipificação Nacional, a PNAS e os documentos do IsesWeb. Veja [docs/CONHECIMENTO.md](docs/CONHECIMENTO.md).
- O módulo é **sem tela**: o chat de cada app continua sendo o painel do mascote. **Argo SUAS já está ligado**; faltam Anona, Toth e Umbrella (passo a passo em [docs/INTEGRACAO.md](docs/INTEGRACAO.md)).
- Os textos de `worker/apps.mjs` para Anona, Toth e Umbrella foram escritos sem ler o código desses apps. Revise.
