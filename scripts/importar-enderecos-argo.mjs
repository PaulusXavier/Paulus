// Transforma o diretório de endereços do Argo SUAS em documento de apoio da base do Paulus.
//
//   node scripts/importar-enderecos-argo.mjs <pasta-do-Argo> [knowledge/documentos/argo-enderecos-diretorio.md]
//   npm run build:conhecimento
//
// Lê, da pasta do Argo (Projeto-Argo-SUAS):
//   js/data.js  -> const DATA = [...]  (as fichas do diretório: nome, endereço, telefones, horário, serviços, site)
//   js/app.js   -> const UNITS_CRAS_CREAS = {...}  (CRAS/CREAS de Boa Vista: endereço, telefone, bairros atendidos, coordenada)
//
// Saída: um .md no formato de knowledge/documentos (tipo apoio, revisao pendente), com
//   - um trecho por unidade (endereço, telefone, horário, serviços, site);
//   - um trecho por grupo, com a lista de nomes e endereços (para "quais são os CRAS", "onde ficam as UBS");
//   - um trecho por CRAS/CREAS com os bairros que cada um atende e a coordenada.
//
// Regras (de propósito): copia só o que está no diretório; não completa endereço, telefone nem horário que faltam
// ("N/A" vira "não informado"). Só serviço e órgão público, nunca residência. Não é cadastro oficial: o diretório do Argo
// é mantido à mão, por isso sai `revisao: pendente`.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pastaArgo = resolve(process.argv[2] || '');
const saida = resolve(process.argv[3] || join(RAIZ, 'knowledge', 'documentos', 'argo-enderecos-diretorio.md'));
if (!process.argv[2]) {
  console.error('Uso: node scripts/importar-enderecos-argo.mjs <pasta-do-Argo> [saida.md]');
  process.exit(1);
}

// ---- leitura -------------------------------------------------------------------------------------------------------------------
function carregarData() {
  const src = readFileSync(join(pastaArgo, 'js', 'data.js'), 'utf8') + '\n;globalThis.__DATA = DATA;';
  const ctx = { console, EQUIPE_CRAS_CRISTIANA: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (!Array.isArray(ctx.__DATA)) throw new Error('js/data.js não definiu o array DATA.');
  return ctx.__DATA;
}

function carregarUnidades() {
  const app = readFileSync(join(pastaArgo, 'js', 'app.js'), 'utf8');
  const ini = app.indexOf('const UNITS_CRAS_CREAS');
  if (ini < 0) throw new Error('js/app.js não tem UNITS_CRAS_CREAS.');
  const fim = app.indexOf('\n};', ini);
  const trecho = app.slice(ini, fim + 3) + '\n;globalThis.__U = UNITS_CRAS_CREAS;';
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(trecho, ctx);
  return ctx.__U;
}

// ---- limpeza de texto ----------------------------------------------------------------------------------------------------------
const limpar = (t) => String(t == null ? '' : t)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const ehNA = (t) => !t || /^n\/?a$/i.test(String(t).trim());
// O cabeçalho "## ..." vira a referência citável: sem quebra de linha, sem "#" no começo.
const ref = (t) => limpar(t).replace(/^#+\s*/, '');

const ROTULO_CAT = {
  hospitalar: 'Hospitais e urgência', saude: 'Saúde', interior: 'Interior de Roraima', social: 'Assistência social',
  delegacias: 'Delegacias e segurança', educacao: 'Educação', juridico: 'Jurídico e defensoria', informes: 'Informes e canais de atendimento',
  alimentar: 'Alimentação e segurança alimentar', tea: 'Autismo (TEA) e neurodesenvolvimento', previdencia: 'Previdência e INSS',
  migracao: 'Migração e refúgio', trabalho: 'Trabalho, emprego e renda', mobilidade: 'Mobilidade e transporte', documentacao: 'Documentação',
  bancos: 'Bancos', conselho: 'Conselhos', conselhosdireitos: 'Conselhos de direitos', habitacao: 'Habitação', cultura: 'Cultura',
  defesacivil: 'Defesa Civil', idoso: 'Pessoa idosa', mulher: 'Mulher', cras: 'CRAS', cas: 'CAS',
};
const grupoDe = (d) => d.group || ROTULO_CAT[(d.cat || [])[0]] || 'Outros serviços';

// Endereço sem número nem "s/n": o diretório só informa bairro ou rodovia. Vale avisar, para ninguém mandar a pessoa a um lugar errado.
const soBairro = (end) => !/\d/.test(end) && !/\bs\/?n\b/i.test(end);

// ---- montagem ------------------------------------------------------------------------------------------------------------------
const DATA = carregarData();
const UNIDADES = carregarUnidades();

const vistas = new Map();
function referenciaUnica(base, id) {
  let r = ref(base);
  if (vistas.has(r)) r = ref(base + ' (' + id + ')');
  vistas.set(r, true);
  return r;
}

function fichaDaUnidade(d) {
  const nome = limpar(d.fullName || d.name);
  const end = ehNA(d.address) ? '' : limpar(d.address);
  const fones = (d.phones || []).map(limpar).filter((p) => !ehNA(p));
  const hor = ehNA(d.hours) ? '' : limpar(d.hours);
  const serv = ehNA(d.services) ? '' : limpar(d.services);
  const partes = [nome + (d.fullName && d.name && limpar(d.name) !== nome ? ' (no Argo: ' + limpar(d.name) + ')' : '') + '.'];
  partes.push('Grupo: ' + grupoDe(d) + '.');
  partes.push('Endereço: ' + (end || 'não informado no diretório') + '.');
  if (end && soBairro(end)) partes.push('Atenção: o diretório do Argo só informa o bairro ou a rodovia, sem logradouro e número; confirme o endereço completo com a unidade.');
  partes.push('Telefone: ' + (fones.length ? fones.join('; ') : 'não informado no diretório') + '.');
  if (hor) partes.push('Horário: ' + hor + (/[.!?]$/.test(hor) ? '' : '.'));
  if (serv) partes.push('Serviços: ' + serv + (/[.!?]$/.test(serv) ? '' : '.'));
  if (d.website) partes.push('Site: ' + limpar(d.website) + '.');
  return partes.join(' ');
}

const grupos = new Map();
for (const d of DATA) {
  const g = grupoDe(d);
  if (!grupos.has(g)) grupos.set(g, []);
  grupos.get(g).push(d);
}

const linhas = [];
const hoje = new Date().toISOString().slice(0, 10);
linhas.push('---');
linhas.push('doc: argo-enderecos-diretorio');
linhas.push('titulo: Diretório de endereços do Argo SUAS');
linhas.push('norma: Diretório de equipamentos e serviços do app Argo SUAS (js/data.js e UNITS_CRAS_CREAS), copiado em ' + hoje + '. Não é norma nem cadastro oficial: é o diretório mantido pela equipe do Argo, e endereço, telefone e horário mudam. Confirme com a unidade antes de encaminhar uma pessoa.');
linhas.push('ano: ' + hoje.slice(0, 4));
linhas.push('tipo: apoio');
linhas.push('revisao: pendente');
linhas.push('---');
linhas.push('');
linhas.push('<!-- Gerado por scripts/importar-enderecos-argo.mjs. Não editar à mão: atualize o diretório no Argo (js/data.js) e rode o script de novo. -->');
linhas.push('');

// Resumo
const resumoGrupos = Array.from(grupos.entries()).map(([g, l]) => g + ' ' + l.length).join('; ');
linhas.push('## Resumo do diretório de endereços do Argo');
linhas.push(DATA.length + ' unidades e serviços em ' + grupos.size + ' grupos, mais ' + (UNIDADES.cras.length + UNIDADES.creas.length) + ' unidades de CRAS, CREAS e acolhimento de Boa Vista com os bairros que atendem. Por grupo: ' + resumoGrupos + '. Cada unidade tem endereço, telefone, horário e serviços quando o diretório informa; o que está como "não informado" não consta no diretório e o Paulus não completa de cabeça.');
linhas.push('');

// CRAS e CREAS com território
const fmtBairros = (b) => limpar(b);
for (const [tipo, lista] of [['CRAS', UNIDADES.cras], ['CREAS e acolhimento', UNIDADES.creas]]) {
  for (const u of lista) {
    const fone = ehNA(u.phone) ? 'não informado' : limpar(u.phone);
    const t = [limpar(u.name) + '.', 'Endereço: ' + limpar(u.address) + ', Boa Vista-RR.', 'Telefone: ' + fone + '.',
      'Coordenada: ' + Number(u.lat).toFixed(6) + ', ' + Number(u.lng).toFixed(6) + '.',
      (tipo === 'CRAS' || /CREAS/.test(u.name) ? 'Bairros e comunidades que atende: ' : 'Público: ') + fmtBairros(u.bairros) + (/[.!?]$/.test(fmtBairros(u.bairros)) ? '' : '.')];
    linhas.push('## ' + referenciaUnica(tipo + ' de Boa Vista — endereço e território — ' + u.name, u.name));
    linhas.push(t.join(' '));
    linhas.push('');
  }
}

// Lista por grupo
for (const [g, lista] of grupos) {
  const itens = lista.map((d) => {
    const end = ehNA(d.address) ? 'endereço não informado' : limpar(d.address);
    return limpar(d.name) + ': ' + end;
  });
  linhas.push('## ' + referenciaUnica('Lista de endereços — ' + g, g));
  linhas.push(lista.length + ' em "' + g + '". ' + itens.join(' | '));
  linhas.push('');
}

// Uma ficha por unidade
for (const [g, lista] of grupos) {
  for (const d of lista) {
    linhas.push('## ' + referenciaUnica(g + ' — ' + limpar(d.name), d.id));
    linhas.push(fichaDaUnidade(d));
    linhas.push('');
  }
}

writeFileSync(saida, linhas.join('\n'), 'utf8');
const tam = Buffer.byteLength(linhas.join('\n'));
console.log('Gerado ' + saida + ' (' + Math.round(tam / 1024) + ' KB): ' + DATA.length + ' unidades, ' + grupos.size + ' grupos, ' + (UNIDADES.cras.length + UNIDADES.creas.length) + ' CRAS/CREAS com território.');
const semEnd = DATA.filter((d) => ehNA(d.address)).length;
const soB = DATA.filter((d) => !ehNA(d.address) && soBairro(d.address)).length;
console.log('Sem endereço: ' + semEnd + '. Só bairro/rodovia (sem número): ' + soB + '.');
