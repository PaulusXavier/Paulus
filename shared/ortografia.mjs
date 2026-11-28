// Ortografia por dicionário de português (o mesmo do Verbus: Hunspell + dicionário pt-BR do LibreOffice/VERO), conferida no aparelho.
// Este arquivo só tem a parte que não depende do navegador: escolher as palavras a conferir, juntar o resultado do dicionário e aplicar as trocas.
// Quem fala com o dicionário (um Web Worker, vendor/spell/) é console/ortografia.js. O texto nunca sai do aparelho.
//
// ortPalavras(texto, ignorar) -> [{ palavra, inicio }]            palavras que valem a conferência (sem sigla, nome próprio no meio da frase, e-mail, endereço)
// ortAgrupar(texto, palavras, resultados) -> [{ palavra, inicios, sugestoes, seguro }]   só as que o dicionário não conhece
//     resultados: { palavra: { ok: boolean, sug: string[] | null } }
// ortAplicar(texto, grupos, escolhas) -> texto com as trocas   escolhas: { palavra: troca }
// ortSugestaoSegura(palavra, sugestao) -> true quando a sugestão é a mesma palavra só com o acento ou o cedilha corrigido

// Palavras do trabalho social que o dicionário geral não traz (somam-se às que a pessoa adiciona no console).
export const ORT_EXTRA = 'condicionalidade condicionalidades socioassistencial socioassistenciais socioeducativo socioeducativa socioeducativos socioeducativas intersetorial intersetoriais intersetorialidade pix emoji emojis podcast podcasts selfie selfies online offline smartphone smartphones wifi whatsapp instagram wi-fi app apps gov genograma genogramas ecomapa ecomapas déficit déficits psicoeducação matriciamento socioemocional socioemocionais neurodivergente neurodivergentes neurodivergência cisgênero heteroagressividade intrafamiliar intrafamiliares transgeracional transgeracionais contrarreferência contrarreferências referenciamento vulnerabilização revitimização parentalidade coparentalidade homoparental homoparentais cadúnico psicossocial psicossociais socioterritorial socioterritoriais territorialização cadastramento acolhida acolhidas';

const ORT_MAX_PALAVRAS = 3000;       // palavras diferentes por conferência (texto de até ~20 mil caracteres)
const ORT_MAX_SUGESTOES = 4;
const ORT_PALAVRA = /(?<![\p{L}\p{N}@\/._-])\p{L}+(?:-\p{L}+)*(?![\p{L}\p{N}@\/_]|\.\p{L})/gu;
const ORT_MARCAS = /[\u0300-\u036f]/g;

function ortSemAcento(s) { return String(s).normalize('NFD').replace(ORT_MARCAS, '').toLowerCase(); }
function ortCaixa(orig, novo) {
  if (orig.length > 1 && orig === orig.toUpperCase()) return novo.toUpperCase();
  if (orig.charAt(0) !== orig.charAt(0).toLowerCase()) return novo.charAt(0).toUpperCase() + novo.slice(1);
  return novo;
}

export function ortSugestaoSegura(palavra, sugestao) {
  return !!sugestao && sugestao.toLowerCase() !== String(palavra).toLowerCase() && ortSemAcento(sugestao) === ortSemAcento(palavra);
}

export function ortPalavras(texto, ignorar) {
  const t = String(texto == null ? '' : texto).slice(0, 20000);
  const pular = ignorar instanceof Set ? ignorar : new Set(ignorar || []);
  const saida = [];
  const vistas = new Set();
  let m;
  ORT_PALAVRA.lastIndex = 0;
  while ((m = ORT_PALAVRA.exec(t)) !== null) {
    const w = m[0];
    if (w.length < 2 || pular.has(w) || pular.has(w.toLowerCase())) continue;
    if (w === w.toUpperCase()) continue;                                                       // sigla ou caixa alta
    // nome próprio no meio da frase (maiúscula que não abre frase, linha nem lista) não é conferido
    if (w.charAt(0) !== w.charAt(0).toLowerCase() && !/(^|[.!?…:;]\s+|\n\s*|[-•*]\s+)$/.test(t.slice(0, m.index))) continue;
    if (!vistas.has(w)) {
      if (vistas.size >= ORT_MAX_PALAVRAS) break;
      vistas.add(w);
    }
    saida.push({ palavra: w, inicio: m.index });
  }
  return saida;
}

function ortLimparSugestoes(palavra, lista) {
  const composta = palavra.indexOf('-') !== -1;
  const vistos = new Set();
  const limpas = [];
  for (const s of lista || []) {
    if (typeof s !== 'string' || !s || /\s/.test(s)) continue;                                  // "beneficia rio", "reuni ao": lixo do Hunspell
    if (!composta && s.indexOf('-') !== -1) continue;                                           // "reunia-o"
    if (s.toLowerCase() === palavra.toLowerCase() || vistos.has(s)) continue;
    vistos.add(s);
    limpas.push(s);
  }
  // a mesma palavra com o acento corrigido vem primeiro
  limpas.sort(function (a, b) { return (ortSugestaoSegura(palavra, b) ? 1 : 0) - (ortSugestaoSegura(palavra, a) ? 1 : 0); });
  return limpas.slice(0, ORT_MAX_SUGESTOES);
}

export function ortAgrupar(texto, palavras, resultados) {
  const res = resultados || {};
  const grupos = new Map();
  for (const p of palavras || []) {
    const r = res[p.palavra];
    if (!r || r.ok !== false) continue;
    let g = grupos.get(p.palavra);
    if (!g) {
      const sugestoes = ortLimparSugestoes(p.palavra, r.sug);
      g = { palavra: p.palavra, inicios: [], sugestoes: sugestoes, seguro: sugestoes.length > 0 && ortSugestaoSegura(p.palavra, sugestoes[0]) };
      grupos.set(p.palavra, g);
    }
    g.inicios.push(p.inicio);
  }
  return Array.from(grupos.values());
}

export function ortAplicar(texto, grupos, escolhas) {
  const t = String(texto == null ? '' : texto);
  const esc = escolhas || {};
  const trocas = [];
  for (const g of grupos || []) {
    const novo = esc[g.palavra];
    if (!novo || novo === g.palavra) continue;
    for (const i of g.inicios) {
      if (t.substr(i, g.palavra.length) !== g.palavra) continue;                                // o texto base mudou: não arrisca
      trocas.push({ inicio: i, tamanho: g.palavra.length, novo: ortCaixa(g.palavra, novo) });
    }
  }
  trocas.sort(function (a, b) { return b.inicio - a.inicio; });
  let saida = t;
  for (const x of trocas) saida = saida.slice(0, x.inicio) + x.novo + saida.slice(x.inicio + x.tamanho);
  return saida;
}

// Escolhas iniciais: só as trocas seguras (mesma palavra, acento corrigido). O resto fica para a pessoa decidir.
export function ortEscolhasSeguras(grupos) {
  const esc = {};
  for (const g of grupos || []) if (g.seguro) esc[g.palavra] = g.sugestoes[0];
  return esc;
}

export function ortResumo(grupos, total) {
  if (!grupos.length) return 'Todas as ' + total + ' palavras conferidas estão no dicionário de português.';
  const seguras = grupos.filter(function (g) { return g.seguro; }).length;
  return grupos.length + (grupos.length === 1 ? ' palavra fora do dicionário' : ' palavras fora do dicionário') +
    (seguras ? ' (' + seguras + (seguras === 1 ? ' com acento a corrigir, já marcada' : ' com acento a corrigir, já marcadas') + ')' : '') +
    '. Confira cada uma: nomes e termos novos podem estar certos.';
}
