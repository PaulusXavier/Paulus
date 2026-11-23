// Cálculos prontos do Paulus (alem da aritmética de calculo.mjs): porcentagem, regra de três, rateio, renda per capita, frequência, IMC, taxa por mil,
// conversão de unidades, geometria, juros e financiamento, férias e 13º, horas, viagem, bases numéricas, números romanos, fatoração,
// equação do 1º e 2º grau, escore z/T e tamanho de amostra. Tudo no aparelho, exato, sem IA e sem rede. FONTE ÚNICA: navegador e Worker.
//
//   contasDoPedido(texto, opc)   -> { itens, soConta, sensivel, origem:'datas'|'especial'|'aritmetica' } ou null (quem decide é a mensagem)
//   respostaDoPedido(texto, opc) -> { texto, itens, sensivel, origem } só quando a mensagem É o pedido de conta (resposta direta, sem IA)
//   linhaDeItem(item)            -> "rótulo: conta = resultado"
//
// Item: { rotulo, expressao, valor, texto, moeda, bool, erro, sensivel }. Nomes com prefixo "cmx" (no navegador os módulos viram um arquivo só).
// Faixas e fórmulas são as de uso corrente (IMC da OMS para adultos, Price, tamanho de amostra de população grande); a resposta diz quando é suposição.

import { formatarNumero, arredondarCasas, calcularExpressao, contasConfiaveis, respostaDeConta } from './calculo.mjs';
import { resolverDatas } from './datas.mjs';

const CMX_NUM = '\\d[\\d.]*(?:,\\d+)?';
const CMX_PI = Math.PI;

// ------------------------------------------------------------------ utilidades

function cmxSemAcentos(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Lê um número escrito do jeito brasileiro ("1.518,50", "1,75", "200.").
function cmxNum(s) {
  const r = calcularExpressao(String(s == null ? '' : s).replace(/[.,]+$/, ''), {});
  return r.ok && !r.bool ? r.valor : NaN;
}

function cmxNumeros(s) {
  const achados = String(s).match(new RegExp(CMX_NUM, 'g')) || [];
  return achados.map(cmxNum).filter(function (x) { return isFinite(x); });
}

function cmxF(x, casas) {
  return formatarNumero(x, { casas: casas == null ? 4 : casas });
}

// Valor já arredondado de propósito: sem o "≈" automático.
function cmxA(x, casas) {
  return formatarNumero(arredondarCasas(x, casas), { casas: casas });
}

function cmxM(x) {
  return formatarNumero(x, { moeda: true });
}

// Negativo entre parênteses dentro de uma conta escrita: (-5)².
function cmxP(x) {
  return x < 0 ? '(' + cmxF(x) + ')' : cmxF(x);
}

function cmxItem(rotulo, expressao, valor, texto, extra) {
  return Object.assign({ rotulo: rotulo, expressao: expressao, valor: valor, texto: texto, moeda: false, bool: false, erro: false, sensivel: false }, extra || {});
}

function cmxErro(texto) {
  return cmxItem('', '', null, texto, { erro: true });
}

function cmxSaida(itens, n) {
  const palavras = String(n).replace(/[^a-z]+/g, ' ').split(' ').filter(Boolean).length;
  // Pergunta com contexto ("posso incluir no BPC?") não é só a conta: segue para a IA, que recebe o número pronto.
  const contexto = /\b(?:posso|devo|pode|podem|tenho|temos|direito|elegivel|elegibilidade|incluir|como\s+(?:faco|fazer|funciona|se|calcular|calculo|e)|porque|por que|explique|explica|o que|bpc|cras|creas|loas|suas|beneficio|cadunico|relatorio|oficio|paf|caso|paciente|usuario|atendido|atendida)\b/.test(n);
  return { itens: itens, soConta: palavras <= 20 && !contexto, sensivel: false, origem: 'especial' };
}

function cmxPlural(nome, v) {
  if (Math.abs(v) === 1) return nome;
  if (/^(?:segundo|minuto|hora|dia|semana|polegada|milha|jarda|libra|onça|arroba|radiano|hectare|tonelada|nó|galão)$/.test(nome)) return nome + (nome === 'nó' ? 's' : nome === 'galão' ? '' : 's');
  if (nome === 'galão') return 'galões';
  if (nome === 'pé') return 'pés';
  return nome;
}

// ------------------------------------------------------------------ porcentagem

function cmxPorcentagem(n) {
  let m = new RegExp('(' + CMX_NUM + ')\\s+(?:e|representa|corresponde\\s+a)\\s+(?:quantos?\\s+(?:por\\s+cento|%|porcento)|que\\s+(?:porcentagem|percentual))\\s+d[eoa]s?\\s+(' + CMX_NUM + ')').exec(n)
    || new RegExp('quantos?\\s+(?:por\\s+cento|%|porcento)\\s+(?:e|representa)\\s+(' + CMX_NUM + ')\\s+d[eoa]s?\\s+(' + CMX_NUM + ')').exec(n)
    || new RegExp('(?:qual\\s+(?:a\\s+)?(?:porcentagem|percentual)\\s+(?:de|que)\\s+)(' + CMX_NUM + ')\\s+(?:em\\s+relacao\\s+a|sobre|de|d[eoa]s?)\\s+(' + CMX_NUM + ')').exec(n);
  if (m) {
    const a = cmxNum(m[1]), b = cmxNum(m[2]);
    if (b === 0) return [cmxErro('Divisão por zero: o total não pode ser 0.')];
    const r = a / b * 100;
    return [cmxItem('porcentagem', cmxF(a) + ' ÷ ' + cmxF(b) + ' × 100', r, cmxF(r) + '%')];
  }
  m = new RegExp('(?:variacao|variou|aumento|reducao|crescimento|queda|diferenca)\\s+(?:percentual\\s+)?(?:de|entre)\\s+(' + CMX_NUM + ')\\s+(?:para|a|e|ate)\\s+(' + CMX_NUM + ')').exec(n)
    || new RegExp('(?:aument\\w+|sub\\w+|cresc\\w+|caiu|cair\\w*|reduz\\w+|diminu\\w+|baix\\w+|passou|foi)\\s+de\\s+(' + CMX_NUM + ')\\s+(?:para|a|ate)\\s+(' + CMX_NUM + ')').exec(n)
    || new RegExp('\\bde\\s+(' + CMX_NUM + ')\\s+(?:para|a|ate)\\s+(' + CMX_NUM + ')\\s*,?\\s*(?:qual|quanto|quantos)').exec(n);
  if (m && /%|por\s*cento|percent|variac|quantos?\s+(?:por|%)/.test(n)) {
    const a = cmxNum(m[1]), b = cmxNum(m[2]);
    if (a === 0) return [cmxErro('A variação percentual não existe quando o valor inicial é 0.')];
    const r = (b - a) / Math.abs(a) * 100;
    return [cmxItem('variação percentual', '(' + cmxF(b) + ' − ' + cmxF(a) + ') ÷ ' + cmxF(Math.abs(a)) + ' × 100', r, (r > 0 ? '+' : '') + cmxF(r) + '%' + (r > 0 ? ' (aumento)' : r < 0 ? ' (queda)' : ' (sem variação)'))];
  }
  m = new RegExp('(' + CMX_NUM + ')\\s+e\\s+(' + CMX_NUM + ')\\s*(?:%|por\\s*cento)\\s+de\\s+quanto').exec(n);
  if (m) {
    const a = cmxNum(m[1]), p = cmxNum(m[2]);
    if (p === 0) return [cmxErro('Porcentagem 0 não permite achar o total.')];
    const r = a / (p / 100);
    return [cmxItem('valor total', cmxF(a) + ' ÷ ' + cmxF(p) + '%', r, cmxF(r))];
  }
  m = new RegExp('(' + CMX_NUM + ')\\s*(?:%|por\\s*cento)\\s+de\\s+(desconto|abatimento|aumento|acrescimo)[^\\d]{0,40}(?:custa|custou|ficou|fica|saiu|paguei|pago|vale|foi)\\s*(?:r\\$)?\\s*(' + CMX_NUM + ')').exec(n);
  if (m && /original|antes|sem\s+(?:o\s+)?(?:desconto|aumento)|inicial/.test(n)) {
    const p = cmxNum(m[1]) / 100, v = cmxNum(m[3]);
    const fator = /desconto|abatimento/.test(m[2]) ? 1 - p : 1 + p;
    if (fator === 0) return [cmxErro('Com 100% de desconto não dá para achar o valor original.')];
    const r = v / fator;
    return [cmxItem('valor original', cmxF(v) + ' ÷ (' + (/desconto|abatimento/.test(m[2]) ? '1 − ' : '1 + ') + cmxF(p * 100) + '%)', r, cmxF(r))];
  }
  m = new RegExp('(' + CMX_NUM + ')\\s+com\\s+(?:um\\s+)?(?:desconto\\s+de\\s+)?(' + CMX_NUM + ')\\s*(?:%|por\\s*cento)(?:\\s+de\\s+(desconto|acrescimo|aumento|juros))?').exec(n);
  if (m && (/desconto/.test(n) || m[3])) {
    const v = cmxNum(m[1]), p = cmxNum(m[2]);
    const desc = /desconto/.test(m[3] || '') || (!m[3] && /desconto/.test(n));
    const r = desc ? v * (1 - p / 100) : v * (1 + p / 100);
    return [cmxItem(desc ? 'valor com desconto' : 'valor com acréscimo', cmxF(v) + (desc ? ' − ' : ' + ') + cmxF(p) + '%', r, cmxF(r))];
  }
  return null;
}

// ------------------------------------------------------------------ acréscimo e desconto em %

// "acrescentar 10% a 1.621", "aumentar 1.621 em 10%", "descontar 15% de 200", "reduzir 200 em 15%".
// Só com o verbo de comando, para não disputar com "aumentou de 1.500 para 1.621" (variação) nem com "com 15% de desconto".
function cmxAcrescimo(n) {
  const SOBE = '(?:acrescent\\w*|aument\\w*|adicion\\w*|reajust\\w*|some|somar|soma)';
  const DESCE = '(?:descont\\w*|reduz\\w*|diminu\\w*|abat\\w*|tire|tirar|tira)';
  const PC = '\\s*(?:%|por\\s*cento|porcento)';
  let m, sobe = null, p, v;
  if ((m = new RegExp('\\b' + SOBE + '\\s+(' + CMX_NUM + ')' + PC + '\\s+(?:a|ao|de|sobre|em|no|na)\\s+(' + CMX_NUM + ')').exec(n))) { sobe = true; p = cmxNum(m[1]); v = cmxNum(m[2]); }
  else if ((m = new RegExp('\\b' + SOBE + '\\s+(' + CMX_NUM + ')\\s+(?:em|com)\\s+(' + CMX_NUM + ')' + PC).exec(n))) { sobe = true; v = cmxNum(m[1]); p = cmxNum(m[2]); }
  else if ((m = new RegExp('\\b' + DESCE + '\\s+(' + CMX_NUM + ')' + PC + '\\s+(?:a|ao|de|sobre|em|no|na)\\s+(' + CMX_NUM + ')').exec(n))) { sobe = false; p = cmxNum(m[1]); v = cmxNum(m[2]); }
  else if ((m = new RegExp('\\b' + DESCE + '\\s+(' + CMX_NUM + ')\\s+(?:em|com)\\s+(' + CMX_NUM + ')' + PC).exec(n))) { sobe = false; v = cmxNum(m[1]); p = cmxNum(m[2]); }
  if (sobe === null || !isFinite(p) || !isFinite(v)) return null;
  const d = v * p / 100, r = sobe ? v + d : v - d;
  return [cmxItem(sobe ? 'valor com acréscimo' : 'valor com desconto', cmxF(v) + (sobe ? ' + ' : ' − ') + cmxF(p) + '% (' + cmxF(d) + ')', r, cmxF(r))];
}

// ------------------------------------------------------------------ valor por extenso (reais e centavos)

const CMX_UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const CMX_DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CMX_CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const CMX_ESC = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];

function cmxAte999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CMX_CEN[c]);
  if (r) p.push(r < 20 ? CMX_UN[r] : CMX_DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + CMX_UN[r % 10] : ''));
  return p.join(' e ');
}

function cmxInteiroExtenso(n) {
  if (n === 0) return 'zero';
  const g = []; let x = n;
  while (x > 0) { g.push(x % 1000); x = Math.floor(x / 1000); }
  const partes = []; let ultimo = 0;
  for (let i = g.length - 1; i >= 0; i--) {
    if (!g[i]) continue;
    ultimo = g[i];
    if (i === 1) partes.push(g[i] === 1 ? 'mil' : cmxAte999(g[i]) + ' mil');
    else if (i >= 2) partes.push(cmxAte999(g[i]) + ' ' + CMX_ESC[i][g[i] === 1 ? 0 : 1]);
    else partes.push(cmxAte999(g[i]));
  }
  if (partes.length === 1) return partes[0];
  const fim = partes.pop();
  // "mil e duzentos", "um milhão e um", mas "mil trezentos e vinte"
  return partes.join(' ') + (ultimo < 100 || ultimo % 100 === 0 ? ' e ' : ' ') + fim;
}

// Valor em reais por extenso. '' para zero ou inválido; null se passa de R$ 999 bilhões. Mesma regra do cartão "Valor por extenso" do Argo.
export function valorPorExtenso(valor) {
  const cents = Math.round(Number(valor) * 100);
  if (!isFinite(cents) || cents <= 0) return '';
  const reais = Math.floor(cents / 100), cts = cents % 100, out = [];
  if (reais > 999999999999) return null;
  if (reais) {
    const de = reais >= 1000000 && reais % 1000000 === 0;
    out.push(cmxInteiroExtenso(reais) + (de ? ' de ' : ' ') + (reais === 1 ? 'real' : 'reais'));
  }
  if (cts) out.push(cmxInteiroExtenso(cts) + (cts === 1 ? ' centavo' : ' centavos'));
  return out.join(' e ');
}

// Dinheiro escrito à mão: "1.621,50", "1621,5", "1621.50" (ponto com 1 ou 2 casas é decimal; ponto de milhar tem 3).
function cmxDinheiro(s) {
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return NaN;
  if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = parseFloat(t);
  return isFinite(v) ? v : NaN;
}

function cmxExtenso(n) {
  if (!/\bpor\s+extenso\b|\bextenso\b/.test(n)) return null;
  const m = /\d[\d.]*(?:,\d+)?/.exec(n);
  if (!m) return null;
  const v = cmxDinheiro(m[0]);
  if (!isFinite(v)) return null;
  if (v <= 0) return [cmxErro('Digite um valor maior que zero.')];
  const t = valorPorExtenso(v);
  if (t === null) return [cmxErro('Valor grande demais: o máximo é R$ 999 bilhões.')];
  if (!t) return [cmxErro('Valor menor que um centavo.')];
  const arred = Math.round(v * 100) / 100;
  const nota = Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? ' (valor arredondado para centavos)' : '';
  const fixo = arred.toFixed(2).split('.');
  const dinheiro = 'R$ ' + fixo[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fixo[1];
  return [cmxItem('valor por extenso', '', arred, dinheiro + ' (' + t + ')' + nota)];
}

// ------------------------------------------------------------------ regra de três, rateio, per capita

function cmxRegraDeTres(n) {
  const m = new RegExp('(' + CMX_NUM + ')\\s+esta\\s+para\\s+(' + CMX_NUM + ')\\s+(?:assim\\s+)?como\\s+(' + CMX_NUM + ')\\s+esta\\s+para\\s+(?:x|\\?|quanto)').exec(n)
    || new RegExp('(' + CMX_NUM + ')\\s+(?:esta|estao)\\s+para\\s+(' + CMX_NUM + ')\\s*,?\\s*(?:entao\\s+)?(' + CMX_NUM + ')\\s+(?:esta|estao)\\s+para\\s+(?:x|\\?|quanto)').exec(n);
  if (!m) return null;
  const a = cmxNum(m[1]), b = cmxNum(m[2]), c = cmxNum(m[3]);
  const inversa = /\binversa\w*/.test(n);
  if (a === 0 || (inversa && c === 0)) return [cmxErro('Divisão por zero na regra de três.')];
  const r = inversa ? a * b / c : b * c / a;
  return [cmxItem(inversa ? 'regra de três inversa' : 'regra de três direta', inversa ? cmxF(a) + ' × ' + cmxF(b) + ' ÷ ' + cmxF(c) : cmxF(b) + ' × ' + cmxF(c) + ' ÷ ' + cmxF(a), r, cmxF(r))];
}

function cmxRateio(n) {
  if (!/\b(?:dividir|divida|dividindo|ratear|rateio|repartir|reparta|partilhar)\b/.test(n)) return null;
  let m = new RegExp('(?:dividir|divida|ratear|repartir|reparta|partilhar)\\s+(?:o\\s+valor\\s+de\\s+)?(' + CMX_NUM + ')\\s+(?:reais\\s+)?(?:igualmente\\s+|em\\s+partes\\s+iguais\\s+)?(?:entre|por|para)\\s+(\\d+)\\b(?!\\s*[,;]|\\s+e\\s+\\d)').exec(n);
  if (m && !/proporcional/.test(n)) {
    const v = cmxNum(m[1]), k = cmxNum(m[2]);
    if (k <= 0) return [cmxErro('A divisão pede pelo menos 1 parte.')];
    const r = v / k;
    return [cmxItem('divisão igual', cmxF(v) + ' ÷ ' + cmxF(k), r, cmxF(r) + ' para cada um(a)')];
  }
  m = new RegExp('(?:dividir|divida|ratear|rateio|repartir|reparta|partilhar)\\s+(?:o\\s+valor\\s+de\\s+)?(' + CMX_NUM + ')\\s+(?:reais\\s+)?proporcionalmente\\s+(?:a|aos|as|com|entre)\\s+(.+)').exec(n);
  if (m) {
    const v = cmxNum(m[1]);
    const pesos = (m[2].match(/\d[\d.]*(?:,\d+)?/g) || []).map(cmxNum);
    const soma = pesos.reduce(function (x, y) { return x + y; }, 0);
    if (pesos.length < 2 || soma <= 0) return [cmxErro('O rateio proporcional pede pelo menos 2 pesos.')];
    return pesos.slice(0, 8).map(function (pe, i) {
      const r = v * pe / soma;
      return cmxItem('parte ' + (i + 1), cmxF(v) + ' × ' + cmxF(pe) + ' ÷ ' + cmxF(soma), r, cmxF(r));
    });
  }
  return null;
}

function cmxPerCapita(n) {
  if (!/per\s*capita|renda\b/.test(n) || !/\b(?:pessoas?|membros?|integrantes?|moradores?)\b/.test(n)) return null;
  let t = n.replace(/\br\$\s*/g, ' ');
  const mp = new RegExp('(\\d+)\\s*(?:pessoas?|membros?|integrantes?|moradores?)').exec(t);
  if (!mp) return null;
  const pessoas = Number(mp[1]);
  t = t.replace(mp[0], ' ');
  let limite = null, rotuloLimite = 'limite informado';
  let ml = new RegExp('(meio|1\\s*/\\s*2|um\\s+quarto|1\\s*/\\s*4|metade\\s+d[eo])\\s+salario\\s+minimo\\s+(?:de\\s+|que\\s+e\\s+|=\\s*)?(' + CMX_NUM + ')').exec(t);
  if (ml) {
    const frac = /quarto|1\s*\/\s*4/.test(ml[1]) ? 0.25 : 0.5;
    limite = cmxNum(ml[2]) * frac;
    rotuloLimite = (frac === 0.5 ? 'meio' : '1/4 do') + ' salário mínimo informado';
    t = t.replace(ml[0], ' ');
  } else {
    ml = new RegExp('(?:limite|teto|corte|criterio|linha(?:\\s+de\\s+pobreza)?|referencia|parametro)\\s+(?:de\\s+|e\\s+|=\\s*)?(' + CMX_NUM + ')').exec(t);
    if (ml) { limite = cmxNum(ml[1]); t = t.replace(ml[0], ' '); }
  }
  // Comparação sem limite identificado: não dá para saber qual número é a renda e qual é o limite. Segue para a IA.
  if (limite === null && /\b(?:dentro|acima|abaixo|passa|passam|ultrapassa|menor|maior|inferior|superior|excede|limite|linha|teto)\b/.test(t)) return null;
  const rendas = cmxNumeros(t.replace(/\bem\s+(?:19|20)\d{2}\b/g, ' '));
  if (!rendas.length || pessoas < 1) return null;
  const itens = [];
  let total = rendas.reduce(function (x, y) { return x + y; }, 0);
  if (rendas.length > 1) itens.push(cmxItem('renda total', rendas.map(function (x) { return cmxF(x); }).join(' + '), total, cmxM(total), { moeda: true }));
  const pc = total / pessoas;
  itens.push(cmxItem('renda per capita', cmxF(total) + ' ÷ ' + pessoas, pc, cmxM(pc), { moeda: true }));
  if (limite !== null) {
    const ok = pc <= limite + 1e-9;
    itens.push(cmxItem('compara com o ' + rotuloLimite + ' (' + cmxM(limite) + ')', cmxM(pc) + ' ≤ ' + cmxM(limite), ok ? 1 : 0,
      (ok ? 'SIM, igual ou abaixo do limite informado' : 'NÃO, acima do limite informado'), { bool: true }));
  }
  return itens;
}

// ------------------------------------------------------------------ frequência

function cmxFrequencia(n) {
  if (!/\b(?:frequencia|faltas?|faltou|faltaram|presencas?|ausencias?|assiduidade)\b/.test(n)) return null;
  let total = null, faltas = null, pres = null, minimo = null;
  let m = new RegExp('(' + CMX_NUM + ')\\s*(?:dias\\s+letivos|dias\\s+de\\s+aula|aulas|dias|encontros|atendimentos|sessoes|reunioes|atividades)').exec(n);
  if (m) total = cmxNum(m[1]);
  m = new RegExp('(' + CMX_NUM + ')\\s*(?:faltas?|ausencias?)').exec(n) || new RegExp('falt(?:ou|aram|ei)\\s+(?:a\\s+)?(' + CMX_NUM + ')').exec(n);
  if (m) faltas = cmxNum(m[1]);
  m = new RegExp('(' + CMX_NUM + ')\\s*presencas?').exec(n) || new RegExp('(?:presente|estive|foi|compareceu)\\s+(?:em|a|na|nas)?\\s*(' + CMX_NUM + ')\\s+(?:de|em)').exec(n);
  if (m) pres = cmxNum(m[1]);
  m = new RegExp('(?:minimo|exigido|exigencia|exige|piso)\\s+(?:de\\s+)?(' + CMX_NUM + ')\\s*%').exec(n);
  if (m) minimo = cmxNum(m[1]);
  m = new RegExp('falt\\w+\\s+(' + CMX_NUM + ')\\s+de\\s+(' + CMX_NUM + ')').exec(n);
  if (m) { faltas = cmxNum(m[1]); total = cmxNum(m[2]); }
  m = new RegExp('(' + CMX_NUM + ')\\s*presencas?\\s+(?:em|de)\\s+(' + CMX_NUM + ')').exec(n);
  if (m) { pres = cmxNum(m[1]); total = cmxNum(m[2]); }
  if (!total || total <= 0) return null;
  if (pres === null && faltas === null) return null;
  if (pres === null) pres = total - faltas;
  if (faltas === null) faltas = total - pres;
  if (pres < 0 || faltas < 0 || pres > total) return [cmxErro('Os números de presenças e faltas não fecham com o total de ' + cmxF(total) + '. Confira.')];
  const freq = pres / total * 100;
  const itens = [cmxItem('frequência', cmxF(pres) + ' ÷ ' + cmxF(total) + ' × 100', freq, cmxF(freq) + '% (' + cmxF(pres) + ' presenças e ' + cmxF(faltas) + ' faltas em ' + cmxF(total) + ')')];
  if (minimo !== null) {
    const exigidas = Math.ceil(calcSemRuido(total * minimo / 100));
    const maxFaltas = total - exigidas;
    const ok = pres >= exigidas;
    itens.push(cmxItem('mínimo de ' + cmxF(minimo) + '%', cmxF(total) + ' × ' + cmxF(minimo) + '%', exigidas,
      'mínimo de ' + cmxF(exigidas) + ' presenças (no máximo ' + cmxF(maxFaltas) + ' faltas); ' + (ok ? 'ATINGE o mínimo informado' + (maxFaltas - faltas > 0 ? ', ainda pode faltar ' + cmxF(maxFaltas - faltas) : '') : 'NÃO atinge o mínimo informado (faltam ' + cmxF(exigidas - pres) + ' presenças)')));
  }
  return itens;
}

function calcSemRuido(x) { return Number(x.toPrecision(12)); }

// ------------------------------------------------------------------ IMC, taxa

function cmxImc(n) {
  if (!/\bimc\b|indice\s+de\s+massa/.test(n)) return null;
  const mk = new RegExp('(' + CMX_NUM + ')\\s*(?:kg|quilos?|kilos?)\\b').exec(n);
  const ma = new RegExp('(' + CMX_NUM + ')\\s*(cm|m|metros?|centimetros?)\\b').exec(n);
  if (!mk || !ma) return null;
  const peso = cmxNum(mk[1]);
  let alt = cmxNum(ma[1]);
  if (/^c/.test(ma[2])) alt = alt / 100;
  if (alt > 3 || alt < 0.4) return [cmxErro('Altura fora do normal: confira se é em metros (1,75) ou centímetros (175).')];
  const imc = peso / (alt * alt);
  const f = imc < 18.5 ? 'abaixo do peso' : imc < 25 ? 'peso adequado' : imc < 30 ? 'sobrepeso' : imc < 35 ? 'obesidade grau I' : imc < 40 ? 'obesidade grau II' : 'obesidade grau III';
  return [cmxItem('IMC', cmxF(peso) + ' ÷ ' + cmxF(alt) + '²', imc, cmxA(imc, 2) + ' kg/m² (' + f + ', faixas da OMS para adultos)')];
}

function cmxBase(txt) {
  const t = txt.trim();
  if (/^mil$/.test(t)) return 1000;
  if (/^cem\s+mil$/.test(t)) return 100000;
  const m = /^(\d[\d.]*(?:,\d+)?)\s*mil$/.exec(t);
  if (m) return cmxNum(m[1]) * 1000;
  return cmxNum(t);
}

function cmxTaxa(n) {
  if (!/\b(?:taxa|incidencia|prevalencia|coeficiente|mortalidade|natalidade)\b/.test(n)) return null;
  const mb = /por\s+(mil|cem\s+mil|\d[\d.]*(?:,\d+)?\s*mil|\d[\d.]*)(?:\s+(?:habitantes|pessoas|nascidos|nascimentos|criancas|mulheres|homens|idosos|familias))?\b/.exec(n);
  if (!mb) return null;
  const base = cmxBase(mb[1]);
  const m = new RegExp('(' + CMX_NUM + ')\\s+(?:casos?|obitos?|mortes?|nascimentos?|ocorrencias?|atendimentos?|pessoas?|registros?|notificacoes|eventos?)?\\s*(?:em|para|entre|numa?\\s+populacao\\s+de|de)\\s+(' + CMX_NUM + ')').exec(n);
  if (!m || !isFinite(base)) return null;
  const a = cmxNum(m[1]), pop = cmxNum(m[2]);
  if (pop <= 0) return [cmxErro('A população precisa ser maior que 0.')];
  const r = a / pop * base;
  return [cmxItem('taxa por ' + cmxF(base), cmxF(a) + ' ÷ ' + cmxF(pop) + ' × ' + cmxF(base), r, cmxF(r) + ' por ' + cmxF(base) + ' habitantes (ou pessoas expostas)')];
}

// ------------------------------------------------------------------ conversão de unidades

// [símbolo, fator para a unidade base, apelidos sem acento]
const CMX_UNIDADES = [
  { cat: 'comprimento', un: [['mm', 0.001, ['milimetro', 'milimetros', 'mm']], ['cm', 0.01, ['centimetro', 'centimetros', 'cm']], ['m', 1, ['metro', 'metros', 'm']], ['km', 1000, ['quilometro', 'quilometros', 'km']], ['polegada', 0.0254, ['polegada', 'polegadas', 'pol']], ['pé', 0.3048, ['pe', 'pes', 'ft']], ['jarda', 0.9144, ['jarda', 'jardas', 'yd']], ['milha', 1609.344, ['milha', 'milhas']]] },
  { cat: 'massa', un: [['mg', 0.001, ['miligrama', 'miligramas', 'mg']], ['g', 1, ['grama', 'gramas', 'g']], ['kg', 1000, ['quilo', 'quilos', 'quilograma', 'quilogramas', 'kg']], ['tonelada', 1000000, ['tonelada', 'toneladas']], ['libra', 453.59237, ['libra', 'libras', 'lb']], ['onça', 28.349523125, ['onca', 'oncas', 'oz']], ['arroba', 15000, ['arroba', 'arrobas']]] },
  { cat: 'volume', un: [['ml', 0.001, ['mililitro', 'mililitros', 'ml']], ['l', 1, ['litro', 'litros', 'l']], ['m³', 1000, ['m3', 'm³', 'metro cubico', 'metros cubicos']], ['galão', 3.785411784, ['galao', 'galoes']]] },
  { cat: 'tempo', un: [['segundo', 1, ['segundo', 'segundos']], ['minuto', 60, ['minuto', 'minutos', 'min']], ['hora', 3600, ['hora', 'horas']], ['dia', 86400, ['dia', 'dias']], ['semana', 604800, ['semana', 'semanas']]] },
  { cat: 'área', un: [['cm²', 0.0001, ['cm2', 'cm²', 'centimetro quadrado', 'centimetros quadrados']], ['m²', 1, ['m2', 'm²', 'metro quadrado', 'metros quadrados']], ['ha', 10000, ['hectare', 'hectares', 'ha']], ['km²', 1000000, ['km2', 'km²', 'quilometro quadrado', 'quilometros quadrados']]] },
  { cat: 'velocidade', un: [['m/s', 1, ['m/s']], ['km/h', 1 / 3.6, ['km/h', 'kmh', 'quilometros por hora']], ['mph', 0.44704, ['mph', 'milhas por hora']]] }
];
const CMX_APELIDOS = [];
CMX_UNIDADES.forEach(function (c) { c.un.forEach(function (u) { u[2].forEach(function (ap) { CMX_APELIDOS.push({ ap: ap, cat: c, un: u }); }); }); });
CMX_APELIDOS.sort(function (a, b) { return b.ap.length - a.ap.length; });
const CMX_RE_UN = '(' + CMX_APELIDOS.map(function (x) { return x.ap.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('|') + ')(?![a-z0-9²³])';

function cmxAchaUnidade(nome) {
  for (let i = 0; i < CMX_APELIDOS.length; i++) if (CMX_APELIDOS[i].ap === nome) return CMX_APELIDOS[i];
  return null;
}

const CMX_TEMP = { celsius: 'C', fahrenheit: 'F', kelvin: 'K' };

function cmxTemperatura(n) {
  const re = '(?:graus?\\s*)?(celsius|fahrenheit|kelvin|[°º]\\s*[cf])';
  const m = new RegExp('(-?' + CMX_NUM + ')\\s*' + re + '\\s*(?:em|para|pra|->|→)\\s*' + re).exec(n);
  if (!m) return null;
  const tipo = function (s) { return CMX_TEMP[s] || s.replace(/[°º\s]/g, '').toUpperCase(); };
  const de = tipo(m[2]), para = tipo(m[3]);
  const v = cmxNum(m[1]);
  const c = de === 'C' ? v : de === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
  const r = para === 'C' ? c : para === 'F' ? c * 9 / 5 + 32 : c + 273.15;
  if (de === para) return [cmxItem('conversão de temperatura', cmxF(v) + ' °' + de, v, cmxF(v) + ' °' + para)];
  return [cmxItem('conversão de temperatura', cmxF(v) + ' °' + de + ' → °' + para, r, cmxF(r, 2) + ' ' + (para === 'K' ? 'K' : '°' + para))];
}

function cmxConversao(n) {
  const t = cmxTemperatura(n);
  if (t) return t;
  let m = new RegExp('(' + CMX_NUM + ')\\s*' + CMX_RE_UN + '\\s*(?:em|para|pra|->|→|=)\\s*' + CMX_RE_UN).exec(n);
  let valor, a, b;
  if (m) { valor = cmxNum(m[1]); a = cmxAchaUnidade(m[2]); b = cmxAchaUnidade(m[3]); }
  else {
    m = new RegExp('quant[oa]s?\\s+' + CMX_RE_UN + '\\s+(?:tem|ha|cabem|cabe|sao|equivale[mn]?|vale[m]?|existem)\\s+(?:em\\s+|numa?\\s+|nos?\\s+|nas?\\s+|uma?\\s+)?(?:(' + CMX_NUM + ')\\s*)?' + CMX_RE_UN).exec(n);
    if (!m) return null;
    b = cmxAchaUnidade(m[1]); a = cmxAchaUnidade(m[3]); valor = m[2] ? cmxNum(m[2]) : 1;
  }
  if (!a || !b || !isFinite(valor)) return null;
  if (a.cat !== b.cat) return [cmxErro('Não dá para converter ' + a.un[0] + ' em ' + b.un[0] + ': são grandezas diferentes (' + a.cat.cat + ' e ' + b.cat.cat + ').')];
  const r = valor * a.un[1] / b.un[1];
  const aviso = a.un[0] === 'galão' || b.un[0] === 'galão' ? ' (galão americano)' : '';
  return [cmxItem('conversão de ' + a.cat.cat, cmxF(valor) + ' ' + cmxPlural(a.un[0], valor) + ' → ' + cmxPlural(b.un[0], r), r, cmxF(r, 6) + ' ' + cmxPlural(b.un[0], r) + aviso)];
}

// ------------------------------------------------------------------ geometria

function cmxGeometria(n) {
  if (!/\b(?:area|perimetro|volume|circunferencia|capacidade)\b/.test(n)) return null;
  const apos = function (re) { const m = re.exec(n); return m ? cmxNumeros(n.slice(m.index + m[0].length)) : null; };
  let x;
  const medida = function (re, nome) { const m = new RegExp(nome + '\\s+(?:de\\s+|=\\s*)?(' + CMX_NUM + ')').exec(n); return m ? cmxNum(m[1]) : null; };
  if (/\bcirculo\b|\bcircunferencia\b/.test(n)) {
    let r = medida(n, 'raio');
    const d = medida(n, 'diametro');
    if (r === null && d !== null) r = d / 2;
    if (r === null) return null;
    if (/circunferencia|perimetro|comprimento/.test(n)) return [cmxItem('comprimento da circunferência', '2 × π × ' + cmxF(r), 2 * CMX_PI * r, cmxF(2 * CMX_PI * r))];
    return [cmxItem('área do círculo', 'π × ' + cmxF(r) + '²', CMX_PI * r * r, cmxF(CMX_PI * r * r))];
  }
  if (/\besfera\b/.test(n)) {
    const r = medida(n, 'raio');
    if (r === null) return null;
    return [cmxItem('volume da esfera', '4 ÷ 3 × π × ' + cmxF(r) + '³', 4 / 3 * CMX_PI * r * r * r, cmxF(4 / 3 * CMX_PI * r * r * r))];
  }
  if (/\bcilindro\b/.test(n)) {
    const r = medida(n, 'raio'), h = medida(n, 'altura');
    if (r === null || h === null) return null;
    return [cmxItem('volume do cilindro', 'π × ' + cmxF(r) + '² × ' + cmxF(h), CMX_PI * r * r * h, cmxF(CMX_PI * r * r * h))];
  }
  if (/\bcone\b/.test(n)) {
    const r = medida(n, 'raio'), h = medida(n, 'altura');
    if (r === null || h === null) return null;
    return [cmxItem('volume do cone', 'π × ' + cmxF(r) + '² × ' + cmxF(h) + ' ÷ 3', CMX_PI * r * r * h / 3, cmxF(CMX_PI * r * r * h / 3))];
  }
  if (/\bcubo\b/.test(n) && /volume/.test(n)) {
    const a = medida(n, 'aresta') !== null ? medida(n, 'aresta') : medida(n, 'lado');
    if (a === null) return null;
    return [cmxItem('volume do cubo', cmxF(a) + '³', a * a * a, cmxF(a * a * a))];
  }
  if (/volume/.test(n) && /\b(?:piscina|caixa|paralelepipedo|reservatorio|tanque|sala|quarto|prisma)\b/.test(n)) {
    const c = medida(n, 'comprimento'), l = medida(n, 'largura'), p = medida(n, 'profundidade') !== null ? medida(n, 'profundidade') : (medida(n, 'altura') !== null ? medida(n, 'altura') : medida(n, 'fundo'));
    if (c === null || l === null || p === null) return null;
    return [cmxItem('volume', cmxF(c) + ' × ' + cmxF(l) + ' × ' + cmxF(p), c * l * p, cmxF(c * l * p))];
  }
  if (/\bretangulo\b|\bsala\b|\bterreno\b|\bquarto\b/.test(n)) {
    x = apos(/\b(?:retangulo|sala|terreno|quarto)\b/);
    if (!x || x.length < 2) return null;
    if (/perimetro/.test(n)) return [cmxItem('perímetro do retângulo', '2 × (' + cmxF(x[0]) + ' + ' + cmxF(x[1]) + ')', 2 * (x[0] + x[1]), cmxF(2 * (x[0] + x[1])))];
    return [cmxItem('área do retângulo', cmxF(x[0]) + ' × ' + cmxF(x[1]), x[0] * x[1], cmxF(x[0] * x[1]))];
  }
  if (/\bquadrado\b/.test(n)) {
    let l = medida(n, 'lado');
    if (l === null) { x = apos(/\bquadrado\b/); l = x && x.length ? x[0] : null; }
    if (l === null) return null;
    if (/perimetro/.test(n)) return [cmxItem('perímetro do quadrado', '4 × ' + cmxF(l), 4 * l, cmxF(4 * l))];
    return [cmxItem('área do quadrado', cmxF(l) + '²', l * l, cmxF(l * l))];
  }
  if (/\btriangulo\b/.test(n)) {
    const b = medida(n, 'base'), h = medida(n, 'altura');
    if (b !== null && h !== null) return [cmxItem('área do triângulo', cmxF(b) + ' × ' + cmxF(h) + ' ÷ 2', b * h / 2, cmxF(b * h / 2))];
    x = apos(/\btriangulo\b/);
    if (x && x.length >= 3) {
      const s = (x[0] + x[1] + x[2]) / 2, q = s * (s - x[0]) * (s - x[1]) * (s - x[2]);
      if (q <= 0) return [cmxErro('Esses três lados não formam um triângulo.')];
      if (/perimetro/.test(n)) return [cmxItem('perímetro do triângulo', cmxF(x[0]) + ' + ' + cmxF(x[1]) + ' + ' + cmxF(x[2]), 2 * s, cmxF(2 * s))];
      return [cmxItem('área do triângulo (fórmula de Herão, p = ' + cmxF(s) + ')', '', Math.sqrt(q), cmxF(Math.sqrt(q)))];
    }
  }
  if (/\btrapezio\b/.test(n)) {
    const bm = medida(n, 'base\\s+maior'), bn = medida(n, 'base\\s+menor'), h = medida(n, 'altura');
    if (bm === null || bn === null || h === null) return null;
    return [cmxItem('área do trapézio', '(' + cmxF(bm) + ' + ' + cmxF(bn) + ') × ' + cmxF(h) + ' ÷ 2', (bm + bn) * h / 2, cmxF((bm + bn) * h / 2))];
  }
  return null;
}

// ------------------------------------------------------------------ juros, financiamento, férias, 13º

function cmxPrazoEmPeriodos(prazo, unidadePrazo, unidadeTaxa) {
  const meses = { mes: 1, meses: 1, ano: 12, anos: 12 };
  const p = meses[unidadePrazo], t = meses[unidadeTaxa];
  if (!p || !t) return null;
  return prazo * p / t;
}

function cmxFinanceiro(n) {
  let m;
  if (/juros\s+(?:compostos|simples)|rendimento\s+de|montante/.test(n)) {
    const simples = /juros\s+simples/.test(n);
    m = new RegExp('(?:capital|principal|valor|de|aplicar|aplicando|investir)\\s*(?:inicial\\s*)?(?:de\\s*)?(?:r\\$\\s*)?(' + CMX_NUM + ')').exec(n.replace(/juros\s+(?:compostos|simples)\s+/, ''));
    const mt = new RegExp('(' + CMX_NUM + ')\\s*%\\s*(?:ao|por|a\\.?)\\s*(mes|ano)').exec(n);
    const mp = new RegExp('(?:por|durante|em|prazo\\s+de)\\s+(' + CMX_NUM + ')\\s*(meses|mes|anos|ano)\\b').exec(n);
    if (!m || !mt || !mp) return null;
    const cap = cmxNum(m[1]), i = cmxNum(mt[1]) / 100;
    const k = cmxPrazoEmPeriodos(cmxNum(mp[1]), mp[2], mt[2]);
    if (k === null) return null;
    const kt = cmxF(k);
    const un = mt[2] === 'mes' ? 'mês' : 'ano';
    if (simples) {
      const j = cap * i * k;
      return [cmxItem('juros simples', cmxF(cap) + ' × ' + cmxF(i * 100) + '% × ' + kt, j, cmxM(j), { moeda: true }),
        cmxItem('montante', cmxF(cap) + ' + ' + cmxM(j), cap + j, cmxM(cap + j), { moeda: true })];
    }
    const mont = cap * Math.pow(1 + i, k);
    return [cmxItem('montante (juros compostos)', cmxF(cap) + ' × (1 + ' + cmxF(i * 100) + '%)^' + kt, mont, cmxM(mont), { moeda: true }),
      cmxItem('juros', cmxM(mont) + ' − ' + cmxF(cap), mont - cap, cmxM(mont - cap) + ' (taxa por ' + un + ')', { moeda: true })];
  }
  if (/financ|parcelas?\b|prestac\w+|emprestimo/.test(n) && /%/.test(n)) {
    const mv = new RegExp('(?:financiar|financiado|emprestimo\\s+de|emprestar|pegar|valor\\s+de|de)\\s*(?:r\\$\\s*)?(' + CMX_NUM + ')\\s+(?:reais\\s+)?(?:em|com)\\s+(\\d+)\\s*(?:parcelas?|prestacoes?|vezes|meses)').exec(n);
    const mt = new RegExp('(' + CMX_NUM + ')\\s*%\\s*(?:ao|por)\\s*(mes|ano)').exec(n);
    if (!mv || !mt) return null;
    const pv = cmxNum(mv[1]), k = Number(mv[2]);
    let i = cmxNum(mt[1]) / 100;
    if (mt[2] === 'ano') i = Math.pow(1 + i, 1 / 12) - 1;
    if (k < 1 || k > 600) return [cmxErro('O prazo precisa estar entre 1 e 600 parcelas.')];
    const parcela = i === 0 ? pv / k : pv * i / (1 - Math.pow(1 + i, -k));
    return [cmxItem('parcela (tabela Price, juros compostos)', cmxF(pv) + ' × ' + cmxF(i * 100) + '% ÷ (1 − (1 + ' + cmxF(i * 100) + '%)^−' + k + ')', parcela, cmxM(parcela), { moeda: true }),
      cmxItem('total pago', cmxM(parcela) + ' × ' + k, parcela * k, cmxM(parcela * k) + ' (juros de ' + cmxM(parcela * k - pv) + ')', { moeda: true })];
  }
  const semTerco = n.replace(/1\s*\/\s*3/g, ' ');
  m = new RegExp('ferias[^0-9]{0,60}(' + CMX_NUM + ')').exec(semTerco);
  if (m && /(?:1\s*\/\s*3|terco)/.test(n)) {
    const sal = cmxNum(m[1]);
    return [cmxItem('férias com 1/3 constitucional (bruto)', cmxF(sal) + ' + ' + cmxF(sal) + ' ÷ 3', sal * 4 / 3, cmxM(sal * 4 / 3) + ' (30 dias de férias; sem descontos de INSS e IR; abono pecuniário não incluso)', { moeda: true })];
  }
  m = new RegExp('(?:13o|13º|decimo\\s+terceiro)[^0-9]{0,40}(\\d{1,2})\\s*(?:/\\s*12\\s*)?meses?[^0-9]{0,40}(?:salario\\s+(?:de\\s+)?)?(?:r\\$\\s*)?(' + CMX_NUM + ')').exec(n);
  if (m) {
    const meses = Number(m[1]), sal = cmxNum(m[2]);
    if (meses < 1 || meses > 12) return [cmxErro('O 13º proporcional vai de 1 a 12 meses.')];
    return [cmxItem('13º proporcional (bruto)', cmxF(sal) + ' × ' + meses + ' ÷ 12', sal * meses / 12, cmxM(sal * meses / 12) + ' (sem descontos; mês conta com 15 dias ou mais trabalhados)', { moeda: true })];
  }
  return null;
}

// ------------------------------------------------------------------ horas e viagem

function cmxHora(h, mi) { return Number(h) * 60 + Number(mi || 0); }

function cmxHoraTexto(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h + 'h' + (m ? (m < 10 ? '0' : '') + m + 'min' : '');
}

function cmxHoras(n) {
  if (!/quanto|duracao|horas?\s+(?:trabalhad|total|de\s+trabalho)|jornada|tempo|calcul|total|carga|trabalh|intervalo|almoco/.test(n)) return null;
  const m = /das?\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:min)?\s*(?:as|ate|a)\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(n);
  if (!m) return null;
  const ini = cmxHora(m[1], m[2]), fim = cmxHora(m[3], m[4]);
  if (Number(m[1]) > 24 || Number(m[3]) > 24) return null;
  let tot = fim - ini;
  if (tot < 0) tot += 1440;
  const mi = /(?:intervalo|almoco|descanso|pausa)\s+(?:de\s+)?(\d+(?:,\d+)?)\s*(h|min|hora|horas|minutos)?/.exec(n);
  let desc = 0;
  if (mi) {
    const v = cmxNum(mi[1]);
    desc = /^h/.test(mi[2] || '') ? v * 60 : (mi[2] ? v : (v <= 4 ? v * 60 : v));
  }
  const liq = tot - desc;
  const linha = cmxHoraTexto(fim) + ' − ' + cmxHoraTexto(ini) + (desc ? ' − intervalo de ' + cmxHoraTexto(desc) : '');
  return [cmxItem('duração', linha, liq / 60, cmxHoraTexto(liq) + ' (' + cmxF(liq / 60, 2) + ' h)')];
}

function cmxViagem(n) {
  const md = new RegExp('(' + CMX_NUM + ')\\s*km\\b(?!\\s*/)').exec(n);
  if (!md) return null;
  const dist = cmxNum(md[1]);
  const mv = new RegExp('(' + CMX_NUM + ')\\s*km\\s*/\\s*h').exec(n);
  if (mv && /tempo|demora|leva|quanto\s+tempo|chego|chegar/.test(n)) {
    const v = cmxNum(mv[1]);
    if (v <= 0) return [cmxErro('A velocidade precisa ser maior que 0.')];
    const min = Math.round(dist / v * 60);
    return [cmxItem('tempo de viagem', cmxF(dist) + ' ÷ ' + cmxF(v), dist / v, cmxHoraTexto(min) + ' (' + cmxF(dist / v, 2) + ' h)')];
  }
  const mc = new RegExp('(' + CMX_NUM + ')\\s*km\\s*/\\s*l\\b').exec(n);
  if (mc && /consum|gasta|litros?|combustivel|gasolina|etanol|diesel/.test(n)) {
    const c = cmxNum(mc[1]);
    if (c <= 0) return [cmxErro('O consumo precisa ser maior que 0.')];
    const litros = dist / c;
    const itens = [cmxItem('combustível', cmxF(dist) + ' ÷ ' + cmxF(c), litros, cmxF(litros, 2) + ' litros')];
    const mp = new RegExp('(?:r\\$\\s*)?(' + CMX_NUM + ')\\s*(?:reais\\s*)?(?:o|por|/)\\s*litro').exec(n);
    if (mp) { const p = cmxNum(mp[1]); itens.push(cmxItem('custo', cmxF(litros, 2) + ' × ' + cmxM(p), litros * p, cmxM(litros * p), { moeda: true })); }
    return itens;
  }
  return null;
}

// ------------------------------------------------------------------ bases, romanos, primos

const CMX_ROMANOS = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];

function cmxParaRomano(v) {
  let r = '';
  CMX_ROMANOS.forEach(function (p) { while (v >= p[1]) { r += p[0]; v -= p[1]; } });
  return r;
}

function cmxDeRomano(s) {
  let i = 0, v = 0;
  CMX_ROMANOS.forEach(function (p) { while (s.substr(i, p[0].length) === p[0]) { v += p[1]; i += p[0].length; } });
  return i === s.length && cmxParaRomano(v) === s ? v : null;
}

const CMX_BASES = { binario: 2, octal: 8, hexadecimal: 16, hexa: 16 };

function cmxNumerico(n) {
  let m = /\b([mdclxvi]{2,})\s+(?:em|para|pra)\s+(?:numero|decimal|arabico|algarismos?)/.exec(n);
  if (m) {
    const v = cmxDeRomano(m[1].toUpperCase());
    if (v === null) return [cmxErro('"' + m[1].toUpperCase() + '" não é um número romano válido.')];
    return [cmxItem('romano para decimal', '', v, m[1].toUpperCase() + ' = ' + v)];
  }
  m = /\b(\d+)\s+(?:em|para|pra)\s+(?:numero\s+)?romano/.exec(n);
  if (m) {
    const v = Number(m[1]);
    if (v < 1 || v > 3999) return [cmxErro('Números romanos vão de 1 a 3.999.')];
    return [cmxItem('decimal para romano', '', v, v + ' = ' + cmxParaRomano(v))];
  }
  m = /\b([0-9a-f]+)\s+(?:em\s+|de\s+)?(binario|octal|hexadecimal|hexa)\s+(?:em|para|pra)\s+decimal/.exec(n) || /\b(binario|octal|hexadecimal|hexa)\s+([0-9a-f]+)\s+(?:em|para|pra)\s+decimal/.exec(n);
  if (m) {
    const base = CMX_BASES[m[1] in CMX_BASES ? m[1] : m[2]], txt = m[1] in CMX_BASES ? m[2] : m[1];
    const validos = '0123456789abcdef'.slice(0, base);
    if (txt.split('').some(function (c) { return validos.indexOf(c) === -1; }) || txt.length > 12) return [cmxErro('"' + txt + '" não é um número válido na base ' + base + '.')];
    const v = parseInt(txt, base);
    return [cmxItem('base ' + base + ' para decimal', '', v, txt + ' (base ' + base + ') = ' + v)];
  }
  m = /\b(\d+)\s+(?:em|para|pra)\s+(binario|octal|hexadecimal|hexa)\b/.exec(n);
  if (m) {
    const v = Number(m[1]), base = CMX_BASES[m[2]];
    if (v > 1e12) return [cmxErro('Número grande demais para converter.')];
    return [cmxItem('decimal para base ' + base, '', v, v + ' = ' + v.toString(base).toUpperCase() + ' (base ' + base + ')')];
  }
  m = /\b(?:fatore|fatorar|fatoracao\s+d[eo]|decomponha|decompor)\s+(?:o\s+)?(?:numero\s+)?(\d+)/.exec(n);
  if (m) {
    let v = Number(m[1]);
    if (v < 2 || v > 1e12) return [cmxErro('Fatoração: use um número inteiro entre 2 e 1.000.000.000.000.')];
    const orig = v, f = [];
    for (let p = 2; p * p <= v; p++) { let e = 0; while (v % p === 0) { v /= p; e++; } if (e) f.push(e > 1 ? p + '^' + e : String(p)); }
    if (v > 1) f.push(String(v));
    return [cmxItem('fatoração em primos', '', orig, orig + ' = ' + f.join(' × '))];
  }
  m = /\b(?:divisores\s+d[eo]|quais\s+os\s+divisores\s+d[eo])\s+(\d+)/.exec(n);
  if (m) {
    const v = Number(m[1]);
    if (v < 1 || v > 1e9) return [cmxErro('Divisores: use um número entre 1 e 1.000.000.000.')];
    const d = [];
    for (let k = 1; k * k <= v; k++) if (v % k === 0) { d.push(k); if (k * k !== v) d.push(v / k); }
    d.sort(function (a, b) { return a - b; });
    return [cmxItem('divisores de ' + v, '', d.length, d.join(', ') + ' (' + d.length + ' divisores)')];
  }
  m = /\b(\d+)\s+e\s+(?:um\s+)?(?:numero\s+)?primo/.exec(n) || /\b(?:o\s+)?(?:numero\s+)?(\d+)\s+e\s+primo/.exec(n);
  if (m) {
    const v = Number(m[1]);
    if (v > 1e12) return [cmxErro('Número grande demais para testar.')];
    let primo = v >= 2, d = null;
    for (let p = 2; p * p <= v; p++) if (v % p === 0) { primo = false; d = p; break; }
    return [cmxItem('número primo', '', primo ? 1 : 0, v + (primo ? ' é primo' : ' não é primo (divisível por ' + d + ')'), { bool: false })];
  }
  return null;
}

// ------------------------------------------------------------------ equações

function cmxPoli(str) {
  let s = str.replace(/\s+/g, '').replace(/²/g, '^2').replace(/,/g, '.').replace(/\*/g, '');
  const c = { 0: 0, 1: 0, 2: 0 };
  if (!s) return null;
  if (!/^[+-]/.test(s)) s = '+' + s;
  const re = /^([+-])(\d+(?:\.\d+)?)?(x(?:\^(\d))?)?/;
  while (s.length) {
    const m = re.exec(s);
    if (!m || (m[2] === undefined && m[3] === undefined)) return null;
    const k = m[3] ? (m[4] === undefined ? 1 : Number(m[4])) : 0;
    if (k > 2) return null;
    c[k] += (m[1] === '-' ? -1 : 1) * (m[2] === undefined ? 1 : Number(m[2]));
    s = s.slice(m[0].length);
  }
  return c;
}

function cmxEquacao(n) {
  const m = /(?:resolva|resolver|calcule|ache|encontre|raizes?\s+d[aeo]|equacao)?[^=]*?([0-9x^².,+\-*()\s]*x[0-9x^².,+\-*\s]*)=\s*([0-9x^².,+\-*\s]+)/.exec(n.replace(/\b(?:resolva|resolver|raizes?\s+da\s+equacao|equacao|a\s+equacao|de|do|2o|segundo|primeiro)\b/g, ' ').replace(/:/g, ' '));
  if (!m) return null;
  const L = cmxPoli(m[1]), R = cmxPoli(m[2]);
  if (!L || !R) return null;
  const a = L[2] - R[2], b = L[1] - R[1], c = L[0] - R[0];
  if (a === 0) {
    if (b === 0) return [cmxErro(c === 0 ? 'A equação é verdadeira para qualquer x (infinitas soluções).' : 'A equação não tem solução.')];
    const x = -c / b;
    return [cmxItem('x', cmxF(-c) + ' ÷ ' + cmxP(b), x, cmxF(x) + ' (equação do 1º grau)')];
  }
  const delta = b * b - 4 * a * c;
  const itens = [cmxItem('Δ (delta)', cmxP(b) + '² − 4 × ' + cmxP(a) + ' × ' + cmxP(c), delta, cmxF(delta))];
  if (delta < 0) { itens.push(cmxErro('Δ negativo: não há raízes reais.')); return itens; }
  const x1 = (-b + Math.sqrt(delta)) / (2 * a), x2 = (-b - Math.sqrt(delta)) / (2 * a);
  itens.push(cmxItem('x₁', '(−b + √Δ) ÷ 2a', x1, cmxF(x1)));
  if (delta > 0) itens.push(cmxItem('x₂', '(−b − √Δ) ÷ 2a', x2, cmxF(x2)));
  return itens;
}

// ------------------------------------------------------------------ escore z, T, amostra

// Φ(z) pela aproximação de Abramowitz e Stegun (erro < 1e-7).
function cmxFi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

const CMX_Z = { 80: 1.2816, 85: 1.4395, 90: 1.6449, 95: 1.96, 98: 2.3263, 99: 2.5758 };

function cmxEstatistica(n) {
  let m = new RegExp('(?:escore|score|pontuacao|nota)\\s*z\\b[^\\d-]{0,20}(-?' + CMX_NUM + ')[^\\d]{1,40}media\\s+(?:de\\s+)?(-?' + CMX_NUM + ')[^\\d]{1,40}(?:dp|desvio(?:\\s+padrao)?)\\s+(?:de\\s+)?(' + CMX_NUM + ')').exec(n);
  if (m) {
    const x = cmxNum(m[1]), mu = cmxNum(m[2]), dp = cmxNum(m[3]);
    if (dp <= 0) return [cmxErro('O desvio padrão precisa ser maior que 0.')];
    const z = (x - mu) / dp, pc = cmxFi(z) * 100;
    return [cmxItem('escore z', '(' + cmxF(x) + ' − ' + cmxF(mu) + ') ÷ ' + cmxF(dp), z, cmxF(z, 2)),
      cmxItem('escore T', '50 + 10 × z', 50 + 10 * z, cmxF(50 + 10 * z, 1)),
      cmxItem('percentil (se a distribuição for normal)', 'Φ(z) × 100', pc, cmxA(pc, 1) + ' (cerca de ' + cmxA(pc, 1).replace('.', ',') + '% do grupo de referência fica abaixo)')];
  }
  if (/amostra/.test(n)) {
    const mc = new RegExp('confianca\\s+(?:de\\s+)?(\\d{2})').exec(n) || new RegExp('(\\d{2})\\s*%\\s*de\\s+confianca').exec(n);
    const me = new RegExp('margem\\s+de\\s+erro\\s+(?:de\\s+)?(' + CMX_NUM + ')\\s*%?').exec(n) || new RegExp('(' + CMX_NUM + ')\\s*%\\s*de\\s+margem').exec(n);
    if (!mc || !me) return null;
    const conf = Number(mc[1]), e = cmxNum(me[1]) / 100;
    const z = CMX_Z[conf];
    if (!z || e <= 0 || e >= 1) return [cmxErro('Use confiança de 80, 85, 90, 95, 98 ou 99% e margem de erro entre 0 e 100%.')];
    const mpop = new RegExp('popula\\w+\\s+(?:de\\s+)?(' + CMX_NUM + ')').exec(n);
    const p = 0.5;
    const n0 = z * z * p * (1 - p) / (e * e);
    if (mpop) {
      const N = cmxNum(mpop[1]);
      const nf = n0 / (1 + (n0 - 1) / N);
      return [cmxItem('amostra (população finita)', 'n₀ ÷ (1 + (n₀ − 1) ÷ N), n₀ = ' + cmxF(z) + '² × 0,5 × 0,5 ÷ ' + cmxF(e) + '²', Math.ceil(nf), cmxF(Math.ceil(nf)) + ' pessoas (população de ' + cmxF(N) + ', confiança ' + conf + '%, margem ' + cmxF(e * 100) + '%, p = 50% para o pior caso)')];
    }
    return [cmxItem('amostra (população grande)', cmxF(z) + '² × 0,5 × 0,5 ÷ ' + cmxF(e) + '²', Math.ceil(n0), cmxF(Math.ceil(n0)) + ' pessoas (confiança ' + conf + '%, margem ' + cmxF(e * 100) + '%, p = 50% para o pior caso)')];
  }
  return null;
}

// ------------------------------------------------------------------ painel de regras

const CMX_REGRAS = [cmxExtenso, cmxAcrescimo, cmxRegraDeTres, cmxRateio, cmxPerCapita, cmxFrequencia, cmxImc, cmxTaxa, cmxEstatistica, cmxEquacao, cmxFinanceiro, cmxHoras, cmxViagem, cmxNumerico, cmxGeometria, cmxPorcentagem, cmxConversao];

// Resolve pedidos "de cálculo pronto". Devolve null se nenhuma regra reconhece a mensagem.
export function resolverEspecial(texto) {
  const n = cmxSemAcentos(String(texto == null ? '' : texto).slice(0, 500)).toLowerCase().replace(/r\$\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || !/\d|hexadecimal|binario|octal|romano|numero|decimal|metade|dobro|triplo/.test(n)) return null;
  for (let i = 0; i < CMX_REGRAS.length; i++) {
    let r = null;
    try { r = CMX_REGRAS[i](n); } catch (e) { r = null; }
    if (r && r.length) return cmxSaida(r, n);
  }
  return null;
}

// ------------------------------------------------------------------ fachada

export function linhaDeItem(item) {
  if (item.erro) return (item.rotulo ? item.rotulo + ': ' : '') + item.texto;
  return (item.rotulo ? item.rotulo + ': ' : '') + (item.expressao ? item.expressao + (item.bool ? ' → ' : ' = ') : '') + item.texto;
}

// Datas, depois cálculos prontos, depois aritmética. origem diz de onde veio (o cliente trata idade como dado sensível).
export function contasDoPedido(texto, opc) {
  let r = null;
  try { r = resolverDatas(texto, opc); } catch (e) { r = null; }
  if (r) return r;
  r = resolverEspecial(texto);
  if (r) return r;
  const a = contasConfiaveis(texto);
  if (a) return Object.assign({}, a, { origem: 'aritmetica', sensivel: false });
  return null;
}

// Resposta direta, sem IA e sem rede, SÓ quando a mensagem é o pedido. Mais assunto na mensagem: null (a IA responde com a conta pronta).
export function respostaDoPedido(texto, opc) {
  const r = contasDoPedido(texto, opc);
  if (!r || !r.soConta) return null;
  if (r.origem === 'aritmetica') {
    const c = respostaDeConta(texto);
    return c ? { texto: c.texto, itens: c.itens, sensivel: false, origem: 'aritmetica' } : null;
  }
  const itens = r.itens.slice(0, 6).map(function (i) {
    return { expressao: i.expressao || '', valor: i.valor == null ? null : i.valor, bool: !!i.bool, moeda: !!i.moeda, texto: i.texto, rotulo: i.rotulo || '', erro: !!i.erro, sensivel: !!i.sensivel };
  });
  return { texto: itens.map(linhaDeItem).join('\n'), itens: itens, sensivel: !!r.sensivel, origem: r.origem };
}
