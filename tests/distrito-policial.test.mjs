import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaDeDistritoPolicial, distritosPoliciais } from '../shared/distrito-policial.mjs';
test('lista cinco distritos e localiza bairros da circunscrição',()=>{
 assert.equal(distritosPoliciais.length,5);
 assert.match(respostaDeDistritoPolicial('qual distrito policial atende Vila Jardim?').texto,/3º Distrito Policial/);
 assert.match(respostaDeDistritoPolicial('qual DP atende o bairro Caimbé?').texto,/2º Distrito Policial/);
 assert.match(respostaDeDistritoPolicial('qual distrito policial atende a área rural?').texto,/5º Distrito Policial/);
});
test('lista bairros, contatos e orientação de plantão',()=>{
 assert.match(respostaDeDistritoPolicial('quais bairros o 4º Distrito Policial atende?').texto,/Pintolândia/);
 assert.match(respostaDeDistritoPolicial('telefone do DP 1').texto,/98414-8712/);
 assert.match(respostaDeDistritoPolicial('onde funciona o plantão 24 horas da polícia?').texto,/Central de Flagrantes/);
});
test('não captura consulta de Conselho Tutelar nem inventa cobertura',()=>{
 assert.equal(respostaDeDistritoPolicial('qual Conselho Tutelar atende Caimbé?'),null);
 assert.equal(respostaDeDistritoPolicial('qual o distrito policial do bairro Vila Jardim?').tipoTerritorio,'bairro');
 assert.match(respostaDeDistritoPolicial('qual distrito policial atende um lugar não listado?').texto,/Não identifiquei/);
});
