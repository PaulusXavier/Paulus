// Resposta por EXTRAÇÃO de frases, sem IA: quando a cota acaba (ou falta rede), em vez de despejar até 3 trechos inteiros da base,
// escolhe as FRASES que respondem ao TIPO da pergunta (valor, prazo, documentos, direito, definição, quem faz), cada uma com a sua fonte numerada.
//
// Princípios:
//  - Nada é inventado: cada frase é cópia literal de um trecho da base. O módulo só escolhe e organiza.
//  - Só entram trechos de aderência ALTA (frase solta de trecho fraco pode ser o contrário do que o texto defende).
//  - Preferir não responder a mostrar frase fora de contexto: sem frase que cubra a pergunta devolve null e o app mostra os trechos inteiros, como antes.
//  - É seleção de frases, NÃO é raciocínio: não decide se o caso concreto da família se enquadra, e o próprio texto diz isso.
//
// Os nomes têm prefixo EXT/Ext porque o arquivo do navegador junta todos os módulos num só escopo (scripts/build.mjs).
import { normalizar } from './busca.mjs';

const EXT_MAX_FRASES = 4;
const EXT_MAX_POR_TRECHO = 2;
const EXT_TAM_MIN = 28;
const EXT_TAM_MAX = 360;
const EXT_PESO_ADERENCIA = { alta: 1 };
const EXT_RE_DOC_FORA = /^(?:argo-|mapa-boa-vista-osm|diretorio)/;

// Palavras de ligação e de pergunta: não são o ASSUNTO.
const EXT_VAZIAS = /^(para|como|qual|quais|quem|onde|quando|sobre|pode|posso|devo|deve|isso|esse|essa|esta|este|ser|tem|uma|uns|das|dos|com|que|por|nos|nas|mais|muito|fazer|preciso|sao|foi|era|entre|ate|apos|sem|seu|sua|seus|suas|meu|minha|nao|sim|ainda|cada|toda|todo|todos|todas|outro|outra|depois|antes|quanto|quanta|quantos|quantas|existe|existem|tenho|temos|fica|ficam|alguem|algum|alguma|dizer|significa|exige|exigem|necessarios|necessario|necessaria|preciso|precisa|precisam|recebe|recebem|receber)$/;

// Sinal que a FRASE precisa ter para responder cada tipo de pergunta.
const EXT_SINAIS = {
  valor: /\bsalario minimo\b|\bmeio salario\b/,   // R$ e % são lidos no texto original (a normalização apaga os símbolos): veja EXT_RE_VALOR
  prazo: /\b(?:\d+\s*(?:dias|dia|meses|mes|anos|ano|horas)|ate o dia|prazo|no maximo|a cada \w+|trimestral|mensal|anual|bienal|vigencia)\b/,
  documentos: /\b(?:documentos?|cpf|rg|certidao|comprovantes?|titulo de eleitor|identidade|carteira|cartao)\b/,
  direito: /\b(?:tem direito|tem acesso|pode receber|podem receber|poderao receber|elegiveis?|elegibilidade|destina se|fazem jus|criterios?|requisitos?|renda familiar|renda per capita|familias? (?:com|cuja|em situacao)|pessoas? com deficiencia|idosos?)\b/,
  definicao: /\b(?:consiste|entende se|considera se|compreende|caracteriza se|define se|destina se|fica instituido|instituido|e um|e uma)\b/,
  quem: /\b(?:compete|cabe|cabera|responsavel|responsaveis|gerido|gestao|coordena|coordenado|executa|executado|realiza|realizado|ofertado|referenciado)\b/,
  // O que um profissional ou serviço faz: verbos de atribuição.
  funcao: /\b(?:atribuicoes?|compete|cabe|incumbe|realiza|realizam|desenvolve|desenvolvem|acompanha|acompanham|oferta|ofertam|presta|prestam|participa|participam|elabora|elaboram|orienta|orientam|encaminha|encaminham|promove|promovem|executa)\b/,
  // Como se faz: procedimento, etapa, forma de solicitar ou registrar.
  procedimento: /\b(?:deve|devem|devera|deverao|mediante|por meio|atraves|procedimentos?|etapas?|passos?|inicia|iniciar|solicita|solicitado|apresentar|preencher|inscricao)\b/,
  // Pergunta aberta com forma de pergunta (geral): qualquer frase que cubra o assunto; a cobertura exigida é maior (ver EXT_COBERTURA).
  geral: /./
};
// Cobertura mínima do assunto pela frase (com o título do trecho). A pergunta aberta (geral) exige quase tudo.
const EXT_COBERTURA = { geral: 0.85 };
const EXT_RE_DEF_FORTE = /\b(?:consiste|entende se|considera se|compreende|caracteriza se|define se|destina se|fica instituido|instituido)\b/;

// Palavras que só indicam o TIPO da pergunta (não o assunto): saem das raízes que a frase precisa cobrir.
const EXT_SO_TIPO = /^(valor|valores|prazo|prazos|documento|documentos|direito|direitos|requisito|requisitos|criterio|criterios|elegivel|elegiveis|definicao|conceito|compete|responsavel|responsaveis|atribuicao|atribuicoes|funcao|funcoes|atuacao|diferenca|diferencas|procedimento|procedimentos|etapa|etapas|passo|passos)$/;
// Valor em reais ou porcentagem, lido no texto ORIGINAL da frase.
const EXT_RE_VALOR = /R\$\s?\d|\b\d{1,3}(?:\.\d{3})*,\d{2}\b|\b\d+(?:,\d+)?\s?%/;
// Frase de COMPETÊNCIA de órgão (ex.: "Compete ao INSS...") não responde "quem tem direito" nem "quais requisitos".
const EXT_RE_COMPETE = /^\s*(?:compete|cabe|incumbe)\b/i;

// Frase que fala de outra coisa (lista de palavras-chave, cabeçalho de tabela, ficha de ferramenta do app).
const EXT_RE_RUIDO = /(?:\|{2,}|^\s*[-:|\s]+$|palavras?[ -]chave|tags?:|ferramenta do (?:app|argo)|clique em|botao\b)/i;

// "Art. 5º", "§ 2º", "nº 10", "R$ 1.518,00", "inc. II" não terminam frase.
const EXT_ABREV = /(?:\bart|\barts|\bn[ºo°]|\bnr|\binc|\bal|\bpar|\bcap|\bsec|\bdr|\bdra|\bsr|\bsra|\bprof|\bex|\bp|\bv|\bobs|\bcf|\bsr|\bltda|\betc|\bdec|\bdoc|\bfig|\bhttp|\bwww)$/i;

function extRaizes(texto) {
  const lista = [];
  normalizar(texto).split(' ').forEach(function (w) {
    if (w.length > 3 && !EXT_VAZIAS.test(w) && !EXT_SO_TIPO.test(w)) {
      const r = w.slice(0, 7);
      if (lista.indexOf(r) === -1) lista.push(r);
    }
  });
  return lista;
}

// O que a pessoa quer saber: valor, prazo, documentos, direito, definição, quem faz. null = pergunta aberta (a extração não se arrisca).
export function tipoDaPergunta(pergunta) {
  const n = normalizar(pergunta);
  if (/\b(?:quanto|quantos? (?:reais|recebe|vale|custa|paga)|valor|valores|quanto vale|qual (?:o )?(?:teto|piso|limite|linha))\b/.test(n) || /\brenda per capita\b.*\b(?:qual|limite|teto)\b/.test(n) || /\bqual (?:a )?renda per capita\b/.test(n)) return 'valor';
  if (/\b(?:prazo|em quanto tempo|quanto tempo|ate quando|quando (?:vence|expira|deve|devem)|a cada quanto|periodicidade|validade)\b/.test(n)) return 'prazo';
  if (/\b(?:quais documentos|que documentos|documentos? (?:necessarios?|para|exigidos?)|o que (?:levar|preciso levar|precisa levar)|quais os documentos)\b/.test(n)) return 'documentos';
  if (/\b(?:quem (?:tem direito|pode (?:receber|solicitar|ter|ser|acessar|participar))|tem direito|quais (?:familias|pessoas)|quem recebe|quais (?:sao )?(?:os )?(?:requisitos|criterios)|requisitos|criterios|elegibilidade|elegiveis|quem e elegivel|publico[ -]alvo|a quem se destina)\b/.test(n)) return 'direito';
  if (/\b(?:quem (?:e responsavel|cabe|compete|gerencia|coordena|executa|gere|faz)|compete a|responsavel por)\b/.test(n)) return 'quem';
  if (/^(?:o que (?:e|sao|significa|quer dizer)|defina|conceito de|qual o conceito)\b/.test(n)) return 'definicao';
  if (/\b(?:o que (?:faz|fazem|cabe|compete)|quais (?:sao )?(?:as |os )?(?:atribuicoes|funcoes|atividades|competencias)|qual (?:e )?(?:o )?papel|como atua|atribuicoes d[oae]s?|funcoes d[oae]s?)\b/.test(n)) return 'funcao';
  if (/\b(?:como (?:fazer|faco|se faz|funciona|solicitar|solicito|registrar|registro|requerer|elaborar|elaboro|montar|monto|proceder|encaminhar|encaminho|cadastrar|cadastro|inscrever)|o que fazer|passo a passo|qual (?:e )?o procedimento|quais (?:sao )?(?:as )?etapas)\b/.test(n)) return 'procedimento';
  return null;
}

// Pergunta aberta COM forma de pergunta ("quais os pontos de atenção da RAPS", "atendimento a pessoa idosa" não entra): só estas podem usar o tipo geral.
function extPerguntaAberta(pergunta) {
  return /^(?:quais|qual|quem|quando|onde|por que|porque|existe|existem|ha|tem|posso|pode|podem|devo|deve|e obrigatorio|e possivel)\b/.test(normalizar(pergunta));
}

// "diferença entre X e Y", "X ou Y?", "X x Y": devolve [lado1, lado2] ou null.
function extLadosDaComparacao(pergunta) {
  const n = normalizar(pergunta);
  let m = n.match(/\b(?:diferenca|diferencas|diferenciar|comparar|comparacao|distincao)\s+(?:entre\s+)?(.+?)\s+(?:e|x|versus|vs|com)\s+(.+)$/);
  if (!m) m = n.match(/^(?:o que (?:e|sao) )?(.+?)\s+(?:x|versus|vs)\s+(.+)$/);
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  return a && b && a.split(' ').length <= 6 && b.split(' ').length <= 6 ? [a, b] : null;
}

// Divide em frases sem cortar em "Art. 5º", "§ 2º." nem em valor como "R$ 1.518,00". Também quebra em linhas e itens de lista.
export function dividirEmFrases(texto) {
  const bruto = String(texto == null ? '' : texto).replace(/\r/g, '');
  const saida = [];
  bruto.split(/\n+/).forEach(function (linha) {
    const l = linha.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').trim();
    if (!l) return;
    let atual = '';
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      atual += c;
      if (c === '.' || c === '?' || c === '!' || c === ';') {
        const prox = l[i + 1];
        const depois = l.slice(i + 1).trimStart();
        if (prox !== undefined && prox !== ' ') continue;           // "1.518,00", "gov.br", "art.5"
        if (c === '.' && EXT_ABREV.test(atual.slice(0, -1))) continue;  // "Art." "nº."
        if (c === '.' && /\d$/.test(atual.slice(0, -1)) && /^\d/.test(depois)) continue;
        if (c === '.' && /(?:^|\s)[A-ZÁÉÍÓÚ]$/.test(atual.slice(0, -1))) continue; // inicial
        if (c !== ';' && depois && /^[a-zà-ú]/.test(depois)) continue;    // minúscula depois: não é fim
        saida.push(atual.trim());
        atual = '';
      }
    }
    if (atual.trim()) saida.push(atual.trim());
  });
  return saida.filter(Boolean);
}

function extParecidas(a, b) {
  const ra = extRaizes(a), rb = extRaizes(b);
  if (!ra.length || !rb.length) return false;
  const comuns = ra.filter(function (r) { return rb.indexOf(r) !== -1; }).length;
  return comuns / Math.min(ra.length, rb.length) >= 0.8;
}

function extEncurtar(f) {
  const t = f.replace(/\s+/g, ' ').trim();
  return t.length <= EXT_TAM_MAX ? t : t.slice(0, EXT_TAM_MAX - 1).replace(/\s+\S*$/, '') + ' [...]';
}

function extValoresEmReais(t) {
  const m = String(t).match(/R\$\s?\d[\d.]*(?:,\d{2})?/g);
  return m ? m.map(function (v) { return v.replace(/\s+/g, ''); }) : [];
}

function extRotulo(trecho) {
  return [trecho.titulo || trecho.doc, trecho.referencia].filter(Boolean).join(' — ');
}

// achados: o que buscarFontes devolveu ([{ trecho, aderencia }]). Devolve null quando nenhuma frase cobre a pergunta.
//   { texto, frases:[{ texto, fonte }], fontes:[indice dos achados usados], avisos:[...], tipo }
// opcoes.max: máximo de frases (padrão 4).
export function responderPorExtracao(pergunta, achados, opcoes) {
  const o = opcoes || {};
  if (!Array.isArray(achados) || !achados.length) return null;
  if (!o.semComparar) {
    const lados = extLadosDaComparacao(pergunta);
    if (lados) return extComparar(pergunta, lados, achados);
  }
  let tipo = o.tipo || tipoDaPergunta(pergunta);
  if (!tipo && extPerguntaAberta(pergunta)) tipo = 'geral';
  if (!tipo) return null;
  const raizes = extRaizes(pergunta.replace(/\bboa vista\b/gi, ' '));
  if (!raizes.length) return null;
  const max = Math.max(1, o.max || EXT_MAX_FRASES);

  const candidatas = [];
  achados.forEach(function (a, ia) {
    const t = a && a.trecho;
    if (!t || !EXT_PESO_ADERENCIA[a.aderencia] || EXT_RE_DOC_FORA.test(String(t.doc || ''))) return;
    const rotulo = normalizar(extRotulo(t));
    dividirEmFrases(t.texto).forEach(function (frase, ordem) {
      if (frase.length < EXT_TAM_MIN || frase.length > EXT_TAM_MAX * 2 || EXT_RE_RUIDO.test(frase)) return;
      const nf = normalizar(frase);
      if (!(EXT_SINAIS[tipo].test(nf) || (tipo === 'valor' && EXT_RE_VALOR.test(frase)))) return;
      if (tipo !== 'quem' && EXT_RE_COMPETE.test(frase)) return;
      const tem = raizes.filter(function (r) { return nf.indexOf(r) !== -1; });
      const comRotulo = raizes.filter(function (r) { return nf.indexOf(r) !== -1 || rotulo.indexOf(r) !== -1; });
      // a frase precisa cobrir a maior parte do assunto (com o título do trecho); sem nenhuma palavra do assunto na própria frase, o título tem de cobri-lo todo
      if (comRotulo.length / raizes.length < (EXT_COBERTURA[tipo] || 0.6)) return;
      if (!tem.length && comRotulo.length < raizes.length) return;
      // definição: a frase tem de ser SOBRE o termo (ele aparece no começo), não citá-lo de passagem
      if (tipo === 'definicao' && !tem.some(function (r) { const k = nf.indexOf(r); return k >= 0 && k < 100; })) return;
      // definição: "é um/uma..." só vale colado ao termo (no máximo uma palavra no meio); "A gestão do CAPS-AD também é um espaço" fala de outra coisa
      if (tipo === 'definicao' && !EXT_RE_DEF_FORTE.test(nf) && !tem.some(function (r) { const k = nf.indexOf(r); return k >= 0 && /^\S*(?:\s+\S+){0,1}?\s+(?:e|sao)\s+(?:um|uma|o|a|os|as)\b/.test(nf.slice(k)); })) return;
      // pergunta com UMA só palavra de assunto: ela tem de estar no título do trecho ou no começo da frase (senão "depressivos" no fim de uma frase de outro quadro serviria)
      if (raizes.length === 1 && rotulo.indexOf(raizes[0]) === -1 && nf.indexOf(raizes[0]) > 70) return;
      const score = tem.length / raizes.length + comRotulo.length / raizes.length * 0.5 - ia * 0.05 - ordem * 0.002;
      candidatas.push({ frase: frase, ia: ia, score: score });
    });
  });
  if (!candidatas.length) return null;
  candidatas.sort(function (x, y) { return y.score - x.score; });

  const escolhidas = [];
  const porTrecho = {};
  candidatas.forEach(function (c) {
    if (escolhidas.length >= max) return;
    if ((porTrecho[c.ia] || 0) >= EXT_MAX_POR_TRECHO) return;
    // Frase quase igual a outra já escolhida é repetição, EXCETO quando traz outro valor em reais: aí a divergência entre normas precisa aparecer.
    if (escolhidas.some(function (e) { return extParecidas(e.frase, c.frase) && extValoresEmReais(e.frase).join('|') === extValoresEmReais(c.frase).join('|'); })) return;
    porTrecho[c.ia] = (porTrecho[c.ia] || 0) + 1;
    escolhidas.push(c);
  });
  if (!escolhidas.length) return null;

  // Fontes numeradas na ordem em que aparecem.
  const ordemFontes = [];
  escolhidas.forEach(function (c) { if (ordemFontes.indexOf(c.ia) === -1) ordemFontes.push(c.ia); });
  const frases = escolhidas.map(function (c) {
    return { texto: extEncurtar(c.frase), fonte: ordemFontes.indexOf(c.ia) + 1, achado: c.ia };
  });

  const avisos = [];
  if (tipo === 'valor') {
    avisos.push('Valores e limites mudam com o tempo: confirme no texto oficial vigente (MDS) antes de usar em atendimento.');
    const porDoc = {};
    escolhidas.forEach(function (c) { const t = achados[c.ia].trecho; (porDoc[t.doc || t.titulo] = porDoc[t.doc || t.titulo] || []).push.apply(porDoc[t.doc || t.titulo], extValoresEmReais(c.frase)); });
    const docs = Object.keys(porDoc).filter(function (d) { return porDoc[d].length; });
    const todos = [];
    docs.forEach(function (d) { porDoc[d].forEach(function (v) { if (todos.indexOf(v) === -1) todos.push(v); }); });
    if (docs.length > 1 && todos.length > 1) avisos.push('Normas diferentes trazem valores diferentes (' + todos.join(', ') + '): confira qual vale para o seu caso e a data de cada uma.');
  }
  if (tipo === 'direito' || tipo === 'quem' || /\b(?:posso|devo|pode|deve)\b/.test(normalizar(pergunta))) {
    avisos.push('Isto é seleção de frases da base, não análise do caso concreto: quem decide se a família ou a pessoa se enquadra é o atendimento, com o texto oficial na mão.');
  } else {
    avisos.push('Frases copiadas da base de normas, sem interpretação do seu caso. Confira o texto oficial vigente.');
  }
  if (ordemFontes.some(function (i) { const tp = achados[i].trecho.tipo; return tp && tp !== 'norma'; })) {
    avisos.push('Parte das frases vem de material de apoio ou orientação técnica (não é norma legal: orienta, não obriga).');
  }

  const linhas = frases.map(function (f) { return '- ' + f.texto + ' [' + f.fonte + ']'; });
  const refs = ordemFontes.map(function (i, k) { return '- [' + (k + 1) + '] ' + (extRotulo(achados[i].trecho) || 'Base de normas'); });
  const texto = 'O que a base de normas diz sobre isso (frases copiadas dos textos, cada uma com a sua fonte):\n\n' + linhas.join('\n') + '\n\n**Fontes**\n' + refs.join('\n');
  return { texto: texto, frases: frases, fontes: ordemFontes, avisos: avisos, tipo: tipo };
}


// Comparação ("diferença entre PAIF e PAEFI"): a definição de CADA lado, tirada da base, lado a lado. Se um dos lados não tem frase de definição, null
// (mostrar só um lado como se fosse a comparação enganaria).
function extComparar(pergunta, lados, achados) {
  const partes = [];
  for (let i = 0; i < lados.length; i++) {
    const r = responderPorExtracao('o que é ' + lados[i], achados, { max: 1, tipo: 'definicao', semComparar: true });
    if (!r || !r.frases.length) return null;
    partes.push({ lado: lados[i], r: r });
  }
  const ordemFontes = [];
  const frases = [];
  partes.forEach(function (p) {
    p.r.frases.forEach(function (f) {
      const idx = p.r.fontes[f.fonte - 1];
      let pos = ordemFontes.indexOf(idx);
      if (pos === -1) { ordemFontes.push(idx); pos = ordemFontes.length - 1; }
      frases.push({ texto: f.texto, fonte: pos + 1, achado: idx, lado: p.lado });
    });
  });
  const linhas = partes.map(function (p) {
    return '**' + p.lado.toUpperCase() + '**\n' + frases.filter(function (f) { return f.lado === p.lado; }).map(function (f) { return '- ' + f.texto + ' [' + f.fonte + ']'; }).join('\n');
  });
  const refs = ordemFontes.map(function (i, k) { return '- [' + (k + 1) + '] ' + (extRotulo(achados[i].trecho) || 'Base de normas'); });
  const texto = 'O que a base de normas diz de cada um (frases copiadas dos textos, cada uma com a sua fonte):\n\n' + linhas.join('\n\n') + '\n\n**Fontes**\n' + refs.join('\n');
  return { texto: texto, frases: frases, fontes: ordemFontes, tipo: 'comparacao',
    avisos: ['Frases copiadas da base de normas, uma definição para cada lado: o app não compara nem interpreta. Confira o texto oficial vigente.'] };
}
