// Gráficos de tabelas feitos inteiramente no aparelho: não usa IA, rede nem armazenamento.
import { psiLerTabela, psiNorm, psiMencoes } from './psicometria.mjs';

const norm = (s) => psiNorm(String(s || '')).replace(/\s+/g, ' ');
const xml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const MAX_PONTOS = 30;

export function graficoEhPedido(texto) {
  const n = norm(texto);
  return /\b(grafico|graficos|grafica|graficas|plot|plots|histograma|histogramas|dispersao|scatter|pizza|setores|barras|bar chart|grafico de linhas|grafico de barras|visualizacao grafica)\b/.test(n);
}

function tipoPedido(n) {
  if (/histograma|histogramas/.test(n)) return 'histograma';
  if (/dispersao|scatter|diagrama de dispersao|grafico xy/.test(n)) return 'dispersao';
  if (/pizza|setores|circular/.test(n)) return 'pizza';
  if (/linha|linhas|serie temporal|tendencia/.test(n)) return 'linha';
  return 'barras';
}
function colunasUtilizaveis(tabela) { return tabela.colunas.filter((c) => !c.pii && !c.id); }
function colunasCitadas(texto, tabela) {
  const men = psiMencoes(norm(texto), { colunas: colunasUtilizaveis(tabela) });
  return men.map((m) => m.c);
}
function unica(c) { return c && c.valores ? c.valores.filter((v) => v != null && !(typeof v === 'number' && !Number.isFinite(v))) : []; }
function celulasValidas(col) { return unica(col); }
function agregador(n) {
  if (/\b(contagem|frequencia|quantidade de registros|numero de registros)\b/.test(n)) return 'contagem';
  if (/\b(soma|somar|total|totalizar)\b/.test(n)) return 'soma';
  if (/\b(mediana)\b/.test(n)) return 'mediana';
  return 'media';
}
function estatistica(valores, modo) {
  if (!valores.length) return NaN;
  if (modo === 'soma') return valores.reduce((a, b) => a + b, 0);
  if (modo === 'contagem') return valores.length;
  if (modo === 'mediana') { const s = valores.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}
function agrupar(cat, num, modo, n, preservarOrdem) {
  const grupos = new Map();
  cat.valores.forEach((v, i) => {
    if (v == null) return;
    const chave = String(v).trim() || '(vazio)';
    if (!grupos.has(chave)) grupos.set(chave, []);
    if (num) { const x = num.valores[i]; if (typeof x === 'number' && Number.isFinite(x)) grupos.get(chave).push(x); }
    else grupos.get(chave).push(1);
  });
  let a = Array.from(grupos, ([label, xs]) => ({ label, value: num ? estatistica(xs, modo) : xs.length, n: xs.length })).filter((x) => Number.isFinite(x.value));
  if (!preservarOrdem) a.sort((x, y) => y.value - x.value || x.label.localeCompare(y.label, 'pt-BR'));
  if (a.length > MAX_PONTOS) { const resto = a.slice(MAX_PONTOS - 1); a = a.slice(0, MAX_PONTOS - 1); a.push({ label: 'Outros', value: resto.reduce((s, x) => s + x.value, 0), n: resto.reduce((s, x) => s + x.n, 0) }); }
  return a;
}
function histogram(col) {
  const xs = celulasValidas(col).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (xs.length < 2) return null;
  const lo = xs.reduce((a, b) => Math.min(a, b), Infinity), hi = xs.reduce((a, b) => Math.max(a, b), -Infinity);
  if (lo === hi) return { labels: [fmt(lo)], values: [xs.length], intervalos: 1 };
  const k = Math.max(3, Math.min(12, Math.ceil(Math.sqrt(xs.length))));
  const passo = (hi - lo) / k, freq = Array(k).fill(0);
  xs.forEach((x) => freq[Math.min(k - 1, Math.floor((x - lo) / passo))]++);
  return { labels: freq.map((_, i) => `${fmt(lo + i * passo)}–${fmt(i === k - 1 ? hi : lo + (i + 1) * passo)}`), values: freq, intervalos: k };
}
function linhaRegistros(xcol, ycol) {
  const pts = [];
  ycol.valores.forEach((y, i) => {
    if (typeof y !== 'number' || !Number.isFinite(y)) return;
    const x = xcol ? xcol.valores[i] : i + 1;
    if (x == null || (typeof x === 'number' && !Number.isFinite(x))) return;
    pts.push({ x: typeof x === 'number' ? x : i, y, label: String(x) });
  });
  return pts.slice(0, 200);
}
function listaColunas(tabela) {
  return colunasUtilizaveis(tabela).map((c) => `- ${c.nome} (${c.tipo === 'num' ? 'numérica' : 'categoria'})`).join('\n');
}
function resposta(texto, g, tabela, nota) {
  if (!g) return { tipo: 'grafico', texto: 'Não consegui montar esse gráfico com a tabela. Confira se há colunas com valores suficientes e tente indicar o tipo e as colunas.', sensivel: true, fontes: [], avisos: ['A tabela foi processada neste aparelho; não foi enviada à IA nem à rede.'], pergunta: '', docs: [] };
  const descr = g.tipo === 'dispersao' ? `${g.pontos.length} pares válidos; ${g.xLabel} no eixo X e ${g.yLabel} no eixo Y.` : `${g.labels.length} categoria(s)/intervalo(s); ${g.yLabel}.`;
  const notaBase = nota ? ` ${nota}` : '';
  return {
    tipo: 'grafico', analise: g.tipo,
    texto: `Gráfico de ${g.titulo.toLowerCase()} criado localmente. ${descr}${notaBase}\n\nA base não saiu deste aparelho e não consumiu cota de IA.`,
    svg: graficoSVG(g), grafico: g, sensivel: true, fontes: [],
    avisos: (tabela.avisos || []).slice(), pergunta: '', docs: []
  };
}

export function graficoResponder(texto, conteudoTabela) {
  if (!graficoEhPedido(texto)) return null;
  if (!conteudoTabela || !String(conteudoTabela).trim()) {
    return { tipo: 'grafico', texto: 'Anexe uma tabela CSV, TSV ou Excel (.xlsx) para criar o gráfico. O cálculo e o desenho são feitos no aparelho, sem enviar a tabela à IA nem à rede. Exemplos: “gráfico de barras de atendimentos por mês”, “linha de visitas ao longo do tempo”, “histograma de idade” ou “dispersão de x e y”.', sensivel: true, fontes: [], avisos: [], pergunta: '', docs: [] };
  }
  const tabela = psiLerTabela(String(conteudoTabela), { leve: true });
  if (!tabela) return resposta(texto, null, { avisos: [] });
  const validas = colunasUtilizaveis(tabela), n = norm(texto), tipo = tipoPedido(n), mencionadas = colunasCitadas(texto, tabela);
  const numericas = validas.filter((c) => c.tipo === 'num' && c.nUnicos > 1), categorias = validas.filter((c) => c.tipo === 'cat');
  const mencNums = mencionadas.filter((c) => c.tipo === 'num' && c.nUnicos > 1), mencCats = mencionadas.filter((c) => c.tipo === 'cat');
  const nome = (c) => c ? c.nome : '';
  const modo = agregador(n);
  let g = null, nota = '';
  if (tipo === 'histograma') {
    const c = mencNums[0] || numericas[0], h = c && histogram(c);
    if (h) g = { tipo, titulo: `Distribuição de ${nome(c)}`, xLabel: nome(c), yLabel: 'Frequência', labels: h.labels, values: h.values, coluna: nome(c), observacoes: celulasValidas(c).length };
  } else if (tipo === 'dispersao') {
    const x = mencNums[0] || numericas[0], y = mencNums[1] || numericas.find((c) => c !== x);
    if (x && y && x !== y) {
      const pontos = linhaRegistros(x, y).map((p, i) => ({ x: x.valores.find((v, j) => j < x.valores.length && j === i) ?? p.x, y: p.y, label: p.label }));
      // Os pares são lidos por índice de linha (sem eliminar linhas para não desalinhá-los).
      const pares = [];
      for (let i = 0; i < Math.min(x.valores.length, y.valores.length); i++) if (Number.isFinite(x.valores[i]) && Number.isFinite(y.valores[i])) pares.push({ x: x.valores[i], y: y.valores[i] });
      if (pares.length >= 2) g = { tipo, titulo: `${nome(y)} por ${nome(x)}`, xLabel: nome(x), yLabel: nome(y), pontos: pares.slice(0, 200), observacoes: pares.length };
    }
  } else if (tipo === 'pizza') {
    const cat = mencCats[0] || categorias[0], num = mencNums[0] || (!mencionadas.length ? numericas.find((c) => c !== cat) : null);
    if (cat) {
      const dados = agrupar(cat, num, modo === 'contagem' ? 'contagem' : modo, n);
      if (dados.length) g = { tipo, titulo: num ? `${modo === 'soma' ? 'Soma' : modo === 'mediana' ? 'Mediana' : 'Média'} de ${nome(num)} por ${nome(cat)}` : `Frequência de ${nome(cat)}`, xLabel: nome(cat), yLabel: num ? nome(num) : 'Frequência', labels: dados.map((x) => x.label), values: dados.map((x) => x.value), observacoes: dados.reduce((s, x) => s + x.n, 0) };
    }
  } else if (tipo === 'linha') {
    const y = mencNums[0] || numericas[0], x = mencCats[0] || mencionadas.find((c) => c !== y && c.tipo === 'num') || categorias[0];
    if (y) {
      const pts = linhaRegistros(x, y);
      const valores = x && x.tipo === 'cat' ? agrupar(x, y, modo, n, true) : null;
      if (valores && valores.length) g = { tipo, titulo: `${nome(y)} ao longo de ${nome(x)}`, xLabel: nome(x), yLabel: nome(y), labels: valores.map((v) => v.label), values: valores.map((v) => v.value), observacoes: pts.length };
      else if (pts.length >= 2) g = { tipo, titulo: nome(y), xLabel: nome(x) || 'Linha da tabela', yLabel: nome(y), labels: pts.map((p, i) => x ? p.label : String(i + 1)), values: pts.map((p) => p.y), observacoes: pts.length };
    }
  } else {
    const cat = mencCats[0] || categorias[0], num = mencNums[0] || (!mencionadas.length ? numericas.find((c) => c !== cat) : null);
    if (cat) {
      const dados = agrupar(cat, num, modo, n);
      if (dados.length) g = { tipo: 'barras', titulo: num ? `${modo === 'soma' ? 'Soma' : modo === 'mediana' ? 'Mediana' : 'Média'} de ${nome(num)} por ${nome(cat)}` : `Frequência de ${nome(cat)}`, xLabel: nome(cat), yLabel: num ? nome(num) : 'Frequência', labels: dados.map((x) => x.label), values: dados.map((x) => x.value), observacoes: dados.reduce((s, x) => s + x.n, 0) };
    } else {
      const col = mencNums[0] || numericas[0];
      if (col) {
        const vs = col.valores.filter(Number.isFinite).slice(0, MAX_PONTOS);
        if (vs.length) { g = { tipo: 'barras', titulo: nome(col), xLabel: 'Linha da tabela', yLabel: nome(col), labels: vs.map((_, i) => String(i + 1)), values: vs, observacoes: vs.length }; nota = 'Mostrando os primeiros valores por linha; para comparar grupos, indique uma coluna de categoria.'; }
      }
    }
  }
  if (!g) return resposta(texto, null, tabela);
  if (['media', 'mediana', 'soma'].includes(modo) && g.tipo === 'barras' && !mencNums.length && !numericas.length && categorias.length) nota = 'Exibido como frequência por categoria.';
  if (mencionadas.length === 0 && validas.length > 2) nota = `Escolhi automaticamente as colunas disponíveis. Para escolher, escreva o nome da coluna; disponíveis:\n${listaColunas(tabela)}`;
  return resposta(texto, g, tabela, nota);
}

export function graficoSVG(g) {
  if (!g || !['barras', 'linha', 'pizza', 'histograma', 'dispersao'].includes(g.tipo)) return '';
  const W = 960, H = 560, pal = ['#1769aa', '#e07621', '#339966', '#a64d79', '#7e57c2', '#008c95', '#d44a4a', '#687864'];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="titulo desc"><title id="titulo">${xml(g.titulo)}</title><desc id="desc">${xml(g.tipo === 'dispersao' ? `${g.pontos.length} pontos; ${g.xLabel} por ${g.yLabel}` : `${g.labels.length} valores; ${g.yLabel}`)}</desc><rect width="100%" height="100%" fill="#ffffff"/><style>text{font-family:Arial,sans-serif;fill:#263238}.grid{stroke:#d9e1e5;stroke-width:1}.axis{stroke:#596a73;stroke-width:1.4}.title{font-size:24px;font-weight:700}.label{font-size:14px}.small{font-size:12px;fill:#455a64}</style><text class="title" x="480" y="34" text-anchor="middle">${xml(g.titulo)}</text>`;
  const left = 100, right = 920, top = 80, bottom = 455, plotW = right - left, plotH = bottom - top;
  if (g.tipo === 'pizza') {
    const vals = (g.values || []).map((v) => Math.max(0, Number(v) || 0)), total = vals.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2; const cx = 330, cy = 285, r = 185;
    vals.forEach((v, i) => {
      const end = angle + v / total * Math.PI * 2, x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle), x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end), large = end - angle > Math.PI ? 1 : 0;
      s += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${pal[i % pal.length]}" stroke="#fff" stroke-width="2"/>`;
      const yy = 100 + i * Math.min(30, 330 / Math.max(vals.length, 1));
      s += `<rect x="590" y="${yy - 12}" width="14" height="14" rx="2" fill="${pal[i % pal.length]}"/><text class="label" x="614" y="${yy}">${xml(String(g.labels[i]).slice(0, 30))}</text><text class="small" x="900" y="${yy}" text-anchor="end">${fmt(vals[i])} · ${fmt(vals[i] / total * 100)}%</text>`;
      angle = end;
    });
  } else if (g.tipo === 'dispersao') {
    const pts = g.pontos || [], xmin = Math.min(...pts.map((p) => p.x)), xmax = Math.max(...pts.map((p) => p.x)), ymin = Math.min(...pts.map((p) => p.y)), ymax = Math.max(...pts.map((p) => p.y));
    const xr = xmax - xmin || 1, yr = ymax - ymin || 1;
    for (let i = 0; i <= 4; i++) { const y = top + plotH * i / 4, v = ymax - yr * i / 4; s += `<line class="grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="small" x="${left - 12}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; }
    pts.forEach((p) => { const x = left + (p.x - xmin) / xr * plotW, y = bottom - (p.y - ymin) / yr * plotH; s += `<circle cx="${x}" cy="${y}" r="5" fill="${pal[0]}" fill-opacity=".72"/>`; });
    s += `<line class="axis" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"/><text class="label" x="510" y="520" text-anchor="middle">${xml(g.xLabel)}</text><text class="label" transform="translate(24 280) rotate(-90)" text-anchor="middle">${xml(g.yLabel)}</text>`;
  } else {
    const labels = g.labels || [], vals = (g.values || []).map((v) => Number(v) || 0), max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = max - min || 1;
    if (g.tipo === 'barras') {
      const rowH = Math.min(30, plotH / Math.max(1, labels.length)), startY = top + 4;
      labels.forEach((lab, i) => { const y = startY + i * rowH, ww = Math.max(1, (vals[i] - min) / span * 590); s += `<text class="label" x="${left - 12}" y="${y + rowH * .7}" text-anchor="end">${xml(String(lab).slice(0, 26))}</text><rect x="${left}" y="${y + 2}" width="${ww}" height="${Math.max(6, rowH - 6)}" rx="3" fill="${pal[i % pal.length]}"/><text class="small" x="${Math.min(right - 5, left + ww + 7)}" y="${y + rowH * .7}">${fmt(vals[i])}</text>`; });
    } else {
      for (let i = 0; i <= 4; i++) { const y = top + plotH * i / 4, v = max - span * i / 4; s += `<line class="grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="small" x="${left - 12}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; }
      if (g.tipo === 'histograma') {
        const bw = plotW / Math.max(1, vals.length);
        vals.forEach((v, i) => { const hh = Math.max(1, v / (max || 1) * plotH), x = left + i * bw; s += `<rect x="${x + 2}" y="${bottom - hh}" width="${Math.max(2, bw - 4)}" height="${hh}" fill="${pal[0]}"/><text class="small" x="${x + bw / 2}" y="${bottom + 22}" text-anchor="middle">${xml(String(labels[i]).slice(0, 18))}</text>`; });
      } else {
        const dx = labels.length > 1 ? plotW / (labels.length - 1) : plotW, points = vals.map((v, i) => `${left + i * dx},${bottom - (v - min) / span * plotH}`).join(' ');
        s += `<polyline points="${points}" fill="none" stroke="${pal[0]}" stroke-width="3" stroke-linejoin="round"/>`;
        vals.forEach((v, i) => { const x = left + i * dx, y = bottom - (v - min) / span * plotH; s += `<circle cx="${x}" cy="${y}" r="5" fill="${pal[0]}"/><text class="small" x="${x}" y="${bottom + 22}" text-anchor="middle">${xml(String(labels[i]).slice(0, 18))}</text>`; });
      }
      s += `<line class="axis" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"/><text class="label" x="510" y="520" text-anchor="middle">${xml(g.xLabel || '')}</text><text class="label" transform="translate(24 280) rotate(-90)" text-anchor="middle">${xml(g.yLabel || '')}</text>`;
    }
  }
  s += '<text class="small" x="480" y="548" text-anchor="middle">Gráfico calculado localmente · Paulus</text></svg>';
  return s;
}
