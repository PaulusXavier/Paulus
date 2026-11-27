// Etapa 6 da janela "Relatórios locais": Rota de Visita (Unificar Folhas de Família).
// Tudo no aparelho: o pdf.js lê só o quadro do endereço (rua, número, bairro) de cada folha; folhas escaneadas passam por OCR local
// (tesseract.js, opcional). Nada é enviado à rede ou à IA. Só o aprendizado de ruas vizinhas (nomes de rua, nunca número, nome ou arquivo)
// fica no localStorage deste aparelho, e pode ser apagado ali mesmo.
import {
  ROTA_BLOCOS, ROTA_MAX_ARQUIVOS, ROTA_MAX_BYTES, ROTA_PARTIDA, aprenderAjuste, enderecoDasPaginas, enderecoDoOcr,
  montarPdfRota, motivoRejeicaoRota, nomeArquivoRota, ordenarBloco
} from './rota-folhas.mjs';
import { resumoVizinhanca } from './visitas.mjs';

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const raiz = $('rv-lista');
  const dialogo = $('bf-report');
  if (!raiz || !dialogo) return;

  const status = $('rv-status');
  const total = $('rv-total');
  const manter = $('rv-manter');
  const aprendido = $('rv-aprendido');
  const botaoOrganizar = $('rv-organizar');
  const botaoGerar = $('rv-gerar');
  const botaoApagar = $('rv-apagar');
  const CHAVE_VIZ = 'paulusVizinhancaRuas';
  const TEMPO_OCR_MS = 120000;
  const listas = ROTA_BLOCOS.map(() => []);
  const ajustadoAMao = ROTA_BLOCOS.map(() => false);
  const explicacoes = ROTA_BLOCOS.map(() => '');
  let proximoId = 1;
  let promessaPdfJs = null;
  let promessaOcrLib = null;
  let promessaOcrWorker = null;

  const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
  const temTexto = (v) => String(v == null ? '' : v).trim() !== '';

  function el(tag, atributos, filhos) {
    const e = document.createElement(tag);
    Object.entries(atributos || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else e.setAttribute(k, v); });
    (filhos || []).forEach((f) => e.appendChild(f));
    return e;
  }

  // ------------------------------------------------------------ vizinhança aprendida (só nomes de rua)
  function lerViz() {
    try { const v = JSON.parse(localStorage.getItem(CHAVE_VIZ) || 'null'); return v && typeof v === 'object' && v.pares ? v : null; } catch (e) { return null; }
  }
  function guardarViz(v) { try { localStorage.setItem(CHAVE_VIZ, JSON.stringify(v)); } catch (e) { /* sem armazenamento: só não aprende */ } }
  function textoAprendido() {
    const r = resumoVizinhanca(lerViz());
    aprendido.textContent = r.ligacoes
      ? `Aprendido dos seus ajustes: ${r.ligacoes} ligação(ões) entre ${r.ruas} ruas (só nomes de rua, neste aparelho).`
      : 'Ainda não aprendi nada dos seus ajustes de ordem.';
    botaoApagar.disabled = !r.ligacoes;
  }

  // ------------------------------------------------------------ leitura do PDF (pdf.js) e OCR local
  function carregarPdfJs() {
    if (promessaPdfJs) return promessaPdfJs;
    promessaPdfJs = import('./pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', import.meta.url).href;
      return m;
    }).catch(() => { promessaPdfJs = null; throw new Error('Não consegui carregar o leitor de PDF.'); });
    return promessaPdfJs;
  }

  function carregarOcr() {
    if (promessaOcrWorker) return promessaOcrWorker;
    promessaOcrWorker = (async () => {
      if (!window.Tesseract) {
        promessaOcrLib = promessaOcrLib || new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = new URL('./tesseract/tesseract.min.js', import.meta.url).href;
          s.onload = resolve;
          s.onerror = () => { promessaOcrLib = null; reject(new Error('Leitor de imagem (OCR) indisponível: falta a pasta tesseract no app.')); };
          document.head.appendChild(s);
        });
        await promessaOcrLib;
      }
      const base = new URL('./tesseract/', import.meta.url).href; // tudo local: nenhum CDN, nada sai do aparelho
      const w = await window.Tesseract.createWorker('por', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', workerBlobURL: false, gzip: true });
      await w.setParameters({ tessedit_pageseg_mode: '6' }); // bloco único de texto: o quadro "Endereço da família"
      return w;
    })();
    promessaOcrWorker.catch(() => { promessaOcrWorker = null; });
    return promessaOcrWorker;
  }

  async function encerrarOcr() {
    const p = promessaOcrWorker; promessaOcrWorker = null;
    if (p) { try { (await p).terminate(); } catch (e) { /* já encerrado */ } }
  }

  // Desenha a página 1 e lê SÓ a faixa do quadro "II - Endereço da família" (topo); se não achar, tenta a página inteira.
  async function lerOcr(doc) {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2.2 });
    const cheio = document.createElement('canvas');
    cheio.width = Math.ceil(vp.width); cheio.height = Math.ceil(vp.height);
    await page.render({ canvasContext: cheio.getContext('2d'), viewport: vp }).promise;
    const worker = await carregarOcr();
    for (const [de, ate] of [[0.08, 0.34], [0, 1]]) {
      const h = Math.round(cheio.height * (ate - de));
      const c = document.createElement('canvas');
      c.width = cheio.width; c.height = h;
      c.getContext('2d').drawImage(cheio, 0, Math.round(cheio.height * de), cheio.width, h, 0, 0, cheio.width, h);
      const { data } = await worker.recognize(c);
      const achou = enderecoDoOcr(data && data.text);
      if (achou) return achou;
    }
    return null;
  }

  async function lerEndereco(item) {
    const pdfjs = await carregarPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await item.file.arrayBuffer()), isEvalSupported: false, enableXfa: false }).promise;
    try {
      const paginas = [];
      for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
        const page = await doc.getPage(n);
        paginas.push((await page.getTextContent()).items);
        const achou = enderecoDasPaginas(paginas);
        if (achou) return achou;
      }
      item.status = 'ocr';
      atualizarItem(item);
      // Limite de tempo: se o OCR não carregar, a folha vai para "digite o endereço" em vez de travar o botão.
      return await Promise.race([lerOcr(doc), new Promise((_, rej) => setTimeout(() => rej(new Error('OCR demorou demais')), TEMPO_OCR_MS))]);
    } finally { try { doc.destroy(); } catch (e) { /* ok */ } }
  }

  function iniciarLeitura(item) {
    item.status = 'lendo';
    item.leitura = (async () => {
      try {
        const achou = await lerEndereco(item);
        if (item.status === 'manual') return; // a pessoa digitou enquanto lia: vale o que ela digitou
        if (achou) { item.endereco = achou.texto; item.via = achou.via; item.status = 'ok'; } else item.status = 'nao';
      } catch (e) {
        if (item.status !== 'manual') item.status = 'erro';
        if (/OCR|leitor de imagem/i.test(String(e && e.message))) encerrarOcr();
      }
      atualizarItem(item);
    })();
    return item.leitura;
  }

  const textoStatus = (item) => ({
    lendo: 'Lendo o endereço do PDF…',
    ocr: 'Folha escaneada (imagem): lendo o endereço por OCR no seu aparelho… pode levar alguns segundos.',
    ok: item.via === 'ocr' ? 'Endereço lido da imagem da folha (OCR) — confira com atenção.' : 'Endereço lido do PDF — confira.',
    nao: 'Não achei o endereço neste PDF — digite rua e número.',
    erro: 'Não consegui ler este PDF (leitor indisponível ou arquivo protegido) — digite rua e número.',
    manual: ''
  })[item.status] || '';

  // ------------------------------------------------------------ totais e desenho
  function totais() {
    let arquivos = 0; let bytes = 0;
    listas.forEach((l) => l.forEach((i) => { arquivos += 1; bytes += i.file.size; }));
    return { arquivos, bytes };
  }

  function atualizarItem(item) {
    const campo = raiz.querySelector(`input[data-uid="${item.id}"]`);
    if (campo && document.activeElement !== campo) campo.value = item.endereco || '';
    const linha = raiz.querySelector(`[data-ustatus="${item.id}"]`);
    if (!linha) return;
    linha.textContent = textoStatus(item);
    if (item.status === 'nao' || item.status === 'erro') {
      const b = el('button', { type: 'button', text: 'Tentar de novo' });
      b.addEventListener('click', () => reler(item.id));
      linha.appendChild(document.createTextNode(' '));
      linha.appendChild(b);
    }
  }

  function desenhar() {
    raiz.textContent = '';
    ROTA_BLOCOS.forEach((bloco, b) => {
      const lista = listas[b];
      const caixa = el('div', { class: 'ab-abrigo' });
      caixa.appendChild(el('h4', { text: `${bloco.label} · ${lista.length}` }));
      const idCampo = `rv-in-${b}`;
      caixa.appendChild(el('label', { for: idCampo, text: 'Folhas resumo (PDF)' }));
      const entrada = el('input', { id: idCampo, type: 'file', accept: '.pdf,application/pdf', multiple: '' });
      entrada.addEventListener('change', () => adicionar(b, entrada));
      caixa.appendChild(entrada);
      if (lista.length) {
        const ol = el('ol', { class: 'ab-arquivos rv-itens' });
        lista.forEach((item, i) => {
          const li = el('li');
          const topo = el('div', { class: 'rv-topo' });
          topo.appendChild(el('span', { class: 'ab-nome', text: `${item.file.name} · ${mb(item.file.size)} MB` }));
          [['↑', 'Mover para cima', -1], ['↓', 'Mover para baixo', 1]].forEach(([t, rotulo, d]) => {
            const bt = el('button', { type: 'button', 'aria-label': rotulo, title: rotulo, text: t });
            bt.disabled = i + d < 0 || i + d >= lista.length;
            bt.addEventListener('click', () => { [lista[i], lista[i + d]] = [lista[i + d], lista[i]]; ajustadoAMao[b] = true; desenhar(); });
            topo.appendChild(bt);
          });
          const rem = el('button', { type: 'button', 'aria-label': 'Remover arquivo', title: 'Remover arquivo', text: '×' });
          rem.addEventListener('click', () => { item.cancelado = true; lista.splice(i, 1); desenhar(); });
          topo.appendChild(rem);
          li.appendChild(topo);
          const campo = el('input', { type: 'text', 'data-uid': String(item.id), value: item.endereco || '', placeholder: 'Rua e número (lido do PDF; edite se precisar)', 'aria-label': `Endereço de ${item.file.name}` });
          campo.addEventListener('input', () => { item.endereco = campo.value; item.status = 'manual'; });
          li.appendChild(campo);
          li.appendChild(el('p', { class: 'rv-st', 'data-ustatus': String(item.id) }));
          ol.appendChild(li);
        });
        caixa.appendChild(ol);
        const sugerir = el('button', { type: 'button', class: 'ab-gerar', text: 'Sugerir ordem de visita deste bloco' });
        sugerir.addEventListener('click', () => sugerirBloco(b, sugerir));
        caixa.appendChild(sugerir);
      }
      if (explicacoes[b]) caixa.appendChild(el('p', { class: 'rv-expl', text: explicacoes[b] }));
      raiz.appendChild(caixa);
    });
    listas.forEach((l) => l.forEach(atualizarItem));
    const t = totais();
    total.textContent = `${t.arquivos}/${ROTA_MAX_ARQUIVOS} arquivos · ${mb(t.bytes)} MB de ${ROTA_MAX_BYTES / (1024 * 1024)} MB`;
    total.dataset.cheio = t.arquivos >= ROTA_MAX_ARQUIVOS || t.bytes >= ROTA_MAX_BYTES ? '1' : '';
    botaoOrganizar.disabled = !t.arquivos;
    botaoGerar.disabled = !t.arquivos;
    textoAprendido();
  }

  // ------------------------------------------------------------ ordem
  const esperarLeituras = () => Promise.all(listas.flat().map((i) => i.leitura).filter(Boolean));

  // Ordena UM bloco; devolve um aviso se algo ficou de fora.
  function ordenar(b) {
    const comEndereco = listas[b].filter((i) => temTexto(i.endereco));
    if (comEndereco.length < 2) return `${ROTA_BLOCOS[b].label}: preciso do endereço de pelo menos duas famílias para sugerir a ordem. Digite o que faltar.`;
    const r = ordenarBloco(listas[b], { vizinhanca: lerViz() });
    listas[b] = r.itens;
    explicacoes[b] = r.explicacao;
    ajustadoAMao[b] = false; // a ordem atual é a do programa; só vale aprender o que a pessoa mudar depois
    desenhar();
    return '';
  }

  async function comBotao(botao, textoOcupado, fn) {
    const original = botao.textContent;
    botao.disabled = true; botao.textContent = textoOcupado;
    try { return await fn(); } finally { if (botao.isConnected) { botao.textContent = original; } desenhar(); }
  }

  async function sugerirBloco(b, botao) {
    await comBotao(botao, 'O Paulus está ordenando…', async () => {
      await esperarLeituras();
      status.textContent = ordenar(b);
    });
  }

  async function organizarTudo() {
    await comBotao(botaoOrganizar, 'O Paulus está organizando…', async () => {
      await esperarLeituras();
      const avisos = [];
      for (let b = 0; b < ROTA_BLOCOS.length; b++) {
        if (!listas[b].length) continue;
        const a = ordenar(b);
        if (a) avisos.push(a);
      }
      const sem = listas.flat().filter((i) => !temTexto(i.endereco)).length;
      if (sem) avisos.push(`${sem} folha${sem === 1 ? '' : 's'} sem endereço ${sem === 1 ? 'ficou' : 'ficaram'} no fim do bloco. Digite o endereço e organize de novo, se quiser.`);
      status.textContent = avisos.join(' ');
    });
  }

  async function reler(id) {
    for (let b = 0; b < listas.length; b++) {
      const item = listas[b].find((i) => i.id === id);
      if (!item) continue;
      item.status = 'lendo'; atualizarItem(item);
      await iniciarLeitura(item);
      await encerrarOcr();
      if (!ajustadoAMao[b] && listas[b].filter((i) => temTexto(i.endereco)).length >= 2) ordenar(b);
      return;
    }
  }

  // ------------------------------------------------------------ adicionar arquivos
  function adicionar(b, entrada) {
    const files = Array.from(entrada.files || []);
    entrada.value = '';
    if (!files.length) return;
    const rejeitados = []; const novos = [];
    const t = totais();
    const existentes = listas.flat().map((i) => ({ nome: i.file.name, tamanho: i.file.size }));
    files.forEach((file) => {
      const motivo = motivoRejeicaoRota({ nome: file.name, tipo: file.type, tamanho: file.size }, t, existentes);
      if (motivo) { rejeitados.push(motivo); return; }
      const novo = { id: proximoId++, file, endereco: '', status: 'lendo', leitura: null };
      listas[b].push(novo); novos.push(novo);
      existentes.push({ nome: file.name, tamanho: file.size });
      t.arquivos += 1; t.bytes += file.size;
    });
    desenhar();
    status.textContent = rejeitados.length ? `Não foram adicionados: ${rejeitados.join('; ')}.` : '';
    // lê um de cada vez, para não pesar em celulares mais fracos; depois organiza o bloco sozinho
    (async () => {
      for (const n of novos) { if (!n.cancelado) await iniciarLeitura(n); }
      await encerrarOcr();
      try {
        if (listas[b].filter((i) => temTexto(i.endereco)).length >= 2 && !ajustadoAMao[b]) ordenar(b);
      } catch (e) { status.textContent = 'Não consegui organizar a rota sozinho; use "Organizar rota".'; }
    })();
  }

  // ------------------------------------------------------------ gerar o PDF
  function baixar(bytes, nome) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url; link.download = nome;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // O que a pessoa ajustou à mão vira aprendizado: as ruas que ela pôs em sequência passam a contar como vizinhas.
  function aprenderAjustes() {
    try {
      let viz = lerViz(); let mudou = false;
      listas.forEach((lista, b) => {
        if (!ajustadoAMao[b]) return;
        const nova = aprenderAjuste(viz, lista);
        if (nova !== viz) { viz = nova; mudou = true; }
        ajustadoAMao[b] = false;
      });
      if (mudou) guardarViz(viz);
    } catch (e) { /* aprender é opcional */ }
  }

  async function gerar() {
    await comBotao(botaoGerar, 'A juntar…', async () => {
      try {
        await esperarLeituras();
        aprenderAjustes();
        if (!window.PDFLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = new URL('./pdf-lib.min.js', import.meta.url).href;
            s.onload = resolve; s.onerror = () => reject(new Error('Não consegui carregar a biblioteca local de PDF.'));
            document.head.appendChild(s);
          });
        }
        const blocos = await Promise.all(ROTA_BLOCOS.map(async (bloco, b) => ({
          label: bloco.label,
          itens: await Promise.all(listas[b].map(async (i) => ({ nome: i.file.name, endereco: i.endereco, bytes: await i.file.arrayBuffer() })))
        })));
        const r = await montarPdfRota({ PDFLib: window.PDFLib, blocos });
        baixar(r.bytes, nomeArquivoRota(new Intl.DateTimeFormat('pt-BR').format(new Date()).replace(/\//g, '-')));
        status.textContent = `PDF unificado gerado: ${r.total} família(s), ${r.paginasFolhas} página(s) de folhas. Partida: ${ROTA_PARTIDA}.`;
        if (!manter.checked) { listas.forEach((l, b) => { l.forEach((i) => { i.cancelado = true; }); l.length = 0; ajustadoAMao[b] = false; explicacoes[b] = ''; }); }
      } catch (erro) {
        status.textContent = erro && erro.message ? erro.message : 'Não consegui unificar as folhas enviadas. Confirme se todos os arquivos são PDFs válidos.';
      }
    });
  }

  function limpar() {
    listas.forEach((l, b) => { l.forEach((i) => { i.cancelado = true; }); l.length = 0; ajustadoAMao[b] = false; explicacoes[b] = ''; });
    status.textContent = '';
    encerrarOcr();
    desenhar();
  }

  botaoOrganizar.addEventListener('click', organizarTudo);
  botaoGerar.addEventListener('click', gerar);
  botaoApagar.addEventListener('click', () => { try { localStorage.removeItem(CHAVE_VIZ); } catch (e) { /* ok */ } textoAprendido(); status.textContent = 'O aprendizado de ruas foi apagado deste aparelho.'; });
  $('bf-fechar').addEventListener('click', limpar);
  $('bf-limpar').addEventListener('click', limpar);
  dialogo.addEventListener('close', limpar);
  desenhar();
})();
