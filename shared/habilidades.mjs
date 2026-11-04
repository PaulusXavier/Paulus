// Habilidades do Paulus: roteiros de trabalho (como escrever um relatório, conduzir uma visita, preparar um estudo de caso...)
// que entram no prompt SÓ quando o pedido combina com elas, para não gastar a cota gratuita da IA em toda pergunta.
// Usado pelo Worker. Cada habilidade é um arquivo habilidades/*.md (ver docs/HABILIDADES.md):
//
//   ---
//   id: relatorio-tecnico                 (letras minúsculas, números e hífen)
//   nome: Relatório técnico               (aparece para o(a) profissional)
//   quando: relatório técnico; informação técnica; ...   (gatilhos separados por ";"; todas as palavras do gatilho precisam aparecer)
//   apps: umbrella, toth                  (opcional: só vale nesses apps; sem a linha, vale em todos)
//   texto: sim                            (opcional: a habilidade produz texto pronto; a resposta pode ser mais longa)
//   ---
//   Instruções para a IA, em português, em linhas "- ".

import { tokenizar, consultaComContexto } from './busca.mjs';

export const MAX_CORPO_HABILIDADE = 2200;
export const MAX_HABILIDADES_POR_PERGUNTA = 2;
const ID_HABILIDADE = /^[a-z0-9][a-z0-9-]*$/;

// Devolve { id, nome, gatilhos:[[palavras...]], apps:[...], texto, instrucoes }. Lança erro claro se faltar algo.
export function lerHabilidade(markdown, nomeArquivo) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(String(markdown).replace(/^﻿/, ''));
  if (!m) throw new Error(nomeArquivo + ': falta o bloco "---" no começo (id, nome, quando).');
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(':');
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  for (const campo of ['id', 'nome', 'quando']) {
    if (!meta[campo]) throw new Error(nomeArquivo + ': falta "' + campo + '" no começo do arquivo.');
  }
  if (!ID_HABILIDADE.test(meta.id)) throw new Error(nomeArquivo + ': "id" só pode ter letras minúsculas, números e hífen.');
  if (meta.texto && !['sim', 'nao'].includes(meta.texto)) throw new Error(nomeArquivo + ': "texto" deve ser sim ou nao.');
  const gatilhos = meta.quando.split(';').map(function (g) { return tokenizar(g); }).filter(function (g) { return g.length > 0; });
  if (!gatilhos.length) throw new Error(nomeArquivo + ': "quando" não tem nenhum gatilho útil.');
  const instrucoes = m[2].replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!instrucoes) throw new Error(nomeArquivo + ': o roteiro está vazio.');
  if (instrucoes.length > MAX_CORPO_HABILIDADE) {
    throw new Error(nomeArquivo + ': roteiro com ' + instrucoes.length + ' caracteres (máximo ' + MAX_CORPO_HABILIDADE + '). Enxugue: ele entra no prompt e gasta a cota da IA.');
  }
  const apps = meta.apps ? meta.apps.split(',').map(function (a) { return a.trim().toLowerCase(); }).filter(Boolean) : [];
  return { id: meta.id, nome: meta.nome.slice(0, 80), gatilhos: gatilhos, apps: apps, texto: meta.texto === 'sim', instrucoes: instrucoes };
}

function pontuar(habilidade, tokens) {
  const conjunto = new Set(tokens);
  let pontos = 0;
  for (const g of habilidade.gatilhos) {
    if (g.every(function (t) { return conjunto.has(t); })) pontos += g.length; // gatilho mais específico vale mais
  }
  return pontos;
}

// Escolhe até `max` habilidades para a pergunta. Pergunta curta de seguimento ("e para adolescente?") herda o assunto
// da pergunta anterior do usuário, como na busca de normas.
export function escolherHabilidades(lista, pergunta, anteriores, app, max = MAX_HABILIDADES_POR_PERGUNTA) {
  if (!Array.isArray(lista) || !lista.length) return [];
  const tokens = tokenizar(consultaComContexto(pergunta, anteriores));
  if (!tokens.length) return [];
  const nomeApp = String(app || '').toLowerCase();
  return lista
    .filter(function (h) { return !h.apps || !h.apps.length || h.apps.includes(nomeApp); })
    .map(function (h, i) { return { h: h, pontos: pontuar(h, tokens), i: i }; })
    .filter(function (x) { return x.pontos > 0; })
    .sort(function (a, b) { return b.pontos - a.pontos || a.i - b.i; })
    .slice(0, Math.max(0, max))
    .map(function (x) { return x.h; });
}

// Habilidades compactadas para o pacote do Worker (os gatilhos já vêm como palavras-raiz).
export function nomesDasHabilidades(habilidades) {
  return (habilidades || []).map(function (h) { return h.nome; });
}
