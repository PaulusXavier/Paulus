const MARGEM = 34;
const RODAPE = 27;
const MAX_LINHAS_CELULA = 4;
const CORES_EFEITO = {
  alerta: { fundo: [255, 239, 179], texto: [91, 59, 0], barra: [224, 166, 38] },
  bloqueio: { fundo: [255, 220, 218], texto: [126, 35, 31], barra: [213, 77, 67] },
  suspensao: { fundo: [218, 235, 255], texto: [30, 73, 132], barra: [65, 130, 200] },
  cancelamento: { fundo: [226, 229, 235], texto: [52, 64, 82], barra: [102, 116, 138] },
  outro: { fundo: [236, 241, 245], texto: [47, 58, 71], barra: [99, 124, 145] }
};

const normalizar = (valor) => String(valor == null ? '' : valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textoSeguro = (valor) => String(valor == null ? '' : valor).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/\s+/g, ' ').trim();
const num = (valor) => Math.max(0, Number(valor) || 0);

function corEfeito(efeito) {
  const chave = normalizar(efeito).replace(/[^a-z]/g, '');
  if (chave.includes('alerta')) return CORES_EFEITO.alerta;
  if (chave.includes('bloqueio')) return CORES_EFEITO.bloqueio;
  if (chave.includes('suspens')) return CORES_EFEITO.suspensao;
  if (chave.includes('cancel')) return CORES_EFEITO.cancelamento;
  return CORES_EFEITO.outro;
}

function nomeArquivoSeguro(relatorio) {
  const partes = ['Relatorio de Repercussao Individual'];
  if (relatorio.tecnico) partes.push(relatorio.tecnico);
  if (relatorio.mes && relatorio.mes !== '—') partes.push(relatorio.mes);
  const base = partes.join(' - ').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return `${base}.pdf`;
}

function formatarData() {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}

function calcularLarguras(doc, cabecalhos, larguraTotal) {
  const pesos = cabecalhos.map((cabecalho) => {
    const chave = normalizar(cabecalho);
    if (chave === 'familia') return 0.42;
    if (chave === 'visita') return 0.38;
    if (chave.includes('nis')) return 0.82;
    if (chave.includes('cpf')) return 0.8;
    if (chave.includes('nome')) return chave.includes('responsavel') || chave.includes('integrante') ? 1.28 : 1;
    if (chave === 'endereco') return 1.24;
    if (chave === 'bairro') return 0.88;
    if (chave.includes('referencia')) return 1.08;
    if (chave.includes('motivo')) return 1.02;
    if (chave === 'efeito') return 0.88;
    return 1;
  });
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  return pesos.map((peso) => larguraTotal * peso / soma);
}

function linhasCelula(doc, valor, largura, tamanhoFonte, maxLinhas = MAX_LINHAS_CELULA) {
  const texto = textoSeguro(valor);
  if (!texto) return [''];
  const linhas = doc.splitTextToSize(texto, Math.max(18, largura - 8));
  if (linhas.length <= maxLinhas) return linhas;
  const resultado = linhas.slice(0, maxLinhas);
  let ultima = String(resultado[maxLinhas - 1] || '');
  while (ultima.length > 3 && doc.getTextWidth(`${ultima}…`) > largura - 8) ultima = ultima.slice(0, -1);
  resultado[maxLinhas - 1] = `${ultima}…`;
  return resultado;
}

function desenharRodape(doc, pagina, totalPaginas, larguraPagina, alturaPagina, dataGeracao) {
  doc.setDrawColor(195, 205, 214);
  doc.setLineWidth(0.55);
  doc.line(MARGEM, alturaPagina - RODAPE, larguraPagina - MARGEM, alturaPagina - RODAPE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(91, 105, 119);
  doc.text('Documento local · confira os dados antes de usar · os ficheiros originais não são alterados', MARGEM, alturaPagina - 12);
  doc.text(`Gerado em ${dataGeracao} · Página ${pagina} de ${totalPaginas}`, larguraPagina - MARGEM, alturaPagina - 12, { align: 'right' });
}

function desenharCapa(doc, relatorio, paginaW, paginaH, dataGeracao) {
  doc.setFillColor(15, 43, 70);
  doc.rect(0, 0, paginaW, 112, 'F');
  doc.setFillColor(217, 165, 69);
  doc.rect(0, 108, paginaW, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('Relatório de Repercussão Individual', MARGEM, 43);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const linhaTecnico = [relatorio.tecnico || 'Técnico não identificado', relatorio.formacao].filter(Boolean).join(' · ');
  doc.text(textoSeguro(linhaTecnico), MARGEM, 67);
  doc.text(`Repercussão de ${textoSeguro(relatorio.mes || '—')}`, MARGEM, 86);
  doc.setFontSize(9);
  doc.text(`Gerado em ${dataGeracao}`, paginaW - MARGEM, 86, { align: 'right' });

  const yCartoes = 143;
  const gap = 16;
  const cardW = Math.min(240, (paginaW - MARGEM * 2 - gap) / 2);
  const cardH = 76;
  const desenharCartao = (x, label, valor, detalhe, cor) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(211, 220, 228);
    doc.roundedRect(x, yCartoes, cardW, cardH, 5, 5, 'FD');
    doc.setFillColor(...cor);
    doc.rect(x, yCartoes, 5, cardH, 'F');
    doc.setTextColor(66, 82, 99);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x + 17, yCartoes + 21);
    doc.setTextColor(15, 43, 70);
    doc.setFontSize(23);
    doc.text(String(valor), x + 17, yCartoes + 49);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(91, 105, 119);
    doc.text(detalhe, x + cardW - 12, yCartoes + 49, { align: 'right' });
  };
  desenharCartao(MARGEM, 'Famílias distintas', num(relatorio.totalFamilias), 'contadas uma vez', [41, 107, 137]);
  desenharCartao(MARGEM + cardW + gap, 'Total de registos', num(relatorio.totalRegistros), 'linhas da tabela', [217, 165, 69]);

  const efeitos = Array.isArray(relatorio.efeitos) ? relatorio.efeitos : [];
  const yTitulo = yCartoes + cardH + 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 43, 70);
  doc.text('Famílias por efeito', MARGEM, yTitulo);
  if (!efeitos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(91, 105, 119);
    doc.text('Não foram identificados efeitos preenchidos para resumir.', MARGEM, yTitulo + 24);
  } else {
    const max = Math.max(1, ...efeitos.map((item) => num(item.total)));
    const maxBarW = Math.min(360, paginaW * 0.39);
    const yStart = yTitulo + 20;
    const rowH = 25;
    efeitos.slice(0, 10).forEach((item, i) => {
      const y = yStart + i * rowH;
      const cor = corEfeito(item.nome);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(47, 58, 71);
      doc.text(textoSeguro(item.nome), MARGEM, y + 10);
      doc.setFillColor(238, 242, 246);
      doc.roundedRect(MARGEM + 150, y, maxBarW, 14, 3, 3, 'F');
      const w = Math.max(item.total ? 3 : 0, maxBarW * num(item.total) / max);
      if (w) {
        doc.setFillColor(...cor.barra);
        doc.roundedRect(MARGEM + 150, y, Math.min(maxBarW, w), 14, 3, 3, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(47, 58, 71);
      doc.text(String(num(item.total)), MARGEM + 160 + maxBarW, y + 10);
    });
  }

  const notaY = paginaH - RODAPE - 27;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(91, 105, 119);
  const nota = 'Esta etapa gera o resumo e a tabela por técnico no aparelho. A otimização da rota de visita será acrescentada numa etapa posterior.';
  doc.text(doc.splitTextToSize(nota, paginaW - MARGEM * 2), MARGEM, notaY);
}

function desenharCabecalhoTabela(doc, estado, relatorio, colunas, larguras, indicePagina) {
  const { paginaW } = estado;
  const margem = MARGEM;
  doc.setFillColor(15, 43, 70);
  doc.rect(0, 0, paginaW, 66, 'F');
  doc.setFillColor(217, 165, 69);
  doc.rect(0, 63, paginaW, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('Detalhamento dos registos', margem, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const tecnico = [relatorio.tecnico, relatorio.formacao].filter(Boolean).join(' · ') || 'Técnico não identificado';
  doc.text(`${textoSeguro(tecnico)} · ${textoSeguro(relatorio.mes || '—')}`, margem, 48);

  let x = margem;
  const y = 83;
  const headerH = 37;
  const tamanhoFonte = colunas.length > 9 ? 7 : 7.5;
  doc.setFillColor(232, 239, 245);
  doc.rect(margem, y, larguras.reduce((a, b) => a + b, 0), headerH, 'F');
  doc.setDrawColor(194, 207, 218);
  doc.setLineWidth(0.55);
  colunas.forEach((coluna, i) => {
    doc.rect(x, y, larguras[i], headerH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tamanhoFonte);
    doc.setTextColor(28, 51, 72);
    const linhas = linhasCelula(doc, coluna, larguras[i], tamanhoFonte, 2);
    const lineH = tamanhoFonte + 1;
    const alturaTexto = linhas.length * lineH;
    const ty = y + Math.max(11, (headerH - alturaTexto) / 2 + tamanhoFonte);
    doc.text(linhas, x + larguras[i] / 2, ty, { align: 'center' });
    x += larguras[i];
  });
  estado.y = y + headerH;
  estado.indicePagina = indicePagina;
}

function criarRelatorioPdf(relatorio, opcoes = {}) {
  const jsPDF = opcoes.jsPDF || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF);
  if (typeof jsPDF !== 'function') throw new Error('A biblioteca local de PDF não está disponível.');
  const doc = new jsPDF({ unit: 'pt', format: 'a3', orientation: 'landscape', compress: true });
  const paginaW = doc.internal.pageSize.getWidth();
  const paginaH = doc.internal.pageSize.getHeight();
  const dataGeracao = formatarData();
  const incluirVisita = opcoes.incluirVisita !== false;
  const cabecalhos = (relatorio.headers || []).map(textoSeguro);
  const linhasOriginais = Array.isArray(relatorio.rows) ? relatorio.rows : [];
  const colunas = cabecalhos.slice();
  if (incluirVisita && normalizar(colunas[0]) === 'familia') colunas.splice(1, 0, 'Visita');
  const familias = new Set(linhasOriginais.map((linha) => String(linha[0] ?? '').trim()).filter(Boolean));
  const indiceEfeito = cabecalhos.findIndex((cabecalho) => normalizar(cabecalho) === 'efeito');
  const camposFamilia = cabecalhos.map((cabecalho, i) => ({ chave: normalizar(cabecalho), indice: i }))
    .filter(({ chave }) => chave.includes('responsavel') || chave === 'endereco' || chave === 'bairro' || chave.includes('referencia'))
    .map(({ indice }) => incluirVisita && indice > 0 ? indice + 1 : indice);
  const larguras = calcularLarguras(doc, colunas, paginaW - MARGEM * 2);
  const tamanhoFonte = colunas.length > 10 ? 6.6 : colunas.length > 8 ? 7.2 : 8;
  const lineH = tamanhoFonte + 1.6;
  const estado = { paginaW, paginaH, y: 0, indicePagina: 1 };

  doc.setProperties({
    title: `Relatório de Repercussão Individual - ${textoSeguro(relatorio.tecnico || 'Técnico')}`,
    subject: `Repercussão de ${textoSeguro(relatorio.mes || '—')}`,
    author: 'Paulus',
    keywords: 'Relatório de Repercussão Individual, Bolsa Família'
  });
  desenharCapa(doc, relatorio, paginaW, paginaH, dataGeracao);
  doc.addPage();
  estado.indicePagina = 2;
  desenharCabecalhoTabela(doc, estado, relatorio, colunas, larguras, 2);

  let xPorColuna = [];
  let x = MARGEM;
  larguras.forEach((largura) => { xPorColuna.push(x); x += largura; });
  let ultimaFamilia = null;
  let zebra = false;
  for (let ri = 0; ri < linhasOriginais.length; ri++) {
    const original = linhasOriginais[ri] || [];
    const familia = String(original[0] ?? `linha-${ri + 1}`);
    const primeiraFamilia = familia !== ultimaFamilia;
    if (primeiraFamilia) zebra = !zebra;
    const linha = original.map((v) => textoSeguro(v));
    if (incluirVisita && normalizar(cabecalhos[0]) === 'familia') linha.splice(1, 0, '');
    if (!primeiraFamilia) camposFamilia.forEach((i) => { if (i < linha.length) linha[i] = ''; });

    const montarLinhasPorCelula = () => linha.map((valor, ci) => {
      if (incluirVisita && ci === 1 && normalizar(colunas[ci]) === 'visita') return [''];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(tamanhoFonte);
      return linhasCelula(doc, valor, larguras[ci], tamanhoFonte);
    });
    let linhasPorCelula = montarLinhasPorCelula();
    let maxLines = Math.max(1, ...linhasPorCelula.map((cell) => cell.length));
    let altura = Math.max(17, maxLines * lineH + 6);
    if (estado.y + altura > paginaH - RODAPE - 8) {
      doc.addPage();
      estado.indicePagina++;
      desenharCabecalhoTabela(doc, estado, relatorio, colunas, larguras, estado.indicePagina);
      if (!primeiraFamilia) {
        const deslocamentoVisita = incluirVisita && normalizar(cabecalhos[0]) === 'familia' ? 1 : 0;
        camposFamilia.forEach((i) => {
          const indiceOriginal = i - deslocamentoVisita;
          if (indiceOriginal >= 0) linha[i] = textoSeguro(original[indiceOriginal] ?? '');
        });
        linhasPorCelula = montarLinhasPorCelula();
        maxLines = Math.max(1, ...linhasPorCelula.map((cell) => cell.length));
        altura = Math.max(17, maxLines * lineH + 6);
      }
    }

    const efeito = indiceEfeito >= 0 ? original[indiceEfeito] : '';
    const efeitoCor = corEfeito(efeito);
    let cx = MARGEM;
    for (let ci = 0; ci < colunas.length; ci++) {
      const w = larguras[ci];
      const ehEfeito = normalizar(colunas[ci]) === 'efeito';
      const ehVisita = normalizar(colunas[ci]) === 'visita';
      if (ehEfeito && efeito) doc.setFillColor(...efeitoCor.fundo);
      else if (zebra) doc.setFillColor(250, 252, 253);
      else doc.setFillColor(255, 255, 255);
      doc.setDrawColor(213, 221, 228);
      doc.rect(cx, estado.y, w, altura, 'FD');

      if (ehVisita && primeiraFamilia) {
        doc.setDrawColor(83, 99, 115);
        doc.setLineWidth(0.8);
        doc.rect(cx + w / 2 - 4, estado.y + (altura - 8) / 2, 8, 8, 'S');
      } else {
        if (ehEfeito && efeito) doc.setTextColor(...efeitoCor.texto);
        else doc.setTextColor(38, 48, 60);
        doc.setFont('helvetica', ehEfeito && efeito ? 'bold' : 'normal');
        doc.setFontSize(tamanhoFonte);
        const conteudo = linhasPorCelula[ci];
        const baseY = estado.y + Math.max(tamanhoFonte + 2, (altura - conteudo.length * lineH) / 2 + tamanhoFonte + 1);
        if (['familia', 'efeito'].includes(normalizar(colunas[ci]))) {
          doc.text(conteudo, cx + w / 2, baseY, { align: 'center' });
        } else {
          doc.text(conteudo, cx + 4, baseY);
        }
      }
      cx += w;
    }
    estado.y += altura;
    ultimaFamilia = familia;
  }

  const totalPaginas = doc.internal.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    desenharRodape(doc, pagina, totalPaginas, paginaW, paginaH, dataGeracao);
  }
  const nomeArquivo = nomeArquivoSeguro(relatorio);
  return { nomeArquivo, bytes: doc.output('arraybuffer') };
}

export { criarRelatorioPdf as gerarPdfRelatorioIndividual };
