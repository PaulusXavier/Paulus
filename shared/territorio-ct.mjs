// Consulta local dos territórios dos Conselhos Tutelares de Boa Vista, espelhados do diretório do Argo SUAS.
// Sem IA, sem rede e sem inferir pelo CRAS ou por bairros vizinhos.
const CTS = [
  { id: 'I', address: 'R. Bento Brasil, 835 - Centro, Boa Vista-RR', phone: '(95) 98410-4003', hours: '08:00 às 18:00 (Plantão 24h)', bairros: ['Aeroporto','Cauamé','Calungá','Liberdade','Jardim Floresta','Pricumã','13 de Setembro','São Vicente','Centro','São Pedro','Aparecida','Canarinho','Paraviana','Caçari','Bairro dos Estados','31 de Março','São Francisco','Mecejana','Monte Cristo','Said Salomão','Áreas Indígenas'] },
  { id: 'II', address: 'R. Dico Viêira, 1497 - Caimbé, Boa Vista-RR', phone: '(95) 98403-7780', hours: '08:00 às 18:00 (Plantão 24h)', bairros: ['Jardim Caranã','Caranã','Tancredo Neves','Caimbé','Asa Branca','Buritis','Jóquei Clube','União','Cinturão Verde','Centenário','Araceli','São Bento','Raiar do Sol','Bela Vista','Operário','Nova Cidade','Brigadeiro','Distrito Industrial','Pérola'] },
  { id: 'III', address: 'R. Pedro Aldemar Bantim, 1337 - Silvio Botelho, Boa Vista-RR', phone: '(95) 98411-6943', hours: '08:00 às 18:00 (Plantão 24h)', bairros: ['Cidade Satélite','Piscicultura','Jardim Primavera','Santa Tereza','Dr. Silvio Botelho','Dr. Silvio Leite','Alvorada','Pintolândia','Jardim Olímpico','Hélio Campos','Equatorial','Santa Luzia','Nova Canaã','Cambará','Cruviana','Laura Moreira'] }
];
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(doutor|doutora|dr|dra)\b/g,'dr').replace(/\b(bairro|conjunto)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
function linha(ct) { return `Conselho Tutelar ${ct.id} — ${ct.address} · ${ct.phone} · ${ct.hours}`; }
export function respostaDeTerritorioCT(texto) {
  const n = norm(texto);
  if (!/(conselh(?:o|os)(?:\s+tutelar(?:es)?)?|\bct\b|territorio.{0,20}conselh|conselh.{0,20}territorio)/.test(n)) return null;
  const escolhidos = CTS.filter(ct => new RegExp(`\\b(?:conselho tutelar|ct)\\s*(?:territorio\\s*)?(?:n\\s*|numero\\s*)?(?:${ct.id.toLowerCase()}|${ct.id === 'I' ? '1|primeiro' : ct.id === 'II' ? '2|segundo' : '3|terceiro'})\\b`).test(n));
  const pedidoLista = /\b(quais|lista|listar|bairros|territorios|divididos|divisao)\b/.test(n);
  const linhas = [];
  if (pedidoLista && escolhidos.length) {
    for (const ct of escolhidos) linhas.push(`Conselho Tutelar ${ct.id} (${ct.bairros.length} bairros): ${ct.bairros.join('; ')}.\n• ${linha(ct)}`);
    return { tipoTerritorio: 'conselho', texto: linhas.join('\n\n') + '\nLista do diretório do Argo SUAS; confirme por telefone, especialmente em bairros extensos ou de divisa.' };
  }
  if (/\b(quantos|numero|existem)\b/.test(n) && /conselh/.test(n)) return { tipoTerritorio: 'geral', texto: `Boa Vista tem ${CTS.length} Conselhos Tutelares.\n${CTS.map(linha).join('\n')}` };
  if (/\b(telefone|fone|contato)\b/.test(n) && escolhidos.length) return { tipoTerritorio: 'contato', texto: escolhidos.map(linha).join('\n') };
  const hits = [];
  for (const ct of CTS) for (const bairro of ct.bairros) {
    const b = norm(bairro);
    if (b && new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(n)) hits.push({ct,bairro});
  }
  const unique = [...new Map(hits.map(x => [x.ct.id, x])).values()];
  if (unique.length) return { tipoTerritorio: 'bairro', texto: unique.map(x => `O bairro ${x.bairro} consta no território do Conselho Tutelar ${x.ct.id}.\n• ${linha(x.ct)}`).join('\n\n') + '\nLista do diretório do Argo SUAS (não é mapa oficial de limites); bairros grandes ou de divisa podem ter ruas em outro território. Confirme por telefone antes de encaminhar.' };
  if (escolhidos.length) return { tipoTerritorio: 'conselho', texto: escolhidos.map(ct => `Conselho Tutelar ${ct.id}: ${ct.bairros.join('; ')}.\n• ${linha(ct)}`).join('\n\n') };
  return { tipoTerritorio: 'nao-consta', texto: `Não identifiquei esse bairro nas listas de território dos Conselhos Tutelares do Argo SUAS. Não vou deduzir pelo CRAS ou por bairro vizinho. Confirme por telefone: ${CTS.map(ct => `Conselho Tutelar ${ct.id} ${ct.phone}`).join(' · ')}.` };
}
export const territoriosCT = CTS.map(ct => ({ ...ct, bairros: [...ct.bairros] }));
