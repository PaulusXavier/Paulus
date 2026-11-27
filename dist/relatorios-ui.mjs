import { bfLerFamilias, bfCompararRecorrentes, bfPrepararDivisaoTecnicos, bfPrepararRelatoriosIndividuais } from './relatorios-bf.mjs';
import { gerarPdfRelatorioIndividual } from './relatorio-individual-pdf.mjs';

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const abrir = $('rb');
  const dialogo = $('bf-report');
  if (!abrir || !dialogo) return;

  const anteriorInput = $('bf-ant');
  const atualInput = $('bf-atual');
  const anteriorEstado = $('bf-ant-status');
  const atualEstado = $('bf-atual-status');
  const estado = $('bf-status');
  const gerar = $('bf-gerar');
  const divisaoInput = $('bf-div-input');
  const divisaoEstado = $('bf-div-status');
  const divisaoGerar = $('bf-div-gerar');
  const pdfEstado = $('bf-pdf-status');
  const pdfGerar = $('bf-pdf-gerar');
  const pdfVisita = $('bf-pdf-visita');
  const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_BYTES = 5 * 1024 * 1024;
  const BORDA = { style: 'thin', color: { rgb: 'D9E0E3' } };
  const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
  const arquivos = { anterior: null, atual: null };
  let arquivoDivisao = null;
  let relatoriosPdf = null;
  let biblioteca = null;
  const bibliotecaPdf = { promise: null };
  const bibliotecaZip = { promise: null };

  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (biblioteca) return biblioteca;
    biblioteca = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./xlsx.bundle.js', import.meta.url).href;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('A biblioteca local de planilhas não iniciou.'));
      script.onerror = () => reject(new Error('Não consegui carregar o leitor local de planilhas.'));
      document.head.appendChild(script);
    }).catch((erro) => { biblioteca = null; throw erro; });
    return biblioteca;
  }

  function carregarScriptLocal(nome, pronto, estadoLocal, mensagem) {
    if (pronto()) return Promise.resolve();
    if (estadoLocal.promise) return estadoLocal.promise;
    estadoLocal.promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(`./${nome}`, import.meta.url).href;
      script.onload = () => pronto() ? resolve() : reject(new Error(mensagem));
      script.onerror = () => reject(new Error(mensagem));
      document.head.appendChild(script);
    }).catch((erro) => { estadoLocal.promise = null; throw erro; });
    return estadoLocal.promise;
  }

  function carregarJsPdf() {
    return carregarScriptLocal('jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF), bibliotecaPdf, 'Não consegui carregar a biblioteca local de PDF.');
  }

  function carregarJsZip() {
    return carregarScriptLocal('jszip.min.js', () => !!window.JSZip, bibliotecaZip, 'Não consegui carregar a biblioteca local para juntar os PDFs num ZIP.');
  }

  function mostrarResultado(slot, texto) {
    (slot === 'anterior' ? anteriorEstado : atualEstado).textContent = texto;
  }

  function actualizarBotao() {
    gerar.disabled = !(arquivos.anterior && arquivos.atual);
  }

  async function lerAbasPlanilha(file) {
    if (file.size > MAX_BYTES) throw new Error('Cada ficheiro pode ter no máximo 5 MB.');
    const XLSX = await carregarXlsx();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let workbook;
    if (ext === 'csv') {
      workbook = XLSX.read(await file.text(), { type: 'string', raw: true });
    } else if (ext === 'xlsx' || ext === 'xls') {
      workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: true });
    } else {
      throw new Error('Escolha um ficheiro .xlsx, .xls ou .csv.');
    }
    return workbook.SheetNames.map((nome) => ({
      nome,
      linhas: XLSX.utils.sheet_to_json(workbook.Sheets[nome], { header: 1, defval: '', raw: true })
    }));
  }

  async function lerPlanilha(file) {
    const abas = await lerAbasPlanilha(file);
    const dados = bfLerFamilias(abas);
    if (!dados.familias.size) throw new Error('Não encontrei famílias numa tabela de condicionalidades com a coluna “Efeito” e identificador NIS/CPF do responsável.');
    return { dados, nome: file.name };
  }

  function aplicarEstilos(XLSX, ws, aba) {
    const intervalo = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const cor = String(aba.cor || '0B2F7A').replace(/^#/, '').slice(-6).toUpperCase();
    const resumo = aba.tipo === 'resumo';
    const larguras = [];
    for (let c = intervalo.s.c; c <= intervalo.e.c; c++) {
      let max = 10;
      for (let r = intervalo.s.r; r <= intervalo.e.r; r++) {
        const celula = ws[XLSX.utils.encode_cell({ r, c })];
        if (celula && celula.v != null) max = Math.max(max, String(celula.v).length);
      }
      larguras[c] = { wch: Math.min(c === 6 || c === 9 ? 54 : 36, Math.max(11, Math.min(30, max + 2))) };
    }
    ws['!cols'] = larguras;
    if (aba.tipo === 'todas' || aba.tipo === 'tecnico' || aba.tipo === 'mudaram') {
      ws['!autofilter'] = { ref: ws['!ref'] };
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    }
    ws['!tabColor'] = { rgb: cor };
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
    for (let r = intervalo.s.r; r <= intervalo.e.r; r++) {
      for (let c = intervalo.s.c; c <= intervalo.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const celula = ws[ref] || (ws[ref] = { t: 's', v: '' });
        const cabecalho = !resumo && r === intervalo.s.r;
        const titulo = resumo && r === intervalo.s.r;
        const numero = typeof celula.v === 'number';
        celula.s = cabecalho ? {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: cor } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: BORDAS
        } : titulo ? {
          font: { name: 'Arial', sz: 11, bold: true, color: { rgb: cor } },
          fill: { patternType: 'solid', fgColor: { rgb: 'F5F3EF' } },
          alignment: { vertical: 'center', wrapText: true },
          border: BORDAS
        } : {
          font: { name: 'Arial', sz: 10, bold: resumo && c === 0, color: { rgb: '1F2937' } },
          fill: { patternType: 'solid', fgColor: { rgb: r % 2 ? 'FFFFFF' : 'F5F8F9' } },
          alignment: { horizontal: numero ? 'right' : 'left', vertical: 'center', wrapText: true },
          border: BORDAS
        };
      }
    }
  }

  function criarWorkbook(XLSX, relatorio) {
    const workbook = XLSX.utils.book_new();
    relatorio.abas.forEach((aba) => {
      const ws = XLSX.utils.aoa_to_sheet(aba.aoa);
      (aba.formulas || []).forEach((item) => {
        ws[item.celula] = { t: typeof item.v === 'number' ? 'n' : 's', f: item.f, v: item.v };
      });
      aplicarEstilos(XLSX, ws, aba);
      XLSX.utils.book_append_sheet(workbook, ws, aba.nome);
    });
    return workbook;
  }

  async function processar(slot, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    arquivos[slot] = null;
    actualizarBotao();
    mostrarResultado(slot, 'A ler apenas neste aparelho…');
    estado.textContent = '';
    input.disabled = true;
    try {
      arquivos[slot] = await lerPlanilha(file);
      const item = arquivos[slot];
      mostrarResultado(slot, `${item.dados.mes || 'Mês não identificado'} · ${item.dados.familias.size} família(s) · ${item.nome}`);
      estado.textContent = arquivos.anterior && arquivos.atual
        ? 'As duas planilhas estão prontas. Gere o Excel quando confirmar que os meses estão correctos.'
        : 'Escolha também a planilha do outro mês para comparar.';
    } catch (erro) {
      mostrarResultado(slot, erro && erro.message ? erro.message : 'Não consegui ler esta planilha.');
      estado.textContent = '';
    } finally {
      input.disabled = false;
      input.value = '';
      actualizarBotao();
    }
  }

  async function processarDivisao(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    arquivoDivisao = null;
    relatoriosPdf = null;
    divisaoGerar.disabled = true;
    pdfGerar.disabled = true;
    divisaoEstado.textContent = 'A ler e organizar apenas neste aparelho…';
    pdfEstado.textContent = 'Aguardando a divisão da planilha…';
    input.disabled = true;
    try {
      const abas = await lerAbasPlanilha(file);
      const relatorio = bfPrepararDivisaoTecnicos(abas);
      if (!relatorio.ok) throw new Error(relatorio.texto || 'Não consegui dividir esta planilha.');
      const preparados = bfPrepararRelatoriosIndividuais(relatorio.abas.map((aba) => ({ nome: aba.nome, linhas: aba.aoa })));
      if (!preparados.ok) throw new Error(preparados.texto || 'Não consegui preparar os PDFs dos técnicos.');
      arquivoDivisao = { relatorio, nome: file.name };
      relatoriosPdf = preparados.relatorios;
      divisaoEstado.textContent = `${relatorio.totalFamilias} família(s) · ${relatorio.totalRegistros} registo(s) · ${relatorio.mesRepercussao || 'mês não identificado'} · ${file.name}`;
      pdfEstado.textContent = `${relatoriosPdf.length} PDF(s) individual(is) pronto(s) · ${relatoriosPdf.reduce((soma, item) => soma + item.totalFamilias, 0)} família(s). Pode gerar sem voltar a carregar o Excel.`;
    } catch (erro) {
      divisaoEstado.textContent = erro && erro.message ? erro.message : 'Não consegui ler esta planilha.';
      pdfEstado.textContent = 'A geração de PDFs depende de uma divisão válida na etapa 2.';
    } finally {
      input.disabled = false;
      input.value = '';
      divisaoGerar.disabled = !arquivoDivisao;
      pdfGerar.disabled = !relatoriosPdf;
    }
  }

  function descarregarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function descarregar(XLSX, relatorio) {
    const bytes = XLSX.write(criarWorkbook(XLSX, relatorio), { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([bytes], { type: MIME_XLSX });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = relatorio.nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function limpar() {
    arquivos.anterior = null;
    arquivos.atual = null;
    anteriorInput.value = '';
    atualInput.value = '';
    mostrarResultado('anterior', 'Ainda não escolhida.');
    mostrarResultado('atual', 'Ainda não escolhida.');
    arquivoDivisao = null;
    divisaoInput.value = '';
    divisaoEstado.textContent = 'Ainda não escolhida.';
    divisaoGerar.disabled = true;
    relatoriosPdf = null;
    pdfEstado.textContent = 'Aguardando a divisão da planilha na etapa 2.';
    pdfGerar.disabled = true;
    estado.textContent = '';
    actualizarBotao();
  }

  abrir.addEventListener('click', () => dialogo.showModal());
  $('bf-fechar').addEventListener('click', () => dialogo.close());
  $('bf-limpar').addEventListener('click', limpar);
  anteriorInput.addEventListener('change', () => processar('anterior', anteriorInput));
  atualInput.addEventListener('change', () => processar('atual', atualInput));
  divisaoInput.addEventListener('change', () => processarDivisao(divisaoInput));
  gerar.addEventListener('click', async () => {
    if (!arquivos.anterior || !arquivos.atual) return;
    gerar.disabled = true;
    gerar.textContent = 'A preparar Excel…';
    estado.textContent = 'A comparar no aparelho; os ficheiros não são enviados.';
    try {
      const resultado = bfCompararRecorrentes(arquivos.anterior.dados, arquivos.atual.dados);
      if (!resultado.ok) throw new Error(resultado.texto || 'Não foi possível comparar as planilhas.');
      const XLSX = await carregarXlsx();
      descarregar(XLSX, resultado);
      estado.textContent = `${resultado.total} família(s) recorrente(s); ${resultado.mudaram} mudou/mudaram de técnico. Excel gerado no aparelho e descarregado.`;
    } catch (erro) {
      estado.textContent = erro && erro.message ? erro.message : 'Não consegui gerar o relatório.';
    } finally {
      gerar.textContent = 'Gerar Excel';
      actualizarBotao();
    }
  });
  divisaoGerar.addEventListener('click', async () => {
    if (!arquivoDivisao) return;
    const relatorio = arquivoDivisao.relatorio;
    divisaoGerar.disabled = true;
    divisaoGerar.textContent = 'A preparar Excel…';
    divisaoEstado.textContent = 'A criar o ficheiro no aparelho; a planilha original não é alterada nem enviada.';
    try {
      const XLSX = await carregarXlsx();
      descarregar(XLSX, relatorio);
      divisaoEstado.textContent = `${relatorio.totalFamilias} família(s) dividida(s) por ordem alfabética em três abas de técnico. Excel criado no aparelho e descarregado.`;
    } catch (erro) {
      divisaoEstado.textContent = erro && erro.message ? erro.message : 'Não consegui gerar a planilha dividida.';
    } finally {
      divisaoGerar.textContent = 'Dividir e gerar Excel';
      divisaoGerar.disabled = !arquivoDivisao;
    }
  });
  pdfGerar.addEventListener('click', async () => {
    if (!relatoriosPdf || !relatoriosPdf.length) return;
    pdfGerar.disabled = true;
    pdfGerar.textContent = 'A criar PDF(s)…';
    pdfEstado.textContent = 'A gerar os ficheiros no aparelho; os dados não são enviados nem guardados.';
    try {
      await carregarJsPdf();
      const gerados = relatoriosPdf.map((relatorio) => gerarPdfRelatorioIndividual(relatorio, {
        jsPDF: window.jspdf.jsPDF,
        incluirVisita: !!(pdfVisita && pdfVisita.checked)
      }));
      if (gerados.length === 1) {
        descarregarBlob(new Blob([gerados[0].bytes], { type: 'application/pdf' }), gerados[0].nomeArquivo);
        pdfEstado.textContent = 'PDF individual gerado e descarregado neste aparelho.';
      } else {
        await carregarJsZip();
        const zip = new window.JSZip();
        const usados = new Set();
        gerados.forEach(({ nomeArquivo, bytes }) => {
          let nome = nomeArquivo;
          let sufixo = 2;
          while (usados.has(nome)) nome = nomeArquivo.replace(/\.pdf$/i, ` (${sufixo++}).pdf`);
          usados.add(nome);
          zip.file(nome, bytes);
        });
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
        const dataArquivo = new Intl.DateTimeFormat('pt-BR').format(new Date()).replace(/\//g, '-');
        descarregarBlob(blob, `Relatorios Individuais - ${dataArquivo}.zip`);
        pdfEstado.textContent = `${gerados.length} PDFs individuais gerados localmente e descarregados num único ZIP.`;
      }
    } catch (erro) {
      pdfEstado.textContent = erro && erro.message ? erro.message : 'Não consegui gerar os PDFs individuais.';
    } finally {
      pdfGerar.textContent = 'Gerar PDF(s) individual(is)';
      pdfGerar.disabled = !relatoriosPdf;
    }
  });
  dialogo.addEventListener('close', limpar);
  actualizarBotao();
})();
