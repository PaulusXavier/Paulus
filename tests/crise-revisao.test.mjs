import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarCrise } from '../shared/crise.mjs';

test('crise (revisão): ameaça com arma, corte no pulso e remédio em excesso são socorro', () => {
  const casos = {
    'ele me ameaçou com faca': 'violencia',
    'o marido ameaçou ela com uma arma': 'violencia',
    'meu pai apontou uma arma pra minha mãe': 'violencia',
    'minha filha cortou os pulsos': 'suicidio',
    'ela cortou os pulsos ontem': 'suicidio',
    'tomei muito remédio pra dormir e não acordar': 'clinica',
    'ele tomou muito remédio e está estranho': 'clinica'
  };
  for (const [frase, subtipo] of Object.entries(casos)) {
    const r = detectarCrise(frase);
    assert.ok(r, 'não detectou: ' + frase);
    assert.equal(r.subtipo, subtipo, frase + ' → ' + (r && r.subtipo));
  }
});

test('crise (revisão): expressões populares e dúvidas de rotina não disparam o cartão', () => {
  for (const f of [
    'quero morrer de rir', 'estou morrendo de vergonha dessa visita', 'morro de saudade da equipe antiga', 'vou morrer de fome esperando o almoço',
    'a faca da cozinha do CRAS está sem fio', 'ele ameaçou cortar o benefício', 'a família ameaçou denunciar o CRAS', 'cortou o cabelo da criança para a foto',
    'ela cortou o braço no vidro da janela', 'como registrar ameaça com arma no relatório de violência?', 'o que fazer em caso de ameaça com faca?'
  ]) assert.equal(detectarCrise(f), null, 'falso alarme: ' + f);
});

test('crise (revisão): o socorro real continua com idioma junto de expressão', () => {
  assert.ok(detectarCrise('estou morrendo de vergonha mas quero me matar'));
  assert.ok(detectarCrise('quero morrer, não aguento mais'));
});
