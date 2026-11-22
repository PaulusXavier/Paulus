import { normalizar, tokenizar } from './busca.mjs';

// Conferência das citações da IA. O prompt já proíbe citar artigo ou lei que não esteja em <normas>, mas modelo erra.
// Aqui a regra é conferida por código: o Worker diz quais artigos e leis estavam nos trechos que a IA LEU (numerosCitaveis),
// e o navegador compara com o que a resposta citou (citacoesSemFonte). Citação fora da lista vira AVISO para a pessoa conferir;
// o texto da resposta não é alterado. Funciona no Worker e no navegador.

// "art. 17", "Art. 5º", "artigo 20", "arts. 17 e 18", "arts. 17, 18 e 19", "arts. 17 a 19"
const RE_ARTIGO = /\bart(?:igos?|s?\.)?\s*(\d{1,4})((?:\s*(?:,|e|a|ao)\s*\d{1,4})*)/gi;
// "Lei 8.742", "Lei nº 8.742/1993", "Decreto 7.053", "Resolução CFP nº 06/2019", "Resolução nº 109"
const RE_LEI = /\b([Ll]ei|LEI|[Dd]ecreto|[Rr]esolu[cç][aã]o|[Pp]ortaria|[Ii]nstru[cç][aã]o [Nn]ormativa)(?:\s+(?:[Ff]ederal|[Cc]omplementar|[Mm]unicipal|[Ee]stadual|[Cc]onjunta))?(?:\s+[A-Z]{2,8})?\s*(?:[Nn][ºo°.]{0,2}\s*)?(\d[\d.]{0,8})/g;

// "R$ 600", "R$ 1.518,00", "R$ 218,50", "R$ 142". Guardado na forma canônica: sem ponto de milhar e sem ",00" ("1518", "218.5").
const RE_VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;

function valorCanonico(bruto) {
  const n = Number(String(bruto).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? String(n) : '';
}

// Valores em reais citados no texto: conjunto de strings canônicas.
export function valoresCitados(texto) {
  const achou = new Set();
  const t = String(texto == null ? '' : texto);
  let m;
  RE_VALOR.lastIndex = 0;
  while ((m = RE_VALOR.exec(t)) !== null) {
    const v = valorCanonico(m[1]);
    if (v) achou.add(v);
  }
  return achou;
}

// "R$ 1.518" para mostrar à pessoa.
function rotuloValor(canonico) {
  const [inteiro, dec] = canonico.split('.');
  return 'R$ ' + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + (dec.length === 1 ? dec + '0' : dec) : '');
}

function semZeros(n) { return String(n).replace(/\./g, '').replace(/^0+(?=\d)/, ''); }

// Números de artigo citados no texto (conjunto de strings).
export function artigosCitados(texto) {
  const achou = new Set();
  const t = String(texto == null ? '' : texto);
  let m;
  RE_ARTIGO.lastIndex = 0;
  while ((m = RE_ARTIGO.exec(t)) !== null) {
    achou.add(semZeros(m[1]));
    (m[2].match(/\d{1,4}/g) || []).forEach(function (n) { achou.add(semZeros(n)); });
  }
  return achou;
}

// Leis, decretos e resoluções citados: { chave: 'lei 8742', rotulo: 'Lei 8.742' }
export function leisCitadas(texto) {
  const achou = new Map();
  const t = String(texto == null ? '' : texto);
  let m;
  RE_LEI.lastIndex = 0;
  while ((m = RE_LEI.exec(t)) !== null) {
    const numero = semZeros(m[2].replace(/\.+$/, ''));
    if (!numero) continue;
    const tipo = m[1].toLowerCase().replace('ç', 'c').replace('ã', 'a');
    achou.set(tipo + ' ' + numero, m[1] + ' ' + m[2].replace(/\.+$/, ''));
  }
  return achou;
}

// Do lado do Worker: o que a IA tinha diante de si. { a: ['17','20'], l: ['lei 8742'] }
// Olha o texto inteiro de cada trecho (referência, título, norma e texto), porque é isso que a IA leu.
// extras (opcional): outros textos que a IA recebeu (fichas, base do app, panorama, a própria pergunta). Deles só se tiram os valores em R$.
export function numerosCitaveis(achados, extras) {
  const a = new Set(), l = new Set(), v = new Set();
  for (const x of Array.isArray(achados) ? achados : []) {
    const t = x && x.trecho;
    if (!t) continue;
    const tudo = [t.referencia, t.titulo, t.norma, t.texto].join(' \n ');
    artigosCitados(tudo).forEach(function (n) { a.add(n); });
    // número solto na referência ("art. 20, § 3º") também vale: parágrafo e inciso não são tratados como artigo novo
    (String(t.referencia || '').match(/\d{1,4}/g) || []).forEach(function (n) { a.add(semZeros(n)); });
    leisCitadas(tudo).forEach(function (_, k) { l.add(k); });
    valoresCitados(tudo).forEach(function (n) { v.add(n); });
  }
  for (const e of Array.isArray(extras) ? extras : []) valoresCitados(e).forEach(function (n) { v.add(n); });
  return { a: Array.from(a).sort(), l: Array.from(l).sort(), v: Array.from(v).sort(function (x, y) { return Number(x) - Number(y); }) };
}

// Do lado do navegador. citaveis = { a, l } vindo do Worker; sem ele (Worker antigo), usa só as fontes que vieram.
// extras: textos que a IA já tinha visto na conversa (respostas anteriores), cujas citações já foram vistas pela pessoa.
// Devolve a lista de citações sem fonte, já escrita para mostrar: ['art. 99', 'Lei 12.345'].
export function citacoesSemFonte(texto, citaveis, fontes, extras) {
  const arts = new Set(), leis = new Set();
  if (citaveis && Array.isArray(citaveis.a)) citaveis.a.forEach(function (n) { arts.add(String(n)); });
  if (citaveis && Array.isArray(citaveis.l)) citaveis.l.forEach(function (n) { leis.add(String(n)); });
  if (!citaveis) {
    (Array.isArray(fontes) ? fontes : []).forEach(function (f) {
      const tudo = [f && f.referencia, f && f.documento, f && f.norma].join(' \n ');
      artigosCitados(tudo).forEach(function (n) { arts.add(n); });
      (String((f && f.referencia) || '').match(/\d{1,4}/g) || []).forEach(function (n) { arts.add(semZeros(n)); });
      leisCitadas(tudo).forEach(function (_, k) { leis.add(k); });
    });
  }
  // Valores em R$: só se confere quando o Worker informou a lista (Worker antigo não manda "v": nada a comparar).
  const valoresOk = citaveis && Array.isArray(citaveis.v) ? new Set(citaveis.v.map(String)) : null;
  (Array.isArray(extras) ? extras : []).forEach(function (e) {
    artigosCitados(e).forEach(function (n) { arts.add(n); });
    leisCitadas(e).forEach(function (_, k) { leis.add(k); });
    if (valoresOk) valoresCitados(e).forEach(function (n) { valoresOk.add(n); });
  });
  const saida = [];
  artigosCitados(texto).forEach(function (n) { if (!arts.has(n)) saida.push('art. ' + n); });
  leisCitadas(texto).forEach(function (rotulo, k) { if (!leis.has(k)) saida.push(rotulo); });
  if (valoresOk) valoresCitados(texto).forEach(function (n) { if (!valoresOk.has(n)) saida.push(rotuloValor(n)); });
  return saida;
}

// Quais das fontes recuperadas a resposta realmente usou. A busca traz candidatas; a IA usa algumas. Uma fonte conta como usada se a resposta
// cita o número da lei/decreto/resolução dela, ou nomeia o documento (a maior parte das palavras do título); quando a fonte é um artigo e a
// resposta cita artigos, o artigo da fonte precisa estar entre os citados.
export function fontesUsadas(texto, fontes) {
  const t = String(texto == null ? '' : texto);
  const tn = ' ' + normalizar(t) + ' ';
  const tokens = new Set(tokenizar(t));
  const artigos = artigosCitados(t);
  const leis = leisCitadas(t);
  return (Array.isArray(fontes) ? fontes : []).map(function (f) {
    if (!f) return false;
    let porNumero = false;
    leisCitadas([f.norma, f.documento].join(' ')).forEach(function (_, k) { if (leis.has(k)) porNumero = true; });
    const titulo = normalizar(f.documento);
    const palavras = Array.from(new Set(tokenizar(f.documento)));
    const nomeou = (titulo.length >= 3 && tn.indexOf(' ' + titulo + ' ') >= 0) ||
      (palavras.length >= 2 && palavras.filter(function (w) { return tokens.has(w); }).length / palavras.length >= 0.7);
    if (!porNumero && !nomeou) return false;
    const art = /^art\.\s*(\d{1,4})/i.exec(String(f.referencia || ''));
    if (art && artigos.size && !artigos.has(semZeros(art[1]))) return false;
    return true;
  });
}

// Fontes sem repetição, com "usada" marcado e as usadas primeiro. Se nenhuma for reconhecida como usada, nada é afirmado: volta a lista como veio.
export function marcarFontesUsadas(texto, fontes) {
  const vistos = new Set();
  const lista = (Array.isArray(fontes) ? fontes : []).filter(function (f) {
    const c = f ? [f.documento, f.referencia].join('|') : '';
    if (!f || vistos.has(c)) return false;
    vistos.add(c);
    return true;
  });
  const uso = fontesUsadas(texto, lista);
  if (!uso.some(Boolean)) return lista;
  const marcadas = lista.map(function (f, i) { return Object.assign({}, f, { usada: uso[i] }); });
  return marcadas.filter(function (f) { return f.usada; }).concat(marcadas.filter(function (f) { return !f.usada; }));
}
