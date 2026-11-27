// PDF das anotações da agenda, gerado no aparelho (jsPDF local). Sem IA, sem rede.
// Cabeçalho com identificação, aviso de dados pessoais (LGPD) e "Página X de Y" no rodapé de todas as páginas.
// Porte do "PDF das anotações" do Anona. A seleção (selecionarAnotacoes) é pura e testada; o desenho recebe o jsPDF por parâmetro.
// Testes: tests/agenda-pdf.test.mjs

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const AVISO_LGPD = 'Anotações pessoais — podem conter dados sensíveis de pessoas atendidas (LGPD). Uso restrito ao serviço; não compartilhe nem imprima sem necessidade.';
export const CATEGORIAS = { atendimento: 'Atendimento', visita: 'Visita', grupo: 'Grupo', reuniao: 'Reunião', prazo: 'Prazo' };

const MARGEM = 48;
const TOPO = 118;
const RODAPE = 50;
const AZUL = [7, 56, 72];
const AZUL_ESCURO = [4, 34, 46];
const DOURADO = [255, 204, 41];
const CINZA = [71, 85, 105];

// Texto para a fonte padrão do PDF: tira controles e símbolos fora do Latin-1 (emoji saía como lixo).
export const textoSeguro = (v) => String(v == null ? '' : v)
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
  .replace(/[←-⯿☀-➿️‍]/g, '')
  .replace(/[ \t]+/g, ' ')
  .trim();

const chaveValida = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
const horaValida = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

// dias: { 'AAAA-MM-DD': [{ text, time, cat, done }] } (o state.days da agenda).
// escopo: { mes: 0..11, ano } para um mês, ou {} para tudo. Devolve [{ chave, mesChave, itens:[{ hora, tipo, texto, concluida }] }] em ordem.
export function selecionarAnotacoes(dias, escopo = {}) {
  const mes = Number.isInteger(escopo.mes) ? escopo.mes : null;
  const ano = Number.isInteger(escopo.ano) ? escopo.ano : null;
  return Object.keys(dias || {}).filter(chaveValida).sort().map((chave) => {
    const [a, m] = chave.split('-').map(Number);
    if (mes !== null && (m - 1 !== mes || (ano !== null && a !== ano))) return null;
    const itens = (Array.isArray(dias[chave]) ? dias[chave] : []).map((e, i) => ({ e, i }))
      .filter(({ e }) => e && typeof e.text === 'string' && textoSeguro(e.text))
      .sort((x, y) => (horaValida(x.e.time) ? x.e.time : '99:99').localeCompare(horaValida(y.e.time) ? y.e.time : '99:99') || x.i - y.i)
      .map(({ e }) => ({
        hora: horaValida(e.time) ? e.time : '',
        tipo: Object.prototype.hasOwnProperty.call(CATEGORIAS, e.cat) ? CATEGORIAS[e.cat] : '',
        texto: textoSeguro(e.text),
        concluida: !!e.done
      }));
    return itens.length ? { chave, mesChave: chave.slice(0, 7), itens } : null;
  }).filter(Boolean);
}

export function rotuloDia(chave) {
  const d = new Date(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)) - 1, Number(chave.slice(8, 10)), 12);
  const t = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rotuloMes(mesChave) {
  return `${MESES[Number(mesChave.slice(5, 7)) - 1] || ''} de ${mesChave.slice(0, 4)}`;
}

export function nomeArquivoAnotacoes(escopo, anos) {
  const anoTexto = anos.length > 1 ? `${anos[0]}-${anos[anos.length - 1]}` : (anos[0] || '');
  const base = Number.isInteger(escopo.mes) ? `anotacoes-agenda-${MESES[escopo.mes].toLowerCase().replace('ç', 'c')}-${anoTexto}` : `anotacoes-agenda-${anoTexto}`;
  return `${base}.pdf`;
}

// Cada anotação vira linhas "HH:MM · Tipo — texto" com a caixa de conclusão desenhada; nota longa continua na página seguinte.
export function gerarPdfAnotacoes(dias, opcoes = {}) {
  const { jsPDF, escopo = {}, agora = new Date() } = opcoes;
  if (!jsPDF) throw new Error('A biblioteca local de PDF não foi carregada.');
  const grupos = selecionarAnotacoes(dias, escopo);
  if (!grupos.length) return { ok: false, texto: Number.isInteger(escopo.mes) ? `Não há anotações em ${MESES[escopo.mes]}.` : 'Não há anotações para exportar.' };

  const anos = [...new Set(grupos.map((g) => g.chave.slice(0, 4)))];
  const subtitulo = Number.isInteger(escopo.mes) ? `Anotações de ${MESES[escopo.mes]} de ${anos.join('–')}` : `Todas as anotações · ${anos.length > 1 ? `${anos[0]}–${anos[anos.length - 1]}` : anos[0]}`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  try { doc.setProperties({ title: `Agenda — ${subtitulo}`, subject: 'Anotações da agenda do Paulus', author: 'Paulus · Paulo Xavier — CRP-20/09816', creator: 'Paulus' }); } catch (_) { /* metadados são opcionais */ }
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const larguraTexto = larg - MARGEM * 2 - 22;
  const gerado = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(agora);

  function cabecalho() {
    doc.setFillColor(...AZUL_ESCURO); doc.rect(0, 0, larg, 88, 'F');
    doc.setFillColor(...DOURADO); doc.rect(0, 88, larg, 4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('Agenda · Anotações', MARGEM, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(subtitulo, MARGEM, 58);
    doc.setFontSize(9); doc.setTextColor(200, 225, 235);
    doc.text('Paulo Xavier · CRP-20/09816 · Psicólogo', MARGEM, 74);
    doc.setTextColor(255, 255, 255);
    doc.text(`Gerado em ${gerado}`, larg - MARGEM, 40, { align: 'right' });
  }
  const novaPagina = () => { doc.addPage(); cabecalho(); return TOPO; };
  const linhasPorPagina = Math.floor((alt - RODAPE - TOPO - 40) / 13);

  cabecalho();
  let y = TOPO;
  let mesAnterior = '';
  grupos.forEach((g) => {
    const mostrarMes = !Number.isInteger(escopo.mes) && g.mesChave !== mesAnterior;
    mesAnterior = g.mesChave;
    // Mantém o rótulo do dia junto da primeira anotação: precisa caber rótulo + 2 linhas.
    if (y + (mostrarMes ? 34 : 0) + 18 + 26 > alt - RODAPE) y = novaPagina();
    if (mostrarMes) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...AZUL_ESCURO);
      doc.text(rotuloMes(g.mesChave), MARGEM, y);
      doc.setDrawColor(...DOURADO); doc.setLineWidth(1.5); doc.line(MARGEM, y + 5, larg - MARGEM, y + 5); doc.setLineWidth(0.4);
      y += 28;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...AZUL);
    doc.text(rotuloDia(g.chave), MARGEM, y);
    y += 16;
    g.itens.forEach((it) => {
      const prefixo = [it.hora, it.tipo].filter(Boolean).join(' · ');
      const bruto = (prefixo ? `${prefixo} — ` : '') + it.texto + (it.concluida ? '  (concluída)' : '');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      let linhas = doc.splitTextToSize(bruto, larguraTexto);
      let primeira = true;
      while (linhas.length) {
        let cabem = Math.floor((alt - RODAPE - y) / 13);
        if (cabem < Math.min(2, linhas.length)) { y = novaPagina(); cabem = Math.floor((alt - RODAPE - y) / 13); }
        if (!primeira) {
          // Página de continuação: diz de que dia é, em vez de começar no meio do texto.
          doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9); doc.setTextColor(...AZUL);
          doc.text(`${rotuloDia(g.chave)} (continuação)`, MARGEM, y);
          y += 14; cabem = Math.floor((alt - RODAPE - y) / 13);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        }
        const parte = linhas.slice(0, cabem);
        linhas = linhas.slice(cabem);
        if (primeira) {
          doc.setDrawColor(...AZUL); doc.setFillColor(...AZUL); doc.setLineWidth(0.8);
          doc.rect(MARGEM, y - 8, 8, 8, it.concluida ? 'F' : 'S'); // caixa de conclusão
        }
        doc.setTextColor(...CINZA);
        doc.text(parte, MARGEM + 16, y);
        y += parte.length * 13 + 5;
        primeira = false;
      }
    });
    y += 8;
  });

  const total = doc.internal.getNumberOfPages();
  const rodapeData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(agora);
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5); doc.line(MARGEM, alt - 38, larg - MARGEM, alt - 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize(AVISO_LGPD, (larg - MARGEM * 2) * 0.5).slice(0, 3), MARGEM, alt - 29);
    doc.setFontSize(8);
    doc.text(`Página ${p} de ${total}`, larg / 2 + 40, alt - 22, { align: 'center' });
    doc.text(`Paulus · ${rodapeData}`, larg - MARGEM, alt - 22, { align: 'right' });
  }
  return { ok: true, nomeArquivo: nomeArquivoAnotacoes(escopo, anos), bytes: doc.output('arraybuffer'), totalPaginas: total, totalAnotacoes: grupos.reduce((s, g) => s + g.itens.length, 0) };
}
