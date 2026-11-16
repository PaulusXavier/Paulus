// Escopo da conversa: quais blocos OPCIONAIS do prompt a pergunta realmente pede.
// O texto fixo do Paulus tem uns 25 mil caracteres e vai inteiro a cada pergunta; a maior parte da cota gratuita da Cloudflare
// é gasta aí (entrada), não na resposta. Regras de coordenada/rota, de edição de PDF e a visão dos outros apps só servem quando
// a pergunta fala disso. Tudo aqui é regra simples (sem IA); na dúvida o bloco ENTRA: errar para mais custa só um pouco de cota,
// errar para menos tiraria uma regra de segurança do que a pessoa perguntou.
//
//   escopoDaConversa(pergunta, historico) -> { geo, pdf, apps }
//     geo   coordenada, CEP, mapa, rota, distância, "perto de", bairro de um lugar
//     pdf   editar PDF (juntar, girar, numerar, marca d'água, formulário)
//     apps  outros apps da família (onde fazer uma tarefa, "qual app", nome de app)
//
// Olha a pergunta e as duas últimas do(a) profissional ("e de moto?", "e o Toth?" continuam o assunto anterior).

import { normalizar } from './busca.mjs';

const RE_GEO = /\b(?:coordenad\w*|latitude|longitude|cep|gps|geograf\w*|georreferenc\w*|mapa|mapas|rota|rotas|trajeto|percurso|itinerario|deslocamento|distancia|distancias|quilometr\w*|km|perto|proximo|proxima|proximos|proximas|chegar|bairro|bairros|onde fica|localiza\w*)\b/;
const RE_PDF = /\b(?:pdf|pdfs|juntar|mesclar|unir arquivos|girar|rotacionar|numerar|marca d agua|preencher (?:o )?(?:campo|formulario)|travar (?:o )?formulario|assinatura escaneada|paginas?)\b/;
const RE_APPS = new RegExp(
  '\\b(?:app|apps|aplicativo|aplicativos|ferramenta|ferramentas|argo|umbrella|umbrela|anona|toth|grafia|verbus|bloco de notas|caderno de campo|diario de campo|mala direta|abnt|editor de texto)\\b' +
  '|\\b(?:onde|em qual|qual)\\b[^?]{0,40}\\b(?:registr\\w+|anot\\w+|escrev\\w+|faco|fazer|monto|montar|guard\\w+|acompanh\\w+|calcul\\w+|exporta\\w*)\\b' +
  '|\\bo que mais (?:existe|tem)\\b|\\boutros? (?:sistemas?|lugares?)\\b'
);

// Perguntas anteriores do(a) profissional que ainda contam para o assunto (as duas últimas, cortadas).
function textosRecentes(historico) {
  const saida = [];
  if (!Array.isArray(historico)) return saida;
  for (let i = historico.length - 1; i >= 0 && saida.length < 2; i--) {
    const h = historico[i];
    if (h && h.papel === 'usuario' && typeof h.texto === 'string' && h.texto) saida.push(h.texto.slice(0, 300));
  }
  return saida;
}

export function escopoDaConversa(pergunta, historico) {
  const t = normalizar([String(pergunta == null ? '' : pergunta)].concat(textosRecentes(historico)).join(' \n '));
  return { geo: RE_GEO.test(t), pdf: RE_PDF.test(t), apps: RE_APPS.test(t) };
}

// Documentos da base com números locais (Censo SUAS, diagnósticos socioterritoriais, Roraima): só com eles entre os trechos lidos
// as regras de "dado de Roraima e do Censo" têm o que regular.
const RE_DOC_LOCAL = /censo-suas|diagnostico-socioterritorial|roraima/;
export function trazDadoLocal(achados) {
  return Array.isArray(achados) && achados.some(function (a) { return a && a.trecho && RE_DOC_LOCAL.test(String(a.trecho.doc || '')); });
}
