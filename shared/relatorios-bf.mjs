// Relatórios do Bolsa Família feitos inteiramente no aparelho (porte do Anona para o Paulus).
// Sem IA, sem rede, sem cota: só recebe linhas já lidas da planilha e devolve linhas prontas.
//
// PASSO 1 (este arquivo): leitura do relatório de condicionalidades do MDS + "Famílias Recorrentes"
// (famílias que aparecem em dois meses, por técnico). A leitura e a gravação do .xlsx ficam na camada
// do console (passo 2); aqui tudo é função pura, testável em Node: `node --test tests/relatorios-bf.test.mjs`.
//
// Entrada de planilha: abas = [{ nome: 'Paulo Xavier - Psicólogo', linhas: [[...], [...]] }]  (matriz de células).
// Nada é guardado; o chamador decide o que fazer com o resultado e descarta os dados.

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
