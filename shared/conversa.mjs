// Memória da CONVERSA inteira, não só das últimas mensagens.
// Roda no navegador (cliente) e no Worker, com as mesmas regras.
//
// Problema que isto resolve: o histórico enviado à IA era de 6 mensagens (3 trocas). O que foi dito antes disso
// (o bairro da família, a unidade em foco, o assunto) sumia e o mascote voltava a pedir dado que a pessoa já tinha dado.
//
// Três peças, todas por regra (sem gastar cota de IA):
//   1) compactarHistorico   as últimas mensagens vão inteiras; as perguntas mais antigas viram um resumo curto.
//   2) estado da conversa   o que já está firmado (unidade, bairro, município, assunto) vai junto, em campos fechados.
//   3) deveEsclarecer       a pergunta de esclarecimento só passa quando o dado falta de verdade
//                           (não está na mensagem, no estado nem na conversa) e só para os tipos que dependem dele.

import { temDadoPessoal, limparMarcacao } from './pii.mjs';
import { normalizar } from './busca.mjs';
import { ehSaudacao } from './pedido.mjs';

export const MENSAGENS_RECENTES = 10;      // últimas mensagens que vão inteiras (5 trocas)
export const MAX_PERGUNTAS_ANTIGAS = 12;   // quantas perguntas mais antigas entram no resumo
const MAX_ANTIGA = 160;                    // caracteres de cada pergunta antiga
const MAX_RESUMO = 1100;

function ehRespostaConv(h) {
  return !!h && (h.papel === 'paulus' || h.papel === 'argo' || h.papel === 'assistente');
}

function limpoConv(texto, max) {
  return limparMarcacao(String(texto == null ? '' : texto)).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Separa o histórico em "recentes" (vão inteiras) e "antigas" (viram resumo).
// A janela começa sempre numa mensagem da pessoa, para não separar uma pergunta da resposta dela.
export function compactarHistorico(historico, opcoes = {}) {
  const recentes = Math.max(2, Number(opcoes.recentes) || MENSAGENS_RECENTES);
  const lista = (Array.isArray(historico) ? historico : []).filter(function (h) {
    return h && (h.papel === 'usuario' || ehRespostaConv(h)) && String(h.texto || '').trim();
  });
  let inicio = Math.max(0, lista.length - recentes);
  while (inicio > 0 && lista[inicio].papel !== 'usuario') inicio--;
  const janela = lista.slice(inicio);
  const antigas = [];
  for (const h of lista.slice(0, inicio)) {
    if (h.papel !== 'usuario') continue;
    const t = limpoConv(h.texto, MAX_ANTIGA);
    // Dado pessoal nunca entra; cumprimento e frase minúscula não dizem nada sobre o assunto.
    if (t.length < 6 || temDadoPessoal(t) || ehSaudacao(t)) continue;
    antigas.push(t);
  }
  const ultimas = antigas.slice(-MAX_PERGUNTAS_ANTIGAS);
  let resumo = ultimas.map(function (t) { return '- ' + t; }).join('\n');
  if (resumo.length > MAX_RESUMO) resumo = resumo.slice(resumo.length - MAX_RESUMO).replace(/^[^\n]*\n/, '');
  return { recentes: janela, antigas: ultimas, resumo: resumo };
}

// ------------------------------------------------------------------ estado

const CAMPOS_NOME = ['unidade', 'bairro', 'municipio'];
const RE_NOME_CONV = /^[\p{L}\p{N} .,'\-ºª/()]*$/u;
const RE_INTENCAO = /^[a-z_]{3,20}$/;

// Aceita só campos fechados e curtos, sem dado pessoal. O Worker não confia em quem chama.
export function sanearEstado(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const saida = {};
  for (const campo of CAMPOS_NOME) {
    const v = limpoConv(bruto[campo], 91);
    // Nome longo demais não é nome (é texto solto): descarta em vez de cortar no meio.
    if (v && v.length <= 90 && RE_NOME_CONV.test(v) && !temDadoPessoal(v)) saida[campo] = v;
  }
  const assunto = limpoConv(bruto.assunto, 200);
  if (assunto && !temDadoPessoal(assunto)) saida.assunto = assunto;
  const intencao = limpoConv(bruto.intencao, 20);
  if (intencao && RE_INTENCAO.test(intencao)) saida.intencao = intencao;
  return Object.keys(saida).length ? saida : null;
}

// Junta o estado antigo com o que a última troca revelou. O que é novo vale mais; campo vazio não apaga o antigo.
export function mesclarEstado(anterior, novo) {
  const base = sanearEstado(anterior) || {};
  const n = sanearEstado(novo) || {};
  return sanearEstado(Object.assign({}, base, n));
}

// Bloco que vai para o prompt (resposta e interpretação).
export function estadoComoTexto(estado) {
  const e = sanearEstado(estado);
  if (!e) return '';
  const linhas = [];
  if (e.unidade) linhas.push('- Unidade em foco: ' + e.unidade);
  if (e.bairro) linhas.push('- Bairro em foco: ' + e.bairro);
  if (e.municipio) linhas.push('- Município em foco: ' + e.municipio);
  if (e.assunto) linhas.push('- Assunto em andamento: ' + e.assunto);
  return linhas.join('\n');
}

// ------------------------------------------------------------------ esclarecimento

// Só estes tipos dependem de um dado que a conversa pode não ter. Conceito, norma, CID, contagem e "outro" se respondem
// com uma premissa dita em voz alta; perguntar antes só atrasa.
const DEPENDE_DE = { territorio: 'bairro', ubs_psicologo: 'bairro', diretorio: 'unidade' };

function palavrasConv(texto) {
  return new Set(normalizar(texto).split(' ').filter(function (p) { return p.length > 2; }));
}

function semelhantesConv(a, b) {
  const A = palavrasConv(a), B = palavrasConv(b);
  if (!A.size || !B.size) return false;
  let comuns = 0;
  A.forEach(function (p) { if (B.has(p)) comuns++; });
  return comuns / Math.min(A.size, B.size) >= 0.6;
}

// true = vale perguntar de volta; false = siga e responda (com a premissa mais provável).
// Entradas: o que a interpretação devolveu (esclarecer, intencao, bairro, unidade), o estado e o histórico.
export function deveEsclarecer({ esclarecer, intencao, bairro = '', unidade = '', estado = null, historico = [] } = {}) {
  if (!esclarecer || !String(esclarecer).trim()) return false;
  const falta = DEPENDE_DE[intencao];
  if (!falta) return false;
  const e = sanearEstado(estado) || {};
  if (falta === 'bairro' && (bairro || e.bairro)) return false;
  if (falta === 'unidade' && (unidade || e.unidade)) return false;
  // Já perguntou isto agora há pouco: não pergunta de novo (a pessoa responderia a mesma coisa).
  const lista = Array.isArray(historico) ? historico : [];
  const ultima = lista.slice().reverse().find(ehRespostaConv);
  if (ultima && semelhantesConv(String(ultima.texto || ''), String(esclarecer))) return false;
  return true;
}

// ------------------------------------------------------------------ resposta que só pergunta

// A resposta da IA é só uma pergunta de esclarecimento (sem nada útil)? Quando isso acontece com a conversa já em andamento,
// o app pede de novo uma vez, avisando a IA para assumir a premissa mais provável e responder.
export function soPerguntou(texto) {
  const t = String(texto || '')
    .replace(/^\s*(SUGESTÕES|SUGESTOES|AÇÕES NO APP|ACOES NO APP)\s*:.*$/gim, '')
    .replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 280 || !/\?$/.test(t)) return false;
  if (/(^|\s)[-•]\s/.test(t)) return false;                  // lista: tem conteúdo
  const frases = (t.match(/[^.!?]+[.!?]+/g) || [t]).map(function (f) { return f.trim(); }).filter(Boolean);
  const perguntas = frases.filter(function (f) { return /\?$/.test(f); });
  // Só vale se a última frase é pergunta e a frase antes dela, quando houver, é só preâmbulo ("Para ajudar melhor, preciso saber."), não informação.
  const preambulo = /\b(preciso|para ajudar|para responder|para orientar|para te orientar|me diga|me conte|me informe|antes de)\b/i;
  return perguntas.length >= 1 && frases.length <= 2 && frases.slice(0, -1).every(function (f) { return f.length < 90 && preambulo.test(f); });
}
