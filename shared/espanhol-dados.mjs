// Dados do espanhol do trabalho no SUAS (v0.18.0): glossário PT↔ES, falsos amigos, frases por situação e espanhol da Venezuela.
// FONTE ÚNICA: o navegador e o Worker usam este arquivo. Não tem dado de pessoa: só vocabulário e frases-modelo.
// Regra de ouro: o NOME OFICIAL do serviço fica em português (a pessoa vai procurá-lo assim); o espanhol serve para explicar.

// [português, espanhol (variantes separadas por " / "), nota opcional]
export const ESP_GLOSSARIO = {
  'Serviços e equipamentos': [
    ['CRAS', 'Centro de Referencia de Asistencia Social (CRAS)', 'Porta de entrada da assistência social no território. Gratuito. Explique em uma frase: "lugar donde se recibe orientación y apoyo social".'],
    ['CREAS', 'Centro de Referencia Especializado de Asistencia Social (CREAS)', 'Atende pessoas e famílias com direitos violados (violência, abandono, trabalho infantil).'],
    ['Centro POP', 'Centro de Atención a Personas en Situación de Calle', 'Atende pessoas em situação de rua.'],
    ['CAPS', 'Centro de Atención Psicosocial (CAPS)', 'Serviço público de saúde mental. Não precisa pagar.'],
    ['UBS', 'Unidad Básica de Salud (UBS) / puesto de salud', 'Primeira porta do SUS: consulta, vacina, pré-natal.'],
    ['UPA', 'Unidad de Pronto Atención (UPA) / atención de urgencia', 'Urgência 24 horas.'],
    ['SAMU', 'SAMU (ambulancia)', 'Telefone 192. Gratuito.'],
    ['Conselho Tutelar', 'Consejo Tutelar (órgano que protege los derechos de niños y adolescentes)', 'Mantenha o nome em português; a pessoa vai procurá-lo assim.'],
    ['Defensoria Pública', 'Defensoría Pública (abogado gratuito del Estado)', 'Assistência jurídica gratuita.'],
    ['Polícia Federal', 'Policía Federal (documentos de migración)', 'Registro migratório e regularização.'],
    ['escola', 'escuela / colegio', ''],
    ['abrigo', 'albergue / refugio / centro de acogida', 'Cuidado: em espanhol "abrigo" é agasalho (casaco). Para o serviço, use "albergue".'],
    ['acolhimento institucional', 'acogida institucional', ''],
    ['Operação Acolhida', 'Operación Acogida', 'Resposta federal ao fluxo de venezuelanos em Roraima.'],
    ['cartório', 'notaría / registro civil', ''],
    ['Receita Federal', 'Receita Federal (impuestos y CPF)', ''],
    ['delegacia', 'comisaría / delegación de policía', 'Boletim de ocorrência = denuncia policial / acta de denuncia.'],
    ['SUS', 'SUS (Sistema Único de Salud: público y gratuito)', 'Atende também estrangeiros.']
  ],
  'Benefícios e programas': [
    ['Cadastro Único (CadÚnico)', 'Registro Único (CadÚnico)', 'Cadastro das famílias de baixa renda; é a porta de entrada dos programas. Mantenha "CadÚnico".'],
    ['Bolsa Família', 'Bolsa Familia (ayuda mensual del gobierno para familias de bajos ingresos)', 'Tem condicionalidades de saúde e educação.'],
    ['BPC', 'BPC (Beneficio de Prestación Continuada: un salario mínimo para persona mayor o con discapacidad de bajos ingresos)', 'Não é aposentadoria. Pede CadÚnico atualizado.'],
    ['benefício eventual', 'beneficio eventual (ayuda temporal en situación de emergencia)', ''],
    ['cesta básica', 'canasta básica de alimentos', ''],
    ['aluguel social', 'alquiler social (ayuda temporal para vivienda)', ''],
    ['auxílio funeral', 'auxilio funerario', ''],
    ['auxílio natalidade', 'auxilio por nacimiento', ''],
    ['condicionalidades', 'condicionalidades (exigencias de salud y escuela para mantener el beneficio)', ''],
    ['renda per capita', 'ingreso per cápita (ingreso de la familia dividido entre las personas)', ''],
    ['SCFV', 'Servicio de Convivencia y Fortalecimiento de Vínculos', ''],
    ['PAIF', 'PAIF (Servicio de Protección y Atención Integral a la Familia)', ''],
    ['PAEFI', 'PAEFI (Servicio de Protección y Atención Especializada a Familias e Individuos)', '']
  ],
  'Documentos': [
    ['certidão de nascimento', 'partida de nacimiento / acta de nacimiento', ''],
    ['certidão de casamento', 'acta de matrimonio', ''],
    ['CPF', 'CPF (registro de contribuyente brasileño)', 'Gratuito na Receita Federal; migrante pode tirar.'],
    ['RG', 'RG (cédula de identidad brasileña)', ''],
    ['cédula de identidade (estrangeiro)', 'cédula de identidad', 'Na Venezuela, "cédula" é o documento de identidade.'],
    ['passaporte', 'pasaporte', ''],
    ['CRNM', 'CRNM (carné de registro migratorio)', 'Documento do migrante regularizado.'],
    ['protocolo de refúgio', 'protocolo de solicitud de refugio', ''],
    ['carteira de trabalho', 'carné de trabajo (CTPS)', ''],
    ['comprovante de residência', 'comprobante de domicilio / constancia de residencia', 'Se a pessoa não tem, diga que há alternativas (declaração).'],
    ['cartão do SUS', 'tarjeta del SUS (sistema público de salud)', 'Migrante tem direito, mesmo sem documento brasileiro.'],
    ['segunda via', 'duplicado / copia', ''],
    ['declaração', 'declaración / constancia', '']
  ],
  'Família e pessoas': [
    ['criança', 'niño / niña', ''],
    ['adolescente', 'adolescente', ''],
    ['pessoa idosa', 'persona mayor / adulto mayor', 'Evite "anciano" por soar pejorativo.'],
    ['pessoa com deficiência', 'persona con discapacidad', ''],
    ['gestante', 'embarazada / gestante', 'Em espanhol "embarazada" é grávida (não "embaraçada").'],
    ['mãe', 'madre / mamá', ''],
    ['pai', 'padre / papá', ''],
    ['filho(a)', 'hijo(a)', ''],
    ['esposo(a), marido, companheiro(a)', 'esposo(a) / marido / pareja', ''],
    ['sobrenome', 'apellido', ''],
    ['nome', 'nombre', ''],
    ['responsável', 'responsable / tutor(a) / representante', ''],
    ['família', 'familia', ''],
    ['vizinho(a)', 'vecino(a)', '']
  ],
  'Saúde': [
    ['consulta', 'consulta médica / cita', ''],
    ['vacina', 'vacuna', 'Gratuita no SUS; leve o cartão de vacina.'],
    ['pré-natal', 'control prenatal', ''],
    ['remédio', 'medicina / medicamento / pastillas', ''],
    ['atendimento psicológico', 'atención psicológica', ''],
    ['saúde mental', 'salud mental', ''],
    ['internação', 'hospitalización / ingreso', ''],
    ['encaminhamento', 'derivación / remisión / referencia', 'Explique: "una nota para que usted sea atendido en otro servicio".'],
    ['urgência', 'urgencia / emergencia', ''],
    ['dor', 'dolor', ''],
    ['febre', 'fiebre', ''],
    ['transtorno', 'trastorno', ''],
    ['laudo', 'informe / dictamen médico', ''],
    ['prontuário', 'historia clínica / expediente', 'Documento do serviço; não é entregue à pessoa sem regra.'],
    ['benefício', 'beneficio / ayuda', '']
  ],
  'Atendimento e direitos': [
    ['atendimento', 'atención', ''],
    ['acolhida', 'acogida / recibimiento', ''],
    ['escuta qualificada', 'escucha activa y respetuosa', ''],
    ['direito', 'derecho', ''],
    ['violação de direitos', 'violación de derechos', ''],
    ['violência doméstica', 'violencia doméstica / violencia en el hogar', ''],
    ['denúncia', 'denuncia', ''],
    ['medida protetiva', 'medida de protección', ''],
    ['trabalho infantil', 'trabajo infantil', ''],
    ['tráfico de pessoas', 'trata de personas', ''],
    ['situação de rua', 'situación de calle', ''],
    ['intérprete', 'intérprete', 'Se a conversa for difícil, peça apoio de intérprete.'],
    ['sigilo', 'confidencialidad / reserva', 'Não prometa sigilo absoluto: há situações de proteção que exigem comunicar.'],
    ['visita domiciliar', 'visita domiciliaria', ''],
    ['coordenação', 'coordinación', ''],
    ['senha (ficha de espera)', 'turno / ficha de espera', '']
  ],
  'Dinheiro, trabalho e tempo': [
    ['renda', 'ingreso / renta', 'Em espanhol, "renta" costuma ser aluguel.'],
    ['salário mínimo', 'salario mínimo', ''],
    ['aluguel', 'alquiler', ''],
    ['emprego', 'empleo / trabajo', ''],
    ['desempregado(a)', 'desempleado(a) / sin trabajo', ''],
    ['segunda-feira', 'lunes', ''], ['terça-feira', 'martes', ''], ['quarta-feira', 'miércoles', ''],
    ['quinta-feira', 'jueves', ''], ['sexta-feira', 'viernes', ''],
    ['amanhã', 'mañana', ''], ['hoje', 'hoy', ''], ['semana que vem', 'la próxima semana', ''],
    ['horário de atendimento', 'horario de atención', '']
  ]
};

// Palavras soltas do espanhol → termos de busca em português (a base de normas está em português).
export const ESP_PALAVRAS_BUSCA = {
  ayuda: 'ajuda auxilio', auxilio: 'auxilio beneficio', beneficio: 'beneficio', beneficios: 'beneficios', hijo: 'filho', hija: 'filha', hijos: 'filhos', hijas: 'filhas',
  nino: 'crianca', nina: 'crianca', ninos: 'criancas', ninas: 'criancas', adolescentes: 'adolescentes', escuela: 'escola', colegio: 'escola', inscribo: 'inscricao cadastro',
  inscribir: 'inscricao cadastro', inscripcion: 'inscricao', registro: 'cadastro', registrar: 'cadastro', registrarme: 'cadastro', documentos: 'documentos', documento: 'documento',
  cedula: 'documento identidade', pasaporte: 'passaporte', requisitos: 'requisitos', mayor: 'idosa', mayores: 'idosos', anciano: 'idoso', discapacidad: 'deficiencia',
  embarazada: 'gestante', embarazo: 'gestante gestacao', violencia: 'violencia', maltrato: 'violencia', denuncia: 'denuncia', abuso: 'abuso violencia', abandono: 'abandono',
  trabajo: 'trabalho emprego', desempleo: 'desemprego', desempleado: 'desempregado', renta: 'renda', ingreso: 'renda', ingresos: 'renda', comida: 'alimentacao',
  alimentos: 'alimentacao seguranca alimentar', hambre: 'fome seguranca alimentar', vivienda: 'moradia habitacao', calle: 'situacao rua', refugio: 'refugio migrante',
  refugiado: 'refugiado migrante', migrante: 'migrante', migracion: 'migracao migrante', extranjero: 'estrangeiro migrante', venezolano: 'venezuelano migrante',
  venezolana: 'venezuelana migrante', venezolanos: 'venezuelanos migrantes', salud: 'saude', mental: 'mental', psicologo: 'psicologo', psicologa: 'psicologa',
  vacuna: 'vacina', medico: 'medico', consulta: 'consulta', pension: 'beneficio', cuanto: 'valor quanto', cuesta: 'custa valor', gratis: 'gratuito', gratuito: 'gratuito',
  derecho: 'direito', derechos: 'direitos', familia: 'familia', familias: 'familias', madre: 'mae', padre: 'pai', abuelo: 'avo idoso', abuela: 'avo idosa',
  puedo: 'posso', recibir: 'receber', cobrar: 'receber', solicitar: 'solicitar requerer', pedir: 'solicitar', tramite: 'procedimento solicitacao', cita: 'agendamento',
  alquiler: 'aluguel', cesta: 'cesta', canasta: 'cesta basica', nacimiento: 'nascimento', matrimonio: 'casamento', partida: 'certidao', acta: 'certidao',
  tutor: 'responsavel', tutelar: 'tutelar', consejo: 'conselho', condicionalidades: 'condicionalidades', frecuencia: 'frequencia', vinculos: 'vinculos',
  asistencia: 'assistencia', social: 'social', proteccion: 'protecao', atencion: 'atendimento', adulto: 'adulto', trata: 'trafico pessoas', trafico: 'trafico pessoas'
};

// Falsos amigos entre português e espanhol que mais atrapalham no atendimento: [palavra, o que quer dizer em espanhol, nota]
export const ESP_FALSOS_AMIGOS = [
  ['embarazada', 'grávida (não "embaraçada")', 'Perguntar "¿está embarazada?" é perguntar se está grávida.'],
  ['pegar', 'bater, golpear ("mi esposo me pega" = meu marido me bate); também grudar', 'Em relato de violência, "me pega" quer dizer "me bate". Nunca trate como "pegar" no sentido de agarrar.'],
  ['apellido', 'sobrenome', 'Em formulário, "nombre y apellido" é nome e sobrenome.'],
  ['exquisito', 'delicioso, refinado', 'Não é "esquisito" (extraño / raro).'],
  ['oficina', 'escritório, repartição (não "oficina mecânica")', '"Oficina de empleo" é agência de emprego.'],
  ['rato', 'um momento, um tempo curto (não o animal)', '"Espere un rato" = espere um momento.'],
  ['largo', 'comprido, longo (não "largo" de largura)', 'Largura em espanhol é "ancho".'],
  ['vaso', 'copo (não "vaso" de plantas)', ''],
  ['taza', 'xícara', ''],
  ['cola', 'fila (e também rabo ou cola)', '"Hacer cola" = ficar na fila.'],
  ['rubio', 'loiro', ''],
  ['borracho', 'bêbado', 'Não é "borracha". Palavra comum em relatos sobre álcool.'],
  ['constipado', 'resfriado, com gripe (não "constipado" de intestino)', 'Intestino preso é "estreñido".'],
  ['carpeta', 'pasta de documentos', ''],
  ['lunes / martes / ...', 'dias da semana sem "feira"', 'Segunda-feira = lunes; terça = martes.'],
  ['aceite', 'óleo (de cozinha)', 'Não tem relação com "aceite" de aceitar.'],
  ['pelo', 'cabelo, pelo no corpo', 'Em português, "pelo" é preposição.'],
  ['cena', 'jantar', 'Não é "cena" de teatro.'],
  ['abrigo', 'agasalho, casaco', 'Para o serviço de acolhimento, use "albergue" ou "refugio".'],
  ['quedar', 'ficar, permanecer, sobrar', '"¿Dónde queda?" = onde fica?'],
];

// Frases-modelo por situação: [português, espanhol]. Use [NOME]/[SERVIÇO] como lacuna e REVISE antes de usar em texto para a família.
export const ESP_FRASES = {
  'acolhida': ['Acolhida e primeiros minutos', [
    ['Bom dia, seja bem-vindo(a).', 'Buenos días, bienvenido(a).'],
    ['Meu nome é [NOME] e sou psicólogo(a) aqui no CRAS. Este serviço é gratuito.', 'Mi nombre es [NOMBRE] y soy psicólogo(a) aquí en el CRAS. Este servicio es gratuito.'],
    ['Posso falar mais devagar. Se não entender, me avise.', 'Puedo hablar más despacio. Si no entiende, avíseme.'],
    ['Como posso te ajudar hoje?', '¿En qué puedo ayudarle hoy?'],
    ['Você prefere falar em espanhol?', '¿Prefiere hablar en español?'],
    ['O que você me contar fica entre a equipe, mas se houver risco para alguém, preciso acionar a rede.', 'Lo que usted me cuente queda entre el equipo, pero si hay riesgo para alguien, tengo que activar la red de protección.']
  ]],
  'documentos': ['Documentos e cadastro', [
    ['Você tem algum documento com foto?', '¿Tiene algún documento con foto?'],
    ['Pode me trazer o documento que tiver. Se não tiver nenhum, vamos ver como ajudar.', 'Puede traerme el documento que tenga. Si no tiene ninguno, vemos cómo ayudarle.'],
    ['Quantas pessoas moram na sua casa?', '¿Cuántas personas viven en su casa?'],
    ['Vamos fazer ou atualizar o Cadastro Único. É gratuito.', 'Vamos a hacer o actualizar el Registro Único (CadÚnico). Es gratuito.'],
    ['Seu cadastro precisa ser atualizado a cada dois anos, ou antes se algo mudar.', 'Su registro debe actualizarse cada dos años, o antes si algo cambia.'],
    ['Você tem comprovante de endereço? Se não, podemos ver uma declaração.', '¿Tiene comprobante de domicilio? Si no, podemos ver una declaración.']
  ]],
  'saude': ['Saúde e encaminhamento', [
    ['Você precisa de atendimento de saúde? Vou te indicar a UBS mais perto.', '¿Necesita atención de salud? Le indico la UBS más cercana.'],
    ['O atendimento no SUS é gratuito, inclusive para estrangeiros.', 'La atención del SUS es gratuita, también para extranjeros.'],
    ['Se é urgência, ligue 192 (SAMU).', 'Si es una urgencia, llame al 192 (SAMU).'],
    ['Quando foi a última vez que você foi ao médico?', '¿Cuándo fue la última vez que fue al médico?'],
    ['Você está grávida? Já começou o pré-natal?', '¿Está embarazada? ¿Ya comenzó el control prenatal?'],
    ['Vou te encaminhar ao CAPS. Você vai ser atendido(a) por uma equipe.', 'Voy a derivarle al CAPS. Será atendido(a) por un equipo.']
  ]],
  'violencia': ['Violência e proteção', [
    ['Você está seguro(a) agora?', '¿Está seguro(a) ahora?'],
    ['Eu acredito em você. A culpa não é sua.', 'Yo le creo. La culpa no es suya.'],
    ['Se estiver em perigo agora, ligue 190. Violência contra a mulher: 180.', 'Si está en peligro ahora, llame al 190. Violencia contra la mujer: 180.'],
    ['Se a vítima for criança ou adolescente, comunicamos o Conselho Tutelar.', 'Si la víctima es un niño o adolescente, comunicamos al Consejo Tutelar.'],
    ['Você não precisa contar tudo de novo. Vou registrar o que você disse.', 'Usted no tiene que contarlo todo de nuevo. Voy a registrar lo que dijo.'],
    ['Você pode pedir medida protetiva na delegacia ou na Defensoria.', 'Puede pedir una medida de protección en la comisaría o en la Defensoría.']
  ]],
  'beneficios': ['Benefícios', [
    ['O Bolsa Familia é para famílias de baixa renda inscritas no Cadastro Único.', 'El Bolsa Familia es para familias de bajos ingresos inscritas en el Registro Único.'],
    ['Os filhos precisam ir à escola e manter a vacina em dia.', 'Los hijos deben ir a la escuela y tener las vacunas al día.'],
    ['O BPC é para pessoa idosa (65+) ou com deficiência, de baixa renda.', 'El BPC es para personas mayores (65+) o con discapacidad, de bajos ingresos.'],
    ['Eu não decido quem recebe: a análise é feita pelo sistema do governo.', 'Yo no decido quién recibe: el análisis lo hace el sistema del gobierno.'],
    ['Vou te explicar o que falta para completar o pedido.', 'Le voy a explicar qué falta para completar la solicitud.']
  ]],
  'telefone': ['Telefone e agendamento', [
    ['Alô, CRAS [NOME], bom dia.', 'Aló, CRAS [NOMBRE], buenos días.'],
    ['Você pode repetir mais devagar, por favor?', '¿Puede repetir más despacio, por favor?'],
    ['Vamos marcar para segunda-feira, às 9 horas. Pode vir?', 'Vamos a agendar para el lunes a las 9 de la mañana. ¿Puede venir?'],
    ['Me confirme que entendeu: o dia, o horário e o endereço.', 'Confírmeme que entendió: el día, la hora y la dirección.'],
    ['Se não puder vir, avise com antecedência.', 'Si no puede venir, avise con anticipación.']
  ]],
  'despedida': ['Fechamento', [
    ['Ficou alguma dúvida?', '¿Quedó alguna duda?'],
    ['Pode voltar quando precisar.', 'Puede volver cuando lo necesite.'],
    ['Obrigado(a) por vir.', 'Gracias por venir.'],
    ['Vou anotar o próximo passo para você.', 'Voy a anotarle el próximo paso.']
  ]]
};

// Espanhol da Venezuela (uso informal; confirme o sentido com a pessoa): [palavra, significado, nota]
export const ESP_VENEZUELA = [
  ['ahorita', 'agora mesmo OU daqui a pouco (depende do tom)', 'Confirme a hora exata.'],
  ['chamo / chama', 'garoto, garota, jovem; tratamento informal entre amigos', ''],
  ['carajito / carajita', 'criança, menino(a) (informal)', ''],
  ['pana', 'amigo', ''],
  ['chévere', 'legal, muito bom', ''],
  ['bolívares', 'moeda da Venezuela', 'Para renda, peça o valor em reais ou a estimativa mensal.'],
  ['cédula', 'documento de identidade venezuelano', ''],
  ['cola', 'fila ("hacer cola")', ''],
  ['arepa', 'prato típico de milho (não é nome de serviço)', ''],
  ['coroto', 'objeto, coisa', '']
];
