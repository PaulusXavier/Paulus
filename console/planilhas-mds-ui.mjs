// Etapa 7 da janela "Relatórios locais": planilhas do MDS (Repercussão de Condicionalidades) guardadas neste aparelho.
// Organiza a planilha bruta por técnico, guarda uma cópia no IndexedDB DESTE navegador (não vai à nuvem nem à IA),
// filtra por bairro, gera os PDFs individuais dos técnicos gerais e faz backup/restauração em JSON (o mesmo formato do Anona).
// A lógica está em shared/planilhas-mds.mjs (testada); aqui só entram tela, XLSX, IndexedDB e download.
import {
  MESES_NOMES, MAX_BYTES_PLANILHA,
  descobrirMesAno, organizarRepercussao, bairrosDaPlanilha, filtrarPorBairros, montarAbasPlanilha, gruposDeOrganizada, dadosDeFiltrada,
  nomeArquivoOrganizada, nomeArquivoFiltrada, nomeArquivoBackup, criarBackup, lerBackup, resumoArmazenamento, prepararRelatoriosTecnicosGerais
} from './planilhas-mds.mjs';
import { gerarPdfRelatorioIndividual } from './relatorio-individual-pdf.mjs';

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const dialogo = $('bf-report');
  const entrada = $('mds-input');
  if (!dialogo || !entrada) return;

  const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_BACKUP_BYTES = 60 * 1024 * 1024;
  const lista = $('mds-lista');
  const bairrosEl = $('mds-bairros');
  const info = $('mds-info');
  const status = $('mds-status');
  const armaz = $('mds-armaz');
  const BORDA = { style: 'thin', color: { rgb: 'D9E0E3' } };
  const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
  let guardadas = [];
  let ocupado = false;
  const bibliotecas = {};

  // ---------------------------------------------------------------- bibliotecas locais (carregadas sob demanda)
  function carregarScript(nome, pronto, mensagem) {
    if (pronto()) return Promise.resolve();
    if (bibliotecas[nome]) return bibliotecas[nome];
    bibliotecas[nome] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL(`./${nome}`, import.meta.url).href;
      s.onload = () => pronto() ? resolve() : reject(new Error(mensagem));
      s.onerror = () => reject(new Error(mensagem));
      document.head.appendChild(s);
    }).catch((e) => { bibliotecas[nome] = null; throw e; });
    return bibliotecas[nome];
  }
  const carregarXlsx = () => carregarScript('xlsx.bundle.js', () => !!window.XLSX, 'Não consegui carregar o leitor local de planilhas.').then(() => window.XLSX);
  const carregarJsPdf = () => carregarScript('jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF), 'Não consegui carregar a biblioteca local de PDF.');
  const carregarJsZip = () => carregarScript('jszip.min.js', () => !!window.JSZip, 'Não consegui carregar a biblioteca local para juntar os PDFs num ZIP.');

  // ---------------------------------------------------------------- IndexedDB (só neste navegador)
  function abrirBanco() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('Este navegador não permite guardar planilhas (armazenamento indisponível).')); return; }
      const req = indexedDB.open('paulus-planilhas-mds', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('planilhas', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Não consegui abrir o armazenamento deste navegador.'));
    });
  }
  async function transacao(modo, fazer) {
    const db = await abrirBanco();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('planilhas', modo);
        const store = tx.objectStore('planilhas');
        let resultado;
        Promise.resolve(fazer(store)).then((r) => { resultado = r; }, reject);
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(new Error('O navegador recusou gravar (espaço cheio ou armazenamento bloqueado).'));
        tx.onabort = () => reject(new Error('O navegador recusou gravar (espaço cheio ou armazenamento bloqueado).'));
      });
    } finally { db.close(); }
  }
  const pedido = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  const lerTodas = () => transacao('readonly', (s) => pedido(s.getAll()));
  const gravar = (registros) => transacao('readwrite', (s) => { registros.forEach((r) => s.put(r)); });
  const apagar = (id) => transacao('readwrite', (s) => { s.delete(id); });
  const apagarTodas = () => transacao('readwrite', (s) => { s.clear(); });

  // ---------------------------------------------------------------- utilidades
  const mostrar = (t, erro) => { status.textContent = t; status.dataset.erro = erro ? '1' : ''; };
  function paraBase64(bytes) {
    const u = new Uint8Array(bytes);
    let bin = '';
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function deBase64(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const dataArquivo = () => new Intl.DateTimeFormat('pt-BR').format(new Date()).replace(/\//g, '-');
  const selecionada = () => guardadas.find((r) => r.id === lista.value) || null;
  const rotulo = (r) => `${MESES_NOMES[r.mes]} de ${r.ano} · ${r.filename} · ${r.sizeKB} KB`;

  async function lerAbas(file) {
    if (file.size > MAX_BYTES_PLANILHA) throw new Error('Cada ficheiro pode ter no máximo 5 MB.');
    const XLSX = await carregarXlsx();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let wb;
    if (ext === 'csv') wb = XLSX.read(await file.text(), { type: 'string', raw: true });
    else if (ext === 'xlsx' || ext === 'xls') wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: true });
    else throw new Error('Escolha um ficheiro .xlsx, .xls ou .csv.');
    return abasDoWorkbook(XLSX, wb);
  }
  const abasDoWorkbook = (XLSX, wb) => wb.SheetNames.map((nome) => ({ nome, linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true }) }));
  async function abasGuardadas(rep) {
    const XLSX = await carregarXlsx();
    return abasDoWorkbook(XLSX, XLSX.read(deBase64(rep.dataBase64), { type: 'array', raw: true }));
  }

  // ---------------------------------------------------------------- escrever o .xlsx (mesmo acabamento do Excel das etapas 1 e 2)
  function estilizar(XLSX, ws, aba) {
    const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const cor = String(aba.cor || '0B2F7A').replace(/^#/, '').toUpperCase();
    const resumo = aba.tipo === 'resumo';
    ws['!cols'] = [];
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      let max = 10;
      for (let r = ref.s.r; r <= Math.min(ref.e.r, 400); r++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && cel.v != null) max = Math.max(max, String(cel.v).length);
      }
      ws['!cols'][c] = { wch: Math.min(resumo && c === 0 ? 60 : 44, Math.max(11, max + 2)) };
    }
    if (!resumo) { ws['!autofilter'] = { ref: ws['!ref'] }; ws['!freeze'] = { xSplit: 0, ySplit: 1 }; }
    ws['!tabColor'] = { rgb: cor };
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
    const linhasResumo = resumo ? (aba.aoa || []).length : 0;
    for (let r = ref.s.r; r <= ref.e.r; r++) {
      for (let c = ref.s.c; c <= ref.e.c; c++) {
        const endereco = XLSX.utils.encode_cell({ r, c });
        const cel = ws[endereco] || (ws[endereco] = { t: 's', v: '' });
        const cabecalho = r === ref.s.r || (resumo && String(cel.v) === 'INFORMAÇÕES DO RELATÓRIO' && c === 0);
        const total = resumo && String((aba.aoa[r] || [])[0]) === 'TOTAL';
        const numero = typeof cel.v === 'number';
        cel.s = cabecalho ? {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: cor } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDAS
        } : {
          font: { name: 'Arial', sz: 10, bold: total || (resumo && c === 0 && r < linhasResumo), color: { rgb: '1F2937' } },
          fill: { patternType: 'solid', fgColor: { rgb: total ? 'E8EEF7' : (r % 2 ? 'FFFFFF' : 'F5F8F9') } },
          alignment: { horizontal: numero ? 'right' : 'left', vertical: 'center', wrapText: true }, border: BORDAS
        };
      }
    }
  }
  function bytesDoXlsx(XLSX, abas) {
    const wb = XLSX.utils.book_new();
    abas.forEach((aba) => {
      const ws = XLSX.utils.aoa_to_sheet(aba.aoa);
      (aba.formulas || []).forEach((f) => { ws[f.celula] = { t: 'n', f: f.f, v: f.v }; });
      estilizar(XLSX, ws, aba);
      XLSX.utils.book_append_sheet(wb, ws, aba.nome);
    });
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  // ---------------------------------------------------------------- tela
  function desenharLista(escolher) {
    guardadas.sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes) || (b.uploadedAt - a.uploadedAt));
    const anterior = escolher || lista.value;
    lista.textContent = '';
    const vazio = document.createElement('option');
    vazio.value = ''; vazio.textContent = guardadas.length ? 'Escolher uma planilha guardada…' : 'Nenhuma planilha guardada';
    lista.appendChild(vazio);
    guardadas.forEach((r) => { const o = document.createElement('option'); o.value = r.id; o.textContent = rotulo(r); lista.appendChild(o); });
    lista.value = guardadas.some((r) => r.id === anterior) ? anterior : '';
    armaz.textContent = resumoArmazenamento(guardadas).texto || 'Nada guardado neste aparelho.';
    atualizarSelecao();
  }
  function atualizarBotoes() {
    const tem = !!selecionada();
    ['mds-baixar', 'mds-apagar', 'mds-filtrada', 'mds-pdf'].forEach((id) => { $(id).disabled = !tem || ocupado; });
    $('mds-backup').disabled = !guardadas.length || ocupado;
    $('mds-apagar-tudo').disabled = !guardadas.length || ocupado;
  }
  async function atualizarSelecao() {
    bairrosEl.textContent = '';
    bairrosEl.disabled = true;
    const rep = selecionada();
    info.textContent = rep ? `${MESES_NOMES[rep.mes]} de ${rep.ano} · guardada em ${new Date(rep.uploadedAt).toLocaleString('pt-BR')}` : '';
    atualizarBotoes();
    if (!rep) return;
    try {
      const bairros = bairrosDaPlanilha(await abasGuardadas(rep));
      if (selecionada() !== rep) return;
      bairros.forEach((b) => { const o = document.createElement('option'); o.value = b; o.textContent = b; bairrosEl.appendChild(o); });
      bairrosEl.disabled = !bairros.length;
    } catch (e) { mostrar('Não consegui ler os bairros desta planilha.', true); }
  }
  async function comOcupado(botao, textoOcupado, fazer) {
    if (ocupado) return;
    ocupado = true; atualizarBotoes();
    const original = botao ? botao.textContent : '';
    if (botao && textoOcupado) botao.textContent = textoOcupado;
    try { await fazer(); } catch (e) { mostrar(e && e.message ? e.message : 'Não consegui concluir.', true); } finally {
      if (botao) botao.textContent = original;
      ocupado = false; atualizarBotoes();
    }
  }
  async function recarregar(escolher) {
    try { guardadas = await lerTodas(); } catch (e) { guardadas = []; mostrar(e.message, true); }
    desenharLista(escolher);
  }

  // ---------------------------------------------------------------- ações
  entrada.addEventListener('change', async () => {
    const file = entrada.files && entrada.files[0];
    entrada.value = '';
    if (!file) return;
    await comOcupado(null, '', async () => {
      mostrar('Organizando a planilha neste aparelho…');
      const abas = await lerAbas(file);
      const org = organizarRepercussao(abas);
      if (!org.ok) throw new Error(org.texto);
      const { mes, ano } = descobrirMesAno(abas, file.name);
      const montada = montarAbasPlanilha({ cabecalho: org.cabecalho, grupos: gruposDeOrganizada(org), informacoes: org.informacoes });
      const XLSX = await carregarXlsx();
      const bytes = bytesDoXlsx(XLSX, montada.abas);
      const nome = nomeArquivoOrganizada(mes, ano);
      baixar(new Blob([bytes], { type: MIME_XLSX }), nome);
      const base64 = paraBase64(bytes);
      const registro = { id: 'local_' + Date.now(), filename: nome, mes, ano, sizeKB: Math.round((base64.length * 3 / 4) / 1024), uploadedAt: Date.now(), dataBase64: base64 };
      let guardou = true;
      try { await gravar([registro]); } catch (e) { guardou = false; }
      await recarregar(guardou ? registro.id : '');
      const avisos = org.totalNaoMapeadas
        ? ` Atenção: ${org.totalNaoMapeadas} linha(s) com bairro desconhecido NÃO entraram: ${org.bairrosNaoMapeados.map((b) => `${b.bairro} (${b.qtd})`).join(', ')}. Pode ser erro de digitação na planilha.`
        : '';
      mostrar(guardou
        ? `Planilha organizada e baixada: ${nome}. Uma cópia ficou guardada só neste aparelho.${avisos}`
        : `Planilha organizada e baixada: ${nome}, mas não coube no armazenamento deste navegador: ela NÃO aparece na lista guardada.${avisos}`, !guardou || !!avisos);
    });
  });
  lista.addEventListener('change', atualizarSelecao);

  $('mds-baixar').addEventListener('click', () => {
    const rep = selecionada();
    if (rep) baixar(new Blob([deBase64(rep.dataBase64)], { type: MIME_XLSX }), rep.filename);
  });

  $('mds-apagar').addEventListener('click', () => comOcupado($('mds-apagar'), '', async () => {
    const rep = selecionada();
    if (!rep || !window.confirm('Apagar esta planilha guardada neste aparelho? Se quiser uma cópia, baixe-a ou faça o backup antes. Não dá para desfazer.')) return;
    await apagar(rep.id);
    await recarregar('');
    mostrar('Planilha apagada deste aparelho.');
  }));

  $('mds-filtrada').addEventListener('click', () => comOcupado($('mds-filtrada'), 'Gerando…', async () => {
    const rep = selecionada();
    if (!rep) return;
    const escolhidos = Array.from(bairrosEl.selectedOptions).map((o) => o.value);
    const f = filtrarPorBairros(await abasGuardadas(rep), escolhidos);
    if (!f.ok) throw new Error(f.texto);
    const XLSX = await carregarXlsx();
    const nome = nomeArquivoFiltrada(rep.filename, escolhidos);
    baixar(new Blob([bytesDoXlsx(XLSX, montarAbasPlanilha(dadosDeFiltrada(f)).abas)], { type: MIME_XLSX }), nome);
    const registros = f.grupos.reduce((t, g) => t + g.linhas.length, 0);
    mostrar(`${nome} baixada: ${registros} registro(s)${escolhidos.length ? ` de ${escolhidos.length} bairro(s)` : ' (todos os bairros)'}.`);
  }));

  $('mds-pdf').addEventListener('click', () => comOcupado($('mds-pdf'), 'Gerando PDFs…', async () => {
    const rep = selecionada();
    if (!rep) return;
    const prep = prepararRelatoriosTecnicosGerais(await abasGuardadas(rep), { mesTexto: `${MESES_NOMES[rep.mes]}/${rep.ano}` });
    if (!prep.ok) throw new Error(prep.texto);
    await carregarJsPdf();
    const gerados = prep.relatorios.map((r) => gerarPdfRelatorioIndividual(r, { jsPDF: window.jspdf.jsPDF, incluirVisita: $('mds-visita').checked }));
    const aviso = prep.semRegistros.length ? ` (${prep.semRegistros.join(', ')} sem registros, pulado(s))` : '';
    if (gerados.length === 1) {
      baixar(new Blob([gerados[0].bytes], { type: 'application/pdf' }), gerados[0].nomeArquivo);
      mostrar(`1 relatório individual gerado e baixado${aviso}. O Território Volante fica de fora: use as etapas 2 e 3.`);
      return;
    }
    await carregarJsZip();
    const zip = new window.JSZip();
    const usados = new Set();
    gerados.forEach(({ nomeArquivo, bytes }) => {
      let nome = nomeArquivo; let n = 2;
      while (usados.has(nome)) nome = nomeArquivo.replace(/\.pdf$/i, ` (${n++}).pdf`);
      usados.add(nome);
      zip.file(nome, bytes);
    });
    baixar(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } }), `Relatorios Individuais por Tecnico - ${dataArquivo()}.zip`);
    mostrar(`${gerados.length} relatórios individuais gerados e baixados num ZIP${aviso}. O Território Volante fica de fora: use as etapas 2 e 3.`);
  }));

  $('mds-backup').addEventListener('click', () => {
    if (!guardadas.length) return;
    baixar(new Blob([JSON.stringify(criarBackup(guardadas))], { type: 'application/json' }), nomeArquivoBackup(dataArquivo()));
    mostrar(`Backup baixado com ${guardadas.length} planilha(s). Ele contém NIS, CPF e nomes: guarde num lugar seguro.`);
  });

  $('mds-restaurar').addEventListener('change', async (evento) => {
    const file = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!file) return;
    await comOcupado(null, '', async () => {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Este arquivo é grande demais para ser um backup de planilhas (acima de 60 MB).');
      const lido = lerBackup(await file.text(), guardadas);
      if (!lido.ok) throw new Error(lido.texto);
      if (!lido.novos.length) { mostrar('Todas as planilhas deste backup já estão guardadas neste aparelho: nada novo para restaurar.'); return; }
      try { await gravar(lido.novos); } catch (e) { throw new Error('Não coube tudo no armazenamento deste navegador. Tente um backup menor ou apague planilhas antigas antes.'); }
      await recarregar('');
      mostrar(`${lido.novos.length} planilha(s) restaurada(s)${lido.jaExistem ? `; ${lido.jaExistem} já existia(m)` : ''}${lido.descartados ? `; ${lido.descartados} ignorada(s) por formato inválido` : ''}.`, !!lido.descartados);
    });
  });

  $('mds-apagar-tudo').addEventListener('click', () => comOcupado($('mds-apagar-tudo'), '', async () => {
    if (!guardadas.length || !window.confirm(`Apagar as ${guardadas.length} planilha(s) guardada(s) neste aparelho? Se quiser uma cópia, baixe o backup antes. Não dá para desfazer.`)) return;
    await apagarTodas();
    await recarregar('');
    mostrar('Todas as planilhas guardadas foram apagadas deste aparelho.');
  }));

  // Ao abrir a janela: lista o que já está guardado. Fechar a janela NÃO apaga as planilhas guardadas (é o propósito da etapa);
  // só limpa a escolha de bairros e a mensagem.
  $('rb').addEventListener('click', () => { recarregar(''); });
  dialogo.addEventListener('close', () => { Array.from(bairrosEl.options).forEach((o) => { o.selected = false; }); mostrar(''); });
  desenharLista('');
})();
