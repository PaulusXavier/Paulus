// Avaliação da busca: perguntas reais do trabalho e o(s) documento(s) que TÊM de aparecer entre os trechos que vão para a IA.
// Uso: node scripts/avaliar-busca.mjs [-v]   (sem -v mostra só o resumo e as falhas)
import { readFileSync } from 'node:fs';
import { criarIndice, buscarPergunta, K_PADRAO } from '../shared/busca.mjs';
const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
const indice = criarIndice(base);
const BF = ['bolsa-familia-2026', 'pbf-regra-protecao-retorno-revisao-2026', 'guia-bolsa-familia-cadunico-2026'];
const CAD = ['decreto-11016-2022-cadunico', 'cadunico-mds', 'guia-bolsa-familia-cadunico-2026'];
export const CASOS = [
  ['o que é o PAIF', ['paif-acompanhamento-familiar-guia', 'tipificacao-2009', 'paif-orientacoes-tecnicas-vol2', 'cfp-ref-cras-2021']],
  ['qual a diferença entre PAIF e PAEFI', ['dimensao-coletiva-suas-paif-paefi-2026', 'tipificacao-2009', 'cfp-ref-creas-2013']],
  ['o que faz o psicólogo no CRAS', ['cfp-ref-cras-2021']],
  ['o que faz o psicólogo no CREAS', ['cfp-ref-creas-2013']],
  ['como fazer o plano de acompanhamento familiar', ['paif-paf-plano-acompanhamento', 'paulus-roteiros-paf']],
  ['quem tem direito ao BPC', ['loas-1993', 'decreto-6214-2007', 'lei-15077-2024-cadunico-bpc-pbf']],
  ['renda per capita do BPC idoso', ['loas-1993', 'decreto-6214-2007']],
  ['quanto é o benefício de primeira infância do bolsa família', BF],
  ['regra de proteção do bolsa família', ['pbf-regra-protecao-retorno-revisao-2026', 'bolsa-familia-2026']],
  ['bolsa família bloqueado o que fazer', ['bolsa-familia-2026', 'pbf-portaria-897-2023-gestao-beneficios', 'sicon-condicionalidades-gestao']],
  ['calendário de pagamento do bolsa família', ['pbf-calendario-operacional-2026', 'bolsa-familia-2026']],
  ['quem pode se cadastrar no cadúnico', CAD],
  ['atualização cadastral do cadúnico prazo', CAD],
  ['condicionalidade de saúde vacinação', ['paif-trilha-1-condicionalidades-2024', 'sicon-condicionalidades-gestao', 'pbf-portarias-interministeriais-saude-educacao', 'portaria-interministerial-mds-ms-38-2026']],
  ['frequência escolar mínima bolsa família', ['portaria-interministerial-mec-mds-12-2025', 'paif-trilha-1-condicionalidades-2024', 'pbf-portarias-interministeriais-saude-educacao']],
  ['o que é o SICON', ['sicon-condicionalidades-gestao', 'paif-trilha-1-condicionalidades-2024']],
  ['o que é a tipificação nacional de serviços socioassistenciais', ['tipificacao-2009']],
  ['serviço de convivência e fortalecimento de vínculos', ['tipificacao-2009']],
  ['serviço de acolhimento institucional', ['tipificacao-2009']],
  ['o que é a PNAS', ['pnas-2004']],
  ['o que diz a NOB SUAS sobre vigilância socioassistencial', ['nob-suas-2012']],
  ['equipe de referência do CRAS', ['nob-rh-suas-anotada-2011', 'cfp-ref-cras-2021', 'tipificacao-2009']],
  ['composição da equipe do CREAS', ['nob-rh-suas-anotada-2011', 'cfp-ref-creas-2013']],
  ['o que são benefícios eventuais', ['decreto-6307-2007', 'loas-1993']],
  ['auxílio funeral quem tem direito', ['decreto-6307-2007']],
  ['o que é a RAPS', ['raps-guia-apoio', 'raps-portaria-3088-2011-resumo']],
  ['quais os pontos de atenção da rede de atenção psicossocial', ['raps-portaria-3088-2011-resumo', 'raps-guia-apoio']],
  ['o que é um CAPS AD', ['cfp-ref-caps-2022', 'raps-portaria-3088-2011-resumo', 'cfp-ref-alcool-drogas-2019', 'raps-guia-apoio']],
  ['internação involuntária de dependente químico', ['lei-13840-2019-drogas-resumo', 'lei-10216-2001-resumo']],
  ['reforma psiquiátrica lei 10216', ['lei-10216-2001-resumo']],
  ['atendimento a pessoa em situação de rua', ['cfp-ref-pop-rua-2025']],
  ['atendimento a indígenas no CRAS', ['cfp-ref-povos-indigenas-2024']],
  ['atuação do psicólogo com quilombolas', ['cfp-ref-quilombolas-2025']],
  ['violência contra a mulher atendimento psicológico', ['cfp-ref-mulher-violencia-2013', 'paif-trilha-3-violencia-mulheres-2026']],
  ['violência sexual contra criança', ['cfp-ref-violencia-sexual-2020']],
  ['atendimento a pessoa idosa', ['cfp-ref-pessoas-idosas-2025']],
  ['psicólogo no sistema prisional', ['cfp-ref-prisional-2021']],
  ['medidas socioeducativas', ['cfp-ref-socioeducativas-2021']],
  ['psicologia em emergências e desastres', ['cfp-ref-riscos-desastres-2021']],
  ['psicologia na educação básica', ['cfp-ref-educacao-basica-2019']],
  ['psicólogo no hospital', ['cfp-ref-hospitalar-sus-2019']],
  ['atendimento a pessoas com HIV', ['cfp-ref-ist-hiv-aids-2020']],
  ['como fazer laudo psicológico', ['cfp-avaliacao-psicologica-guia', 'psicodiagnostico-guia-apoio']],
  ['quais testes psicológicos são aprovados', ['cfp-avaliacao-psicologica-guia', 'psicometria-guia-apoio']],
  ['critérios do DSM-5 para depressão', ['dsm5tr-guia-apoio', 'psicopatologia-guia-apoio']],
  ['CID-11 transtornos mentais', ['oms-cid11-guia-2024']],
  ['risco de suicídio como avaliar', ['abp-cfm-suicidio-2014']],
  ['insegurança alimentar no CRAS', ['paif-trilha-2-inseguranca-alimentar-2025']],
  ['primeira infância no PAIF', ['paif-trilha-4-primeira-infancia-2026']],
  ['gás do povo quem recebe', ['gas-do-povo-2026']],
  ['operação acolhida venezuelanos', ['roraima-operacao-acolhida-2026']],
  ['quantos habitantes tem Boa Vista', ['roraima-perfil-ibge', 'roraima-municipios-2022', 'boa-vista-diagnostico-socioterritorial-2026']],
  ['terras indígenas de Roraima', ['roraima-povos-indigenas-2022']],
  ['história da fundação de Boa Vista', ['boa-vista-historia-fundacao']],
  ['PIB de Boa Vista', ['boa-vista-economia-pib']],
  ['ônibus transporte coletivo em Boa Vista', ['boa-vista-transporte-gestao-2026']],
  ['bairros e avenidas de Boa Vista', ['boa-vista-geografia-mapa', 'mapa-boa-vista-osm']],
  ['endereço e telefone do CRAS', ['argo-enderecos-diretorio']],
  ['como usar planilha no excel tabela dinâmica', ['excel-guia-apoio']],
  ['como calcular média e desvio padrão', ['estatistica-guia-apoio']],
  ['importar csv no python pandas', ['python-dados-guia-apoio']],
  ['ggplot gráfico no R', ['r4ds-guia-apoio']],
  ['como se diz obrigado em espanhol', ['espanhol-guia-apoio']],
  ['regras de crase e acentuação', ['portugues-guia-apoio']],
  ['to com problema pra receber o bolsa familia meu nome ta bloqueado', ['bolsa-familia-2026', 'pbf-portaria-897-2023-gestao-beneficios', 'sicon-condicionalidades-gestao']],
  // Unipessoal: o trecho de bolsa-familia-2026 não trata do tema; quem responde é o limite de unipessoais da Lei 15.077 e o Decreto 12.064 (art. 18).
  ['familia unipessoal bolsa familia', [...BF, 'lei-15077-2024-cadunico-bpc-pbf', 'decreto-12064-2024', 'decreto-12064-2024-resumo-por-tema']],
  ['averiguação cadastral o que é', ['pbf-regra-protecao-retorno-revisao-2026', 'bolsa-familia-2026', 'decreto-11016-2022-cadunico']],
  ['cadunico quantos salarios minimos meia renda', CAD],
  ['resolução cnas sobre trabalhadores do suas', ['resolucao-cnas-17-2011', 'nob-rh-suas-anotada-2011']],
  ['ética do psicólogo no suas', ['cfp-gestores-suas-2025', 'cfp-gestores-suas-2011', 'cfp-ref-cras-2021']],
  ['LGPD proteção de dados pessoais no cadastro', ['decreto-11016-2022-cadunico', 'analise-dados-guia-apoio', 'cadunico-mds']],
  ['judicialização e medida protetiva idoso', ['cfp-ref-pessoas-idosas-2025']],
  ['o que é referência e contrarreferência', ['tipificacao-2009', 'nob-suas-2012', 'pnas-2004', 'cfp-ref-cras-2021']],
  ['territorialização e vigilância socioassistencial', ['pnas-2004', 'nob-suas-2012']],
  ['protocolo de gestão integrada de serviços e benefícios', ['nob-suas-2012', 'resolucao-cnas-218-2025', 'decreto-12064-2024', 'pbf-portaria-897-2023-gestao-beneficios']],
  ['regulamentação do SUAS decreto 12064', ['decreto-12064-2024', 'decreto-12064-2024-resumo-por-tema']],
  ['tfd tratamento fora de domicílio', ['sus-regulacao-acesso-cartao-tfd-resumo']],
  ['ouvidoria do SUS direitos do usuário', ['sus-controle-social-ouvidoria-direitos-resumo']],
  ['atenção básica unidade básica de saúde PNAB', ['sus-atencao-primaria-pnab-resumo', 'cfp-ref-atencao-basica-2019']],
  ['constituição federal assistência social artigo 203', ['cf-1988-extratos', 'loas-1993']],
  // Perguntas novas (nunca usadas para ajustar a busca): medem se a melhora vale além dos casos de treino.
  ['trabalho com famílias indígenas no território', ['cfp-ref-povos-indigenas-2024']],
  ['como fazer relatório de atendimento psicológico', ['cfp-avaliacao-psicologica-guia', 'psicodiagnostico-guia-apoio']],
  ['como orientar mães com bebê de até 6 anos', ['paif-trilha-4-primeira-infancia-2026']],
  ['psicologo atende no cras quais as atribuicoes', ['cfp-ref-cras-2021']],
  ['comunidades quilombolas atendimento psicossocial', ['cfp-ref-quilombolas-2025']],
  ['pessoas privadas de liberdade atuação da psicologia', ['cfp-ref-prisional-2021']],
  ['adolescente cumprindo medida em meio aberto', ['cfp-ref-socioeducativas-2021']],
  ['quando o bolsa família paga a mais por filho pequeno', ['bolsa-familia-2026', 'guia-bolsa-familia-cadunico-2026', 'lei-14601-2023']],
  ['como registrar descumprimento de condicionalidade no sicon', ['sicon-condicionalidades-gestao', 'paif-trilha-1-condicionalidades-2024']],
  ['idoso sofrendo maus tratos na família', ['cfp-ref-pessoas-idosas-2025', 'paif-trilha-3-violencia-mulheres-2026', 'tipificacao-2009']],
  ['diferença entre proteção social básica e especial', ['pnas-2004', 'tipificacao-2009', 'nob-suas-2012']],
  ['como funciona o cofinanciamento do suas', ['nob-suas-2012', 'decreto-12064-2024', 'loas-1993']],
  ['como usar fórmulas procv no excel', ['excel-guia-apoio']],
  ['transtorno de ansiedade generalizada critérios', ['dsm5tr-guia-apoio', 'psicopatologia-guia-apoio', 'oms-cid11-guia-2024']]
];
const verbose = process.argv.includes('-v');
let ok = 0, mrr = 0;
const falhas = [];
for (const [q, esperados] of CASOS) {
  const docs = buscarPergunta(indice, q, { k: K_PADRAO }).map(r => r.trecho.doc);
  const pos = docs.findIndex(d => esperados.includes(d));
  if (pos >= 0) { ok++; mrr += 1 / (pos + 1); } else falhas.push([q, esperados, docs]);
  if (verbose) console.log((pos >= 0 ? 'OK  ' : 'FALHA') + ' #' + (pos + 1) + ' ' + q + ' -> ' + docs.join(', '));
}
console.log('\nAcertos: ' + ok + '/' + CASOS.length + ' (' + Math.round(ok / CASOS.length * 100) + '%)  MRR: ' + (mrr / CASOS.length).toFixed(3));
falhas.forEach(([q, e, d]) => console.log('FALHA: ' + q + '\n   esperado: ' + e.join(' | ') + '\n   veio:     ' + (d.join(' | ') || '(nada)')));
process.exitCode = falhas.length ? 1 : 0;
