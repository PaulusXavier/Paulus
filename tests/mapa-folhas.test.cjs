// Rodar: node tests/rota.test.js
const assert = require('assert');
const R = require('./_mapa.cjs')('mapa-folhas.js');
const eq = assert.strictEqual;

eq(R.tituloCaso('RUA SANTO AGOSTINHO'), 'Rua Santo Agostinho');
eq(R.tituloCaso('RUA 7 DE SETEMBRO'), 'Rua 7 de Setembro');

const it = (s, x, y) => ({ str: s, transform: [1, 0, 0, 1, x, y] });
assert.deepStrictEqual(R.linhasDeItens([it('193', 300, 500), it('Número:', 250, 501), it('Endereço: RUA SANTO AGOSTINHO', 20, 500), it('Nome', 20, 700)]),
  ['Nome', 'Endereço: RUA SANTO AGOSTINHO Número: 193']);

let e = R.extrairEndereco(['Tipo de logradouro: RUA Nome do logradouro: SANTO AGOSTINHO Número: 193 Complemento: CASA Bairro: CENTENARIO CEP: 69312-000']);
eq(e.rua, 'Rua Santo Agostinho'); eq(e.numero, '193'); eq(e.bairro, 'Centenario');

e = R.extrairEndereco(['Nome: FULANO DE TAL', 'Tipo de logradouro: RUA Nome: SANTO AGOSTINHO Número: 193 Bairro: CENTENARIO']);
eq(e.rua, 'Rua Santo Agostinho'); eq(e.numero, '193');

e = R.extrairEndereco(['3. ENDEREÇO', 'Tipo de logradouro: AVENIDA', 'Logradouro: CAPITAO ENE GARCEZ', 'Número: S/N', 'Bairro: 13 DE SETEMBRO']);
eq(e.rua, 'Avenida Capitao Ene Garcez'); eq(e.numero, 'S/N'); eq(e.bairro, '13 de Setembro');

e = R.extrairEndereco(['Logradouro: RUA 7 DE SETEMBRO Número: 245 Bairro: 13 DE SETEMBRO']);
eq(e.rua, 'Rua 7 de Setembro'); eq(e.numero, '245');

e = R.extrairEndereco(['Responsável: FULANO DE TAL', 'Endereço: Rua Sete, 245 - 13 de Setembro']);
eq(e.rua, 'Rua Sete'); eq(e.numero, '245'); eq(e.bairro, '13 de Setembro');

e = R.extrairEndereco(['Visita ao domicílio na AV. CAPITAO ENE GARCEZ nº 1500, Centro']);
eq(e.rua, 'Avenida Capitao Ene Garcez'); eq(e.numero, '1500');

// Folha Resumo do Cadastro Único: campos numerados, vários por linha, número com zeros à esquerda
e = R.extrairEndereco(['II - ENDEREÇO DA FAMÍLIA', '1.11 - Localidade: 13 DE SETEMBRO', '1.12 - Tipo: AVENIDA 1.13 - Título:',
  '1.14 - Nome: ELDORADO', '1.15 - Número: 0000000000000046 1.16 - Complemento do Número:', '1.17 - Complemento Adicional: CASA',
  '1.18 - Cep: 69308000 1.20 - Referência para Localização:', 'III - COMPONENTES DA FAMÍLIA', '4.02 - Nome Completo: FULANA DE TAL']);
eq(e.rua, 'Avenida Eldorado'); eq(e.numero, '46'); eq(e.bairro, '13 de Setembro');

// Folha ESCANEADA lida por OCR: ruído ("|" antes do bairro, "1.1" no lugar de "1.11"), Título preenchido e número com "O" no lugar de zero
e = R.extrairEndereco(['1.01 Código familiar: 2749099013 1.10 Data da entrevista: 18/09/2024', '1 - ENDEREÇO DA FAMÍLIA', '1.1 -Localidade: | 13 DE SETEMBRO',
  '1.12-Tipo: AVENIDA 1.13 Título: GENERAL', '1.14 - Nome: SAMPAIO', '1.15 - Número: — 0000000000000957 1.16 - Complemento do Número:',
  '1.17 - Complemento Adicional: CASA 1', '1.18-Cep: 69308150 1.20 - Referência para Localização:', 'Ill - COMPONENTES DA FAMÍLIA']);
eq(e.rua, 'Avenida General Sampaio'); eq(e.numero, '957'); eq(e.bairro, '13 de Setembro');
e = R.extrairEndereco(['1.11 - Localidade: 13 DE SETEMBRO', '1.12- Tipo: AVENIDA 1.13 - Título:', '1.14 - Nome: ELDORADO', '1.15 - Número:  OOOOOOOOOOOOOO46 1.16 - Complemento do Número:']);
eq(e.rua, 'Avenida Eldorado'); eq(e.numero, '46');

eq(R.extrairEndereco(['Folha sem endereço nenhum']), null);

// ordem: rua de partida primeiro, depois alfabética, por número; S/N e sem número no fim da rua
const itens = ['Rua Zeca, 10', 'Rua Santo Agostinho, nº 200', 'Rua Alfa, 50', 'Rua Santo Agostinho, 193', 'Rua Alfa, S/N', 'Av. Alfa, 7', 'Rua Alfa, 8']
  .map(endereco => ({ endereco }));
const o = R.ordenarPorRota(itens, 'Rua Santo Agostinho, nº 193 — Centenário, Boa Vista/RR').map(x => x.endereco);
assert.deepStrictEqual(o, ['Rua Santo Agostinho, 193', 'Rua Santo Agostinho, nº 200', 'Av. Alfa, 7', 'Rua Alfa, 8', 'Rua Alfa, 50', 'Rua Alfa, S/N', 'Rua Zeca, 10']);
// ordem natural: "Rua 2" vem antes de "Rua 10" (alfabética pura punha a 10 antes da 2)
assert.deepStrictEqual(R.ordenarPorRota(['Rua 10, 5', 'Rua 2, 5', 'Rua 1, 5'].map(endereco => ({ endereco })), '').map(x => x.endereco), ['Rua 1, 5', 'Rua 2, 5', 'Rua 10, 5']);
eq(R.textoSeguroPdf('Ação — ǿ'), 'Ação — ');
// pdf-lib não codifica controles C1 (U+0080–U+009F), quebra de linha nem tabulação: viram espaço/nada, sem derrubar o PDF
eq(R.textoSeguroPdf('a\u0085b\u007Fc'), 'abc');
eq(R.textoSeguroPdf('Rua A\nRua B\t1'), 'Rua A Rua B 1');
eq(R.textoSeguroPdf('Fim…'), 'Fim…');
eq(R.textoSeguroPdf(null), '');
delete globalThis.PaulusTabelas;
console.log('rota.test.js: tudo certo');

// PDF unificado: capa e "Roteiro de visita" não são folhas; folhas → só o quadro de endereço (nome/CPF nunca entram)
{
  const capa = ['Folhas de família unificadas — rota de visita', 'Bloco 2 · Bairro 13 de Setembro — 2 famílias'];
  const roteiro = ['Roteiro de visita — partida: Rua Santo Agostinho, nº 193', '1. Rua Antonio Cabral, 809 — 13 de Setembro · Folha Resumo - Código familiar - 074449958-50', '2. Avenida General Sampaio, 543 — 13 de Setembro · Folha Resumo - Código familiar - 202601574-06'];
  const folha = (tipo, nome, num, pessoa, etiqueta) => ['FOLHA RESUMO CADASTRO ÚNICO', '1.01 Código familiar: 7444995850', 'II - ENDEREÇO DA FAMÍLIA', '1.11 - Localidade: 13 DE SETEMBRO',
    '1.12 - Tipo: ' + tipo + ' 1.13 - Título:', '1.14 - Nome: ' + nome + (etiqueta ? ' ' + etiqueta : ''), '1.15 - Número: ' + num + ' 1.16 - Complemento do Número:', 'III - COMPONENTES DA FAMÍLIA', '4.02 - Nome Completo: ' + pessoa, '5.02 - CPF: 711.218.672-27'];
  const r = R.enderecosDeFolhas([capa, roteiro, folha('RUA', 'ANTONIO CABRAL', '0000000000000809', 'FULANA DE TAL', 'Alerta'), folha('AVENIDA', 'CARACARAI', '98', 'BELTRANO', 'Bloqueio')]);
  assert.deepStrictEqual(r.enderecos, ['Rua Antonio Cabral, 809 — 13 de Setembro', 'Avenida Caracarai, 98 — 13 de Setembro']);
  eq(r.via, 'folhas'); eq(r.folhas, 2);
  assert(!/FULANA|BELTRANO|711/.test(JSON.stringify(r)), 'nome/CPF não podem aparecer no resultado');
  const so = R.enderecosDeFolhas([capa, roteiro]);
  eq(so.via, 'roteiro'); assert.deepStrictEqual(so.enderecos, ['Rua Antonio Cabral, 809 — 13 de Setembro', 'Avenida General Sampaio, 543 — 13 de Setembro']);
  eq(R.enderecosDeFolhas([capa]).via, null);
  eq(R.enderecosUnicos(['Rua A, 1', 'rua a, 1', 'Rua B, 2']).length, 2);
  eq(R.tamanhoDoGrupo(9, 9), 9); eq(R.tamanhoDoGrupo(10, 9), 5); eq(R.tamanhoDoGrupo(19, 9), 7);
  eq(R.tamanhoDoGrupo(31, 31), 31); eq(R.tamanhoDoGrupo(32, 31), 16); eq(R.tamanhoDoGrupo(62, 31), 31); eq(R.tamanhoDoGrupo(40), 20);
  console.log('rota.test.js: PDF unificado ok');
}
