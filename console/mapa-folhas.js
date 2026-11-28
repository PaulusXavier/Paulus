/* Paulus — leitura do ENDEREÇO nas folhas resumo (PDF) e ORDEM DE VISITA.
 *
 * Funções puras (testáveis em Node: `node tests/rota.test.js`). Quem lê o PDF é o pdf.js, carregado sob demanda
 * pelo index.html; aqui só se transforma o texto lido em endereço e se ordena a rota.
 * Nada sai do aparelho: nome, NIS e CPF nem são lidos — só rua, número e bairro.
 */
(function (root) {
  'use strict';

  const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function limpa(s) { return String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;:|_\-–—]+|[\s,;:|_\-–—]+$/g, '').trim(); }

  // "RUA SANTO AGOSTINHO" → "Rua Santo Agostinho"
  function tituloCaso(s) {
    return limpa(s).toLowerCase().split(' ').map((p, i) => {
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.replace(/^(\p{L})/u, m => m.toUpperCase());
    }).join(' ');
  }

  // Itens do pdf.js (cada um com texto e posição) → linhas de texto, de cima para baixo e da esquerda para a direita.
  function linhasDeItens(itens) {
    const lista = (itens || []).filter(it => it && String(it.str || '').trim() !== '' && it.transform)
      .map(it => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }));
    lista.sort((a, b) => b.y - a.y);
    const linhas = [];
    lista.forEach(it => {
      const l = linhas.find(l => Math.abs(l.y - it.y) <= 3);
      if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    });
    linhas.sort((a, b) => b.y - a.y);
    return linhas.map(l => l.itens.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // Rótulos que encerram o valor do campo anterior (ex.: "... SANTO AGOSTINHO Número: 193").
  const ROTULOS = '(?:n[úu]mero|n[º°o]|complemento|bairro|cep|localidade|ponto\\s+de\\s+refer[êe]ncia|refer[êe]ncia|munic[íi]pio|cidade|uf|tipolog|t[íi]tulo(?:\\s+do\\s+logradouro)?|nome(?:\\s+d[oa]\\s+(?:logradouro|rua))?|logradouro|zona|distrito|telefone|nis|cpf|data|c[óo]d(?:igo)?|endere[çc]o)';
  const FIM = '(?=\\s+' + ROTULOS + '\\s*:|$)';

  function pegaRotulo(texto, rotulo) {
    const m = new RegExp('(?:^|[^\\p{L}])(?:' + rotulo + ')\\s*:\\s*(.+?)' + FIM, 'iu').exec(texto);
    return m ? limpa(m[1]) : '';
  }

  const TIPOS = 'rua|r\\.|avenida|av\\.?|travessa|tv\\.?|alameda|estrada|rodovia|beco|pra[çc]a|vicinal|via|passagem|largo|loteamento|conjunto|residencial|quadra|ramal|br[- ]?\\d+';
  const ABREV = { 'r.': 'Rua', 'r': 'Rua', 'av.': 'Avenida', 'av': 'Avenida', 'tv.': 'Travessa', 'tv': 'Travessa' };

  function normalizaTipo(t) { const k = String(t).toLowerCase(); return ABREV[k] || tituloCaso(t); }

  function numeroDe(s) {
    // Cadastro Único preenche o número com zeros à esquerda ("0000000000000046" = 46)
    s = String(s || '').replace(/(^|[^\p{L}\d])0+(?=\d)/gu, '$1');
    const m = /(?:^|[^\p{L}\d])(s\s*\/\s*n|sn|sem\s+n[úu]mero|\d{1,6}[A-Za-z]?)(?![\p{L}\d])/iu.exec(' ' + String(s || ''));
    if (!m) return '';
    return /^s/i.test(m[1]) ? 'S/N' : m[1].toUpperCase();
  }

  // "Rua Santo Agostinho, nº 193 — Centenário" (texto livre) → { rua, numero, bairro }
  function parseEnderecoLivre(txt) {
    const t = limpa(txt);
    if (!t) return null;
    const re = new RegExp('(?:^|[\\s,;(])(' + TIPOS + ')\\s+(.+?)(?:(?:\\s*[,\\-–—]\\s*|\\s+)(?:n[º°o]\\.?|n[úu]mero|num\\.?)?\\s*(s\\s*\\/\\s*n|sn|\\d{1,6}[A-Za-z]?)(?![\\p{L}\\d])(.*)|$)', 'iu');
    const m = re.exec(t);
    if (m) {
      let nome = limpa(m[2]);
      // não confundir "Rua 7 de Setembro, 245": o número da rua faz parte do nome (sem vírgula antes do 245)
      return {
        rua: normalizaTipo(m[1]) + ' ' + tituloCaso(nome),
        numero: m[3] ? numeroDe(m[3]) : '',
        bairro: tituloCaso((m[4] || '').replace(/^[\s,\-–—]*(?:bairro\s*:?)?\s*/i, '').replace(/\bcep\b.*$/i, '').replace(/\b(?:boa vista|rr|roraima)\b.*$/i, ''))
      };
    }
    return null;
  }

  function formata(rua, numero, bairro) {
    return rua + (numero ? ', ' + numero : '') + (bairro ? ' — ' + bairro : '');
  }

  // Lê o endereço a partir das linhas de texto da folha resumo. Devolve null se não achar.
  function extrairEndereco(linhas) {
    let texto = (Array.isArray(linhas) ? linhas.join(' ') : String(linhas || '')).replace(/\s+/g, ' ')
      .replace(/tipo\s+(?:de\s+)?logradouro\s*:/gi, 'TIPOLOG:');
    // Folha Resumo do Cadastro Único: campos numerados ("1.12 - Tipo: AVENIDA 1.13 - Título: 1.14 - Nome: ELDORADO ...").
    // Tira os códigos de item e trata o "Tipo:" solto como tipo de logradouro, para um campo não engolir o seguinte.
    if (texto.indexOf('TIPOLOG:') < 0) {
      texto = texto.replace(/\b\d{1,2}\.\d{2}\s*-?\s*(?=\p{L})/gu, ' ').replace(/\s+/g, ' ')
        .replace(/(^|\s)tipo\s*:/i, '$1TIPOLOG:');
    }

    // 1) campos com rótulo (Tipo de logradouro / Nome / Número / Bairro)
    const tipo = (pegaRotulo(texto, 'tipolog').split(' ')[0] || '');
    let nome = pegaRotulo(texto, 'nome\\s+d[oa]\\s+(?:logradouro|rua)|logradouro');
    if (!nome && tipo) {   // "Tipo de logradouro: RUA Nome: SANTO AGOSTINHO" — só vale o "Nome" que vem depois do tipo
      const apos = texto.slice(texto.indexOf('TIPOLOG:'));
      nome = pegaRotulo(apos, 'nome');
      // "1.12 - Tipo: AVENIDA  1.13 - Título: GENERAL  1.14 - Nome: SAMPAIO" → Avenida General Sampaio.
      // Título vazio ("Título: Nome: ELDORADO") não pode engolir o campo seguinte.
      let titulo = pegaRotulo(apos, 't[íi]tulo');
      if (/[:]/.test(titulo)) titulo = '';
      if (nome && titulo) nome = titulo + ' ' + nome;
    }
    // O OCR de folha escaneada confunde O/o com 0 e l/I com 1 dentro do número do Cadastro Único (16 dígitos).
    const numeroBruto = pegaRotulo(texto, 'n[úu]mero|n[º°o]').replace(/[0-9OolI]{8,}/g, t => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1'));
    let numero = numeroDe(numeroBruto);
    const bairroRot = pegaRotulo(texto, 'bairro|localidade');
    if (nome) {
      const jaTemTipo = new RegExp('^(?:' + TIPOS + ')\\s', 'i').test(nome);
      const rua = jaTemTipo ? normalizaTipo(nome.split(' ')[0]) + ' ' + tituloCaso(nome.split(' ').slice(1).join(' '))
        : (tipo ? normalizaTipo(tipo) + ' ' : '') + tituloCaso(nome);
      const bairro = tituloCaso(bairroRot);
      return { rua, numero, bairro, texto: formata(rua, numero, bairro) };
    }

    // 2) "Endereço: Rua Sete, 245 - Bairro"  /  3) qualquer "Rua ..., 245" solto no texto
    const end = pegaRotulo(texto, 'endere[çc]o') || texto;
    const livre = parseEnderecoLivre(end) || (end !== texto ? parseEnderecoLivre(texto) : null);
    if (livre) {
      const bairro = tituloCaso(bairroRot) || livre.bairro;
      return { rua: livre.rua, numero: numero || livre.numero, bairro, texto: formata(livre.rua, numero || livre.numero, bairro) };
    }
    return null;
  }

  /* ───────────── Várias folhas num PDF só → lista de endereços ───────────── */

  // paginas: [[linhas da página 1], [linhas da página 2], …] (saída de linhasDeItens, uma por página).
  // Lê SÓ o quadro "II - Endereço da família" de cada Folha Resumo: o que vem depois (componentes, nomes, CPF) é descartado
  // antes de qualquer interpretação. A capa e a página "Roteiro de visita" do PDF unificado não contam como folha.
  // Se o PDF não tiver folhas, mas tiver a lista "Roteiro de visita" (1. Rua X, 10 — Bairro · Folha Resumo - …), usa só a parte do endereço.
  // Devolve { enderecos: [texto…] (na ordem do PDF, com repetidos), via: 'folhas' | 'roteiro' | null, folhas: n }.
  function enderecosDeFolhas(paginas) {
    const enderecos = [];
    let folhas = 0;
    (paginas || []).forEach(linhas => {
      // etiquetas de situação impressas na margem ("Alerta", "Bloqueio") podem cair na mesma linha do nome da rua
      linhas = (linhas || []).map(l => String(l).replace(/\s+(?:alerta|bloqueio|bloqueada?|cancelad[oa]|suspens[oa])\s*$/i, ''));
      const ini = linhas.findIndex(l => /ENDERE[ÇC]O\s+DA\s+FAM[ÍI]LIA/i.test(l));
      if (ini < 0 || !linhas.some(l => /FOLHA\s+RESUMO/i.test(l) || /C[óo]digo\s+familiar/i.test(l))) return;
      let fim = linhas.findIndex((l, i) => i > ini && /COMPONENTES\s+DA\s+FAM[ÍI]LIA|Nome\s+Completo|\bCPF\b/i.test(l));
      if (fim < 0) fim = linhas.length;
      folhas++;
      const e = extrairEndereco(linhas.slice(ini, fim));
      if (e && e.rua) enderecos.push(e.texto);
    });
    if (enderecos.length) return { enderecos, via: 'folhas', folhas };
    (paginas || []).forEach(linhas => (linhas || []).forEach(l => {
      const m = /^\s*\d{1,3}\s*[.)]\s+(.+?)\s*[·•|]\s*Folha\b/i.exec(String(l));
      if (m && /\d/.test(m[1])) enderecos.push(limpa(m[1]));
    }));
    return { enderecos, via: enderecos.length ? 'roteiro' : null, folhas };
  }

  // Tira repetidos (mesma rua e número) mantendo a ordem do PDF.
  function enderecosUnicos(lista) {
    const vistos = new Set();
    return (lista || []).filter(t => { const k = semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }

  // Mais de `max` endereços: divide em grupos do mesmo tamanho (10 → 5 + 5), sem sobrar um endereço sozinho.
  function tamanhoDoGrupo(n, max) { max = max || 31; return n <= max ? n : Math.ceil(n / Math.ceil(n / max)); }


  /* ───────────── Ordem de visita ───────────── */

  // Nome da rua sem tipo/acentos, para comparar: "Av. Capitão Ene Garcez" → "capitao ene garcez"
  function chaveRua(rua) {
    return semAcento(rua).toLowerCase().replace(new RegExp('^(?:' + TIPOS + ')\\s+', 'i'), '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function analisa(endereco) {
    const p = parseEnderecoLivre(endereco);
    if (p) { const n = parseInt(p.numero, 10); return { chave: chaveRua(p.rua), num: Number.isFinite(n) ? n : Infinity }; }
    // sem tipo de rua reconhecível: usa o texto até a primeira vírgula/traço
    const t = limpa(endereco);
    const n = parseInt((/(\d{1,6})(?!.*\d)/.exec(t) || [])[1], 10);
    return { chave: chaveRua(t.split(/[,\-–—]/)[0]), num: Number.isFinite(n) ? n : Infinity };
  }

  // Ordena itens ({ endereco }) por rua e depois pelo número do imóvel; a rua de partida vem primeiro.
  // Sem internet e sem mapa: é uma aproximação (ruas vizinhas costumam ter nomes próximos só por acaso).
  function ordenarPorRota(itens, partida) {
    const ruaPartida = analisa(partida || '').chave;
    const dados = itens.map((item, i) => Object.assign({ item, i }, analisa(item.endereco)));
    dados.sort((a, b) => {
      const pa = ruaPartida && a.chave === ruaPartida ? 0 : 1, pb = ruaPartida && b.chave === ruaPartida ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.chave !== b.chave) return a.chave.localeCompare(b.chave, 'pt-BR', { numeric: true });   // "rua 2" antes de "rua 10"
      if (a.num !== b.num) return a.num - b.num;
      return a.i - b.i;
    });
    return dados.map(d => d.item);
  }

  // Remove do texto o que a fonte padrão do PDF (WinAnsi) não sabe desenhar.
  // Texto seguro para o pdf-lib (fonte Helvetica, alfabeto WinAnsi): qualquer caractere fora dele DERRUBA o drawText
  // ("WinAnsi cannot encode"). Antes: deixava passar U+007F–U+009F (controles, não codificáveis), não trocava setas/✓
  // por texto e descartava "…". Agora usa a mesma regra do jsPDF (PaulusTabelas.textoParaPdf) quando o módulo já carregou;
  // senão, o filtro local. Em qualquer caso: sem quebra de linha/tabulação (pdf-lib também não aceita) e sem controles.
  function textoSeguroPdf(s) {
    let t = String(s == null ? '' : s);
    const T = root.PaulusTabelas;
    if (T && typeof T.textoParaPdf === 'function') t = T.textoParaPdf(t);
    return Array.from(t.normalize('NFC')).map(c => {
      const k = c.codePointAt(0);
      if (k === 9 || k === 10 || k === 13) return ' ';
      if (k === 0xA0) return ' ';
      return (k >= 32 && k < 127) || (k >= 0xA1 && k <= 255) || [8211, 8212, 8216, 8217, 8220, 8221, 8226, 8230].includes(k) ? c : '';
    }).join('');
  }

  root.PaulusRotaFolhas = { tituloCaso, linhasDeItens, extrairEndereco, parseEnderecoLivre, chaveRua, ordenarPorRota, textoSeguroPdf, enderecosDeFolhas, enderecosUnicos, tamanhoDoGrupo };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PaulusRotaFolhas;
})(typeof window !== 'undefined' ? window : globalThis);
