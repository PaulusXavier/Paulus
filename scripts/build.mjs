// Gera os arquivos que vão para o ar:
//   dist/paulus.v1.js       módulo do navegador (shared/*.mjs + client/*.mjs em um arquivo só, sem import/export)
//   dist/versao.json        versão, commit e impressão digital (sha256) de cada arquivo: os apps e o console comparam com ela para saber se há novidade
//   dist/pdf-lib.min.js     editor de PDF (vendor/), carregado sob demanda
//   dist/jspdf.umd.min.js + dist/jszip.min.js   geração local de relatórios PDF individuais
//   dist/pdf-encrypt.umd.js proteção AES-256 de PDF (vendor/), carregada sob demanda no console
//   dist/conhecimento.json  base de normas completa (cópia de knowledge/conhecimento.json; pesada)
//   dist/conhecimento-<pacote>.json  um arquivo por pacote (geral = leis e decretos, leve; psicologia = referências do CFP)
//
// Uso: npm run build   (antes, rode npm run build:conhecimento se mudou algo em knowledge/documentos)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, readdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Ordem importa: quem é usado vem antes de quem usa.
const MODULOS = ['shared/espanhol-dados.mjs', 'shared/espanhol.mjs', 'shared/ingles-dados.mjs', 'shared/ingles.mjs', 'shared/idioma-estudo.mjs', 'shared/idioma.mjs', 'shared/pii.mjs', 'shared/pseudonimo.mjs', 'shared/documento.mjs', 'shared/crise.mjs', 'shared/busca.mjs', 'shared/pedido.mjs', 'shared/conversa.mjs', 'shared/verificacao.mjs', 'shared/calculo.mjs', 'shared/datas.mjs', 'shared/calculo-mais.mjs', 'shared/matematica.mjs', 'shared/prova-local.mjs', 'shared/matematica-local.mjs', 'shared/psicometria.mjs', 'shared/est-nucleo.mjs', 'shared/est-posthoc.mjs', 'shared/grafico.mjs', 'shared/territorio-ct.mjs', 'shared/distrito-policial.mjs', 'shared/saude-mental-territorio.mjs', 'shared/equipe-cras-cristiana.mjs', 'shared/geo.mjs', 'shared/diretorio-boa-vista.mjs', 'shared/mapa-bairros.mjs', 'shared/resposta-local.mjs', 'shared/rota.mjs', 'shared/modelos.mjs', 'shared/qrcode.mjs', 'shared/revisao-texto.mjs', 'shared/ortografia.mjs', 'shared/pdf.mjs', 'shared/pdf-central.mjs', 'shared/visitas.mjs', 'shared/suicidio.mjs', 'shared/sugestoes.mjs', 'shared/fala.mjs', 'shared/resposta-extrativa.mjs', 'shared/saudacao-local.mjs', 'shared/rotinas.mjs', 'client/skins.mjs', 'client/memoria.mjs', 'client/paulus.mjs'];

const CABECALHO = '/*! Paulus v1 — gerado por scripts/build.mjs. Não edite: altere shared/ e client/. */\n(function (root) {\n\'use strict\';\n';
const RODAPE = '})(typeof self !== \'undefined\' ? self : this);\n';
const EXPORTA_NA_PAGINA = 'root.Paulus = Paulus;\nif (typeof module === \'object\' && module.exports) module.exports = Paulus;';

function tirarModulo(codigo) {
  return codigo
    // imports (sempre em UMA linha) viram linha em branco
    .replace(/^import\s[^\n]*;[ \t]*$/gm, '')
    // export default Paulus  ->  publica no navegador
    .replace(/^export default Paulus;[ \t]*$/m, EXPORTA_NA_PAGINA)
    // export function / const / class  ->  sem o "export"
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
}

export function juntar() {
  const blocos = MODULOS.map(function (caminho) {
    const codigo = readFileSync(join(RAIZ, caminho), 'utf8').replace(/\s+$/, '') + '\n';
    return '// ---- ' + caminho + ' ----\n' + tirarModulo(codigo);
  });
  const corpo = blocos.join('\n');
  if (/^\s*(import|export)\b/m.test(corpo)) {
    throw new Error('Sobrou import/export no arquivo do navegador. Use imports em UMA linha e "export function/const".');
  }
  return CABECALHO + corpo + RODAPE;
}

// Impressão digital dos arquivos que os apps baixam. Muda só quando o conteúdo muda; é o que permite atualizar sozinho (versao.json)
// e fazer o service worker do console trocar de cache a cada publicação.
const ARQUIVOS_VERSIONADOS = ['paulus.v1.js', 'conhecimento.json', 'conhecimento-geral.json', 'conhecimento-psicologia.json', 'pdf-lib.min.js', 'pdf-encrypt.umd.js', 'jspdf.umd.min.js', 'jszip.min.js', 'relatorio-individual-pdf.mjs', 'visitas.mjs', 'leaflet.js', 'lugares-boa-vista.json', 'login.js', 'console.js', 'advanced.js', 'ortografia.js', 'confirmar.js', 'lembretes.js', 'notas.js', 'agenda.js', 'agenda-datas.js', 'docs.js', 'relatorios-ui.mjs', 'relatorios-bf.mjs', 'relatorios-abrigos.mjs', 'abrigos-ui.mjs', 'rota-folhas.mjs', 'rota-visita-ui.mjs', 'planilhas-mds.mjs', 'planilhas-mds-ui.mjs', 'agenda-pdf.mjs', 'xlsx.bundle.js', 'index.html'];
export function gerarVersao(saida, extra) {
  const arquivos = {};
  for (const n of ARQUIVOS_VERSIONADOS) {
    const c = join(saida, n);
    if (existsSync(c)) arquivos[n] = { sha256: createHash('sha256').update(readFileSync(c)).digest('hex').slice(0, 16), bytes: statSync(c).size };
  }
  const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  const geral = createHash('sha256').update(Object.keys(arquivos).sort().map(function (n) { return n + arquivos[n].sha256; }).join('|')).digest('hex').slice(0, 12);
  const info = Object.assign({ versao: pacote.version, build: geral, commit: String(process.env.GITHUB_SHA || '').slice(0, 7) || null, arquivos: arquivos }, extra || {});
  writeFileSync(join(saida, 'versao.json'), JSON.stringify(info, null, 1));
  // service worker do console: o nome do cache leva a impressão digital, então cada publicação nova troca o cache e o aparelho atualiza sozinho
  const sw = join(saida, 'sw.js');
  if (existsSync(sw)) {
    const t = readFileSync(sw, 'utf8');
    if (!/var V = '[^']*';/.test(t)) throw new Error('sw.js sem a linha "var V = \'...\';" (nome do cache).');
    writeFileSync(sw, t.replace(/var V = '[^']*';/, "var V = 'paulus-console-" + geral + "';"));
  }
  return info;
}

export function construir() {
  const saida = join(RAIZ, 'dist');
  mkdirSync(saida, { recursive: true });
  writeFileSync(join(saida, 'paulus.v1.js'), juntar());
  copyFileSync(join(RAIZ, 'shared', 'QRCODE-LICENSE.txt'), join(saida, 'QRCODE-LICENSE.txt'));
  const base = join(RAIZ, 'knowledge', 'conhecimento.json');
  if (!existsSync(base)) throw new Error('Falta knowledge/conhecimento.json. Rode: npm run build:conhecimento');
  copyFileSync(base, join(saida, 'conhecimento.json'));
  // mapa de lugares (OpenStreetMap), se foi gerado por scripts/importar-mapa.mjs: o app o passa ao Paulus com { lugaresUrl }
  const lugares = join(RAIZ, 'knowledge', 'geo', 'lugares-boa-vista.json');
  if (existsSync(lugares)) copyFileSync(lugares, join(saida, 'lugares-boa-vista.json'));
  // pdf-lib (MIT), carregado pelo navegador só no primeiro pedido de PDF; fica ao lado do paulus.v1.js
  copyFileSync(join(RAIZ, 'vendor', 'pdf-lib.min.js'), join(saida, 'pdf-lib.min.js'));
  // Gerador PDF e ZIP local das planilhas de relatórios; os dados não saem do navegador.
  copyFileSync(join(RAIZ, 'vendor', 'jspdf.umd.min.js'), join(saida, 'jspdf.umd.min.js'));
  copyFileSync(join(RAIZ, 'vendor', 'jszip.min.js'), join(saida, 'jszip.min.js'));
  copyFileSync(join(RAIZ, 'vendor', 'relatorio-pdf.LICENSE.md'), join(saida, 'relatorio-pdf.LICENSE.md'));
  // AES-256 (MIT), carregado apenas quando o formulário local de senha é confirmado
  copyFileSync(join(RAIZ, 'vendor', 'pdf-encrypt.umd.js'), join(saida, 'pdf-encrypt.umd.js'));
  copyFileSync(join(RAIZ, 'vendor', 'pdf-encrypt.LICENSE.md'), join(saida, 'pdf-encrypt.LICENSE.md'));
  // Leaflet (BSD-2): mapa das rotas no console, baixado só quando uma resposta traz mapa
  copyFileSync(join(RAIZ, 'vendor', 'leaflet.js'), join(saida, 'leaflet.js'));
  // leitor de PDF (pdf.js, Apache-2.0), opcional: extrai texto local e renderiza páginas escaneadas (docs/DOCUMENTOS.md)
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) { const o = join(RAIZ, 'vendor', f); if (existsSync(o)) copyFileSync(o, join(saida, f)); else console.warn('AVISO: falta vendor/' + f + ': o console não vai ler PDF anexado (veja docs/DOCUMENTOS.md).'); }
  // modelos 3D didáticos (modelos/*.html): ficam em dist/modelos/ e o navegador só os baixa quando a pessoa pede
  const pastaModelos = join(RAIZ, 'modelos');
  if (existsSync(pastaModelos)) {
    mkdirSync(join(saida, 'modelos'), { recursive: true });
    for (const f of readdirSync(pastaModelos)) if (/\.html$/i.test(f)) copyFileSync(join(pastaModelos, f), join(saida, 'modelos', f));
  }
  // Console do Paulus (tela Jarvis, fora dos apps): dist/console.html
  copyFileSync(join(RAIZ, 'console', 'index.html'), join(saida, 'console.html'));
  copyFileSync(join(RAIZ, 'console', 'index.html'), join(saida, 'index.html')); // a raiz do site (…/Paulus/) abre o console
  // tela de login (carrega o console.js só depois de entrar) e o próprio console.js, se existir
  for (const f of ['login.js', 'console.js', 'advanced.js', 'ortografia.js', 'confirmar.js', 'lembretes.js', 'notas.js', 'agenda.js', 'agenda-datas.js', 'agenda-mds.js', 'docs.js', 'relatorios-ui.mjs', 'relatorio-individual-pdf.mjs', 'abrigos-ui.mjs', 'rota-visita-ui.mjs', 'planilhas-mds-ui.mjs', 'agenda-pdf.mjs', 'mapa-rotas.css', 'mapa-util.js', 'mapa-foco.js', 'mapa-offline.js', 'mapa-folhas.js', 'mapa-nuvem.js', 'mapa-rotas.js', 'mapa-ui.js', 'relatorios-nav.js']) { const o = join(RAIZ, 'console', f); if (existsSync(o)) copyFileSync(o, join(saida, f)); }
  copyFileSync(join(RAIZ, 'shared', 'relatorios-bf.mjs'), join(saida, 'relatorios-bf.mjs'));
  copyFileSync(join(RAIZ, 'shared', 'relatorios-abrigos.mjs'), join(saida, 'relatorios-abrigos.mjs'));
  copyFileSync(join(RAIZ, 'shared', 'rota-folhas.mjs'), join(saida, 'rota-folhas.mjs'));
  copyFileSync(join(RAIZ, 'shared', 'planilhas-mds.mjs'), join(saida, 'planilhas-mds.mjs'));
  copyFileSync(join(RAIZ, 'shared', 'visitas.mjs'), join(saida, 'visitas.mjs'));
  copyFileSync(join(RAIZ, 'vendor', 'xlsx-js-style', 'xlsx.bundle.js'), join(saida, 'xlsx.bundle.js'));
  // OCR local (tesseract.js + idioma português), opcional: só lê endereço de folhas escaneadas na Rota de Visita. Copie vendor/tesseract do Anona (docs/RELATORIOS-LOCAIS.md).
  const ocr = join(RAIZ, 'vendor', 'tesseract');
  if (existsSync(ocr)) cpSync(ocr, join(saida, 'tesseract'), { recursive: true });
  else console.warn('AVISO: falta vendor/tesseract: a Rota de Visita não vai ler endereço de folha escaneada (veja docs/RELATORIOS-LOCAIS.md).');
  // Dicionário de português do corretor (Hunspell + pt-BR do LibreOffice/VERO, o mesmo do Verbus): roda num Worker no aparelho. Pesa ~6 MB; só é baixado quando se pede revisão.
  const dic = join(RAIZ, 'vendor', 'spell');
  if (existsSync(dic)) cpSync(dic, join(saida, 'spell'), { recursive: true });
  else console.warn('AVISO: falta vendor/spell: a revisão fica só com as regras, sem o dicionário de português.');
  // instalável (PWA): procura em console/ e, se não achar, na raiz do repositório
  for (const f of ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    const origem = [join(RAIZ, 'console', f), join(RAIZ, f)].find(existsSync);
    if (!origem) throw new Error('Falta ' + f + ' (em console/ ou na raiz do repositório).');
    copyFileSync(origem, join(saida, f));
  }
  // um arquivo por pacote (ex.: conhecimento-psicologia.json), só quando há mais de um grupo; o que não tem pacote vai em "geral"
  const todos = JSON.parse(readFileSync(base, 'utf8'));
  const grupos = {};
  for (const t of todos) (grupos[t.pacote || 'geral'] = grupos[t.pacote || 'geral'] || []).push(t);
  if (Object.keys(grupos).length > 1) {
    for (const nome of Object.keys(grupos)) writeFileSync(join(saida, 'conhecimento-' + nome + '.json'), JSON.stringify(grupos[nome]));
  }
  gerarVersao(saida);
  return saida;
}

// Mostra quanto cada arquivo de conhecimento pesa, para ninguém mandar a base inteira a um app que só precisa do pacote leve.
export function relatorioDeTamanho(saida) {
  return ['conhecimento.json', 'conhecimento-geral.json', 'conhecimento-psicologia.json']
    .filter(function (n) { return existsSync(join(saida, n)); })
    .map(function (n) { return '  ' + n + ': ' + (statSync(join(saida, n)).size / 1048576).toFixed(2) + ' MB'; })
    .join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pasta = construir();
  console.log('Pronto: ' + pasta + '/paulus.v1.js e conhecimento*.json\n' + relatorioDeTamanho(pasta));
  console.log('Apps que só precisam do básico (ex.: Argo) devem usar conhecimento-geral.json, não o conhecimento.json inteiro.');
}
