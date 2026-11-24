// Transforma os cards das ABAS do Argo SUAS (fora do diretório de endereços) em documento de apoio da base do Paulus.
//
//   node scripts/importar-abas-argo.mjs <pasta-do-Argo> [knowledge/documentos/argo-cards-abas.md]
//   npm run build:conhecimento
//
// Complementa scripts/importar-enderecos-argo.mjs (que cuida dos 430 cards do diretório, de js/data.js).
// Lê, de js/app.js da pasta do Argo:
//   TOOLS_CATALOG / TOOLS_GROUPS / TOOLS_DESC / TOOLS_CATS  -> cards da aba Ferramentas
//   EXTERNAL_APPS / APPSEXT_GROUPS                          -> cards da aba Aplicativos
//   INFORMES_IMP                                            -> cards da aba Informes
//   PDFHUB_TOOLS / PDFHUB_GSLUG                             -> cards da Central de PDF
//   BPC_GUIDE_CONTENT (só o texto em português)             -> guias de BPC e recuperação de senha do INSS
//
// Regras (de propósito): copia só o que está nos cards; não inventa função que o card não diz. Sem ícone, imagem nem
// base64. Só o texto, para o Paulus responder "o que o Argo tem para X" e "onde fica Y". Sai `revisao: pendente`.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pastaArgo = resolve(process.argv[2] || '');
const saida = resolve(process.argv[3] || join(RAIZ, 'knowledge', 'documentos', 'argo-cards-abas.md'));
if (!process.argv[2]) {
  console.error('Uso: node scripts/importar-abas-argo.mjs <pasta-do-Argo> [saida.md]');
  process.exit(1);
}

const app = readFileSync(join(pastaArgo, 'js', 'app.js'), 'utf8');

// Pega o literal `const NOME = [ ... ];` ou `const NOME = { ... };` (fecha na primeira linha que começa com "];" ou "};").
function literal(nome) {
  const ini = app.indexOf('const ' + nome + ' =');
  if (ini < 0) throw new Error('js/app.js não tem ' + nome + '.');
  const abre = app.indexOf('=', ini) + 1;
  const primeiro = app.slice(abre).trimStart()[0];
  const fecha = primeiro === '[' ? '\n];' : '\n};';
  const fim = app.indexOf(fecha, ini);
  if (fim < 0) throw new Error('Não achei o fim de ' + nome + '.');
  const codigo = app.slice(abre, fim + fecha.length - 1).replace(/;\s*$/, '');
  // Constantes de imagem (base64) que alguns literais citam: viram texto vazio.
  const imgs = Array.from(app.matchAll(/const (BPC_[A-Z_]*IMG)\b/g)).map((m) => m[1]);
  const ctx = {};
  for (const i of imgs) ctx[i] = '';
  vm.createContext(ctx);
  return vm.runInContext('(' + codigo + ')', ctx);
}

const limpar = (t) => String(t == null ? '' : t)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const fim = (t) => { const x = limpar(t); return x && !/[.!?:]$/.test(x) ? x + '.' : x; };
const ref = (t) => limpar(t).replace(/^#+\s*/, '');
const ehInterno = (u) => /drive\.google\.com|docs\.google\.com/i.test(String(u || ''));

const linhas = [];
const hoje = new Date().toISOString().slice(0, 10);
linhas.push('---');
linhas.push('doc: argo-cards-abas');
linhas.push('titulo: Cards das abas do Argo SUAS (Ferramentas, Aplicativos, Informes, Central de PDF, guias de BPC)');
linhas.push('norma: Texto dos cards das abas do app Argo SUAS (js/app.js), copiado em ' + hoje + '. Não é norma: descreve o que o Argo oferece em cada aba. Valores e regras dos guias (renda, salário mínimo, prazos) mudam; confira na fonte oficial antes de orientar uma família.');
linhas.push('ano: ' + hoje.slice(0, 4));
linhas.push('tipo: apoio');
linhas.push('revisao: pendente');
linhas.push('---');
linhas.push('');
linhas.push('<!-- Gerado por scripts/importar-abas-argo.mjs. Não editar à mão: atualize o Argo (js/app.js) e rode o script de novo. -->');
linhas.push('');

const contagem = {};
const secao = (titulo, texto) => { linhas.push('## ' + ref(titulo)); linhas.push(limpar(texto)); linhas.push(''); };

// ---- Ferramentas ---------------------------------------------------------------------------------------------------------------
{
  const catalogo = literal('TOOLS_CATALOG');
  const grupos = literal('TOOLS_GROUPS');
  const desc = literal('TOOLS_DESC');
  const cats = Object.fromEntries(literal('TOOLS_CATS'));
  const porId = new Map(Object.entries(catalogo).map(([nome, v]) => [v.id, { nome, ...v }]));
  const grupoDoId = new Map();
  for (const g of grupos) for (const id of g.ids) grupoDoId.set(id, g);

  secao('Aba Ferramentas do Argo — visão geral',
    'A aba Ferramentas do Argo SUAS reúne ' + porId.size + ' ferramentas, em ' + grupos.length + ' grupos: ' +
    grupos.map((g) => g.titulo + ' (' + g.sub.replace(/\.$/, '') + '): ' + g.ids.map((id) => porId.get(id)?.nome || id).join(', ')).join('. ') +
    '. Cada ferramenta abre sozinha, em tela cheia, com botão de voltar; dá para marcar favoritas e a aba lembra as recentes. As ferramentas guardam só códigos neste aparelho, não dados de pessoas.');

  for (const g of grupos) {
    secao('Aba Ferramentas — grupo ' + g.titulo,
      'Grupo "' + g.titulo + '" da aba Ferramentas do Argo (' + limpar(g.sub) + '). Ferramentas: ' +
      g.ids.map((id) => (porId.get(id)?.nome || id) + (desc[id] ? ' — ' + limpar(desc[id]) : '')).join('; ') + '.');
  }

  for (const [id, f] of porId) {
    const g = grupoDoId.get(id);
    secao('Ferramenta do Argo — ' + f.nome,
      f.nome + ' é uma ferramenta da aba Ferramentas do Argo SUAS' + (g ? ', no grupo "' + g.titulo + '"' : '') +
      (cats[f.cat] ? ' (categoria ' + cats[f.cat] + ')' : '') + '. ' +
      (desc[id] ? 'O que faz: ' + fim(desc[id]) + ' ' : '') +
      (f.kw ? 'Palavras que levam a ela na busca do Argo: ' + limpar(f.kw) + '.' : ''));
  }
  contagem.ferramentas = porId.size;
}

// ---- Aplicativos ---------------------------------------------------------------------------------------------------------------
{
  const apps = literal('EXTERNAL_APPS');
  const grupos = Object.fromEntries(literal('APPSEXT_GROUPS').map((g) => [g.id, g.title]));
  secao('Aba Aplicativos do Argo — visão geral',
    'A aba Aplicativos do Argo SUAS tem atalhos para ' + apps.length + ' aplicativos e sites do autor: ' +
    apps.map((a) => limpar(a.name) + (grupos[a.cat] ? ' (' + grupos[a.cat] + ')' : '')).join('; ') + '. Cada um tem login e sincronização próprios.');
  for (const a of apps) {
    secao('Aplicativo do Argo — ' + a.name,
      limpar(a.name) + (a.tag ? ' (' + limpar(a.tag) + ')' : '') + ' é um atalho da aba Aplicativos do Argo SUAS' + (grupos[a.cat] ? ', no grupo "' + grupos[a.cat] + '"' : '') + '. ' +
      fim(a.desc) + ' ' + (Array.isArray(a.feats) && a.feats.length ? 'Destaques: ' + a.feats.map(limpar).join('; ') + '. ' : '') +
      (a.url ? 'Endereço: ' + a.url + '.' : ''));
  }
  contagem.aplicativos = apps.length;
}

// ---- Informes ------------------------------------------------------------------------------------------------------------------
{
  const inf = literal('INFORMES_IMP');
  const porGrupo = new Map();
  for (const i of inf) { if (!porGrupo.has(i.grupo)) porGrupo.set(i.grupo, []); porGrupo.get(i.grupo).push(i); }
  secao('Aba Informes do Argo — visão geral',
    'A aba Informes do Argo SUAS tem ' + inf.length + ' informes prontos para imprimir em A4, em ' + porGrupo.size + ' grupos: ' +
    Array.from(porGrupo.entries()).map(([g, l]) => g + ' (' + l.map((i) => limpar(i.titulo) + ' [' + i.lang + ']').join('; ') + ')').join('. ') + '.');
  for (const i of inf) {
    secao('Informe do Argo — ' + i.titulo + ' (' + i.lang + ')',
      limpar(i.titulo) + ' é um informe da aba Informes do Argo, grupo "' + limpar(i.grupo) + '", em ' + (i.lang === 'ES' ? 'espanhol' : 'português') +
      ', com ' + i.pags + (i.pags === 1 ? ' página' : ' páginas') + ' em A4, pronto para imprimir. ' + fim(i.desc));
  }
  contagem.informes = inf.length;
}

// ---- Central de PDF ------------------------------------------------------------------------------------------------------------
{
  const ferr = literal('PDFHUB_TOOLS');
  const porGrupo = new Map();
  for (const t of ferr) { if (!porGrupo.has(t.group)) porGrupo.set(t.group, []); porGrupo.get(t.group).push(t); }
  secao('Central de PDF do Argo — visão geral',
    'A Central de PDF do Argo SUAS tem ' + ferr.length + ' ferramentas, em ' + porGrupo.size + ' grupos: ' +
    Array.from(porGrupo.entries()).map(([g, l]) => g + ' (' + l.map((t) => limpar(t.name)).join(', ') + ')').join('. ') +
    '. Os arquivos são tratados no próprio aparelho.');
  for (const t of ferr) {
    secao('Central de PDF do Argo — ' + t.name,
      limpar(t.name) + ' é uma ferramenta da Central de PDF do Argo, grupo "' + limpar(t.group) + '". ' + fim(t.desc) + ' ' +
      (t.go ? 'Não abre dentro da Central: fica na aba ' + (t.go === 'criptografia' ? 'Criptografia' : t.go) + '. ' : '') +
      (t.kw ? 'Palavras que levam a ela na busca: ' + limpar(t.kw) + '.' : ''));
  }
  contagem.pdf = ferr.length;
}

// ---- Guias de BPC e senha do INSS (só português, sem imagem) --------------------------------------------------------------------
{
  const guias = literal('BPC_GUIDE_CONTENT');
  const ROT = { reqLabel: 'requirements', stepsLabel: 'steps', channelsTitle: 'channels', valueLabel: 'value', denialLabel: 'denial', contactLabel: 'contact', crasClarificationLabel: 'crasClarification' };
  const NOMES = { badge: 'Guia', title: 'Título', intro: 'Resumo', requirements: 'Quem tem direito', steps: 'Passo a passo', channels: 'Como dar entrada',
    channelsIntro: 'Antes de pedir', channelsNote: 'Depois de pedir', value: 'Valor e pagamento', denial: 'Se o pedido for negado', contact: 'Onde buscar ajuda',
    crasClarification: 'Papel do CRAS e do INSS', familyComposition: 'Composição familiar' };
  const texto = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return limpar(v);
    if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(' | ');
    if (typeof v === 'object') return Object.entries(v).filter(([k]) => !/^(img|image|icon|url|href)$/i.test(k)).map(([k, x]) => {
      const t = texto(x); return t ? (/^\d+$/.test(k) ? t : limpar(k) + ': ' + t) : '';
    }).filter(Boolean).join('; ');
    return String(v);
  };
  let n = 0;
  for (const [id, g] of Object.entries(guias)) {
    const pt = g.pt || g;
    const partes = [];
    for (const [k, v] of Object.entries(pt)) {
      if (ROT[k] || /Label$/.test(k) && !NOMES[k]) continue;
      const t = texto(v);
      if (t) partes.push((NOMES[k] || k) + ': ' + fim(t));
    }
    secao('Guia do Argo (' + id + ') — ' + (pt.title || id),
      'Guia do card "' + id + '" do Argo SUAS (versão em português; o card também tem versão em espanhol). ' + partes.join(' '));
    n++;
  }
  contagem.guias = n;
}

writeFileSync(saida, linhas.join('\n'), 'utf8');
console.log('Gerado ' + saida + ' (' + Math.round(Buffer.byteLength(linhas.join('\n')) / 1024) + ' KB): ' +
  Object.entries(contagem).map(([k, v]) => v + ' ' + k).join(', ') + '.');
