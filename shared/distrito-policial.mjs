// Consulta local às circunscrições dos Distritos Policiais de Boa Vista, espelhadas do diretório do Argo SUAS.
// Não substitui orientação policial; sem IA, sem rede e sem inferir por proximidade.
const DPS = [
 { id:'1º', bairros:['05 de Outubro (Parque Caçari)','Calungá','Caçari','Canarinho','Centro','Dos Estados','Mecejana','Nova Planalto','Nossa Senhora da Aparecida','Paraviana','São Francisco','São Pedro','São Vicente','13 de Setembro','31 de Março'], address:'Rua Pedro Rodrigues, nº 462, esquina com a Av. Terêncio Lima, Centro, Boa Vista-RR, CEP 69301-180', phones:'Cartório: (95) 98414-8712; Plantão: (95) 98414-9218' },
 { id:'2º', bairros:['Asa Branca','Aeroporto','Buritis','Caimbé','Cambará','Centenário','Cinturão Verde','Jardim Floresta','Jardim Olímpico','Jardim Tropical','Jóquei Clube','Liberdade','Pricumã','Tancredo Neves'], address:'Rua Pedro Rodrigues, nº 462, esquina com a Av. Terêncio Lima, Centro, Boa Vista-RR (endereço provisório, mesmo prédio do 1º DP)', phones:'Cartório: (95) 98414-9366; Plantão: (95) 99154-5464' },
 { id:'3º', bairros:['Cauamé','Caranã','Cidade Satélite','Jardim Caranã','Loteamento João de Barro','Monte das Oliveiras','Piscicultura','Pedra Pintada','Santa Tereza','Said Salomão','União','Vila Jardim'], address:'Avenida São Sebastião, 2568, esquina com a Rua América Sarmento, Tancredo Neves, Boa Vista-RR, CEP 69313-492', phones:'Cartório: (95) 98414-9868; Plantão: (95) 98415-4857' },
 { id:'4º', bairros:['Alvorada','Doutor Sílvio Botelho','Doutor Sílvio Leite','Equatorial','Nova Canaã','Pintolândia','Santa Luzia','Senador Hélio Campos'], address:'Avenida São Sebastião, 2568, esquina com a Rua América Sarmento, Tancredo Neves, Boa Vista-RR, CEP 69313-492 (endereço provisório, mesmo prédio do 3º DP)', phones:'Cartório: (95) 98400-0128; Plantão: (95) 98413-5582' },
 { id:'5º', bairros:['Bela Vista','Doutor Airton Rocha','Governador Aquilino Mota Duarte (Distrito Industrial)','Laura Moreira','Loteamento Pérola do Rio Branco','Marechal Rondon','Nova Cidade','Operário','Professora Aracelis Souto Maior','Raiar do Sol','São Bento','Área rural de Boa Vista a partir da faixa esquerda da RR-205 até os limites com Alto Alegre, Mucajaí e Cantá'], address:'R. Parque Industrial, S/N - Gov. Aquilino Mota Duarte (Distrito Industrial), Boa Vista-RR – CEP 69.308-050', phones:'Cartório: (95) 98400-0498; Plantão: (95) 98413-6414' }
];
const normDP = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(doutor|doutora|dr|dra)\b/g,'dr').replace(/\b(bairro|conjunto)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const linhaDP = dp => `${dp.id} Distrito Policial — ${dp.address} · ${dp.phones} · Segunda a sexta, 07:30 às 19:30`;
const rxEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function respostaDeDistritoPolicial(texto) {
 const n=normDP(texto);
 if (!/(distrito policial|\bdp\b|delegacia|plantao|flagrante)/.test(n)) return null;
 const escolhidos=DPS.filter(dp=>new RegExp(`\\b(?:${dp.id[0]}|${dp.id[0]}º|${dp.id[0]}o)\\s*(?:distrito policial|dp)\\b|\\b(?:distrito policial|dp)\\s*(?:n\\s*)?${dp.id[0]}\\b`).test(n));
 const lista=/\b(quais|lista|listar|bairros|circunscricao|territorios|divisao)\b/.test(n);
 if (/\b(quantos|numero|existem)\b/.test(n) && /distrito policial|\bdp\b/.test(n)) return {tipoTerritorio:'geral',texto:`Boa Vista tem ${DPS.length} Distritos Policiais com circunscrições territoriais no diretório do Argo.\n${DPS.map(linhaDP).join('\n')}`};
 if (/\b(telefone|fone|contato)\b/.test(n) && escolhidos.length) return {tipoTerritorio:'contato',texto:escolhidos.map(linhaDP).join('\n')};
 if (lista && escolhidos.length) return {tipoTerritorio:'distrito',texto:escolhidos.map(dp=>`${dp.id} Distrito Policial (${dp.bairros.length} localidades): ${dp.bairros.join('; ')}.\n• ${linhaDP(dp)}`).join('\n\n')+'\nCircunscrições conforme o diretório do Argo SUAS; confirme com a Polícia Civil se houver dúvida.'};
 if (/\b(area rural|zona rural)\b/.test(n) && !escolhidos.length) return {tipoTerritorio:'bairro',texto:`A área rural de Boa Vista (faixa esquerda da RR-205 até os limites com Alto Alegre, Mucajaí e Cantá) consta na circunscrição do 5º Distrito Policial.\n• ${linhaDP(DPS[4])}\nConfirme a circunscrição com a Polícia Civil.`};
 const hits=[];
 for(const dp of DPS) for(const bairro of dp.bairros){const b=normDP(bairro); if(b && new RegExp(`\\b${rxEsc(b)}\\b`).test(n)) hits.push({dp,bairro});}
 const unique=[...new Map(hits.map(x=>[x.dp.id,x])).values()];
 if(unique.length) return {tipoTerritorio:'bairro',texto:unique.map(x=>`A localidade ${x.bairro} consta na circunscrição do ${x.dp.id} Distrito Policial.\n• ${linhaDP(x.dp)}`).join('\n\n')+'\nLista do diretório do Argo SUAS; confirme com a Polícia Civil, especialmente para endereços em limites de bairros.'};
 if(escolhidos.length) return {tipoTerritorio:'distrito',texto:escolhidos.map(dp=>`${dp.id} Distrito Policial: ${dp.bairros.join('; ')}.\n• ${linhaDP(dp)}`).join('\n\n')};
 if(/\b(plantao|flagrante|24 horas|24h)\b/.test(n)) return {tipoTerritorio:'plantao',texto:'O diretório do Argo informa que a Central de Flagrantes atende 24 horas, no endereço R. Parque Industrial, S/N - Gov. Aquilino Mota Duarte, Boa Vista-RR. Telefones: Cartório (95) 98400-2606; Plantão (95) 98400-2659. Em emergência imediata, ligue 190.'};
 return {tipoTerritorio:'nao-consta',texto:'Não identifiquei essa localidade nas circunscrições dos Distritos Policiais listadas no Argo SUAS. Não vou deduzir pelo distrito vizinho. Confirme com a Polícia Civil de Boa Vista.'};
}
export const distritosPoliciais=DPS.map(dp=>({...dp,bairros:[...dp.bairros]}));
