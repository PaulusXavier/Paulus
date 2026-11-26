// Leitura de documentos anexados, NO APARELHO (o arquivo não sobe para lugar nenhum; só trechos escolhidos vão à IA, veja shared/documento.mjs).
// Lê: TXT, MD, CSV, TSV, XLSX, DOCX e PDF com texto localmente. PDF escaneado: renderiza até 5 páginas localmente; a IA de visão só recebe após confirmação.
// Foto (JPG, PNG, WebP): imagem(arquivo) a reduz NO APARELHO (lado maior 1280 px, JPEG; o re-desenho apaga EXIF e GPS) e devolve { nome, dados } para o Paulus
// mandar ao Worker, que a lê com um modelo de visão (worker/visao.mjs). Quem decide mandar é o console; este arquivo só prepara.
(function () {
  'use strict';
  var MAX_BYTES = 25 * 1024 * 1024, MAX_PAGINAS = 80, MAX_PAGINAS_OCR = 5, MAX_CHARS = 600000, TEXTO = { txt: 1, md: 1, csv: 1, tsv: 1 };
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null, leitor = null;
  function ext(f) { var m = /\.([a-z0-9]+)$/i.exec((f && f.name) || ''); return m ? m[1].toLowerCase() : ''; }
  function ehImagem(f) { return /^image\/(jpeg|png|webp)$/.test((f && f.type) || '') || /^(png|jpe?g|webp)$/.test(ext(f)); }
  function legivel(f) { var e = ext(f); return !!(TEXTO[e] || e === 'docx' || e === 'xlsx' || e === 'pdf'); }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function inflar(bytes) {
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(bytes).catch(function () { /* o erro aparece na leitura */ }); w.close().catch(function () { /* idem */ });
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function docx(buf) {
    var b = new Uint8Array(buf), fim = -1, i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { fim = i; break; }
    if (fim < 0) return Promise.reject(new Error('zip'));
    var n = u16(b, fim + 10), p = u32(b, fim + 16), ent = null, k;
    for (k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      var nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32);
      if (new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl)) === 'word/document.xml') { ent = { met: u16(b, p + 10), tc: u32(b, p + 20), lo: u32(b, p + 42) }; break; }
      p += 46 + nl + el + cl;
    }
    if (!ent) return Promise.reject(new Error('sem texto'));
    var ini = ent.lo + 30 + u16(b, ent.lo + 26) + u16(b, ent.lo + 28), dados = b.subarray(ini, ini + ent.tc);
    return (ent.met === 8 ? inflar(dados) : Promise.resolve(dados)).then(function (x) {
      return new TextDecoder().decode(x).replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>|<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    });
  }
  function abrirZip(buf) {
    var b = new Uint8Array(buf), fim = -1, i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { fim = i; break; }
    if (fim < 0) return Promise.reject(new Error('xlsx-zip'));
    var n = u16(b, fim + 10), p = u32(b, fim + 16), mapa = Object.create(null), k;
    for (k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      var nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      mapa[nome] = { met: u16(b, p + 10), tc: u32(b, p + 20), lo: u32(b, p + 42) };
      p += 46 + nl + el + cl;
    }
    return function (nome) {
      var e = mapa[nome]; if (!e) return Promise.resolve('');
      var ini = e.lo + 30 + u16(b, e.lo + 26) + u16(b, e.lo + 28), dados = b.subarray(ini, ini + e.tc);
      return (e.met === 8 ? inflar(dados) : Promise.resolve(dados)).then(function (x) { return new TextDecoder().decode(x); });
    };
  }
  function xlsx(buf) {
    var ler = abrirZip(buf), esc = function (s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
    var attr = function (s, n) { var re = new RegExp('(?:^|\\s)' + n.replace(':', '\\:') + '="([^"]*)"'); var m = re.exec(s); return m ? m[1] : ''; };
    var limpar = function (s) { return esc(String(s || '').replace(/<[^>]*>/g, '')).replace(/\r?\n/g, ' ').trim(); };
    return Promise.all([ler('xl/workbook.xml'), ler('xl/_rels/workbook.xml.rels'), ler('xl/sharedStrings.xml')]).then(function (base) {
      var wb = base[0], rels = base[1], ss = base[2], sheet = /<sheet\b([^>]*)\/?\s*>/i.exec(wb), rid = sheet && attr(sheet[1], 'r:id'), destino = '';
      if (rid) { var rr = /<Relationship\b[^>]*\/?\s*>/gi, m; while ((m = rr.exec(rels))) if (attr(m[0], 'Id') === rid) { destino = attr(m[0], 'Target'); break; } }
      destino = destino || 'worksheets/sheet1.xml';
      var caminho = destino.charAt(0) === '/' ? destino.slice(1) : (destino.indexOf('xl/') === 0 ? destino : 'xl/' + destino.replace(/^\.\//, ''));
      var strings = [], sm = /<si\b[^>]*>([\s\S]*?)<\/si>/gi, si;
      while ((si = sm.exec(ss))) { var partes = [], tm = /<t\b[^>]*>([\s\S]*?)<\/t>/gi, tt; while ((tt = tm.exec(si[1]))) partes.push(esc(tt[1])); strings.push(partes.join('')); }
      return ler(caminho).then(function (xml) {
        if (!xml) throw new Error('xlsx-folha');
        var linhas = [], rm = /<row\b[^>]*>([\s\S]*?)<\/row>/gi, row;
        function indiceCol(ref) { var letras = (/^[A-Z]+/i.exec(ref) || ['A'])[0].toUpperCase(), n = 0; for (var z = 0; z < letras.length; z++) n = n * 26 + letras.charCodeAt(z) - 64; return n - 1; }
        function fuga(v) { v = String(v == null ? '' : v).replace(/[\r\n]+/g, ' '); return /[\t"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
        while ((row = rm.exec(xml)) && linhas.length < 15000) {
          var celulas = [], cm = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi, c;
          while ((c = cm.exec(row[1]))) {
            var ref = attr(c[1], 'r'), tipo = attr(c[1], 't'), mi = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(c[2] || ''), valor = mi ? limpar(mi[1]) : '';
            if (tipo === 's') valor = strings[Number(valor)] || '';
            else if (tipo === 'inlineStr') { var its = [], im = /<t\b[^>]*>([\s\S]*?)<\/t>/gi, it; while ((it = im.exec(c[2] || ''))) its.push(esc(it[1])); valor = its.join(''); }
            else valor = esc(valor);
            celulas[indiceCol(ref)] = valor;
          }
          linhas.push((celulas.length ? celulas : ['']).map(fuga).join('\t'));
          if (linhas.join('\n').length > MAX_CHARS) break;
        }
        if (!linhas.length) throw new Error('xlsx-vazio');
        return linhas.join('\n');
      });
    });
  }
  function carregarLeitor() {
    if (!leitor) leitor = import('./pdf.min.mjs').then(function (m) { m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href; return m; })
      .catch(function () { leitor = null; throw new Error('LEITOR'); });
    return leitor;
  }
  function pdf(buf) {
    return carregarLeitor().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGINAS), paginasComTexto = [], paginasSemTexto = [], i = 1;
      function paginasEscaneadas(lista) {
        var total = Math.min(lista.length, MAX_PAGINAS_OCR), imagens = [], atual = 0;
        function renderizar(pg, lado) {
          var base = pg.getViewport({ scale: 1 }), escala = Math.min(1, lado / Math.max(base.width, base.height));
          var viewport = pg.getViewport({ scale: escala }), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.ceil(viewport.width)); cv.height = Math.max(1, Math.ceil(viewport.height));
          var ctx = cv.getContext('2d');
          return pg.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            var dados = cv.toDataURL('image/jpeg', 0.78); cv.width = 1; cv.height = 1;
            return dados.length <= 1000000 || lado <= 480 ? dados : renderizar(pg, Math.max(480, Math.floor(lado * 0.75)));
          });
        }
        function proxImagem() {
          if (atual >= total) return Promise.resolve({ pdfEscaneado: true, nome: 'PDF escaneado', paginasTotal: lista.length, paginasArquivo: doc.numPages, imagens: imagens, texto: paginasComTexto.join('\n\n') });
          var numero = lista[atual++];
          return doc.getPage(numero).then(function (pg) { return renderizar(pg, 1280).then(function (dados) {
            if (!/^data:image\/jpeg;base64,/.test(dados) || dados.length > 1000000) throw new Error('imagem');
            imagens.push({ nome: 'Página ' + numero, dados: dados });
          }); }).then(proxImagem);
        }
        return proxImagem();
      }
      function prox() {
        if (i > n) {
          var texto = paginasComTexto.join('\n\n').trim();
          if (!paginasSemTexto.length) return Promise.resolve(texto);
          return paginasEscaneadas(paginasSemTexto);
        }
        var numero = i++;
        return doc.getPage(numero).then(function (pg) { return pg.getTextContent(); }).then(function (c) {
          var pagina = c.items.map(function (x) { return x.str + (x.hasEOL ? '\n' : ' '); }).join('').trim();
          if (pagina.length < 20) paginasSemTexto.push(numero); else paginasComTexto.push('Página ' + numero + ':\n' + pagina);
          return prox();
        });
      }
      return prox();
    });
  }
  function uma(f) {
    if (cache && cache.has(f)) return cache.get(f);
    var e = ext(f), p;
    if (ehImagem(f)) p = Promise.resolve({ erro: f.name + ': foto não é lida como documento de texto; ela segue pela leitura de imagem.' });
    else if (!legivel(f)) p = Promise.resolve({ erro: f.name + ': formato que não leio. Use PDF com texto, DOCX, TXT, MD, CSV, TSV ou XLSX.' });
    else if (f.size > MAX_BYTES) p = Promise.resolve({ erro: f.name + ': maior que 25 MB.' });
    else p = (TEXTO[e] ? f.text() : f.arrayBuffer().then(function (b) { return e === 'docx' ? docx(b) : e === 'xlsx' ? xlsx(b) : pdf(b); })).then(function (t) {
      if (t && typeof t === 'object' && Array.isArray(t.imagens)) return t;
      t = String(t).replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_CHARS);
      if (t.length < 40) return { erro: f.name + ': não achei texto nem consegui preparar páginas escaneadas para ler.' };
      return { nome: f.name, texto: t };
    }).catch(function (er) {
      var m = er && er.message, nome = er && er.name;
      return { erro: m === 'LEITOR' ? 'Falta instalar o leitor de PDF do Paulus (veja docs/DOCUMENTOS.md). Enquanto isso, anexe DOCX, TXT, MD, CSV, TSV ou XLSX.' : nome === 'PasswordException' ? f.name + ': o PDF tem senha.' : f.name + ': não consegui ler este arquivo.' };
    });
    if (cache) cache.set(f, p);
    return p;
  }
  // Lê até 3 arquivos e junta o texto: devolve { nome, texto } ou { erro }
  function ler(files) {
    var lista = Array.prototype.slice.call(files || [], 0, 3);
    return Promise.all(lista.map(uma)).then(function (rs) {
      var escaneado = rs.filter(function (r) { return r && Array.isArray(r.imagens); });
      if (escaneado.length) return escaneado.length === 1 ? escaneado[0] : { erro: 'Leia um PDF escaneado por vez.' };
      var ok = rs.filter(function (r) { return r.texto; });
      if (!ok.length) return rs[0] || { erro: 'Não há arquivo para ler.' };
      return { nome: ok.map(function (r) { return r.nome; }).join(', '), texto: ok.length === 1 ? ok[0].texto : ok.map(function (r) { return '=== ' + r.nome + ' ===\n' + r.texto; }).join('\n\n') };
    });
  }

  // ---- foto: reduz e converte para JPEG no aparelho --------------------------------------------------------------------------------
  var IMG_LADO = 1280, IMG_MAX_B64 = 1000000, IMG_MAX_BYTES = 40 * 1024 * 1024;
  function abrirImagem(f) {
    function viaImg() {
      return new Promise(function (ok, no) {
        var u = URL.createObjectURL(f), im = new Image();
        im.onload = function () { URL.revokeObjectURL(u); ok(im); };
        im.onerror = function () { URL.revokeObjectURL(u); no(new Error('abrir')); };
        im.src = u;
      });
    }
    if (typeof createImageBitmap === 'function') return createImageBitmap(f, { imageOrientation: 'from-image' }).catch(viaImg);
    return viaImg();
  }
  // Desenha em canvas (fundo branco, para PNG com transparência) e baixa a qualidade/o tamanho até caber no limite do envio.
  function codificar(img, lado, tentativa) {
    var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    var esc = Math.min(1, lado / Math.max(w, h)), cw = Math.max(1, Math.round(w * esc)), ch = Math.max(1, Math.round(h * esc));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(img, 0, 0, cw, ch);
    var q = 0.85, dados = cv.toDataURL('image/jpeg', q);
    while (dados.length > IMG_MAX_B64 && q > 0.45) { q -= 0.1; dados = cv.toDataURL('image/jpeg', q); }
    if (dados.length > IMG_MAX_B64 && tentativa < 4) return codificar(img, Math.round(lado * 0.8), tentativa + 1);
    return dados;
  }
  function imagem(f) {
    if (!f || !ehImagem(f)) return Promise.resolve({ erro: ((f && f.name) || 'arquivo') + ': só leio imagem JPG, PNG ou WebP.' });
    if (f.size > IMG_MAX_BYTES) return Promise.resolve({ erro: f.name + ': a imagem é grande demais (mais de 40 MB).' });
    return abrirImagem(f).then(function (im) {
      var dados = codificar(im, IMG_LADO, 0);
      if (im && typeof im.close === 'function') im.close();
      if (!/^data:image\/jpeg;base64,/.test(dados) || dados.length > IMG_MAX_B64) return { erro: f.name + ': não consegui reduzir a imagem o bastante. Tente uma foto menor.' };
      return { nome: f.name, dados: dados };
    }).catch(function () {
      return { erro: f.name + ': não consegui abrir esta imagem. Use JPG, PNG ou WebP (no iPhone, compartilhe a foto como JPG ou escolha o formato "Mais compatível").' };
    });
  }
  window.PaulusDocs = { ler: ler, legivel: legivel, ehImagem: ehImagem, imagem: imagem };
})();
