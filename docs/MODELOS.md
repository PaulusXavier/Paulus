# Modelos 3D didáticos (v0.20.0)

## O que existe
`modelos/sistema-solar-3d-didatico-v6.html`: Sistema Solar 3D · Edição Didática, um arquivo único (HTML, CSS e JavaScript juntos, sem internet e sem biblioteca externa). Foi enviado pelo usuário e é mantido **idêntico ao original**; nomes como Vénus, Neptuno e hidrogénio estão na grafia de Portugal, e a resposta do Paulus avisa isso.

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
3. Hoje `lerPedidoDeModelo` escolhe sempre o primeiro modelo; para mais de um, escolha pelo `assuntos` antes de devolver.
4. `npm test` confere: arquivo existe, sem recurso externo nem chamada de rede, listas ligadas entre si (para o Sistema Solar) e cópia no `dist/`.
