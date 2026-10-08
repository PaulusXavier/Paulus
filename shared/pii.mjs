// Filtro de dados pessoais. FONTE ÚNICA: o navegador (dist/paulus.js) e o Worker usam este arquivo.
// Barra e-mail, sequências longas de números (CPF, NIS, telefone), "nome + sobrenome" depois de
// palavras como "nome/chama", tratamento + nome ("dona Maria Souza") e endereço residencial.
// Limite conhecido: é um filtro por padrões, não uma garantia. Por isso a regra de ouro continua
// sendo "dados de famílias nunca chegam a este código".
// (Sem lookbehind de propósito: Safari/iOS antigos quebram o arquivo inteiro com ele.)

const CAP = 'A-ZÁÉÍÓÚÂÊÔÃÕÇ';
const MIN_L = 'a-záéíóúâêôãõç';
const FORA = '(?:^|[^A-Za-zÀ-ÿ])';
const NOME2 = '[' + CAP + '][' + MIN_L + ']+\\s+[' + CAP + '][' + MIN_L + ']+';

const RE_NOME = new RegExp(FORA + '(?:[Nn]ome|[Cc]hama|[Cc]hamada|[Cc]hamado|[Ss]obrenome)(?![A-Za-zÀ-ÿ])[^.?!\\n]{0,25}?' + FORA + NOME2);
const RE_TRAT = new RegExp(FORA + '(?:[Dd]ona|[Dd]na|[Ss]r|[Ss]ra|[Ss]eu|[Ss]enhor|[Ss]enhora)\\.?\\s+[' + CAP + '][' + MIN_L + ']{2,}\\s+[' + CAP + '][' + MIN_L + ']{2,}');
const RE_ENDERECO = /\b(mora|moram|moradora?|reside|residente|endere[cç]o)\b[^.?!\n]{0,40}\b(rua|av\.?|avenida|travessa|tv\.?|quadra|lote)\b[^.?!\n]{0,40}\b\d+/i;

export function temDadoPessoal(texto) {
  const t = String(texto == null ? '' : texto);
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) return true;
  const sequencias = t.match(/\d[\d.\-\/\s]{6,}\d/g) || [];
  if (sequencias.some(s => s.replace(/\D/g, '').length >= 9)) return true;
  if (RE_NOME.test(t) || RE_TRAT.test(t)) return true;
  return RE_ENDERECO.test(t);
}

export function limparMarcacao(texto) {
  return String(texto == null ? '' : texto).replace(/<\/?\w+>/g, '').trim();
}
