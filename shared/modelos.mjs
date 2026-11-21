// Modelos 3D didáticos (v0.20.0): o Paulus tem modelos-base prontos (arquivos .html em modelos/) e, quando a pessoa pede
// "me manda o modelo 3D do sistema solar", o programa reconhece o pedido NO APARELHO, sem IA e sem rede, e devolve o arquivo
// para baixar. O código do modelo nunca passa pela IA (são milhares de linhas; um modelo gratuito não as reproduz com fidelidade).
// Tema novo: o Paulus entrega a base, explica o que trocar e manda montar o arquivo completo no Claude, no chat.
//
//   lerPedidoDeModelo(texto)    -> { modelo, tema, novoTema } ou null
//   respostaDeModelo(texto)     -> { texto, modelo, novoTema, avisos } ou null
//   urlDoModelo(modelo, base)   -> endereço do arquivo (base padrão: "modelos/")
//
// Perguntas sobre dados, lições, roteiro, adaptação ou revisão NÃO são tratadas aqui: seguem para a IA com as habilidades
// modelo-3d-didatico, modelo-3d-didatico-dados e modelo-3d-didatico-qualidade.

import { normalizar } from './busca.mjs';

export const MODELOS_3D = [
  {
    id: 'sistema-solar',
    nome: 'Sistema Solar 3D · Edição Didática',
    versao: 'v6',
    arquivo: 'sistema-solar-3d-didatico-v6.html',
    resumo: 'Sol, oito planetas, Plutão, luas e o cometa Halley em 3D, com ficha de cada corpo, laboratório de gravidade e distância, lições guiadas, quiz e comparação de tamanhos.',
    recursos: [
      'visão 3D com arraste e zoom',
      'ficha de cada corpo (estatísticas, composição, camadas, conceito didático)',
      'laboratório de gravidade, peso, salto e tempo de viagem',
      'lições guiadas e quiz',
      'comparação de tamanhos',
      'órbitas, rastros, rótulos, zona habitável, inclinação do eixo e escala real',
      'temas de cor e controle de velocidade'
    ],
    // assuntos que o modelo cobre (já normalizados: sem acento, minúsculos)
    assuntos: ['sistema solar', 'planeta', 'planetas', 'sol', 'astronomia', 'orbita', 'orbitas', 'luas', 'cometa']
  }
];

export const MODELO_PASTA_PADRAO = 'modelos/';

const RE_3D = /\b(3 ?d|tridimensional|tres dimensoes)\b/;
const RE_MODELO = /\b(modelo|modelos|maquete|maquetes|simulador|simuladores|simulacao|simulacoes)\b/;
const RE_SISTEMA_SOLAR = /\bsistema solar\b/;
const RE_ARQUIVO = /\b(arquivo|html|app|aplicativo|pagina|base)\b/;
// perguntas de ajuda sobre o modelo (dados, lições, roteiro, adaptação, revisão...) vão para a IA com as habilidades
const RE_AJUDA = /\b(dados|campos|licao|licoes|quiz|roteiro|adapt\w*|troc\w*|revis\w*|checklist|qualidade|erro|erros|corrig\w*|melhor\w*|como|explic\w*|ensin\w*|aprend\w*|sabe|sabia|consegue|pode)\b/;
const RE_ENVIO = /\b(mand\w*|envi\w*|baix\w*|quero|queria|preciso|gere|gera|gerar|faca|fazer|faz|crie|criar|cria|monte|montar|me da|me de|abra|abrir|mostr\w*|tem)\b/;

function achaTema(norm) {
  // tema depois de "modelo 3d ..." (ex.: "modelo 3d do corpo humano" -> "corpo humano")
  const m = /\b(?:3 ?d|tridimensional|modelo|modelos|maquete|maquetes|simulador|simuladores|simulacao|simulacoes|didatico|didaticos|interativo|interativos)\s+(?:(?:3 ?d|didatico|didaticos|interativo|interativos)\s+)*(?:de|do|da|dos|das|sobre)\s+(.+)$/.exec(norm);
  if (!m) return '';
  let t = m[1].split(/\b(?:igual|como|que|com|usando|baseado|parecido|no estilo|nos moldes|para mim|pra mim|pelo|pela)\b/)[0];
  t = t.replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/, '').replace(/\s+(?:por favor|pf|pfv|obrigado|obrigada)$/, '').trim();
  return t.slice(0, 60);
}

function ehSistemaSolar(norm, tema) {
  if (RE_SISTEMA_SOLAR.test(norm)) return true;
  if (!tema) return true; // "me manda um modelo 3D" sem tema: a base é o Sistema Solar
  const palavras = tema.split(' ');
  return MODELOS_3D[0].assuntos.some(function (a) { return palavras.indexOf(a) >= 0 || tema === a; });
}

export function lerPedidoDeModelo(texto) {
  const norm = normalizar(texto);
  if (!norm || norm.length > 400) return null;
  if (RE_AJUDA.test(norm)) return null;
  const tem3d = RE_3D.test(norm), temModelo = RE_MODELO.test(norm), solar = RE_SISTEMA_SOLAR.test(norm);
  const temVerbo = RE_ENVIO.test(norm), curto = norm.split(' ').length <= 8;
  let pedido = false;
  if (tem3d && temModelo) pedido = temVerbo || curto;                                   // "modelo 3D do corpo humano" também vale como pedido
  else if (solar && (temModelo || tem3d || RE_ARQUIVO.test(norm))) pedido = temVerbo;    // "me manda o arquivo do sistema solar"
  else if (tem3d && /\b(planeta|planetas)\b/.test(norm)) pedido = temVerbo;
  if (!pedido) return null;
  const tema = achaTema(norm);
  const base = MODELOS_3D[0];
  return { modelo: base, tema: tema, novoTema: ehSistemaSolar(norm, tema) ? '' : temaComAcento(texto, norm, tema) };
}

// O tema é achado no texto sem acento; para mostrar à pessoa, volta a grafia que ela digitou (átomo, célula).
function temaComAcento(texto, norm, tema) {
  if (!tema) return tema;
  const originais = String(texto).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const normais = norm.split(' ');
  const n = tema.split(' ').length;
  if (originais.length !== normais.length) return tema;
  for (let i = normais.length - n; i >= 0; i--) {
    if (normais.slice(i, i + n).join(' ') === tema) return originais.slice(i, i + n).join(' ');
  }
  return tema;
}

export function urlDoModelo(modelo, pasta) {
  const p = String(pasta || MODELO_PASTA_PADRAO);
  return (p.endsWith('/') ? p : p + '/') + modelo.arquivo;
}

export function respostaDeModelo(texto) {
  const p = lerPedidoDeModelo(texto);
  if (!p) return null;
  const m = p.modelo;
  const base = 'Tenho um modelo-base pronto: ' + m.nome + ' (' + m.versao + '). ' + m.resumo + '\n\n'
    + 'É um arquivo único (.html): abre no navegador do celular ou do computador, sem internet e sem instalar nada. '
    + 'Ele traz: ' + m.recursos.join('; ') + '.';
  if (!p.novoTema) {
    return {
      texto: base + '\n\nUse o botão para baixar. Para trocar o conteúdo (lições, quiz, corpos), peça "dados do modelo 3D" que eu explico os campos e escrevo o que você quiser.',
      modelo: m, novoTema: '', avisos: ['O arquivo é entregue pronto, direto do Paulus, sem passar pela IA. Alguns nomes na base usam a grafia de Portugal (Vénus, Neptuno).']
    };
  }
  return {
    texto: 'O modelo-base que eu tenho é o do Sistema Solar (' + m.nome + ', ' + m.versao + '), e é por ele que começo qualquer modelo novo.\n\n'
      + 'Para "' + p.novoTema + '" eu não monto o arquivo inteiro sozinho: são milhares de linhas, e a IA que roda aqui não as reproduz com fidelidade. O que eu faço:\n'
      + '1) Baixe a base pelo botão.\n'
      + '2) Se o tema tem partes que giram em torno de um centro (átomo, luas de Júpiter, galáxia), o desenho de órbitas serve, mas o código tem partes presas ao Sistema Solar. Eu escrevo os dados: peça "dados do modelo 3D de ' + p.novoTema + '". O ajuste do código se faz no Claude.\n'
      + '3) Se o tema não tem órbita, peça "roteiro de modelo 3D de ' + p.novoTema + '" (objetivo de aprendizagem, partes, lições e quiz). O arquivo completo você monta no Claude, no chat, anexando a base e pedindo "faça no estilo deste".\n\n'
      + 'Quem revisa o conteúdo é o professor ou o profissional que vai usar.',
    modelo: m, novoTema: p.novoTema, avisos: ['A base é entregue pronta, no aparelho, sem passar pela IA. Tema novo exige adaptar o motor ou os dados.']
  };
}
