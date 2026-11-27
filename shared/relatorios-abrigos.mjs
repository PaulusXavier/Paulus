// Relatórios dos Abrigos (Operação Acolhida), porte do Anona para o Paulus.
// Sem IA, sem rede, sem cota: junta as folhas resumo (PDF, uma por família) de cada abrigo num único PDF,
// com capa (mês de repercussão, referências de frequência, data limite de recurso e contagem por efeito)
// e uma divisória por efeito (Alerta → Bloqueio → Suspensão).
// O módulo é puro: recebe o pdf-lib (PDFLib) já carregado e os bytes dos PDFs; não toca em DOM nem em rede.
// Testes: `node --test tests/relatorios-abrigos.test.mjs`.

export const ABRIGOS = ['Rondon 1', 'Rondon 5', 'PRA', 'Tuaronoko'];
export const EFEITOS = ['Famílias em Alerta', 'Famílias em Bloqueio', 'Famílias Suspensas'];
export const MAX_ARQUIVOS = 60;
export const MAX_BYTES = 80 * 1024 * 1024;

// Cronograma de Repercussão POR ANO: mês de repercussão, meses de referência de Educação e Saúde
// e a data limite para o beneficiário entrar com recurso.
// TODO INÍCIO DE ANO: ADICIONE (não substitua) a chave do ano novo (ex.: 2027), copiando o formato de 2026,
// com os dados da portaria/comunicado de Condicionalidades. O ano mais recente é o usado automaticamente.
export const CRONOGRAMAS_REPERCUSSAO_POR_ANO = {
  2026: [
    { mes: 'Março', educacaoRef: 'Outubro/Novembro de 2025', saudeRef: '2º Semestre de 2025', dataLimite: '23/04/2026' },
    { mes: 'Maio', educacaoRef: 'Fevereiro/Março de 2026', saudeRef: '—', dataLimite: '25/06/2026' },
    { mes: 'Julho', educacaoRef: 'Abril/Maio de 2026', saudeRef: '—', dataLimite: '27/08/2026' },
    { mes: 'Setembro', educacaoRef: 'Junho/Julho de 2026', saudeRef: '1º Semestre de 2026', dataLimite: '29/10/2026' },
    { mes: 'Novembro', educacaoRef: 'Agosto/Setembro de 2026', saudeRef: '—', dataLimite: '31/01/2027' }
  ]
};

export function anoVigente(cronogramas = CRONOGRAMAS_REPERCUSSAO_POR_ANO) {
  const anos = Object.keys(cronogramas).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return anos.length ? anos[anos.length - 1] : null;
}

export function cronogramaVigente(cronogramas = CRONOGRAMAS_REPERCUSSAO_POR_ANO) {
  const ano = anoVigente(cronogramas);
  return { ano, meses: ano == null ? [] : cronogramas[ano] };
}

// Texto que a Helvetica do pdf-lib (WinAnsi) sabe desenhar; qualquer outro caractere derrubaria o drawText.
export function textoSeguroPdf(valor) {
  const t = String(valor == null ? '' : valor).normalize('NFC');
  return Array.from(t).map((c) => {
    const k = c.codePointAt(0);
    if (k === 9 || k === 10 || k === 13 || k === 0xA0) return ' ';
    const ok = (k >= 32 && k < 127) || (k >= 0xA1 && k <= 255) || [8211, 8212, 8216, 8217, 8220, 8221, 8226, 8230].includes(k);
    return ok ? c : '';
  }).join('');
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const familias = (n) => plural(n, 'família', 'famílias');

export function formatarMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
}

// Confere um arquivo novo contra os limites (30 PDFs / 50 MB no total, somando TODOS os abrigos).
// Devolve null se pode entrar, ou o motivo da rejeição.
export function motivoRejeicao(arquivo, totais) {
  const nome = arquivo.nome || 'arquivo';
  const ehPdf = (!arquivo.tipo || arquivo.tipo === 'application/pdf') && /\.pdf$/i.test(nome) || arquivo.tipo === 'application/pdf';
  if (!ehPdf) return `${nome} (não é PDF)`;
  if (totais.arquivos + 1 > MAX_ARQUIVOS) return `${nome} (limite de ${MAX_ARQUIVOS} arquivos atingido)`;
  if (totais.bytes + arquivo.tamanho > MAX_BYTES) return `${nome} (passaria do limite de ${MAX_BYTES / (1024 * 1024)} MB)`;
  return null;
}

export function nomeArquivoAbrigo(abrigo, cronograma, dataTexto) {
  const seguro = (s) => textoSeguroPdf(s).replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Abrigo ${seguro(abrigo)} - Repercussao ${seguro(cronograma.mes)} - ${seguro(dataTexto)}.pdf`;
}

// Linhas da capa (texto + estilo), separadas do desenho para poderem ser testadas.
export function linhasCapa({ abrigo, cronograma, ano, contagens, efeitos = EFEITOS }) {
  const total = contagens.reduce((s, n) => s + n, 0);
  return [
    { texto: `Relatório de Repercussão — Abrigo ${abrigo}`, tamanho: 16, bold: true, cor: 'azul' },
    { texto: 'Informações para a equipe de proteção social do abrigo', tamanho: 10 },
    { texto: ' ', tamanho: 5 },
    { texto: `Mês de repercussão: ${cronograma.mes}/${ano}`, tamanho: 11, bold: true },
    { texto: `Frequência de Educação considerada (referência): ${cronograma.educacaoRef}`, tamanho: 10.5 },
    { texto: `Frequência de Saúde considerada (referência): ${cronograma.saudeRef}`, tamanho: 10.5 },
    { texto: `Data limite para recurso deste mês de referência: ${cronograma.dataLimite}`, tamanho: 11, bold: true, cor: 'vermelho' },
    { texto: ' ', tamanho: 5 },
    { texto: 'Quantidade de efeitos nesta remessa:', tamanho: 11, bold: true },
    ...efeitos.map((efeito, i) => ({ texto: `   ${efeito}: ${contagens[i]}`, tamanho: 10.5 })),
    { texto: `   Total: ${familias(total)}`, tamanho: 10.5, bold: true },
    { texto: ' ', tamanho: 5 },
    { texto: 'Condicionalidades do Programa', tamanho: 12, bold: true, cor: 'azul' },
    { texto: 'Educação — 60% de frequência: crianças de 4 a 5 anos', tamanho: 10.5 },
    { texto: 'Educação — 75% de frequência: crianças e adolescentes de 6 a 18 anos incompletos', tamanho: 10.5 },
    { texto: 'Saúde — Pré-natal: acompanhamento pelo SUS (gestantes)', tamanho: 10.5 },
    { texto: 'Saúde — Vacinação: menores de 7 anos', tamanho: 10.5 },
    { texto: 'Saúde — Peso e Nutrição: menores de 7 anos', tamanho: 10.5 }
  ];
}

const TITULO_TOPO = 'Paulus · Operação Acolhida — Abrigos';
const SUBTITULO_TOPO = 'CRAS Cristiana Vicente Nunes · SEMADS · Paulo Xavier, Psicólogo, CRP-20/09816';

function desenharPagina(PDFLib, doc, fontes, linhas, agora) {
  const { rgb } = PDFLib;
  const cores = {
    azul: rgb(0x0B / 255, 0x2F / 255, 0x7A / 255),
    vermelho: rgb(0xDC / 255, 0x26 / 255, 0x26 / 255),
    slate: rgb(0x33 / 255, 0x41 / 255, 0x55 / 255)
  };
  const page = doc.addPage([842, 595]); // A4 paisagem, em pontos
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 52, width, height: 52, color: cores.azul });
  page.drawRectangle({ x: 0, y: height - 55, width, height: 3, color: rgb(1, 223 / 255, 0) });
  page.drawText(textoSeguroPdf(TITULO_TOPO), { x: 32, y: height - 30, size: 14, font: fontes.bold, color: rgb(1, 1, 1) });
  page.drawText(textoSeguroPdf(SUBTITULO_TOPO), { x: 32, y: height - 44, size: 8.5, font: fontes.regular, color: rgb(0.78, 0.84, 1) });
  let y = height - 100;
  for (const linha of linhas) {
    const tamanho = linha.tamanho || 11;
    page.drawText(textoSeguroPdf(linha.texto), {
      x: 32, y, size: tamanho, font: linha.bold ? fontes.bold : fontes.regular, color: cores[linha.cor] || cores.slate
    });
    y -= tamanho + 12;
  }
  page.drawText(textoSeguroPdf(`Gerado em ${agora}`), { x: 32, y: 24, size: 8, font: fontes.regular, color: cores.slate });
  page.drawText(textoSeguroPdf('Contém dados pessoais protegidos (LGPD) — uso restrito ao serviço.'), {
    x: width - 32 - fontes.regular.widthOfTextAtSize('Contém dados pessoais protegidos (LGPD) — uso restrito ao serviço.', 8),
    y: 24, size: 8, font: fontes.regular, color: cores.slate
  });
  return page;
}

// Erro de PDF ilegível/criptografado com a mensagem para o usuário.
async function abrirPdf(PDFLib, item, abrigo, efeito) {
  try {
    return await PDFLib.PDFDocument.load(item.bytes);
  } catch (e) {
    if (/encrypt/i.test(String(e && e.message))) {
      throw new Error(`O arquivo "${item.nome}" (${abrigo} · ${efeito}) é protegido (criptografado) e não pode ser juntado. Abra-o, escolha Imprimir > Salvar como PDF e envie a cópia.`);
    }
    throw new Error(`Não consegui abrir o arquivo "${item.nome}" (${abrigo} · ${efeito}). Confirme se é um PDF válido e tente enviá-lo de novo.`);
  }
}

// grupos: [{ efeito, itens: [{ nome, bytes }] }] na ordem Alerta → Bloqueio → Suspensão.
// Devolve { bytes, total, contagens, paginasFolhas } ou lança Error com mensagem legível.
export async function montarRelatorioAbrigo({ PDFLib, abrigo, cronograma, ano, grupos, agora = new Date() }) {
  if (!PDFLib || !PDFLib.PDFDocument) throw new Error('A biblioteca de PDF não está disponível.');
  if (!cronograma) throw new Error('Escolha o mês de repercussão antes de gerar o relatório.');
  const contagens = grupos.map((g) => g.itens.length);
  const total = contagens.reduce((s, n) => s + n, 0);
  if (!total) throw new Error(`Adicione pelo menos uma folha resumo (PDF) para o abrigo ${abrigo} antes de gerar o PDF.`);

  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const fontes = { bold: await doc.embedFont(StandardFonts.HelveticaBold), regular: await doc.embedFont(StandardFonts.Helvetica) };
  const dataTexto = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(agora);
  try {
    doc.setTitle(textoSeguroPdf(`Relatório de Repercussão — Abrigo ${abrigo} — ${cronograma.mes}/${ano}`));
    doc.setSubject('Operação Acolhida — informações para a equipe de proteção social do abrigo');
    doc.setAuthor('Paulus · Paulo Xavier — CRP-20/09816');
    doc.setCreator('Paulus'); doc.setProducer('Paulus'); doc.setCreationDate(agora);
  } catch (e) { /* metadados são opcionais */ }

  desenharPagina(PDFLib, doc, fontes, linhasCapa({ abrigo, cronograma, ano, contagens, efeitos: grupos.map((g) => g.efeito) }), dataTexto);

  let paginasFolhas = 0;
  for (const grupo of grupos) {
    if (!grupo.itens.length) continue;
    desenharPagina(PDFLib, doc, fontes, [
      { texto: `${abrigo} · ${grupo.efeito}`, tamanho: 14, bold: true, cor: 'azul' },
      { texto: familias(grupo.itens.length), tamanho: 10.5 }
    ], dataTexto);
    const origens = await Promise.all(grupo.itens.map((item) => abrirPdf(PDFLib, item, abrigo, grupo.efeito)));
    for (const origem of origens) {
      const paginas = await doc.copyPages(origem, origem.getPageIndices());
      paginas.forEach((p) => { doc.addPage(p); paginasFolhas += 1; });
    }
  }
  return { bytes: await doc.save(), total, contagens, paginasFolhas };
}
