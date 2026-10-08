// Pedidos de socorro: resposta imediata, no aparelho, mesmo sem internet e sem IA.
// Não faz triagem nem avaliação clínica: só mostra os telefones e pede para acionar o serviço.

export const EMERGENCIAS = [
  { numero: '192', nome: 'SAMU' },
  { numero: '193', nome: 'Bombeiros' },
  { numero: '190', nome: 'Polícia Militar' },
  { numero: '188', nome: 'CVV (apoio emocional, 24h)' },
  { numero: '180', nome: 'Central de Atendimento à Mulher' },
  { numero: '100', nome: 'Disque Direitos Humanos' }
];

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const PADROES = [
  {
    tipo: 'suicidio',
    titulo: 'Risco de vida: acione ajuda agora',
    re: /\b(suicid\w*|me matar|se matar|quer(?:o|endo)? morrer|nao quero mais viver|tirar (?:minha|a propria|a) vida|acabar com (?:a minha vida|tudo)|automutil\w*|se cortando|me cortando|pensando em morrer)\b/,
    numeros: ['192', '188', '193']
  },
  {
    tipo: 'violencia',
    titulo: 'Violência em andamento: acione ajuda agora',
    re: /\b((?:esta|estao) (?:sendo )?(?:agredid|espancad|ameacad)\w*|sendo (?:agredid|espancad)\w* agora|violencia (?:em curso|agora|em andamento)|abuso (?:em andamento|acontecendo agora))\b/,
    numeros: ['190', '180', '100']
  },
  {
    tipo: 'clinica',
    titulo: 'Emergência de saúde: acione ajuda agora',
    re: /\b(overdose|parou de respirar|inconsciente|convuls\w*|engoliu (?:remedio|veneno)s?)\b/,
    numeros: ['192', '193']
  }
];

// Devolve null se não for pedido de socorro.
export function detectarCrise(texto) {
  const t = semAcento(texto);
  for (const p of PADROES) {
    if (p.re.test(t)) {
      return {
        tipo: 'crise',
        subtipo: p.tipo,
        titulo: p.titulo,
        texto: 'Se há risco de vida agora, ligue primeiro para um destes números. Depois, acione o serviço de referência do território e a coordenação. Se a sua dúvida for sobre o fluxo de atendimento, reformule a pergunta e eu ajudo.',
        telefones: EMERGENCIAS.filter(e => p.numeros.includes(e.numero))
      };
    }
  }
  return null;
}
