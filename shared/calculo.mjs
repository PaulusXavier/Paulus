// Calculadora do Paulus: conta exata, sem IA e sem eval. FONTE ÚNICA: o navegador (dist/paulus.v1.js) e o Worker usam este arquivo.
//
// Por que existe: modelo de linguagem erra conta. Aqui a IA só ESCREVE a conta (ou nem isso, quando a pergunta já é uma conta)
// e um programa executa. O resultado volta para a IA explicar, e o verificador (shared/verificacao.mjs) sabe que o valor é conferido.
//
//   calcularExpressao('15% * 1200')            -> { ok, valor: 180, bool, ops, literais, refs, tokens }
//   extrairContas('quanto é 15% de 1200?')     -> { itens:[{ expressao, texto, valor... }], intencao, soConta, moeda }
//   contasConfiaveis(texto)                    -> o mesmo, mas só se a mensagem pede mesmo uma conta (senão null)
//   respostaDeConta(texto)                     -> { texto, itens } só quando a mensagem É a conta (resposta direta, sem IA)
//   pareceProblemaDeCalculo(texto, historico)  -> pergunta com números que pede uma conta em linguagem natural (vai para o passo de planejamento)
//
// Números: aceita o jeito brasileiro ("1.518,50", "R$ 3.200", "15,04%") e o ponto decimal ("0.1504").
// Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos quebram o arquivo inteiro).
// No navegador os módulos viram um arquivo só: os nomes abaixo não podem repetir os de outros módulos (por isso o prefixo "calc").

const CALC_MAX_TEXTO = 400;
const CALC_MAX_TOKENS = 160;
const CALC_MAX_PROFUNDIDADE = 24;
const CALC_LIMITE = 1e15;

const CALC_FUNCOES = {
  raiz: 'raiz', sqrt: 'raiz', media: 'media', min: 'min', max: 'max', arred: 'arred', arredonda: 'arred', round: 'arred',
  teto: 'teto', ceil: 'teto', piso: 'piso', floor: 'piso', abs: 'abs', soma: 'soma', sum: 'soma'
};
const CALC_ROTULO_FUNCAO = { raiz: 'raiz', media: 'média', min: 'mín', max: 'máx', arred: 'arred', teto: 'teto', piso: 'piso', abs: 'abs', soma: 'soma' };
const CALC_ROTULO_CMP = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', '!=': '≠' };

function calcSemAcentos(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Tira o ruído de ponto flutuante (0,1 + 0,2 = 0,30000000000000004).
function calcLimpar(x) {
  return Number(x.toPrecision(14));
}

// Arredondamento comercial (meio para cima, longe do zero), sem o erro de 1,005 -> 1,00 do toFixed.
export function arredondarCasas(x, casas) {
  if (!isFinite(x)) return x;
  const n = Math.max(0, Math.min(10, casas | 0));
  const sinal = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const s = String(a);
  if (s.indexOf('e') !== -1) return sinal * Math.round(a * Math.pow(10, n)) / Math.pow(10, n);
  return sinal * Number(Math.round(Number(s + 'e' + n)) + 'e-' + n);
}

// ------------------------------------------------------------------ números

// Lê um número em s a partir de pos. ponto 'milhar' (padrão, texto de gente): "1.518" é 1518 e "2.5" é 2,5.
// ponto 'decimal' (conta escrita pela IA): o ponto é sempre decimal ("1.504" é 1,504); milhar só com vírgula decimal ("1.518,00").
function calcLerNumero(s, pos, ponto) {
  const resto = s.slice(pos, pos + 40);
  let m;
  if (ponto === 'decimal') m = /^[1-9]\d{0,2}(?:\.\d{3})+,\d+/.exec(resto);
  else m = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?(?!\d)/.exec(resto);
  if (m) return { v: Number(m[0].replace(/\./g, '').replace(',', '.')), len: m[0].length };
  m = /^\d+,\d+/.exec(resto);
  if (m) return { v: Number(m[0].replace(',', '.')), len: m[0].length };
  m = /^\d+(?:\.\d+)?/.exec(resto);
  if (m) return { v: Number(m[0]), len: m[0].length };
  return null;
}

// Todos os números de um texto, na forma canônica ("1.518,00" -> "1518", "15,04%" -> "15.04"), igual à de verificacao.mjs.
export function numerosDoTexto(texto) {
  const t = String(texto == null ? '' : texto);
  const saida = new Set();
  let i = 0;
  while (i < t.length) {
    const c = t.charAt(i);
    if (c >= '0' && c <= '9') {
      const n = calcLerNumero(t, i, 'milhar');
      if (n && isFinite(n.v)) { saida.add(String(n.v)); i += n.len; continue; }
    }
    i++;
  }
  return saida;
}

// ------------------------------------------------------------------ leitura (tokens)

function calcPreparar(s) {
  return String(s)
    .replace(/R\$\s*/gi, '')
    .replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/(\d|\)|%)\s*[xX]\s*(?=[\d(])/g, '$1 * ');
}

function calcTokens(s, opc) {
  const ponto = opc && opc.ponto;
  const tks = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === ' ' || c === '\t' || c === '\n' || c === ' ') { i++; continue; }
    if (c >= '0' && c <= '9') {
      const n = calcLerNumero(s, i, ponto);
      if (n) {
        const prox = s.charAt(i + n.len);
        // "18h", "3º", "5a": número colado em letra não é quantidade
        const colado = /[A-Za-zÀ-ÿºª°]/.test(prox);
        tks.push({ t: colado ? 'out' : 'num', v: n.v, ini: i, fim: i + n.len });
        i += n.len;
        continue;
      }
    }
    const dois = s.substr(i, 2);
    if (dois === '<=' || dois === '>=' || dois === '==' || dois === '!=') { tks.push({ t: 'cmp', v: dois, ini: i, fim: i + 2 }); i += 2; continue; }
    if (dois === '**') { tks.push({ t: 'op', v: '^', ini: i, fim: i + 2 }); i += 2; continue; }
    if (c === '≤') { tks.push({ t: 'cmp', v: '<=', ini: i, fim: i + 1 }); i++; continue; }
    if (c === '≥') { tks.push({ t: 'cmp', v: '>=', ini: i, fim: i + 1 }); i++; continue; }
    if (c === '≠') { tks.push({ t: 'cmp', v: '!=', ini: i, fim: i + 1 }); i++; continue; }
    if (c === '<' || c === '>') { tks.push({ t: 'cmp', v: c, ini: i, fim: i + 1 }); i++; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') { tks.push({ t: 'op', v: c, ini: i, fim: i + 1 }); i++; continue; }
    if (c === '%') { tks.push({ t: 'pct', ini: i, fim: i + 1 }); i++; continue; }
    if (c === '(') { tks.push({ t: 'lp', ini: i, fim: i + 1 }); i++; continue; }
    if (c === ')') { tks.push({ t: 'rp', ini: i, fim: i + 1 }); i++; continue; }
    if (c === ';') { tks.push({ t: 'sep', ini: i, fim: i + 1 }); i++; continue; }
    if (c === ',' && /\s/.test(s.charAt(i + 1))) { tks.push({ t: 'sep', ini: i, fim: i + 1 }); i++; continue; }
    if (c === '#') {
      const m = /^#(\d{1,2})/.exec(s.slice(i, i + 4));
      if (m) { tks.push({ t: 'ref', v: Number(m[1]), ini: i, fim: i + m[0].length }); i += m[0].length; continue; }
    }
    const letras = /^[A-Za-zÀ-ÿ]+/.exec(s.slice(i, i + 30));
    if (letras) {
      tks.push({ t: 'id', v: calcSemAcentos(letras[0]).toLowerCase(), ini: i, fim: i + letras[0].length });
      i += letras[0].length;
      continue;
    }
    tks.push({ t: 'out', v: c, ini: i, fim: i + 1 });
    i++;
  }
  return tks;
}

// ------------------------------------------------------------------ cálculo

function calcErro(msg) {
  const e = new Error(msg);
  e.calc = true;
  return e;
}

function calcChecar(x) {
  if (!isFinite(x) || Math.abs(x) >= CALC_LIMITE) throw calcErro('resultado fora do limite');
  return x;
}

// Executa os tokens. vars: { 1: 800, 2: 1 } para #1, #2. Devolve { valor, bool, ops, literais, refs }.
// "ops" conta operadores, comparações e funções (porcentagem sozinha não conta): zero significa que não era uma conta.
function calcAvaliar(tokens, vars) {
  if (tokens.length > CALC_MAX_TOKENS) throw calcErro('conta longa demais');
  let p = 0, ops = 0, prof = 0;
  const literais = [], refs = [];
  const olhar = function () { return tokens[p]; };
  const exigir = function (tipo) {
    const t = tokens[p];
    if (!t || t.t !== tipo) throw calcErro('faltou fechar ou separar');
    p++;
    return t;
  };
  const numero = function (r) {
    if (r.bool) throw calcErro('resultado sim/não em conta');
    return r.v;
  };

  function comparacao() {
    const a = soma();
    const t = olhar();
    if (!t || t.t !== 'cmp') return a;
    p++;
    const b = soma();
    ops++;
    const x = numero(a), y = numero(b);
    const igual = Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    let r;
    if (t.v === '<') r = x < y && !igual;
    else if (t.v === '<=') r = x < y || igual;
    else if (t.v === '>') r = x > y && !igual;
    else if (t.v === '>=') r = x > y || igual;
    else if (t.v === '==') r = igual;
    else r = !igual;
    if (olhar() && olhar().t === 'cmp') throw calcErro('comparação encadeada');
    return { v: r ? 1 : 0, bool: true };
  }

  function soma() {
    let a = termo();
    for (;;) {
      const t = olhar();
      if (!t || t.t !== 'op' || (t.v !== '+' && t.v !== '-')) return a;
      p++;
      let b = termo();
      ops++;
      numero(a); numero(b);
      // "1200 + 15%" e "1200 - 10%": a porcentagem é sobre o valor da esquerda
      if (b.pct) b = { v: a.v * b.v };
      a = { v: calcChecar(calcLimpar(t.v === '+' ? a.v + b.v : a.v - b.v)) };
    }
  }

  function termo() {
    let a = unario();
    for (;;) {
      const t = olhar();
      if (!t || t.t !== 'op' || (t.v !== '*' && t.v !== '/')) return a;
      p++;
      const b = unario();
      ops++;
      const x = numero(a), y = numero(b);
      if (t.v === '/' && y === 0) throw calcErro('divisão por zero');
      a = { v: calcChecar(t.v === '*' ? x * y : x / y) };
    }
  }

  function unario() {
    const t = olhar();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
      p++;
      if (++prof > CALC_MAX_PROFUNDIDADE) throw calcErro('conta funda demais');
      const r = unario();
      prof--;
      return t.v === '-' ? { v: -numero(r) } : r;
    }
    return potencia();
  }

  function potencia() {
    const base = posfixo();
    const t = olhar();
    if (!t || t.t !== 'op' || t.v !== '^') return base;
    p++;
    const exp = unario();
    ops++;
    const b = numero(base), e = numero(exp);
    if (Math.abs(e) > 100) throw calcErro('expoente grande demais');
    return { v: calcChecar(Math.pow(b, e)) };
  }

  function posfixo() {
    let x = primario();
    while (olhar() && olhar().t === 'pct') {
      p++;
      x = { v: calcLimpar(numero(x) / 100), pct: true };
    }
    return x;
  }

  function primario() {
    const t = olhar();
    if (!t) throw calcErro('conta incompleta');
    if (++prof > CALC_MAX_PROFUNDIDADE) throw calcErro('conta funda demais');
    let r;
    if (t.t === 'num') { p++; literais.push(t.v); r = { v: t.v }; }
    else if (t.t === 'ref') {
      p++;
      const v = vars ? vars[t.v] : undefined;
      if (typeof v !== 'number' || !isFinite(v)) throw calcErro('a conta #' + t.v + ' não tem resultado');
      refs.push(t.v);
      r = { v: v };
    } else if (t.t === 'lp') {
      p++;
      r = comparacao();
      exigir('rp');
    } else if (t.t === 'id') {
      const f = CALC_FUNCOES[t.v];
      if (!f) throw calcErro('não conheço "' + t.v + '"');
      p++;
      exigir('lp');
      const args = [];
      if (olhar() && olhar().t !== 'rp') {
        for (;;) {
          args.push(numero(comparacao()));
          if (olhar() && olhar().t === 'sep') { p++; continue; }
          break;
        }
      }
      exigir('rp');
      ops++;
      r = { v: calcChecar(calcFuncao(f, args)) };
    } else throw calcErro('conta mal escrita');
    prof--;
    return r;
  }

  const r = comparacao();
  if (p !== tokens.length) throw calcErro('sobrou texto na conta');
  return { valor: r.bool ? r.v : calcLimpar(r.v), bool: !!r.bool, ops: ops, literais: literais, refs: refs };
}

function calcFuncao(f, a) {
  const um = function () { if (a.length !== 1) throw calcErro(f + ' pede 1 número'); return a[0]; };
  const varios = function () { if (!a.length) throw calcErro(f + ' pede números'); return a; };
  if (f === 'raiz') { const x = um(); if (x < 0) throw calcErro('raiz de número negativo'); return calcLimpar(Math.sqrt(x)); }
  if (f === 'abs') return Math.abs(um());
  if (f === 'teto') return Math.ceil(calcLimpar(um()));
  if (f === 'piso') return Math.floor(calcLimpar(um()));
  if (f === 'arred') {
    if (a.length < 1 || a.length > 2) throw calcErro('arred pede 1 ou 2 números');
    return arredondarCasas(a[0], a.length === 2 ? a[1] : 0);
  }
  if (f === 'min') return Math.min.apply(null, varios());
  if (f === 'max') return Math.max.apply(null, varios());
  const soma = varios().reduce(function (x, y) { return x + y; }, 0);
  return f === 'media' ? calcLimpar(soma / a.length) : calcLimpar(soma);
}

// Calcula uma conta escrita em texto. opc.ponto: 'milhar' (padrão) ou 'decimal'; opc.vars: { 1: 800 } para #1.
export function calcularExpressao(texto, opc) {
  const o = opc || {};
  try {
    const s = calcPreparar(String(texto == null ? '' : texto)).trim();
    if (!s) return { ok: false, erro: 'conta vazia' };
    if (s.length > CALC_MAX_TEXTO) return { ok: false, erro: 'conta longa demais' };
    const tks = calcTokens(s, o);
    if (tks.some(function (t) { return t.t === 'out'; })) return { ok: false, erro: 'caractere que não entendi' };
    const r = calcAvaliar(tks, o.vars);
    return { ok: true, valor: r.valor, bool: r.bool, ops: r.ops, literais: r.literais, refs: r.refs, tokens: tks };
  } catch (e) {
    return { ok: false, erro: e && e.calc ? e.message : 'não consegui ler a conta' };
  }
}

// ------------------------------------------------------------------ apresentação

function calcMilhar(inteiro) {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// 1234.5 -> "1.234,5"; moeda: "R$ 1.234,50" (inteiro fica "R$ 800"); número com resto longo vira "≈ 0,3333".
// opc: { moeda, casas } (casas: máximo de decimais fora de moeda, padrão 4).
export function formatarNumero(x, opc) {
  const o = opc || {};
  if (!isFinite(x)) return String(x);
  const v = calcLimpar(x);
  let casas = o.moeda ? 2 : (o.casas != null ? o.casas : 4);
  let r = arredondarCasas(v, casas);
  if (!o.moeda && v !== 0 && r === 0) { casas = 8; r = arredondarCasas(v, casas); }
  const aprox = !o.moeda && Math.abs(r - v) > 1e-12;
  const neg = r < 0;
  const abs = Math.abs(r);
  let [inteiro, dec] = abs.toFixed(casas).split('.');
  if (o.moeda) { if (/^0+$/.test(dec || '')) dec = ''; } else if (dec) dec = dec.replace(/0+$/, '');
  const corpo = calcMilhar(inteiro) + (dec ? ',' + dec : '');
  return (aprox ? '≈ ' : '') + (neg ? '-' : '') + (o.moeda ? 'R$ ' : '') + corpo;
}

// A conta lida de volta para o(a) profissional: "15% de 1.200", "[1] ≤ 218".
function calcRenderizar(tokens) {
  let s = '';
  tokens.forEach(function (t, i) {
    const ant = tokens[i - 1];
    let x;
    if (t.t === 'num') x = (Number.isInteger(t.v) && t.v >= 1900 && t.v <= 2100) ? String(t.v) : formatarNumero(t.v, { casas: 10 });
    else if (t.t === 'op') x = t.v === '*' ? (ant && ant.t === 'pct' ? 'de' : '×') : t.v === '/' ? '÷' : t.v;
    else if (t.t === 'cmp') x = CALC_ROTULO_CMP[t.v];
    else if (t.t === 'pct') x = '%';
    else if (t.t === 'lp') x = '(';
    else if (t.t === 'rp') x = ')';
    else if (t.t === 'sep') x = ';';
    else if (t.t === 'ref') x = '[' + t.v + ']';
    else x = CALC_ROTULO_FUNCAO[CALC_FUNCOES[t.v]] || t.v;
    const grudaAntes = t.t === 'pct' || t.t === 'rp' || t.t === 'sep';
    const grudaDepois = ant && (ant.t === 'lp' || (ant.t === 'id' && t.t === 'lp'));
    const unarioAntes = ant && ant.t === 'op' && ant.v === '-' && (i < 2 || tokens[i - 2].t === 'op' || tokens[i - 2].t === 'lp' || tokens[i - 2].t === 'cmp' || tokens[i - 2].t === 'sep');
    s += (i === 0 || grudaAntes || grudaDepois || unarioAntes || (t.t === 'lp' && ant.t === 'id') ? '' : ' ') + x;
  });
  return s;
}

// Resultado escrito: "R$ 800", "25%", "3 pessoas", "sim"/"não". unidade: 'R$' | '%' | texto livre curto | ''.
export function descreverResultado(r, unidade) {
  if (r.bool) return r.valor ? 'SIM' : 'NÃO';
  const u = String(unidade || '').trim().slice(0, 14);
  if (u === 'R$' || /^reais?$/i.test(u)) return formatarNumero(r.valor, { moeda: true });
  const num = formatarNumero(r.valor);
  if (u === '%') return num + '%';
  return u ? num + ' ' + u : num;
}

// Renderiza a conta lida (tokens de calcularExpressao) para mostrar.
export function expressaoLegivel(tokens) {
  return calcRenderizar(Array.isArray(tokens) ? tokens : []);
}

// ------------------------------------------------------------------ contas em linguagem natural

const CALC_RE_INTENCAO = /\b(?:calcul\w*|quanto\s+(?:e|da|dao|fica|ficou|ficaria|sobra|sobrou|vai|vale|valeria|seria|serao|custa|recebe|receberia|ganha|paga|pagaria|falta|faltam|resta|restam|passa|deu)|da\s+quanto|qual\s+(?:e\s+)?(?:o\s+)?(?:resultado|total|valor\s+total|soma|media|percentual|porcentagem|saldo|diferenca)|resultado\s+d[ea]|some|soma|somar|subtra\w+|multipli\w+|divid\w+|media|percentual|porcentagem|por\s+cento|per\s*capita|dentro\s+do\s+limite|acima\s+do|abaixo\s+do)\b/;

// Palavras que sobram numa pergunta que É só a conta ("quanto é 15% de 1200 reais, por favor?").
const CALC_FILLER = new Set(('quanto e calcule calcula calcular calculo me ajuda ajude pode poderia voce vc por favor pfv pf qual o a os as resultado de do da dos das ' +
  'conta isso seria fica ficou ficaria total valor soma some somar uma um paulus ola oi bom dia tarde noite para pra em que sao deu reais real r sobre ' +
  'com aqui ai agora so apenas vale vai sera resolva resolve faca faz pro na no media entre cento percentual porcentagem hein ne').split(' '));

// Trechos que parecem conta mas não são: data, lei, artigo, parágrafo, horário.
function calcMascarar(n) {
  return n
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\b(?:lei|decreto|portaria|resolucao|instrucao normativa|nota tecnica|art|arts|artigo|artigos|paragrafo|inciso)\.?\s*[\d.]+(?:\/\d{2,4})?/g, ' ')
    .replace(/\bn[º°]\s*[\d.]+(?:\/\d{2,4})?/g, ' ')
    .replace(/§\s*\d+[º°]?/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');
}

const CALC_NUM = '\\d[\\d.,]*';

function calcListaDe(lista) {
  return lista.split(/\s*(?:;|,\s+|\s+e\s+|\s+com\s+|\s*\+\s*)\s*/).map(function (x) { return x.trim().replace(/[.,]+$/, ''); }).filter(Boolean);
}

// Troca as palavras de conta por símbolos, só quando estão entre números ("300 mais 200", "15% de 1200", "reajuste de 15,04% sobre 143").
function calcNormalizarFrase(n) {
  let s = ' ' + n.replace(/r\$/g, ' ').replace(/\bpor cento\b/g, '%') + ' ';
  s = s.replace(new RegExp('\\b(?:aumento|reajuste|acrescimo|majoracao)\\s+(?:de\\s+)?(' + CALC_NUM + ')\\s*%\\s*(?:sobre|em|no valor de|do valor de|ao valor de|de)\\s+(?:o\\s+|a\\s+)?(' + CALC_NUM + ')', 'g'), ' $2 + $1% ');
  s = s.replace(new RegExp('\\b(?:desconto|abatimento|reducao|corte)\\s+(?:de\\s+)?(' + CALC_NUM + ')\\s*%\\s*(?:sobre|em|no valor de|do valor de|ao valor de|de)\\s+(?:o\\s+|a\\s+)?(' + CALC_NUM + ')', 'g'), ' $2 - $1% ');
  s = s.replace(new RegExp('(' + CALC_NUM + ')\\s*%\\s*(?:de|do|da)\\s+(?=[\\d(])', 'g'), '$1% * ');
  s = s.replace(new RegExp('\\bdiferenca\\s+entre\\s+(' + CALC_NUM + ')\\s+e\\s+(' + CALC_NUM + ')', 'g'), ' abs($1 - $2) ');
  s = s.replace(new RegExp('\\b(?:soma|some|somar|total)\\s+(?:de\\s+|dos\\s+|das\\s+)?(' + CALC_NUM + '(?:\\s*(?:;|,\\s+|\\s+e\\s+|\\s+com\\s+|\\+)\\s*' + CALC_NUM + ')+)', 'g'),
    function (_, lista) { return ' ' + calcListaDe(lista).join(' + ') + ' '; });
  s = s.replace(new RegExp('\\bmedia\\s+(?:de\\s+|dos\\s+|das\\s+|entre\\s+)?(' + CALC_NUM + '(?:\\s*(?:;|,\\s+|\\s+e\\s+|\\s+com\\s+)\\s*' + CALC_NUM + ')+)', 'g'),
    function (_, lista) { return ' media(' + calcListaDe(lista).join('; ') + ') '; });
  s = s.replace(new RegExp('\\braiz(?:\\s+quadrada)?\\s+de\\s+(' + CALC_NUM + ')', 'g'), ' raiz($1) ');
  s = s.replace(new RegExp('(' + CALC_NUM + ')\\s+ao\\s+quadrado', 'g'), '$1 ^ 2 ');
  s = s.replace(new RegExp('(' + CALC_NUM + ')\\s+ao\\s+cubo', 'g'), '$1 ^ 3 ');
  const entre = '(' + CALC_NUM + '%?|\\))\\s+';
  const prox = '\\s+(?=\\d|\\()';
  s = s.replace(new RegExp(entre + 'mais' + prox, 'g'), '$1 + ');
  s = s.replace(new RegExp(entre + 'menos' + prox, 'g'), '$1 - ');
  s = s.replace(new RegExp(entre + '(?:vezes|multiplicado\\s+por|multiplicado\\s+pela|multiplicada\\s+por)' + prox, 'g'), '$1 * ');
  s = s.replace(new RegExp(entre + '(?:dividido\\s+por|dividido\\s+pela|dividido\\s+entre|dividido\\s+em|dividida\\s+por)' + prox, 'g'), '$1 / ');
  s = s.replace(new RegExp(entre + '(?:elevado\\s+a|elevado\\s+ao|elevada\\s+a)' + prox, 'g'), '$1 ^ ');
  s = s.replace(new RegExp('(' + CALC_NUM + '%?|\\))\\s*[x×]\\s*(?=\\d|\\()', 'g'), '$1 * ');
  s = s.replace(new RegExp('(' + CALC_NUM + '%?|\\))\\s+[:÷]\\s+(?=\\d|\\()', 'g'), '$1 / ');
  return s.replace(/\s+/g, ' ');
}

function calcTokenValido(t) {
  return t.t === 'num' || t.t === 'op' || t.t === 'cmp' || t.t === 'pct' || t.t === 'lp' || t.t === 'rp' || t.t === 'sep' || t.t === 'ref'
    || (t.t === 'id' && !!CALC_FUNCOES[t.v]);
}

// Acha, nos tokens, as contas completas (a maior janela que fecha, da esquerda para a direita).
function calcJanelas(tokens) {
  const achados = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const abre = t.t === 'num' || t.t === 'lp' || t.t === 'id' || (t.t === 'op' && (t.v === '-' || t.v === '+'));
    if (!abre || !calcTokenValido(t)) { i++; continue; }
    let j = i;
    while (j < tokens.length && calcTokenValido(tokens[j])) j++;
    let achou = null;
    for (let f = j; f > i && !achou; f--) {
      const fatia = tokens.slice(i, f);
      if (!fatia.some(function (x) { return x.t === 'ref'; })) {
        try {
          const r = calcAvaliar(fatia, null);
          if (r.ops >= 1) achou = { i: i, f: f, r: r, fatia: fatia };
        } catch (e) { /* esta janela não fecha: tenta uma menor */ }
      }
    }
    if (achou) { achados.push(achou); i = achou.f; } else i++;
  }
  return achados;
}

// Procura contas em uma mensagem em linguagem natural. Não decide se ela DEVE ser respondida como conta: veja contasConfiaveis.
// intencao: a mensagem usa palavra de conta ("quanto é", "calcule", "soma"...). soConta: fora a conta só sobra enchimento ("por favor", "reais").
export function extrairContas(texto) {
  const bruto = calcSemAcentos(String(texto == null ? '' : texto).slice(0, 600)).toLowerCase();
  const mascarado = calcMascarar(bruto);
  const moeda = /r\$|\breais\b|\breal\b/.test(mascarado);
  const frase = calcNormalizarFrase(mascarado);
  const tokens = calcTokens(frase, { ponto: 'milhar' });
  const janelas = calcJanelas(tokens);
  const itens = janelas.map(function (j) {
    const fonte = frase.slice(j.fatia[0].ini, j.fatia[j.fatia.length - 1].fim);
    const forte = j.fatia.some(function (x) { return x.t === 'id' || x.t === 'cmp' || (x.t === 'op' && x.v !== '-'); }) || /\s-\s/.test(fonte);
    return { expressao: calcRenderizar(j.fatia), valor: j.r.valor, bool: j.r.bool, ops: j.r.ops, moeda: moeda, forte: forte, ini: j.fatia[0].ini, fim: j.fatia[j.fatia.length - 1].fim, tokens: j.fatia };
  });
  // O que sobra depois de tirar as contas: só enchimento (sem letra de conteúdo, sem outro número)?
  let resto = frase;
  for (let k = itens.length - 1; k >= 0; k--) resto = resto.slice(0, itens[k].ini) + ' ' + resto.slice(itens[k].fim);
  const palavras = resto.replace(/[^a-z0-9$%]+/g, ' ').split(' ').filter(Boolean);
  const soConta = itens.length > 0 && palavras.every(function (w) { return CALC_FILLER.has(w); });
  return { itens: itens, intencao: CALC_RE_INTENCAO.test(bruto), soConta: soConta, moeda: moeda };
}

// extrairContas + a decisão de confiar: a mensagem pede conta (palavra de conta) ou é só uma conta com operador claro.
// Evita tratar "Lei 8.742/1993", "3 - 5 anos" ou "10-20" como aritmética.
export function contasConfiaveis(texto) {
  let r;
  try { r = extrairContas(texto); } catch (e) { return null; }
  if (!r.itens.length) return null;
  if (r.intencao) return r;
  if (r.soConta && r.itens.every(function (i) { return i.forte; })) return r;
  return null;
}

// Linha escrita de uma conta: "15% de 1.200 = 180", "[1] ≤ 218 → NÃO".
export function linhaDeConta(item) {
  const r = { valor: item.valor, bool: item.bool };
  const fim = descreverResultado(r, item.moeda ? 'R$' : item.unidade);
  return item.expressao + (item.bool ? ' → ' : ' = ') + fim;
}

// Resposta direta, sem IA e sem rede, SÓ quando a mensagem é a conta. Se há mais assunto na mensagem, devolve null (a IA responde com a conta pronta).
export function respostaDeConta(texto) {
  const r = contasConfiaveis(texto);
  if (!r || !r.soConta) return null;
  const itens = r.itens.slice(0, 4).map(function (i) {
    return { expressao: i.expressao, valor: i.valor, bool: i.bool, moeda: i.moeda, texto: descreverResultado({ valor: i.valor, bool: i.bool }, i.moeda ? 'R$' : '') };
  });
  return { texto: r.itens.slice(0, 4).map(linhaDeConta).join('\n'), itens: itens };
}

// ------------------------------------------------------------------ pergunta que pede conta (para o passo de planejamento da IA)

const CALC_RE_NUM_EXTENSO = /\b(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quinhentos|mil|milhao|milhoes)\b/g;
// Palavras do trabalho que costumam pedir conta, mas só valem com mais de um número, valor em reais ou porcentagem.
const CALC_RE_DOMINIO = /\b(?:renda|per\s*capita|frequencia|faltas?|faltou|faltaram|limite|teto|piso|beneficio|parcelas?|prazo|simul\w+|estimativa|custo|orcamento|repasse|cofinanciamento|valor\s+(?:total|mensal|anual)|quantos\s+(?:dias|meses|anos)|quantas\s+(?:pessoas|parcelas|faltas|aulas|semanas|vezes|familias|criancas))\b/;

export function pareceProblemaDeCalculo(texto, historico) {
  const n = calcSemAcentos(String(texto == null ? '' : texto).slice(0, 800)).toLowerCase();
  const digitos = numerosDoTexto(n).size;
  const extenso = (n.match(CALC_RE_NUM_EXTENSO) || []).length;
  const quantos = digitos + extenso;
  if (!quantos) return false;
  if (CALC_RE_INTENCAO.test(n)) return true;
  if (CALC_RE_DOMINIO.test(n) && (quantos >= 2 || /r\$|%|\breais\b/.test(n))) return true;
  // seguimento curto de uma conta anterior: "e se forem 5 pessoas?", "e com renda de 4000?"
  if (digitos >= 1 && n.split(/\s+/).length <= 12 && /^(?:e|mas|entao|agora)\b|\be\s+se\b/.test(n) && Array.isArray(historico)) {
    for (let i = historico.length - 1; i >= 0; i--) {
      const h = historico[i];
      if (!h || h.papel !== 'usuario' || !h.texto) continue;
      const a = calcSemAcentos(String(h.texto)).toLowerCase();
      return CALC_RE_INTENCAO.test(a) || (CALC_RE_DOMINIO.test(a) && numerosDoTexto(a).size >= 1);
    }
  }
  return false;
}

// A pergunta usa número por extenso ("três mil", "quatro pessoas")? Nesse caso a IA converte para dígitos e o número "novo" não é invenção.
export function temNumeroPorExtenso(texto) {
  const n = calcSemAcentos(String(texto == null ? '' : texto)).toLowerCase();
  return (n.match(CALC_RE_NUM_EXTENSO) || []).length > 0;
}
