// Cards do Argo na base do Paulus: a descrição de cada card do diretório e o texto dos cards das abas têm de ser achados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarIndice, buscarFontes, K_PADRAO } from '../shared/busca.mjs';

const indice = criarIndice(JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8')));
const f = (q) => buscarFontes(indice, q, { k: K_PADRAO });
const docs = (q) => f(q).map((x) => x.trecho.doc + ' | ' + x.trecho.referencia);

test('cards do Argo: a descrição ("Sobre") do card do diretório entra na ficha da unidade', () => {
  const r = f('qual hospital de Roraima atende só crianças de 29 dias a 12 anos?');
  assert.equal(r[0].trecho.doc, 'argo-enderecos-diretorio');
  assert.match(r[0].trecho.referencia, /Hospital da Criança Santo Antônio/);
});

test('cards do Argo: o card do CRAS traz os sistemas, e as pastas do Drive da equipe não vazam link', () => {
  const r = f('quais sistemas municipais aparecem no card do CRAS no Argo?');
  assert.equal(r[0].trecho.doc, 'argo-enderecos-diretorio');
  const todos = JSON.stringify([readFileSync(new URL('../knowledge/documentos/argo-enderecos-diretorio.md', import.meta.url), 'utf8').split('\n').filter((l) => /Pastas da equipe no Drive/.test(l))]);
  assert.match(todos, /Pastas da equipe no Drive \(nomes\)/);
  assert.ok(!/Pastas da equipe no Drive \(nomes\)[^"]*drive\.google\.com/.test(todos), 'link de pasta do Drive da equipe não pode ir para a base pública');
});

test('cards do Argo: abas Ferramentas, Aplicativos, Informes e Central de PDF são achadas', () => {
  assert.ok(docs('quais ferramentas tem na aba Ferramentas do Argo?').slice(0, 3).every((d) => /^argo-cards-abas \| Aba Ferramentas/.test(d)));
  assert.match(docs('o Argo tem como remover a senha de um PDF?')[0], /^argo-cards-abas \| Central de PDF do Argo — Remover senha/);
  assert.match(docs('qual aplicativo do Argo serve para diário de campo?')[0], /^argo-cards-abas \| Aplicativo do Argo — Toth/);
  assert.ok(docs('que informes em espanhol o Argo tem para imprimir?').slice(0, 2).every((d) => /Informe do Argo/.test(d) && /\(ES\)/.test(d)));
});

test('cards do Argo: o documento das abas não carrega imagem base64 nem link de planilha interna', () => {
  const md = readFileSync(new URL('../knowledge/documentos/argo-cards-abas.md', import.meta.url), 'utf8');
  assert.ok(!/data:image|base64,/.test(md));
  assert.ok(!/docs\.google\.com\/(spreadsheets|forms)/.test(md));
});
