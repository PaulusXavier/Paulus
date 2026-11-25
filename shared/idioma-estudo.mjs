// Tutor local de inglês e espanhol. Conteúdo estático, revisável e sem chamadas de rede/IA.
// É usado antes do caminho da IA no navegador: aulas, vocabulário e exercícios continuam disponíveis quando a cota acaba.

const ES_AULAS = [
  ['Cumprimentos e apresentação', 'Hola = olá; buenos días = bom dia; buenas tardes = boa tarde; buenas noches = boa noite. Para se apresentar: “Me llamo Ana” (Meu nome é Ana); “¿Cómo se llama?” (Como o(a) senhor(a) se chama?). Use usted em situações formais; tú é informal. “Mucho gusto” = muito prazer.'],
  ['Pronomes, ser e estar', 'yo = eu; tú = você informal; usted = o(a) senhor(a); él/ella = ele/ela; nosotros = nós; ustedes = vocês; ellos/ellas = eles/elas. SER: soy, eres, es, somos, son. ESTAR: estoy, estás, está, estamos, están. “Soy brasileño” (identidade/origem); “Estoy aquí” (estado/localização).'],
  ['Presente regular', 'Verbos em -AR: hablar → hablo, hablas, habla, hablamos, hablan. -ER: comer → como, comes, come, comemos, comen. -IR: vivir → vivo, vives, vive, vivimos, viven. Na América Latina, ustedes é a forma comum de “vocês”: hablan, comen, viven. Exemplo: “Trabajo y estudio”.'],
  ['Verbos essenciais', 'TENER: tengo, tienes, tiene, tenemos, tienen. IR: voy, vas, va, vamos, van. QUERER: quiero, quieres, quiere, queremos, quieren. PODER: puedo, puedes, puede, podemos, pueden. Exemplos: “Tengo una cita”, “Voy al centro”, “¿Puede repetir?”.'],
  ['Perguntas e cortesia', 'Perguntas levam ¿...? e acento em qué, cómo, cuándo, dónde, quién, cuál, cuánto. “¿Qué necesita?” (Do que precisa?), “¿Dónde vive?” (Onde mora?), “¿Puede esperar, por favor?” (Pode esperar, por favor?). Para pedir com delicadeza: “¿Podría...?” (Poderia...?) e “Quisiera...” (Eu gostaria...).'],
  ['Passado e futuro', 'Pretérito: “Ayer fui al centro” (Ontem fui ao centro); “Hablé con ella” (Conversei com ela). Imperfeito descreve hábito/contexto: “Cuando era niña...” (Quando era criança...). Futuro próximo: IR + a + infinitivo: “Voy a llamar mañana” (Vou ligar amanhã).']
];

const EN_AULAS = [
  ['Cumprimentos e apresentação', 'Hello = olá; good morning = bom dia; good afternoon = boa tarde; good evening = boa noite ao chegar. “My name is Ana” = Meu nome é Ana; “What is your name?” = Qual é seu nome?; “Nice to meet you” = Prazer em conhecer você. “Please” = por favor; “Thank you” = obrigado(a).'],
  ['Pronomes e verbo to be', 'I = eu; you = você/vocês; he/she/it = ele/ela/isso; we = nós; they = eles/elas. TO BE: I am, you are, he/she/it is, we are, they are. Contrações comuns: I’m, you’re, she’s, we’re, they’re. Negativa: “I am not”; pergunta: “Are you okay?”.'],
  ['Presente simples e rotina', 'Use o presente simples para hábitos: “I work every day”. Com he/she/it, acrescente -s: “She works”. Negativa/pergunta usa DO; para he/she/it, DOES: “I don’t work”, “She doesn’t work”, “Do you work?”, “Where does he live?”. Depois de does, o verbo fica sem -s.'],
  ['Ações acontecendo agora', 'Presente contínuo = am/is/are + verbo em -ing: “I am studying now” (Estou estudando agora); “She is working” (Ela está trabalhando); “They are waiting” (Eles estão esperando). Use para ações em andamento, não para todo hábito. Hábito: “I work”; agora: “I am working”.'],
  ['Passado e futuro', 'Passado regular: verbo + -ed (work → worked); alguns são irregulares (go → went, have → had, see → saw). Negativa/pergunta usa DID + verbo base: “I didn’t go”, “Did you call?”. Futuro planejado: going to; decisão/previsão: will. “I’m going to call tomorrow”.'],
  ['Perguntas, pedidos e modais', 'Pergunta: palavra interrogativa + auxiliar + pessoa + verbo: “Where do you live?”. CAN = poder/saber; COULD = poderia (mais cortês); SHOULD = deveria; HAVE TO = ter que. “Could you repeat, please?”; “Can I help you?”; “You should talk to a professional.”']
];

const ES_VOCAB = {
  basico: 'hola — olá; buenos días — bom dia; por favor — por favor; gracias — obrigado(a); de nada — de nada; sí — sim; no — não; perdón — desculpe; ayuda — ajuda; entiendo — entendo; no entiendo — não entendo; despacio — devagar; otra vez — outra vez; hoy — hoje; mañana — amanhã.',
  familia: 'madre — mãe; padre — pai; hijo/hija — filho/filha; hermano/hermana — irmão/irmã; familia — família; pareja — companheiro(a); niño/niña — menino(a); persona mayor — pessoa idosa; amigo/amiga — amigo(a); casa — casa; habitación — quarto; comida — comida.',
  comida: 'agua — água; pan — pão; arroz — arroz; frijoles — feijão; fruta — fruta; leche — leite; café — café; desayuno — café da manhã; almuerzo — almoço; cena — jantar; hambre — fome; sed — sede; comer — comer; beber — beber; cuenta — conta.',
  viagem: '¿Dónde está...? — Onde fica...?; calle — rua; avenida — avenida; derecha — direita; izquierda — esquerda; recto — em frente; cerca — perto; lejos — longe; autobús — ônibus; parada — ponto; boleto — passagem; llegar — chegar; salir — sair; mapa — mapa; baño — banheiro.',
  rotina: 'despertar — acordar; trabajar — trabalhar; estudiar — estudar; descansar — descansar; hablar — falar; escuchar — escutar; leer — ler; escribir — escrever; necesitar — precisar; querer — querer; poder — poder; tener — ter; hacer — fazer; ir — ir; venir — vir.'
};

const EN_VOCAB = {
  basico: 'hello — olá; good morning — bom dia; please — por favor; thank you — obrigado(a); you’re welcome — de nada; yes — sim; no — não; sorry — desculpe; help — ajuda; I understand — entendo; I don’t understand — não entendo; slowly — devagar; again — outra vez; today — hoje; tomorrow — amanhã.',
  familia: 'mother — mãe; father — pai; son/daughter — filho/filha; brother/sister — irmão/irmã; family — família; partner — companheiro(a); child — criança; older person — pessoa idosa; friend — amigo(a); house — casa; room — quarto; food — comida.',
  comida: 'water — água; bread — pão; rice — arroz; beans — feijão; fruit — fruta; milk — leite; coffee — café; breakfast — café da manhã; lunch — almoço; dinner — jantar; hungry — com fome; thirsty — com sede; eat — comer; drink — beber; bill — conta.',
  viagem: 'Where is...? — Onde fica...?; street — rua; avenue — avenida; right — direita; left — esquerda; straight ahead — em frente; near — perto; far — longe; bus — ônibus; bus stop — ponto; ticket — passagem; arrive — chegar; leave — sair; map — mapa; bathroom — banheiro.',
  rotina: 'wake up — acordar; work — trabalhar; study — estudar; rest — descansar; speak — falar; listen — escutar; read — ler; write — escrever; need — precisar; want — querer; can — poder; have — ter; do — fazer; go — ir; come — vir.'
};

const RODAPE = '\n\nModo de estudo local: resposta pronta neste aparelho, sem internet e sem gastar a cota da IA. É um material de apoio; variantes e pronúncia mudam por região. Para conteúdo fora desta trilha, pergunte quando a IA estiver disponível.';
function normIdioma(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function formatarAula(nome, aulas, num) {
  const i = Math.max(1, Math.min(aulas.length, num || 1)) - 1;
  return '## ' + nome + ' — aula ' + (i + 1) + ': ' + aulas[i][0] + '\n\n' + aulas[i][1] + RODAPE;
}
function escolherIdioma(n, historico) {
  const es = /\b(espanhol|espanol|castelhano|spanish)\b/.test(n);
  const en = /\b(ingles|english)\b/.test(n);
  if (es && en) return 'ambos';
  if (es) return 'es';
  if (en) return 'en';
  for (let i = (historico || []).length - 1; i >= 0; i--) {
    const h = historico[i];
    if (!h || h.papel !== 'usuario') continue;
    const x = normIdioma(h.texto);
    if (/\b(espanhol|espanol|castelhano|spanish)\b/.test(x)) return 'es';
    if (/\b(ingles|english)\b/.test(x)) return 'en';
  }
  return '';
}
function vocabulario(idioma, n) {
  const dados = idioma === 'es' ? ES_VOCAB : EN_VOCAB;
  let chave = 'basico';
  if (/familia|family|parent|casa|home/.test(n)) chave = 'familia';
  else if (/comida|alimento|restaurante|food|eat|drink/.test(n)) chave = 'comida';
  else if (/viagem|viajar|direcao|direcao|transporte|travel|direction|bus|mapa/.test(n)) chave = 'viagem';
  else if (/rotina|verbo|acao|daily|routine|verb/.test(n)) chave = 'rotina';
  const nome = idioma === 'es' ? 'espanhol' : 'inglês';
  return '## Vocabulário de ' + nome + ' — ' + chave + '\n\n' + dados[chave] + RODAPE;
}
function gramatica(idioma) {
  if (idioma === 'es') return '## Gramática essencial do espanhol\n\n- Artigos: el/la (o/a), los/las (os/as); un/una (um/uma). Substantivos e adjetivos concordam: “niño pequeño”, “niña pequeña”.\n- SER: soy, eres, es, somos, son. Identidade, origem e características: “Ella es venezolana”.\n- ESTAR: estoy, estás, está, estamos, están. Estado e localização: “Está cansada”; “Estamos aquí”.\n- Presente regular: hablar → hablo/hablas/habla/hablamos/hablan; comer → como/comes/come/comemos/comen; vivir → vivo/vives/vive/vivimos/viven.\n- Pergunta: ¿qué? o quê; ¿dónde? onde; ¿cuándo? quando; ¿cómo? como; ¿por qué? por quê.\n- Negação: no antes do verbo: “No entiendo”. Futuro próximo: ir + a + infinitivo: “Voy a llamar”.' + RODAPE;
  return '## Gramática essencial do inglês\n\n- Ordem básica: sujeito + verbo + complemento: “She works here”. Adjetivo vem antes do substantivo: “a small house”.\n- TO BE: I am; you/we/they are; he/she/it is. Pergunta: “Are you okay?”; negativa: “She is not here”.\n- Presente simples: “I work”; he/she/it + -s: “He works”. Perguntas e negativas usam do/does: “Do you work?”; “She doesn’t work”.\n- Presente contínuo: am/is/are + -ing: “They are studying”.\n- Passado: regular + -ed; irregulares comuns: go/went, have/had, see/saw. Pergunta/negativa: did + verbo base.\n- Artigos: a antes de som consonantal (“a book”), an antes de som vocálico (“an apple”), the para algo específico. Plural normalmente + -s.' + RODAPE;
}
function pronuncia(idioma) {
  if (idioma === 'es') return '## Pronúncia inicial do espanhol\n\n- As cinco vogais são estáveis: a, e, i, o, u; evite transformar “e” em “i”.\n- ñ soa parecido com “nh”: niño. j e g antes de e/i têm som forte de garganta: gente, mujer (varia por região).\n- h não é pronunciada: hola. ll e y variam por país; podem soar como “i” ou “j” suave.\n- r no começo é vibrante forte; rr também: perro. Uma r entre vogais é mais curta: pero.\n- O acento escrito marca a sílaba tônica quando a regra geral não basta: teléfono, también. Use aproximação só para começar; ouvir falantes da variante escolhida é melhor.' + RODAPE;
  return '## Pronúncia inicial do inglês\n\n- A escrita nem sempre mostra a pronúncia; aprenda a palavra junto com áudio de uma fonte confiável quando estiver online.\n- TH tem dois sons, como em think e this; nenhum é exatamente igual ao “t” ou “d” do português.\n- O som de schwa /ə/ é curto e fraco em sílabas sem acento: about.\n- A vogal muda entre palavras parecidas: ship/sheep; full/fool. O acento da palavra e o ritmo importam.\n- Treine frases curtas, sem tentar pronunciar cada letra escrita. As aproximações em português são imperfeitas e variam por sotaque.' + RODAPE;
}
function exercicio(idioma) {
  if (idioma === 'es') return '## Prática de espanhol — confira o gabarito no fim\n\n1. Traduza: “Good morning”.\n2. Complete com SER: “Yo ___ brasileña”.\n3. Como se diz “I need help”?\n4. Escolha: “Estoy / Soy aquí”.\n5. Traduza: “Voy a llamar mañana”.\n\n**Gabarito:** 1) Buenos días. 2) soy. 3) Necesito ayuda. 4) Estoy aquí. 5) Vou ligar amanhã.\n\nTente responder em voz alta antes de olhar o gabarito.' + RODAPE;
  return '## Practice English — answer key below\n\n1. Translate: “Bom dia”.\n2. Complete: “She ___ at the clinic” (work).\n3. Make a question: “you / live here”.\n4. Translate: “Estou estudando agora”.\n5. Complete in the past: “They ___ to the office” (go).\n\n**Answer key:** 1) Good morning. 2) works. 3) Do you live here? 4) I am studying now. 5) went.\n\nTry to answer aloud before checking the key.' + RODAPE;
}
function plano(idioma) {
  const nome = idioma === 'es' ? 'espanhol' : 'inglês';
  return '## Trilha local de ' + nome + ' — 4 semanas\n\n- **Semana 1:** cumprimentos, apresentação, pronomes, números e verbo mais básico (ser/estar ou to be).\n- **Semana 2:** presente, rotina, família e vocabulário de casa/comida.\n- **Semana 3:** perguntas, pedidos corteses, horários, direções e agendamento.\n- **Semana 4:** passado, planos futuros, revisão e simulações curtas.\n\nEstude 15–20 minutos por dia: leia a aula, repita frases em voz alta, escreva 5 exemplos próprios sem dados pessoais e faça um exercício. Peça “aula 1 de ' + nome + '”, “gramática de ' + nome + '”, “vocabulário de viagem em ' + nome + '” ou “exercício de ' + nome + '”. O material local não depende da cota.' + RODAPE;
}

// Responde apenas a pedidos explícitos de estudo/prática; texto geral continua para as rotas normais.
export function respostaLocalEstudo(pergunta, historico) {
  const n = normIdioma(pergunta);
  if (!n || n.length > 300) return null;
  const falaDeEstudo = /\b(aprender|aprenda|aprendo|estudar|estude|ensinar|ensine|aula|licao|curso|trilha|plano de estudo|praticar|pratique|treinar|treine|exercicio|quiz|gramatica|conjugacao|conjugar|vocabulario|palavras|pronuncia)\b/.test(n);
  if (!falaDeEstudo) return null;
  const idioma = escolherIdioma(n, historico);
  if (idioma === 'ambos') return { idioma: 'es', tipoLocal: 'curso', texto: 'Posso ajudar a estudar os dois idiomas com material local, sem gastar a cota da IA.\n\n**Espanhol:** aula 1, gramática, vocabulário, pronúncia e exercício.\n**Inglês:** aula 1, gramática, vocabulário, pronúncia e exercício.\n\nPeça uma etapa por vez, por exemplo: “curso básico de espanhol” ou “exercício de inglês”.' + RODAPE };
  if (!idioma) return null;
  const nome = idioma === 'es' ? 'espanhol' : 'inglês';
  const aulas = idioma === 'es' ? ES_AULAS : EN_AULAS;
  if (/\b(plano de estudo|curso|trilha|roteiro)\b/.test(n)) return { idioma: idioma, tipoLocal: 'curso', texto: plano(idioma) };
  if (/\b(gramatica|conjugacao|conjugar|verbos?)\b/.test(n)) return { idioma: idioma, tipoLocal: 'gramatica', texto: gramatica(idioma) };
  if (/\b(pronuncia)\b/.test(n)) return { idioma: idioma, tipoLocal: 'pronuncia', texto: pronuncia(idioma) };
  if (/\b(exercicio|quiz|praticar|pratique|treinar|treine)\b/.test(n)) return { idioma: idioma, tipoLocal: 'exercicio', texto: exercicio(idioma) };
  if (/\b(vocabulario|palavras)\b/.test(n)) return { idioma: idioma, tipoLocal: 'vocabulario', texto: vocabulario(idioma, n) };
  const m = /\b(?:aula|licao)\s*(\d{1,2})\b/.exec(n);
  if (m) return { idioma: idioma, tipoLocal: 'aula', texto: formatarAula(nome, aulas, Number(m[1])) };
  return { idioma: idioma, tipoLocal: 'aula', texto: formatarAula(nome, aulas, 1) };
}
