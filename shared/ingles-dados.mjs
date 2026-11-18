// Dados do inglês do trabalho no SUAS (v0.19.0): glossário PT↔EN, falsos amigos, frases por situação e inglês da Guiana.
// FONTE ÚNICA: o navegador e o Worker usam este arquivo. Não tem dado de pessoa: só vocabulário e frases-modelo.
// Regra de ouro: o NOME OFICIAL do serviço fica em português (a pessoa vai procurá-lo assim); o inglês serve para explicar.

// [português, inglês (variantes separadas por " / "), nota opcional]
export const ING_GLOSSARIO = {
  'Serviços e equipamentos': [
    ['CRAS', 'Social Assistance Reference Center (CRAS)', 'Porta de entrada da assistência social no território. Gratuito. Explique em uma frase: "the place where you get social support and information about benefits".'],
    ['CREAS', 'Specialized Social Assistance Reference Center (CREAS)', 'Atende pessoas e famílias com direitos violados (violência, abandono, trabalho infantil).'],
    ['Centro POP', 'center for people experiencing homelessness', 'Atende pessoas em situação de rua.'],
    ['CAPS', 'Psychosocial Care Center (CAPS) / public mental health center', 'Serviço público de saúde mental. Não precisa pagar.'],
    ['UBS', 'Basic Health Unit (UBS) / public health clinic', 'Primeira porta do SUS: consulta, vacina, pré-natal.'],
    ['UPA', 'Emergency Care Unit (UPA) / urgent care', 'Urgência 24 horas.'],
    ['SAMU', 'SAMU (ambulance)', 'Telefone 192. Gratuito.'],
    ['Conselho Tutelar', 'Guardianship Council (Conselho Tutelar): the body that protects the rights of children and teenagers', 'Mantenha o nome em português; a pessoa vai procurá-lo assim.'],
    ['Defensoria Pública', 'Public Defender\'s Office (free legal help from the State)', 'Assistência jurídica gratuita.'],
    ['Polícia Federal', 'Federal Police (immigration documents)', 'Registro migratório e regularização.'],
    ['escola', 'school', ''],
    ['abrigo', 'shelter / reception center', 'Em inglês "shelter" serve para o serviço de acolhimento.'],
    ['acolhimento institucional', 'institutional care / residential care', ''],
    ['Operação Acolhida', 'Operation Welcome', 'Resposta federal ao fluxo de venezuelanos em Roraima.'],
    ['cartório', 'notary office / civil registry office', ''],
    ['Receita Federal', 'Federal Revenue Service (taxes and CPF)', ''],
    ['delegacia', 'police station', 'Boletim de ocorrência = police report.'],
    ['SUS', 'SUS (Unified Health System: public and free)', 'Atende também estrangeiros.']
  ],
  'Benefícios e programas': [
    ['Cadastro Único (CadÚnico)', 'Unified Registry (CadÚnico)', 'Cadastro das famílias de baixa renda; porta de entrada dos programas. Mantenha "CadÚnico".'],
    ['Bolsa Família', 'Bolsa Família (monthly cash transfer for low-income families registered in the CadÚnico)', 'Tem condicionalidades de saúde e educação.'],
    ['BPC', 'BPC (Continuous Cash Benefit: one minimum wage for low-income older people or people with disabilities)', 'Não é aposentadoria. Pede CadÚnico atualizado.'],
    ['benefício eventual', 'temporary emergency benefit', ''],
    ['cesta básica', 'basic food basket / food parcel', ''],
    ['aluguel social', 'rent assistance / social rent (temporary housing aid)', ''],
    ['auxílio funeral', 'funeral assistance', ''],
    ['auxílio natalidade', 'birth assistance', ''],
    ['condicionalidades', 'conditions (health and school requirements to keep the benefit)', ''],
    ['renda per capita', 'income per person (family income divided by the number of people)', ''],
    ['SCFV', 'Coexistence and Bond-Strengthening Service', ''],
    ['PAIF', 'PAIF (Comprehensive Family Protection and Support Service)', ''],
    ['PAEFI', 'PAEFI (Specialized Support Service for Families and Individuals)', '']
  ],
  'Documentos': [
    ['certidão de nascimento', 'birth certificate', ''],
    ['certidão de casamento', 'marriage certificate', ''],
    ['CPF', 'CPF (Brazilian taxpayer number)', 'Gratuito na Receita Federal; migrante pode tirar.'],
    ['RG', 'RG (Brazilian identity card)', ''],
    ['passaporte', 'passport', ''],
    ['CRNM', 'CRNM (national migration registry card)', 'Documento do migrante regularizado.'],
    ['protocolo de refúgio', 'refugee claim receipt / asylum application receipt', ''],
    ['carteira de trabalho', 'work card (CTPS)', ''],
    ['comprovante de residência', 'proof of address', 'Se a pessoa não tem, diga que há alternativas (declaração).'],
    ['cartão do SUS', 'SUS card (public health card)', 'Migrante tem direito, mesmo sem documento brasileiro.'],
    ['segunda via', 'duplicate copy / replacement copy', ''],
    ['declaração', 'statement / declaration', ''],
    ['documento com foto', 'photo ID', '']
  ],
  'Família e pessoas': [
    ['criança', 'child', ''],
    ['adolescente', 'teenager / adolescent', ''],
    ['pessoa idosa', 'older person / older adult', 'Evite "elderly" ou "old people" se a pessoa se incomodar.'],
    ['pessoa com deficiência', 'person with a disability', ''],
    ['gestante', 'pregnant woman', 'Em inglês "pregnant" é grávida.'],
    ['mãe', 'mother / mom', ''],
    ['pai', 'father / dad', ''],
    ['responsável', 'guardian / caregiver', ''],
    ['filho / filha', 'son / daughter', ''],
    ['marido / esposa', 'husband / wife', ''],
    ['sobrenome', 'last name / surname', ''],
    ['família', 'family', ''],
    ['migrante', 'migrant', ''],
    ['refugiado(a)', 'refugee', ''],
    ['pessoa em situação de rua', 'person experiencing homelessness', 'Prefira esta forma a "homeless person".'],
    ['avó / avô', 'grandmother / grandfather', ''],
    ['irmão / irmã', 'brother / sister', ''],
    ['vizinho(a)', 'neighbor', ''],
    ['recém-nascido', 'newborn', '']
  ],
  'Saúde e proteção': [
    ['saúde mental', 'mental health', ''],
    ['vacina', 'vaccine / shot', ''],
    ['consulta', 'medical appointment', ''],
    ['pré-natal', 'prenatal care', ''],
    ['urgência', 'emergency', ''],
    ['violência doméstica', 'domestic violence', ''],
    ['medida protetiva', 'protective order / restraining order', 'Pedida na delegacia ou na Defensoria.'],
    ['abuso sexual', 'sexual abuse', ''],
    ['trabalho infantil', 'child labor', ''],
    ['abandono', 'abandonment / neglect', ''],
    ['denúncia', 'report / complaint', ''],
    ['sigilo', 'confidentiality', 'Não prometa sigilo absoluto: havendo risco, a rede é acionada.'],
    ['encaminhamento', 'referral', ''],
    ['atendimento', 'service / appointment / care', ''],
    ['rede de proteção', 'protection network', '']
  ],
  'Trabalho e rotina do atendimento': [
    ['assistente social', 'social worker', ''],
    ['psicólogo(a)', 'psychologist', ''],
    ['coordenação', 'coordination / management', ''],
    ['agendamento', 'scheduling / booking an appointment', ''],
    ['visita domiciliar', 'home visit', ''],
    ['registro', 'record / case note', ''],
    ['prazo', 'deadline / time limit', ''],
    ['fila', 'line / queue', ''],
    ['gratuito', 'free (no cost)', 'Em inglês "free" também é "livre": diga "no cost" se houver dúvida.'],
    ['direito', 'right', ''],
    ['renda', 'income', ''],
    ['desemprego', 'unemployment', ''],
    ['moradia', 'housing', ''],
    ['fome / insegurança alimentar', 'hunger / food insecurity', ''],
    ['intérprete', 'interpreter', ''],
    ['salário mínimo', 'minimum wage', ''],
    ['aposentadoria', 'retirement pension', 'O BPC não é aposentadoria.']
  ]
};

// Palavras soltas do inglês → termos de busca em português (a base de normas está em português).
export const ING_PALAVRAS_BUSCA = {
  help: 'ajuda auxilio', benefit: 'beneficio', benefits: 'beneficios', son: 'filho', daughter: 'filha', child: 'crianca', children: 'criancas', kid: 'crianca', kids: 'criancas', baby: 'crianca bebe',
  teenager: 'adolescente', teenagers: 'adolescentes', adolescent: 'adolescente', school: 'escola', apply: 'inscricao cadastro solicitar', register: 'cadastro inscricao', registry: 'cadastro', registration: 'cadastro inscricao',
  enroll: 'inscricao cadastro', document: 'documento', documents: 'documentos', passport: 'passaporte', requirements: 'requisitos', requirement: 'requisito', elderly: 'idosa idoso', older: 'idosa idoso',
  disability: 'deficiencia', disabled: 'deficiencia', pregnant: 'gestante gestacao', pregnancy: 'gestante gestacao', violence: 'violencia', abuse: 'abuso violencia', abused: 'violencia abuso', neglect: 'abandono negligencia',
  abandonment: 'abandono', report: 'denuncia', complaint: 'denuncia', job: 'trabalho emprego', work: 'trabalho', unemployed: 'desempregado desemprego', unemployment: 'desemprego', income: 'renda', money: 'renda',
  food: 'alimentacao seguranca alimentar', hunger: 'fome seguranca alimentar', hungry: 'fome seguranca alimentar', housing: 'moradia habitacao', homeless: 'situacao rua', homelessness: 'situacao rua',
  shelter: 'acolhimento abrigo', refugee: 'refugiado migrante', migrant: 'migrante', immigrant: 'migrante estrangeiro', immigration: 'migracao migrante', foreigner: 'estrangeiro migrante',
  health: 'saude', mental: 'mental', psychologist: 'psicologo', doctor: 'medico', vaccine: 'vacina', rights: 'direitos', right: 'direito', family: 'familia', families: 'familias',
  mother: 'mae', father: 'pai', grandmother: 'avo idosa', grandfather: 'avo idoso', mom: 'mae', dad: 'pai', rent: 'aluguel', pension: 'beneficio', free: 'gratuito', cost: 'custa valor',
  much: 'valor quanto', receive: 'receber', get: 'receber', appointment: 'agendamento', guardian: 'responsavel', guardianship: 'tutelar', council: 'conselho', attendance: 'frequencia',
  condition: 'condicionalidades', conditions: 'condicionalidades', social: 'social', assistance: 'assistencia', protection: 'protecao', care: 'atendimento', adult: 'adulto', trafficking: 'trafico pessoas',
  birth: 'nascimento', certificate: 'certidao', marriage: 'casamento', suicide: 'suicidio', drugs: 'drogas', alcohol: 'alcool', addiction: 'drogas dependencia', counseling: 'psicologo atendimento'
};

// Falsos amigos entre português e inglês que mais atrapalham no atendimento: [palavra, o que quer dizer em inglês, nota]
export const ING_FALSOS_AMIGOS = [
  ['actually', 'na verdade (não "atualmente")', 'Atualmente = currently / nowadays.'],
  ['pretend', 'fingir (não "pretender")', 'Pretender = intend / plan to.'],
  ['attend', 'comparecer, assistir a (não "atender")', 'Atender o público = serve / assist; "to attend school" = frequentar a escola.'],
  ['assist', 'ajudar (não "assistir TV")', 'Assistir TV = watch TV.'],
  ['support', 'apoiar, sustentar (não "suportar")', 'Suportar = tolerate / bear.'],
  ['parents', 'pais (pai e mãe), não "parentes"', 'Parentes = relatives.'],
  ['relatives', 'parentes', ''],
  ['college', 'faculdade (não "colégio")', 'Colégio = high school / school.'],
  ['library', 'biblioteca (não "livraria")', 'Livraria = bookstore.'],
  ['push', 'empurrar (não "puxar")', 'Puxar = pull. Atenção em portas e em relato de violência.'],
  ['exit', 'saída (não "êxito")', 'Êxito = success.'],
  ['realize', 'perceber, dar-se conta (não "realizar")', 'Realizar = carry out / accomplish.'],
  ['resume', 'retomar (e "résumé" = currículo)', 'Resumo = summary.'],
  ['injury', 'ferimento, lesão (não "injúria")', 'Injúria = insult.'],
  ['sensible', 'sensato (não "sensível")', 'Sensível = sensitive.'],
  ['eventually', 'no fim das contas, com o tempo (não "eventualmente")', 'Eventualmente = occasionally.'],
  ['pasta', 'macarrão (não "pasta" de documentos)', 'Pasta de documentos = folder.'],
  ['costume', 'fantasia, traje (não "costume")', 'Costume = habit / custom.'],
  ['grip / gripe', '"grip" = aperto; gripe = flu', 'Gripe em inglês é "flu".'],
  ['push / pull', 'empurrar / puxar', 'Em porta: "push" = empurre.'],
  ['preservative', 'conservante de alimento (não "preservativo")', 'Preservativo = condom.'],
  ['lecture', 'palestra, aula expositiva (não "leitura")', 'Leitura = reading.'],
  ['balcony', 'sacada', ''],
  ['fabric', 'tecido (não "fábrica")', 'Fábrica = factory.'],
  ['tax', 'imposto (não "taxa" de serviço)', 'Taxa = fee.']
];

// Frases-modelo por situação: [português, inglês]. Use [NOME]/[SERVIÇO] como lacuna e REVISE antes de usar em texto para a família.
export const ING_FRASES = {
  'acolhida': ['Acolhida e primeiros minutos', [
    ['Bom dia, seja bem-vindo(a).', 'Good morning, welcome.'],
    ['Meu nome é [NOME] e sou psicólogo(a) aqui no CRAS. Este serviço é gratuito.', 'My name is [NAME] and I am a psychologist here at the CRAS. This service is free of charge.'],
    ['Posso falar mais devagar. Se não entender, me avise.', 'I can speak more slowly. If you do not understand, please tell me.'],
    ['Como posso te ajudar hoje?', 'How can I help you today?'],
    ['Você prefere falar em inglês?', 'Would you prefer to speak in English?'],
    ['O que você me contar fica entre a equipe, mas se houver risco para alguém, preciso acionar a rede.', 'What you tell me stays within the team, but if someone is at risk, I have to contact the protection network.']
  ]],
  'documentos': ['Documentos e cadastro', [
    ['Você tem algum documento com foto?', 'Do you have any photo ID?'],
    ['Pode me trazer o documento que tiver. Se não tiver nenhum, vamos ver como ajudar.', 'You can bring me whatever document you have. If you have none, we will see how to help.'],
    ['Quantas pessoas moram na sua casa?', 'How many people live in your home?'],
    ['Vamos fazer ou atualizar o Cadastro Único. É gratuito.', 'We will do or update the Unified Registry (CadÚnico). It is free of charge.'],
    ['Seu cadastro precisa ser atualizado a cada dois anos, ou antes se algo mudar.', 'Your registration must be updated every two years, or sooner if something changes.'],
    ['Você tem comprovante de endereço? Se não, podemos ver uma declaração.', 'Do you have proof of address? If not, we can look at a declaration.']
  ]],
  'saude': ['Saúde e encaminhamento', [
    ['Você precisa de atendimento de saúde? Vou te indicar a UBS mais perto.', 'Do you need health care? I will tell you where the nearest UBS (public health clinic) is.'],
    ['O atendimento no SUS é gratuito, inclusive para estrangeiros.', 'Care in the SUS is free, including for foreigners.'],
    ['Se é urgência, ligue 192 (SAMU).', 'If it is an emergency, call 192 (SAMU).'],
    ['Quando foi a última vez que você foi ao médico?', 'When was the last time you saw a doctor?'],
    ['Você está grávida? Já começou o pré-natal?', 'Are you pregnant? Have you started prenatal care?'],
    ['Vou te encaminhar ao CAPS. Você vai ser atendido(a) por uma equipe.', 'I will refer you to the CAPS. You will be seen by a team.']
  ]],
  'violencia': ['Violência e proteção', [
    ['Você está seguro(a) agora?', 'Are you safe right now?'],
    ['Eu acredito em você. A culpa não é sua.', 'I believe you. It is not your fault.'],
    ['Se estiver em perigo agora, ligue 190. Violência contra a mulher: 180.', 'If you are in danger now, call 190. Violence against women: 180.'],
    ['Se a vítima for criança ou adolescente, comunicamos o Conselho Tutelar.', 'If the victim is a child or teenager, we notify the Guardianship Council (Conselho Tutelar).'],
    ['Você não precisa contar tudo de novo. Vou registrar o que você disse.', 'You do not have to tell it all again. I will write down what you said.'],
    ['Você pode pedir medida protetiva na delegacia ou na Defensoria.', 'You can ask for a protective order at the police station or at the Public Defender\'s Office.']
  ]],
  'beneficios': ['Benefícios', [
    ['O Bolsa Família é para famílias de baixa renda inscritas no Cadastro Único.', 'Bolsa Família is for low-income families registered in the Unified Registry.'],
    ['Os filhos precisam ir à escola e manter a vacina em dia.', 'The children must go to school and keep their vaccines up to date.'],
    ['O BPC é para pessoa idosa (65+) ou com deficiência, de baixa renda.', 'The BPC is for older people (65+) or people with disabilities who have a low income.'],
    ['Eu não decido quem recebe: a análise é feita pelo sistema do governo.', 'I do not decide who receives it: the analysis is done by the government system.'],
    ['Vou te explicar o que falta para completar o pedido.', 'I will explain what is missing to complete the application.']
  ]],
  'telefone': ['Telefone e agendamento', [
    ['Alô, CRAS [NOME], bom dia.', 'Hello, CRAS [NAME], good morning.'],
    ['Você pode repetir mais devagar, por favor?', 'Could you please repeat that more slowly?'],
    ['Vamos marcar para segunda-feira, às 9 horas. Pode vir?', 'Let us book it for Monday at 9 a.m. Can you come?'],
    ['Me confirme que entendeu: o dia, o horário e o endereço.', 'Please confirm that you understood: the day, the time and the address.'],
    ['Se não puder vir, avise com antecedência.', 'If you cannot come, please let us know in advance.']
  ]],
  'despedida': ['Fechamento', [
    ['Ficou alguma dúvida?', 'Do you have any questions?'],
    ['Pode voltar quando precisar.', 'You can come back whenever you need.'],
    ['Obrigado(a) por vir.', 'Thank you for coming.'],
    ['Vou anotar o próximo passo para você.', 'I will write down the next step for you.']
  ]]
};

// Inglês e crioulo da Guiana (uso informal; confirme o sentido com a pessoa): [palavra, significado, nota]
export const ING_GUIANA = [
  ['wha\' happenin\' / wah gwaan', 'o que está acontecendo / como vai (cumprimento informal)', 'Cumprimento, não pedido de ajuda.'],
  ['mi / me (no lugar de "I")', 'eu (no crioulo guianense, "me want" = eu quero)', 'A gramática do crioulo difere do inglês padrão; peça para repetir com calma.'],
  ['dem', 'plural: "the children dem" = as crianças', ''],
  ['nah / na', 'não', '"Me na have" = eu não tenho.'],
  ['bai / bye', 'rapaz, amigo (tratamento informal)', ''],
  ['lime', 'sair para se divertir, ficar à toa com amigos', 'Não é a fruta no contexto de lazer.'],
  ['gyaff', 'conversar, bater papo', ''],
  ['wuk', 'trabalho ("wuk" = work)', 'Para renda, peça o valor em reais ou a estimativa mensal.'],
  ['pickney / pikni', 'criança', 'Informal; em atendimento use "child".'],
  ['Guyana dollar (GYD)', 'moeda da Guiana', 'Para renda, peça o valor em reais.'],
  ['Lethem / Bonfim', 'cidades gêmeas na fronteira Guiana–Brasil (Roraima)', 'Muitas pessoas atravessam para trabalhar, comprar ou buscar saúde.'],
  ['Region 9 (Upper Takutu–Upper Essequibo)', 'região da Guiana que faz fronteira com Roraima', 'Aí vivem povos indígenas (Macuxi, Wapichana) que podem falar também português.']
];
