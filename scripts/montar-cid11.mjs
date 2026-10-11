// Monta knowledge/documentos/oms-cid11-guia-2024.md a partir do texto do Guia de Referência da CID-11 (pt).
// Uso: node montar-cid11.mjs <guia.txt> <saida.md>
// Títulos vêm do SUMÁRIO do próprio guia (linhas 1-648), para a citação ter a seção certa.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , entrada, saida] = process.argv;
const linhas = readFileSync(entrada, 'utf8').replace(/\r/g, '').split('\n');

// 1) Sumário -> mapa numero -> titulo completo
const toc = new Map();
let atual = null;
for (let i = 0; i < 648; i++) {
  const l = linhas[i].trim();
  const m = /^(\d+(?:\.\d+)*)\s+(\S.*)$/.exec(l);
  if (m && !/^\d+\s*$/.test(l)) {
    atual = { num: m[1], titulo: m[2].trim() };
    if (!toc.has(m[1])) toc.set(m[1], atual);
  } else if (atual && l && !/^\d+\s*$/.test(l)) {
    atual.titulo += ' ' + l;
  } else if (!l || /^\d+\s*$/.test(l)) {
    atual = null;
  }
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim();

// 2) Trechos do guia que entram (linhas, 1-based, inclusive)
const FAIXAS = [
  [649, 1899], [1900, 2750], [8936, 8976], [9173, 9793], [10800, 10802], [10938, 10945], [10985, 10992],
  [11118, 11267], [11821, 12079], [12262, 12438], [13152, 13176], [13347, 13537], [13735, 13787],
  [18312, 18414], [19397, 19459]
];

// Quadros (tabelas) reescritos linha a linha a partir do guia, pois o texto extraído mistura as colunas.
const QUADROS = {
  '3.15.6': [
    'F00-F09 Transtornos mentais orgânicos, inclusive os sintomáticos → CID-11: Transtornos neurocognitivos.',
    'F10-F19 Transtornos mentais e comportamentais devido ao uso de substância psicoativa → CID-11: parte do agrupamento Transtornos decorrentes do uso de substâncias ou comportamentos aditivos.',
    'F20-F29 Esquizofrenia, transtornos esquizotípicos e transtornos delirantes → CID-11: Esquizofrenia ou outros transtornos psicóticos primários.',
    "F30-F39 Transtornos do humor [afetivos] → CID-11: Transtornos do humor.",
    "F40-F48 Transtornos neuróticos, transtornos relacionados com o 'stress' e transtornos somatoformes → CID-11: Transtornos de ansiedade ou relacionados ao medo.",
    'F50-F59 Síndromes comportamentais associadas a disfunções fisiológicas e a fatores físicos → CID-11: redistribuído entre Transtornos alimentares ou da alimentação, Transtornos mentais ou comportamentais associados a gravidez, parto ou puerpério, e novos capítulos para Distúrbios do sono e Saúde sexual.',
    'F60-F69 Transtornos da personalidade e do comportamento do adulto → CID-11: Transtornos de personalidade e traços relacionados.',
    'F70-F79 Retardo mental → CID-11: parte do agrupamento Transtornos do neurodesenvolvimento.',
    'F80-F89 Transtornos do desenvolvimento psicológico → CID-11: parte do agrupamento Transtornos do neurodesenvolvimento.',
    'F90-F98 Transtornos do comportamento e transtornos emocionais que aparecem habitualmente durante a infância ou a adolescência → CID-11: parte do agrupamento Transtornos do neurodesenvolvimento.',
    'F99-F99 Transtorno mental não especificado → CID-11: categoria residual não especificada para o capítulo.'
  ],
  '3.15.7': [
    'Códigos dos capítulos de Saúde Mental e Sistema Nervoso → CID-11 (Capítulo 07): Transtornos de insônia.',
    'Conceito não incluído na CID-10 → CID-11 (Capítulo 07): Transtornos do movimento relacionados ao sono.',
    'Códigos dos capítulos de Saúde Mental e Sistema Nervoso → CID-11 (Capítulo 07): Transtornos de hipersonolência.',
    'Códigos dos capítulos de Neurologia e Endocrinologia → CID-11 (Capítulo 07): Transtornos respiratórios relacionados ao sono.',
    'Códigos do capítulo de Saúde Mental → CID-11 (Capítulo 07): Transtornos de parassonia.',
    'Códigos do capítulo de Neurologia → CID-11 (Capítulo 07): Distúrbios do ciclo sono-vigília.',
    'Códigos do capítulo de Neurologia → CID-11 (Capítulo 07): Alguns distúrbios do sono especificados.'
  ],
  '3.15.24': [
    'Z00-Z13 Pessoas em contato com os serviços de saúde para exame e investigação → CID-11: Contato com os serviços de saúde para fins de exame ou investigação, uma seção sob o agrupamento Razões para contato com os serviços de saúde.',
    'Z20-Z29 Pessoas com riscos potenciais à saúde relacionados com doenças transmissíveis → CID-11: Contato com ou exposição a doenças transmissíveis, uma seção sob o agrupamento Razões para contato com os serviços de saúde.',
    'Z30-Z39 Pessoas em contato com os serviços de saúde em circunstâncias relacionadas com a reprodução → CID-11: Contato com os serviços de saúde por motivos relacionados à reprodução, uma seção sob o agrupamento Razões para contato com os serviços de saúde.',
    'Z40-Z54 Pessoas em contato com os serviços de saúde para procedimentos e cuidados específicos → CID-11: dividido em duas novas seções, sob Razões para contato com os serviços de saúde: Contato com serviços de saúde para intervenções cirúrgicas específicas; Contato com serviços de saúde para intervenções não cirúrgicas e que não envolvem dispositivos.',
    'Z55-Z65 Pessoas com riscos potenciais à saúde relacionados com circunstâncias socioeconômicas e psicossociais → CID-11: reorganizado e agora aparece sob o agrupamento principal de Fatores que influenciam o estado de saúde.',
    'Z70-Z76 Pessoas em contato com os serviços de saúde em outras circunstâncias → CID-11: reorganizado e agora aparece sob o agrupamento principal de Fatores que influenciam o estado de saúde.',
    'Z80-Z99 Pessoas com riscos potenciais à saúde relacionados com história familiar e pessoal e algumas afecções que influenciam o estado de saúde → CID-11: reorganizado e agora aparece sob o agrupamento principal de Fatores que influenciam o estado de saúde.'
  ]
};

// 3) Percorre as faixas, quebrando em seções pelos títulos numerados do sumário
const secoes = [];
let cur = null;
for (const [a, b] of FAIXAS) {
  for (let i = a - 1; i < b; i++) {
    const l = linhas[i].replace(/\u00ad/g, '').replace(/[\u00a0\t]/g, ' ').trim();
    const m = /^(\d+(?:\.\d+)+|\d)\s+(\S.*)$/.exec(l);
    if (m && toc.has(m[1])) {
      const t = toc.get(m[1]);
      const completo = norm(t.num + ' ' + t.titulo);
      // linha de título = começo do título do sumário (o título pode quebrar em 2 linhas)
      if (completo.startsWith(norm(l)) && norm(l).length >= 6) {
        let consumido = norm(l);
        let j = i;
        while (consumido.length < completo.length && j + 1 < b) {
          const prox = linhas[j + 1].trim();
          const tentativa = (consumido + ' ' + norm(prox)).trim();
          if (prox && completo.startsWith(tentativa)) { consumido = tentativa; j++; } else break;
        }
        if (consumido.length >= completo.length - 1) {
          cur = { num: t.num, titulo: t.titulo, texto: [] };
          secoes.push(cur);
          i = j;
          continue;
        }
      }
    }
    if (cur) cur.texto.push(l);
  }
  cur = null;
}

// 4) Reflow: junta linhas, tira número de página e cabeçalhos de quadro, corta em trechos de até ~900 caracteres por frase
const MAX = 900;
function limpa(textoLinhas) {
  return textoLinhas
    .filter(l => l && !/^\d{1,3}$/.test(l))
    .join(' ')
    .replace(/(https?:\/\/\S*[-\/]) (?=\S)/g, '$1') // endereço quebrado em duas linhas
    .replace(/\s+/g, ' ')
    .trim();
}
function corta(t) {
  if (t.length <= MAX) return [t];
  const frases = t.split(/(?<=[.:;?!])\s+(?=[A-ZÀ-Ý•(\d"])/);
  const partes = [];
  let acc = '';
  for (const f of frases) {
    if (acc && (acc + ' ' + f).length > MAX) { partes.push(acc); acc = f; } else acc = acc ? acc + ' ' + f : f;
  }
  if (acc) partes.push(acc);
  // frase única gigante: corta por palavras
  const fim = [];
  for (const p of partes) {
    if (p.length <= MAX * 1.3) { fim.push(p); continue; }
    let rest = p;
    while (rest.length > MAX) { let k = rest.lastIndexOf(' ', MAX); if (k < 300) k = MAX; fim.push(rest.slice(0, k)); rest = rest.slice(k).trim(); }
    if (rest) fim.push(rest);
  }
  return fim;
}

let md = `---
doc: oms-cid11-guia-2024
titulo: CID-11: Guia de Referência (seleção para saúde mental e SUAS)
norma: OMS, Classificação Internacional de Doenças, 11ª Revisão (CID-11), Guia de Referência, versão 2024-01 em português (licença CC BY-ND 3.0 IGO). Seleção: introdução, convenções, funcionalidade, morbidade, Capítulos 06, 07 e 24
ano: 2024
tipo: referencia
pacote: psicologia
url: https://icdcdn.who.int/icd11referenceguide/en/html/index.html
revisao: pendente
---

<!--
Montado por scripts/montar-cid11.mjs a partir do PDF "ICD-11 Reference Guide 2024-01 (pt)". Só as partes úteis à saúde mental e ao SUAS;
ficaram de fora as regras de mortalidade e os demais capítulos. Os quadros CID-10 → CID-11 foram reescritos linha a linha.
Este guia explica COMO a CID-11 funciona; ele NÃO traz a lista completa de códigos. Para o código exato de um diagnóstico, consultar icd.who.int.
-->
`;
let n = 0;
const vistos = new Map();
for (const s of secoes) {
  let texto = QUADROS[s.num] ? limpa(s.texto.slice(0, 0)) : '';
  let partesTexto;
  if (QUADROS[s.num]) {
    // introdução do bloco (até "Quadro 1") + linhas do quadro
    const bruto = limpa(s.texto);
    const intro = bruto.split(/Quadro 1:/)[0].trim();
    partesTexto = (intro ? corta(intro) : []).concat(QUADROS[s.num].reduce((acc, linha) => {
      const ult = acc[acc.length - 1];
      if (ult && (ult + ' ' + linha).length <= MAX) acc[acc.length - 1] = ult + ' ' + linha; else acc.push(linha);
      return acc;
    }, []));
  } else {
    partesTexto = corta(limpa(s.texto));
  }
  partesTexto = partesTexto.filter(Boolean);
  if (!partesTexto.length) continue;
  const base = (s.num + ' ' + s.titulo).replace(/\s+/g, ' ').slice(0, 150);
  const k = (vistos.get(base) || 0);
  vistos.set(base, k + 1);
  partesTexto.forEach((p, i) => {
    md += `\n## ${base}${partesTexto.length > 1 ? ' (parte ' + (i + 1) + ' de ' + partesTexto.length + ')' : ''}${k ? ' [bis ' + (k + 1) + ']' : ''}\n${p}\n`;
    n++;
  });
}
writeFileSync(saida, md);
console.log(n + ' trechos,', secoes.length + ' seções,', md.length + ' caracteres');
