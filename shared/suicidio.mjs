// Perguntas TÉCNICAS sobre suicídio: escolhe, na cartilha ABP/CFM (2014), os trechos que respondem a cada tipo de pergunta.
//
// Por que existe: a busca por palavras (busca.mjs) acha trechos soltos e, com o limite de 3 por documento, deixava de fora
// partes que andam juntas (as seis perguntas, as questões adicionais e os níveis de risco). Aqui cada tipo de pergunta
// puxa o conjunto certo; o que sobrar de vaga é completado pela busca normal.
//
// Os trechos são achados pelo INÍCIO da referência (o título do trecho no .md), não por número de posição:
// se a cartilha for reimportada, basta manter os títulos.

import { normalizar } from './busca.mjs';

export const DOC_SUICIDIO = 'abp-cfm-suicidio-2014';
export const MAX_ROTA = 5;        // trechos da cartilha puxados pela rota
export const TOTAL_COM_ROTA = 6;  // total de trechos (rota + busca) numa pergunta sobre suicídio

const TEMA = /\b(suicid\w*|ideacao|autolesa\w*|automutila\w*|tentativa de suicidio|tirar (a )?(propria )?vida|se matar|posvencao)\b/;

// A ordem importa: o primeiro tipo que combinar vale.
const TIPOS = [
  { tipo: 'posvencao', re: /\b(posvencao|luto|sobreviventes?|enlutad\w*|familiares? (de|apos)|apos (a )?morte)\b/ },
  { tipo: 'mitos', re: /\b(mitos?|tabu|estigma|aumenta\w* (o )?risco|piora\w*|chamar (a )?atencao|manipula\w*|fraqueza|covardia|egoismo|falar sobre|conversar sobre|perguntar (sobre|diretamente))\b/ },
  { tipo: 'rede', re: /\b(notific\w*|rede|caps|atencao (primaria|basica)|ubs|raps|competencia|compete|papel|equipe|capacitac\w*|treinamento|contrarreferencia|fluxo|protocolo)\b/ },
  { tipo: 'fatores', re: /\b(fatores?|sinais?|grupos? de risco|populacao|quem corre|mais risco|protecao|protetores?|idosos?|adolescentes?|jovens?|homens?|mulheres?|indigenas?|populacao de rua)\b/ },
  { tipo: 'avaliar', re: /\b(avali\w*|identific\w*|reconhec\w*|investig\w*|perguntas?|perguntar|triag\w*|nivel|niveis|classific\w*|baixo|medio|alto|escala|instrumento)\b/ },
  { tipo: 'abordar', re: /\b(abord\w*|acolh\w*|escuta|conversar com|falar com|lidar|como (conversar|dialogar))\b/ },
  { tipo: 'manejo', re: /\b(manej\w*|conduz\w*|conduta|encaminh\w*|o que fazer|como agir|como proceder|intervenc\w*|atender|atendimento|emergencia|urgencia|crise)\b/ }
];

// Referências (início do título do trecho) de cada tipo, na ordem de prioridade.
const ROTAS = {
  avaliar: [
    '7.1 As seis perguntas fundamentais',
    '7.1 Questões adicionais para avaliar o risco de suicídio: plano, meios e preparação (parte 1)',
    '7.3.1 Risco baixo',
    '7.3.2 Risco médio',
    '7.3.3 Risco alto'
  ],
  abordar: [
    '7.1 Como abordar o paciente com risco de suicídio (parte 1)',
    '7.1 Como abordar o paciente com risco de suicídio (parte 2)',
    '7.1 As seis perguntas fundamentais',
    '7.3.1 Risco baixo',
    '7.3.2 Risco médio (avaliação do risco de suicídio: caracterizar, manejar e encaminhar) (parte 1)'
  ],
  manejo: [
    '7.3.1 Risco baixo',
    '7.3.2 Risco médio (avaliação do risco de suicídio: caracterizar, manejar e encaminhar) (parte 1)',
    '7.3.3 Risco alto (avaliação do risco de suicídio: caracterizar, manejar e encaminhar) (parte 1)',
    '7.3.3 Risco alto (avaliação do risco de suicídio: caracterizar, manejar e encaminhar) (parte 2)',
    '7.3.4 Urgência/emergência (risco de suicídio) (parte 1)'
  ],
  mitos: [
    '4. Mitos sobre o suicídio, Tabela 1 (parte 1)',
    '4. Mitos sobre o suicídio, Tabela 1 (parte 2)',
    '4. Mitos sobre o suicídio, Tabela 1 (parte 3)',
    '4. Mitos sobre o suicídio, Tabela 1 (parte 4)',
    '3. Barreiras à detecção'
  ],
  fatores: [
    '6.1 Os dois principais fatores de risco',
    '6.2 Tabela 2: principais fatores de risco associados ao comportamento suicida (doenças mentais',
    '6.2 Tabela 2: principais fatores de risco associados ao comportamento suicida (aspectos psicológicos',
    '6.2 Fatores protetores'
  ],
  posvencao: [
    '8. Posvenção do suicídio (parte 1)',
    '8. Posvenção do suicídio (parte 2)',
    '8. Posvenção do suicídio (parte 3)'
  ],
  rede: [
    '9.2 O que compete à atenção primária',
    '9.3 O que compete à atenção secundária e terciária; notificação compulsória da tentativa de suicídio (parte 1)',
    '9.3 O que compete à atenção secundária e terciária; notificação compulsória da tentativa de suicídio (parte 3)',
    '9.1 O que compete à equipe de saúde como um todo (parte 1)',
    '9. O suicídio e a importância da rede de saúde (parte 1)'
  ]
};
// Quem pergunta por um grupo específico recebe também o trecho de idade (adolescentes, jovens e pessoas idosas).
const IDADE = /\b(idosos?|pessoas? idosas?|adolescentes?|jovens?|crianca\w*)\b/;
const REF_IDADE = '6.2 Idade como fator de risco';

// 'avaliar' | 'abordar' | 'manejo' | 'mitos' | 'fatores' | 'posvencao' | 'rede' | null (null: não é sobre suicídio, ou é só "suicídio" sem tipo)
export function tipoDePerguntaSuicidio(consulta) {
  const t = normalizar(consulta);
  if (!TEMA.test(t)) return null;
  for (const x of TIPOS) if (x.re.test(t)) return x.tipo;
  return null;
}

// indice: o índice de busca (busca.mjs). Devolve os trechos da cartilha para a pergunta, na ordem de prioridade.
export function trechosDaRota(indice, consulta) {
  const tipo = tipoDePerguntaSuicidio(consulta);
  if (!tipo || !indice || !Array.isArray(indice.docs)) return [];
  const cartilha = indice.docs.map(function (d) { return d.c; }).filter(function (c) { return c.doc === DOC_SUICIDIO; });
  if (!cartilha.length) return [];
  const refs = ROTAS[tipo].slice();
  if (tipo === 'fatores' && IDADE.test(normalizar(consulta))) refs.splice(1, 0, REF_IDADE);
  // "notificação" pergunta pelo trecho da portaria: ele vai para a frente
  if (tipo === 'rede' && /notific/.test(normalizar(consulta))) {
    const i = refs.findIndex(function (r) { return r.indexOf('(parte 3)') > -1; });
    if (i > 0) refs.unshift(refs.splice(i, 1)[0]);
  }
  const saida = [];
  for (const r of refs) {
    const c = cartilha.find(function (x) { return String(x.referencia || '').indexOf(r) === 0; });
    if (c && !saida.includes(c)) saida.push(c);
  }
  return saida.slice(0, MAX_ROTA);
}

// Junta rota e busca: a rota vem primeiro; a busca completa as vagas sem repetir trecho.
export function combinarComBusca(rota, achados, total = TOTAL_COM_ROTA) {
  if (!rota.length) return achados;
  const saida = rota.map(function (trecho) { return { trecho: trecho, score: 0, cobertura: 1, ordem: 0, rota: true }; });
  for (const a of achados) {
    if (saida.length >= total) break;
    if (!saida.some(function (x) { return x.trecho === a.trecho || (x.trecho.id && x.trecho.id === a.trecho.id); })) saida.push(a);
  }
  return saida;
}
