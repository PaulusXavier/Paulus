// Revisão 2026-11: "Lei 14.601/2023" (9 dígitos) era barrada como CPF/NIS; períodos "01/01/2026 - 31/12/2026" e 0800 também.
import test from 'node:test';
import assert from 'node:assert/strict';
import { temDadoPessoal } from '../shared/pii.mjs';
test('pii: número de norma com ano, 0800 e período de datas não são dado pessoal', () => {
  for (const t of ['o que diz a Lei 14.601/2023?', 'Lei 15.077/2024 mudou o quê?', 'explique o Decreto 12.064/2024', 'Lei 14601/2023', 'Lei 12.435/2011 e Lei 14.601/2023',
    'Lei 14.601/2023, art. 4, inciso II', 'Lei Maria da Penha, 11.340/2006', 'ligue 0800 707 2003', 'vigência 01/01/2026 - 31/12/2026']) assert.equal(temDadoPessoal(t), false, t);
});
test('pii: a exceção não abre brecha para CPF, NIS, telefone nem nascimento', () => {
  for (const t of ['CPF 123.456.789-09', 'cpf 12345678909', 'o NIS dela é 12345678901', '95991234567', 'telefone (95) 99123-4567', 'Lei 14.601/2023 e o CPF 12345678909',
    '14.601/2023 12345678901', 'meu cpf 111.222.333-44 conforme a Lei 14.601/2023', 'a criança nasceu em 12/03/2015']) assert.equal(temDadoPessoal(t), true, t);
});
