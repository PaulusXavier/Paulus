import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaDeSaudeMentalTerritorio } from '../shared/saude-mental-territorio.mjs';
test('resolve CAPS por bairro segundo as macroáreas do Argo',()=>{
 const r=respostaDeSaudeMentalTerritorio('qual CAPS atende o bairro Centro?');
 assert.equal(r.tipoSaude,'caps'); assert.match(r.texto,/CAPS II/); assert.match(r.texto,/CAPS AD III/); assert.doesNotMatch(r.texto,/CAPS III —/);
 const s=respostaDeSaudeMentalTerritorio('qual CAPS atende Pintolândia?'); assert.match(s.texto,/CAPS III/); assert.match(s.texto,/CAPS AD III/);
});
test('localiza UBS com psicólogo pela cobertura de bairro cadastrada',()=>{
 const r=respostaDeSaudeMentalTerritorio('qual UBS tem psicólogo e atende o bairro Centro?');
 assert.equal(r.tipoSaude,'ubs-psicologia'); assert.match(r.texto,/UBS Dra. Sandra Maria/); assert.match(r.texto,/UBS Mecejana/);
 assert.match(respostaDeSaudeMentalTerritorio('UBS com psicólogo para Jardim Caranã').texto,/UBS Dr. Hélio Macedo/);
});
test('não inventa UBS de psicologia para macroárea sem unidade listada',()=>{
 const r=respostaDeSaudeMentalTerritorio('qual UBS tem psicólogo no bairro Nova Cidade?');
 assert.equal(r.tipoSaude,'nao-consta'); assert.match(r.texto,/Macroárea 8/);
});
test('não captura pergunta sem referência de saúde mental',()=>{
 assert.equal(respostaDeSaudeMentalTerritorio('qual o endereço do Centro?'),null);
});
