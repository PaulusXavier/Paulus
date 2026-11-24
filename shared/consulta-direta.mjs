// Consulta de unidade respondida direto da ficha, sem chamar a IA.
//
//   respostaDiretaDaFicha(pergunta, fichas) -> { texto, unidade } | null
//
// O app (Argo) manda as fichas das unidades que casam com a pergunta. Quando a pessoa pergunta SÓ telefone, endereço ou horário
// de UMA unidade, a resposta é copiar a ficha: não precisa do modelo grande (que recebe uns 6 mil tokens de instruções a cada pergunta).
//
// Regras (de propósito conservadoras; na dúvida devolve null e a pergunta segue para a IA, como sempre):
//   - a pergunta só pede telefone, endereço ou horário (nada de "como", "posso", "encaminhar", "quais", "bairro", "perto"...);
//   - toda palavra da pergunta que não seja de ligação ("qual o", "do", "por favor") ou pedido (telefone, endereço, horário)
//     tem de estar no NOME de uma ficha, e uma só ficha pode servir (duas unidades possíveis = ambígua = IA pergunta qual);
//   - só termo genérico ("o telefone do CRAS") nunca basta: precisa de uma palavra que distinga a unidade;
//   - nunca completa dado que a ficha não tem: "não informado na ficha", como manda a regra FATOS SOBRE UNIDADES do prompt.

import { normalizar } from './busca.mjs';

const RE_TEL = /\b(?:telefones?|fones?|contatos?|numeros?|ligar|whatsapp|zap)\b/;
const RE_END = /\b(?:enderecos?|onde fica|onde fico|localizacao|localizada|localizado)\b/;
const RE_HOR = /\b(?:horarios?|que horas?)\b/;

// Qualquer sinal de que a pessoa quer mais que o dado da ficha.
const RE_OUTRA = /\b(?:como|porque|por que|posso|devo|deve|encaminh\w*|atende|servicos?|oferece|oferta|faz|fazem|quem|documentos?|precisa|regras?|normas?|leis?|criterios?|direitos?|diferenca|compar\w*|alem|tambem|todos|todas|lista|listar|quais|quantos|quantas|perto|proximo|proxima|rota|distancia|bairros?|atendo|atendimento de|ajuda|explica\w*|significa|quero|preciso)\b/;

const LIGACAO = new Set(('qual quais o a os as um uma do da dos das de e em no na nos nas me passa passe diz diga informa informe pode por favor ' +
  'gostaria saber sabe tem teria seria fica ficam que horas abre fecha para pra com ao aos ate').split(' '));
const PEDIDO = new Set(('telefone telefones fone fones contato contatos numero numeros ligar whatsapp zap endereco enderecos onde localizacao localizada localizado ' +
  'horario horarios').split(' '));
const NOME_LIGACAO = new Set('de da do das dos e a o em na no dr dra sr sra s n'.split(' '));
// Termos que nomeiam um TIPO de unidade, não uma unidade: sozinhos não identificam nada.
const GENERICAS = new Set(('cras creas ubs caps upa hospital unidade unidades conselho tutelar delegacia escola escolas centro pop posto clinica ' +
  'servico secretaria defensoria casa abrigo restaurante cidadao').split(' '));

const MAX_PALAVRAS = 16;

const palavras = (t) => normalizar(String(t == null ? '' : t)).split(/\s+/).filter(Boolean);
const limpo = (v) => String(Array.isArray(v) ? v.join('; ') : (v == null ? '' : v)).replace(/\s+/g, ' ').trim();
const naoInformado = (v) => { const t = limpo(v); return !t || /^n\/?a$/i.test(t) || /^n[aã]o informado/i.test(t); };
const fim = (t) => (/[.!?]$/.test(t) ? t : t + '.');

export function respostaDiretaDaFicha(pergunta, fichas) {
  if (!Array.isArray(fichas) || !fichas.length) return null;
  const n = normalizar(String(pergunta == null ? '' : pergunta));
  if (!n) return null;
  const todas = palavras(n);
  if (todas.length > MAX_PALAVRAS) return null;

  const querTel = RE_TEL.test(n), querEnd = RE_END.test(n), querHor = RE_HOR.test(n);
  if (!querTel && !querEnd && !querHor) return null;
  if (RE_OUTRA.test(n)) return null;

  // O que sobra depois de tirar ligação e pedido é o que nomeia a unidade.
  const conteudo = todas.filter((p) => !LIGACAO.has(p) && !PEDIDO.has(p));
  if (!conteudo.length) return null;
  if (!conteudo.some((p) => !GENERICAS.has(p))) return null;

  // Fichas cujo NOME contém todas essas palavras. Fichas repetidas (mesmo nome e mesmo endereço) contam uma vez.
  const candidatas = new Map();
  for (const f of fichas) {
    if (!f || typeof f !== 'object' || !limpo(f.nome)) continue;
    const nomePalavras = new Set(palavras(f.nome).filter((p) => !NOME_LIGACAO.has(p)));
    if (!conteudo.every((p) => nomePalavras.has(p))) continue;
    const chave = normalizar(limpo(f.nome)) + '|' + normalizar(limpo(f.endereco));
    if (!candidatas.has(chave)) candidatas.set(chave, f);
  }
  if (candidatas.size !== 1) return null;
  const f = Array.from(candidatas.values())[0];

  const nome = limpo(f.nome);
  const linhas = [];
  if (querTel) {
    const tel = naoInformado(f.telefones) ? '' : limpo(f.telefones);
    linhas.push(['Telefone', tel || 'não informado na ficha do Argo']);
  }
  if (querEnd) {
    const end = naoInformado(f.endereco) ? '' : limpo(f.endereco);
    let t = end || 'não informado na ficha do Argo';
    // Endereço sem número nem "s/n": o diretório só traz bairro ou rodovia. Avisa, para ninguém mandar a pessoa a um lugar errado.
    if (end && !/\d/.test(end) && !/\bs\/?n\b/i.test(end)) t += ' (a ficha só informa o bairro ou a rodovia; confirme o endereço completo com a unidade)';
    linhas.push(['Endereço', t]);
  }
  if (querHor) {
    const hor = naoInformado(f.horario) ? '' : limpo(f.horario);
    linhas.push(['Horário', hor || 'não informado na ficha do Argo']);
  }

  let texto;
  if (linhas.length === 1) {
    const [rotulo, valor] = linhas[0];
    const artigo = rotulo === 'Telefone' ? 'O telefone' : rotulo === 'Endereço' ? 'O endereço' : 'O horário';
    texto = artigo + ' de **' + nome + '**: ' + fim(valor);
  } else {
    texto = '**' + nome + '**\n' + linhas.map(([r, v]) => '- ' + r + ': ' + fim(v)).join('\n');
  }
  texto += '\nTelefone, endereço e horário mudam: confirme com a unidade antes de orientar a pessoa.';
  return { texto: texto, unidade: nome };
}
