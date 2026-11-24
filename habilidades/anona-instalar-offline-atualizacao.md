---
id: anona-instalar-offline-atualizacao
nome: Anona — instalar no celular, funcionar offline e atualizar sozinho
quando: instalar o anona; anona offline; anona sem internet; atualizar o anona; adicionar à tela inicial anona; pwa do anona; versão do anona; anona não atualiza; ícone do anona
apps: anona
---
- Instalar: abra o link do app no navegador e use "Adicionar à tela inicial" ou "Instalar app". No iPhone, o ícone próprio (apple-touch-icon) evita cantos pretos.
- Primeiro acesso precisa de internet para o aparelho guardar tudo: calendário, visual, ícones, gerador de PDF e planilha, leitor de PDF e mapa de ruas básico. Depois funciona offline: calendário, prazos, notas (guardadas no aparelho e enviadas à nuvem quando a internet voltar), exportação em PDF e calculadora.
- Uma faixa no topo avisa "sem internet" e lembra que as notas continuam sendo salvas no aparelho.
- Atualização: com internet, o app busca a versão mais nova; se a rede demorar mais de 4 segundos, mostra a cópia guardada e atualiza em segundo plano. Se uma versão nova chega com o app aberto, a tela recarrega sozinha.
- Quem mantém o app só precisa subir os arquivos ao GitHub. Para forçar todos a baixar de novo (ícones novos, mudança no service worker), aumenta-se o número de CACHE_NAME no sw.js.
- Só entram no cache respostas 200 OK; página de erro não fica guardada.
- Limites offline: entrar e criar conta, enviar rota aos outros aparelhos, busca online de endereço e leitura de OCR pela primeira vez (baixa o leitor) pedem internet. Com o mapa offline baixado, a busca e a rota funcionam sem rede.
- Se o app parece antigo: feche e abra com internet; se persistir, limpe os dados do site e entre de novo (as planilhas do passo 1 ficam só no aparelho: baixe o backup antes).
