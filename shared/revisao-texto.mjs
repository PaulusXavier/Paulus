// Revisão de português no aparelho: aponta erros COMUNS e objetivos, sem IA e sem rede. O texto nunca sai do aparelho.
// Não é um corretor completo: pega só o que dá para afirmar com segurança (grafia fixa errada, acento que falta em palavras comuns,
// expressões erradas, "hs", "etc...", espaço duplo, sigla com "'s", gênero de sigla do SUAS, gerundismo clássico).
// Troca de palavra que existe (mas/mais, a/há) NÃO é pega aqui: a habilidade "portugues-revisao-de-texto" cobre isso com a IA.
//
// revisarTexto(texto) -> { apontamentos: [{ trecho, sugestao, regra, posicao }], corrigido, resumo }
// "corrigido" aplica só as trocas diretas; nunca reescreve frase.
// respostaDeRevisao(pergunta) -> resultado ou null: só quando a pessoa pede para corrigir/revisar e traz o texto depois de ":".

const REV_SEM = /[̀-ͯ]/g;
function revSemAcento(s) { return String(s).normalize('NFD').replace(REV_SEM, ''); }
function revCaixa(orig, novo) {
  if (orig.length > 1 && orig === orig.toUpperCase() && /[A-ZÀ-Ú]/.test(orig)) return novo.toUpperCase();
  if (/^[A-ZÀ-Ú]/.test(orig)) return novo.charAt(0).toUpperCase() + novo.slice(1);
  return novo;
}
const REV_VERBOS = 'fazer|ler|ver|entender|falar|ir|ter|dizer|assinar|enviar|mandar|analisar|revisar|escrever|resolver|organizar|preencher|marcar|participar|ajudar|conferir|checar|olhar';

// Palavras comuns do trabalho que muita gente escreve sem acento (só as que não têm outra leitura comum).
const REV_ACENTOS = {
  familia: 'família', familias: 'famílias', beneficio: 'benefício', beneficios: 'benefícios', servico: 'serviço', servicos: 'serviços',
  usuario: 'usuário', usuarios: 'usuários', municipio: 'município', municipios: 'municípios', orgao: 'órgão', orgaos: 'órgãos',
  referencia: 'referência', referencias: 'referências', historico: 'histórico', tecnico: 'técnico', tecnicos: 'técnicos',
  psicologo: 'psicólogo', psicologos: 'psicólogos', vinculo: 'vínculo', vinculos: 'vínculos', voce: 'você', voces: 'vocês',
  tambem: 'também', nao: 'não', atencao: 'atenção', protecao: 'proteção', avaliacao: 'avaliação', orientacao: 'orientação',
  relatorio: 'relatório', relatorios: 'relatórios', oficio: 'ofício', oficios: 'ofícios', numero: 'número', numeros: 'números',
  necessario: 'necessário', necessaria: 'necessária', obrigatorio: 'obrigatório', obrigatoria: 'obrigatória', assistencia: 'assistência',
  adolescencia: 'adolescência', frequencia: 'frequência', excecao: 'exceção', atendimento: 'atendimento'
};

// [padrão sobre o texto sem acento e minúsculo, sugestão, regra, função de troca (recebe o trecho original) ou null]
const REV_REGRAS = [
  [/\ba nivel de\b/, 'em nível de / no âmbito de / quanto a', 'Expressão desaconselhada em texto formal: "a nível de".', null],
  [/\bhaja visto\b/, 'haja vista', '"Haja vista" é a forma consagrada.', function (t) { return revCaixa(t, 'haja vista'); }],
  [/\bporisso\b/, 'por isso', 'Escreve-se separado: "por isso".', function (t) { return revCaixa(t, 'por isso'); }],
  [/\bderrepente\b/, 'de repente', 'Escreve-se separado: "de repente".', function (t) { return revCaixa(t, 'de repente'); }],
  [/\bconcerteza\b/, 'com certeza', 'Escreve-se separado: "com certeza".', function (t) { return revCaixa(t, 'com certeza'); }],
  [/\bmenas\b/, 'menos', '"Menos" é invariável: não existe "menas".', function (t) { return revCaixa(t, 'menos'); }],
  [/\bestrupo\b/, 'estupro', 'Grafia: "estupro".', function (t) { return revCaixa(t, 'estupro'); }],
  [/\bprevilegio\b/, 'privilégio', 'Grafia: "privilégio".', function (t) { return revCaixa(t, 'privilégio'); }],
  [/\bexcessao\b/, 'exceção', 'Grafia: "exceção" (com ç).', function (t) { return revCaixa(t, 'exceção'); }],
  [/\bbeneficiente\b/, 'beneficente', 'Grafia: "beneficente".', function (t) { return revCaixa(t, 'beneficente'); }],
  [/\bafim de\b/, 'a fim de', 'Finalidade: "a fim de". "Afim" é afinidade.', function (t) { return revCaixa(t, 'a fim de'); }],
  [/\bentre eu e\b/, 'entre mim e', 'Depois de preposição ("entre") usa-se "mim".', function (t) { return revCaixa(t, 'entre mim e'); }],
  [/\bfazem (?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|\d+) (?:anos?|meses|mes|dias?|semanas?)\b/, 'faz + tempo', '"Fazer" indicando tempo é impessoal: "faz dois anos".', function (t) { return t.replace(/^fazem/i, function (m) { return revCaixa(m, 'faz'); }); }],
  [/\bhouveram\b/, 'houve', '"Haver" no sentido de existir é impessoal: "houve", não "houveram".', function (t) { return revCaixa(t, 'houve'); }],
  [/\bha (?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|\d+) (?:anos?|meses|dias?|semanas?) atras\b/, 'tire "há" ou "atrás"', 'Pleonasmo: "há dois anos" ou "dois anos atrás".', null],
  [/\b\d{1,2}(?:hs|hrs)\b/, 'h (ex.: 14h)', 'Hora se abrevia "h": "14h".', function (t) { return t.replace(/(?:hs|hrs)$/i, 'h'); }],
  [/\betc\.{2,}/, 'etc.', '"Etc." leva um ponto só.', function () { return 'etc.'; }],
  [/ {2,}/, 'um espaço', 'Espaço duplo.', function () { return ' '; }],
  [/ +(?=[,;:!?])/, 'sem espaço antes', 'Sem espaço antes de vírgula, ponto e vírgula, dois-pontos, ! e ?.', function () { return ''; }],
  [/\b(?:cras|creas|caps|ubs|ong)'s\b/, 'plural sem apóstrofo', 'Sigla no plural não leva apóstrofo: "os CRAS", "as ONGs".', function (t) { return t.replace(/'s$/i, /^[a-z]/.test(t) ? 's' : 's'); }],
  [new RegExp('\\bpara mim (?:' + REV_VERBOS + ')\\b'), 'para eu + verbo', 'O sujeito do infinitivo é "eu": "para eu fazer".', function (t) { return t.replace(/^para mim/i, function (m) { return revCaixa(m, 'para eu'); }); }],
  [/\b(?:vou|vamos|vai|van|vao) estar [a-z]+ndo\b/, 'forma simples do verbo (ex.: "enviarei", "verificaremos")', 'Gerundismo: prefira o futuro simples.', null],
  [/\b(?:a|uma) (?:cras|creas|caps|paif|bpc|scfv|cadunico)\b/, 'o/um (a sigla é masculina)', 'O gênero da sigla é o do primeiro núcleo: o CRAS (Centro), o PAIF (Serviço), o BPC (Benefício).', function (t) { return t.replace(/^a\b/i, function (m) { return revCaixa(m, 'o'); }).replace(/^uma\b/i, function (m) { return revCaixa(m, 'um'); }); }],
  [/\b(?:o|um) (?:ubs|upa|loas|pnas|lgpd)\b/, 'a/uma (a sigla é feminina)', 'O gênero da sigla é o do primeiro núcleo: a UBS (Unidade), a LOAS (Lei), a LGPD (Lei).', function (t) { return t.replace(/^o\b/i, function (m) { return revCaixa(m, 'a'); }).replace(/^um\b/i, function (m) { return revCaixa(m, 'uma'); }); }],
  [/\b([a-z]{3,}) \1\b/, 'palavra repetida', 'Palavra repetida em sequência. Confira se foi digitada sem querer.', null]
];

// Regras sobre o texto original (minúsculo, com acento), para o que o acento define.
const REV_REGRAS_ORIGINAL = [
  [/(?<![\p{L}])à (?:pé|partir|ele|ela|eles|elas|você|vocês|nós|mim)(?![\p{L}])/gu, 'sem crase', 'Não há crase antes de palavra masculina, verbo ou pronome pessoal: "a pé", "a partir de", "a ele".', function (t) { return t.replace(/^à/i, 'a'); }],
  [/(?<![\p{L}])as(?= \d{1,2}(?:h|hs|hrs|:\d\d| horas)(?![\p{L}]))/gu, 'às + hora', 'Horas levam crase: "às 14h".', function (t) { return revCaixa(t, 'às'); }]
];

export function revisarTexto(texto) {
  const original = String(texto == null ? '' : texto).slice(0, 20000);
  const n = revSemAcento(original).toLowerCase();
  const baixo = original.toLowerCase();
  const itens = [];
  function achar(regex, base, r) {
    const re = new RegExp(regex.source, regex.flags.indexOf('g') === -1 ? regex.flags + 'g' : regex.flags);
    let m;
    while ((m = re.exec(base)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const trecho = original.slice(m.index, m.index + m[0].length);
      itens.push({ posicao: m.index, trecho: trecho, sugestao: r[1], regra: r[2], troca: r[3] ? r[3](trecho) : null });
    }
  }
  if (n.length === original.length) for (const r of REV_REGRAS) achar(r[0], n, r);
  if (baixo.length === original.length) for (const r of REV_REGRAS_ORIGINAL) achar(r[0], baixo, r);
  // palavras comuns sem acento
  const reP = /[\p{L}]+/gu;
  let mp;
  while ((mp = reP.exec(original)) !== null) {
    const w = mp[0];
    if (w !== w.toLowerCase() && w === w.toUpperCase() && w.length > 1) { /* sigla ou caixa alta: confere igual */ }
    const certo = REV_ACENTOS[w.toLowerCase()];
    if (certo && certo !== w.toLowerCase()) {
      itens.push({ posicao: mp.index, trecho: w, sugestao: revCaixa(w, certo), regra: 'Acento: "' + certo + '".', troca: revCaixa(w, certo) });
    }
  }
  itens.sort(function (a, b) { return a.posicao - b.posicao; });
  // sem sobreposição
  const finais = [];
  let fim = -1;
  for (const it of itens) {
    if (it.posicao < fim) continue;
    finais.push(it);
    fim = it.posicao + it.trecho.length;
  }
  let corrigido = '';
  let cursor = 0;
  for (const it of finais) {
    if (it.troca == null) continue;
    corrigido += original.slice(cursor, it.posicao) + it.troca;
    cursor = it.posicao + it.trecho.length;
  }
  corrigido += original.slice(cursor);
  const apontamentos = finais.map(function (it) { return { trecho: it.trecho, sugestao: it.sugestao, regra: it.regra, posicao: it.posicao }; });
  const resumo = apontamentos.length ? (apontamentos.length + (apontamentos.length === 1 ? ' ponto' : ' pontos') + ' para conferir.') : 'Não achei erros comuns. Isso não garante o texto: o corretor do aparelho só pega erros objetivos.';
  return { apontamentos: apontamentos, corrigido: corrigido, resumo: resumo };
}

// Só responde quando a pessoa pede para corrigir/revisar e traz o texto depois de ":".
export function respostaDeRevisao(pergunta) {
  const p = String(pergunta == null ? '' : pergunta);
  const i = p.indexOf(':');
  if (i < 0 || i > 140) return null;
  const pedido = revSemAcento(p.slice(0, i)).toLowerCase();
  if (!/\b(corrij\w*|corrig\w*|revis\w*|confer\w*|confir\w*|verifiqu\w*)\b/.test(pedido)) return null;
  if (!/\b(ortograf\w*|gramatic\w*|portugues|texto|escrita|erros?)\b/.test(pedido)) return null;
  const texto = p.slice(i + 1).trim();
  if (texto.length < 3) return null;
  const r = revisarTexto(texto);
  const linhas = [r.resumo];
  for (const a of r.apontamentos.slice(0, 30)) linhas.push('- "' + a.trecho.trim() + '" → ' + a.sugestao + '. ' + a.regra);
  if (r.apontamentos.length > 30) linhas.push('(e mais ' + (r.apontamentos.length - 30) + ' pontos)');
  if (r.corrigido !== texto) linhas.push('', 'Texto com as correções seguras:', r.corrigido);
  return { texto: linhas.join('\n'), apontamentos: r.apontamentos, corrigido: r.corrigido };
}
