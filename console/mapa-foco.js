/* Paulus — bairros de foco do "Mapa e rotas" (13 de Setembro e Araceli Souto Maior), sem DOM (testável em Node: `node tests/mapa-foco.test.js`).
 * Reconhece o bairro digitado de vários jeitos ("13 de setembro", "treze de setembro", "13/set", "aracelis", "Profa. Araceli S. Maior"),
 * monta as consultas a tentar e põe no topo os resultados que são desses bairros. Não guarda nem envia nada: são só contas com texto. */
(function (raiz) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/\s,.-]/g, ' ').replace(/\s+/g, ' ').trim();

  const FOCOS = [
    { id: '13s', rotulo: '13 de Setembro', curto: '13 de Setembro',
      variantes: ['13 de Setembro', 'Treze de Setembro'],
      achar: /(?:^|[\s,.-])(?:bairro\s+)?(?:13|treze|xiii)\s*(?:de\s+|\/\s*)?(?:setembro|set)(?![a-z])/,
      pertence: /(?:\b13\b|treze|xiii)\s*(?:de\s+)?(?:setembro|set\b)/ },
    { id: 'araceli', rotulo: 'Araceli Souto Maior', curto: 'Araceli',
      variantes: ['Araceli Souto Maior', 'Aracelis Souto Maior', 'Professora Araceli Souto Maior', 'Araceli'],
      achar: /(?:^|[\s,.-])(?:bairro\s+)?(?:(?:profa?|professora)\.?\s+)?arac[eiy]ll?[iey]s?(?:\s+(?:s\.?|souto)(?:\s+(?:m\.?|maior))?)?(?![a-z])/,
      pertence: /arac[eiy]ll?[iey]s?/ }
  ];

  const TIPO_VIA = /(?:rua|r|av|avenida|tv|travessa|pca|praca|alameda|al|estrada|rodovia|beco|vila)\.?\s*$/;

  // texto digitado → { foco, resto } (resto = o texto sem o nome do bairro), ou null se nenhum bairro de foco foi citado.
  // "Rua Treze de Setembro" é nome de rua, não do bairro: não conta.
  function detectar(q) {
    const t = String(q || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();   // sem acento, mantendo maiúsculas
    for (const f of FOCOS) {
      const m = new RegExp(f.achar.source, 'i').exec(t); if (!m) continue;
      const ini = m.index + (/^[\s,.-]/.test(m[0]) ? 1 : 0), fim = m.index + m[0].length;
      const antes = t.slice(0, ini).trim();
      if (TIPO_VIA.test(antes.toLowerCase())) continue;
      const resto = (antes + ' ' + t.slice(fim)).replace(/\s+bairro\s*$/i, ' ').replace(/\s*,(\s*,)+/g, ',').replace(/\s+,/g, ',').replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
      return { foco: f, resto: resto.replace(/\s+bairro$/i, '') };
    }
    return null;
  }

  const porId = (id) => FOCOS.find(f => f.id === id) || null;

  // consultas a tentar, da mais precisa à mais ampla (o chamador para na primeira que achar algo)
  function consultas(foco, resto, cidade) {
    const c = cidade || 'Boa Vista';
    const r = String(resto || '').trim();
    return foco.variantes.slice(0, 3).map(v => (r ? r + ', ' : '') + v + ', ' + c);
  }

  // o resultado (Nominatim ou offline) é de um dos bairros de foco? (ou do bairro indicado)
  function doBairro(r, foco) {
    const a = (r && r.address) || {};
    const txt = norm([r && r._rotulo, r && r.display_name, a.suburb, a.neighbourhood, a.quarter, a.city_district].filter(Boolean).join(' , '));
    const lista = foco ? [foco] : FOCOS;
    return lista.some(f => f.pertence.test(txt));
  }

  // estável: os do bairro (indicado, ou qualquer um dos dois) vêm primeiro; o resto mantém a ordem
  function priorizar(rs, foco) {
    const dentro = [], fora = [];
    (rs || []).forEach(r => (doBairro(r, foco) ? dentro : fora).push(r));
    return dentro.concat(fora);
  }

  const api = { FOCOS, norm, detectar, porId, consultas, doBairro, priorizar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PaulusMapaFoco = api;
})(typeof window !== 'undefined' ? window : this);
