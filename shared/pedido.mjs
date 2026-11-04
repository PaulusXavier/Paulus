// Leitura do PEDIDO: que tipo de mensagem é esta e, por isso, como o Paulus deve se comportar.
// Roda no navegador (para a busca offline e o histórico) e no Worker (para o prompt e os parâmetros da IA).
// Tudo aqui é regra simples e testável, sem chamar IA: não custa cota e não erra "de vez em quando".
//
// Modos:
//   saudacao     só cumprimento/agradecimento ("oi", "obrigado")   -> resposta curta, prompt mínimo, sem buscar norma
//   refinamento  ajuste da última resposta ("mais curto", "mais formal", "outro jeito") -> reescreve a resposta anterior
//   seguimento   pergunta que depende da anterior ("e para adolescente?", "e nesse caso?") -> busca com o assunto anterior
//   continuar    "continue", "aprofunde", "tem mais?" -> segue de onde a última resposta parou, sem repetir
//   contestacao  "tem certeza?", "discordo", "mas eu li que..." -> reconfere a última resposta contra as fontes (corrige se errou, mantém se a fonte sustenta)
//   porque       "por quê?", "de onde tirou isso?", "qual a fonte?" -> explica o caminho e a fonte da última resposta
//   consulta     dado do diretório (telefone, endereço, horário, quantos) -> temperatura baixa, sem criatividade
//   normal       o resto

import { tokenizar, normalizar, SIGLAS } from './busca.mjs';

// ------------------------------------------------------------------ saudação

const PALAVRAS_SAUDACAO = new Set(('oi ola oie opa salve eai e ai bom boa dia tarde noite tudo bem beleza blz certo ok okay entendi entendido ' +
  'obrigado obrigada obg obrigadao valeu vlw show perfeito otimo legal combinado fechado tchau ate logo mais amanha ' +
  'por favor muito vc voce paulus argo anona toth grafia umbrella').split(' '));

// Só cumprimento puro: TODAS as palavras são de saudação. "oi, o que é CRAS?" não é saudação.
export function ehSaudacao(texto) {
  const palavras = normalizar(texto).split(' ').filter(Boolean);
  if (!palavras.length || palavras.length > 7) return false;
  return palavras.every(function (p) { return PALAVRAS_SAUDACAO.has(p); });
}

// ------------------------------------------------------------------ refinamento

// Pedido de ajuste do que acabou de ser respondido. Só vale com resposta anterior e com mensagem curta;
// "reescreva o ofício para o CAPS com ..." (longa) é tarefa nova. Duas formas:
//   1) verbo de ajuste no começo: "deixe mais formal", "resuma", "inclua o horário", "explique melhor";
//   2) frase curta de ajuste, sozinha: "mais curto", "de outro jeito", "em tópicos", "com exemplo".
// "Explique o PAIF" e "resumo da LOAS" NÃO entram: são perguntas novas.
const VERBO_AJUSTE = /^(?:por favor )?(?:deixe|deixa|torne|reescreva|reescreve|refaca|refaz|resuma|resume|encurte|encurta|amplie|amplia|detalhe|simplifique|simplifica|melhore|melhora|ajuste|ajusta|adapte|adapta|transforme|transforma|converta|corrija|corrige|troque|troca|tire|tira|remova|retire|acrescente|inclua|adicione|organize|formate|traduza|explique melhor|explica melhor|explique de novo|explique de outro|explica de outro|escreva de outro|escreve de outro|diga de outro|fale de outro|me explique de outro|me explica de outro|de uma versao|faca uma versao|faca de outro|faz de outro)\b/;
const FRASE_AJUSTE = /^(?:(?:bem |um pouco |muito )?(?:mais|menos) (?:curto|curta|longo|longa|formal|simples|direto|direta|tecnico|tecnica|detalhado|detalhada|objetivo|objetiva|resumido|resumida|claro|clara|humano|humana|acolhedor|acolhedora|informal|pratico|pratica)|(?:de|em|numa|num) (?:outro jeito|outra forma|topicos|lista|passos|tres linhas|uma frase|um paragrafo|poucas linhas)|(?:com|um|me de um|me da um) exemplos?|outro jeito|outra forma|versao (?:curta|resumida|formal|simples)|resuma|resumir|encurte|simplifique|detalhe mais|explique melhor)$/;

// A mensagem, sozinha, tem cara de pedido de ajuste?
function pareceAjuste(texto) {
  const n = normalizar(texto);
  if (!n || n.split(' ').length > 12) return false;
  return FRASE_AJUSTE.test(n) || VERBO_AJUSTE.test(n);
}

export function ehRefinamento(texto, historico) {
  return temRespostaAnterior(historico) && pareceAjuste(texto);
}

function ehResposta(h) {
  return !!h && (h.papel === 'paulus' || h.papel === 'argo' || h.papel === 'assistente') && !!h.texto;
}

export function temRespostaAnterior(historico) {
  return Array.isArray(historico) && historico.some(ehResposta);
}

// ------------------------------------------------------------------ pedido sobre a última resposta

const RESPOSTA_FALSA = [{ papel: 'paulus', texto: '-' }];

// Perguntas SOBRE o que o Paulus acabou de dizer (não são assunto novo). Só valem com resposta anterior e mensagem curta.
const RE_CONTINUAR = /^(?:por favor )?(?:continue|continua|continuar|prossiga|prossegue|termine|termina|complete|completa|aprofunde|aprofunda|desenvolva|desenvolve|va mais fundo|pode continuar|pode seguir|pode aprofundar|pode completar|tem mais|o que mais|mais um pouco|mais detalhes|e o resto|e so isso|so isso)(?: (?:isso|a resposta|ai|de onde parou|mais|um pouco|por favor|essa resposta))*$/;
const RE_CONTESTACAO_CURTA = /^(?:(?:hum+|ah|ue|mas|olha|poxa) )?(?:tem certeza|certeza disso|voce tem certeza|sera mesmo|serio mesmo|confere isso|confira isso|confere de novo|confira de novo|verifique de novo|verifica de novo|revise isso|revisa isso|revise a resposta|isso esta certo|isso ta certo|isso e verdade|isso procede|nao concordo|discordo|nao e bem assim|nao e isso|nao e assim|nao foi isso|isso esta errado|isso ta errado|esta errado|ta errado|voce errou|acho que voce errou|acho que esta errado|acho que nao)(?: (?:disso|mesmo|isso|de novo|a resposta))*$/;
const RE_CONTESTACAO_FONTE = /^(?:mas |olha |ue )?(?:eu li|li|eu vi|vi|ouvi|me disseram|disseram|pelo que li|pelo que sei|na minha leitura|no meu municipio|aqui no municipio|aqui no meu municipio|na minha unidade|aqui na unidade) (?:que |nao |a |o |e |foi |aqui )?/;
const RE_PORQUE = /^(?:(?:e )?por ?que(?: isso| disso| sim| nao| assim)?|por que razao|como (?:voce )?chegou (?:nisso|nessa conclusao|a isso)|de onde (?:voce )?tirou isso|de onde veio isso|de onde vem isso|em que (?:voce )?se baseou|em que se baseia|qual (?:e )?a fonte|qual (?:e )?a base|qual norma|qual artigo|qual documento|onde esta escrito|onde diz isso|cite a fonte|mostre a fonte|me mostra a fonte|justifique|justifica|explique o raciocinio|explica o raciocinio|por que voce disse isso|por que voce acha isso)$/;

// Devolve 'continuar' | 'contestacao' | 'porque' | '' . Ordem: "por quê?" e "continue" são exatos; contestação aceita relato curto.
export function pedidoSobreResposta(texto, historico) {
  if (!temRespostaAnterior(historico)) return '';
  const n = normalizar(texto);
  if (!n) return '';
  const palavras = n.split(' ').length;
  if (palavras <= 8) {
    if (RE_CONTINUAR.test(n)) return 'continuar';
    if (RE_PORQUE.test(n)) return 'porque';
    if (RE_CONTESTACAO_CURTA.test(n)) return 'contestacao';
  }
  if (palavras <= 30 && RE_CONTESTACAO_FONTE.test(n)) return 'contestacao';
  return '';
}

// Mensagem com 2 a 4 perguntas ("posso X? e se Y? e quando Z?"): cada uma vira uma parte, para a busca cobrir todas e a resposta responder todas.
export function partesDaPergunta(texto) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ');
  const frases = t.match(/[^.?!]*\?/g) || [];
  const partes = frases.map(function (f) { return f.replace(/^[\s,;:]+/, '').replace(/^e\s+/i, '').trim(); })
    .filter(function (f) { return f.split(' ').length >= 3 && tokenizar(f).length >= 2; });
  return partes.length >= 2 ? partes.slice(0, 4).map(function (f) { return f.slice(0, 220); }) : [];
}

// ------------------------------------------------------------------ seguimento

// Palavras que só fazem sentido com a conversa por trás.
const ANAFORA = new Set('isso esse essa esses essas nisso nesse nessa nesses nessas disso desse dessa deles delas ele ela eles elas la ali tambem mesmo mesma anterior acima citado citada'.split(' '));

// Pergunta curta que cita um termo próprio do SUAS (CRAS, BPC, PAIF...) se sustenta sozinha: "como funciona o BPC?"
// não é seguimento, mesmo curta. Já "e o horário?" e "e para adolescente?" dependem da conversa.
export function ehSeguimento(texto) {
  const n = normalizar(texto);
  if (!n) return false;
  const palavras = n.split(' ');
  if (palavras.some(function (p) { return SIGLAS[p]; })) {
    // com sigla, só é seguimento se deixar isso explícito ("e para o BPC?", "isso vale para o PAIF?")
    return /^(e|mas|entao|ou|agora|e se|e quanto|e quando|e como|e onde|e quem|e para|e pra)\b/.test(n) || palavras.some(function (p) { return ANAFORA.has(p); });
  }
  if (tokenizar(texto).length <= 3) return true;
  if (/^(e|mas|entao|ou|agora|nesse caso|e se|e quanto|e quando|e como|e onde|e quem|e para|e pra)\b/.test(n)) return true;
  return palavras.some(function (p) { return ANAFORA.has(p); }) && palavras.length <= 10;
}

// Texto usado na BUSCA de normas. Pergunta que depende da anterior herda o assunto dela; pedido de ajuste
// ("mais curto") não busca por si mesmo (as palavras dele só trariam trecho ao acaso), usa só o assunto anterior.
export function consultaDoPedido(pergunta, historico, modo) {
  if (modo !== 'refinamento' && modo !== 'seguimento' && modo !== 'continuar' && modo !== 'porque' && modo !== 'contestacao') return pergunta;
  const lista = Array.isArray(historico) ? historico : [];
  // Anda para trás pelas mensagens do(a) profissional até achar a pergunta que carrega o assunto: pula "oi" e "mais curto",
  // e junta os seguimentos em cadeia ("e para adolescente?" depois "e para idoso?" continuam no assunto da primeira).
  const partes = [];
  for (let i = lista.length - 1; i >= 0 && partes.length < 3; i--) {
    const h = lista[i];
    if (!h || h.papel !== 'usuario' || !h.texto) continue;
    const texto = String(h.texto).slice(0, 300);
    if (ehSaudacao(texto) || pareceAjuste(texto) || pedidoSobreResposta(texto, RESPOSTA_FALSA)) continue;
    partes.unshift(texto);
    if (!ehSeguimento(texto)) break;
  }
  if (!partes.length) return pergunta;
  // Contestação traz palavras novas ("mas li que o limite é meio salário"): buscam junto com o assunto. Ajuste, continuar e "por quê?" só herdam.
  return (modo === 'seguimento' || modo === 'contestacao') ? partes.join(' ') + ' ' + pergunta : partes.join(' ');
}

// ------------------------------------------------------------------ classificação

const RE_CONSULTA = /\b(telefone|fone|contato|endereco|onde fica|horario|quantos|quantas|qual (?:cras|creas|ubs|caps|conselho|delegacia|centro pop)|que cras|que creas|bairro)\b/;

// Devolve 'saudacao' | 'refinamento' | 'continuar' | 'contestacao' | 'porque' | 'seguimento' | 'consulta' | 'normal'.
export function classificarPedido(pergunta, historico, { temFichas = false, temPanorama = false } = {}) {
  if (ehSaudacao(pergunta)) return 'saudacao';
  if (ehRefinamento(pergunta, historico)) return 'refinamento';
  const sobre = pedidoSobreResposta(pergunta, historico);
  if (sobre) return sobre;
  if (ehSeguimento(pergunta) && Array.isArray(historico) && historico.some(function (h) { return h && h.papel === 'usuario'; })) return 'seguimento';
  if ((temFichas || temPanorama) && RE_CONSULTA.test(normalizar(pergunta))) return 'consulta';
  return 'normal';
}

// Quantos trechos de norma vão para a IA. Cumprimento não precisa de nenhum; pedido de ajuste só precisa do que a
// resposta anterior já usava; pergunta rica (várias ideias) merece um trecho a mais.
export function trechosParaOPedido(modo, pergunta, padrao) {
  if (modo === 'saudacao') return 0;
  if (modo === 'refinamento' || modo === 'continuar') return Math.min(3, padrao);
  if (modo === 'porque' || modo === 'contestacao') return padrao;
  if (modo === 'consulta') return padrao;
  return tokenizar(pergunta).length >= 6 ? padrao + 1 : padrao;
}

// Parâmetros da IA por situação. Os valores "normais" são os de sempre (900 tokens, temperatura 0,4),
// para a resposta de rotina não mudar; o que muda é o que precisa mudar.
//   pref.tamanho === 'curto' (memória do aparelho) continua mandando no teto de respostas comuns.
export function perfilDaIA({ modo, tema = false, comTextoPronto = false, pref = null, quantitativo = false, partes = 0 }) {
  if (modo === 'saudacao') return { max_tokens: 160, temperature: 0.5 };
  if (tema) return { max_tokens: 900, temperature: 0.4 };
  // Pergunta de conta: o número vem do programa, a IA só explica. Temperatura baixa para não reescrever o resultado.
  if (comTextoPronto) return { max_tokens: 1400, temperature: quantitativo ? 0.3 : 0.5 };
  if (quantitativo && modo !== 'refinamento') return { max_tokens: pref && pref.tamanho === 'curto' ? 600 : 1000, temperature: 0.2 };
  if (modo === 'refinamento') return { max_tokens: pref && pref.tamanho === 'curto' ? 700 : 1200, temperature: 0.45 };
  // Contestar e explicar a fonte pedem firmeza (pouca criatividade); continuar pede espaço; pergunta composta ganha espaço por parte.
  if (modo === 'contestacao' || modo === 'porque') return { max_tokens: 800, temperature: 0.2 };
  if (modo === 'continuar') return { max_tokens: pref && pref.tamanho === 'curto' ? 700 : 1100, temperature: 0.45 };
  if (partes >= 2 && !(pref && pref.tamanho === 'curto')) return { max_tokens: 1300, temperature: 0.4 };
  if (pref && pref.tamanho === 'curto') return { max_tokens: 500, temperature: modo === 'consulta' ? 0.2 : 0.4 };
  if (modo === 'consulta') return { max_tokens: 900, temperature: 0.2 };
  return { max_tokens: 900, temperature: 0.4 };
}
