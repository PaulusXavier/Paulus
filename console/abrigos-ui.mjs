// Etapa 5 da janela "Relatórios locais": Relatórios dos Abrigos (Operação Acolhida).
// Tudo no aparelho: os PDFs escolhidos são lidos em memória, juntados com o pdf-lib local e descarregados.
// Nada é enviado à rede ou à IA nem gravado em localStorage; fechar a janela ou limpar descarta os arquivos.
import {
  ABRIGOS, EFEITOS, MAX_ARQUIVOS, MAX_BYTES, cronogramaVigente, familias, formatarMB,
  montarRelatorioAbrigo, motivoRejeicao, nomeArquivoAbrigo
} from './relatorios-abrigos.mjs';

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const raiz = $('ab-lista');
  const dialogo = $('bf-report');
  if (!raiz || !dialogo) return;

  const seletor = $('ab-mes');
  const status = $('ab-status');
  const total = $('ab-total');
  const manter = $('ab-manter');
  const { ano, meses } = cronogramaVigente();
  // listas[abrigo][efeito] = [{ id, file }]
  const listas = ABRIGOS.map(() => EFEITOS.map(() => []));
  let proximoId = 1;
  let carregando = null;

  function carregarPdfLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return Promise.resolve(window.PDFLib);
    if (carregando) return carregando;
    carregando = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./pdf-lib.min.js', import.meta.url).href;
      script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('A biblioteca local de PDF não iniciou.'));
      script.onerror = () => reject(new Error('Não consegui carregar a biblioteca local de PDF.'));
      document.head.appendChild(script);
    }).catch((erro) => { carregando = null; throw erro; });
    return carregando;
  }

  function totais() {
    let arquivos = 0;
    let bytes = 0;
    listas.forEach((abrigo) => abrigo.forEach((lista) => lista.forEach((item) => { arquivos += 1; bytes += item.file.size; })));
    return { arquivos, bytes };
  }

  function el(tag, atributos, filhos) {
    const e = document.createElement(tag);
    Object.entries(atributos || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else e.setAttribute(k, v); });
    (filhos || []).forEach((f) => e.appendChild(f));
    return e;
  }

  function desenharTotal() {
    const t = totais();
    total.textContent = `${t.arquivos}/${MAX_ARQUIVOS} arquivos · ${formatarMB(t.bytes)} MB de ${MAX_BYTES / (1024 * 1024)} MB`;
    total.dataset.cheio = t.arquivos >= MAX_ARQUIVOS || t.bytes >= MAX_BYTES ? '1' : '';
  }

  function desenhar() {
    raiz.textContent = '';
    ABRIGOS.forEach((abrigo, a) => {
      const soma = listas[a].reduce((s, l) => s + l.length, 0);
      const caixa = el('div', { class: 'ab-abrigo' });
      caixa.appendChild(el('h4', { text: `${abrigo} · ${familias(soma)}` }));
      EFEITOS.forEach((efeito, e) => {
        const lista = listas[a][e];
        const idCampo = `ab-in-${a}-${e}`;
        const bloco = el('div', { class: 'ab-efeito' });
        bloco.appendChild(el('label', { for: idCampo, text: `${efeito} (${lista.length})` }));
        const entrada = el('input', { id: idCampo, type: 'file', accept: '.pdf,application/pdf', multiple: '' });
        entrada.addEventListener('change', () => adicionar(a, e, entrada));
        bloco.appendChild(entrada);
        if (lista.length) {
          const ol = el('ol', { class: 'ab-arquivos' });
          lista.forEach((item, i) => {
            const li = el('li');
            li.appendChild(el('span', { class: 'ab-nome', text: `${item.file.name} · ${formatarMB(item.file.size)} MB` }));
            [['↑', 'Mover para cima', -1], ['↓', 'Mover para baixo', 1]].forEach(([texto, rotulo, d]) => {
              const b = el('button', { type: 'button', 'aria-label': rotulo, title: rotulo, text: texto });
              b.disabled = i + d < 0 || i + d >= lista.length;
              b.addEventListener('click', () => { [lista[i], lista[i + d]] = [lista[i + d], lista[i]]; desenhar(); });
              li.appendChild(b);
            });
            const rem = el('button', { type: 'button', 'aria-label': 'Remover arquivo', title: 'Remover arquivo', text: '×' });
            rem.addEventListener('click', () => { lista.splice(i, 1); desenhar(); });
            li.appendChild(rem);
            ol.appendChild(li);
          });
          bloco.appendChild(ol);
        }
        caixa.appendChild(bloco);
      });
      const gerar = el('button', { type: 'button', class: 'ab-gerar', text: `Gerar PDF — ${abrigo}` });
      gerar.disabled = !soma;
      gerar.addEventListener('click', () => gerarAbrigo(a, gerar));
      caixa.appendChild(gerar);
      raiz.appendChild(caixa);
    });
    desenharTotal();
  }

  function adicionar(a, e, entrada) {
    const files = Array.from(entrada.files || []);
    entrada.value = '';
    const rejeitados = [];
    const t = totais();
    files.forEach((file) => {
      const motivo = motivoRejeicao({ nome: file.name, tipo: file.type, tamanho: file.size }, t);
      if (motivo) { rejeitados.push(motivo); return; }
      listas[a][e].push({ id: proximoId++, file });
      t.arquivos += 1;
      t.bytes += file.size;
    });
    desenhar();
    status.textContent = rejeitados.length ? `Não foram adicionados: ${rejeitados.join('; ')}.` : '';
  }

  function baixar(bytes, nome) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function gerarAbrigo(a, botao) {
    const abrigo = ABRIGOS[a];
    if (seletor.value === '') { status.textContent = `Selecione o mês de repercussão (cronograma ${ano}) antes de gerar o relatório.`; return; }
    const cronograma = meses[parseInt(seletor.value, 10)];
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'A juntar…';
    status.textContent = `A montar o PDF de ${abrigo} no aparelho; os arquivos não são enviados.`;
    try {
      const PDFLib = await carregarPdfLib();
      const grupos = await Promise.all(EFEITOS.map(async (efeito, e) => ({
        efeito,
        itens: await Promise.all(listas[a][e].map(async (item) => ({ nome: item.file.name, bytes: await item.file.arrayBuffer() })))
      })));
      const r = await montarRelatorioAbrigo({ PDFLib, abrigo, cronograma, ano, grupos });
      const data = new Intl.DateTimeFormat('pt-BR').format(new Date()).replace(/\//g, '-');
      baixar(r.bytes, nomeArquivoAbrigo(abrigo, cronograma, data));
      status.textContent = `PDF do abrigo ${abrigo} gerado: ${familias(r.total)}, ${r.paginasFolhas} página(s) de folhas.`;
      if (!manter.checked) listas[a].forEach((l) => { l.length = 0; });
    } catch (erro) {
      status.textContent = erro && erro.message ? erro.message : `Não consegui gerar o PDF do abrigo ${abrigo}. Confirme se todos os arquivos são PDFs válidos.`;
    } finally {
      desenhar();
      if (botao.isConnected) botao.textContent = textoOriginal;
    }
  }

  function limpar() {
    listas.forEach((abrigo) => abrigo.forEach((l) => { l.length = 0; }));
    seletor.value = '';
    status.textContent = '';
    desenhar();
  }

  meses.forEach((c, i) => seletor.appendChild(el('option', { value: String(i), text: `${c.mes}/${ano}` })));
  $('ab-mes-rotulo').textContent = `Mês de repercussão (cronograma ${ano})`;
  const corpo = $('ab-cronograma');
  meses.forEach((c) => {
    const tr = el('tr');
    [c.mes, c.educacaoRef, c.saudeRef, c.dataLimite].forEach((t) => tr.appendChild(el('td', { text: t })));
    corpo.appendChild(tr);
  });
  // Mesma regra das outras etapas: fechar ou limpar a janela descarta os arquivos.
  $('bf-fechar').addEventListener('click', limpar);
  $('bf-limpar').addEventListener('click', limpar);
  dialogo.addEventListener('close', limpar);
  desenhar();
})();
