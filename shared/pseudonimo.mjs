// Leitura de nome e CPF NO APARELHO (v0.34.0).
// A pessoa pode escrever "Maria Souza, CPF 123.456.789-09, faltou": o aparelho troca o nome e o CPF por marcadores (PESSOA_1, CPF_1) ANTES de
// qualquer envio. A IA só vê os marcadores; a resposta volta com os marcadores e o aparelho os desfaz na tela. Quem é PESSOA_1 e qual é o CPF_1
// ficam só na memória desta aba (nunca em disco, nunca na rede) e somem em limpar().
// Limite honesto: o nome só é trocado quando algum padrão o reconhece (shared/pii.mjs). Depois da troca o texto passa de novo pelo filtro
// completo; se sobrar telefone, e-mail, endereço, RG/NIS etc., NADA é enviado.
import { nomesNoTexto, nomesProprios } from './pii.mjs';

function psSemAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function psEscapar(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// CPF de verdade: 11 dígitos, não todos iguais, dois dígitos verificadores certos.
export function cpfValido(valor) {
  const d = String(valor).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let n = 9; n <= 10; n++) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d.charAt(i)) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d.charAt(n))) return false;
  }
  return true;
}

const PS_RE_CPF = /(^|[^\d])(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;
// Acha CPF no texto: formatado (com ponto ou traço) vale sempre; 11 dígitos colados só com a palavra "CPF" antes ou dígitos verificadores certos
// (senão pode ser NIS ou telefone, que continuam barrados pelo filtro).
export function cpfsNoTexto(texto) {
  const t = String(texto == null ? '' : texto);
  const achados = [];
  PS_RE_CPF.lastIndex = 0;
  let m;
  while ((m = PS_RE_CPF.exec(t)) !== null) {
    const bruto = m[2];
    const ini = m.index + m[1].length;
    const formatado = /[.\-]/.test(bruto);
    const rotulo = /cpf[^\d]{0,12}$/i.test(t.slice(Math.max(0, ini - 16), ini));
    if (formatado || rotulo || cpfValido(bruto)) achados.push(bruto);
    PS_RE_CPF.lastIndex = ini + bruto.length - 1;
  }
  return achados;
}

const PS_RE_MARCADOR = /\b(PESSOA|CPF)[_ ]?(\d{1,3})\b/gi;

export function criarRegistro() {
  const pessoas = [];   // { token, partes:[...], chave }
  const cpfs = [];      // { token, original, digitos, valido }

  function achar(lista, chave) { for (let i = 0; i < lista.length; i++) if (lista[i].chave === chave) return lista[i]; return null; }

  function registrarNome(partes) {
    const uteis = partes.filter(function (p) { return p && p.length >= 2; });
    if (!uteis.length) return;
    const novas = uteis.map(psSemAcento);
    // mesma pessoa se as palavras de um nome estão todas no outro ("Maria" em "Maria Souza"; "Pedro Alves" em "João Pedro Alves"): une e mantém o marcador
    for (let i = 0; i < pessoas.length; i++) {
      const outra = pessoas[i];
      const velhas = outra.partes.map(psSemAcento);
      const novaDentro = novas.every(function (w) { return velhas.indexOf(w) !== -1; });
      const velhaDentro = velhas.every(function (w) { return novas.indexOf(w) !== -1; });
      if (novaDentro) return;
      if (velhaDentro) { outra.partes = uteis; outra.chave = novas.join(' '); return; }
    }
    pessoas.push({ token: 'PESSOA_' + (pessoas.length + 1), partes: uteis, chave: novas.join(' ') });
  }

  function registrarCpf(bruto) {
    const digitos = bruto.replace(/\D/g, '');
    if (cpfs.some(function (c) { return c.digitos === digitos; })) return;
    cpfs.push({ token: 'CPF_' + (cpfs.length + 1), original: bruto, digitos: digitos, valido: cpfValido(digitos) });
  }

  // Troca o que o registro já conhece (nomes, partes dos nomes e CPFs) por marcadores.
  function ocultar(texto) {
    let t = String(texto == null ? '' : texto);
    cpfs.forEach(function (c) {
      const sep = '[.\\-\\s]?';
      const d = c.digitos;
      const re = new RegExp('(^|[^\\d])' + d.slice(0, 3) + sep + d.slice(3, 6) + sep + d.slice(6, 9) + sep + d.slice(9) + '(?!\\d)', 'g');
      t = t.replace(re, function (m, antes) { return antes + c.token; });
    });
    // nomes completos primeiro (do mais longo para o mais curto), depois cada palavra do nome sozinha
    const lista = pessoas.slice().sort(function (a, b) { return b.partes.length - a.partes.length; });
    lista.forEach(function (p) {
      if (p.partes.length > 1) {
        const re = new RegExp('(^|[^A-Za-zÀ-ÿ])' + p.partes.map(psEscapar).join('(?:\\s+d[aeo]s?)?\\s+') + '(?![A-Za-zÀ-ÿ])', 'gi');
        t = t.replace(re, function (m, antes) { return antes + p.token; });
      }
    });
    lista.forEach(function (p) {
      p.partes.forEach(function (w) {
        if (w.length < 3) return;
        const re = new RegExp('(^|[^A-Za-zÀ-ÿ_])' + psEscapar(w) + '(?![A-Za-zÀ-ÿ_])', 'gi');
        t = t.replace(re, function (m, antes) { return antes + p.token; });
      });
    });
    // sobrenome e nome trocados um a um viram o mesmo marcador repetido: junta
    return t.replace(/\b(PESSOA_\d+)(?:\s+\1\b)+/g, '$1');
  }

  // Lê o texto: guarda nomes e CPFs novos e devolve o texto já com marcadores. null = nada a proteger.
  function proteger(texto) {
    const t = String(texto == null ? '' : texto);
    const cpfsAchados = cpfsNoTexto(t);
    const nomes = nomesNoTexto(t);
    // com CPF ou nome reconhecido na mensagem, nome próprio solto ("A Maria Souza faltou") também é de pessoa
    if (cpfsAchados.length || nomes.length) nomesProprios(t).forEach(function (n) { nomes.push(n); });
    if (!cpfsAchados.length && !nomes.length && !pessoas.length && !cpfs.length) return null;
    cpfsAchados.forEach(registrarCpf);
    nomes.forEach(registrarNome);
    const saida = ocultar(t);
    if (saida === t) return null;
    const usados = [];
    const ver = /\b(PESSOA|CPF)_(\d{1,3})\b/g;
    let m;
    while ((m = ver.exec(saida)) !== null) if (usados.indexOf(m[0]) === -1) usados.push(m[0]);
    return { texto: saida, marcadores: usados, nota: notaParaIA(usados) };
  }

  function notaParaIA(usados) {
    if (!usados.length) return '';
    const validos = [], invalidos = [];
    usados.forEach(function (u) {
      const c = cpfs.filter(function (x) { return x.token === u; })[0];
      if (c) (c.valido ? validos : invalidos).push(u);
    });
    let nota = ' [' + usados.join(', ') + (usados.length > 1 ? ' são marcadores' : ' é um marcador') + ' no lugar de dado pessoal que ficou no aparelho; escreva-' + (usados.length > 1 ? 'os' : 'o') + ' sempre iguais.';
    if (validos.length) nota += ' ' + validos.join(', ') + ' tem dígitos verificadores válidos.';
    if (invalidos.length) nota += ' ' + invalidos.join(', ') + ' tem dígitos verificadores inválidos.';
    return nota + ']';
  }

  // Desfaz os marcadores no texto que vai para a tela. Marcador desconhecido fica como está.
  function restaurar(texto) {
    if (typeof texto !== 'string' || (!pessoas.length && !cpfs.length)) return texto;
    return texto.replace(PS_RE_MARCADOR, function (m, tipo, n) {
      const token = tipo.toUpperCase() + '_' + Number(n);
      if (tipo.toUpperCase() === 'CPF') { const c = cpfs.filter(function (x) { return x.token === token; })[0]; return c ? c.original : m; }
      const p = pessoas.filter(function (x) { return x.token === token; })[0];
      return p ? p.partes.join(' ') : m;
    });
  }

  function limpar() { pessoas.length = 0; cpfs.length = 0; }
  function vazio() { return !pessoas.length && !cpfs.length; }
  return { proteger: proteger, ocultar: ocultar, restaurar: restaurar, limpar: limpar, vazio: vazio, cpfValido: cpfValido };
}
