const insights = require('../../src/services/insights.service');

const lim = { positiva: 70, atencao: 50, critico: 40 };
const base = {
  nome: '2º ANO A',
  avaliados: 10,
  media: 0.62,
  habilidades: [
    { codigo: 'EF02MA06', descritor: 'Resolver problemas', p: 0.85, n: 10 },
    { codigo: 'EF02LP04', descritor: 'Ler palavras', p: 0.3, n: 10 },
    { codigo: 'EF15LP03', p: 0.6, n: 10 },
  ],
  questoes: [
    { codigo: 'LP05', tipo: 'objetiva', gabarito: 'A', part: 10, p: 0.2, dist: { A: 2, C: 7, B: 1 } },
    { codigo: 'MT01', tipo: 'objetiva', gabarito: 'C', part: 10, p: 0.95, dist: { C: 9, A: 1 } },
  ],
  alunos: [
    { nome: 'ANA SOUZA LIMA', p: 0.35 },
    { nome: 'JOAO PEDRO', p: 0.8 },
  ],
  texto: [{ codigo: 'LP17', zeradas: { Branco: 2 } }],
};

test('pontos positivos, atenção e recomendações', () => {
  const r = insights.gerar(base, lim);
  expect(r.positivos.some((x) => x.includes('EF02MA06'))).toBe(true);
  expect(r.positivos.some((x) => x.includes('MT01'))).toBe(true);
  expect(r.atencao.some((x) => x.includes('EF02LP04'))).toBe(true);
  expect(r.atencao.some((x) => x.includes('LP05') && x.includes('alternativa C'))).toBe(true);
  expect(r.atencao.some((x) => x.includes('ANA SOUZA'))).toBe(true);
  expect(r.atencao.some((x) => x.includes('LP17'))).toBe(true);
  expect(r.recomendacoes.length).toBeGreaterThanOrEqual(3);
});

test('limiares configuráveis', () => {
  const r = insights.gerar(base, { positiva: 90, atencao: 20, critico: 10 });
  expect(r.positivos.some((x) => x.includes('EF02MA06'))).toBe(false);
  expect(r.atencao.some((x) => x.includes('EF02LP04'))).toBe(false);
  expect(r.atencao.some((x) => x.includes('abaixo de 10%'))).toBe(false);
});

test('média geral alta e baixa', () => {
  expect(insights.gerar({ ...base, media: 0.8 }, lim).positivos[0]).toMatch(/acima da meta/);
  expect(insights.gerar({ ...base, media: 0.4 }, lim).atencao[0]).toMatch(/abaixo de 50%/);
});

test('sem avaliados e sem problemas', () => {
  expect(insights.gerar({ avaliados: 0 }, lim).recomendacoes[0]).toMatch(/Ainda não há/);
  const r = insights.gerar({ avaliados: 3, media: 0.6, habilidades: [], questoes: [], alunos: [] }, lim);
  expect(r.recomendacoes).toEqual(['Manter o acompanhamento e comparar com as próximas avaliações.']);
  expect(insights.limiaresPadrao()).toEqual({ positiva: 70, atencao: 50, critico: 40 });
});
