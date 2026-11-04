// Limpa o texto extraído de uma edição da Câmara dos Deputados ("Série Legislação") antes de importar:
// tira notas de rodapé, cabeçalhos de página, marcadores de nota colados no texto e dispositivos revogados.
//
// Uso:  node scripts/limpar-camara.mjs bruto.txt limpo.txt
//       node scripts/importar-norma.mjs limpo.txt --doc ... (como em docs/CONHECIMENTO.md)
//
// Confira sempre o resultado com o texto oficial: as notas de rodapé também trazem as alterações da lei,
// e o texto compilado pode estar desatualizado.

import { readFileSync, writeFileSync } from 'node:fs';

const RE_NOTA_RODAPE = /^\d{1,3}\s+(?:Idem\b|Publicad[oa]\b|Caput\b|Inciso\b|Par[aá]grafo\b|Al[ií]nea\b|Artigo\b|Express[aã]o\b|Item\b|Vetad[oa]\b|Vide\b|Retificad[oa]\b|Nota\b|Cap[ií]tulo\b|Se[cç][aã]o\b|T[ií]tulo\b|Anexo\b|Regulament|Texto\b|Dispositivo\b|Redação\b|Reda[cç][aã]o\b|Revogad|Acrescid|Alterad|Incluíd|Inclu[ií]d)|^\d{1,3}\s+.*\b(?:Lei|Decreto|Medida Provisória|Resolução|Portaria)\b.*\d.*[.]$/;
const RE_CABECALHO = /^(?:S[ée]rie|\d{1,3}\s+Legisla[cç][aã]o|Legisla[cç][aã]o\s+\d{1,3}|.{0,60}\(Loas\)\s+\d{1,3}|Decreto n[ºo°] [\d.]+, de .{0,40}\s+\d{1,3})$/i;

export function limpar(texto) {
  const saida = [];
  let anteriorFimFrase = true;
  for (let linha of texto.replace(/\r/g, '').split('\n')) {
    linha = linha.replace(/\u0002/g, '').replace(/­/g, '').replace(/ /g, ' ').trimEnd();
    const t = linha.trim();
    if (!t) continue;
    if (RE_NOTA_RODAPE.test(t) || RE_CABECALHO.test(t)) continue;
    linha = t
      .replace(/(\S)\s*\d{1,3}(?=(?:[IVXLC]+\s*[–-]|Art\.\s*\d))/g, '$1\n')  // "...; 30II – cofinanciar", "66Art. 23."
      .replace(/(\S)\s*\d{1,3}(§\s*\d+\s*[ºo°.]?)/g, '$1\n$2')      // "...art. 18. 11§ 2º" -> nota colada no próximo §
      .replace(/^\d{1,3}(?=§)/, '')                          // "10§ 1º" -> número de nota colado no §
      .replace(/([:;.,])\s+\d{1,3}(?=\s*$)/, '$1')            // "objetivos: 3" -> marcador de nota no fim da linha
      .replace(/(\S)\s+\d{1,3}\s+(?=[IVXLC]+\s*[–-])/g, '$1 ') // marcador antes de inciso
      .trim();
    // títulos de capítulo/seção em caixa mista ("Seção I", "Dos Princípios e das Diretrizes")
    if (/^(?:CAP[ÍI]TULO|Cap[ií]tulo|SE[ÇC][ÃA]O|Se[çc][ãa]o|Subse[çc][ãa]o|T[ÍI]TULO|T[ií]tulo)\s+[IVXLC\d]+\b.{0,60}$/.test(linha)) { anteriorFimFrase = true; continue; }
    if (anteriorFimFrase && /^(?:Das?|Dos?|Disposi[çc][õo]es)\s[^.;:]{3,65}$/.test(linha)) continue;
    anteriorFimFrase = /[.;:]$/.test(linha);
    if (/^[IVXLC]+\s*[–-]\s*\(Revogad[oa]\)[;.]?$/i.test(linha)) continue;
    if (/^(?:§\s*\d+\s*[ºo°]?|Art\.?\s*\d+\s*[ºo°]?)\s*[–-]?\s*\(Revogad[oa]\)\.?$/i.test(linha)) continue;
    saida.push(linha);
  }
  return saida.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('limpar-camara.mjs')) {
  const [entrada, destino] = process.argv.slice(2);
  if (!entrada || !destino) { console.error('Uso: node scripts/limpar-camara.mjs bruto.txt limpo.txt'); process.exit(1); }
  writeFileSync(destino, limpar(readFileSync(entrada, 'utf8')));
  console.log('Limpo:', destino);
}
