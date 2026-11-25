# Modelos 3D didáticos (v0.20.0; mapa de Roraima em v0.21.0)

> **Uso individual, sem fins comerciais.** O Paulus é um projeto pessoal de Paulo Xavier e **só ele o usa**. Não é um serviço oferecido ao público nem vendido; o repositório é público apenas por conveniência de publicação. Veja [USO-INDIVIDUAL.md](../USO-INDIVIDUAL.md).

## O que existe
`modelos/sistema-solar-3d-didatico-v6.html`: Sistema Solar 3D · Edição Didática, um arquivo único (HTML, CSS e JavaScript juntos, sem internet e sem biblioteca externa). Foi enviado pelo usuário e é mantido **idêntico ao original**; nomes como Vénus, Neptuno e hidrogénio estão na grafia de Portugal, e a resposta do Paulus avisa isso.

## Mapa 3D de Roraima (v0.21.0)
`modelos/mapa-roraima-3d-didatico-v1.html`: Roraima 3D · Edição Didática, também um arquivo único, sem biblioteca e sem rede (o desenho 3D é feito em canvas, com projeção própria). Mostra os 15 municípios em relevo; a **altura e a cor** seguem população, área, densidade ou % indígena (botões do alto). Traz ficha de cada município, ranking, seis lições guiadas, perguntas e um jogo de achar o município no mapa. Funciona com mouse, toque (arrastar gira, pinça dá zoom) e teclado (setas, + e -).

**Origem dos dados.** População (Censo 2022), área oficial e % indígena vêm do Argo (`assets/municipios-rr.json`), copiados para `scripts/modelos/mapa-roraima.dados.json`. Contornos: IBGE, via [geodata-br](https://github.com/tbrugz/geodata-br) (CC0). A densidade é calculada (população ÷ área). Onde o Argo não traz a área, usa-se a área calculada do contorno, marcada com "≈". Município sem dado de % indígena fica cinza (sem dado não é zero).

**Gerar de novo** (quando os dados do Argo mudarem):
```bash
curl -o mun.json https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-14-mun.json
npm run montar:mapa-roraima -- mun.json
```
O gabarito é `scripts/modelos/mapa-roraima.modelo.html` (marcador `/*__DADOS__*/null`); o script simplifica os contornos, calcula as áreas e escreve em `modelos/`. Para **outro estado**, troque o GeoJSON e a tabela de dados; o Paulus não monta o arquivo sozinho (escreve dados e roteiro; o ajuste do código se faz no Claude, no chat).

**Pedido.** "Mapa 3D de Roraima", "maquete 3D dos municípios", "faça um mapa 3D de Roraima como o do sistema solar" entregam o mapa. Mapa 3D de outro lugar entrega o mapa como base e explica o que trocar. Perguntas de ajuda ("como fazer um mapa 3D", "dados do mapa 3D") vão para a IA com a habilidade `modelo-3d-mapa-roraima`.

## Como o Paulus entrega
1. A pessoa escreve "me manda o modelo 3D do sistema solar" (ou "quero um simulador 3D", "modelo didático 3D").
2. `shared/modelos.mjs` reconhece o pedido **no aparelho**, sem IA e sem rede, e devolve `{ tipo: 'modelo', modelo, arquivos: [{ nome, rotulo, url }] }`.
3. O console mostra "Baixar" (`Paulus.modelos.baixar(modelo)`) e "Abrir agora". Em um app, use `Paulus.init({ modelosUrl: 'https://.../modelos/' })` se a pasta não ficar ao lado da página.
4. O `npm run build` copia `modelos/*.html` para `dist/modelos/`.

Não é pedido de modelo (segue o fluxo normal): "modelo de ofício", "modelo didático de PAF", "quantos planetas tem o sistema solar?". Pedido de **ajuda** com modelo 3D (dados, campos, lições, quiz, roteiro, adaptar, trocar, revisar, como...) também vai para a IA, com as habilidades `modelo-3d-didatico*`.

## Por que a IA não escreve o arquivo
O arquivo-base tem cerca de 3.700 linhas. O modelo de IA gratuito do Worker tem limite de resposta e não reproduz esse volume sem erro. Por isso: base pronta no aparelho; a IA escreve **dados e roteiro** (curtos); o arquivo completo de um tema sem órbita é montado no Claude, no chat, com a base anexada.

## O que muda no arquivo-base para outro tema
O conteúdo está em cinco listas no começo do script: `THEMES`, `BODIES`, `LESSONS`, `QUIZ_QUESTIONS`, `MOONS` (campos em `habilidades/modelo-3d-didatico-dados.md`). **Trocar só as listas não basta:** o código assume ids fixos (`sun` como centro, `earth` na telemetria e na comparação de tamanhos, `earth` e `mars` nas lições, `pluto` com órbita inclinada) e traz o cometa Halley, os cinturões, a zona habitável e a telemetria em UA. O motor de desenho (projeção, órbitas, rastros, painel, laboratório) é reaproveitável, mas esses trechos precisam de ajuste no código. Por isso o Paulus escreve dados e roteiro, e o ajuste do código se faz no Claude.

## Como acrescentar um modelo novo ao catálogo
1. Coloque o `.html` em `modelos/` (nome em minúsculas, números e hífen).
2. Acrescente a entrada em `MODELOS_3D` (`shared/modelos.mjs`): `id`, `nome`, `versao`, `arquivo`, `resumo`, `recursos`, `assuntos`.
3. `lerPedidoDeModelo` escolhe o modelo pelo assunto do pedido: mapa ou Roraima entrega o mapa; o resto, o Sistema Solar. Para um terceiro modelo, acrescente a regra de escolha ali.
4. `npm test` confere: arquivo existe, sem recurso externo nem chamada de rede, listas ligadas entre si (para o Sistema Solar) e cópia no `dist/`.
