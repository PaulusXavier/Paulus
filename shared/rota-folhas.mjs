// Rota de Visita — Unificar Folhas de Família (porte do Anona para o Paulus).
// Sem IA, sem rede, sem cota: lê SÓ rua, número e bairro do quadro "II - Endereço da família" de cada folha resumo
// (nome, NIS e CPF nem entram na leitura), ordena por bloco com shared/visitas.mjs e junta tudo num PDF com capa e roteiro.
// Módulo puro: quem lê o PDF (pdf.js) e quem faz OCR é a camada do console; aqui só se interpreta texto e se monta o PDF.
// Testes: `node --test tests/rota-folhas.test.mjs`.

import { ordenarVisitas, aprenderVizinhanca, explicacaoDaOrdem } from './visitas.mjs';
import { textoSeguroPdf, familias } from './relatorios-abrigos.mjs';

export { textoSeguroPdf };

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function limpa(s) { return String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;:|_\-–—]+|[\s,;:|_\-–—]+$/g, '').trim(); }

// "RUA SANTO AGOSTINHO" → "Rua Santo Agostinho"
export function tituloCaso(s) {
  return limpa(s).toLowerCase().split(' ').map((p, i) => {
    if (i > 0 && MINUSCULAS.has(p)) return p;
    return p.replace(/^(\p{L})/u, m => m.toUpperCase());
  }).join(' ');
}

// Itens do pdf.js (cada um com texto e posição) → linhas de texto, de cima para baixo e da esquerda para a direita.
export function linhasDeItens(itens) {
  const lista = (itens || []).filter(it => it && String(it.str || '').trim() !== '' && it.transform)
    .map(it => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }));
  lista.sort((a, b) => b.y - a.y);
  const linhas = [];
  lista.forEach(it => {
    const l = linhas.find(l => Math.abs(l.y - it.y) <= 3);
    if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
  });
  linhas.sort((a, b) => b.y - a.y);
  return linhas.map(l => l.itens.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Rótulos que encerram o valor do campo anterior (ex.: "... SANTO AGOSTINHO Número: 193").
const ROTULOS = '(?:n[úu]mero|n[º°o]|complemento|bairro|cep|localidade|ponto\\s+de\\s+refer[êe]ncia|refer[êe]ncia|munic[íi]pio|cidade|uf|tipolog|t[íi]tulo(?:\\s+do\\s+logradouro)?|nome(?:\\s+d[oa]\\s+(?:logradouro|rua))?|logradouro|zona|distrito|telefone|nis|cpf|data|c[óo]d(?:igo)?|endere[çc]o)';
const FIM = '(?=\\s+' + ROTULOS + '\\s*:|$)';

function pegaRotulo(texto, rotulo) {
  const m = new RegExp('(?:^|[^\\p{L}])(?:' + rotulo + ')\\s*:\\s*(.+?)' + FIM, 'iu').exec(texto);
  return m ? limpa(m[1]) : '';
}

const TIPOS = 'rua|r\\.|avenida|av\\.?|travessa|tv\\.?|alameda|estrada|rodovia|beco|pra[çc]a|vicinal|via|passagem|largo|loteamento|conjunto|residencial|quadra|ramal|br[- ]?\\d+';
const ABREV = { 'r.': 'Rua', 'r': 'Rua', 'av.': 'Avenida', 'av': 'Avenida', 'tv.': 'Travessa', 'tv': 'Travessa' };

function normalizaTipo(t) { const k = String(t).toLowerCase(); return ABREV[k] || tituloCaso(t); }

function numeroDe(s) {
  // Cadastro Único preenche o número com zeros à esquerda ("0000000000000046" = 46)
  s = String(s || '').replace(/(^|[^\p{L}\d])0+(?=\d)/gu, '$1');
  const m = /(?:^|[^\p{L}\d])(s\s*\/\s*n|sn|sem\s+n[úu]mero|\d{1,6}[A-Za-z]?)(?![\p{L}\d])/iu.exec(' ' + String(s || ''));
  if (!m) return '';
  return /^s/i.test(m[1]) ? 'S/N' : m[1].toUpperCase();
}

// "Rua Santo Agostinho, nº 193 — Centenário" (texto livre) → { rua, numero, bairro }
export function parseEnderecoLivre(txt) {
  const t = limpa(txt);
  if (!t) return null;
  const re = new RegExp('(?:^|[\\s,;(])(' + TIPOS + ')\\s+(.+?)(?:(?:\\s*[,\\-–—]\\s*|\\s+)(?:n[º°o]\\.?|n[úu]mero|num\\.?)?\\s*(s\\s*\\/\\s*n|sn|\\d{1,6}[A-Za-z]?)(?![\\p{L}\\d])(.*)|$)', 'iu');
  const m = re.exec(t);
  if (m) {
    let nome = limpa(m[2]);
    // não confundir "Rua 7 de Setembro, 245": o número da rua faz parte do nome (sem vírgula antes do 245)
    return {
      rua: normalizaTipo(m[1]) + ' ' + tituloCaso(nome),
      numero: m[3] ? numeroDe(m[3]) : '',
      bairro: tituloCaso((m[4] || '').replace(/^[\s,\-–—]*(?:bairro\s*:?)?\s*/i, '').replace(/\bcep\b.*$/i, '').replace(/\b(?:boa vista|rr|roraima)\b.*$/i, ''))
    };
  }
  return null;
}

function formata(rua, numero, bairro) {
  return rua + (numero ? ', ' + numero : '') + (bairro ? ' — ' + bairro : '');
}

// Lê o endereço a partir das linhas de texto da folha resumo. Devolve null se não achar.
export function extrairEndereco(linhas) {
  let texto = (Array.isArray(linhas) ? linhas.join(' ') : String(linhas || '')).replace(/\s+/g, ' ')
    .replace(/tipo\s+(?:de\s+)?logradouro\s*:/gi, 'TIPOLOG:');
  // Folha Resumo do Cadastro Único: campos numerados ("1.12 - Tipo: AVENIDA 1.13 - Título: 1.14 - Nome: ELDORADO ...").
  // Tira os códigos de item e trata o "Tipo:" solto como tipo de logradouro, para um campo não engolir o seguinte.
  if (texto.indexOf('TIPOLOG:') < 0) {
    texto = texto.replace(/\b\d{1,2}\.\d{2}\s*-?\s*(?=\p{L})/gu, ' ').replace(/\s+/g, ' ')
      .replace(/(^|\s)tipo\s*:/i, '$1TIPOLOG:');
  }

  // 1) campos com rótulo (Tipo de logradouro / Nome / Número / Bairro)
  const tipo = (pegaRotulo(texto, 'tipolog').split(' ')[0] || '');
  let nome = pegaRotulo(texto, 'nome\\s+d[oa]\\s+(?:logradouro|rua)|logradouro');
  if (!nome && tipo) {   // "Tipo de logradouro: RUA Nome: SANTO AGOSTINHO" — só vale o "Nome" que vem depois do tipo
    const apos = texto.slice(texto.indexOf('TIPOLOG:'));
    nome = pegaRotulo(apos, 'nome');
    // "1.12 - Tipo: AVENIDA  1.13 - Título: GENERAL  1.14 - Nome: SAMPAIO" → Avenida General Sampaio.
    // Título vazio ("Título: Nome: ELDORADO") não pode engolir o campo seguinte.
    let titulo = pegaRotulo(apos, 't[íi]tulo');
    if (/[:]/.test(titulo)) titulo = '';
    if (nome && titulo) nome = titulo + ' ' + nome;
  }
  // O OCR de folha escaneada confunde O/o com 0 e l/I com 1 dentro do número do Cadastro Único (16 dígitos).
  const numeroBruto = pegaRotulo(texto, 'n[úu]mero|n[º°o]').replace(/[0-9OolI]{8,}/g, t => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1'));
  let numero = numeroDe(numeroBruto);
  const bairroRot = pegaRotulo(texto, 'bairro|localidade');
  if (nome) {
    const jaTemTipo = new RegExp('^(?:' + TIPOS + ')\\s', 'i').test(nome);
    const rua = jaTemTipo ? normalizaTipo(nome.split(' ')[0]) + ' ' + tituloCaso(nome.split(' ').slice(1).join(' '))
      : (tipo ? normalizaTipo(tipo) + ' ' : '') + tituloCaso(nome);
    const bairro = tituloCaso(bairroRot);
    return { rua, numero, bairro, texto: formata(rua, numero, bairro) };
  }

  // 2) "Endereço: Rua Sete, 245 - Bairro"  /  3) qualquer "Rua ..., 245" solto no texto
  const end = pegaRotulo(texto, 'endere[çc]o') || texto;
  const livre = parseEnderecoLivre(end) || (end !== texto ? parseEnderecoLivre(texto) : null);
  if (livre) {
    const bairro = tituloCaso(bairroRot) || livre.bairro;
    return { rua: livre.rua, numero: numero || livre.numero, bairro, texto: formata(livre.rua, numero || livre.numero, bairro) };
  }
  return null;
}


// ------------------------------------------------------------------ configuração (igual ao Anona)

export const ROTA_PARTIDA = 'Rua Santo Agostinho, nº 193 — Centenário, Boa Vista/RR';
export const ROTA_BLOCOS = [
  { label: 'Bloco 1 · Bairro Professora Araceli Souto Maior' },
  { label: 'Bloco 2 · Bairro 13 de Setembro' }
];
export const ROTA_MAX_ARQUIVOS = 30;
export const ROTA_MAX_BYTES = 50 * 1024 * 1024;

const temTexto = (v) => String(v == null ? '' : v).trim() !== '';

// Confere um arquivo novo: só PDF, sem repetir (mesmo nome e tamanho), até 30 PDFs e 50 MB somando os dois blocos.
// existentes: [{ nome, tamanho }] já adicionados (inclusive os novos desta mesma remessa).
export function motivoRejeicaoRota(arquivo, totais, existentes) {
  const nome = arquivo.nome || 'arquivo';
  const ehPdf = arquivo.tipo === 'application/pdf' || ((!arquivo.tipo || arquivo.tipo === 'application/pdf') && /\.pdf$/i.test(nome));
  if (!ehPdf) return `${nome} (não é PDF)`;
  if ((existentes || []).some((e) => e.nome === nome && e.tamanho === arquivo.tamanho)) return `${nome} (já foi adicionado)`;
  if (totais.arquivos + 1 > ROTA_MAX_ARQUIVOS) return `${nome} (limite de ${ROTA_MAX_ARQUIVOS} arquivos atingido)`;
  if (totais.bytes + arquivo.tamanho > ROTA_MAX_BYTES) return `${nome} (passaria do limite de ${ROTA_MAX_BYTES / (1024 * 1024)} MB)`;
  return null;
}

// ------------------------------------------------------------------ leitura do endereço da folha

// Só o quadro "II - Endereço da família": o que vem depois (componentes, nomes, CPF) nem entra na leitura.
export function quadroEndereco(linhas) {
  const ini = linhas.findIndex((l) => /ENDERE[ÇC]O\s+DA\s+FAM[ÍI]LIA/i.test(l));
  if (ini < 0) return linhas;
  const fim = linhas.findIndex((l, i) => i > ini && /COMPONENTES\s+DA\s+FAM[ÍI]LIA|Nome\s+Completo|\bCPF\b/i.test(l));
  return linhas.slice(ini, fim < 0 ? linhas.length : fim);
}

// paginas: [itens do pdf.js da página 1, página 2, …] (até 3). Devolve { rua, numero, bairro, texto, via: 'texto' } ou null.
// Quando devolve null e a folha não tem texto, a camada do console tenta OCR.
export function enderecoDasPaginas(paginasItens) {
  let linhas = [];
  for (const itens of (paginasItens || []).slice(0, 3)) {
    linhas = linhas.concat(linhasDeItens(itens));
    const achou = extrairEndereco(quadroEndereco(linhas));
    if (achou) return Object.assign(achou, { via: 'texto' });
  }
  return null;
}

// Linhas lidas por OCR (faixa do quadro, ou a página inteira) → endereço ou null.
export function enderecoDoOcr(textoOcr) {
  const linhas = String(textoOcr || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const achou = extrairEndereco(linhas);
  return achou && achou.rua ? Object.assign(achou, { via: 'ocr' }) : null;
}

// ------------------------------------------------------------------ ordem de visita

// itens: [{ endereco, ... }] de UM bloco. Quem tem endereço é ordenado por ordenarVisitas; quem não tem fica no fim, na ordem em que estava.
// opcoes: { geo, vizinhanca } (a vizinhança aprendida dos ajustes manuais, só nomes de rua).
export function ordenarBloco(itens, opcoes) {
  const com = itens.filter((i) => temTexto(i.endereco));
  const sem = itens.filter((i) => !temTexto(i.endereco));
  const r = ordenarVisitas(com, ROTA_PARTIDA, { geo: (opcoes && opcoes.geo) || null, vizinhanca: (opcoes && opcoes.vizinhanca) || null });
  return { itens: r.itens.concat(sem), semEndereco: sem.length, explicacao: explicacaoDaOrdem(r), metodo: r.metodo };
}

// Aprende com o que a pessoa ajustou à mão: as ruas que ela pôs em sequência passam a contar como vizinhas na próxima ordem.
// Só nome de rua e bairro (nunca número, nome ou arquivo). Devolve a vizinhança nova (quem guarda é o console).
export function aprenderAjuste(vizinhanca, itensEmOrdem) {
  const com = itensEmOrdem.filter((i) => temTexto(i.endereco));
  if (com.length < 2) return vizinhanca;
  return aprenderVizinhanca(vizinhanca, com, ROTA_PARTIDA);
}

// ------------------------------------------------------------------ PDF unificado

// Corta no limite da coluna COM reticências (cortar em silêncio faria o endereço parecer terminar ali).
function caber(texto, fonte, tamanho, max) {
  let t = textoSeguroPdf(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= max) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + '...', tamanho) > max) t = t.slice(0, -1);
  return t.replace(/\s+$/, '') + '...';
}

// blocos: [{ label, itens: [{ nome, endereco }] }] (itens na ordem final). Texto das linhas do roteiro, 19 por página.
export function linhasRoteiro(blocos) {
  const linhas = [];
  blocos.forEach((b) => {
    if (!b.itens.length) return;
    linhas.push({ texto: b.label, tamanho: 12, bold: true, cor: 'azul' });
    b.itens.forEach((item, i) => {
      linhas.push({ endereco: `${i + 1}.  ${temTexto(item.endereco) ? String(item.endereco).trim() : '(endereço não informado)'}`, arquivo: String(item.nome || '').replace(/\.pdf$/i, ''), tamanho: 10 });
    });
  });
  return linhas;
}
export const ROTEIRO_POR_PAGINA = 19;

export function linhasCapaRota(blocos) {
  const total = blocos.reduce((s, b) => s + b.itens.length, 0);
  return [
    { texto: 'Folhas de família unificadas — rota de visita', tamanho: 16, bold: true, cor: 'azul' },
    { texto: `Partida: ${ROTA_PARTIDA}`, tamanho: 10.5 },
    ...blocos.map((b) => ({ texto: `${b.label} — ${familias(b.itens.length)}`, tamanho: 10.5, bold: true })),
    { texto: `Total: ${familias(total)} (${total} folha${total === 1 ? '' : 's'} resumo)`, tamanho: 10.5, bold: true }
  ];
}

export function nomeArquivoRota(dataTexto) {
  return `Visitas - Folhas de Familia Unificadas - ${textoSeguroPdf(dataTexto).replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
}

function pagina(PDFLib, doc, fontes, linhas, agora) {
  const { rgb } = PDFLib;
  const cores = { azul: rgb(0x0B / 255, 0x2F / 255, 0x7A / 255), slate: rgb(0x33 / 255, 0x41 / 255, 0x55 / 255) };
  const page = doc.addPage([842, 595]); // A4 paisagem, em pontos
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 52, width, height: 52, color: cores.azul });
  page.drawRectangle({ x: 0, y: height - 55, width, height: 3, color: rgb(1, 223 / 255, 0) });
  page.drawText('Paulus · Visitas Domiciliares', { x: 32, y: height - 30, size: 14, font: fontes.bold, color: rgb(1, 1, 1) });
  page.drawText(textoSeguroPdf('CRAS Cristiana Vicente Nunes · SEMADS · Paulo Xavier, Psicólogo, CRP-20/09816'), { x: 32, y: height - 44, size: 8.5, font: fontes.regular, color: rgb(0.78, 0.84, 1) });
  let y = height - 100;
  for (const l of linhas) {
    const tam = l.tamanho || 11;
    if (l.endereco !== undefined) {
      page.drawText(caber(l.endereco, fontes.regular, tam, 520) + '   ·   ' + caber(l.arquivo, fontes.regular, 8, 190), { x: 32, y, size: tam, font: fontes.regular, color: cores.slate });
    } else {
      page.drawText(textoSeguroPdf(l.texto), { x: 32, y, size: tam, font: l.bold ? fontes.bold : fontes.regular, color: cores[l.cor] || cores.slate });
    }
    y -= tam + 12;
  }
  const aviso = 'Contém dados pessoais protegidos (LGPD) — uso restrito ao serviço.';
  page.drawText(textoSeguroPdf(`Gerado em ${agora}`), { x: 32, y: 24, size: 8, font: fontes.regular, color: cores.slate });
  page.drawText(textoSeguroPdf(aviso), { x: width - 32 - fontes.regular.widthOfTextAtSize(aviso, 8), y: 24, size: 8, font: fontes.regular, color: cores.slate });
}

async function abrir(PDFLib, item) {
  try {
    return await PDFLib.PDFDocument.load(item.bytes);
  } catch (e) {
    if (/encrypt/i.test(String(e && e.message))) throw new Error(`O arquivo "${item.nome}" é protegido (criptografado) e não pode ser juntado. Abra-o, escolha Imprimir > Salvar como PDF e envie a cópia.`);
    throw new Error(`Não consegui abrir o arquivo "${item.nome}". Confirme se é um PDF válido e tente enviá-lo de novo.`);
  }
}

// blocos: [{ label, itens: [{ nome, endereco, bytes }] }] na ordem de visita. Devolve { bytes, total, paginasFolhas } ou lança Error legível.
export async function montarPdfRota({ PDFLib, blocos, agora = new Date() }) {
  if (!PDFLib || !PDFLib.PDFDocument) throw new Error('A biblioteca de PDF não está disponível.');
  const total = blocos.reduce((s, b) => s + b.itens.length, 0);
  if (!total) throw new Error('Adicione pelo menos uma folha resumo (PDF) em algum dos blocos antes de gerar o PDF unificado.');
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const fontes = { bold: await doc.embedFont(StandardFonts.HelveticaBold), regular: await doc.embedFont(StandardFonts.Helvetica) };
  const dataTexto = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(agora);
  try {
    doc.setTitle('Folhas de família unificadas — rota de visita');
    doc.setSubject('Visitas domiciliares — CRAS Cristiana Vicente Nunes');
    doc.setAuthor('Paulus · Paulo Xavier — CRP-20/09816');
    doc.setCreator('Paulus'); doc.setProducer('Paulus'); doc.setCreationDate(agora);
  } catch (e) { /* metadados são opcionais */ }

  pagina(PDFLib, doc, fontes, linhasCapaRota(blocos), dataTexto);
  const roteiro = linhasRoteiro(blocos);
  const paginasRoteiro = Math.max(1, Math.ceil(roteiro.length / ROTEIRO_POR_PAGINA));
  for (let p = 0; p < paginasRoteiro; p++) {
    pagina(PDFLib, doc, fontes, [
      { texto: `Roteiro de visita${paginasRoteiro > 1 ? ` (${p + 1}/${paginasRoteiro})` : ''} — partida: ${ROTA_PARTIDA}`, tamanho: 13, bold: true, cor: 'azul' }
    ].concat(roteiro.slice(p * ROTEIRO_POR_PAGINA, (p + 1) * ROTEIRO_POR_PAGINA)), dataTexto);
  }

  let paginasFolhas = 0;
  for (const bloco of blocos) {
    if (!bloco.itens.length) continue;
    pagina(PDFLib, doc, fontes, [
      { texto: bloco.label, tamanho: 15, bold: true, cor: 'azul' },
      { texto: `${familias(bloco.itens.length)}, na ordem de visita`, tamanho: 10.5 }
    ], dataTexto);
    const origens = await Promise.all(bloco.itens.map((item) => abrir(PDFLib, item)));
    for (const origem of origens) {
      const paginas = await doc.copyPages(origem, origem.getPageIndices());
      paginas.forEach((p) => { doc.addPage(p); paginasFolhas += 1; });
    }
  }
  return { bytes: await doc.save(), total, paginasFolhas };
}
