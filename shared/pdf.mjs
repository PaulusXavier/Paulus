// Edição de PDF do Paulus: lê o pedido em português e edita o arquivo NO APARELHO. Sem IA, sem rede para o arquivo e sem enviar nada a servidor.
//
// Por que existe: o PDF da pessoa (ficha, declaração, relatório) pode ter dado de família. Por isso ele nunca vai ao Worker nem à IA:
// o programa lê o pedido ("juntar os PDFs", "remover a página 2", "preencher o campo 'Nome' com 'Maria'"), a biblioteca pdf-lib edita
// o arquivo aqui mesmo e o app entrega o resultado para baixar. A IA só explica como pedir (habilidade pdf-editar-no-aparelho).
//
//   lerPedidoDePdf(texto, { temArquivo })   -> { operacoes, naoSuporta, saida } ou null (não é pedido de edição de PDF; a pergunta segue o caminho normal)
//   editarPdf(operacoes, arquivos, opcoes)  -> Promise<{ ok, texto, arquivos, avisos, campos }>   (opcoes.PDFLib = a biblioteca pdf-lib)
//   respostaDePdf(texto, arquivos, opcoes)  -> Promise<resultado | null>   (lê o pedido e, havendo arquivo, edita)
//   resolverPaginasPdf(spec, total)         -> { indices, erro }   (páginas escritas em português, 0-based)
//   listaPaginasPdf([1,2,3,5]) -> "1 a 3 e 5"
//
// arquivos: [{ nome, bytes: Uint8Array | ArrayBuffer }]. Aceita PDF, JPG e PNG (imagem vira página, ou carimbo se o pedido for de carimbo/assinatura).
//
// O que faz: juntar, dividir, extrair, remover, girar, inverter/reordenar, numerar páginas, marca d'água, escrever texto, carimbar imagem,
// preencher e marcar campos de formulário, achatar formulário, título/autor, listar campos, informações do arquivo, imagens em PDF.
// O que NÃO faz (e diz): alterar o texto que já está no PDF, tarjar de verdade, comprimir, OCR, senha, assinatura digital.
// Texto novo usa a fonte Helvetica (acentos do português funcionam; símbolos fora do alfabeto latino viram "?").
// Sem lookbehind e sem BigInt de propósito (Safari/iOS antigos quebram o arquivo inteiro). Nomes com "pdf" por causa do arquivo único do navegador.

const PDF_MAX_ARQUIVOS = 30;
const PDF_MAX_BYTES = 150 * 1048576;
const PDF_MAX_PAGINAS = 3000;
const PDF_MAX_PARTES = 200;
const PDF_MARGEM = 28;

const PDF_VERBOS = 'remov|exclu|apag|retir|elimin|descart|tire|tirar|gir|rotacion|vire|virar|numer|pagin|coloc|escrev|insir|adicion|inclu|marc|desmarc|carimb|preench|complet|achat|invert|reorden|mov|extra|separ|dividi|fatie|junt|unir|une |mescl|combin|defin|troc|mud|alter|salv|anot|aplic|renome|converta|transform|assin';

const PDF_COR = {
  preto: [0, 0, 0], preta: [0, 0, 0], vermelho: [0.8, 0.1, 0.1], vermelha: [0.8, 0.1, 0.1], azul: [0.1, 0.25, 0.75],
  verde: [0.05, 0.5, 0.2], cinza: [0.45, 0.45, 0.45], laranja: [0.9, 0.45, 0.05], roxo: [0.4, 0.15, 0.6]
};

const PDF_NAO_SUPORTA = {
  tarja: 'Tarjar (cobrir dado sensível) eu ainda não faço com segurança: um retângulo por cima não apaga o texto que está embaixo, e quem abrir o arquivo consegue copiá-lo. Para sigilo de verdade, tarje no arquivo de origem (Word, Verbus) e gere o PDF de novo, ou imprima e digitalize.',
  texto: 'Não consigo alterar o texto que já está dentro do PDF: ele guarda letras posicionadas, não parágrafos. Eu posso escrever um texto novo por cima, preencher campos de formulário, numerar, carimbar e mexer nas páginas. Para mudar o conteúdo, corrija no arquivo de origem (Word, Verbus) e gere o PDF de novo.',
  comprimir: 'Comprimir ou reduzir o tamanho do PDF eu ainda não faço aqui. Dá para gerar de novo com qualidade menor no programa de origem, ou usar um compressor offline.',
  senha: 'Não crio nem removo senha de PDF. Se o arquivo é seu e tem senha, abra no leitor com a senha e salve uma cópia (Imprimir > Salvar como PDF); aí eu edito a cópia.',
  ocr: 'Não faço OCR (reconhecer o texto de um PDF escaneado) nem leio o conteúdo do PDF.',
  assinatura: 'Assinatura digital com certificado eu não faço. Posso colocar a imagem de uma assinatura escaneada na página ("colocar a assinatura no canto inferior direito da última página", anexando a imagem), mas isso é só uma imagem e não tem validade de certificado digital.',
  branco: 'Ainda não sei achar páginas em branco sozinha. Diga quais páginas remover, por exemplo: "remover as páginas 3 e 7".',
  converter: 'Converter PDF para Word, Excel ou imagem eu não faço; eu edito PDFs. O contrário funciona: fotos JPG e PNG viram PDF.'
};

// ------------------------------------------------------------------ texto

// Minúsculas e sem acento, MESMO comprimento do original (para fatiar o original pelos índices do normalizado).
function pdfNorm(s) {
  const t = String(s == null ? '' : s);
  let o = '';
  for (let i = 0; i < t.length; i++) o += t.charAt(i).normalize('NFD').charAt(0).toLowerCase();
  return o;
}

// Texto entre aspas vira §0§, §1§... (o que vai escrito no PDF é sempre o que a pessoa pôs entre aspas, nunca adivinhado).
function pdfTirarAspas(texto) {
  const citados = [];
  const t = String(texto == null ? '' : texto).replace(/["“”«»]([^"“”«»]{1,400})["“”«»]|(^|[\s(:])'([^']{1,400})'(?=[\s.,;:)!?]|$)/g, function (m, a, pre, b) {
    citados.push(a != null ? a : b);
    return (pre || '') + '§' + (citados.length - 1) + '§';
  });
  return { texto: t, citados: citados };
}

function pdfDevolver(s, citados) {
  return String(s).replace(/§(\d+)§/g, function (m, i) { return citados[+i] != null ? citados[+i] : ''; });
}

function pdfNumero(w) {
  const t = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
  return /^\d+$/.test(w) ? +w : (t[w] || 0);
}

function pdfNome(s) {
  const t = String(s || 'documento').replace(/^.*[\\/]/, '').replace(/\.(pdf|jpe?g|png)$/i, '');
  const limpo = t.replace(/[^\wÀ-ÿ .()-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return limpo || 'documento';
}

export function listaPaginasPdf(pags) {
  const p = (pags || []).slice().sort(function (a, b) { return a - b; });
  const partes = [];
  let i = 0;
  while (i < p.length) {
    let j = i;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    partes.push(j - i >= 2 ? p[i] + ' a ' + p[j] : p.slice(i, j + 1).join(' e '));
    i = j + 1;
  }
  if (partes.length <= 1) return partes.join('');
  return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

// ------------------------------------------------------------------ páginas

// Lê "páginas 1 a 3 e 5", "última página", "a partir da 4", "pares"... Devolve { itens:[{de,ate}], filtro:'par'|'impar'|'', todas } ou null.
// Número ≤ 0 conta do fim: 0 = última, -1 = penúltima.
export function lerPaginasPdf(n) {
  const itens = [];
  let filtro = '';
  let todas = false;
  if (/\b(todas|todo o (pdf|documento|arquivo)|documento inteiro|arquivo inteiro)\b/.test(n)) todas = true;
  if (/\bpares\b/.test(n)) filtro = 'par'; else if (/\bimpares\b/.test(n)) filtro = 'impar';
  let m = /(?:a partir d[aeo]s?|depois d[aeo]s?|apos)\s*(?:pagina\s*)?(\d+)|(?:pagina\s*)?(\d+)\s*(?:em diante|pra frente|para frente|ate o fim|ate o final)/.exec(n);
  if (m) itens.push({ de: +(m[1] || m[2]), ate: 0 });
  m = /\bate\s+(?:a\s+)?pagina\s*(\d+)/.exec(n);
  if (m && !/\b(?:paginas?|pags?)\s*\d+\s*(?:a|ate|-)\b/.test(n)) itens.push({ de: 1, ate: +m[1] });
  m = /\b(\d+|duas|dois|tres|quatro|cinco)\s+primeiras\s+paginas?\b/.exec(n);
  if (m) itens.push({ de: 1, ate: pdfNumero(m[1]) });
  m = /\b(\d+|duas|dois|tres|quatro|cinco)\s+ultimas\s+paginas?\b|\bultimas?\s+(\d+)\s+paginas?\b/.exec(n);
  if (m) itens.push({ de: 1 - pdfNumero(m[1] || m[2]), ate: 0 });
  m = /\b(primeira|segunda|terceira|quarta|quinta|ultima|penultima)\s+(?:pagina|folha)\b|\b(capa|folha de rosto)\b/.exec(n);
  if (m) {
    const ord = { capa: 1, 'folha de rosto': 1, primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, ultima: 0, penultima: -1 };
    const v = ord[m[1] || m[2]];
    itens.push({ de: v, ate: v });
  }
  const re = /\b(?:paginas?|pags?|folhas?)\s*(?:n[o°º]\s*)?(?=\d|ultima|penultima|primeira)/g;
  let k;
  while ((k = re.exec(n))) {
    const resto = n.slice(re.lastIndex, re.lastIndex + 80);
    const tok = /\s*(?:(\d+)|(ultima|penultima|primeira)|(ate|ao|a|-)|(,|e|;))(?![a-z])/y;
    const seq = [];
    let pos = 0;
    for (;;) {
      tok.lastIndex = pos;
      const t = tok.exec(resto);
      if (!t) break;
      pos = tok.lastIndex;
      if (t[1] != null) seq.push({ v: +t[1] });
      else if (t[2]) seq.push({ v: t[2] === 'ultima' ? 0 : t[2] === 'penultima' ? -1 : 1 });
      else if (t[3]) seq.push({ c: 'a' });
      else seq.push({ c: 'e' });
    }
    let i = 0;
    while (i < seq.length) {
      if (seq[i].v == null) { i++; continue; }
      const de = seq[i].v;
      let j = i + 1;
      let faixa = false;
      while (j < seq.length && seq[j].v == null) { if (seq[j].c === 'a') faixa = true; j++; }
      if (faixa && j < seq.length) { itens.push({ de: de, ate: seq[j].v }); i = j + 1; } else { itens.push({ de: de, ate: de }); i = i + 1; }
    }
  }
  return itens.length || filtro || todas ? { itens: itens, filtro: filtro, todas: todas } : null;
}

// Converte o que a pessoa escreveu em índices (0-based) de um arquivo com "total" páginas. Devolve { indices, erro }.
export function resolverPaginasPdf(spec, total) {
  const conv = function (v) { return v <= 0 ? total + v : v; };
  const out = [];
  const ver = function (v, orig) {
    if (v < 1 || v > total) return 'A página ' + (orig > 0 ? orig : v) + ' não existe: o arquivo tem ' + total + (total === 1 ? ' página.' : ' páginas.');
    return '';
  };
  if (!spec || (!spec.itens.length)) {
    for (let i = 1; i <= total; i++) out.push(i);
  } else {
    for (let k = 0; k < spec.itens.length; k++) {
      const it = spec.itens[k];
      let a = conv(it.de), b = conv(it.ate);
      const e = ver(a, it.de) || ver(b, it.ate);
      if (e) return { indices: [], erro: e };
      if (a > b) { const t = a; a = b; b = t; }
      for (let p = a; p <= b; p++) if (out.indexOf(p) === -1) out.push(p);
    }
  }
  const filtrada = out.filter(function (p) { return !spec || !spec.filtro || (spec.filtro === 'par' ? p % 2 === 0 : p % 2 === 1); });
  return { indices: filtrada.map(function (p) { return p - 1; }), erro: '' };
}

// ------------------------------------------------------------------ pedido

function pdfPosicao(n, padrao) {
  let v = padrao.v, h = padrao.h;
  if (/\b(superior|topo|cabecalho|em cima|parte de cima|alto da pagina)\b/.test(n)) v = 'sup';
  else if (/\b(inferior|rodape|embaixo|em baixo|parte de baixo|fim da pagina|pe da pagina)\b/.test(n)) v = 'inf';
  else if (/\b(no meio|meio da pagina|no centro|centro da pagina)\b/.test(n)) { v = 'meio'; h = 'centro'; }
  if (/\besquerd/.test(n)) h = 'esq';
  else if (/\bdireit/.test(n)) h = 'dir';
  else if (/\bcentralizad|\bao centro|\bno centro|\bno meio|\bcentro\b/.test(n)) h = 'centro';
  return { v: v, h: h };
}

function pdfCor(n) {
  const m = /\b(preto|preta|vermelh[oa]|azul|verde|cinza|laranja|roxo)\b/.exec(n);
  return m ? PDF_COR[m[1]] : null;
}

function pdfTamanho(n, padrao) {
  const m = /tamanho\s*(?:de\s*)?(\d{1,3})|\b(\d{1,3})\s*(?:pt|pontos)\b|fonte\s*(?:de\s*)?(\d{1,3})/.exec(n);
  const v = m ? +(m[1] || m[2] || m[3]) : padrao;
  return Math.max(6, Math.min(200, v));
}

function pdfNegrito(n) { return /\bnegrito\b/.test(n); }

function pdfPartesDe(n) {
  const m = /\bem\s+(\d+|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:partes|arquivos|pedacos|pdfs)\b/.exec(n);
  return m ? pdfNumero(m[1]) : 0;
}

function pdfClausula(o, n, citados) {
  const T = function (re) { return re.test(n); };
  const comAspas = /§\d+§/.test(n);
  const aspas = function () { const r = []; n.replace(/§(\d+)§/g, function (m, i) { r.push(citados[+i]); return m; }); return r; };

  // 1) o que não faz: diz com franqueza em vez de fingir
  if (T(/\b(tarj\w+|censur\w+|ocultar|esconder)\b/) && !T(/\bcampos?\b/)) return { nao: 'tarja' };
  if (T(/\b(comprim\w+|compactar|reduz\w+ (o )?(tamanho|peso)|diminu\w+ (o )?(tamanho|peso)|otimiz\w+ (o )?(pdf|arquivo))/)) return { nao: 'comprimir' };
  if (T(/\b(senha|criptograf\w+)\b/) && !T(/\bcampos?\b/)) return { nao: 'senha' };
  if (T(/\bocr\b|reconhec\w+ (de )?texto|extra\w+ (o )?texto|copiar (o )?texto|\b(ler|leia|resum\w+)\b/)) return { nao: 'ocr' };
  if (T(/assinatura digital|certificado digital|assinar digitalmente|assinar com certificado/)) return { nao: 'assinatura' };
  if (T(/\b(converter|converta|transformar|transforme|exportar|salvar)\b.*\b(em|para|como)\s+(word|docx|excel|xlsx|imagem|jpg|jpeg|png|txt|powerpoint|ppt)\b/)) return { nao: 'converter' };
  if (T(/\bem branco\b/) && T(/\b(remov\w+|exclu\w+|apag\w+|retir\w+|elimin\w+|detect\w+|achar|ache)\b/)) return { nao: 'branco' };

  // 2) metadados: título, autor, assunto, palavras-chave (valor entre aspas)
  if (comAspas && T(/\b(titulo|autor|autora|assunto|palavras? chave)\b/) && !T(/\b(pagina|topo|rodape|canto|cabecalho)\b/)) {
    const meta = {};
    const re = /\b(titulo|autor|autora|assunto|palavras? chave)\b[^§]{0,30}?§(\d+)§/g;
    let m;
    while ((m = re.exec(n))) {
      const k = m[1] === 'titulo' ? 'titulo' : m[1].indexOf('autor') === 0 ? 'autor' : m[1] === 'assunto' ? 'assunto' : 'palavras';
      meta[k] = citados[+m[2]];
    }
    if (Object.keys(meta).length) return { op: 'metadados', meta: meta };
  }

  // 3) olhar sem mexer
  if (!comAspas && T(/\b(list\w+|mostr\w+|quais|ver|exib\w+|quero ver)\b.*\bcampos?\b|\bcampos?\b.*\b(tem|existem|disponiveis|preenchiveis)\b/)) return { op: 'campos' };
  if (T(/quantas paginas|numero de paginas|informac(ao|oes)|propriedades|detalhes d[oa]|que tamanho|inspecion\w+|analis\w+ (o )?(pdf|arquivo)|dados do (pdf|arquivo)/)) return { op: 'info' };

  // 4) juntar
  if (T(/\b(junt\w+|uni[rt]\w*|une|mescl\w+|combin\w+|concaten\w+)\b/) && (T(/\b(pdfs?|arquivos|documentos|fichas|fotos|imagens|paginas|um so|num so|em um|em uma|numa|so arquivo|tudo|todos)\b/) || n.split(' ').length <= 2)) return { op: 'juntar' };
  if (T(/\b(converter|converta|transformar|transforme|gerar|crie|criar|montar|monte|fazer|faca)\b/) && T(/\b(fotos?|imagens?|jpg|jpeg|png|prints?)\b/) && T(/\bpdf\b/)) return { op: 'juntar' };

  // 5) dividir e extrair
  const spec = lerPaginasPdf(n.replace(/§\d+§/g, ' '));
  const temSpec = !!(spec && (spec.itens.length || spec.filtro));
  if (T(/\b(dividi\w*|fatiar|fatie|quebr\w+|particionar|desmembr\w+|picotar)\b/) || (T(/\bseparar?\b|\bseparem?\b|\bseparad\w+\b/) && !temSpec)) {
    const cada = /a cada\s+(\d+|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+paginas?/.exec(n);
    if (cada) return { op: 'dividir', cada: pdfNumero(cada[1]) };
    const partes = pdfPartesDe(n);
    if (partes) return { op: 'dividir', partes: partes };
    if (T(/cada pagina|pagina por pagina|uma por pagina|paginas? individua|uma pagina por arquivo|uma folha por arquivo|todas as paginas|em paginas/)) return { op: 'dividir', cada: 1 };
    const apos = /\b(?:na|depois d[aeo]|apos|a partir d[aeo]|em)\s*(?:pagina\s*)?(\d+)\b/.exec(n);
    if (apos && !/\b(pagina|paginas)\s*\d+\s*(a|ate|-)\s*\d+/.test(n) && (spec == null || spec.itens.length <= 1)) return { op: 'dividir', apos: +apos[1] };
    if (temSpec && spec.itens.length >= 2) return { op: 'dividir', intervalos: spec.itens };
    return { op: 'dividir', cada: 1 };
  }
  if (temSpec && T(/\b(extra\w+|manter|mantenha|ficar so|fique so|deixar so|deixe so|deixar apenas|deixe apenas|salv\w+ (so|apenas|somente)|guardar (so|apenas|somente)|separ\w+|so (as|a|o)|apenas (as|a|o)|somente (as|a|o)|aproveit\w+)\b/)) return { op: 'extrair', spec: spec };

  // 6) remover páginas
  if (T(/\b(remov\w+|exclu\w+|delet\w+|apag\w+|retir\w+|elimin\w+|descart\w+|tir[ae]\w*)\b/) && T(/\b(pagina|paginas|pag|pags|folha|folhas|capa)\b/)) {
    return temSpec ? { op: 'remover', spec: spec } : { op: 'erro', mensagem: 'Diga quais páginas remover, por exemplo: "remover as páginas 2 e 5".' };
  }

  // 7) girar
  if (T(/\b(gir\w+|rotacion\w+|vir[ae]\w*|rode\w*)\b/)) {
    let graus = 90;
    const g = /(?:^|\s)(90|180|270)(?:\s*(?:graus|°|º))?(?=\s|$)/.exec(n);
    if (g) graus = +g[1];
    else if (T(/esquerda|anti.?horario/)) graus = 270;
    else if (T(/cabeca para baixo|de ponta cabeca|meia.?volta/)) graus = 180;
    else if (T(/direita|horario/)) graus = 90;
    if (g && T(/esquerda|anti.?horario/) && graus === 90) graus = 270;
    const sp = lerPaginasPdf(n.replace(/\u00a7\d+\u00a7/g, ' ').replace(/(?:^|\s)(90|180|270)(?:\s*(?:graus|\u00b0|\u00ba))?(?=\s|$)/g, ' '));
    return { op: 'girar', graus: graus, spec: sp && (sp.itens.length || sp.filtro) ? sp : null };
  }

  // 8) reordenar
  if (T(/\binvert\w+\s+(a\s+)?(ordem|paginas)|ordem inversa|de tras (pra|para) frente/)) return { op: 'inverter' };
  const mv = /\bmov\w+\s+(?:a\s+)?pagina\s*(\d+)\s+(?:para|pra|pro)\s+(?:o\s+|a\s+)?(inicio|comeco|topo|fim|final|(?:depois|antes)\s+d[aeo]\s+(?:pagina\s*)?(\d+))/.exec(n);
  if (mv) {
    const alvo = mv[2];
    if (/^(inicio|comeco|topo)$/.test(alvo)) return { op: 'mover', pagina: +mv[1], destino: 'inicio' };
    if (/^(fim|final)$/.test(alvo)) return { op: 'mover', pagina: +mv[1], destino: 'fim' };
    return { op: 'mover', pagina: +mv[1], destino: /^antes/.test(alvo) ? 'antes' : 'depois', ref: +mv[3] };
  }
  const ord = /\b(?:reorden\w+|nova ordem|ordem)\b[^\d]{0,25}((?:\d+\s*(?:,|;|e|-)?\s*){2,})/.exec(n);
  if (ord) {
    const lista = ord[1].split(/[^\d]+/).filter(Boolean).map(Number);
    if (lista.length >= 2) return { op: 'ordem', ordem: lista };
  }

  // 9) numerar páginas
  if (T(/\b(numer\w+|paginar|paginacao|numeracao)\b|coloc\w+ (o )?numero (da|nas|em|de) paginas?/)) {
    const q = aspas()[0];
    let formato = 'Página {n} de {total}';
    if (q) formato = /\{n\}/.test(q) ? q : q + ' {n}';
    else if (T(/\bso (o )?numero\b|apenas (o )?numero|somente (o )?numero|\bsimples\b/)) formato = '{n}';
    const ini = /\b(?:comecand\w+|iniciand\w+|inicie|comece|a partir)\s*(?:em|do|de|no|na)?\s*(?:numero\s*)?(\d+)\b/.exec(n);
    return { op: 'numerar', formato: formato, pos: pdfPosicao(n, { v: 'inf', h: 'centro' }), tamanho: pdfTamanho(n, 10), spec: temSpec ? spec : null, inicio: ini && !/\bpagina\s*\d+/.test(n.slice(Math.max(0, ini.index - 12), ini.index + 14)) ? +ini[1] : 0 };
  }

  // 10) marca d'água
  if (T(/marca\s*d['’]?\s*agua|marca-d|carimbo diagonal|\bmarca\b.*\bdiagonal/)) {
    const q = aspas()[0];
    if (!q) return { op: 'erro', mensagem: 'Escreva o texto da marca d’água entre aspas, por exemplo: marca d’água "CÓPIA".' };
    const op = /(\d{1,3})\s*%/.exec(n);
    return { op: 'marca', texto: q, spec: temSpec ? spec : null, opacidade: op ? Math.max(0.05, Math.min(1, +op[1] / 100)) : 0.18, diagonal: !/\bhorizontal\b/.test(n), cor: pdfCor(n) || [0.5, 0.5, 0.5] };
  }

  // 11) carimbar imagem (assinatura escaneada, logo, selo): o app manda a imagem junto
  const verboColocar = /\b(coloc\w+|insir\w+|adicion\w+|inclu\w+|aplic\w+|carimb\w+|anex\w+|ponha|poe)\b/;
  if (!comAspas && T(verboColocar) && T(/\b(assinatura|carimbo|logo\w*|selo|imagem|foto|rubrica)\b/)) {
    const l = /largura\s*(?:de\s*)?(\d{2,3})|(\d{2,3})\s*(?:pt|pontos)\b/.exec(n);
    return { op: 'imagem', spec: temSpec ? spec : null, pos: pdfPosicao(n, { v: 'inf', h: 'dir' }), largura: l ? +(l[1] || l[2]) : T(/\bgrande\b/) ? 220 : T(/\bpequen/) ? 70 : 130 };
  }

  // 12) preencher campos de formulário (valores sempre entre aspas) e marcar caixas
  if (T(/\b(preench\w+|complet\w+|marc\w+|desmarc\w+|selecion\w+|desselecion\w+)\b/) && !T(/marca\s*d/)) {
    const pares = [];
    const marcas = [];
    const re = /(§\d+§|[a-z0-9][a-z0-9 _.\/-]{0,40}?)\s*(?:=|:|\bcom\b|\bcomo\b|\bpara\b|\bigual a\b|\bsendo\b)\s*(§\d+§)/g;
    let m;
    while ((m = re.exec(n))) {
      let nome = m[1];
      if (nome.charAt(0) !== '§') {
        let ant;
        do { ant = nome; nome = nome.replace(/^(preench\w+|complet\w+|marc\w+|campos?|caixas?|o|a|os|as|e|do|da|de|no|na|em|com|nome do campo|nome)\b\s*/, ''); } while (nome !== ant);
        nome = nome.trim();
        if (!nome && /\bnome\b/.test(m[1])) nome = 'nome';
      }
      const campo = nome.charAt(0) === '§' ? pdfDevolver(nome, citados) : nome;
      if (campo) pares.push({ campo: campo, valor: pdfDevolver(m[2], citados) });
    }
    if (!pares.length && comAspas && T(/\b(marc\w+|desmarc\w+|selecion\w+|desselecion\w+)\b/)) {
      const sim = !T(/\b(desmarc\w+|desselecion\w+)\b/);
      aspas().forEach(function (c) { marcas.push({ campo: c, valor: sim }); });
    }
    if (pares.length || marcas.length) return { op: 'preencher', pares: pares, marcas: marcas, achatar: T(/\b(e|depois)?\s*(achat\w+|trav\w+|bloque\w+)\b/) };
    return { op: 'erro', mensagem: 'Para preencher, escreva o nome do campo e o valor entre aspas, por exemplo: preencher o campo "Nome" com "Maria" e o campo "Cidade" com "Boa Vista". Se não souber os nomes, peça: "listar os campos do PDF".' };
  }

  // 13) achatar (travar o formulário preenchido)
  if (T(/\b(achat\w+|flatten|trav\w+|bloque\w+|fix\w+|congel\w+)\b.*\b(campos?|formulario|ficha|pdf|edicao|preenchimento)\b|nao editavel|somente leitura|so leitura/)) return { op: 'achatar' };

  // 14) escrever um texto novo na página
  if (comAspas && T(/\b(escrev\w+|insir\w+|adicion\w+|coloc\w+|inclu\w+|carimb\w+|anot\w+|digit\w+|imprim\w+|ponha|poe)\b/)) {
    return { op: 'texto', texto: aspas()[0], spec: temSpec ? spec : null, pos: pdfPosicao(n, { v: 'inf', h: 'dir' }), tamanho: pdfTamanho(n, 12), cor: pdfCor(n) || [0, 0, 0], negrito: pdfNegrito(n) };
  }

  // 15) nome do arquivo de saída
  const nm = /\b(?:salv\w+|chame|nome\w*|renome\w+|batiz\w+|intitul\w+)\b[^§]{0,40}\bcomo\s+(§\d+§)|\bcom o nome\s+(§\d+§)/.exec(n);
  if (nm) return { saida: pdfDevolver(nm[1] || nm[2], citados) };

  // 16) mudar o texto existente: não faz
  if (T(/\b(edit\w+|alter\w+|troc\w+|mud\w+|corrig\w+|substitu\w+)\b.*\b(texto|palavra|frase|paragrafo|nome|valor|data|endereco|conteudo)\b/) && !T(/\b(campo|caixa|pagina|autor|titulo)\b/)) return { nao: 'texto' };
  return null;
}

export function lerPedidoDePdf(texto, opcoes) {
  const o = opcoes || {};
  const bruto = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!bruto) return null;
  const sem = pdfTirarAspas(bruto.replace(/\b([pP]ags?)\./g, '$1'));
  const n = pdfNorm(sem.texto);
  // Pergunta sobre o assunto (não é um pedido): segue para a IA, que sabe explicar como pedir.
  if (/^(como|o que|oque|por que|porque|quando|onde|me explique|explique|ensine|existe|e possivel|tem como|qual a diferenca)\b/.test(n)) return null;
  if (/^(voce|vc|consegue|sabe|da pra|da para)\b/.test(n) && !o.temArquivo) return null;
  // Sem arquivo anexado só assume quando a mensagem fala em PDF; com arquivo, o pedido de edição basta.
  if (!o.temArquivo && !/\bpdfs?\b/.test(n)) return null;

  const pts = [];
  const re = new RegExp(';\\s*(?=(?:e\\s+)?(?:' + PDF_VERBOS + '))|\\.\\s*(?=(?:' + PDF_VERBOS + '))|\\b(?:depois|em seguida|logo apos|por fim|e entao)\\b|,\\s*(?=(?:e\\s+)?(?:' + PDF_VERBOS + '))|\\be\\s+(?=(?:tambem\\s+)?(?:' + PDF_VERBOS + '))', 'g');
  let m;
  while ((m = re.exec(n))) { pts.push([m.index, m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; }
  const trechos = [];
  let ini = 0;
  pts.forEach(function (p) { trechos.push([ini, p[0]]); ini = p[1]; });
  trechos.push([ini, n.length]);

  const operacoes = [];
  const naoSuporta = [];
  let saida = null;
  trechos.forEach(function (t) {
    const nn = n.slice(t[0], t[1]).trim();
    if (!nn) return;
    const r = pdfClausula(sem.texto.slice(t[0], t[1]), nn, sem.citados);
    if (!r) return;
    if (r.nao) { if (naoSuporta.indexOf(r.nao) === -1) naoSuporta.push(r.nao); } else if (r.saida) saida = r.saida; else operacoes.push(r);
  });
  if (!operacoes.length && !naoSuporta.length && !saida) return null;
  if (!operacoes.length && saida) operacoes.push({ op: 'copiar' });
  return { operacoes: operacoes, naoSuporta: naoSuporta, saida: saida, avisosDoPedido: naoSuporta.map(function (c) { return PDF_NAO_SUPORTA[c] || ''; }).filter(Boolean) };
}

// ------------------------------------------------------------------ edição (pdf-lib)

function pdfErro(msg) { const e = new Error(msg); e.pdf = true; return e; }

function pdfBytes(b) {
  if (b instanceof Uint8Array) return b;
  if (b && typeof b.byteLength === 'number') return new Uint8Array(b);
  throw pdfErro('Não consegui ler o arquivo.');
}

function pdfTipoDe(b) {
  const n = Math.min(b.length, 1024);
  let ini = '';
  for (let i = 0; i < n; i++) ini += String.fromCharCode(b[i]);
  if (ini.indexOf('%PDF-') !== -1) return 'pdf';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return '';
}

function pdfKb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

// Letra que a fonte padrão do PDF não tem vira "?" em vez de derrubar o arquivo.
function pdfSeguro(fonte, texto) {
  let out = '';
  Array.from(String(texto).replace(/[\r\n\t]+/g, ' ')).forEach(function (ch) {
    try { fonte.encodeText(ch); out += ch; } catch (e) { out += '?'; }
  });
  return out;
}

// A página pode estar girada: tudo é desenhado no sistema "visual" (como a pessoa vê) e convertido para as coordenadas reais da página.
function pdfCaixa(page) {
  const cb = page.getCropBox ? page.getCropBox() : page.getMediaBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const w = cb.width, h = cb.height;
  return { x0: cb.x, y0: cb.y, w: w, h: h, rot: rot, vw: rot % 180 ? h : w, vh: rot % 180 ? w : h };
}

function pdfParaCru(c, vx, vy) {
  if (c.rot === 90) return { x: c.x0 + c.w - vy, y: c.y0 + vx };
  if (c.rot === 180) return { x: c.x0 + c.w - vx, y: c.y0 + c.h - vy };
  if (c.rot === 270) return { x: c.x0 + vy, y: c.y0 + c.h - vx };
  return { x: c.x0 + vx, y: c.y0 + vy };
}

function pdfPonto(c, pos, larg, alt) {
  const vx = pos.h === 'esq' ? PDF_MARGEM : pos.h === 'centro' ? (c.vw - larg) / 2 : c.vw - PDF_MARGEM - larg;
  const vy = pos.v === 'inf' ? PDF_MARGEM : pos.v === 'sup' ? c.vh - PDF_MARGEM - alt : (c.vh - alt) / 2;
  return { vx: vx, vy: vy };
}

async function pdfFonte(L, d, negrito) {
  const k = negrito ? 'fonteN' : 'fonteR';
  if (!d[k]) d[k] = await d.doc.embedFont(negrito ? L.StandardFonts.HelveticaBold : L.StandardFonts.Helvetica);
  return d[k];
}

function pdfDataHoje(agora) {
  const x = agora instanceof Date ? agora : new Date();
  const p = function (v) { return (v < 10 ? '0' : '') + v; };
  return p(x.getDate()) + '/' + p(x.getMonth() + 1) + '/' + x.getFullYear();
}

function pdfIndices(L, d, spec, padrao) {
  const total = d.doc.getPageCount();
  if (!spec) return padrao === 'ultima' ? [total - 1] : padrao === 'primeira' ? [0] : resolverPaginasPdf(null, total).indices;
  const r = resolverPaginasPdf(spec, total);
  if (r.erro) throw pdfErro((d.multi ? d.nome + ': ' : '') + r.erro);
  if (!r.indices.length) throw pdfErro('Nenhuma página combina com o pedido (' + (spec.filtro === 'par' ? 'pares' : spec.filtro === 'impar' ? 'ímpares' : 'as páginas pedidas') + ').');
  return r.indices;
}

async function pdfCopiar(L, d, ordem) {
  const novo = await L.PDFDocument.create();
  const cp = await novo.copyPages(d.doc, ordem);
  cp.forEach(function (p) { novo.addPage(p); });
  try { const t = d.doc.getTitle(), a = d.doc.getAuthor(); if (t) novo.setTitle(t); if (a) novo.setAuthor(a); } catch (e) { /* sem metadados */ }
  return novo;
}

function pdfTemCampos(d) {
  try { return d.doc.getForm().getFields().length; } catch (e) { return 0; }
}

function pdfTipoCampo(L, f) {
  if (L.PDFTextField && f instanceof L.PDFTextField) return 'texto';
  if (L.PDFCheckBox && f instanceof L.PDFCheckBox) return 'caixa de marcar';
  if (L.PDFRadioGroup && f instanceof L.PDFRadioGroup) return 'escolha única';
  if (L.PDFDropdown && f instanceof L.PDFDropdown) return 'lista suspensa';
  if (L.PDFOptionList && f instanceof L.PDFOptionList) return 'lista';
  if (L.PDFButton && f instanceof L.PDFButton) return 'botão';
  if (L.PDFSignature && f instanceof L.PDFSignature) return 'assinatura';
  return 'campo';
}

function pdfChave(s) { return pdfNorm(s).replace(/[^a-z0-9]+/g, ' ').trim(); }

function pdfAcharCampo(campos, consulta) {
  const q = pdfChave(consulta);
  if (!q) return { campo: null, motivo: 'nenhum' };
  const lista = campos.map(function (f) { return { f: f, k: pdfChave(f.getName()) }; });
  const exato = lista.filter(function (x) { return x.k === q; });
  if (exato.length === 1) return { campo: exato[0].f };
  const aprox = lista.filter(function (x) { return x.k && q.length >= 2 && (x.k.indexOf(q) !== -1 || (x.k.length >= 3 && q.indexOf(x.k) !== -1)); });
  if (aprox.length === 1) return { campo: aprox[0].f };
  if (aprox.length > 1 || exato.length > 1) return { campo: null, motivo: 'varios', opcoes: (aprox.length ? aprox : exato).map(function (x) { return x.f.getName(); }) };
  return { campo: null, motivo: 'nenhum' };
}

function pdfSim(v) { return /^(sim|s|x|true|1|marcad[oa]|ok|yes|check\w*)$/i.test(String(v).trim()); }
function pdfNao(v) { return /^(nao|não|n|false|0|desmarcad[oa]|no|vazio|uncheck\w*)$/i.test(String(v).trim()); }

function pdfOpcaoDe(opcoes, valor) {
  const q = pdfChave(valor);
  const ex = opcoes.filter(function (x) { return pdfChave(x) === q; });
  if (ex.length) return ex[0];
  const ap = opcoes.filter(function (x) { const k = pdfChave(x); return k && q && (k.indexOf(q) !== -1 || q.indexOf(k) !== -1); });
  return ap.length === 1 ? ap[0] : '';
}

function pdfPreencher(L, d, op, rel) {
  const form = d.doc.getForm();
  const campos = form.getFields();
  if (!campos.length) throw pdfErro((d.multi ? d.nome + ': ' : '') + 'Este PDF não tem campos de formulário preenchíveis. Eu consigo escrever um texto em qualquer ponto da página: escreva "texto" entre aspas e diga onde (ex.: escrever "Maria" no topo da página 1).');
  const feitos = [];
  const marcados = [];
  const pendencias = [];
  const nomes = function () { return campos.map(function (f) { return f.getName(); }).slice(0, 15).join(', ') + (campos.length > 15 ? '…' : ''); };
  (op.pares || []).concat((op.marcas || []).map(function (m) { return { campo: m.campo, valor: m.valor ? 'sim' : 'não', marca: true }; })).forEach(function (par) {
    const a = pdfAcharCampo(campos, par.campo);
    let f = a.campo;
    let opcaoDireta = '';
    if (!f && par.marca) {
      // "marcar 'Sim'": pode ser a opção de um grupo de escolha única ou de uma lista
      campos.forEach(function (c) {
        if (f || !((L.PDFRadioGroup && c instanceof L.PDFRadioGroup) || (L.PDFDropdown && c instanceof L.PDFDropdown) || (L.PDFOptionList && c instanceof L.PDFOptionList))) return;
        const opc = pdfOpcaoDe(c.getOptions(), par.campo);
        if (opc) { f = c; opcaoDireta = opc; }
      });
    }
    if (!f) {
      pendencias.push(a.motivo === 'varios' ? 'O campo "' + par.campo + '" combina com mais de um (' + a.opcoes.slice(0, 6).join(', ') + '). Use o nome completo.' : 'Não achei o campo "' + par.campo + '". Campos deste PDF: ' + nomes() + '.');
      return;
    }
    const tipo = pdfTipoCampo(L, f);
    try {
      if (tipo === 'texto') {
        if (par.marca) { pendencias.push('"' + par.campo + '" é um campo de texto, não uma caixa de marcar.'); return; }
        try { f.setText(par.valor); } catch (e1) {
          if (/max|length|exceed/i.test(String(e1 && e1.message))) { pendencias.push('O valor de "' + f.getName() + '" é maior do que o campo aceita.'); return; }
          f.setText(Array.from(String(par.valor)).map(function (ch) { try { return ch.charCodeAt(0) < 256 ? ch : '?'; } catch (e2) { return '?'; } }).join(''));
        }
      } else if (tipo === 'caixa de marcar') {
        if (pdfNao(par.valor)) f.uncheck(); else if (pdfSim(par.valor) || par.marca) f.check(); else { pendencias.push('Para a caixa "' + f.getName() + '" use "sim" ou "não".'); return; }
      } else if (tipo === 'escolha única' || tipo === 'lista suspensa' || tipo === 'lista') {
        const opc = opcaoDireta || pdfOpcaoDe(f.getOptions(), par.valor);
        if (!opc) { pendencias.push('"' + par.valor + '" não é uma opção de "' + f.getName() + '". Opções: ' + f.getOptions().slice(0, 10).join(', ') + '.'); return; }
        f.select(opc);
      } else { pendencias.push('O campo "' + f.getName() + '" é do tipo ' + tipo + ' e eu não preencho esse tipo.'); return; }
      feitos.push(f.getName());
      if (tipo !== 'texto') marcados.push(f.getName());
    } catch (e) {
      pendencias.push('Não consegui preencher "' + par.campo + '"' + (e && e.message ? ' (' + String(e.message).slice(0, 80) + ')' : '') + '.');
    }
  });
  const textos = feitos.filter(function (x) { return marcados.indexOf(x) === -1; });
  const pre = d.multi ? d.nome + ': ' : '';
  if (textos.length) rel.feito.push(pre + 'Preenchi ' + (textos.length === 1 ? 'o campo ' : 'os campos ') + textos.join(', ') + '.');
  if (marcados.length) rel.feito.push(pre + 'Marquei/escolhi ' + marcados.join(', ') + '.');
  pendencias.forEach(function (p) { rel.avisos.push(p); });
  if (!feitos.length) throw pdfErro(pendencias.join(' ') || 'Não consegui preencher nenhum campo.');
}

function pdfListarCampos(L, d, rel) {
  const campos = d.doc.getForm().getFields();
  const linhas = campos.map(function (f) {
    let extra = '';
    try { if (/escolha|lista/.test(pdfTipoCampo(L, f))) extra = ' (opções: ' + f.getOptions().slice(0, 8).join(', ') + ')'; } catch (e) { /* sem opções */ }
    return f.getName() + ' [' + pdfTipoCampo(L, f) + ']' + extra;
  });
  rel.campos.push({ arquivo: d.nome, campos: linhas });
  rel.leitura.push((d.multi ? d.nome + ': ' : '') + (campos.length ? 'campos preenchíveis (' + campos.length + '): ' + linhas.join('; ') + '.' : 'não tem campos de formulário preenchíveis.'));
}

function pdfInformar(d, bytes, rel) {
  const n = d.doc.getPageCount();
  const p = d.doc.getPage(0).getSize();
  const mm = function (v) { return Math.round(v * 25.4 / 72); };
  const a4 = Math.abs(p.width - 595) < 4 && Math.abs(p.height - 842) < 4;
  const carta = Math.abs(p.width - 612) < 4 && Math.abs(p.height - 792) < 4;
  let t = (d.multi ? d.nome + ': ' : '') + n + (n === 1 ? ' página' : ' páginas') + ', ' + (a4 ? 'A4' : carta ? 'Carta' : mm(p.width) + ' × ' + mm(p.height) + ' mm') + ', ' + pdfKb(bytes) + ', ' + pdfTemCampos(d) + ' campo(s) de formulário';
  try { if (d.doc.getTitle()) t += ', título "' + d.doc.getTitle() + '"'; if (d.doc.getAuthor()) t += ', autor "' + d.doc.getAuthor() + '"'; } catch (e) { /* sem metadados */ }
  rel.leitura.push(t + '.');
}

async function pdfAplicar(L, op, ctx) {
  const docs = ctx.docs, rel = ctx.rel, o = ctx.o;
  const dizer = function (d, t) { rel.feito.push((d.multi ? d.nome + ': ' : '') + t); };
  const marcar = function (d, s) { if (d.sufixos.indexOf(s) === -1) d.sufixos.push(s); };

  if (op.op === 'copiar' || op.op === 'erro') {
    if (op.op === 'erro') throw pdfErro(op.mensagem);
    return;
  }
  if (op.op === 'juntar') {
    const novo = await L.PDFDocument.create();
    let pags = 0, arqs = 0, comCampos = 0;
    for (let i = 0; i < ctx.fontes.length; i++) {
      const f = ctx.fontes[i];
      if (f.tipo === 'pdf') {
        const d = docs.filter(function (x) { return x.fonte === f; })[0];
        if (!d) continue;
        if (pdfTemCampos(d)) comCampos++;
        const cp = await novo.copyPages(d.doc, d.doc.getPageIndices());
        cp.forEach(function (p) { novo.addPage(p); });
        pags += cp.length; arqs++;
      } else if (!ctx.estampa) {
        await pdfPaginaDeImagem(L, novo, f);
        pags++; arqs++;
      }
    }
    if (arqs < 2 && !ctx.fontes.some(function (f) { return f.tipo !== 'pdf'; })) throw pdfErro('Para juntar, anexe dois ou mais PDFs (ou fotos).');
    const base = docs.length ? docs[0].nome : 'documento';
    ctx.docs = [{ nome: base, doc: novo, sufixos: ['-unido'], multi: false, fonte: null, juntado: true }];
    rel.feito.push('Juntei ' + arqs + (arqs === 1 ? ' arquivo' : ' arquivos') + ' em um só (' + pags + (pags === 1 ? ' página' : ' páginas') + ').');
    if (comCampos) rel.avisos.push('Ao juntar, os campos de formulário preenchíveis podem deixar de ser editáveis no arquivo final. Se for preencher, preencha antes de juntar ou peça para achatar.');
    return;
  }
  if (op.op === 'dividir') {
    const novos = [];
    for (let k = 0; k < docs.length; k++) {
      const d = docs[k];
      const total = d.doc.getPageCount();
      let blocos = [];
      if (op.cada) { for (let i = 0; i < total; i += op.cada) blocos.push(pdfFaixa(i, Math.min(total, i + op.cada))); }
      else if (op.partes) { const tam = Math.ceil(total / op.partes); for (let i = 0; i < total; i += tam) blocos.push(pdfFaixa(i, Math.min(total, i + tam))); }
      else if (op.apos) {
        if (op.apos < 1 || op.apos >= total) throw pdfErro('Para dividir depois da página ' + op.apos + ', o arquivo precisa ter mais páginas (tem ' + total + ').');
        blocos = [pdfFaixa(0, op.apos), pdfFaixa(op.apos, total)];
      } else if (op.intervalos) {
        for (let i = 0; i < op.intervalos.length; i++) {
          const r = resolverPaginasPdf({ itens: [op.intervalos[i]], filtro: '' }, total);
          if (r.erro) throw pdfErro(r.erro);
          blocos.push(r.indices);
        }
      }
      if (blocos.length > PDF_MAX_PARTES) throw pdfErro('Isso daria mais de ' + PDF_MAX_PARTES + ' arquivos. Divida em partes maiores.');
      if (blocos.length < 2) { rel.avisos.push((d.multi ? d.nome + ': ' : '') + 'O arquivo não tem páginas suficientes para dividir assim; mantive inteiro.'); novos.push(d); continue; }
      for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        const nd = await pdfCopiar(L, d, b);
        const sufixo = op.intervalos || op.apos ? '-p' + (b[0] + 1) + (b.length > 1 ? '-' + (b[b.length - 1] + 1) : '') : '-parte-' + (i + 1);
        novos.push({ nome: d.nome, doc: nd, sufixos: [sufixo], multi: true, fonte: null, parte: true });
      }
      dizer(d, 'Dividi em ' + blocos.length + ' arquivos.');
      if (pdfTemCampos(d)) rel.avisos.push('Ao dividir, os campos de formulário preenchíveis podem deixar de ser editáveis nas partes.');
    }
    ctx.docs = novos;
    return;
  }
  for (let k = 0; k < docs.length; k++) {
    const d = docs[k];
    const total = d.doc.getPageCount();
    if (op.op === 'extrair') {
      const idx = pdfIndices(L, d, op.spec);
      const cresc = idx.every(function (v, i) { return i === 0 || v > idx[i - 1]; });
      if (cresc) { for (let i = total - 1; i >= 0; i--) if (idx.indexOf(i) === -1) d.doc.removePage(i); }
      else d.doc = await pdfCopiar(L, d, idx);
      marcar(d, '-paginas-' + listaPaginasPdf(idx.map(function (i) { return i + 1; })).replace(/ e /g, '-e-').replace(/ a /g, '-a-').replace(/, /g, '-'));
      dizer(d, 'Deixei só ' + (idx.length === 1 ? 'a página ' : 'as páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; })) + ' (' + idx.length + ').');
    } else if (op.op === 'remover') {
      const idx = pdfIndices(L, d, op.spec);
      if (idx.length >= total) throw pdfErro('Isso removeria todas as páginas. Se quer só uma parte, use "extrair".');
      idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { d.doc.removePage(i); });
      marcar(d, '-editado');
      dizer(d, 'Removi ' + (idx.length === 1 ? 'a página ' : 'as páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; })) + '. Agora são ' + d.doc.getPageCount() + '.');
    } else if (op.op === 'girar') {
      const idx = pdfIndices(L, d, op.spec);
      idx.forEach(function (i) {
        const p = d.doc.getPage(i);
        p.setRotation(L.degrees((((p.getRotation().angle + op.graus) % 360) + 360) % 360));
      });
      marcar(d, '-girado');
      dizer(d, 'Girei ' + (idx.length === total ? 'todas as páginas' : (idx.length === 1 ? 'a página ' : 'as páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; }))) + ' ' + (op.graus === 90 ? '90° para a direita' : op.graus === 270 ? '90° para a esquerda' : '180°') + '.');
    } else if (op.op === 'inverter' || op.op === 'mover' || op.op === 'ordem') {
      let ordem = pdfFaixa(0, total);
      if (op.op === 'inverter') ordem.reverse();
      else if (op.op === 'mover') {
        const p = op.pagina - 1;
        if (p < 0 || p >= total) throw pdfErro('A página ' + op.pagina + ' não existe: o arquivo tem ' + total + '.');
        ordem.splice(p, 1);
        let pos = op.destino === 'inicio' ? 0 : op.destino === 'fim' ? ordem.length : 0;
        if (op.destino === 'antes' || op.destino === 'depois') {
          const r = op.ref - 1;
          if (r < 0 || r >= total || r === p) throw pdfErro('A página de referência ' + op.ref + ' não serve para esse movimento.');
          const at = ordem.indexOf(r);
          pos = op.destino === 'antes' ? at : at + 1;
        }
        ordem.splice(pos, 0, p);
      } else {
        const o2 = op.ordem.map(function (v) { return v - 1; });
        const ok = o2.length === total && pdfFaixa(0, total).every(function (i) { return o2.indexOf(i) !== -1; });
        if (!ok) throw pdfErro('A nova ordem precisa listar as ' + total + ' páginas, sem repetir nenhuma (ex.: 3, 1, 2).');
        ordem = o2;
      }
      if (pdfTemCampos(d)) rel.avisos.push((d.multi ? d.nome + ': ' : '') + 'Ao reordenar, os campos de formulário preenchíveis podem deixar de ser editáveis.');
      d.doc = await pdfCopiar(L, d, ordem);
      marcar(d, '-reordenado');
      dizer(d, op.op === 'inverter' ? 'Inverti a ordem das páginas.' : op.op === 'mover' ? 'Movi a página ' + op.pagina + ' (' + (op.destino === 'inicio' ? 'para o início' : op.destino === 'fim' ? 'para o fim' : op.destino + ' da página ' + op.ref) + ').' : 'Reordenei as páginas: ' + op.ordem.join(', ') + '.');
    } else if (op.op === 'numerar') {
      const idx = pdfIndices(L, d, op.spec);
      const fonte = await pdfFonte(L, d, false);
      idx.forEach(function (i, j) {
        const page = d.doc.getPage(i);
        const c = pdfCaixa(page);
        const n = (op.inicio || 0) ? op.inicio + j : i + 1;
        const texto = pdfSeguro(fonte, op.formato.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String((op.inicio || 0) ? op.inicio + idx.length - 1 : total)));
        const larg = fonte.widthOfTextAtSize(texto, op.tamanho);
        const pt = pdfPonto(c, op.pos, larg, op.tamanho * 0.75);
        const cru = pdfParaCru(c, pt.vx, pt.vy);
        page.drawText(texto, { x: cru.x, y: cru.y, size: op.tamanho, font: fonte, color: L.rgb(0.15, 0.15, 0.15), rotate: L.degrees(c.rot) });
      });
      marcar(d, '-numerado');
      dizer(d, 'Numerei ' + (idx.length === total ? 'todas as páginas' : (idx.length === 1 ? 'a página ' : 'as páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; }))) + ' no ' + (op.pos.v === 'sup' ? 'topo' : op.pos.v === 'meio' ? 'meio' : 'rodapé') + ', ' + (op.pos.h === 'esq' ? 'à esquerda' : op.pos.h === 'dir' ? 'à direita' : 'ao centro') + ' (modelo "' + op.formato + '").');
    } else if (op.op === 'marca') {
      const idx = pdfIndices(L, d, op.spec);
      const fonte = await pdfFonte(L, d, true);
      const texto = pdfSeguro(fonte, op.texto).slice(0, 60);
      idx.forEach(function (i) {
        const page = d.doc.getPage(i);
        const c = pdfCaixa(page);
        const tw1 = fonte.widthOfTextAtSize(texto, 1) || 1;
        const alvo = op.diagonal ? Math.sqrt(c.vw * c.vw + c.vh * c.vh) * 0.62 : c.vw * 0.8;
        const tam = Math.max(10, Math.min(140, alvo / tw1));
        const tw = tw1 * tam;
        const ang = op.diagonal ? Math.atan2(c.vh, c.vw) : 0;
        const s = tam * 0.3;
        const ax = c.vw / 2 - ((tw / 2) * Math.cos(ang) - s * Math.sin(ang));
        const ay = c.vh / 2 - ((tw / 2) * Math.sin(ang) + s * Math.cos(ang));
        const cru = pdfParaCru(c, ax, ay);
        page.drawText(texto, { x: cru.x, y: cru.y, size: tam, font: fonte, color: L.rgb(op.cor[0], op.cor[1], op.cor[2]), opacity: op.opacidade, rotate: L.degrees(c.rot + ang * 180 / Math.PI) });
      });
      marcar(d, '-marca-dagua');
      dizer(d, 'Coloquei a marca d’água "' + texto + '" em ' + (idx.length === total ? 'todas as páginas' : (idx.length === 1 ? 'a página ' : 'as páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; }))) + '.');
    } else if (op.op === 'texto') {
      const idx = pdfIndices(L, d, op.spec, 'primeira');
      const fonte = await pdfFonte(L, d, op.negrito);
      idx.forEach(function (i, j) {
        const page = d.doc.getPage(i);
        const c = pdfCaixa(page);
        const texto = pdfSeguro(fonte, op.texto.replace(/\{data\}/g, pdfDataHoje(o.agora)).replace(/\{n\}/g, String(i + 1)).replace(/\{total\}/g, String(total)));
        const larg = fonte.widthOfTextAtSize(texto, op.tamanho);
        const pt = pdfPonto(c, op.pos, larg, op.tamanho * 0.75);
        const cru = pdfParaCru(c, pt.vx, pt.vy);
        page.drawText(texto, { x: cru.x, y: cru.y, size: op.tamanho, font: fonte, color: L.rgb(op.cor[0], op.cor[1], op.cor[2]), rotate: L.degrees(c.rot) });
      });
      marcar(d, '-carimbado');
      dizer(d, 'Escrevi "' + pdfSeguro(fonte, op.texto.replace(/\{data\}/g, pdfDataHoje(o.agora)).replace(/\{n\}/g, String(idx[0] + 1)).replace(/\{total\}/g, String(total))) + '" na ' + (idx.length === 1 ? 'página ' : 'páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; })) + ', ' + (op.pos.v === 'sup' ? 'no topo' : op.pos.v === 'meio' ? 'no meio' : 'no rodapé') + (op.pos.h === 'esq' ? ' à esquerda' : op.pos.h === 'dir' ? ' à direita' : ' ao centro') + '.');
    } else if (op.op === 'imagem') {
      const img = ctx.fontes.filter(function (f) { return f.tipo !== 'pdf'; })[0];
      if (!img) throw pdfErro('Para colocar assinatura, carimbo ou logo, anexe também a imagem (JPG ou PNG) junto com o PDF.');
      const idx = pdfIndices(L, d, op.spec, 'ultima');
      const emb = img.tipo === 'png' ? await d.doc.embedPng(img.bytes) : await d.doc.embedJpg(img.bytes);
      idx.forEach(function (i) {
        const page = d.doc.getPage(i);
        const c = pdfCaixa(page);
        const larg = Math.min(op.largura, c.vw * 0.8);
        const alt = larg * emb.height / emb.width;
        const pt = pdfPonto(c, op.pos, larg, alt);
        const cru = pdfParaCru(c, pt.vx, pt.vy);
        page.drawImage(emb, { x: cru.x, y: cru.y, width: larg, height: alt, rotate: L.degrees(c.rot) });
      });
      marcar(d, '-com-imagem');
      dizer(d, 'Coloquei a imagem na ' + (idx.length === 1 ? 'página ' : 'páginas ') + listaPaginasPdf(idx.map(function (i) { return i + 1; })) + ', ' + (op.pos.v === 'sup' ? 'no topo' : op.pos.v === 'meio' ? 'no meio' : 'no rodapé') + (op.pos.h === 'esq' ? ' à esquerda' : op.pos.h === 'dir' ? ' à direita' : ' ao centro') + (op.spec ? '' : ' (última página, porque você não disse qual)') + '.');
    } else if (op.op === 'preencher') {
      pdfPreencher(L, d, op, rel);
      marcar(d, '-preenchido');
      if (op.achatar) { d.doc.getForm().flatten(); dizer(d, 'Travei o formulário: os campos deixaram de ser editáveis.'); }
    } else if (op.op === 'achatar') {
      if (!pdfTemCampos(d)) throw pdfErro((d.multi ? d.nome + ': ' : '') + 'Este PDF não tem campos de formulário para travar.');
      d.doc.getForm().flatten();
      marcar(d, '-travado');
      dizer(d, 'Travei o formulário: o que estava preenchido ficou fixo no papel, sem edição.');
    } else if (op.op === 'metadados') {
      if (op.meta.titulo != null) d.doc.setTitle(op.meta.titulo);
      if (op.meta.autor != null) d.doc.setAuthor(op.meta.autor);
      if (op.meta.assunto != null) d.doc.setSubject(op.meta.assunto);
      if (op.meta.palavras != null) d.doc.setKeywords(String(op.meta.palavras).split(/\s*[,;]\s*/));
      marcar(d, '-editado');
      dizer(d, 'Atualizei ' + Object.keys(op.meta).map(function (c) { return c === 'palavras' ? 'as palavras-chave' : c === 'titulo' ? 'o título' : 'o ' + c; }).join(' e ') + ' do arquivo.');
    } else if (op.op === 'campos') {
      pdfListarCampos(L, d, rel);
      rel.soLeitura = true;
    } else if (op.op === 'info') {
      pdfInformar(d, d.tamanho, rel);
      rel.soLeitura = true;
    }
  }
}

function pdfFaixa(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }

async function pdfPaginaDeImagem(L, novo, f) {
  const emb = f.tipo === 'png' ? await novo.embedPng(f.bytes) : await novo.embedJpg(f.bytes);
  const paisagem = emb.width > emb.height;
  const W = paisagem ? 841.89 : 595.28, H = paisagem ? 595.28 : 841.89;
  const page = novo.addPage([W, H]);
  const esc = Math.min((W - 40) / emb.width, (H - 40) / emb.height);
  const w = emb.width * esc, h = emb.height * esc;
  page.drawImage(emb, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
}

export async function editarPdf(operacoes, arquivos, opcoes) {
  const o = opcoes || {};
  const L = o.PDFLib;
  const rel = { feito: [], avisos: [], leitura: [], campos: [], soLeitura: false };
  const falha = function (texto) { return { ok: false, texto: texto, arquivos: [], avisos: rel.avisos, campos: rel.campos }; };
  if (!L || !L.PDFDocument) return falha('Não consegui carregar o editor de PDF neste aparelho. Ele baixa uma vez e depois funciona offline; confira a internet e tente de novo.');
  if (!Array.isArray(arquivos) || !arquivos.length) return falha('Anexe o PDF que você quer editar.');
  if (arquivos.length > PDF_MAX_ARQUIVOS) return falha('Muitos arquivos de uma vez (o limite é ' + PDF_MAX_ARQUIVOS + ').');
  const ops = Array.isArray(operacoes) ? operacoes.filter(Boolean) : [];
  const estampa = ops.some(function (x) { return x.op === 'imagem'; });

  const fontes = [];
  let somaBytes = 0;
  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i] || {};
    let bytes;
    try { bytes = pdfBytes(a.bytes); } catch (e) { rel.avisos.push('Não consegui ler "' + (a.nome || 'arquivo') + '".'); continue; }
    somaBytes += bytes.length;
    if (somaBytes > PDF_MAX_BYTES) return falha('Os arquivos somam mais de ' + Math.round(PDF_MAX_BYTES / 1048576) + ' MB; mande menos de uma vez.');
    let tipo = pdfTipoDe(bytes);
    if (!tipo && typeof o.converterImagem === 'function') {
      try { const conv = await o.converterImagem(bytes, a); if (conv) { bytes = pdfBytes(conv); tipo = pdfTipoDe(bytes); } } catch (e) { /* segue sem converter */ }
    }
    if (!tipo) { rel.avisos.push('Ignorei "' + (a.nome || 'arquivo') + '": só trabalho com PDF, JPG e PNG.'); continue; }
    const f = { nome: pdfNome(a.nome), tipo: tipo, bytes: bytes };
    if (tipo === 'pdf') {
      try { f.doc = await L.PDFDocument.load(bytes, { updateMetadata: false }); } catch (e) {
        const msg = String(e && e.message || '');
        rel.avisos.push(/encrypt/i.test(msg) ? '"' + f.nome + '.pdf" está protegido com senha; abra no leitor com a senha e salve uma cópia sem proteção.' : '"' + f.nome + '.pdf" não abriu: o arquivo pode estar corrompido.');
        continue;
      }
      if (f.doc.getPageCount() > PDF_MAX_PAGINAS) { rel.avisos.push('"' + f.nome + '.pdf" tem páginas demais (' + f.doc.getPageCount() + ').'); continue; }
    }
    fontes.push(f);
  }
  if (!fontes.length) return falha(rel.avisos.join(' ') || 'Não encontrei PDF para editar.');

  const pdfs = fontes.filter(function (f) { return f.tipo === 'pdf'; });
  const imgs = fontes.filter(function (f) { return f.tipo !== 'pdf'; });
  const docs = pdfs.map(function (f) { return { nome: f.nome, doc: f.doc, tamanho: f.bytes.length, sufixos: [], multi: pdfs.length > 1, fonte: f }; });
  const ctx = { docs: docs, fontes: fontes, estampa: estampa, rel: rel, o: o };

  let lista = ops.slice();
  if (!estampa && imgs.length && !lista.some(function (x) { return x.op === 'juntar'; })) {
    if (!pdfs.length) lista.unshift({ op: 'juntar' });
    else rel.avisos.push('Ignorei as imagens anexadas. Para incluí-las no PDF, peça "juntar".');
  }
  if (!lista.length) return falha('Entendi o arquivo, mas não entendi o que fazer com ele. Peça, por exemplo: "remover a página 2", "juntar", "numerar as páginas" ou "listar os campos".');
  if (estampa && !imgs.length) return falha('Para colocar assinatura, carimbo ou logo, anexe também a imagem (JPG ou PNG) junto com o PDF.');
  if (!pdfs.length && estampa) return falha('Anexe também o PDF em que a imagem deve entrar.');

  try {
    for (let i = 0; i < lista.length; i++) await pdfAplicar(L, lista[i], ctx);
  } catch (e) {
    if (e && e.pdf) return falha(e.message);
    return falha('Não consegui concluir a edição (' + String(e && e.message || e).slice(0, 120) + '). O arquivo original não foi alterado.');
  }

  const saidas = [];
  if (!rel.soLeitura || rel.feito.length) {
    const nomeFixo = o.saida ? pdfNome(o.saida) : '';
    for (let i = 0; i < ctx.docs.length; i++) {
      const d = ctx.docs[i];
      let bytes;
      try { bytes = await d.doc.save(); } catch (e) { return falha('Não consegui salvar o resultado (' + String(e && e.message || e).slice(0, 100) + ').'); }
      const suf = d.sufixos.length === 1 ? d.sufixos[0] : d.sufixos.length ? '-editado' : '';
      let nome = nomeFixo ? nomeFixo + (ctx.docs.length > 1 ? (d.sufixos[0] && d.parte ? d.sufixos[0] : '-' + (i + 1)) : '') : d.nome + suf;
      if (!nomeFixo && !suf) nome = d.nome + '-editado';
      saidas.push({ nome: nome + '.pdf', bytes: bytes, tipo: 'application/pdf', paginas: d.doc.getPageCount(), tamanho: bytes.length });
    }
  }

  const linhas = [];
  if (saidas.length) {
    linhas.push(saidas.length === 1 ? 'Pronto: o PDF editado está para baixar.' : 'Pronto: ' + saidas.length + ' arquivos para baixar.');
    rel.feito.forEach(function (t) { linhas.push('- ' + t); });
    saidas.slice(0, 12).forEach(function (s) { linhas.push('Arquivo: ' + s.nome + ' (' + s.paginas + (s.paginas === 1 ? ' página' : ' páginas') + ', ' + pdfKb(s.tamanho) + ')'); });
    if (saidas.length > 12) linhas.push('… e mais ' + (saidas.length - 12) + ' arquivos.');
  }
  rel.leitura.forEach(function (t) { linhas.push(t); });
  rel.avisos.forEach(function (t) { linhas.push('Atenção: ' + t); });
  return { ok: true, texto: linhas.join('\n'), arquivos: saidas, avisos: rel.avisos, campos: rel.campos };
}

// Lê o pedido e, havendo arquivo, edita. Sem arquivo anexado, devolve o que entendeu e pede o PDF. Não é pedido de PDF: null.
export async function respostaDePdf(texto, arquivos, opcoes) {
  const o = opcoes || {};
  const temArquivo = Array.isArray(arquivos) && arquivos.length > 0;
  const pedido = lerPedidoDePdf(texto, { temArquivo: temArquivo });
  if (!pedido) return null;
  const avisosPedido = pedido.avisosDoPedido || [];
  if (!pedido.operacoes.length) {
    return { ok: false, texto: avisosPedido.join('\n\n'), arquivos: [], avisos: [], naoSuporta: pedido.naoSuporta, pedido: pedido };
  }
  if (!temArquivo) {
    return { ok: false, precisaArquivo: true, texto: 'Consigo fazer isso aqui no aparelho, mas preciso do PDF: anexe o arquivo e peça de novo.' + (avisosPedido.length ? '\n\n' + avisosPedido.join('\n\n') : ''), arquivos: [], avisos: [], naoSuporta: pedido.naoSuporta, pedido: pedido };
  }
  const r = await editarPdf(pedido.operacoes, arquivos, Object.assign({}, o, { saida: pedido.saida }));
  if (avisosPedido.length) { r.texto += (r.texto ? '\n\n' : '') + avisosPedido.join('\n\n'); r.avisos = r.avisos.concat(avisosPedido); }
  r.naoSuporta = pedido.naoSuporta;
  r.pedido = pedido;
  return r;
}
