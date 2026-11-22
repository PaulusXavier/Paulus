// Leitura de documentos anexados, NO APARELHO (o arquivo não sobe para lugar nenhum; só trechos escolhidos vão à IA, veja shared/documento.mjs).
// Lê: TXT, MD, CSV, DOCX (sem biblioteca) e PDF com texto (precisa do leitor pdf.js em pdf.min.mjs e pdf.worker.min.mjs, veja docs/DOCUMENTOS.md).
(function () {
  'use strict';
  var MAX_BYTES = 25 * 1024 * 1024, MAX_PAGINAS = 80, MAX_CHARS = 600000, TEXTO = { txt: 1, md: 1, csv: 1, tsv: 1 };
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null, leitor = null;
  function ext(f) { var m = /\.([a-z0-9]+)$/i.exec((f && f.name) || ''); return m ? m[1].toLowerCase() : ''; }
  function legivel(f) { var e = ext(f); return !!(TEXTO[e] || e === 'docx' || e === 'pdf'); }
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
  function carregarLeitor() {
    if (!leitor) leitor = import('./pdf.min.mjs').then(function (m) { m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href; return m; })
      .catch(function () { leitor = null; throw new Error('LEITOR'); });
    return leitor;
  }
  function pdf(buf) {
    return carregarLeitor().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGINAS), out = [], i = 1;
      function prox() {
        if (i > n) return Promise.resolve(out.join('\n\n'));
        return doc.getPage(i++).then(function (pg) { return pg.getTextContent(); }).then(function (c) { out.push(c.items.map(function (x) { return x.str + (x.hasEOL ? '\n' : ' '); }).join('')); return prox(); });
      }
      return prox();
    });
  }
  function uma(f) {
    if (cache && cache.has(f)) return cache.get(f);
    var e = ext(f), p;
    if (/^(png|jpe?g)$/.test(e)) p = Promise.resolve({ erro: 'Ainda não leio fotos. Anexe um PDF com texto, DOCX, TXT, MD ou CSV.' });
    else if (!legivel(f)) p = Promise.resolve({ erro: f.name + ': formato que não leio. Use PDF com texto, DOCX, TXT, MD ou CSV.' });
    else if (f.size > MAX_BYTES) p = Promise.resolve({ erro: f.name + ': maior que 25 MB.' });
    else p = (TEXTO[e] ? f.text() : f.arrayBuffer().then(e === 'docx' ? docx : pdf)).then(function (t) {
      t = String(t).replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_CHARS);
      if (t.length < 40) return { erro: f.name + ': não achei texto para ler. Se for PDF escaneado (imagem), eu ainda não faço OCR.' };
      return { nome: f.name, texto: t };
    }).catch(function (er) {
      var m = er && er.message, nome = er && er.name;
      return { erro: m === 'LEITOR' ? 'Falta instalar o leitor de PDF do Paulus (veja docs/DOCUMENTOS.md). Enquanto isso, anexe DOCX, TXT, MD ou CSV.' : nome === 'PasswordException' ? f.name + ': o PDF tem senha.' : f.name + ': não consegui ler este arquivo.' };
    });
    if (cache) cache.set(f, p);
    return p;
  }
  // Lê até 3 arquivos e junta o texto: devolve { nome, texto } ou { erro }
  function ler(files) {
    var lista = Array.prototype.slice.call(files || [], 0, 3);
    return Promise.all(lista.map(uma)).then(function (rs) {
      var ok = rs.filter(function (r) { return r.texto; });
      if (!ok.length) return rs[0] || { erro: 'Não há arquivo para ler.' };
      return { nome: ok.map(function (r) { return r.nome; }).join(', '), texto: ok.length === 1 ? ok[0].texto : ok.map(function (r) { return '=== ' + r.nome + ' ===\n' + r.texto; }).join('\n\n') };
    });
  }
  window.PaulusDocs = { ler: ler, legivel: legivel };
})();
