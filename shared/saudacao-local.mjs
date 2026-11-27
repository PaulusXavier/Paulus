// Resposta a cumprimento, agradecimento, confirmação e despedida SEM IA (poupa cota e funciona sem internet).
//
//   respostaDeSaudacao(texto, idioma) -> { texto, tipo } | null
//
// Só é chamada quando shared/pedido.mjs já classificou a mensagem como 'saudacao' (todas as palavras são de cumprimento).
// Não inventa nada: diz o que o Paulus faz (as mesmas capacidades da ficha de saudação do prompt) e devolve a conversa para a pessoa.
// Os nomes têm prefixo Saud/SAUD porque o arquivo do navegador junta todos os módulos num só escopo (scripts/build.mjs).

import { normalizar } from './busca.mjs';

const SAUD_TIPOS = [
  // ordem importa: agradecimento e despedida antes de cumprimento ("obrigado, tchau" é despedida)
  ['despedida', /\b(?:tchau|ate (?:logo|mais|amanha|breve)|adeus|bye|goodbye|hasta (?:luego|pronto|manana)|chao)\b/],
  ['agradecimento', /\b(?:obrigad[oa]s?|valeu|brigad[oa]|agradeco|thanks?|thank you|gracias|muchas gracias)\b/],
  ['confirmacao', /\b(?:ok|okay|certo|entendi|entendido|beleza|perfeito|otimo|show|combinado|tudo bem|blz|sim|ta bom|de acordo|great|perfect|understood|got it|sure|cool|nice|vale|claro|listo)\b/],
  ['cumprimento', /./]
];

const SAUD_TEXTOS = {
  pt: {
    cumprimento: 'Posso tirar dúvidas do SUAS e da prática, citar normas da base, ajudar a escrever registro, relatório e ofício e orientar no uso do app. O que você precisa?',
    agradecimento: 'De nada! Se surgir outra dúvida do SUAS, de norma ou de texto, é só chamar.',
    confirmacao: 'Certo. Se quiser seguir, é só dizer o que precisa.',
    despedida: 'Até logo! Quando precisar, é só chamar.'
  },
  es: {
    cumprimento: 'Puedo resolver dudas del SUAS y de la práctica, citar normas de la base, ayudar a escribir registros, informes y oficios y orientar en el uso de la app. ¿Qué necesita?',
    agradecimento: '¡De nada! Si surge otra duda del SUAS, de normas o de texto, solo avise.',
    confirmacao: 'Listo. Si quiere seguir, solo diga qué necesita.',
    despedida: '¡Hasta luego! Cuando lo necesite, solo avise.'
  },
  en: {
    cumprimento: 'I can answer questions about SUAS and practice, cite norms from the knowledge base, help write records, reports and official letters, and guide you in using the app. What do you need?',
    agradecimento: "You're welcome! If another question about SUAS, norms or writing comes up, just ask.",
    confirmacao: 'Okay. If you want to continue, just tell me what you need.',
    despedida: 'Goodbye! Whenever you need, just ask.'
  }
};

// "bom dia" / "boa tarde" / "boa noite" (e buenos días, good morning) devolvem a saudação da mesma hora do dia.
function saudAbertura(n, idioma) {
  if (idioma === 'es') {
    if (/\bbuenos dias\b/.test(n)) return '¡Buenos días! ';
    if (/\bbuenas tardes\b/.test(n)) return '¡Buenas tardes! ';
    if (/\bbuenas noches\b/.test(n)) return '¡Buenas noches! ';
    return '¡Hola! ';
  }
  if (idioma === 'en') {
    if (/\bgood morning\b/.test(n)) return 'Good morning! ';
    if (/\bgood afternoon\b/.test(n)) return 'Good afternoon! ';
    if (/\bgood evening\b/.test(n)) return 'Good evening! ';
    return 'Hello! ';
  }
  if (/\bbom dia\b/.test(n)) return 'Bom dia! ';
  if (/\bboa tarde\b/.test(n)) return 'Boa tarde! ';
  if (/\bboa noite\b/.test(n)) return 'Boa noite! ';
  return 'Oi! ';
}

export function respostaDeSaudacao(texto, idioma) {
  const n = normalizar(texto);
  if (!n) return null;
  const lang = idioma === 'es' || idioma === 'en' ? idioma : 'pt';
  let tipo = 'cumprimento';
  for (let i = 0; i < SAUD_TIPOS.length; i++) {
    if (SAUD_TIPOS[i][1].test(n)) { tipo = SAUD_TIPOS[i][0]; break; }
  }
  // "bom dia, obrigado" ainda é cumprimento: se há saudação de hora, ela vence o agradecimento
  if (tipo !== 'despedida' && /\b(?:bom dia|boa tarde|boa noite|buenos dias|buenas tardes|buenas noches|good (?:morning|afternoon|evening))\b/.test(n)) tipo = 'cumprimento';
  const corpo = SAUD_TEXTOS[lang][tipo];
  return { tipo: tipo, texto: tipo === 'cumprimento' ? saudAbertura(n, lang) + corpo : corpo };
}
