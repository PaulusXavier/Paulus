// Filtro de dados pessoais. FONTE ÚNICA: o navegador (dist/paulus.js) e o Worker usam este arquivo.
// Barra e-mail, sequências longas de números (CPF, NIS, telefone), número depois de "RG/CPF/NIS...",
// "nome + sobrenome" depois de palavras como "nome/chama/paciente/criança", tratamento + nome
// ("dona Maria Souza") e endereço residencial.
// Limite conhecido: é um filtro por padrões, não uma garantia. Por isso a regra de ouro continua
// sendo "dados de famílias nunca chegam a este código".
// (Sem lookbehind de propósito: Safari/iOS antigos quebram o arquivo inteiro com ele.)

const CAP = 'A-ZÁÉÍÓÚÂÊÔÃÕÇ';
const MIN_L = 'a-záéíóúâêôãõç';
const FORA = '(?:^|[^A-Za-zÀ-ÿ])';
const NOME2 = '([' + CAP + '][' + MIN_L + ']+)(?:\\s+d[aeo]s?)?\\s+([' + CAP + '][' + MIN_L + ']+)';
const GATILHOS = '[Nn]ome|[Cc]hama|[Cc]hamada|[Cc]hamado|[Ss]obrenome|[Pp]aciente|[Uu]su[aá]ri[oa]|[Bb]enefici[aá]ri[oa]|[Aa]tendid[oa]|[Cc]rian[cç]a|[Aa]dolescente|[Mm]enin[oa]|[Ff]ilh[oa]|[Mm][aã]e|[Pp]ai|[Ii]dos[oa]|[Ff]am[ií]lia d[aoe]s?|[Aa]tendi|[Aa]tendemos|[Aa]tendeu|[Aa]companho|[Aa]companhamos|[Vv]isitei|[Vv]isitamos|[Cc]aso d[aoe]';

const RE_NOME = new RegExp(FORA + '(?:' + GATILHOS + ')(?![A-Za-zÀ-ÿ])[^.?!\\n]{0,25}?' + FORA + NOME2, 'g');
const RE_TRAT = new RegExp(FORA + '(?:[Dd]ona|[Dd]na|[Ss]r|[Ss]ra|[Ss]eu|[Ss]enhor|[Ss]enhora)\\.?\\s+[' + CAP + '][' + MIN_L + ']{2,}\\s+[' + CAP + '][' + MIN_L + ']{2,}');
const RE_ENDERECO = /\b(mora|moro|moramos|moram|moradora?|reside|residente|endere[cç]o)\b[^.?!\n]{0,40}\b(rua|av\.?|avenida|travessa|tv\.?|quadra|lote)(?![A-Za-zÀ-ÿ])[^?!\n]{0,40}\b\d+/i;
// "RG 1234567", "CPF: 12345678", "NIS nº 123456": o número curto também é dado pessoal quando vem rotulado.
const RE_DOC_ROTULADO = /\b(?:rg|cpf|nis|nit|pis|cnh|cnpj|titulo(?:\s+de\s+eleitor)?|t[ií]tulo(?:\s+de\s+eleitor)?|cart[aã]o|matr[ií]cula|prontu[aá]rio|sus|cns|c[oó]digo\s+familiar)\b[^\d\n]{0,15}\d[\d.\-\/\s]{4,}\d/i;

// "João Pedro faltou", "Francisca de Oliveira recebe": nome de duas palavras seguido de verbo que só se diz de pessoa.
const RE_NOME_VERBO = new RegExp(FORA + NOME2 + '\\s+(?:recebe|recebeu|recebia|faltou|faltaram|mora|moram|morava|nasceu|chegou|procurou|compareceu|relatou|abandonou|desistiu|engravidou|internou)(?![A-Za-zÀ-ÿ])', 'g');
// "José, 45 anos", "Maria, 8 anos": nome único seguido da idade.
const RE_NOME_IDADE = new RegExp(FORA + '([' + CAP + '][' + MIN_L + ']{2,}),\\s*\\d{1,3}\\s+anos', 'g');
const NAO_NOME_IDADE = new Set('hoje ontem amanha depois antes agora entao assim ainda nesse nessa neste nesta ha'.split(' '));

// Palavras que começam com maiúscula mas são instituições, não pessoas ("Bolsa Família", "Boa Vista").
const NAO_NOME = new Set(('bolsa familia programa cadastro unico centro conselho tutelar social assistencia nacional unidade casa lar ' +
  'servico servicos ministerio secretaria boa vista roraima brasil sistema saude educacao municipal estadual federal ' +
  'protecao basica especial referencia caps cras creas suas sus paif paefi scfv loas bpc cadunico previdencia ' +
  'defensoria publica delegacia policia hospital posto pronto socorro estatuto crianca adolescente idoso ' +
  'pessoa deficiencia saude mental rede acolhimento abrigo ' +
  'guardianship council unified registry reference center centre public defender').split(' '));

function semAcentoMin(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function achouNome(t) {
  RE_NOME.lastIndex = 0;
  let m;
  while ((m = RE_NOME.exec(t)) !== null) {
    if (!NAO_NOME.has(semAcentoMin(m[1])) && !NAO_NOME.has(semAcentoMin(m[2]))) return true;
    RE_NOME.lastIndex = m.index + 1; // continua procurando logo depois do início deste achado
  }
  return false;
}

function achouNomeVerbo(t) {
  RE_NOME_VERBO.lastIndex = 0;
  let m;
  while ((m = RE_NOME_VERBO.exec(t)) !== null) {
    if (!NAO_NOME.has(semAcentoMin(m[1])) && !NAO_NOME.has(semAcentoMin(m[2]))) return true;
    RE_NOME_VERBO.lastIndex = m.index + 1;
  }
  return false;
}

function achouNomeIdade(t) {
  RE_NOME_IDADE.lastIndex = 0;
  let m;
  while ((m = RE_NOME_IDADE.exec(t)) !== null) {
    const n = semAcentoMin(m[1]);
    if (!NAO_NOME.has(n) && !NAO_NOME_IDADE.has(n)) return true;
  }
  return false;
}

// Intervalo de anos ("2023-2026", "2023 2024 2025") não é documento nem telefone.
const SO_ANOS = /^(?:(?:19|20)\d{2}[\s\-\/]+)*(?:19|20)\d{2}$/;
// Período com duas datas completas ("01/01/2026 - 31/12/2026").
const SO_PERIODO_DATAS = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*[-–]\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/;

// Conta escrita com operador entre espaços ("quanto é 1518 - 218 - 164 - 58"): somando tudo passa de 9 dígitos, mas cada número é curto.
// Só vale com palavra ou símbolo de conta na mensagem e operador COM espaços ("95-3623-1234" e "123.456.789-01" continuam barrados).
const RE_SINAL_DE_CONTA = /[+*×÷=%]|\b(?:calcul|quanto|soma\b|some\b|subtra|resultado|vezes|menos\b|dividid|media|média|percent|per capita)/i;
function ehContaComOperador(sequencia, texto) {
  if (!RE_SINAL_DE_CONTA.test(texto)) return false;
  const partes = sequencia.trim().split(/\s+[-\/]\s+/);
  return partes.length >= 2 && partes.every(function (p) { return p.replace(/\D/g, '').length <= 8; });
}

// E-mail em tempo linear: ancora em cada "@" e olha só a "palavra" de cada lado.
// (O regex antigo /[^\s@]+@[^\s@]+\.[a-z]{2,}/ era quadrático: 60 KB sem espaço levavam ~2,6 s.)
function temEmail(t) {
  let i = t.indexOf('@');
  while (i !== -1) {
    let a = i - 1;
    while (a >= 0 && !/[\s@]/.test(t.charAt(a))) a--;
    let b = i + 1;
    while (b < t.length && !/[\s@]/.test(t.charAt(b))) b++;
    if (a + 1 < i && /^[^\s@]+\.[a-z]{2,}/i.test(t.slice(i + 1, b))) return true;
    i = t.indexOf('@', i + 1);
  }
  return false;
}

// Telefone: com DDD entre parênteses, ou rotulado (\"tel\", \"whatsapp\"...), inclusive fixo de 8 dígitos (3623-1234), que a regra de 9 dígitos não pegava.
const RE_TEL_DDD = /\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}(?!\d)/;
const RE_TEL_ROTULADO = /\b(?:tel(?:efone)?|fone|celular|cel|whats(?:app)?|zap|contato)\b[^\d\n]{0,15}(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}(?!\d)/i;
// Data de nascimento (\"nasceu em 12/03/2015\", \"data de nascimento: 12-03-15\"): com o resto da conversa, identifica a criança.
const RE_NASCIMENTO = /\b(?:nasc\w*|data de nascimento|dn)\b[^\d\n]{0,20}\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/i;
// Nome escrito em minúsculas (celular): \"a criança chamada joão pedro\", \"o nome dela é maria souza\". Só com gatilho forte.
const PESSOA = 'crianca|menin[oa]|adolescente|usuari[oa]|idos[oa]|mae|pai|filh[oa]|senhora?|moca|moco|rapaz|homem|mulher|jovem|bebe|paciente|vizinh[oa]|beneficiari[oa]';
const PALAVRA_NOME = '([a-z]{3,})\\s+(?:d[aeo]s?\\s+)?([a-z]{3,})';
const RE_NOME_MINUSCULO = new RegExp('\\b(?:(?:' + PESSOA + ')\\s+(?:chamad[oa]|de nome)|nome\\s+(?:dele|dela|completo)\\s+e|se chama|chama-se)\\s+' + PALAVRA_NOME + '\\b', 'g');
const NAO_NOME_MINUSCULO = new Set('para pelo pela pelos pelas por com sem que uma uns umas aos nas nos dos das desde sobre entre quando como mais muito muita obrigatorio obrigatoria importante necessario nao tem ser esta foi'.split(' '));
function achouNomeMinusculo(t) {
  const x = semAcentoMin(t);
  RE_NOME_MINUSCULO.lastIndex = 0;
  let m;
  while ((m = RE_NOME_MINUSCULO.exec(x)) !== null) {
    if (![m[1], m[2]].some(function (w) { return NAO_NOME.has(w) || NAO_NOME_MINUSCULO.has(w); })) return true;
    RE_NOME_MINUSCULO.lastIndex = m.index + 1;
  }
  return false;
}

// Nome em CAIXA ALTA ("MARIA DA SILVA recebe bolsa"): só quando há 2+ palavras seguidas em maiúsculas, que viram "Maria Da Silva" para
// passar pelas mesmas regras de nome. Sigla isolada (CRAS, PAIF) não conta, e as siglas conhecidas estão em NAO_NOME.
function achouNomeCaixaAlta(t) {
  if (!/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\s+(?:D[AEO]S?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(t)) return false;
  const suave = t.replace(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }).replace(/\bD([AEO]S?)\b/g, function (m) { return m.toLowerCase(); });
  return achouNomeVerbo(suave) || achouNome(suave);
}


// ---------------------------------------------------------------------------------------------------------------------
// ESPANHOL (v0.18.0): nome, tratamento, documento, telefone, nascimento e endereço escritos em espanhol ou em "portunhol".
// Mesma regra do português: o filtro é por padrões, não uma garantia; dado de família nunca deve chegar aqui.
// ---------------------------------------------------------------------------------------------------------------------
const CAP_ES = CAP + 'Ñ';
const MIN_ES = MIN_L + 'ñü';
const NOME2_ES = '([' + CAP_ES + '][' + MIN_ES + ']+)(?:\\s+(?:d[aeo]s?|del|de\\s+la|de\\s+los|de\\s+las))?\\s+([' + CAP_ES + '][' + MIN_ES + ']+)';
const GATILHOS_ES = '[Nn]ombre|[Aa]pellido|[Ss]e\\s+llama|[Ll]lama(?:do|da)?|[Pp]aciente|[Uu]suari[oa]|[Bb]eneficiari[oa]|[Aa]tendid[oa]|[Nn]i[ñn][oa]|[Aa]dolescente|[Hh]ij[oa]|[Mm]adre|[Pp]adre|[Mm]am[aá]|[Pp]ap[aá]|[Aa]nciano|[Aa]nciana|[Aa]buel[oa]|[Ee]spos[oa]|[Vv]ecin[oa]|[Ff]amilia\\s+(?:de|del)|[Aa]tend[ií]|[Aa]tendimos|[Vv]isit[eé]|[Vv]isitamos|[Cc]aso\\s+(?:de|del)';
const RE_NOME_ES = new RegExp(FORA + '(?:' + GATILHOS_ES + ')(?![A-Za-zÀ-ÿ])[^.?!\\n]{0,25}?' + FORA + NOME2_ES, 'g');
const RE_TRAT_ES = new RegExp(FORA + '(?:[Dd]on|[Dd]o[ñn]a|[Ss]e[ñn]or|[Ss]e[ñn]ora|[Ss]e[ñn]orita|[Ss]rta?|[Ss]ra|[Ss]r)\\.?\\s+[' + CAP_ES + '][' + MIN_ES + ']{2,}\\s+[' + CAP_ES + '][' + MIN_ES + ']{2,}');
const RE_NOME_VERBO_ES = new RegExp(FORA + NOME2_ES + '\\s+(?:recibe|recibi[oó]|cobra|cobr[oó]|falt[oó]|faltaron|vive|viven|vivi[oó]|naci[oó]|lleg[oó]|busc[oó]|asisti[oó]|relat[oó]|abandon[oó]|desisti[oó]|ingres[oó]|se\\s+embaraz[oó]|trabaja|trabaj[oó]|se\\s+mud[oó]|se\\s+fue|se\\s+qued[oó])(?![A-Za-zÀ-ÿ])', 'g');
const RE_NOME_IDADE_ES = new RegExp(FORA + '([' + CAP_ES + '][' + MIN_ES + ']{2,}),\\s*\\d{1,3}\\s+a[ñn]os', 'g');
const NAO_NOME_ES = new Set(('consejo tutelar asistencia centro unidad servicio programa ministerio secretaria registro unico policia hospital escuela colegio ' +
  'bolsa familia salud mental proteccion social defensoria publica ayuda gobierno brasil venezuela roraima boa vista operacion acogida referencia basica especial').split(' '));
const RE_DOC_ES = /\b(?:c[eé]dula(?:\s+de\s+identidad)?|pasaporte|dni|rif|ci|documento(?:\s+de\s+identidad)?|nis|cpf|rg|tarjeta\s+del\s+sus|carn[eé]|crnm|protocolo)\b[^\d\n]{0,15}\d[\d.\-\/\s]{3,}\d|\b[VvEe][-\s]?\d{1,2}\.?\d{3}\.?\d{3}\b/i;
const RE_TEL_ES = /\b(?:mi\s+)?(?:tel[eé]fono|celular|m[oó]vil|whatsapp|wasap|n[uú]mero|contacto|ll[aá]m(?:e|eme|enme)|escr[ií]ba?(?:me)?)\b[^\d\n]{0,20}(?:\+?\d[\d\s().\-]{6,}\d)/i;
const RE_NASC_ES = /\b(?:naci[oó]|nacimiento|fecha\s+de\s+nacimiento|cumple(?:a[ñn]os)?|n\.?\s*:)(?![A-Za-z])[^\d\n]{0,15}\d{1,2}\s*(?:\/|-|\.|de)\s*(?:\d{1,2}|[a-zA-Z]{3,10})\s*(?:\/|-|\.|de)?\s*\d{2,4}/i;
const RE_ENDERECO_ES = /\b(?:vive|vivo|vivimos|viven|reside|residente|direcci[oó]n|domicilio)\b[^.?!\n]{0,40}\b(?:calle|av\.?|avenida|carrera|casa|manzana|conjunto|urbanizaci[oó]n|barrio|sector)(?![A-Za-zÀ-ÿ])[^?!\n]{0,40}\b\d+/i;

function achouEs(re, t) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    if (!NAO_NOME_ES.has(semAcentoMin(m[1])) && !NAO_NOME_ES.has(semAcentoMin(m[2])) && !NAO_NOME.has(semAcentoMin(m[1])) && !NAO_NOME.has(semAcentoMin(m[2]))) return true;
    re.lastIndex = m.index + 1;
  }
  return false;
}
function achouNomeIdadeEs(t) {
  RE_NOME_IDADE_ES.lastIndex = 0;
  let m;
  while ((m = RE_NOME_IDADE_ES.exec(t)) !== null) {
    if (!NAO_NOME_ES.has(semAcentoMin(m[1])) && !NAO_NOME_IDADE.has(semAcentoMin(m[1]))) return true;
    RE_NOME_IDADE_ES.lastIndex = m.index + 1;
  }
  return false;
}
// Nome em minúsculas depois de gatilho forte ("mi esposo se llama pedro ramirez", "el niño llamado carlos rodriguez")
const RE_NOME_MIN_ES = /\b(?:se llama|llamad[oa]|me llamo|mi nombre es|su nombre es|nombre completo(?: es)?|nombre y apellido(?: es)?)\s+([a-zñáéíóú]{3,})\s+(?:(?:de|del|de la)\s+)?([a-zñáéíóú]{3,})\b/i;
const NAO_NOME_MIN_ES = new Set('para por con sin que una unos del las los muy mas bien aqui alli como cuando donde mucho poco todo nada algo juan'.split(' ').filter(function (w) { return w !== 'juan'; }));
function achouNomeMinEs(t) {
  const m = RE_NOME_MIN_ES.exec(t);
  if (!m) return false;
  const a = semAcentoMin(m[1]), b = semAcentoMin(m[2]);
  return !NAO_NOME_MIN_ES.has(a) && !NAO_NOME_MIN_ES.has(b) && !NAO_NOME_ES.has(a) && !NAO_NOME_ES.has(b);
}
function achouNomeCaixaAltaEs(t) {
  if (!/[A-ZÁÉÍÓÚÑ]{3,}\s+(?:D[EAO]S?\s+)?[A-ZÁÉÍÓÚÑ]{3,}/.test(t)) return false;
  const suave = t.replace(/[A-ZÁÉÍÓÚÑ]{3,}/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); });
  return achouEs(RE_NOME_VERBO_ES, suave) || achouEs(RE_NOME_ES, suave);
}
function temIdentificacaoEs(t) {
  return RE_DOC_ES.test(t) || RE_TRAT_ES.test(t) || achouEs(RE_NOME_ES, t) || achouNomeIdadeEs(t) || achouNomeMinEs(t);
}
function temDadoPessoalEs(t) {
  return temIdentificacaoEs(t) || RE_TEL_ES.test(t) || RE_NASC_ES.test(t) || RE_ENDERECO_ES.test(t) || achouEs(RE_NOME_VERBO_ES, t) || achouNomeCaixaAltaEs(t);
}

// ---------------------------------------------------------------------------------------------------------------------
// INGLÊS (v0.19.0): nome, tratamento, documento, telefone, nascimento e endereço escritos em inglês (Guiana, Caribe e quem escreve em inglês).
// Mesma regra do português e do espanhol: o filtro é por padrões, não uma garantia; dado de família nunca deve chegar aqui.
// ---------------------------------------------------------------------------------------------------------------------
const NOME2_EN = '([' + CAP + '][' + MIN_L + ']+)(?:\\s+(?:d[aeo]s?|van|von))?\\s+([' + CAP + '][' + MIN_L + ']+)';
const GATILHOS_EN = '[Nn]ame|[Ss]urname|[Ll]ast\\s+name|[Ff]irst\\s+name|[Cc]alled|[Nn]amed|[Pp]atient|[Uu]ser|[Cc]lient|[Bb]eneficiary|[Cc]hild|[Kk]id|[Bb]oy|[Gg]irl|[Tt]een(?:ager)?|[Ss]on|[Dd]aughter|[Mm]other|[Mm]om|[Mm]um|[Ff]ather|[Dd]ad|[Ww]ife|[Hh]usband|[Nn]eighbou?r|[Gg]rand(?:mother|father|ma|pa)|[Ff]amily(?:\\s+of)?|[Pp]artner|[Aa]unt|[Uu]ncle|[Ss]ister|[Bb]rother';
const RE_NOME_EN = new RegExp(FORA + '(?:' + GATILHOS_EN + ')(?![A-Za-zÀ-ÿ])[^.?!\\n]{0,25}?' + FORA + NOME2_EN, 'g');
const RE_TRAT_EN = new RegExp(FORA + '(?:Mr|Mrs|Ms|Miss|Mister|Madam|Sir)\\.?\\s+[' + CAP + '][' + MIN_L + ']{2,}');
const RE_EU_SOU_EN = new RegExp(FORA + '(?:I\\s+am|I\'m|Im|This\\s+is|My\\s+name\'s)\\s+' + NOME2_EN, 'g');
const RE_NOME_VERBO_EN = new RegExp(FORA + NOME2_EN + '\\s+(?:receives|received|gets|got|lives|lived|arrived|came|missed|dropped\\s+out|works|worked|moved|left|abandoned|stopped|attended|was\\s+born|is\\s+pregnant|got\\s+pregnant|has\\s+(?:a|two|three)\\s+(?:child|children|kids))(?![A-Za-zÀ-ÿ])', 'g');
const RE_NOME_IDADE_EN = new RegExp(FORA + '([' + CAP + '][' + MIN_L + ']{2,}),\\s*\\d{1,3}\\s*(?:years?\\s*old|yrs?\\s*old|y\\/?o|years)', 'g');
const NAO_NOME_EN = new Set(('social assistance reference center centre unit health basic care psychosocial child protection council guardianship federal police public defender office ' +
  'protective services brazil guyana roraima boa vista bolsa familia cadastro unico operation welcome human rights hotline women helpline unified registry continuous cash benefit ' +
  'family strategy labor eradication program emergency department hospital school ministry secretary national immigration good morning thank thanks hello very worried').split(' '));
const NAO_NOME_IDADE_EN = new Set('today yesterday tomorrow now then before after later here there'.split(' '));
const RE_DOC_EN = /\b(?:passport|id(?:\s+card)?|identity\s+card|national\s+id|nis|cpf|rg|ssn|social\s+security|driver'?s?\s+licen[cs]e|licen[cs]e|crnm|tin|sus\s+card|case\s+number|file\s+number)\b[^\d\n]{0,15}\d[\d.\-\/\s]{3,}\d/i;
const RE_TEL_EN = /\b(?:my\s+)?(?:phone|tel|telephone|mobile|cell|whatsapp|number|contact|call\s+me|text\s+me|reach\s+me)\b[^\d\n]{0,20}\+?\d[\d\s().\-]{6,}\d/i;
const RE_NASC_EN = /\b(?:born|birthday|dob|date\s+of\s+birth)\b(?:[^\d\n]{0,15}\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}|[^\d\n]{0,15}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}|[^\d\n]{0,15}\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4})/i;
const RE_ENDERECO_EN = /\b(?:lives|live|living|resides|reside|residing|address|home\s+is)\b(?:[^.?!\n]{0,40}\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|lane|block|lot|house|apartment|apt\.?|rua|avenida|quadra)(?![A-Za-zÀ-ÿ])[^?!\n]{0,40}\b\d+|[^.?!\n]{0,12}\b\d{1,5}\s+[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?\s+(?:street|st|avenue|ave|road|rd|lane)\b)/i;

function achouEn(re, t) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    if (!NAO_NOME_EN.has(semAcentoMin(m[1])) && !NAO_NOME_EN.has(semAcentoMin(m[2])) && !NAO_NOME.has(semAcentoMin(m[1])) && !NAO_NOME.has(semAcentoMin(m[2]))) return true;
    re.lastIndex = m.index + 1;
  }
  return false;
}
function achouNomeIdadeEn(t) {
  RE_NOME_IDADE_EN.lastIndex = 0;
  let m;
  while ((m = RE_NOME_IDADE_EN.exec(t)) !== null) {
    if (!NAO_NOME_EN.has(semAcentoMin(m[1])) && !NAO_NOME_IDADE_EN.has(semAcentoMin(m[1]))) return true;
    RE_NOME_IDADE_EN.lastIndex = m.index + 1;
  }
  return false;
}
// Nome em minúsculas depois de gatilho forte ("his name is john smith", "the child called carlos rodriguez")
const RE_NOME_MIN_EN = /\b(?:name is|names|called|named|my name is|full name(?: is)?)\s+([a-z]{3,})\s+([a-z]{3,})\b/i;
const NAO_NOME_MIN_EN = new Set('for the and with that this very more also from into about not now here there just only'.split(' '));
function achouNomeMinEn(t) {
  const m = RE_NOME_MIN_EN.exec(t);
  if (!m) return false;
  const a = semAcentoMin(m[1]), b = semAcentoMin(m[2]);
  return !NAO_NOME_MIN_EN.has(a) && !NAO_NOME_MIN_EN.has(b) && !NAO_NOME_EN.has(a) && !NAO_NOME_EN.has(b);
}
function achouNomeCaixaAltaEn(t) {
  if (!/[A-Z]{3,}\s+(?:D[EAO]S?\s+)?[A-Z]{3,}/.test(t)) return false;
  const suave = t.replace(/[A-Z]{3,}/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); });
  return achouEn(RE_NOME_VERBO_EN, suave) || achouEn(RE_NOME_EN, suave);
}
function temIdentificacaoEn(t) {
  return RE_DOC_EN.test(t) || RE_TRAT_EN.test(t) || achouEn(RE_NOME_EN, t) || achouEn(RE_EU_SOU_EN, t) || achouNomeIdadeEn(t) || achouNomeMinEn(t);
}
function temDadoPessoalEn(t) {
  return temIdentificacaoEn(t) || RE_TEL_EN.test(t) || RE_NASC_EN.test(t) || RE_ENDERECO_EN.test(t) || achouEn(RE_NOME_VERBO_EN, t) || achouNomeCaixaAltaEn(t);
}

// Para texto que o APP manda (fichas do diretório, base do app, panorama): telefone, endereço e nome de unidade são esperados ali,
// então só vale o que identifica PESSOA: e-mail, documento rotulado, CPF formatado e nome depois de gatilho.
export function temIdentificacaoPessoal(texto) {
  const t = String(texto == null ? '' : texto);
  if (temEmail(t) || RE_DOC_ROTULADO.test(t) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t)) return true;
  return achouNome(t) || achouNomeIdade(t) || achouNomeMinusculo(t) || RE_TRAT.test(t) || temIdentificacaoEs(t) || temIdentificacaoEn(t);
}

export function temDadoPessoal(texto) {
  const t = String(texto == null ? '' : texto);
  if (temEmail(t)) return true;
  if (RE_TEL_DDD.test(t) || RE_TEL_ROTULADO.test(t) || RE_NASCIMENTO.test(t)) return true;
  // Números de leis/decretos com ano ("Lei 14.601/2023", "Lei Maria da Penha, 11.340/2006") são referências públicas, não documentos.
  // Remove só a referência completa antes da busca; qualquer CPF/NIS fora dela continua sujeito ao filtro.
  const textoSemNorma = t.replace(/\b(?:lei|decreto)\b[^.?!\n]{0,50}?\b\d{1,6}(?:\.\d{3})?\/(?:19|20)\d{2}\b/gi, ' ');
  const sequencias = textoSemNorma.match(/\d[\d.\-\/\s]{6,}\d/g) || [];
  if (sequencias.some(s => !/^0800[\s.-]?\d{3}[\s.-]?\d{4}$/.test(s.trim()) && !SO_ANOS.test(s.trim()) && !SO_PERIODO_DATAS.test(s.trim()) && s.replace(/\D/g, '').length >= 9 && !ehContaComOperador(s, t))) return true;
  if (RE_DOC_ROTULADO.test(t)) return true;
  if (achouNome(t) || achouNomeVerbo(t) || achouNomeIdade(t) || achouNomeMinusculo(t) || achouNomeCaixaAlta(t) || RE_TRAT.test(t)) return true;
  return RE_ENDERECO.test(t) || temDadoPessoalEs(t) || temDadoPessoalEn(t);
}

// ---------------------------------------------------------------------------------------------------------------------
// LEITURA NO APARELHO (v0.34.0): em vez de só barrar, devolve QUAIS nomes o filtro reconheceu, para o aparelho trocá-los por marcadores
// (shared/pseudonimo.mjs) antes de qualquer envio. Usa os mesmos padrões e as mesmas listas de "não é nome" de temDadoPessoal.
// Cada item é a lista de palavras do nome como foram escritas: ['João', 'Pedro'] ou, só com a idade ("José, 45 anos"), ['José'].
// Mesmo limite do filtro: o que nenhum padrão reconhece não é achado.
// ---------------------------------------------------------------------------------------------------------------------
const RE_TRAT_C = new RegExp(FORA + '(?:[Dd]ona|[Dd]na|[Ss]r|[Ss]ra|[Ss]eu|[Ss]enhor|[Ss]enhora)\\.?\\s+([' + CAP + '][' + MIN_L + ']{2,})\\s+([' + CAP + '][' + MIN_L + ']{2,})', 'g');
const RE_TRAT_ES_C = new RegExp(FORA + '(?:[Dd]on|[Dd]o[ñn]a|[Ss]e[ñn]or|[Ss]e[ñn]ora|[Ss]e[ñn]orita|[Ss]rta?|[Ss]ra|[Ss]r)\\.?\\s+([' + CAP_ES + '][' + MIN_ES + ']{2,})\\s+([' + CAP_ES + '][' + MIN_ES + ']{2,})', 'g');
const RE_TRAT_EN_C = new RegExp(FORA + '(?:Mr|Mrs|Ms|Miss|Mister|Madam|Sir)\\.?\\s+([' + CAP + '][' + MIN_L + ']{2,})', 'g');

function coletarPares(re, t, listas, saida) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    const a = m[1], b = m[2];
    if (a) {
      const na = semAcentoMin(a), nb = b ? semAcentoMin(b) : '';
      const barrado = listas.some(function (l) { return l.has(na) || (nb && l.has(nb)); });
      if (!barrado) saida.push(b ? [a, b] : [a]);
    }
    re.lastIndex = m.index + 1;
  }
}

function coletarComIdade(re, t, listas, saida) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    const n = semAcentoMin(m[1]);
    if (!listas.some(function (l) { return l.has(n); })) saida.push([m[1]]);
    re.lastIndex = m.index + 1;
  }
}

export function nomesNoTexto(texto) {
  const t = String(texto == null ? '' : texto);
  const saida = [];
  const pt = [NAO_NOME], es = [NAO_NOME_ES, NAO_NOME], en = [NAO_NOME_EN, NAO_NOME];
  coletarPares(RE_NOME, t, pt, saida);
  coletarPares(RE_NOME_VERBO, t, pt, saida);
  coletarPares(RE_TRAT_C, t, pt, saida);
  coletarComIdade(RE_NOME_IDADE, t, [NAO_NOME, NAO_NOME_IDADE], saida);
  coletarPares(RE_NOME_ES, t, es, saida);
  coletarPares(RE_NOME_VERBO_ES, t, es, saida);
  coletarPares(RE_TRAT_ES_C, t, es, saida);
  coletarComIdade(RE_NOME_IDADE_ES, t, [NAO_NOME_ES, NAO_NOME, NAO_NOME_IDADE], saida);
  coletarPares(RE_NOME_EN, t, en, saida);
  coletarPares(RE_EU_SOU_EN, t, en, saida);
  coletarPares(RE_NOME_VERBO_EN, t, en, saida);
  coletarPares(RE_TRAT_EN_C, t, en, saida);
  coletarComIdade(RE_NOME_IDADE_EN, t, [NAO_NOME_EN, NAO_NOME, NAO_NOME_IDADE_EN], saida);
  // Nome em CAIXA ALTA: lê a versão "suave" ("MARIA DA SILVA" -> "Maria da Silva"); a troca depois ignora maiúsculas.
  if (/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\s+(?:D[AEO]S?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(t)) {
    const suave = t.replace(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }).replace(/\bD([AEO]S?)\b/g, function (m) { return m.toLowerCase(); });
    coletarPares(RE_NOME_VERBO, suave, pt, saida);
    coletarPares(RE_NOME, suave, pt, saida);
  }
  // Nome em minúsculas depois de gatilho forte: acha na versão sem acento e devolve as palavras como foram escritas (mesma posição).
  const x = semAcentoMin(t);
  if (x.length === t.length) {
    RE_NOME_MINUSCULO.lastIndex = 0;
    let m;
    while ((m = RE_NOME_MINUSCULO.exec(x)) !== null) {
      if (![m[1], m[2]].some(function (w) { return NAO_NOME.has(w) || NAO_NOME_MINUSCULO.has(w); })) {
        const fim = m.index + m[0].length;
        const p2 = fim - m[2].length;
        const p1 = x.lastIndexOf(m[1], p2 - 1);
        if (p1 >= m.index) saida.push([t.slice(p1, p1 + m[1].length), t.slice(p2, fim)]);
      }
      RE_NOME_MINUSCULO.lastIndex = m.index + 1;
    }
  }
  return saida;
}

// Nome próprio solto ("A Maria Souza, CPF 123..., faltou"): 2 a 5 palavras com inicial maiúscula seguidas. Mais largo que o filtro, por isso só
// serve DEPOIS que a mensagem já tem dado de pessoa (CPF ou nome reconhecido): trocar a mais por um marcador só piora a resposta, deixar passar vaza.
// Não vale: sigla de lugar/instituição antes ("CRAS Cristiana Vicente Nunes", "Rua Pedro Rodrigues") nem palavras de NAO_NOME.
const INSTITUICAO_ANTES = new Set('cras creas caps ubs upa escola colegio creche hospital posto rua avenida av travessa praca bairro conjunto residencial unidade centro conselho secretaria delegacia igreja ong associacao'.split(' '));
const RE_PROPRIO = new RegExp(FORA + '([' + CAP + '][' + MIN_L + ']{2,}(?:\\s+(?:d[aeo]s?\\s+)?[' + CAP + '][' + MIN_L + ']{2,}){1,4})(?![A-Za-zÀ-ÿ])', 'g');
export function nomesProprios(texto) {
  const t = String(texto == null ? '' : texto);
  const saida = [];
  RE_PROPRIO.lastIndex = 0;
  let m;
  while ((m = RE_PROPRIO.exec(t)) !== null) {
    const grupo = m[1];
    const ini = m.index + m[0].length - grupo.length;
    const palavras = grupo.split(/\s+/).filter(function (w) { return !/^d[aeo]s?$/.test(w); });
    while (palavras.length > 1 && /^(?:dona|dna|sr|sra|seu|senhora?|don|dona|mr|mrs|ms|miss)\.?$/i.test(palavras[0])) palavras.shift();
    const antes = t.slice(Math.max(0, ini - 24), ini).trim().split(/\s+/).pop() || '';
    const barrado = INSTITUICAO_ANTES.has(semAcentoMin(antes.replace(/[^A-Za-zÀ-ÿ]/g, ''))) || palavras.some(function (w) { const n = semAcentoMin(w); return NAO_NOME.has(n) || INSTITUICAO_ANTES.has(n); });
    if (!barrado && palavras.length > 1) saida.push(palavras);
    RE_PROPRIO.lastIndex = m.index + m[0].length - 1 > m.index ? m.index + m[0].length - 1 : m.index + 1;
  }
  return saida;
}

export function limparMarcacao(texto) {
  // tira <tag> e </tag>, inclusive com atributos, para a pergunta não fechar/abrir blocos do prompt.
  // Repete até estabilizar: numa passada só, "<</normas>/normas>" viraria "</normas>" depois da limpeza.
  let atual = String(texto == null ? '' : texto);
  for (let i = 0; i < 20; i++) {
    const novo = atual.replace(/<\/?[A-Za-z][^<>]{0,40}>/g, '');
    if (novo === atual) break;
    atual = novo;
  }
  return atual.trim();
}
