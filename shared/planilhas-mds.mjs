// Planilhas do MDS (Repercussão de Condicionalidades), porte do Anona para o Paulus.
// Sem IA, sem rede, sem cota. Este módulo é puro: recebe as abas já lidas ([{ nome, linhas }]) e devolve linhas prontas.
// Organiza a planilha bruta do MDS por técnico do CRAS, lê mês/ano, lista os bairros, filtra por bairro e valida backups.
// Quem lê/escreve .xlsx e quem guarda no aparelho é a camada do console (console/planilhas-mds-ui.mjs).
// Testes: `node --test tests/planilhas-mds.test.mjs`.

import { bfAbasUteis, bfIdentificador, bfNomeAbaSeguro, bfPrepararRelatoriosIndividuais } from './relatorios-bf.mjs';

export const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const ABA_RESUMO = 'Resumo do território';
export const MAX_BYTES_PLANILHA = 5 * 1024 * 1024;
export const MAX_BASE64_BACKUP = 8 * 1024 * 1024;

// Cor da guia de cada técnico/equipe (a mesma em todas as planilhas: organizada, filtrada...).
export const CORES_ABAS_TECNICO = {
  [ABA_RESUMO]: '0B2F7A',
  'Fernanda Gomes': '159947',
  'Cléo Sousa': '7C3AED',
  'Marina Silvestre': 'DB2777',
  'Susy Andrade': 'D97706',
  'Paloma de Assis': '0891B2',
  'Rafaela Garcia': '4F46E5',
  'Território Volante': '65A30D'
};
export const CORES_RESUMO = {
  'Fernanda Gomes': 'E8F5E9',
  'Cléo Sousa': 'F3E8FF',
  'Marina Silvestre': 'FCE7F3',
  'Susy Andrade': 'FFF3E0',
  'Paloma de Assis': 'E0F7FA',
  'Rafaela Garcia': 'E8EAF6',
  'Território Volante': 'F0F9E8'
};
export const ORDEM_TECNICOS = ['Fernanda Gomes', 'Cléo Sousa', 'Marina Silvestre', 'Susy Andrade', 'Paloma de Assis', 'Rafaela Garcia', 'Território Volante'];

// Bairro (em maiúsculas, sem acento) -> [técnico/equipe, formação, nome do bairro]. Igual ao Anona.
export const MAPA_BAIRROS = {
  'BURITIS': ['Fernanda Gomes', 'Psicóloga', 'Buritis'],
  'BURITI': ['Fernanda Gomes', 'Psicóloga', 'Buritis'],
  'CAIMBE': ['Fernanda Gomes', 'Psicóloga', 'Caimbé'],
  'LIBERDADE': ['Cléo Sousa', 'Assistente Social', 'Liberdade'],
  'PRICUMA': ['Cléo Sousa', 'Assistente Social', 'Pricumã'],
  'CAMBARA': ['Marina Silvestre', 'Assistente Social', 'Cambará'],
  'OLIMPICO': ['Marina Silvestre', 'Assistente Social', 'Olímpico'],
  'TANCREDO NEVES': ['Marina Silvestre', 'Assistente Social', 'Tancredo Neves'],
  'CENTENARIO': ['Susy Andrade', 'Pedagoga', 'Centenário'],
  'NOVA CANAA': ['Susy Andrade', 'Pedagoga', 'Nova Canaã'],
  'CINTURAO VERDE': ['Paloma de Assis', 'Assistente Social', 'Cinturão Verde'],
  'JOQUEI CLUBE': ['Paloma de Assis', 'Assistente Social', 'Jóquei Clube'],
  'ASA BRANCA': ['Rafaela Garcia', 'Assistente Social', 'Asa Branca'],
  'ASA BRACA': ['Rafaela Garcia', 'Assistente Social', 'Asa Branca'],
  'ASAS BRANCA': ['Rafaela Garcia', 'Assistente Social', 'Asa Branca'],
  '13 DE SETEMBRO': ['Território Volante', 'Equipe volante', '13 de Setembro'],
  '13 DE SEEMBREO': ['Território Volante', 'Equipe volante', '13 de Setembro'],
  'MARECHAL RONDON': ['Território Volante', 'Equipe volante', 'Marechal Rondon'],
  'MARECHAL RONDON (OCUPACAO)': ['Território Volante', 'Equipe volante', 'Marechal Rondon'],
  'NOVA VIDA': ['Território Volante', 'Equipe volante', 'Nova Vida (Ocupação)'],
  'NOVA VIDA (OCUPACAO)': ['Território Volante', 'Equipe volante', 'Nova Vida (Ocupação)'],
  'PROFESSORA ARACELI SOUTO MAIOR': ['Território Volante', 'Equipe volante', 'Professora Araceli Souto Maior']
};

export const normalizeText = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const temTexto = (v) => String(v == null ? '' : v).trim() !== '';
const colunaId = (rotulo) => /\b(nis|cpf)\b/i.test(normalizeText(rotulo));
const ptSort = (a, b) => a.localeCompare(b, 'pt-BR');

function configDoBairro(bairro) {
  const key = normalizeText(bairro).toUpperCase();
  let config = MAPA_BAIRROS[key];
  if (!config && key.includes('ARACELI') && key.includes('SOUTO')) config = MAPA_BAIRROS['PROFESSORA ARACELI SOUTO MAIOR'];
  if (!config && key.includes('PROF') && key.includes('ARACEL')) config = MAPA_BAIRROS['PROFESSORA ARACELI SOUTO MAIOR'];
  if (!config && key.includes('TANCREDO')) config = MAPA_BAIRROS['TANCREDO NEVES'];
  return config || null;
}

// ------------------------------------------------------------------ mês e ano

export function adivinharMesAnoNome(nomeArquivo) {
  const map = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  const norm = String(nomeArquivo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let mes = null; let ano = null;
  // Só vale mês escrito como palavra (jan, janeiro, mar, marco...), para não confundir com pedaços de outras palavras.
  const mMes = norm.match(/(?<![a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:eiro|ereiro|co|il|o|ho|sto|embro|ubro)?(?![a-z])/);
  if (mMes) mes = map[mMes[1]];
  const mAno = norm.match(/20\d{2}/);
  if (mAno) ano = parseInt(mAno[0], 10);
  return { mes, ano };
}

export function adivinharMesAnoAbas(abas) {
  const meses = { janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
  for (const aba of abas || []) {
    for (const row of (aba.linhas || []).slice(0, 15)) {
      const text = row.map((v) => String(v || '')).join(' ');
      const m = text.match(/(?:per[ií]odo[^:]*:\s*)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*[/ de-]+\s*(20\d{2})/i);
      if (m) return { mes: meses[normalizeText(m[1])], ano: parseInt(m[2], 10) };
    }
  }
  return { mes: null, ano: null };
}

// Mês/ano para guardar: o que a planilha diz, senão o nome do arquivo, senão uma data no nome (ddmmaaaa), senão hoje.
export function descobrirMesAno(abas, nomeArquivo, agora = new Date()) {
  const doBook = adivinharMesAnoAbas(abas);
  let r = doBook.mes !== null && doBook.ano !== null ? doBook : adivinharMesAnoNome(nomeArquivo);
  if (r.mes === null || r.ano === null) {
    const d = String(nomeArquivo || '').match(/(\d{2})(\d{2})(20\d{2})/);
    if (d) r = { mes: parseInt(d[2], 10) - 1, ano: parseInt(d[3], 10) };
  }
  if (r.mes === null || r.mes < 0 || r.mes > 11 || !r.ano) r = { mes: agora.getMonth(), ano: agora.getFullYear() };
  return r;
}

// ------------------------------------------------------------------ organizar a planilha bruta do MDS por técnico

const MANTER_INFO = /^(Programa Bolsa Família|Ministério do Desenvolvimento|Secretaria Nacional de Renda|UF:|Município:|Período da Repercusão:|Período da Repercussão:|Tipo de Benefício:|Data\/hora de geração:|Efeito:|Total de descumpridores:|Total de famílias com efeito:)/i;

// abas: [{ nome, linhas }] do relatório bruto. Devolve { ok:true, cabecalho, grupos:[{ equipe, formacao, bairros, linhas }], informacoes, bairrosNaoMapeados:[{bairro,qtd}], totalNaoMapeadas }
// ou { ok:false, texto }. Cada linha sai como [bairro do território, técnico/equipe, formação, ...colunas do MDS].
export function organizarRepercussao(abas) {
  const grupos = new Map();
  const naoMapeados = new Map();
  let rawHeader = null;
  const informacoes = ['CRAS Cristiana Vicente Nunes'];
  const nisVistos = new Set(); // mesmo integrante em duas abas (consolidada x CRAS) entra uma vez só
  bfAbasUteis(abas || []).forEach((aba) => {
    const rows = aba.linhas || [];
    const headerIndex = rows.findIndex((row) => {
      const labels = row.map((v) => normalizeText(v));
      return labels.some((v) => v === 'nº da linha' || v === 'n da linha') && labels.includes('bairro');
    });
    if (headerIndex < 0) return;
    const h = rows[headerIndex];
    if (!rawHeader) rawHeader = h;
    rows.slice(0, headerIndex).forEach((row) => row.forEach((value) => {
      const text = String(value || '').trim();
      if (MANTER_INFO.test(text) && !informacoes.includes(text)) informacoes.push(text);
    }));
    const bairroIdx = h.findIndex((v) => normalizeText(v) === 'bairro');
    const responsavelIdx = h.findIndex((v) => normalizeText(v) === 'nome do responsavel familiar');
    const efeitoIdx = h.findIndex((v) => normalizeText(v) === 'efeito');
    const nisIntegIdx = h.findIndex((v) => { const l = normalizeText(v); return l.includes('nis') && l.includes('integrante'); });
    let currentBairro = ''; let currentResponsavel = ''; let currentEfeito = ''; let currentFamilyValues = [];
    rows.slice(headerIndex + 1).forEach((row) => {
      if (!row.some(temTexto)) return;
      // Linha adicional da família (outro integrante): sem bairro e sem os campos iniciais. O tamanho é medido sem as células
      // vazias do final; vale também a forma "alinhada" (dados do integrante já nas colunas certas, com as 12 primeiras vazias).
      let ultimaCol = row.length; while (ultimaCol > 0 && !temTexto(row[ultimaCol - 1])) ultimaCol--;
      const inicioVazio = row.slice(0, 12).every((v) => !temTexto(v));
      const semBairro = !temTexto(row[bairroIdx]);
      const isCompacta = semBairro && ultimaCol > 0 && ultimaCol <= 6 && !inicioVazio;
      const isAlinhada = semBairro && ultimaCol > 12 && inicioVazio;
      const isContinuation = (isCompacta || isAlinhada) && h.length > 16 && currentFamilyValues.length > 0;
      const fullRow = Array(h.length).fill('');
      if (isContinuation) {
        if (isCompacta) row.forEach((value, index) => { if (12 + index < fullRow.length) fullRow[12 + index] = value; });
        else row.forEach((value, index) => { if (index >= 12 && index < fullRow.length) fullRow[index] = value; });
        currentFamilyValues.forEach((value, index) => { if (index < 12) fullRow[index] = value; });
      } else {
        row.forEach((value, index) => { if (index < fullRow.length) fullRow[index] = value; });
      }
      const rowBairro = String(fullRow[bairroIdx] || '').trim();
      if (rowBairro) currentBairro = rowBairro;
      if (!currentBairro) return;
      if (!isContinuation) currentFamilyValues = fullRow.slice(0, 12);
      if (responsavelIdx >= 0 && temTexto(fullRow[responsavelIdx])) currentResponsavel = String(fullRow[responsavelIdx]).trim();
      if (efeitoIdx >= 0 && temTexto(fullRow[efeitoIdx])) currentEfeito = String(fullRow[efeitoIdx]).trim();
      if (responsavelIdx >= 0 && !temTexto(fullRow[responsavelIdx]) && currentResponsavel) fullRow[responsavelIdx] = currentResponsavel;
      if (efeitoIdx >= 0 && !temTexto(fullRow[efeitoIdx]) && currentEfeito) fullRow[efeitoIdx] = currentEfeito;
      const config = configDoBairro(currentBairro);
      if (!config) { naoMapeados.set(currentBairro, (naoMapeados.get(currentBairro) || 0) + 1); return; }
      const [equipe, formacao, bairroNome] = config;
      const nisInteg = nisIntegIdx >= 0 ? String(fullRow[nisIntegIdx] || '').replace(/\D/g, '') : '';
      if (nisInteg) { if (nisVistos.has(nisInteg)) return; nisVistos.add(nisInteg); }
      if (!grupos.has(equipe)) grupos.set(equipe, { equipe, formacao, bairros: new Set(), linhas: [] });
      const g = grupos.get(equipe);
      g.linhas.push([bairroNome, equipe, formacao, ...fullRow]);
      g.bairros.add(bairroNome);
    });
  });
  if (!rawHeader || !grupos.size) return { ok: false, texto: 'Não encontrei o cabeçalho do relatório bruto ou nenhum bairro do mapa do CRAS.' };
  const cabecalho = ['Bairro do território', 'Técnico/equipe', 'Formação', ...rawHeader];
  // NIS/CPF lidos como número perdem o zero à esquerda: restaura como texto de 11 dígitos.
  const ehId = cabecalho.map(colunaId);
  const ordenados = [...grupos.values()].sort((a, b) => ORDEM_TECNICOS.indexOf(a.equipe) - ORDEM_TECNICOS.indexOf(b.equipe)).map((g) => ({
    equipe: g.equipe, formacao: g.formacao, bairros: [...g.bairros].sort(ptSort),
    linhas: g.linhas.map((r) => r.map((v, i) => (ehId[i] ? bfIdentificador(v) : v)))
  }));
  const naoMapeadasLista = [...naoMapeados.entries()].map(([bairro, qtd]) => ({ bairro, qtd }));
  return { ok: true, cabecalho, grupos: ordenados, informacoes, bairrosNaoMapeados: naoMapeadasLista, totalNaoMapeadas: naoMapeadasLista.reduce((s, x) => s + x.qtd, 0) };
}

// Resumo (uma linha por técnico) a partir do resultado de organizarRepercussao ou de filtrarPorBairros.
export const CABECALHO_RESUMO = ['Técnico/equipe', 'Formação', 'Bairros agrupados', 'Nº de bairros', 'Registros no relatório'];

// ------------------------------------------------------------------ bairros e filtro

function posBairro(header) {
  return (header || []).findIndex((h) => String(h).trim().toLowerCase() === 'bairro do território');
}

export function bairrosDaPlanilha(abas) {
  const bairros = new Set();
  (abas || []).forEach((aba) => {
    if (aba.nome === ABA_RESUMO) return;
    const rows = aba.linhas || [];
    const idx = posBairro(rows[0]);
    if (idx < 0) return;
    rows.slice(1).forEach((row) => { if (row[idx]) bairros.add(String(row[idx]).trim()); });
  });
  return [...bairros].filter(Boolean).sort(ptSort);
}

// selecionados: bairros escolhidos (vazio = todos). Devolve { ok, grupos:[{ nome, header, linhas, formacao, bairros }], informacoes:[...], texto? }.
export function filtrarPorBairros(abas, selecionados) {
  const sel = Array.isArray(selecionados) ? selecionados : [];
  const grupos = [];
  let informacoes = [];
  (abas || []).forEach((aba) => {
    const rows = (aba.linhas || []);
    if (!rows.length) return;
    if (aba.nome === ABA_RESUMO) {
      const ini = rows.findIndex((r) => String(r[0] || '').trim() === 'INFORMAÇÕES DO RELATÓRIO');
      if (ini >= 0) informacoes = rows.slice(ini).filter((r) => r.some(temTexto)).map((r) => String(r[0]));
      return;
    }
    const header = rows[0];
    const idx = posBairro(header);
    const filtradas = idx < 0 ? rows.slice(1) : rows.slice(1).filter((row) => !sel.length || sel.includes(String(row[idx]).trim()));
    if (!filtradas.length) return;
    const bairros = idx < 0 ? [] : [...new Set(filtradas.map((row) => String(row[idx] || '').trim()).filter(Boolean))].sort(ptSort);
    grupos.push({ nome: aba.nome, header, linhas: filtradas, formacao: (filtradas[0] && filtradas[0][2]) || '', bairros });
  });
  if (!grupos.length) return { ok: false, texto: 'Nenhum registro encontrado para os bairros escolhidos.' };
  return { ok: true, grupos, informacoes };
}

// ------------------------------------------------------------------ nomes de arquivo

export function nomeArquivoOrganizada(mes, ano) {
  return `Repercussão ${MESES_NOMES[mes] || 'Mês'} de ${ano} (CRAS Cristiana).xlsx`;
}

export function nomeArquivoFiltrada(filename, selecionados) {
  const base = String(filename || 'Repercussao').replace(/\.(xlsx|xls|csv)$/i, '');
  return base + ((selecionados && selecionados.length) ? '_filtrada' : '_completa') + '.xlsx';
}

// ------------------------------------------------------------------ backup (mesmo formato do Anona: os dois leem o arquivo um do outro)

export function criarBackup(reports, agora = new Date()) {
  return { app: 'Paulus', tipo: 'backup-repercussao', geradoEm: agora.toISOString(), reports };
}

const novoId = () => 'restaurado_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

// Backup é um arquivo de fora: nada dele vai direto para a tela. Cada campo é reconstruído e validado
// (id só com letras/números/_/-, mês e ano inteiros, tamanho numérico, base64 de verdade).
// Devolve { ok, validos, novos, jaExistem, descartados } ou { ok:false, texto }.
export function lerBackup(texto, existentes) {
  let payload;
  try { payload = JSON.parse(texto); } catch (e) { return { ok: false, texto: 'O arquivo não é um backup válido (JSON corrompido).' }; }
  const vindos = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.reports) ? payload.reports : null);
  if (!vindos) return { ok: false, texto: 'Formato de backup não reconhecido.' };
  const validos = vindos.map((r) => {
    if (!r || typeof r !== 'object' || typeof r.dataBase64 !== 'string') return null;
    if (r.dataBase64.length <= 100 || r.dataBase64.length > MAX_BASE64_BACKUP || !/^[A-Za-z0-9+/=\s]+$/.test(r.dataBase64)) return null;
    const mes = Number.isInteger(r.mes) && r.mes >= 0 && r.mes <= 11 ? r.mes : null;
    const ano = Number.isInteger(r.ano) && r.ano >= 2000 && r.ano <= 2100 ? r.ano : null;
    if (mes === null || ano === null) return null;
    const idOk = typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id);
    return {
      id: idOk ? r.id : novoId(),
      filename: String(r.filename || 'planilha.xlsx').replace(/[\u0000-\u001f<>"']/g, '').slice(0, 150),
      mes, ano,
      sizeKB: Math.round((r.dataBase64.length * 3 / 4) / 1024),
      uploadedAt: Number.isFinite(r.uploadedAt) ? r.uploadedAt : Date.now(),
      dataBase64: r.dataBase64.replace(/\s+/g, '')
    };
  }).filter(Boolean);
  if (!validos.length) return { ok: false, texto: 'Nenhuma planilha válida encontrada neste arquivo.' };
  const ids = new Set((existentes || []).map((r) => r.id));
  const novos = validos.filter((r) => !ids.has(r.id)); // não duplica planilhas que já existem (mesmo id)
  return { ok: true, validos, novos, jaExistem: validos.length - novos.length, descartados: vindos.length - validos.length };
}

export function nomeArquivoBackup(dataTexto) {
  return `Paulus - backup planilhas Repercussao - ${String(dataTexto).replace(/[\\/:*?"<>|]/g, '-')}.json`;
}

export function resumoArmazenamento(reports) {
  const mb = reports.reduce((s, r) => s + (r.sizeKB || 0), 0) / 1024;
  return { quantidade: reports.length, mb, texto: reports.length ? `${reports.length} planilha(s) guardada(s) neste aparelho · ~${mb.toFixed(1).replace('.', ',')} MB usados` : '' };
}

// ------------------------------------------------------------------ relatórios individuais dos técnicos gerais

// Abas de técnico da planilha guardada: tudo menos o Resumo e o Território Volante (a equipe volante tem fluxo próprio, na divisão por técnico).
export function abasTecnicosGerais(abas) {
  return (abas || []).filter((aba) => {
    const n = normalizeText(aba.nome);
    return !n.startsWith('resumo') && n !== 'territorio volante';
  });
}

// Prepara um relatório por aba de técnico, no mesmo formato do PDF individual do Território Volante.
// opcoes.mesTexto (ex.: "Setembro/2026") entra quando a aba não traz o mês (a planilha guardada só tem o mês no Resumo e no registro).
// Devolve { ok, relatorios, semRegistros:[nome] } ou { ok:false, texto }.
export function prepararRelatoriosTecnicosGerais(abas, opcoes = {}) {
  const tecnicos = abasTecnicosGerais(abas);
  if (!tecnicos.length) return { ok: false, texto: 'Não encontrei nenhuma aba de técnico nesta planilha (só sobrou o Território Volante e/ou o Resumo).' };
  const relatorios = [];
  const semRegistros = [];
  tecnicos.forEach((aba) => {
    const r = bfPrepararRelatoriosIndividuais([aba], { ordenarPorRota: false, ...opcoes });
    if (r.ok && r.relatorios.length) {
      r.relatorios.forEach((rel) => { if ((!rel.mes || rel.mes === '—') && opcoes.mesTexto) rel.mes = opcoes.mesTexto; });
      relatorios.push(...r.relatorios);
    } else semRegistros.push(aba.nome);
  });
  if (!relatorios.length) return { ok: false, texto: 'Nenhum técnico desta planilha tinha registros com a coluna "Efeito" para gerar relatório.' };
  return { ok: true, relatorios, semRegistros };
}

// ------------------------------------------------------------------ montar a planilha organizada/filtrada (Resumo + uma aba por técnico)

// grupos: [{ nome, formacao, bairros:[...], linhas:[...] }]; cabecalho: títulos das colunas; informacoes: linhas do bloco "INFORMAÇÕES DO RELATÓRIO".
// Devolve { abas:[{ nome, aoa, tipo, cor, formulas? }] } no formato que o console grava com o xlsx-js-style.
// O Resumo vem primeiro, com contagens vivas (fórmulas) e total; cada técnico mantém a mesma cor de guia em todas as planilhas.
export function montarAbasPlanilha({ cabecalho, grupos, informacoes }) {
  const usados = new Set();
  const nomeResumo = bfNomeAbaSeguro(ABA_RESUMO, usados);
  const itens = (grupos || []).map((g) => ({ g, aba: bfNomeAbaSeguro(g.nome, usados) }));
  const aoaResumo = [CABECALHO_RESUMO.slice()];
  const formulas = [];
  itens.forEach(({ g, aba }, i) => {
    const bairros = g.bairros || [];
    aoaResumo.push([g.nome, g.formacao || '', bairros.join('; '), bairros.length, g.linhas.length]);
    formulas.push({ celula: `E${i + 2}`, f: `COUNTA('${aba.replace(/'/g, "''")}'!A:A)-1`, v: g.linhas.length });
  });
  const ultima = itens.length + 1;
  aoaResumo.push(['TOTAL', '', '', '', itens.reduce((t, { g }) => t + g.linhas.length, 0)]);
  formulas.push({ celula: `E${ultima + 1}`, f: `SUM(E2:E${ultima})`, v: itens.reduce((t, { g }) => t + g.linhas.length, 0) });
  const info = (informacoes || []).filter(temTexto);
  if (info.length) {
    aoaResumo.push([]);
    aoaResumo.push(['INFORMAÇÕES DO RELATÓRIO']);
    info.filter((t) => t !== 'INFORMAÇÕES DO RELATÓRIO').forEach((t) => aoaResumo.push([t]));
  }
  const abas = [{ nome: nomeResumo, aoa: aoaResumo, tipo: 'resumo', cor: CORES_ABAS_TECNICO[ABA_RESUMO], formulas }];
  itens.forEach(({ g, aba }) => {
    abas.push({ nome: aba, aoa: [cabecalho, ...g.linhas], tipo: 'tecnico', cor: CORES_ABAS_TECNICO[g.nome] || CORES_ABAS_TECNICO[ABA_RESUMO] });
  });
  return { abas };
}

// Atalho: resultado de organizarRepercussao -> grupos no formato de montarAbasPlanilha.
export function gruposDeOrganizada(org) {
  return org.grupos.map((g) => ({ nome: g.equipe, formacao: g.formacao, bairros: g.bairros, linhas: g.linhas }));
}
// Atalho: resultado de filtrarPorBairros -> { cabecalho, grupos, informacoes }.
export function dadosDeFiltrada(f) {
  return { cabecalho: f.grupos[0].header, grupos: f.grupos.map((g) => ({ nome: g.nome, formacao: g.formacao, bairros: g.bairros, linhas: g.linhas })), informacoes: f.informacoes };
}
