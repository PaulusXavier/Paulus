// Datas e prazos do Paulus: no aparelho, exato, sem IA e sem rede. FONTE ÚNICA: navegador (dist/paulus.v1.js) e Worker.
//
//   resolverDatas('30 dias depois de 10/03/2026', { hoje })  -> { itens:[{ texto, rotulo, erro, sensivel }], soConta, sensivel, origem:'datas' } ou null
//
// Faz: diferença entre datas (dias, meses, semanas, dias úteis), data + ou − N dias/semanas/meses/anos/dias úteis, dia da semana,
// idade, "daqui a N dias", "quantos dias faltam para...". Dia útil = segunda a sexta sem feriado NACIONAL (feriado estadual,
// municipal e ponto facultativo não entram; a resposta avisa). "hoje" vem de opc.hoje (dias desde 1970) ou do relógio do aparelho.
// Nomes com prefixo "dts" porque no navegador os módulos viram um arquivo só.

const DTS_MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const DTS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DTS_FERIADOS_FIXOS = { '1/1': 'Confraternização Universal', '21/4': 'Tiradentes', '1/5': 'Dia do Trabalho', '7/9': 'Independência', '12/10': 'Nossa Senhora Aparecida', '2/11': 'Finados', '15/11': 'Proclamação da República', '20/11': 'Consciência Negra', '25/12': 'Natal' };
const DTS_AVISO_UTIL = 'Dia útil = segunda a sexta, sem feriado nacional; feriado estadual/municipal e ponto facultativo não entram (confira o calendário do serviço).';
const DTS_MAX_ITER = 40000;

function dtsSemAcentos(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ------------------------------------------------------------------ calendário

function dtsDias(a, m, d) { return Math.round(Date.UTC(a, m - 1, d) / 86400000); }

function dtsData(dias) {
  const x = new Date(dias * 86400000);
  return { a: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), sem: x.getUTCDay(), dias: dias };
}

function dtsDiasDoMes(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }

function dtsValida(a, m, d) {
  return a >= 1000 && a <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= dtsDiasDoMes(a, m);
}

function dtsDois(n) { return (n < 10 ? '0' : '') + n; }

function dtsPlural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

// Páscoa (algoritmo gregoriano anônimo): a Sexta-feira Santa é feriado nacional.
function dtsPascoa(a) {
  const g = a % 19, c = Math.floor(a / 100), h = (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) % 30;
  const i = h - Math.floor(h / 28) * (1 - Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
  const j = (a + Math.floor(a / 4) + i + 2 - c + Math.floor(c / 4)) % 7;
  const l = i - j;
  const mes = 3 + Math.floor((l + 40) / 44);
  const dia = l + 28 - 31 * Math.floor(mes / 4);
  return dtsDias(a, mes, dia);
}

function dtsFeriado(x) {
  const nome = DTS_FERIADOS_FIXOS[x.d + '/' + x.m];
  if (nome) return nome;
  if (x.dias === dtsPascoa(x.a) - 2) return 'Sexta-feira Santa';
  return '';
}

function dtsUtil(x) { return x.sem !== 0 && x.sem !== 6 && !dtsFeriado(x); }

function dtsEscrever(dias, comNota) {
  const x = dtsData(dias);
  let s = dtsDois(x.d) + '/' + dtsDois(x.m) + '/' + x.a + ' (' + DTS_SEMANA[x.sem] + ')';
  if (comNota) {
    const f = dtsFeriado(x);
    if (f) s += ' (feriado nacional: ' + f + ')';
    else if (x.sem === 0 || x.sem === 6) s += ' (não é dia útil)';
  }
  return s;
}

// Soma meses mantendo o dia; se o mês de chegada é mais curto, vai para o último dia (31/01 + 1 mês = 28/02).
function dtsSomarMeses(dias, meses) {
  const x = dtsData(dias);
  const t = x.a * 12 + (x.m - 1) + meses;
  const a = Math.floor(t / 12), m = t - a * 12 + 1;
  if (a < 1000 || a > 9999) return null;
  return dtsDias(a, m, Math.min(x.d, dtsDiasDoMes(a, m)));
}

function dtsSomarUteis(dias, n) {
  const passo = n < 0 ? -1 : 1;
  let falta = Math.abs(n), atual = dias, it = 0;
  while (falta > 0 && it++ < DTS_MAX_ITER) {
    atual += passo;
    if (dtsUtil(dtsData(atual))) falta--;
  }
  return falta > 0 ? null : atual;
}

// Dias úteis em (de, ate]: não conta o dia inicial, conta o final.
function dtsContarUteis(de, ate) {
  let n = 0;
  for (let d = de + 1; d <= ate; d++) if (dtsUtil(dtsData(d))) n++;
  return n;
}

// Anos, meses e dias de a até b (a <= b).
function dtsPeriodo(a, b) {
  const x = dtsData(a), y = dtsData(b);
  let anos = y.a - x.a, meses = y.m - x.m, dias = y.d - x.d;
  if (dias < 0) {
    meses--;
    const mesAnt = y.m === 1 ? 12 : y.m - 1, anoAnt = y.m === 1 ? y.a - 1 : y.a;
    dias += dtsDiasDoMes(anoAnt, mesAnt);
  }
  if (meses < 0) { anos--; meses += 12; }
  return { anos: anos, meses: meses, dias: dias, totalMeses: anos * 12 + meses };
}

function dtsPeriodoTexto(p) {
  const partes = [];
  if (p.anos) partes.push(dtsPlural(p.anos, 'ano', 'anos'));
  if (p.meses) partes.push(dtsPlural(p.meses, 'mês', 'meses'));
  if (p.dias || !partes.length) partes.push(dtsPlural(p.dias, 'dia', 'dias'));
  return partes.join(', ').replace(/, ([^,]*)$/, ' e $1');
}

// ------------------------------------------------------------------ leitura

// Troca cada data do texto por §0§, §1§... e devolve as datas lidas (válidas ou não).
function dtsExtrair(n) {
  const achadas = [];
  const re1 = /(?:^|[^\d/.\-])(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})(?![\d/])/g;
  let m;
  while ((m = re1.exec(n))) {
    const ini = m.index + m[0].indexOf(m[1]);
    let a = Number(m[3]);
    if (m[3].length === 2) a += a < 70 ? 2000 : 1900;
    achadas.push({ ini: ini, fim: m.index + m[0].length, d: Number(m[1]), m: Number(m[2]), a: a });
  }
  const re2 = /\b(\d{1,2})\s*(?:o\s+)?de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de|,)?\s*(\d{4})\b/g;
  while ((m = re2.exec(n))) achadas.push({ ini: m.index, fim: m.index + m[0].length, d: Number(m[1]), m: DTS_MESES[m[2]], a: Number(m[3]) });
  achadas.sort(function (x, y) { return x.ini - y.ini; });
  const datas = [];
  let texto = '', pos = 0;
  achadas.forEach(function (x) {
    if (x.ini < pos) return;
    texto += n.slice(pos, x.ini) + ' §' + datas.length + '§ ';
    pos = x.fim;
    datas.push(x);
  });
  texto += n.slice(pos);
  return { texto: texto, datas: datas };
}

const DTS_UNID = '(dias?\\s+uteis|dias?\\s+util|dias?|semanas?|meses|mes|anos?)';
const DTS_ALVO = '(§\\d§|hoje)';
const DTS_ENCHIMENTO = new Set(('quanto quantos quantas e foi sera cai caiu dia dias que da de do dos das a o as os um uma para pra por favor paulus qual me diga calcule ' +
  'calcular data prazo resultado faltam falta passaram passou desde ate entre idade nasceu nascimento em quem inclusive contando hoje ola oi uteis util semana ' +
  'semanas meses mes anos ano depois antes apos partir daqui atras ha faz fazem se corridos corrido tenho tem completos completo exato exata na no vai ficar fica ' +
  'cair cairia seria isso conta conte quando termina vence vencimento final inicio comeca ser pessoa fez completa completar').split(' '));

function dtsSoConta(resto) {
  const palavras = resto.replace(/§\d§/g, ' ').replace(/[^a-z]+/g, ' ').split(' ').filter(Boolean);
  return palavras.every(function (w) { return DTS_ENCHIMENTO.has(w); });
}

function dtsUnidade(u) {
  if (/^dias?\s+ut/.test(u)) return 'uteis';
  if (/^dia/.test(u)) return 'dias';
  if (/^semana/.test(u)) return 'semanas';
  if (/^mes/.test(u)) return 'meses';
  return 'anos';
}

function dtsSomarUnidade(base, n, unidade) {
  if (unidade === 'uteis') return dtsSomarUteis(base, n);
  if (unidade === 'dias') return base + n;
  if (unidade === 'semanas') return base + 7 * n;
  if (unidade === 'meses') return dtsSomarMeses(base, n);
  return dtsSomarMeses(base, 12 * n);
}

function dtsItem(rotulo, texto, extra) {
  return Object.assign({ rotulo: rotulo, texto: texto, expressao: '', erro: false, sensivel: false }, extra || {});
}

function dtsErro(texto) { return dtsItem('', texto, { erro: true }); }

function dtsHoje(opc) {
  if (opc && typeof opc.hoje === 'number' && isFinite(opc.hoje)) return Math.floor(opc.hoje);
  const x = new Date();
  return dtsDias(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

function dtsLinhaDiferenca(de, ate, unidade, inclusive) {
  const ini = Math.min(de, ate), fim = Math.max(de, ate);
  if (unidade === 'uteis') {
    return dtsContarUteis(ini, fim) + (inclusive && dtsUtil(dtsData(ini)) ? 1 : 0);
  }
  return fim - ini + (inclusive ? 1 : 0);
}

// ------------------------------------------------------------------ principal

export function resolverDatas(texto, opc) {
  const bruto = dtsSemAcentos(String(texto == null ? '' : texto).slice(0, 400)).toLowerCase();
  if (!/\d|hoje|\bidade\b|\bdaqui\b/.test(bruto)) return null;
  const ext = dtsExtrair(bruto);
  const t = ext.texto.replace(/\s+/g, ' ');
  const hoje = dtsHoje(opc);

  // Data inválida (31/02): para tudo e avisa.
  for (let i = 0; i < ext.datas.length; i++) {
    const x = ext.datas[i];
    if (!dtsValida(x.a, x.m, x.d)) {
      const esc = dtsDois(x.d) + '/' + dtsDois(x.m) + '/' + x.a;
      return { itens: [dtsErro('A data ' + esc + ' não existe no calendário. Confira o dia e o mês.')], soConta: true, sensivel: false, origem: 'datas' };
    }
  }
  const dia = function (i) { const x = ext.datas[i]; return dtsDias(x.a, x.m, x.d); };
  const alvo = function (s) { return s === 'hoje' ? hoje : dia(Number(s.slice(1, -1))); };
  const sair = function (itens, resto, sensivel, extra) {
    const util = itens.some(function (i) { return i.util; });
    if (util) itens.push(dtsItem('', DTS_AVISO_UTIL, { aviso: true }));
    return { itens: itens, soConta: dtsSoConta(resto) && !/feriado|ponto facultativo|recesso|suspens/.test(t), sensivel: !!sensivel, origem: 'datas' };
  };
  let m;

  // idade: "idade de quem nasceu em 15/05/1990", "idade em meses de 10/03/2025"
  if ((/\bidade\b|\bnasceu\b|\bnascimento\b|\bnascida\b|\bnascido\b/.test(t)) && ext.datas.length === 1) {
    const nasc = dia(0);
    if (nasc > hoje) return { itens: [dtsErro('A data de nascimento está no futuro. Confira.')], soConta: true, sensivel: true, origem: 'datas' };
    const p = dtsPeriodo(nasc, hoje);
    const longo = dtsPeriodoTexto(p);
    let linha;
    if (/\bem\s+meses\b/.test(t)) linha = dtsPlural(p.totalMeses, 'mês completo', 'meses completos') + ' (' + longo + ')';
    else if (/\bem\s+dias\b/.test(t)) linha = dtsPlural(hoje - nasc, 'dia', 'dias') + ' de vida (' + longo + ')';
    else linha = dtsPlural(p.anos, 'ano completo', 'anos completos') + ' (' + longo + ')';
    return sair([dtsItem('idade', linha, { sensivel: true })], t.replace(/\bidade\b|\bnasc\w+|\bem\s+(?:meses|dias)\b/g, ' '), true);
  }

  // dia da semana
  m = new RegExp('\\bque\\s+dia\\s+(?:da\\s+semana\\s+)?(?:e|foi|cai|caiu|sera|cairia|seria)\\s+' + DTS_ALVO).exec(t) || new RegExp('\\bdia\\s+da\\s+semana\\s+(?:de|em|d[eo])\\s+' + DTS_ALVO).exec(t);
  if (m) {
    const d = alvo(m[1]);
    const x = dtsData(d);
    const f = dtsFeriado(x);
    const txt = m[1] === 'hoje' ? dtsEscrever(d) : DTS_SEMANA[x.sem] + (f ? ' (feriado nacional: ' + f + ')' : '');
    return sair([dtsItem('', txt)], t.replace(m[0], ' '), false);
  }
  if (/^\s*(?:(?:e|foi)\s+)?(?:qual\s+(?:e\s+)?)?(?:a\s+)?data\s+de\s+hoje\s*\??\s*$/.test(t) || /^\s*que\s+dia\s+e\s+hoje\s*\??\s*$/.test(t)) {
    return sair([dtsItem('', dtsEscrever(hoje))], '', false);
  }

  // diferença entre duas datas
  if (ext.datas.length >= 2 || (ext.datas.length === 1 && /\bhoje\b/.test(t) && /\bentre\b/.test(t))) {
    const dif = new RegExp('(?:\\bentre\\s+|\\bde\\s+|\\bdesde\\s+)' + DTS_ALVO + '\\s+(?:e|ate|a|para)\\s+' + DTS_ALVO).exec(t);
    if (dif && /\b(?:quant\w+|dias?|semanas?|meses|anos?|diferenca|intervalo|prazo|periodo)\b/.test(t) && !/\b(?:depois|antes|apos|partir)\b/.test(t)) {
      const de = alvo(dif[1]), ate = alvo(dif[2]);
      const uteis = /\buteis\b|\bdias?\s+util\b/.test(t);
      const inclusive = /\binclusive\b|\bcontando\s+os\s+dois\b|\bincluindo\b/.test(t);
      const n = dtsLinhaDiferenca(de, ate, uteis ? 'uteis' : 'dias', inclusive);
      const ini = Math.min(de, ate), fim = Math.max(de, ate);
      let linha;
      if (uteis) {
        linha = dtsPlural(n, 'dia útil', 'dias úteis') + (inclusive ? ' (conta os dois extremos)' : ' (sem contar o dia inicial; conta o final)');
      } else {
        const p = dtsPeriodo(ini, fim + (inclusive ? 1 : 0));
        const sem = Math.floor(n / 7), r = n % 7;
        linha = dtsPlural(n, 'dia', 'dias') + (n >= 31 ? ' · ' + dtsPeriodoTexto(p) : '') + (n >= 7 ? ' · ' + dtsPlural(sem, 'semana', 'semanas') + (r ? ' e ' + dtsPlural(r, 'dia', 'dias') : '') : '');
        if (inclusive) linha += ' (contando os dois extremos)';
      }
      return sair([dtsItem('', linha, { util: uteis })], t.replace(dif[0], ' '), false);
    }
  }

  // quantos dias faltam / passaram / há quantos dias foi
  m = new RegExp('\\bquantos\\s+(?:dias|meses)\\s+(?:faltam|falta)\\s+(?:para|pra|ate)\\s+' + DTS_ALVO).exec(t);
  if (m) {
    const d = alvo(m[1]);
    if (d < hoje) return sair([dtsItem('', 'Essa data já passou (hoje é ' + dtsEscrever(hoje) + '). Use "há quantos dias foi ' + dtsEscrever(d).slice(0, 10) + '".')], '', false);
    const p = dtsPeriodo(hoje, d), n = d - hoje;
    const linha = dtsPlural(n, 'dia', 'dias') + ' (faltam, contando de hoje ' + dtsEscrever(hoje).slice(0, 10) + ')' + (n >= 31 ? ' · ' + dtsPeriodoTexto(p) : '') + (n >= 7 ? ' · ' + dtsPlural(Math.floor(n / 7), 'semana', 'semanas') + (n % 7 ? ' e ' + dtsPlural(n % 7, 'dia', 'dias') : '') : '');
    return sair([dtsItem('', linha)], t.replace(m[0], ' '), false);
  }
  m = new RegExp('\\b(?:ha\\s+quantos\\s+dias\\s+(?:foi|era|aconteceu)|quantos\\s+dias\\s+(?:se\\s+)?(?:passaram|faz|fazem)\\s+(?:desde|de))\\s+' + DTS_ALVO).exec(t);
  if (m) {
    const d = alvo(m[1]);
    if (d > hoje) return sair([dtsItem('', 'Essa data ainda não chegou (hoje é ' + dtsEscrever(hoje) + ').')], '', false);
    const p = dtsPeriodo(d, hoje), n = hoje - d;
    const linha = dtsPlural(n, 'dia', 'dias') + ' (já passaram, contando até hoje ' + dtsEscrever(hoje).slice(0, 10) + ')' + (n >= 31 ? ' · ' + dtsPeriodoTexto(p) : '') + (n >= 7 ? ' · ' + dtsPlural(Math.floor(n / 7), 'semana', 'semanas') + (n % 7 ? ' e ' + dtsPlural(n % 7, 'dia', 'dias') : '') : '');
    return sair([dtsItem('', linha)], t.replace(m[0], ' '), false);
  }

  // N unidades depois/antes de uma data
  m = new RegExp('(?:^|\\s)(\\d+)\\s*' + DTS_UNID + '\\s*(?:corridos?\\s*)?(depois\\s+d[eo]|apos|a\\s+partir\\s+d[eo]|antes\\s+d[eo]|depois|antes)\\s+' + DTS_ALVO).exec(t);
  let n = null, un = null, sinal = 1, base = null, usado = null;
  if (m) {
    n = Number(m[1]); un = dtsUnidade(m[2]); sinal = /^antes/.test(m[3]) ? -1 : 1; base = alvo(m[4]); usado = m[0];
  } else {
    m = new RegExp(DTS_ALVO + '\\s*([+-])\\s*(\\d+)\\s*' + DTS_UNID).exec(t);
    if (m) { n = Number(m[3]); un = dtsUnidade(m[4]); sinal = m[2] === '-' ? -1 : 1; base = alvo(m[1]); usado = m[0]; }
  }
  if (!usado) {
    // "daqui a 90 dias", "há 15 dias", "15 dias atrás"
    m = new RegExp('\\bdaqui\\s+a\\s+(\\d+)\\s*' + DTS_UNID).exec(t);
    if (m) { n = Number(m[1]); un = dtsUnidade(m[2]); sinal = 1; base = hoje; usado = m[0]; }
    else {
      m = new RegExp('(?:\\bha\\s+(\\d+)\\s*' + DTS_UNID + '|\\b(\\d+)\\s*' + DTS_UNID + '\\s+atras)').exec(t);
      if (m && !/\bquantos\b/.test(t)) { n = Number(m[1] || m[3]); un = dtsUnidade(m[2] || m[4]); sinal = -1; base = hoje; usado = m[0]; }
    }
  }
  if (usado) {
    if (n > 100000) return sair([dtsErro('Número grande demais para contar prazo.')], '', false);
    const r = dtsSomarUnidade(base, sinal * n, un);
    if (r === null) return sair([dtsErro('Não consegui chegar a essa data (fora do calendário).')], '', false);
    return sair([dtsItem('', dtsEscrever(r, true), { util: un === 'uteis' })], t.replace(usado, ' '), false);
  }

  return null;
}
