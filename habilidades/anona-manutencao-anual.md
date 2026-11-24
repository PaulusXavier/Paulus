---
id: anona-manutencao-anual
nome: Anona — manutenção para quem mantém o app (ano novo, valores, firebase, versão)
quando: atualização anual anona; cadastrar 2027 no anona; calendarios_por_ano; valores do benefício anona editar; cronograma de repercussão novo ano; firebaseconfig anona; sw.js cache anona; calendário escolar anona editar; publicar anona github pages; firestore rules anona
apps: anona
---
- Quem mantém o app edita o index.html (arquivo único). Dados anuais ficam juntos: CALENDARIOS_POR_ANO (monthHighlights, officialEvents por data AAAA-MM-DD e paymentCalendar com 10 números por mês, na ordem dos finais de NIS 1 a 9 e 0), CRONOGRAMAS_REPERCUSSAO_POR_ANO, VALORES_BENEFICIO_POR_ANO e CALENDARIOS_ESCOLARES_POR_ANO.
- Regra de ouro: ADICIONE o ano novo, sem apagar os anteriores e sem pular anos. O mais recente vira o vigente e atualiza título, tela de entrada, cabeçalho e rodapé. Dados oficiais vêm do calendário MDS/Caixa, dos comunicados de condicionalidades e das portarias da Semec e Seed; nunca invento data.
- Reajuste de valores: edite só VALORES_BENEFICIO_POR_ANO; o cartão, o exemplo de cálculo e o mascote leem de lá. Prazos novos do mascote entram em MOMENTOS e expiram sozinhos.
- Firebase: criar projeto, ativar Authentication (e-mail/senha) e Firestore (modo produção, região de São Paulo), colar o firebaseConfig no index.html e publicar o firestore.rules (inclui a subcoleção de rotas). Sem publicar as regras, "Salvar rota" dá erro de permissão.
- Publicação: GitHub Pages pela branch principal, arquivos soltos na raiz (ícones icon-192.png, icon-512.png e apple-touch-icon.png com esses nomes exatos). A pasta vendor precisa subir junto (pdf.js, jsPDF, pdf-lib, xlsx, Leaflet, OCR); se faltar, folhas de família não são lidas.
- Versão: suba o número de CACHE_NAME no sw.js quando mudar ícones ou o comportamento do service worker. Textos e calendário atualizam sozinhos.
- Paulus: o texto do Anona fica em worker/apps.mjs e os roteiros anona-* em habilidades/; publique o Worker de novo depois de mudar. O app tem testes em tests/ (node tests/mascot.test.js etc.).
- Se a mudança for no app, ensino o passo a passo, mas a edição é feita no repositório.
