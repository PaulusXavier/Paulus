// Ordem de visita domiciliar, no aparelho: sem IA, sem rede, sem coordenadas.
//
// Recebe endereços de texto ("Rua Santo Agostinho, nº 193 — Centenário") e devolve a ordem em que a equipe
// deve visitar. Regras (nesta ordem):
//   1. a rua de partida vem primeiro, depois as demais ruas do mesmo bairro, depois os outros bairros;
//   2. dentro do bairro, rua por rua (ordem alfabética: sem mapa, é o único critério estável);
//   3. dentro da rua, em serpentina: sobe pelos números ímpares e desce pelos pares (lados opostos da rua);
//      na rua de partida, começa pelo número mais próximo do de partida;
//   4. S/N e endereço sem número vão ao fim da rua; endereço ilegível ou vazio vai ao fim de tudo, na ordem original;
//   5. o mesmo endereço fica junto (famílias no mesmo imóvel).
// É uma aproximação por texto. Quem conhece o território pode e deve ajustar a ordem à mão.
//
// Privacidade: função pura. O endereço de residência nunca sai da função (nem para IA, nem para a rede).

const TIPOS_VISITA = {
  rua: 'rua', r: 'rua', avenida: 'avenida', av: 'avenida', travessa: 'travessa', tv: 'travessa', alameda: 'alameda',
  estrada: 'estrada', br: 'br', rr: 'rr', rodovia: 'rodovia', beco: 'beco', praca: 'praca', vicinal: 'vicinal', via: 'via',
  passagem: 'passagem', largo: 'largo', loteamento: 'loteamento', conjunto: 'conjunto', residencial: 'residencial',
  quadra: 'quadra', ramal: 'ramal'
};

function semAcentoV(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function compactarV(s) { return semAcentoV(s).replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// Complemento do imóvel (apto 3, casa 2, bloco B, qd 5, lt 12): não faz parte do nome da rua nem do número.
const KW_COMPL = '(?:apto|apt|ap|apartamento|casa|cs|bloco|bl|qd|quadra|lt|lote|sala|sl|torre|andar|fundos|frente)';
const RE_PARTE_COMPL = new RegExp('^(?:' + KW_COMPL + '(?: ?\\d+[a-z]?| [a-z])?\\s*)+$');
const RE_FIM_COMPL = new RegExp('(?:,|\\s)\\s*' + KW_COMPL + ' ?(?:\\d+[a-z]?|[a-z])$');
const RE_PARTE_NUM = /^(?:n |numero |num )?(?:\d{1,6}(?: ?[a-z])?|s ?\/ ?n|sn|sem numero)$/;

// "Rua Santo Agostinho, nº 193 — Centenário" -> { tipo, chave, numero, semNumero, bairro } ou null se ilegível
export function analisarEnderecoVisita(texto) {
  const bruto = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  if (!bruto) return null;
  // bairro: depois de travessão ou hífen com espaços ("... 193 — Centenário", "... 245 - 13 de Setembro")
  const partes = bruto.split(/\s+[—–-]\s+/);
  let via = partes[0];
  let bairroTxt = partes.slice(1).join(' ');
  // vírgulas: "Rua X, 12, casa 2, Bairro Y" / "Rua X, Bairro Y" (complemento sai; o que vem depois do número é bairro)
  const pc = via.split(/\s*,\s*/).filter((s) => s && !RE_PARTE_COMPL.test(compactarV(s)));
  const temVirgula = pc.length >= 2;
  if (temVirgula) {
    const k = pc.findIndex((s, i) => i > 0 && RE_PARTE_NUM.test(compactarV(s)));
    if (k > 0) { via = pc.slice(0, k + 1).join(', '); if (!bairroTxt) bairroTxt = pc.slice(k + 1).join(' '); }
    else if (!bairroTxt && !pc.slice(1).some((s) => /\d/.test(s))) { via = pc[0]; bairroTxt = pc.slice(1).join(' '); }
    else via = pc.join(', ');
  } else if (pc.length === 1) via = pc[0];
  const bairro = compactarV(bairroTxt.replace(/\bcep\b.*$/i, '').replace(/\bbairro\b\s*:?/i, '').replace(/\b(?:boa vista|roraima|rr)\b.*$/i, ''));

  let v = compactarV(via);
  const mt = /^(r|av|tv|[a-z]+)\.? /.exec(v + ' ');
  let tipo = '';
  if (mt && TIPOS_VISITA[mt[1]]) { tipo = TIPOS_VISITA[mt[1]]; v = v.slice(mt[0].length - 1).trim(); }
  // sem tipo ("Santo Agostinho, 193"): só vale se houver vírgula e número; senão é texto solto, ilegível
  if (!tipo && !temVirgula) return null;
  while (RE_FIM_COMPL.test(v)) v = v.replace(RE_FIM_COMPL, '').trim();

  // número: "..., nº 193", "..., 193", "... 193", "10-A", "s/n"
  let numero = null; let semNumero = false;
  let m = /(?:,\s*|\s+)(?:n[o°º]?\.?\s*|numero\s*|num\s*)?(s\s*\/\s*n|sn|sem numero)$/.exec(v);
  if (m) { semNumero = true; v = v.slice(0, m.index).trim(); }
  else {
    m = /(?:,\s*|\s+)(?:n[o°º]?\.?\s*|numero\s*|num\s*)?(\d{1,6})(?: ?[a-z])?$/.exec(v);
    // "Rua 7 de Setembro" não tem número de imóvel; "Rua 7" (sem mais nada) também não: o 7 é o nome da rua
    if (m && v.slice(0, m.index).trim() && !/\b(?:de|da|do|das|dos|e)$/.test(v.slice(0, m.index).trim())) {
      numero = parseInt(m[1], 10); v = v.slice(0, m.index).trim();
    }
  }
  const chave = v.replace(/,/g, ' ').replace(/\bn[o°º]?$/, '').replace(/\s+/g, ' ').trim();
  if (!chave) return null;
  if (!tipo && numero === null && !semNumero) return null;
  return { tipo, chave, numero, semNumero: semNumero || numero === null, bairro };
}

// itens: [{ endereco }]  ->  { itens (reordenados), indices (posição original de cada um), ilegiveis (quantos foram ao fim) }
export function ordenarVisitas(itens, partida, opcoes) {
  const o = Object.assign({ serpentina: true }, opcoes || {});
  const lista = Array.isArray(itens) ? itens : [];
  const p = analisarEnderecoVisita(partida);
  const dados = lista.map((item, i) => ({ item, i, a: analisarEnderecoVisita(item && item.endereco) }));
  const legiveis = dados.filter((d) => d.a);
  const ilegiveis = dados.filter((d) => !d.a);

  // ruas: mesmo tipo + nome + bairro. "Rua 1" do Pintolândia e "Rua 1" do Caranã são ruas diferentes;
  // endereço sem bairro entra na única rua de mesmo nome, se houver só uma.
  const ruas = new Map();
  const idRua = (a) => a.tipo + ' ' + a.chave + '|' + a.bairro;
  legiveis.forEach((d) => {
    const id = idRua(d.a);
    let r = ruas.get(id);
    if (!r) { r = { id, tipo: d.a.tipo, chave: d.a.chave, bairro: d.a.bairro, primeiro: d.i, itens: [] }; ruas.set(id, r); }
    r.itens.push(d);
  });
  Array.from(ruas.values()).filter((r) => !r.bairro).forEach((r) => {
    const iguais = Array.from(ruas.values()).filter((x) => x !== r && x.tipo === r.tipo && x.chave === r.chave);
    if (iguais.length === 1) { iguais[0].itens = iguais[0].itens.concat(r.itens); iguais[0].primeiro = Math.min(iguais[0].primeiro, r.primeiro); ruas.delete(r.id); }
  });
  const ehPartida = (r) => !!p && r.tipo === p.tipo && r.chave === p.chave && (!p.bairro || !r.bairro || r.bairro === p.bairro);

  // ordem dos bairros: o da partida primeiro; os outros na ordem em que aparecem; sem bairro por último
  const bairros = [];
  if (p && p.bairro) bairros.push(p.bairro);
  Array.from(ruas.values()).sort((x, y) => x.primeiro - y.primeiro).forEach((r) => { if (r.bairro && bairros.indexOf(r.bairro) < 0) bairros.push(r.bairro); });
  const rangBairro = (b) => (b ? bairros.indexOf(b) : bairros.length);

  const listaRuas = Array.from(ruas.values()).sort((x, y) => {
    const px = ehPartida(x) ? 0 : 1; const py = ehPartida(y) ? 0 : 1;
    if (px !== py) return px - py;
    const bx = rangBairro(x.bairro); const by = rangBairro(y.bairro);
    if (bx !== by) return bx - by;
    return x.chave.localeCompare(y.chave, 'pt-BR') || x.tipo.localeCompare(y.tipo, 'pt-BR') || x.primeiro - y.primeiro;
  });

  const ordem = [];
  listaRuas.forEach((r) => {
    const comNumero = r.itens.filter((d) => d.a.numero !== null).sort((x, y) => x.a.numero - y.a.numero || x.i - y.i);
    const semNum = r.itens.filter((d) => d.a.numero === null).sort((x, y) => x.i - y.i);
    let meio = comNumero;
    if (o.serpentina) {
      const impares = comNumero.filter((d) => d.a.numero % 2 === 1);
      const pares = comNumero.filter((d) => d.a.numero % 2 === 0);
      let subida = impares; let volta = pares.slice().reverse();
      // rua de partida: começa pelo lado e pelo número mais próximos do ponto de partida
      if (ehPartida(r) && p.numero !== null) {
        const lado = p.numero % 2 === 1 ? impares : pares;
        const outro = p.numero % 2 === 1 ? pares : impares;
        const ate = lado.filter((d) => d.a.numero >= p.numero);
        const antes = lado.filter((d) => d.a.numero < p.numero).reverse();
        subida = ate.concat(antes);
        volta = outro.slice().sort((x, y) => Math.abs(x.a.numero - p.numero) - Math.abs(y.a.numero - p.numero) || x.i - y.i);
      }
      meio = subida.concat(volta);
    }
    meio.concat(semNum).forEach((d) => ordem.push(d));
  });
  ilegiveis.forEach((d) => ordem.push(d));

  return { itens: ordem.map((d) => d.item), indices: ordem.map((d) => d.i), ilegiveis: ilegiveis.length };
}

export const EXPLICACAO_VISITAS = 'O Paulus ordena no seu aparelho, sem enviar nada para a internet: começa pela rua de partida, depois as outras ruas do bairro (em ordem alfabética), e em cada rua sobe pelos números ímpares e volta pelos pares. Sem número ou sem endereço legível vai ao fim. É uma aproximação pelo texto do endereço, sem mapa: ajuste a ordem se você conhece um caminho melhor.';
