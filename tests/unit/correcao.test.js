const c = require('../../src/services/correcao.service');

const obj = (extra = {}) => ({
  id: 1,
  tipo: 'objetiva',
  gabarito: 'B',
  peso: 1,
  anulada: false,
  num_alternativas: 4,
  ...extra,
});
const MT20 = {
  id: 20,
  tipo: 'escalar',
  peso: 1,
  anulada: false,
  niveis: [
    { codigo: 'A', codigo_alt: '20', pontos: 1, credito: 'integral' },
    { codigo: 'B', codigo_alt: '10', pontos: 0.5, credito: 'parcial' },
    { codigo: 'C', codigo_alt: '01', pontos: 0 },
    { codigo: 'D', codigo_alt: '02', pontos: 0 },
  ],
};
const MT21 = {
  id: 21,
  tipo: 'escalar',
  peso: 1,
  anulada: false,
  niveis: [
    { codigo: 'A', pontos: 1 },
    { codigo: 'B', pontos: 1 },
    { codigo: 'C', pontos: 0.5 },
    { codigo: 'D', pontos: 0 },
    { codigo: 'E', pontos: 0 },
  ],
};
const n3 = (...p) => p.map((x, i) => ({ codigo: 'ABCD'[i], pontos: x }));
const LP17 = {
  id: 17,
  tipo: 'producao_texto',
  peso: 1,
  anulada: false,
  situacoes: [
    { codigo: 'A', nome: 'Normal', zera_nota: false },
    { codigo: 'B', nome: 'Branco', zera_nota: true },
    { codigo: 'C', nome: 'Pré-silábico', zera_nota: true },
    { codigo: 'D', nome: 'Cópia', zera_nota: true },
    { codigo: 'E', nome: 'Outra língua', zera_nota: true },
  ],
  aspectos: [
    { id: 101, codigo: 'A1', niveis: n3(2, 1, 0) },
    { id: 102, codigo: 'A2', niveis: n3(3, 2, 1, 0) },
    { id: 103, codigo: 'A3', niveis: n3(2, 1, 0) },
    { id: 104, codigo: 'A4', niveis: n3(2, 1, 0) },
    { id: 105, codigo: 'A5', niveis: n3(3, 2, 1, 0) },
    { id: 106, codigo: 'A6', niveis: n3(3, 2, 1, 0) },
    { id: 107, codigo: 'A7', niveis: n3(2, 1, 0) },
  ],
};
const cfgAcerto = { anuladaContaAcerto: true };
const cfgExclui = { anuladaContaAcerto: false };

describe('objetiva', () => {
  test('acerto, erro, branco e rasura', () => {
    expect(c.fracaoObjetiva(obj(), 'B')).toBe(1);
    expect(c.fracaoObjetiva(obj(), 'b')).toBe(1);
    expect(c.fracaoObjetiva(obj(), 'A')).toBe(0);
    expect(c.fracaoObjetiva(obj(), '-')).toBe(0);
    expect(c.fracaoObjetiva(obj(), 'X')).toBe(0);
    expect(c.fracaoObjetiva(obj(), null)).toBe(0);
    expect(c.fracaoObjetiva(obj({ gabarito: null }), 'A')).toBe(0);
  });
  test('anulada: acerto para todos (configurável)', () => {
    expect(c.fracaoObjetiva(obj({ anulada: true }), 'A', cfgAcerto)).toBe(1);
    expect(c.fracaoObjetiva(obj({ anulada: true }), 'A', cfgExclui)).toBe(0);
    expect(c.questaoAtiva(obj({ anulada: true }), cfgAcerto)).toBe(true);
    expect(c.questaoAtiva(obj({ anulada: true }), cfgExclui)).toBe(false);
  });
  test('pontos = f × peso e subitens desdobrados (0,5 cada)', () => {
    const a = obj({ id: 91, gabarito: 'B', peso: 0.5 });
    const b = obj({ id: 92, gabarito: 'D', peso: 0.5 });
    expect(c.calcularQuestao(a, [{ aspecto_id: null, valor: 'B' }]).linhas[0].pontos).toBe(0.5);
    expect(c.calcularQuestao(b, [{ aspecto_id: null, valor: 'A' }]).linhas[0].pontos).toBe(0);
    expect(c.calcularQuestao(obj({ peso: 2 }), [{ aspecto_id: null, valor: 'B' }]).linhas[0].pontos).toBe(2);
  });
  test('sem linha lançada', () => {
    expect(c.calcularQuestao(obj(), []).f).toBe(0);
    expect(c.calcularQuestao(obj({ anulada: true }), [], cfgAcerto).f).toBe(1);
  });
});

describe('escalar', () => {
  test('MT20: A=1 · B=0,5 · C=0 · D=0', () => {
    expect(c.fracaoEscalar(MT20, 'A')).toBe(1);
    expect(c.fracaoEscalar(MT20, 'B')).toBe(0.5);
    expect(c.fracaoEscalar(MT20, 'C')).toBe(0);
    expect(c.fracaoEscalar(MT20, 'D')).toBe(0);
    expect(c.fracaoEscalar(MT20, '-')).toBe(0);
  });
  test('MT21: A=1 · B=1 · C=0,5 · D=0 · E=0', () => {
    expect(['A', 'B', 'C', 'D', 'E'].map((v) => c.fracaoEscalar(MT21, v))).toEqual([1, 1, 0.5, 0, 0]);
  });
  test('escala vazia, anulada e cálculo de pontos', () => {
    expect(c.fracaoEscalar({ ...MT20, niveis: [] }, 'A')).toBe(0);
    expect(c.questaoAtiva({ ...MT20, niveis: [] })).toBe(false);
    expect(c.fracaoEscalar({ ...MT20, anulada: true }, 'C', cfgAcerto)).toBe(1);
    expect(c.fracaoEscalar({ ...MT20, anulada: true }, 'C', cfgExclui)).toBe(0);
    expect(c.calcularQuestao({ ...MT20, peso: 2 }, [{ aspecto_id: null, valor: 'B' }]).linhas[0].pontos).toBe(
      1,
    );
    expect(c.nivelEscalar(MT20, 'Z')).toBeNull();
  });
});

describe('produção de texto', () => {
  const linhas = (sit, niveis) => [
    ...(sit ? [{ aspecto_id: null, valor: sit }] : []),
    ...niveis.map((v, i) => ({ aspecto_id: 101 + i, valor: v })),
  ];
  test('máximo de 17 pontos', () => expect(c.maxTexto(LP17)).toBe(17));
  test('situação Normal soma os aspectos', () => {
    const r = c.calcularQuestao(LP17, linhas('A', ['A', 'A', 'A', 'A', 'A', 'A', 'A']));
    expect(r.f).toBe(1);
    expect(r.linhas.reduce((s, l) => s + l.pontos, 0)).toBeCloseTo(1, 2);
    const r2 = c.calcularQuestao(LP17, linhas('A', ['A', 'B', 'A', 'B', 'C', 'B', 'B'])); // 2+2+2+1+1+2+1 = 11
    expect(r2.f).toBeCloseTo(11 / 17, 5);
    expect(r2.linhas.find((l) => l.aspecto_id === null).pontos).toBe(0);
  });
  test('situação que zera ignora os aspectos', () => {
    for (const s of ['B', 'C', 'D', 'E']) {
      const r = c.calcularQuestao(LP17, linhas(s, ['A', 'A', 'A', 'A', 'A', 'A', 'A']));
      expect(r.f).toBe(0);
      expect(r.linhas.every((l) => l.pontos === 0)).toBe(true);
    }
  });
  test('sem situação mas com aspectos → assume a situação que pontua', () => {
    expect(c.situacaoTexto(LP17, { situacao: null, aspectos: { 101: 'A' } })).toBe('A');
    expect(c.calcularQuestao(LP17, linhas(null, ['A'])).f).toBeCloseTo(2 / 17, 5);
    expect(c.situacaoTexto({ ...LP17, situacoes: [] }, { aspectos: { 101: 'A' } })).toBe('A');
  });
  test('em branco total e situação inexistente', () => {
    expect(c.pontuarTexto(LP17, {}).f).toBe(0);
    expect(c.pontuarTexto(LP17, { situacao: 'Z', aspectos: {} }).f).toBe(0);
    expect(c.situacaoTexto(LP17, { situacao: '-', aspectos: {} })).toBeNull();
  });
  test('peso aplicado e anulada', () => {
    const r = c.calcularQuestao({ ...LP17, peso: 2 }, linhas('A', ['A', 'A', 'A', 'A', 'A', 'A', 'A']));
    expect(r.linhas.reduce((s, l) => s + l.pontos, 0)).toBeCloseTo(2, 2);
    expect(c.pontuarTexto({ ...LP17, anulada: true }, {}, cfgAcerto).f).toBe(1);
    expect(c.pontuarTexto({ ...LP17, anulada: true }, {}, cfgExclui).f).toBe(0);
    expect(c.questaoAtiva({ ...LP17, aspectos: [] })).toBe(false);
  });
});

describe('validação e normalização de valores', () => {
  test('objetiva aceita A–D, - e X', () => {
    expect(c.valoresValidos(obj())).toEqual(['A', 'B', 'C', 'D', '-', 'X']);
    expect(c.normalizarValor(obj(), ' c ')).toBe('C');
    expect(c.normalizarValor(obj(), 'E')).toBeUndefined();
    expect(c.normalizarValor(obj(), '')).toBeNull();
    expect(c.normalizarValor(obj(), null)).toBeNull();
    expect(c.normalizarValor(obj(), '—')).toBe('-');
  });
  test('escalar aceita código SARESP', () => {
    expect(c.normalizarValor(MT20, '20')).toBe('A');
    expect(c.normalizarValor(MT20, '10')).toBe('B');
    expect(c.normalizarValor(MT20, '02')).toBe('D');
    expect(c.normalizarValor(MT20, '2')).toBeUndefined();
  });
  test('texto aceita nome da situação e níveis do aspecto', () => {
    expect(c.normalizarValor(LP17, 'Normal')).toBe('A');
    expect(c.normalizarValor(LP17, 'pre-silabico')).toBe('C');
    expect(c.normalizarValor(LP17, 'b', LP17.aspectos[0])).toBe('B');
    expect(c.normalizarValor(LP17, 'D', LP17.aspectos[0])).toBeUndefined();
  });
});

describe('nota por disciplina e folhas', () => {
  test('Σ pontos / Σ pesos, exclui agrupadora e sem gabarito', () => {
    const qs = [
      obj({ id: 1 }),
      obj({ id: 2, gabarito: 'A' }),
      obj({ id: 9, gabarito: null }),
      obj({ id: 10, gabarito: null }),
      obj({ id: 11, questao_pai_id: 10, peso: 0.5 }),
      obj({ id: 12, questao_pai_id: 10, peso: 0.5, gabarito: 'D' }),
      obj({ id: 3, anulada: true }),
    ];
    expect(c.questoesFolha(qs).map((q) => q.id)).toEqual([1, 2, 9, 11, 12, 3]);
    const r = c.notaDisciplina(qs, { 1: 1, 2: 0, 11: 0.5, 12: 0 }, cfgAcerto);
    expect(r.pesos).toBe(4);
    expect(r.pontos).toBe(2.5);
    expect(r.percentual).toBeCloseTo(0.625);
    expect(c.notaDisciplina([], {}).percentual).toBeNull();
  });
  test('definicao converte objeto simples', () => {
    const d = c.definicao({
      id: 5,
      tipo: 'escalar',
      peso: '1.00',
      niveis: [{ codigo: 'A', pontos: '1.00' }],
      codigo: 'MT20',
    });
    expect(d.peso).toBe(1);
    expect(d.niveis[0].pontos).toBe(1);
    expect(d.num_alternativas).toBe(4);
  });
});

describe('casos de borda', () => {
  test('tipo desconhecido e configuração padrão (env)', () => {
    expect(c.questaoAtiva({ tipo: 'outro' })).toBe(false);
    expect(c.fracaoObjetiva(obj({ anulada: true }), 'A')).toBe(1); // ANULADA_CONTA_ACERTO padrão = true
    expect(c.maxNiveis(undefined)).toBe(0);
    expect(c.maxTexto({})).toBe(0);
    expect(c.valoresValidos({ tipo: 'objetiva' })).toEqual(['A', 'B', 'C', 'D', '-', 'X']);
    expect(c.valoresValidos({ tipo: 'escalar' })).toEqual(['-']);
    expect(c.valoresValidos({ tipo: 'producao_texto' })).toEqual([]);
    expect(c.valoresValidos({ tipo: 'producao_texto' }, {})).toEqual([]);
  });
  test('nome completo da situação e valores sem correspondência', () => {
    expect(c.normalizarValor(LP17, 'A - Normal')).toBe('A');
    expect(c.normalizarValor({ ...LP17, situacoes: undefined }, 'Normal')).toBeUndefined();
    expect(c.normalizarValor({ ...MT20, niveis: undefined }, '20')).toBeUndefined();
    expect(c.normalizarValor(MT20, '–')).toBe('-');
  });
  test('texto sem aspectos/níveis e linhas sem definição de aspecto', () => {
    const q = { ...LP17, aspectos: [{ id: 1, codigo: 'A1' }] };
    expect(c.pontuarTexto(q, { situacao: 'A', aspectos: { 1: 'A' } }).f).toBe(0);
    const r = c.calcularQuestao(LP17, [
      { aspecto_id: 999, valor: 'A' },
      { aspecto_id: null, valor: 'A' },
    ]);
    expect(r.linhas[0].pontos).toBe(0);
    expect(c.pontuarTexto({ ...LP17, situacoes: undefined, aspectos: undefined }, { situacao: 'A' }).f).toBe(
      0,
    );
    expect(c.situacaoTexto(LP17, undefined)).toBeNull();
  });
  test('peso zero/ausente e definição a partir de instância', () => {
    expect(c.calcularQuestao(obj({ peso: null }), [{ aspecto_id: null, valor: 'B' }]).linhas[0].pontos).toBe(
      0,
    );
    const inst = {
      get: () => ({
        id: 1,
        tipo: 'producao_texto',
        peso: 1,
        aspectos: [{ id: 2, codigo: 'A1', niveis: [{ codigo: 'A', pontos: '2' }] }],
        situacoes: [{ codigo: 'A', nome: 'Normal', zera_nota: 0 }],
      }),
    };
    const d = c.definicao(inst);
    expect(d.aspectos[0].niveis[0].pontos).toBe(2);
    expect(d.situacoes[0].zera_nota).toBe(false);
    expect(c.definicao({ id: 3, tipo: 'objetiva' }).niveis).toEqual([]);
  });
});
