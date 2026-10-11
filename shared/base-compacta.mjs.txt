// Versão da base de normas feita só para o Worker, que tem limite de tamanho no plano gratuito (3 MB compactado).
//   - os dados do documento (título, norma, ano...) ficam numa tabela, em vez de repetidos em cada trecho;
//   - o texto de cada trecho é cortado em MAX_TEXTO_TRECHO caracteres, que é o máximo que a IA recebe (worker/prompt.mjs).
// O Worker devolve ao handler os mesmos objetos de sempre (expandirBase), então nada mais muda nele.
import { MAX_TEXTO_TRECHO } from './busca.mjs';

export function compactarBase(base) {
  const docs = [], posicao = new Map(), linhas = [];
  for (const c of base) {
    if (!posicao.has(c.doc)) {
      posicao.set(c.doc, docs.length);
      docs.push([c.doc, c.titulo, c.norma, c.ano, c.tipo || '', c.pacote || '']);
    }
    linhas.push([posicao.get(c.doc), c.referencia, c.texto.slice(0, MAX_TEXTO_TRECHO)]);
  }
  return { docs: docs, linhas: linhas };
}

export function expandirBase(compacta) {
  const contagem = new Array(compacta.docs.length).fill(0);
  return compacta.linhas.map(function (l) {
    const d = compacta.docs[l[0]];
    const c = { id: d[0] + '#' + (++contagem[l[0]]), doc: d[0], titulo: d[1], norma: d[2], ano: d[3], referencia: l[1], texto: l[2] };
    if (d[4]) c.tipo = d[4];
    if (d[5]) c.pacote = d[5];
    return c;
  });
}
