// Equipe técnica do CRAS Cristiana Vicente Nunes (Boa Vista) e a divisão do território por técnico(a),
// espelhadas de js/equipe-cras-cristiana.js do Argo SUAS (fonte única de dados do Argo).
// Sem IA e sem rede. Só existe dado deste CRAS: para os demais, diz que o diretório não traz a equipe por bairro.
// Para atualizar: edite o Argo e copie EQ_CRAS abaixo (ou rode `npm run importar:enderecos-argo`, que gera o documento de apoio).
const EQ_CRAS = {
  unidade: 'CRAS Cristiana Vicente Nunes',
  fixedTeam: [
    { name: 'Fernanda Gomes', role: 'Psicóloga', bairros: 'Buritis e Caimbé' },
    { name: 'Cléo Sousa', role: 'Assistente Social', bairros: 'Liberdade e Pricumã' },
    { name: 'Marina Silvestre', role: 'Assistente Social', bairros: 'Tancredo Neves, Cambará e Olímpico' },
    { name: 'Susy Andrade', role: 'Pedagoga', bairros: 'Centenário e Nova Canaã' },
    { name: 'Paloma de Assis', role: 'Assistente Social', bairros: 'Cinturão Verde e Jóquei Clube' },
    { name: 'Rafaela Garcia', role: 'Assistente Social', bairros: 'Asa Branca' }
  ],
  fixedCoverage: ['13 de Setembro', 'Asa Branca', 'Buritis', 'Caimbé', 'Cambará', 'Centenário', 'Cinturão Verde', 'Jóquei Clube', 'Liberdade', 'Marechal Rondon', 'Nova Canaã', 'Olímpico', 'Pricumã', 'Araceli Souto Maior', 'Tancredo Neves'],
  volanteTeam: [
    { name: 'Keomara Teles', role: 'Assistente Social', note: 'Atendimento Itinerante' },
    { name: 'Danilo Braga', role: 'Psicólogo', note: 'Atendimento Itinerante' },
    { name: 'Paulo Xavier', role: 'Psicólogo', note: 'Atendimento Itinerante' }
  ],
  volanteDesc: 'Responsável por levar serviços (PAIF, CadÚnico) a áreas de difícil acesso e populações dispersas.',
  volanteCoverage: ['Araceli Souto Maior', '13 de Setembro', 'Ocupação Nova Vida']
};
// Grafias que o povo usa para o mesmo bairro.
const EQ_APELIDOS = { 'Araceli Souto Maior': ['professora araceli souto maior', 'professora aracelis souto maior', 'aracelis souto maior', 'araceli souto maior', 'aracelis', 'araceli'] };
const eqNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(doutor|doutora|dr|dra)\b/g, 'dr').replace(/\b(bairro|conjunto|loteamento)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const eqEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const eqTem = (n, termo) => new RegExp(`(?:^| )${eqEsc(eqNorm(termo))}(?: |$)`).test(n);
const eqFmt = x => `${x.name} (${x.role})`;
const eqLista = s => s.split(/,\s*|\s+e\s+/).map(x => x.trim()).filter(Boolean);

// Todos os bairros que o módulo reconhece, do nome mais longo ao mais curto.
const EQ_NOMES = (() => {
  const base = new Map();
  const add = (rotulo, termo) => { const k = eqNorm(termo); if (k && !base.has(k)) base.set(k, rotulo); };
  const rotulos = new Set([...EQ_CRAS.fixedCoverage, ...EQ_CRAS.volanteCoverage, ...EQ_CRAS.fixedTeam.flatMap(t => eqLista(t.bairros))]);
  for (const r of rotulos) { add(r, r); for (const a of EQ_APELIDOS[r] || []) add(r, a); }
  return [...base.entries()].sort((a, b) => b[0].length - a[0].length);
})();
function eqBairrosCitados(n) {
  const usados = []; const achados = new Map(); const padded = ` ${n} `;
  for (const [k, rotulo] of EQ_NOMES) {
    const at = padded.indexOf(` ${k} `); if (at < 0) continue;
    const ini = at, fim = at + k.length + 2;
    if (usados.some(u => ini < u[1] && fim > u[0])) continue;
    usados.push([ini, fim]); achados.set(rotulo, true);
  }
  return [...achados.keys()];
}

const RADICAL = { psicologo: ['psicolog', 'psicólogo(a)'], assistente: ['assistente', 'assistente social'], pedagogo: ['pedagog', 'pedagogo(a)'] };
function eqLinhaBairro(bairro, pedido) {
  const fixos = EQ_CRAS.fixedTeam.filter(t => eqLista(t.bairros).some(b => b === bairro));
  const volante = EQ_CRAS.volanteCoverage.includes(bairro);
  const cobre = EQ_CRAS.fixedCoverage.includes(bairro);
  const partes = [];
  if (fixos.length) {
    partes.push(`Bairro ${bairro}: técnico(a) de referência no ${EQ_CRAS.unidade}: ${fixos.map(eqFmt).join(' e ')}.`);
    const falta = pedido ? RADICAL[pedido] : null;
    if (falta && !fixos.some(x => eqNorm(x.role).startsWith(falta[0]))) partes.push(`Não consta ${falta[1]} de referência fixo para esse bairro no diretório do Argo.`);
  } else if (volante) {
    partes.push(`Bairro ${bairro}: não há técnico(a) fixo cadastrado no ${EQ_CRAS.unidade}; o atendimento itinerante (PAIF e CadÚnico) é feito pela equipe volante: ${EQ_CRAS.volanteTeam.map(eqFmt).join(', ')}.`);
  } else if (cobre) {
    partes.push(`Bairro ${bairro}: consta na cobertura do ${EQ_CRAS.unidade}, mas o diretório do Argo não traz técnico(a) de referência para ele. Confirme com a unidade.`);
  }
  if (fixos.length && volante) partes.push(`O bairro também recebe o atendimento itinerante (PAIF e CadÚnico) da equipe volante: ${EQ_CRAS.volanteTeam.map(eqFmt).join(', ')}.`);
  return partes.join(' ');
}
function eqTextoCompleto() {
  const fixa = EQ_CRAS.fixedTeam.map(t => `• ${t.name} (${t.role}) — ${t.bairros}`).join('\n');
  const vol = EQ_CRAS.volanteTeam.map(t => `• ${t.name} (${t.role}) — ${t.note}`).join('\n');
  return `Equipe técnica do ${EQ_CRAS.unidade}, por território:\n${fixa}\n\nEquipe volante (atendimento itinerante; ${EQ_CRAS.volanteDesc.replace(/\.$/, '')}), que cobre ${EQ_CRAS.volanteCoverage.join(', ')}:\n${vol}\n\nBairros na cobertura fixa do CRAS: ${EQ_CRAS.fixedCoverage.join(', ')}.`;
}

const EQ_RE_TECNICO = /\b(tecnico|tecnica|tecnicos|tecnicas|psicolog[oa]s?|assistentes? soci(?:al|ais)|pedagog[oa]s?|referencia tecnica|equipe tecnica|equipe volante|volante|itinerante|divisao territorial|divisao do territorio)\b/;
const EQ_RE_CRISTIANA = /\bcras cristiana\b|\bcristiana vicente\b|\bcras do centenario\b|\bcras centenario\b/;
const EQ_RE_UBS_CAPS = /\bubs\b|\bcaps\b|posto de saude|unidade basica|centro de atencao psicossocial/;

export function respostaDeEquipeCras(texto) {
  const n = eqNorm(texto);
  if (!n || EQ_RE_UBS_CAPS.test(n)) return null;
  const citouCras = EQ_RE_CRISTIANA.test(n);
  const outroCras = /\bcras\b/.test(n.replace(EQ_RE_CRISTIANA, ' '));
  const nomeTecnico = EQ_CRAS.fixedTeam.concat(EQ_CRAS.volanteTeam).find(t => eqTem(n, t.name) || (eqNorm(t.name).split(' ').length > 1 && eqTem(n, eqNorm(t.name).split(' ')[0]) && EQ_RE_TECNICO.test(n)));
  const pedeTecnico = EQ_RE_TECNICO.test(n) || (citouCras && /\b(quem|atende|atendem|referencia|responsavel|cobre|territorio)\b/.test(n));
  if (!pedeTecnico && !nomeTecnico) return null;
  const bairros = eqBairrosCitados(n);
  const pedido = /\bpsicolog/.test(n) ? 'psicologo' : /\bassistentes? soci(?:al|ais)\b/.test(n) ? 'assistente' : /\bpedagog/.test(n) ? 'pedagogo' : null;
  const pedeVolante = /\b(volante|itinerante)\b/.test(n);
  const pedeLista = /\b(quais|lista|listar|equipe|divisao|divisoes|todos|todas|dividido|dividida|divididos)\b/.test(n);

  // pergunta por uma pessoa da equipe: "Fernanda atende quais bairros?"
  if (nomeTecnico && !bairros.length) {
    if (nomeTecnico.bairros) return { tipoEquipe: 'tecnico', texto: `${eqFmt(nomeTecnico)} é referência no ${EQ_CRAS.unidade} para: ${nomeTecnico.bairros}.` };
    return { tipoEquipe: 'volante', texto: `${eqFmt(nomeTecnico)} integra a equipe volante (${nomeTecnico.note}) do ${EQ_CRAS.unidade}, que cobre ${EQ_CRAS.volanteCoverage.join(', ')}. ${EQ_CRAS.volanteDesc}` };
  }
  if (bairros.length) {
    // outro CRAS citado e nenhum o Cristiana: não há dado de equipe
    if (outroCras && !citouCras) return { tipoEquipe: 'nao-consta', texto: `O diretório do Argo só traz a divisão da equipe técnica por bairro do ${EQ_CRAS.unidade}. Para outro CRAS, confirme o(a) técnico(a) de referência diretamente com a unidade.` };
    const linhas = bairros.map(b => eqLinhaBairro(b, pedido)).filter(Boolean);
    if (linhas.length) return { tipoEquipe: 'bairro', texto: linhas.join('\n') + '\nDivisão do diretório do Argo SUAS; confirme com o CRAS antes de encaminhar, porque a equipe pode mudar.' };
  }
  if (pedeVolante) return { tipoEquipe: 'volante', texto: `Equipe volante do ${EQ_CRAS.unidade} (atendimento itinerante em ${EQ_CRAS.volanteCoverage.join(', ')}): ${EQ_CRAS.volanteTeam.map(eqFmt).join(', ')}. ${EQ_CRAS.volanteDesc}` };
  if (citouCras && (pedeLista || pedido)) {
    if (pedido) {
      const fixos = EQ_CRAS.fixedTeam.filter(t => eqNorm(t.role).startsWith(RADICAL[pedido][0]));
      const vol = EQ_CRAS.volanteTeam.filter(t => eqNorm(t.role).startsWith(RADICAL[pedido][0]));
      const l = [...fixos.map(t => `• ${t.name} (${t.role}) — ${t.bairros}`), ...vol.map(t => `• ${t.name} (${t.role}) — equipe volante`)];
      if (l.length) return { tipoEquipe: 'funcao', texto: `No ${EQ_CRAS.unidade}:\n${l.join('\n')}` };
    }
    return { tipoEquipe: 'equipe', texto: eqTextoCompleto() };
  }
  if (citouCras && !bairros.length) return { tipoEquipe: 'equipe', texto: eqTextoCompleto() };
  // "quem é o técnico do bairro?" sem bairro nem CRAS: pede o bairro
  if (!citouCras && !outroCras && /\b(meu|minha|moro|bairro|qual|quem)\b/.test(n) && !pedeLista) return { tipoEquipe: 'pergunta', texto: `Diga o bairro para eu procurar o(a) técnico(a) de referência. O diretório do Argo traz essa divisão só para o ${EQ_CRAS.unidade}.` };
  if (!citouCras && !outroCras && pedeLista && /\b(equipe|divisao|territorial)\b/.test(n) && /\b(cras|tecnica|tecnicos|tecnico|territorial)\b/.test(n)) return { tipoEquipe: 'equipe', texto: eqTextoCompleto() };
  return null;
}
export const equipeCrasCristiana = {
  unidade: EQ_CRAS.unidade,
  fixedTeam: EQ_CRAS.fixedTeam.map(t => ({ ...t })),
  fixedCoverage: [...EQ_CRAS.fixedCoverage],
  volanteTeam: EQ_CRAS.volanteTeam.map(t => ({ ...t })),
  volanteDesc: EQ_CRAS.volanteDesc,
  volanteCoverage: [...EQ_CRAS.volanteCoverage]
};
