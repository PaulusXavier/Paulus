// Relatórios do Bolsa Família feitos inteiramente no aparelho (porte do Anona para o Paulus).
// Sem IA, sem rede, sem cota: só recebe linhas já lidas da planilha e devolve linhas prontas.
//
// PASSO 1 (este arquivo): leitura do relatório de condicionalidades do MDS + "Famílias Recorrentes"
// (famílias que aparecem em dois meses, por técnico). A leitura e a gravação do .xlsx ficam na camada
// do console (passo 2); aqui tudo é função pura, testável em Node: `node --test tests/relatorios-bf.test.mjs`.
// A interface da etapa 1 está em console/relatorios-ui.mjs; o processamento permanece neste módulo puro,
// para poder ser testado no Node e reutilizado sem enviar os dados para a conversa ou para a IA.
//
// Entrada de planilha: abas = [{ nome: 'Paulo Xavier - Psicólogo', linhas: [[...], [...]] }]  (matriz de células).
// Nada é guardado; o chamador decide o que fazer com o resultado e descarta os dados.

import { ordenarVisitas } from './visitas.mjs';

export const bfNorm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// NIS/CPF vindos como NÚMERO perdem o zero à esquerda: devolve com 11 dígitos (igual ao Anona).
export function bfIdentificador(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e11) return String(v).padStart(11, '0');
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return String(v);
  return v;
}

// Nome de aba que o Excel aceita: sem \ / ? * [ ] :, até 31 caracteres, sem repetir (ignora maiúsculas).
export function bfNomeAbaSeguro(nome, usados) {
  const limpar = (t) => String(t || '').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').slice(0, 31).replace(/^['\s]+|['\s]+$/g, '');
  let limpo = limpar(nome) || 'Dados';
  const base = limpo; let n = 2;
  while (usados.has(limpo.toLowerCase())) limpo = limpar(base.slice(0, 28) + ' ' + n++);
  usados.add(limpo.toLowerCase());
  return limpo;
}

// O relatório bruto do MDS traz uma aba consolidada e uma aba por CRAS com as MESMAS famílias.
// Recebe [{nome, nis:[...]}] e devolve os nomes das abas redundantes (todos os integrantes já estão em outra aba que fica).
export function bfAbasRedundantes(abas) {
  const dig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const conj = (abas || []).map((a) => ({ nome: a.nome, set: new Set((a.nis || []).map(dig).filter(Boolean)) }));
  const fora = new Set();
  conj.forEach((a, i) => {
    if (!a.set.size) return;
    const coberta = conj.some((b, j) => j !== i && !fora.has(b.nome) && (b.set.size > a.set.size || (b.set.size === a.set.size && j < i)) && [...a.set].every((n) => b.set.has(n)));
    if (coberta) fora.add(a.nome);
  });
  return [...fora];
}

const cheia = (linha) => Array.isArray(linha) && linha.some((v) => String(v == null ? '' : v).trim() !== '');
const posCabecalho = (linhas) => linhas.slice(0, 25).findIndex((r) => Array.isArray(r) && r.some((v) => bfNorm(v) === 'efeito'));

// Mantém só as abas úteis (tira as redundantes). Aceita a lista de nomes a considerar (opcional).
export function bfAbasUteis(abas, nomes) {
  const lista = (nomes && nomes.length) ? abas.filter((a) => nomes.includes(a.nome)) : abas.slice();
  if (lista.length < 2) return lista;
  const marcadas = lista.map((a) => {
    const linhas = (a.linhas || []).filter(cheia);
    const hi = posCabecalho(linhas);
    if (hi < 0) return { nome: a.nome, nis: [] };
    const idx = linhas[hi].findIndex((v) => { const l = bfNorm(v); return l.includes('nis') && l.includes('integrante'); });
    return { nome: a.nome, nis: idx < 0 ? [] : linhas.slice(hi + 1).map((r) => r[idx]) };
  });
  const fora = new Set(bfAbasRedundantes(marcadas));
  return lista.filter((a) => !fora.has(a.nome));
}

// Lê o relatório de condicionalidades e devolve { mes, familias: Map(chave -> família) }.
// Quando o arquivo vem dividido por técnico (uma aba por pessoa), o NOME DA ABA é quem manda no técnico,
// porque a coluna "Técnico/equipe" só traz o rótulo genérico "Território Volante".
export function bfLerFamilias(abas) {
  const familias = new Map();
  let mes = '';
  const comDados = bfAbasUteis(abas).filter((a) => !bfNorm(a.nome).includes('resumo'));
  const dividido = comDados.length > 1;
  comDados.forEach((aba) => {
    const linhas = (aba.linhas || []).filter(cheia);
    if (!linhas.length) return;
    const hp = Math.max(0, posCabecalho(linhas));
    const cab = linhas[hp].map(bfNorm);
    const efeitoIdx = cab.findIndex((h) => h === 'efeito');
    if (efeitoIdx < 0) return; // não é aba de condicionalidades (ex.: resumo)
    const nisIdx = cab.findIndex((h) => h.includes('nis') && h.includes('responsavel'));
    const cpfIdx = cab.findIndex((h) => h.includes('cpf') && h.includes('responsavel'));
    let nomeIdx = cab.findIndex((h) => h === 'nome do responsavel familiar');
    if (nomeIdx < 0) nomeIdx = cab.findIndex((h) => h.includes('nome') && h.includes('responsavel'));
    const bairroIdx = cab.findIndex((h) => h === 'bairro');
    const endIdx = cab.findIndex((h) => h.includes('endereco'));
    const tecIdx = cab.findIndex((h) => h.includes('tecnico') && h.includes('equipe'));
    const integIdx = cab.findIndex((h) => h.includes('nome') && h.includes('integrante'));
    const mesIdx = cab.findIndex((h) => h.includes('mes') && h.includes('repercuss'));
    const tecnicoDaAba = String(aba.nome).split(' - ')[0].trim();
    const txt = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
    let ultimaChave = '', ultimoNis = '', ultimoCpf = '';
    linhas.slice(hp + 1).forEach((r) => {
      let nis = nisIdx >= 0 ? String(bfIdentificador(r[nisIdx]) || '').trim() : '';
      let cpf = cpfIdx >= 0 ? String(bfIdentificador(r[cpfIdx]) || '').trim() : '';
      // Outro integrante da mesma família (sem repetir NIS/CPF do responsável) herda a família da linha anterior.
      if (!nis && !cpf && ultimaChave) { nis = ultimoNis; cpf = ultimoCpf; }
      const chave = nis || cpf;
      if (!chave) return;
      ultimaChave = chave; ultimoNis = nis; ultimoCpf = cpf;
      if (!mes && mesIdx >= 0 && txt(r, mesIdx)) mes = txt(r, mesIdx);
      const tecCol = txt(r, tecIdx);
      const generico = /^(territ[oó]rio volante|equipe volante)$/i.test(tecCol);
      const tecnico = dividido ? tecnicoDaAba : (tecCol && !generico ? tecCol : '');
      if (!familias.has(chave)) {
        familias.set(chave, { nis: nis || '—', cpf: cpf || '—', nome: txt(r, nomeIdx), bairro: txt(r, bairroIdx), endereco: txt(r, endIdx), tecnico, integrantes: [], registros: 0 });
      }
      const f = familias.get(chave);
      f.registros++;
      if (!f.tecnico && tecnico) f.tecnico = tecnico;
      const integrante = txt(r, integIdx), efeito = txt(r, efeitoIdx);
      if (integrante || efeito) f.integrantes.push(`${integrante || '—'} (${efeito || '—'})`);
    });
  });
  return { mes, familias };
}

const TECNICOS_VOLANTE = [
  { nome: 'Paulo Xavier', formacao: 'Psicólogo', cor: '0B2F7A' },
  { nome: 'Danilo Braga', formacao: 'Psicólogo', cor: '159947' },
  { nome: 'Keomara Teles', formacao: 'Assistente Social', cor: 'DB2777' }
];
const valorPreenchido = (v) => String(v == null ? '' : v).trim() !== '';
const primeiraLetra = (v) => String(v == null ? '' : v).trim().charAt(0).toLocaleUpperCase('pt-BR') || '—';

// Prepara a planilha MDS do Território Volante para a divisão local por técnico.
// Cada família fica inteira com um técnico, mesmo quando os integrantes estão em várias linhas.
export function bfPrepararDivisaoTecnicos(abas) {
  const candidatas = [];
  (abas || []).forEach((aba) => {
    if (bfNorm(aba.nome).startsWith('resumo')) return;
    const linhas = (aba.linhas || []).filter(cheia);
    const indiceCabecalho = linhas.slice(0, 25).findIndex((linha) => {
      const cabecalho = linha.map(bfNorm);
      return cabecalho.some((h) => h.includes('nome'))
        && cabecalho.some((h) => h === 'efeito' || h === 'bairro' || h.includes('nis'));
    });
    if (indiceCabecalho >= 0) candidatas.push({ nome: aba.nome, linhas, indiceCabecalho });
  });
  const escolhida = candidatas.find((c) => bfNorm(c.nome).includes('volante')) || candidatas[0];
  if (!escolhida) return { ok: false, motivo: 'sem-tabela', texto: 'Não encontrei a tabela de condicionalidades. Confirme se há uma linha de cabeçalho com nome e Efeito, Bairro ou NIS.' };

  const cabecalho = escolhida.linhas[escolhida.indiceCabecalho].slice();
  const headerNorm = cabecalho.map(bfNorm);
  const linhasDados = escolhida.linhas.slice(escolhida.indiceCabecalho + 1).filter(cheia).map((linha) => linha.slice());
  if (!linhasDados.length) return { ok: false, motivo: 'sem-dados', texto: 'Não encontrei famílias abaixo do cabeçalho da tabela enviada.' };

  const nisRespIdx = headerNorm.findIndex((h) => h.includes('nis') && h.includes('responsavel'));
  const cpfRespIdx = headerNorm.findIndex((h) => h.includes('cpf'));
  let nomeIdx = headerNorm.findIndex((h) => h === 'nome do responsavel familiar');
  if (nomeIdx < 0) nomeIdx = headerNorm.findIndex((h) => h.includes('nome') && h.includes('responsavel'));
  if (nomeIdx < 0) nomeIdx = headerNorm.findIndex((h) => h.includes('nome'));
  if (nomeIdx < 0) nomeIdx = headerNorm.findIndex((h) => h.includes('responsavel') && h.includes('familiar'));
  if (nomeIdx < 0) nomeIdx = 0;
  const mesIdx = headerNorm.findIndex((h) => h.includes('mes') && h.includes('repercuss'));
  const colunasId = headerNorm.map((h, i) => h.includes('nis') || h.includes('cpf') ? i : -1).filter((i) => i >= 0);
  for (const linha of linhasDados) colunasId.forEach((i) => { linha[i] = bfIdentificador(linha[i]); });

  let mesRepercussao = '';
  if (mesIdx >= 0) {
    const linhaComMes = linhasDados.find((linha) => valorPreenchido(linha[mesIdx]));
    if (linhaComMes) mesRepercussao = String(linhaComMes[mesIdx]).trim();
  }
  if (!mesRepercussao) {
    for (const valor of escolhida.linhas.slice(0, escolhida.indiceCabecalho).flat()) {
      const texto = String(valor == null ? '' : valor).trim();
      const correspondencia = texto.match(/(?:per[ií]odo|m[eê]s)\s+da\s+repercuss[aã]o\s*:\s*(.+)/i);
      if (correspondencia) { mesRepercussao = correspondencia[1].trim(); break; }
    }
  }

  // As linhas dos outros integrantes herdam os campos da família na linha imediatamente anterior.
  const idsFamilia = [...new Set([nisRespIdx, cpfRespIdx, nomeIdx].filter((i) => i >= 0))];
  const acharColuna = (fn) => headerNorm.findIndex(fn);
  const colunasFamilia = [...new Set([...idsFamilia,
    acharColuna((h) => h === 'bairro'),
    acharColuna((h) => h.includes('endereco')),
    acharColuna((h) => h.includes('referencia') && h.includes('endereco')),
    acharColuna((h) => h === 'efeito'), mesIdx
  ].filter((i) => i >= 0))];
  if (idsFamilia.length) {
    for (let i = 1; i < linhasDados.length; i++) {
      const linha = linhasDados[i];
      if (idsFamilia.every((col) => !valorPreenchido(linha[col])) && linha.some(valorPreenchido)) {
        colunasFamilia.forEach((col) => {
          if (!valorPreenchido(linha[col])) linha[col] = linhasDados[i - 1][col] == null ? '' : linhasDados[i - 1][col];
        });
      }
    }
  }

  const grupos = new Map();
  linhasDados.forEach((linha, i) => {
    const nis = nisRespIdx >= 0 && valorPreenchido(linha[nisRespIdx]) ? String(linha[nisRespIdx]).trim() : '';
    const cpf = cpfRespIdx >= 0 && valorPreenchido(linha[cpfRespIdx]) ? String(linha[cpfRespIdx]).trim() : '';
    const id = nis || cpf;
    const nome = String(linha[nomeIdx] == null ? '' : linha[nomeIdx]).trim();
    const chave = id ? `${nis ? 'nis' : 'cpf'}:${id}` : (nome ? `nome:${bfNorm(nome)}` : `linha:${i}`);
    if (!grupos.has(chave)) grupos.set(chave, { nome, linhas: [] });
    const grupo = grupos.get(chave);
    if (!grupo.nome && nome) grupo.nome = nome;
    grupo.linhas.push(linha);
  });
  const listaGrupos = [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  const totalFamilias = listaGrupos.length;
  const base = Math.floor(totalFamilias / TECNICOS_VOLANTE.length);
  const resto = totalFamilias % TECNICOS_VOLANTE.length;
  let cursor = 0;
  const profissionais = TECNICOS_VOLANTE.map((tecnico, i) => {
    const tamanho = base + (i < resto ? 1 : 0);
    const gruposDoTecnico = listaGrupos.slice(cursor, cursor + tamanho);
    cursor += tamanho;
    const primeiras = gruposDoTecnico.length ? gruposDoTecnico[0].nome : '';
    const ultimas = gruposDoTecnico.length ? gruposDoTecnico[gruposDoTecnico.length - 1].nome : '';
    return {
      ...tecnico,
      totalFamilias: gruposDoTecnico.length,
      linhas: gruposDoTecnico.flatMap((grupo) => grupo.linhas),
      faixa: gruposDoTecnico.length ? `${primeiraLetra(primeiras)} a ${primeiraLetra(ultimas)}` : '—'
    };
  });

  const usados = new Set();
  const nomeResumo = bfNomeAbaSeguro('Resumo da divisão', usados);
  const abasSaida = [{
    nome: nomeResumo, tipo: 'resumo-tabela', cor: '0B2F7A',
    aoa: [
      ['Técnico responsável', 'Formação', 'Nº de famílias', 'Faixa alfabética (A a Z)', 'Mês de Repercussão'],
      ...profissionais.map((p) => [p.nome, p.formacao, p.totalFamilias, p.faixa, mesRepercussao || 'Não identificado no arquivo enviado']),
      ['Total', '', totalFamilias, '', '']
    ],
    formulas: [{ celula: 'C5', f: 'SUM(C2:C4)', v: totalFamilias }]
  }];
  profissionais.forEach((p) => {
    const formacaoAba = p.formacao.replace(/Assistente Social/i, 'Assist. Social');
    const nomeAba = bfNomeAbaSeguro(`${p.nome} - ${formacaoAba}`, usados);
    abasSaida.push({ nome: nomeAba, tipo: 'tecnico', tecnico: p.nome, cor: p.cor, aoa: [cabecalho, ...p.linhas] });
  });
  const mesArquivo = String(mesRepercussao || '').trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const nomeArquivo = mesArquivo
    ? `Território Volante - Divisão por técnico - ${mesArquivo}.xlsx`
    : 'Território Volante - Divisão por técnico.xlsx';
  return {
    ok: true, nomeArquivo, mesRepercussao, totalFamilias, totalRegistros: linhasDados.length,
    tecnicos: profissionais.map(({ nome, formacao, totalFamilias: total, faixa, cor }) => ({ nome, formacao, totalFamilias: total, faixa, cor })),
    abas: abasSaida,
    texto: `Planilha pronta: ${totalFamilias} família(s) distribuída(s) por ordem alfabética entre os três técnicos, com os integrantes mantidos juntos.`
  };
}

const BF_COLUNAS_RELATORIO = [
  { nome: 'NIS do Responsável Familiar', id: 'nis', match: (h) => h.includes('nis') && h.includes('responsavel') },
  { nome: 'CPF do Responsável', id: 'cpf', match: (h) => h.includes('cpf') && h.includes('responsavel') },
  { nome: 'Nome do Responsável Familiar', id: 'nome-responsavel', match: (h) => h.includes('nome') && h.includes('responsavel') },
  { nome: 'Endereço', id: 'endereco', match: (h) => h === 'endereco' },
  { nome: 'Bairro', id: 'bairro', match: (h) => h === 'bairro' },
  { nome: 'Referência do endereço', id: 'referencia', match: (h) => h.includes('referencia') && h.includes('endereco') },
  { nome: 'NIS do Integrante', id: 'nis-integrante', match: (h) => h.includes('nis') && h.includes('integrante') },
  { nome: 'Nome do Integrante', id: 'nome-integrante', match: (h) => h.includes('nome') && h.includes('integrante') },
  { nome: 'Motivo 1', id: 'motivo-1', match: (h) => h === 'motivo 1' },
  { nome: 'Motivo 2', id: 'motivo-2', match: (h) => h === 'motivo 2' },
  { nome: 'Efeito', id: 'efeito', match: (h) => h === 'efeito' }
];

const bfChaveCabecalho = (valor) => bfNorm(valor).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const bfLinhaTemDados = (linha) => Array.isArray(linha) && linha.some((v) => String(v == null ? '' : v).trim() !== '');

function bfDetectarCabecalhoRelatorio(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const chaves = (linhas[i] || []).map(bfChaveCabecalho);
    if (chaves.includes('efeito') && chaves.some((h) => h.includes('nome'))) return i;
  }
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    if ((linhas[i] || []).map(bfChaveCabecalho).includes('efeito')) return i;
  }
  return -1;
}

function bfFormacaoRelatorio(nomeAba, valorColuna) {
  const conhecidas = ['Psicólogo', 'Psicóloga', 'Assistente Social', 'Pedagogo', 'Pedagoga', 'Advogado', 'Advogada', 'Educador Social', 'Terapeuta Ocupacional'];
  const partes = String(nomeAba || '').split(' - ');
  let formacao = partes.length > 1 ? partes.slice(1).join(' - ').trim() : String(valorColuna || '').trim();
  if (/^assist\.?\s*social$/i.test(formacao)) formacao = 'Assistente Social';
  const chave = bfNorm(formacao);
  return conhecidas.find((item) => bfNorm(item) === chave)
    || conhecidas.find((item) => chave.length >= 3 && bfNorm(item).startsWith(chave))
    || String(valorColuna || formacao || '').trim();
}

function bfMesRelatorio(linhas, indiceCabecalho, indiceMes, dados) {
  if (indiceMes >= 0) {
    const valor = dados.map((linha) => String(linha[indiceMes] == null ? '' : linha[indiceMes]).trim()).find(Boolean);
    if (valor) return valor;
  }
  for (const valor of (linhas || []).slice(0, Math.max(0, indiceCabecalho)).flat()) {
    const m = String(valor == null ? '' : valor).trim().match(/(?:per[ií]odo|m[eê]s)\s+da\s+repercuss[aã]o\s*:\s*(.+)/i);
    if (m) return m[1].trim();
  }
  return '—';
}

const BF_PARTIDA_VISITA = 'Rua Santo Agostinho, 193 — Centenário';
const BF_BLOCOS_VISITA = [
  { id: 'bloco-1', label: 'Bloco 1 · Bairro 13 de Setembro / Marechal Rondon', chaves: ['13 de setembro', 'marechal rondon'] },
  { id: 'bloco-2', label: 'Bloco 2 · Bairro Araceli / Nova Vida', chaves: ['araceli', 'nova vida'] },
  { id: 'outros', label: 'Outros bairros', chaves: [] }
];

function bfAgruparVisitas(grupos, indices) {
  const enderecoIdx = indices.get('endereco');
  const bairroIdx = indices.get('bairro');
  const referenciaIdx = indices.get('referencia');
  const porBloco = new Map(BF_BLOCOS_VISITA.map((bloco) => [bloco.id, []]));
  const porChave = new Map();

  grupos.forEach((grupo, chave) => {
    const linha = grupo.linhas[0] || [];
    const endereco = enderecoIdx == null ? '' : String(linha[enderecoIdx] == null ? '' : linha[enderecoIdx]).trim();
    const bairro = bairroIdx == null ? '' : String(linha[bairroIdx] == null ? '' : linha[bairroIdx]).trim();
    const referencia = referenciaIdx == null ? '' : String(linha[referenciaIdx] == null ? '' : linha[referenciaIdx]).trim();
    const textoBairro = bairro || [endereco, referencia].filter(Boolean).join(' ');
    const normalizado = bfNorm(textoBairro);
    const bloco = BF_BLOCOS_VISITA.slice(0, -1).find((item) => item.chaves.some((parte) => normalizado.includes(parte))) || BF_BLOCOS_VISITA.at(-1);
    const item = { chave, endereco: [endereco || referencia, bairro].filter(Boolean).join(' — ') };
    const entrada = { chave, grupo, item };
    porBloco.get(bloco.id).push(entrada);
    porChave.set(chave, entrada);
  });

  return BF_BLOCOS_VISITA.map((bloco) => {
    const entradas = porBloco.get(bloco.id);
    if (!entradas.length) return null;
    const resultado = ordenarVisitas(entradas.map((entrada) => entrada.item), BF_PARTIDA_VISITA);
    return {
      id: bloco.id,
      label: bloco.label,
      grupos: resultado.itens.map((item) => porChave.get(item.chave)),
      metodo: resultado.metodo,
      enderecosIlegiveis: resultado.ilegiveis
    };
  }).filter(Boolean);
}

function bfOrdenarEfeitos(efeitoPorFamilia) {
  const prioridade = ['alerta', 'bloqueio', 'suspensao', 'cancelamento'];
  return [...efeitoPorFamilia.entries()].map(([nome, familias]) => ({ nome, total: familias.size }))
    .sort((a, b) => {
      const ia = prioridade.indexOf(bfNorm(a.nome).replace(/[^a-z]/g, ''));
      const ib = prioridade.indexOf(bfNorm(b.nome).replace(/[^a-z]/g, ''));
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
}

// Prepara dados para os PDFs individuais do Anona, sem desenhar nem guardar ficheiros.
// Cada aba válida vira um relatório; abas de resumo e abas redundantes são ignoradas.
export function bfPrepararRelatoriosIndividuais(abas, opcoes = {}) {
  const candidatas = bfAbasUteis((abas || []).filter((aba) => !bfNorm(aba.nome).startsWith('resumo')))
    .map((aba) => ({ aba, linhas: (aba.linhas || []).filter(bfLinhaTemDados) }))
    .map((item) => ({ ...item, indiceCabecalho: bfDetectarCabecalhoRelatorio(item.linhas) }))
    .filter((item) => item.indiceCabecalho >= 0);
  const relatorios = [];

  for (const { aba, linhas, indiceCabecalho } of candidatas) {
    const cabecalho = linhas[indiceCabecalho] || [];
    const chaves = cabecalho.map(bfChaveCabecalho);
    const indicePorId = new Map();
    BF_COLUNAS_RELATORIO.forEach((coluna) => {
      const indice = chaves.findIndex(coluna.match);
      if (indice >= 0) indicePorId.set(coluna.id, indice);
    });
    const indiceEfeito = indicePorId.get('efeito');
    if (indiceEfeito == null) continue;

    const dados = linhas.slice(indiceCabecalho + 1).filter(bfLinhaTemDados).map((linha) => linha.slice());
    if (!dados.length) continue;
    const indiceMes = chaves.findIndex((h) => h.includes('mes') && h.includes('repercuss'));
    const indiceTecnico = chaves.findIndex((h) => h.includes('tecnico') && h.includes('equipe'));
    const indiceFormacao = chaves.findIndex((h) => h === 'formacao');
    const formacaoPlanilha = indiceFormacao >= 0
      ? (dados.map((r) => String(r[indiceFormacao] || '').trim()).find(Boolean) || '') : '';
    const formacao = bfFormacaoRelatorio(aba.nome, formacaoPlanilha);
    const partesAba = String(aba.nome || '').split(' - ');
    let tecnico = partesAba[0].trim();
    if (!tecnico || /^(dados|planilha|territ[oó]rio volante|relat[oó]rio)$/i.test(tecnico)) tecnico = '';
    if (!tecnico && indiceTecnico >= 0) {
      tecnico = dados.map((r) => String(r[indiceTecnico] || '').trim())
        .find((v) => v && !/^(territ[oó]rio volante|equipe volante)$/i.test(v)) || '';
    }
    if (/^(dados|planilha|territ[oó]rio volante|relat[oó]rio)$/i.test(tecnico)) tecnico = '';

    const indicesId = ['nis', 'cpf', 'nome-responsavel'].map((id) => indicePorId.get(id)).filter((i) => i != null);
    const indicesFamilia = ['nis', 'cpf', 'nome-responsavel', 'endereco', 'bairro', 'referencia', 'efeito', 'mes']
      .map((id) => indicePorId.get(id) ?? (id === 'mes' ? indiceMes : undefined)).filter((i) => i != null);
    const indicesIdentificador = [...new Set(['nis', 'cpf', 'nis-integrante'].map((id) => indicePorId.get(id)).filter((i) => i != null))];
    for (const linha of dados) indicesIdentificador.forEach((i) => { linha[i] = bfIdentificador(linha[i]); });

    // As linhas dos outros integrantes podem deixar em branco os campos da família.
    if (indicesId.length) {
      for (let i = 1; i < dados.length; i++) {
        const linha = dados[i];
        if (indicesId.every((col) => !String(linha[col] == null ? '' : linha[col]).trim()) && bfLinhaTemDados(linha)) {
          indicesFamilia.forEach((col) => {
            if (!String(linha[col] == null ? '' : linha[col]).trim()) linha[col] = dados[i - 1][col] == null ? '' : dados[i - 1][col];
          });
        }
      }
    }

    const mes = bfMesRelatorio(linhas, indiceCabecalho, indiceMes, dados);
    const colunas = BF_COLUNAS_RELATORIO.filter((coluna) => {
      const indice = indicePorId.get(coluna.id);
      return indice != null && (coluna.id === 'efeito' || dados.some((r) => String(r[indice] == null ? '' : r[indice]).trim()));
    });
    const indicePorIdSaida = new Map(colunas.map((coluna) => [coluna.id, indicePorId.get(coluna.id)]));
    const idxNis = indicePorIdSaida.get('nis');
    const idxCpf = indicePorIdSaida.get('cpf');
    const idxNomeResp = indicePorIdSaida.get('nome-responsavel');
    const idxNisInt = indicePorIdSaida.get('nis-integrante');
    const idxNomeInt = indicePorIdSaida.get('nome-integrante');
    const grupos = new Map();

    dados.forEach((linha, i) => {
      const nis = idxNis == null ? '' : String(linha[idxNis] || '').trim();
      const cpf = idxCpf == null ? '' : String(linha[idxCpf] || '').trim();
      const nome = idxNomeResp == null ? '' : String(linha[idxNomeResp] || '').trim();
      const chave = nis ? `nis:${bfNorm(nis)}` : cpf ? `cpf:${bfNorm(cpf)}` : nome ? `nome:${bfNorm(nome)}` : `linha:${i}`;
      if (!grupos.has(chave)) grupos.set(chave, { linhas: [], vistos: new Set() });
      const grupo = grupos.get(chave);
      const nisIntegrante = idxNisInt == null ? '' : String(linha[idxNisInt] || '').replace(/\D+/g, '');
      const nomeIntegrante = idxNomeInt == null ? '' : bfNorm(linha[idxNomeInt]);
      const idIntegrante = nisIntegrante || nomeIntegrante;
      if (idIntegrante && grupo.vistos.has(idIntegrante)) return;
      if (idIntegrante) grupo.vistos.add(idIntegrante);
      grupo.linhas.push(linha);
    });

    const blocosOrdenados = opcoes.ordenarPorRota === false ? [] : bfAgruparVisitas(grupos, indicePorIdSaida);
    const gruposOrdenados = blocosOrdenados.length
      ? blocosOrdenados.flatMap((bloco) => bloco.grupos)
      : [...grupos.entries()].map(([chave, grupo]) => ({ chave, grupo }));
    const headers = ['Família', ...colunas.map((coluna) => coluna.nome)];
    const rows = [];
    const numeroPorChave = new Map();
    const efeitoPorFamilia = new Map();
    gruposOrdenados.forEach(({ grupo, chave }) => {
      const numero = numeroPorChave.size + 1;
      numeroPorChave.set(chave, numero);
      for (const linha of grupo.linhas) {
        const efeito = String(linha[indiceEfeito] == null ? '' : linha[indiceEfeito]).trim();
        if (efeito) {
          if (!efeitoPorFamilia.has(efeito)) efeitoPorFamilia.set(efeito, new Set());
          efeitoPorFamilia.get(efeito).add(numero);
        }
        rows.push([numero, ...colunas.map((coluna) => linha[indicePorId.get(coluna.id)] ?? '')]);
      }
    });

    const blocosRota = blocosOrdenados.map((bloco) => {
      const efeitosBloco = new Map();
      const numerosFamilias = bloco.grupos.map(({ chave }) => numeroPorChave.get(chave)).filter(Number.isFinite);
      let totalRegistros = 0;
      bloco.grupos.forEach(({ chave, grupo }) => {
        const numero = numeroPorChave.get(chave);
        totalRegistros += grupo.linhas.length;
        grupo.linhas.forEach((linha) => {
          const efeito = String(linha[indiceEfeito] == null ? '' : linha[indiceEfeito]).trim();
          if (efeito) {
            if (!efeitosBloco.has(efeito)) efeitosBloco.set(efeito, new Set());
            efeitosBloco.get(efeito).add(numero);
          }
        });
      });
      return {
        id: bloco.id, label: bloco.label,
        totalFamilias: bloco.grupos.length, totalRegistros,
        familiaInicial: Math.min(...numerosFamilias), familiaFinal: Math.max(...numerosFamilias),
        efeitos: bfOrdenarEfeitos(efeitosBloco), metodo: bloco.metodo,
        enderecosIlegiveis: bloco.enderecosIlegiveis
      };
    });
    const efeitos = bfOrdenarEfeitos(efeitoPorFamilia);
    relatorios.push({
      tecnico, formacao, mes, headers, rows, totalRegistros: rows.length,
      totalFamilias: numeroPorChave.size, efeitos, blocosRota, cor: '0B2F7A'
    });
  }

  if (!relatorios.length) return { ok: false, motivo: 'sem-tabela', texto: 'Não encontrei nenhuma aba com a coluna “Efeito” e registos para gerar o relatório individual.' };
  return { ok: true, relatorios, total: relatorios.length, texto: `${relatorios.length} relatório(s) individual(is) preparado(s) localmente.` };
}

const COR_TECNICO = { 'Paulo Xavier': '0B2F7A', 'Danilo Braga': '159947', 'Keomara Teles': 'DB2777' };
const ORDEM_CONHECIDA = ['Paulo Xavier', 'Danilo Braga', 'Keomara Teles'];
const NAO_IDENTIFICADO = 'Não identificado';
const ABA_MUDARAM = 'Mudaram de técnico';
const porNome = (x, y) => x.nome.localeCompare(y.nome, 'pt-BR', { sensitivity: 'base' });
const limparNomeArquivo = (t) => String(t || '').trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

// Compara dois meses e monta as abas (matrizes) do relatório "Famílias Recorrentes".
// Casa as famílias pelo NIS e, na falta dele, pelo CPF (um mês pode ter trazido só um dos dois).
export function bfCompararRecorrentes(anterior, atual) {
  if (!anterior || !atual || !anterior.familias || !atual.familias) return { ok: false, motivo: 'faltam-arquivos', texto: 'Preciso das duas planilhas (mês anterior e mês atual) para comparar.' };
  const porNisAtual = new Map(), porCpfAtual = new Map();
  atual.familias.forEach((f, k) => { if (f.nis !== '—') porNisAtual.set(f.nis, k); if (f.cpf !== '—') porCpfAtual.set(f.cpf, k); });
  const pares = [];
  anterior.familias.forEach((a, k) => {
    const kAtual = atual.familias.has(k) ? k : (a.nis !== '—' && porNisAtual.get(a.nis)) || (a.cpf !== '—' && porCpfAtual.get(a.cpf)) || null;
    if (kAtual != null && !pares.some((p) => p.kAtual === kAtual)) pares.push({ a, b: atual.familias.get(kAtual), kAtual });
  });
  if (!pares.length) return { ok: false, motivo: 'nenhuma', texto: 'Nenhuma família se repetiu entre os dois meses enviados.' };

  const mesAnterior = anterior.mes || 'Mês anterior', mesAtual = atual.mes || 'Mês atual';
  const linhas = pares.map(({ a, b }) => ({
    nome: b.nome || a.nome, nis: b.nis !== '—' ? b.nis : a.nis, cpf: b.cpf !== '—' ? b.cpf : a.cpf,
    bairro: b.bairro || a.bairro, endereco: b.endereco || a.endereco,
    tecnicoAnterior: a.tecnico, integrantesAnterior: a.integrantes.join('; '), registrosAnterior: a.registros,
    tecnicoAtual: b.tecnico, integrantesAtual: b.integrantes.join('; '), registrosAtual: b.registros
  })).sort(porNome);

  const cabecalho = [
    'Nome do Responsável Familiar', 'NIS do Responsável Familiar', 'CPF do Responsável', 'Bairro', 'Endereço',
    `Técnico (${mesAnterior})`, `Integrantes com efeito (${mesAnterior})`, `Nº de registros (${mesAnterior})`,
    `Técnico (${mesAtual})`, `Integrantes com efeito (${mesAtual})`, `Nº de registros (${mesAtual})`
  ];
  const paraLinha = (l) => [l.nome, l.nis, l.cpf, l.bairro, l.endereco, l.tecnicoAnterior, l.integrantesAnterior, l.registrosAnterior, l.tecnicoAtual, l.integrantesAtual, l.registrosAtual];

  // Quem mudou de técnico NÃO entra na aba de nenhum técnico: vai para "Mudaram de técnico", com os dois nomes.
  const mudou = (l) => l.tecnicoAnterior && l.tecnicoAtual && bfNorm(l.tecnicoAnterior) !== bfNorm(l.tecnicoAtual);
  const mudaram = linhas.filter(mudou), mesmos = linhas.filter((l) => !mudou(l));
  const porTecnico = new Map();
  mesmos.forEach((l) => {
    const t = l.tecnicoAtual || l.tecnicoAnterior || NAO_IDENTIFICADO;
    if (!porTecnico.has(t)) porTecnico.set(t, []);
    porTecnico.get(t).push(l);
  });
  const tecnicos = [...porTecnico.keys()].sort((a, b) => {
    if (a === NAO_IDENTIFICADO) return 1;
    if (b === NAO_IDENTIFICADO) return -1;
    const ia = ORDEM_CONHECIDA.indexOf(a), ib = ORDEM_CONHECIDA.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  });

  const usados = new Set();
  const abas = [];
  const resumo = [
    ['Mês anterior', mesAnterior], ['Mês atual', mesAtual],
    ['Famílias que se repetem nos dois meses', linhas.length],
    ['Famílias que mudaram de técnico entre os dois meses', mudaram.length],
    [], ['Famílias recorrentes por técnico (mesmo técnico nos dois meses)']
  ];
  tecnicos.forEach((t) => resumo.push([t, porTecnico.get(t).length]));
  const nomeResumo = bfNomeAbaSeguro('Resumo', usados), nomeTodas = bfNomeAbaSeguro('Todas as famílias', usados);
  const abaResumo = { nome: nomeResumo, tipo: 'resumo', cor: 'B45309', aoa: resumo, formulas: [] };
  abas.push(abaResumo);
  abas.push({ nome: nomeTodas, tipo: 'todas', cor: 'B45309', aoa: [cabecalho, ...linhas.map(paraLinha)] });
  const abaDe = new Map();
  tecnicos.forEach((t) => {
    const nome = bfNomeAbaSeguro(t, usados);
    abaDe.set(t, nome);
    abas.push({ nome, tipo: 'tecnico', tecnico: t, cor: COR_TECNICO[t] || (t === NAO_IDENTIFICADO ? '6B7280' : '0F766E'), aoa: [cabecalho, ...porTecnico.get(t).map(paraLinha)] });
  });
  let nomeMudaram = '';
  if (mudaram.length) {
    nomeMudaram = bfNomeAbaSeguro(ABA_MUDARAM, usados);
    abas.push({ nome: nomeMudaram, tipo: 'mudaram', cor: '9333EA', aoa: [[...cabecalho, 'Mudança de técnico'], ...mudaram.slice().sort(porNome).map((l) => [...paraLinha(l), `${l.tecnicoAnterior} (${mesAnterior}) → ${l.tecnicoAtual} (${mesAtual})`])] });
  }
  // Números do resumo como fórmulas vivas (contam a coluna B, o NIS, que nunca fica vazia: vira "—").
  const contar = (aba) => `COUNTA('${aba.replace(/'/g, "''")}'!B:B)-1`;
  abaResumo.formulas.push({ celula: 'B3', f: contar(nomeTodas), v: linhas.length });
  if (mudaram.length) abaResumo.formulas.push({ celula: 'B4', f: contar(nomeMudaram), v: mudaram.length });
  tecnicos.forEach((t, i) => abaResumo.formulas.push({ celula: `B${7 + i}`, f: contar(abaDe.get(t)), v: porTecnico.get(t).length }));

  const nomeArquivo = `Famílias Recorrentes - ${limparNomeArquivo(mesAnterior)} e ${limparNomeArquivo(mesAtual)}.xlsx`;
  const aviso = mudaram.length ? `, ${mudaram.length} mudaram de técnico` : '';
  return {
    ok: true, mesAnterior, mesAtual, nomeArquivo, abas, total: linhas.length, mudaram: mudaram.length, tecnicos,
    texto: `Relatório montado no aparelho: ${linhas.length} família(s) recorrente(s), em ${tecnicos.length} aba(s) de técnico${aviso}. Não usou IA nem rede.`
  };
}
