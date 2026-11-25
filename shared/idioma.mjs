// Idioma do pedido (v0.19.0): junta o espanhol (shared/espanhol.mjs) e o inglês (shared/ingles.mjs) em um só lugar,
// para o Worker e o navegador perguntarem "em que idioma respondo?" sem repetir a lógica. Português é o padrão.

import { espDetectarIdioma, espIdiomaDoPedido, espParaBusca, espInstrucaoParaIA, espRespostaLocal, AVISO_PESSOAL_ES } from './espanhol.mjs';
import { ingDetectarIdioma, ingTextoEmIngles, ingParaBusca, ingInstrucaoParaIA, ingRespostaLocal, AVISO_PESSOAL_EN } from './ingles.mjs';
import { respostaLocalEstudo } from './idioma-estudo.mjs';

// 'en' | 'es' | 'pt' | 'indef'
function idiomaDe(texto) {
  if (ingDetectarIdioma(texto) === 'en') return 'en';
  if (espDetectarIdioma(texto) === 'es') return 'es';
  return (ingDetectarIdioma(texto) === 'indef' && espDetectarIdioma(texto) === 'indef') ? 'indef' : 'pt';
}

// { resposta: 'pt'|'es'|'en', textoEs, textoEn, pratica }. Mensagem curta e neutra ("ok") herda o idioma da conversa.
export function idiomaDoPedido(texto, historico) {
  const es = espIdiomaDoPedido(texto, []);
  const id = idiomaDe(texto);
  let resposta = id === 'en' || id === 'es' ? id : 'pt';
  if (id === 'indef' && Array.isArray(historico)) {
    for (let i = historico.length - 1; i >= 0; i--) {
      const h = historico[i];
      if (h && h.papel === 'usuario' && h.texto) { const antes = idiomaDe(h.texto); resposta = antes === 'en' || antes === 'es' ? antes : 'pt'; break; }
    }
  }
  return { resposta: resposta, textoEs: !!es.textoEs, textoEn: ingTextoEmIngles(texto), pratica: false };
}

export function paraBusca(texto) { return (espParaBusca(texto) + ' ' + ingParaBusca(texto)).trim(); }

export function instrucaoDeIdioma(info, pergunta, historico) {
  return (espInstrucaoParaIA(info, pergunta, historico) + ingInstrucaoParaIA(info, pergunta, historico));
}

export function avisoPessoalNoIdioma(info, avisoPt) {
  return info && info.resposta === 'es' ? AVISO_PESSOAL_ES : info && info.resposta === 'en' ? AVISO_PESSOAL_EN : avisoPt;
}

// Vocabulário, frases e falsos amigos no aparelho (espanhol e inglês). Devolve { tipoLocal, texto, idioma } ou null.
export function respostaLocalDeIdioma(pergunta, historico) {
  // pedido que fala de inglês vai primeiro ao módulo do inglês ("falsos amigos português inglês" também casaria com o espanhol)
  const fala = /\bingl[eê]s\b|\benglish\b|\bguian|\bguyan/i.test(String(pergunta));
  const ordem = fala ? [['en', ingRespostaLocal], ['es', espRespostaLocal]] : [['es', espRespostaLocal], ['en', ingRespostaLocal]];
  for (const par of ordem) { const r = par[1](pergunta); if (r) return Object.assign({ idioma: par[0] }, r); }
  return respostaLocalEstudo(pergunta, historico);
}
