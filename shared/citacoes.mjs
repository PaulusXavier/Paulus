// Verificador de citações da síntese de investigação. Função pura (sem rede, sem DOM): o Worker usa depois da síntese.
// Confere duas coisas contra o que foi realmente recolhido (fontes com título, endereço, trecho e texto lido):
//   1) links: todo https:// na síntese precisa ser de uma fonte da lista; os inventados são trocados por um aviso;
//   2) aspas: trecho entre aspas (4+ palavras) precisa aparecer num texto lido; se não aparecer, recebe uma marca.
// Limite conhecido: confere presença, não sentido. "Confiável" quer dizer só "nada inventado foi achado".

const RE_URL = /https?:\/\/[^\s<>"'`\])}]+/gi;
const RE_ASPAS = /[“"]([^”"\n]{20,400})[”"]/g;

function limparFimUrl(u) { return u.replace(/[.,;:!?…]+$/, ''); }

export function normalizarUrl(u) {
  try {
    const x = new URL(limparFimUrl(String(u)));
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
    x.hash = '';
    let p = x.pathname.replace(/\/+$/, '');
    return x.protocol + '//' + x.host.toLowerCase() + p + x.search;
  } catch { return ''; }
}

export function normalizarTexto(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[“”"'‘’«»]/g, ' ').replace(/[^a-z0-9%$]+/g, ' ').trim();
}

export function verificarCitacoes(sintese, fontes) {
  const texto = String(sintese || '');
  const lista = Array.isArray(fontes) ? fontes : [];
  const permitidas = new Set(lista.map(f => normalizarUrl(f && f.url)).filter(Boolean));
  const corpus = normalizarTexto(lista.map(f => [f && f.title, f && f.snippet, f && f.text].filter(Boolean).join(' ')).join(' \n '));

  const urlsRemovidas = [];
  const citadas = new Set();
  let saida = texto.replace(RE_URL, (bruto) => {
    const limpo = limparFimUrl(bruto), resto = bruto.slice(limpo.length), n = normalizarUrl(limpo);
    if (n && permitidas.has(n)) { citadas.add(n); return bruto; }
    if (!urlsRemovidas.includes(limpo)) urlsRemovidas.push(limpo);
    return '[link removido: não consta nas fontes lidas]' + resto;
  });

  const aspasNaoEncontradas = [];
  saida = saida.replace(RE_ASPAS, (m, trecho) => {
    if (normalizarTexto(trecho).split(' ').filter(Boolean).length < 4) return m;
    if (corpus && corpus.includes(normalizarTexto(trecho))) return m;
    if (!aspasNaoEncontradas.includes(trecho)) aspasNaoEncontradas.push(trecho);
    return m + ' [citação não confirmada nas fontes]';
  });

  // Sem link válido, ainda vale citar a fonte pelo título (a pergunta do Worker pede "título e URL").
  const citaPorTitulo = lista.some(f => f && f.title && f.title !== f.url && normalizarTexto(saida).includes(normalizarTexto(f.title)) && normalizarTexto(f.title).length >= 6);
  const semCitacao = lista.length > 0 && citadas.size === 0 && !citaPorTitulo;
  const confiavel = lista.length > 0 && !urlsRemovidas.length && !aspasNaoEncontradas.length && !semCitacao;

  const partes = [];
  if (!lista.length) partes.push('Sem fontes para conferir.');
  else {
    partes.push(citadas.size + (citadas.size === 1 ? ' fonte citada confere' : ' fontes citadas conferem') + ' com as lidas.');
    if (urlsRemovidas.length) partes.push(urlsRemovidas.length + (urlsRemovidas.length === 1 ? ' link inventado removido.' : ' links inventados removidos.'));
    if (aspasNaoEncontradas.length) partes.push(aspasNaoEncontradas.length + (aspasNaoEncontradas.length === 1 ? ' citação não encontrada nas fontes.' : ' citações não encontradas nas fontes.'));
    if (semCitacao) partes.push('A síntese não cita nenhuma fonte.');
  }
  return { sintese: saida, citacoes: citadas.size, urlsRemovidas, aspasNaoEncontradas, semCitacao, confiavel, resumo: partes.join(' ') };
}
