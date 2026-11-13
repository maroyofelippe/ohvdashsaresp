const { classificar } = require('../../src/services/hall.service');

const a = (nome, acObj, totObj = 37) => ({ nome, acObj, totObj, p: acObj / totObj });

test('classificar: ordena por % e empates dividem a posição', () => {
  const r = classificar([a('Carlos', 30), a('Ana', 35), a('Bia', 35), a('Davi', 20)]);
  expect(r.map((x) => [x.nome, x.pos])).toEqual([
    ['Ana', 1],
    ['Bia', 1],
    ['Carlos', 3],
    ['Davi', 4],
  ]);
});

test('classificar: desempate por pontos e depois por nome (sem acento)', () => {
  const r = classificar([a('Zélia', 18, 20), a('Álvaro', 18, 20), a('Bruno', 36, 40)]);
  // 18/20 = 90% e 36/40 = 90%: mesma posição; mais pontos primeiro, depois nome
  expect(r.map((x) => x.nome)).toEqual(['Bruno', 'Álvaro', 'Zélia']);
  expect(new Set(r.map((x) => x.pos))).toEqual(new Set([1]));
});

test('classificar: lista vazia', () => {
  expect(classificar([])).toEqual([]);
});
