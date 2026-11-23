// Territórios CAPS e cobertura psicológica em UBS de Boa Vista, espelhados das listas explícitas do Argo SUAS.
// Não inventa cobertura: a macroárea 8 não tem UBS com atendimento psicológico identificada no cadastro consultado.
const MACRO = {
  1:['Cidade Satélite','Murilo Teixeira','Piscicultura','Santa Tereza','Jardim Caranã','União'],
  2:['Aeroporto','Jardim Floresta','Caranã','Cauamé','Said Salomão'],
  3:['31 de Março','São Francisco','Nossa Senhora da Aparecida','Bairro dos Estados','Paraviana','Caçari','São Vicente','Calungá','Canarinho','Centro','São Pedro','Mecejana'],
  4:['Dr. Sílvio Leite','Jardim Primavera','Alvorada','Equatorial','Laura Moreira'],
  5:['Asa Branca','Cambará','Nova Canaã','Olímpico','Jóquei Clube','Professora Aracelis Souto Maior','Tancredo Neves','Caimbé'],
  6:['13 de Setembro','Buritis','Centenário','Cinturão Verde','Liberdade','Pricumã'],
  7:['Jardim Tropical','Senador Hélio Campos','Pintolândia','Dr. Sílvio Botelho','Santa Luzia'],
  8:['Nova Cidade','Operário','Dr. Airton Rocha','Governador Aquilino Mota Duarte','Raiar do Sol','Bela Vista','São Bento']
};
const CAPS=[
 {name:'CAPS II',address:'R. Pavão, 295 - Mecejana, Boa Vista-RR',phone:'(95) 3624-2384',areas:[1,2,3,6],hours:'Segunda a sexta, 08:00 às 18:00 (pode se estender a um 3º turno até 21h)',note:'Saúde mental; atende crianças a partir de 4 anos. Boa Vista não tem CAPS infantil (CAPS i).'},
 {name:'CAPS III',address:'Av. Cap. Ene Garcês, 497 - Centro, Boa Vista-RR',phone:'(95) 98404-4219',areas:[4,5,7,8],hours:'Porta aberta diurna; acolhimento noturno para pacientes já em acompanhamento',note:'Voltado a pessoas com transtornos mentais graves e persistentes; o acolhimento noturno não equivale a pronto-socorro psiquiátrico.'},
 {name:'CAPS AD III',address:'R. José Bonifácio, 630 - Aparecida, Boa Vista-RR',phone:'(95) 98407-2238',areas:[1,2,3,4,5,6,7,8],hours:'Funcionamento 24h; acolhimento noturno com até 12 leitos de observação/monitoramento',note:'Atenção psicossocial relacionada a necessidades decorrentes do uso de álcool e outras drogas; novos acolhimentos costumam ser diurnos.'}
];
const UBS=[
 {name:'UBS Dr. Hélio Macedo',macro:1,address:'Rua Joca Farias, 2199 - Jardim Caranã, Boa Vista-RR, 69313-600',phone:'(95) 3625-9550'},
 {name:'UBS Prof. Mariano de Andrade',macro:1,address:'Av. Deco Fonteles, 264 - Caranã, Boa Vista-RR',phone:'Não consta'},
 {name:'UBS Olenka Macellaro',macro:2,address:'Av. Mário Homem de Melo, 5075 - Caimbé, Boa Vista-RR, 69312-155',phone:'Não consta'},
 {name:'UBS Edna Diniz',macro:2,address:'Rua Francisco Cândido, 177 - Aeroporto, Boa Vista-RR',phone:'(95) 3623-3962'},
 {name:'UBS Dra. Sandra Maria',macro:3,address:'R. Maj. Carlos Mardel, 466 - Trinta e Um de Março, Boa Vista-RR, 69305-290',phone:'Não consta'},
 {name:'UBS Dr. Silvio Botelho',macro:3,address:'Av. Minas Gerais, 512 - Paraviana, Boa Vista-RR',phone:'Não consta'},
 {name:'UBS Mecejana',macro:3,address:'R. Pavão, 195 - Mecejana, Boa Vista-RR, 69304-451',phone:'Não consta'},
 {name:'UBS Aygara Motta',macro:4,address:'R. José Lacerda, 256 - Cidade Satélite, Boa Vista-RR',phone:'Não consta'},
 {name:'UBS Dr. Silvio Leite',macro:4,address:'R. Vicente Tavares de Melo, 615 - Nova Canaã, Boa Vista-RR',phone:'Não consta'},
 {name:'UBS Jorge André Gurjão',macro:4,address:'R. CC 24, 341 - Laura Moreira, Boa Vista-RR, 69318-115',phone:'Não consta'},
 {name:'UBS Asa Branca',macro:5,address:'R. Francisco Custódio de Andrade, 505 - Asa Branca, Boa Vista-RR, 69312-258',phone:'Não consta'},
 {name:'UBS Buritis',macro:6,address:'R. Raimundo Figueiras, 661 - Buritis, Boa Vista-RR, 69309-221',phone:'Não consta'},
 {name:'UBS Santa Luzia',macro:7,address:'Av. Abel Monteiro Reis, 1786 - Pintolândia, Boa Vista-RR, 69316-398',phone:'Não consta'},
 {name:'UBS Sayonara',macro:7,address:'Av. Raimundo Rodrigues Coelho, 2280 - Dr. Silvio Botelho, Boa Vista-RR, 69316-762',phone:'Não consta'}
];
// UBS com psicólogo(a) próprio(a) por informação de campo no Argo (sem lista de abrangência por macroárea): vale só para o bairro onde fica.
const UBS_CAMPO=[
 {name:'UBS Bernardo Alem (UBS Vila Jardim)',bairros:['Cidade Satélite','Vila Jardim'],address:'R. Josemar Batista de Souza, 1200 - Cidade Satélite (Conj. Vila Jardim), Boa Vista-RR',phone:'Não consta'}
];
// Outras grafias de bairro que o Argo usa: nome canônico (da lista de macroáreas, ou fora dela).
const APELIDOS_BAIRRO={'araceli souto maior':'Professora Aracelis Souto Maior','aracelis souto maior':'Professora Aracelis Souto Maior','professora araceli souto maior':'Professora Aracelis Souto Maior','vila jardim':'Vila Jardim'};
const normSaudeMental=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(doutor|doutora|dr|dra)\b/g,'dr').replace(/\b(bairro|conjunto|loteamento)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const reBairroSM=b=>new RegExp(`\\b${normSaudeMental(b).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`);
const acharBairro=n=>Object.values(MACRO).flat().find(b=>reBairroSM(b).test(n))||Object.entries(APELIDOS_BAIRRO).find(([a])=>reBairroSM(a).test(n))?.[1];
const campoDoBairroSM=b=>UBS_CAMPO.filter(u=>u.bairros.some(x=>normSaudeMental(x)===normSaudeMental(b)));
function apresentarCampoSM(b){return campoDoBairroSM(b).map(u=>`• ${u.name} — ${u.address} · telefone: ${u.phone} (informação de campo no Argo: a unidade passou a ter psicólogo(a) próprio(a); confirme se há atendimento e agenda)`).join('\n');}
function apresentarUBS(m){return UBS.filter(u=>u.macro===m).map(u=>`• ${u.name} — ${u.address} · telefone: ${u.phone}`).join('\n');}
function apresentarCaps(bairro){const m=Object.entries(MACRO).find(([,bs])=>bs.some(b=>normSaudeMental(b)===normSaudeMental(bairro)))?.[0];if(!m)return null;return CAPS.filter(c=>c.areas.includes(Number(m))).map(c=>`• ${c.name} — ${c.address} · ${c.phone} · ${c.hours}. ${c.note}`).join('\n');}
export function respostaDeSaudeMentalTerritorio(texto){
 const n=normSaudeMental(texto); const pedeCaps=/\bcaps\b|centro de atencao psicossocial/.test(n); const pedeUbs=/\bubs\b/.test(n); const pedePsi=/psicolog|psicoterapia|saude mental/.test(n);
 if(!pedeCaps&&!pedeUbs&&!pedePsi)return null;
 if(!pedeCaps&&!pedeUbs&&/\bcras\b|tecnic|equipe|referencia tecnica|divisao territorial/.test(n))return null;
 const bairro=acharBairro(n);
 const pedidoTerritorial = /\b(bairro|bairros|territorio|macroarea|abrangencia|atende|cobre|referencia)\b/.test(n);
 if(!bairro && !pedidoTerritorial)return null;
 if(pedeCaps){if(bairro){const resp=apresentarCaps(bairro);return resp?{tipoSaude:'caps',texto:`Para o bairro ${bairro}, o diretório do Argo indica estas referências CAPS:\n${resp}\n\nA referência varia conforme o tipo de cuidado; confirme o acesso e o acolhimento diretamente com o serviço.`}:{tipoSaude:'nao-consta',texto:`Não encontrei macroárea cadastrada para ${bairro} nas listas CAPS do Argo. Confirme com a rede municipal/estadual.`};}const lista=CAPS.map(c=>`• ${c.name} — macroáreas ${c.areas.join(', ')}; ${c.address} · ${c.phone}`).join('\n');return {tipoSaude:'caps',texto:`CAPS de Boa Vista cadastrados no Argo:\n${lista}\nInforme o bairro para identificar a referência territorial.`};}
 if(pedeUbs||pedePsi){if(!bairro)return {tipoSaude:'ubs-psicologia',texto:'Diga o bairro de Boa Vista para eu procurar, nas listas do Argo, a UBS com atendimento psicológico que cobre a macroárea.'};
  const mk=Object.keys(MACRO).find(k=>MACRO[k].some(b=>normSaudeMental(b)===normSaudeMental(bairro)));const m=mk?Number(mk):null;
  const unidades=m?apresentarUBS(m):'';const campo=apresentarCampoSM(bairro);
  const aviso='\n\nA lista não confirma agenda ou disponibilidade atual de profissional; ligue antes de encaminhar.';
  if(unidades||campo)return {tipoSaude:'ubs-psicologia',texto:`Para ${bairro}${m?` (Macroárea ${m})`:''}, o Argo lista estas UBS com atendimento psicológico:\n${[unidades,campo].filter(Boolean).join('\n')}${aviso}`};
  if(m===8)return {tipoSaude:'nao-consta',texto:`${bairro} consta na Macroárea 8, mas o cadastro do Argo consultado não identifica uma UBS com atendimento psicológico para essa macroárea. Não vou indicar outra UBS por proximidade; confirme com a rede municipal.`};
  return {tipoSaude:'nao-consta',texto:`Não achei ${bairro} nas listas de UBS com atendimento psicológico do Argo. Confirme com a rede municipal, sem inferir pela proximidade.`};}
 return null;
}
export const territoriosSaudeMental={caps:CAPS,macroareas:MACRO,ubs:UBS,ubsCampo:UBS_CAMPO};
