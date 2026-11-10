const { semear, logado, enviar, db, DOM } = require('../helpers/app');

let b;
let profA;
let profB;
let profC;
let coord;
let admin;
let avId;
const alunos = {};

beforeAll(async () => {
  b = await semear();
  for (const k of ['2A', '2B', '3A']) {
    alunos[k] = await db.Aluno.bulkCreate(
      [1, 2, 3].map((n) => ({ turma_id: b.t[k].id, numero_chamada: n, nome: `ALUNO ${k} ${n}` })),
    );
  }
  [profA, profB, profC, coord, admin] = await Promise.all(
    ['profA', 'profB', 'profC', 'coord', 'admin'].map((k) => logado(`${k}@${DOM}`)),
  );
});
afterAll(() => db.sequelize.close());

const questoesBase = (lp, mt) => [
  { chave: 'q1', disciplina_id: lp, codigo: 'LP01', ordem: 1, tipo: 'objetiva', gabarito: 'B', peso: 1 },
  { chave: 'q2', disciplina_id: lp, codigo: 'LP02', ordem: 2, tipo: 'objetiva', gabarito: null, peso: 1 },
  { chave: 'q3', disciplina_id: lp, codigo: 'LP03', ordem: 3, tipo: 'objetiva', gabarito: null, peso: 1 },
  {
    chave: 'q3a',
    pai_chave: 'q3',
    disciplina_id: lp,
    codigo: 'LP03a',
    ordem: 4,
    tipo: 'objetiva',
    gabarito: 'A',
    peso: 0.5,
  },
  {
    chave: 'q3b',
    pai_chave: 'q3',
    disciplina_id: lp,
    codigo: 'LP03b',
    ordem: 5,
    tipo: 'objetiva',
    gabarito: 'C',
    peso: 0.5,
  },
  {
    chave: 'q4',
    disciplina_id: mt,
    codigo: 'MT01',
    ordem: 6,
    tipo: 'escalar',
    peso: 1,
    niveis: [
      { codigo: 'A', credito: 'integral', pontos: 1 },
      { codigo: 'B', credito: 'parcial', pontos: 0.5 },
      { codigo: 'C', credito: 'nenhum', pontos: 0 },
    ],
  },
];

test('professor cria avaliação apenas na série em que leciona e publica', async () => {
  const dados = {
    titulo: 'Simulado Teste',
    tipo: 'simulado',
    ano_letivo_id: b.ano.id,
    serie_id: b.s2.id,
    disciplinas: [
      { disciplina_id: b.lp.id, data_aplicacao: '05/11/2026' },
      { disciplina_id: b.mt.id, data_aplicacao: null },
    ],
  };
  expect((await enviar(profC, 'post', '/api/avaliacoes', dados)).status).toBe(403);
  expect((await enviar(coord, 'post', '/api/avaliacoes', dados)).status).toBe(403);
  const r = await enviar(profA, 'post', '/api/avaliacoes', dados);
  expect(r.status).toBe(201);
  avId = r.body.id;
  const e = await enviar(profA, 'put', `/api/avaliacoes/${avId}/estrutura`, {
    disciplinas: dados.disciplinas.map((d) => ({ ...d, data_aplicacao: null })),
    questoes: questoesBase(b.lp.id, b.mt.id),
  });
  expect(e.status).toBe(200);
  expect(
    (await enviar(profA, 'patch', `/api/avaliacoes/${avId}/status`, { status: 'publicada' })).status,
  ).toBe(200);
  const q = await db.Questao.findOne({ where: { avaliacao_id: avId, codigo: 'LP03a' } });
  expect(q.questao_pai_id).toBeTruthy();
});

test('outro professor da mesma série usa a avaliação para lançar na turma dele', async () => {
  const qs = await db.Questao.findAll({ where: { avaliacao_id: avId } });
  const id = (c) => qs.find((q) => q.codigo === c).id;
  const g = await profB
    .get(`/api/lancamentos/grade?avaliacao=${avId}&turma=${b.t['2B'].id}&disciplina=${b.lp.id}`)
    .set('Accept', 'application/json');
  expect(g.status).toBe(200);
  expect(g.body.podeEditar).toBe(true);
  expect(g.body.questoes.map((q) => q.codigo)).toEqual(['LP01', 'LP02', 'LP03a', 'LP03b']); // agrupadora fora da grade
  const a = alunos['2B'][0].id;
  const r = await enviar(profB, 'patch', '/api/lancamentos', {
    avaliacao_id: avId,
    turma_id: b.t['2B'].id,
    disciplina_id: b.lp.id,
    itens: [
      { aluno_id: a, questao_id: id('LP01'), valor: 'b' },
      { aluno_id: a, questao_id: id('LP03a'), valor: 'A' },
      { aluno_id: a, questao_id: id('LP03b'), valor: 'D' },
      { aluno_id: a, questao_id: id('LP02'), valor: 'Z' },
    ],
  });
  expect(r.status).toBe(200);
  expect(r.body.gravadas).toBe(3);
  expect(r.body.erros).toHaveLength(1);
  const pts = await db.Resposta.sum('pontos', { where: { aluno_id: a } });
  expect(Number(pts)).toBeCloseTo(1.5);
  const p = await db.Participacao.findOne({ where: { aluno_id: a, disciplina_id: b.lp.id } });
  expect(p.presenca).toBe('presente');
});

test('professor NÃO lança em turma alheia (403) mas VÊ turma da mesma série', async () => {
  const q = await db.Questao.findOne({ where: { avaliacao_id: avId, codigo: 'LP01' } });
  const r = await enviar(profA, 'patch', '/api/lancamentos', {
    avaliacao_id: avId,
    turma_id: b.t['2B'].id,
    itens: [{ aluno_id: alunos['2B'][1].id, questao_id: q.id, valor: 'A' }],
  });
  expect(r.status).toBe(403);
  const g = await profA
    .get(`/api/lancamentos/grade?avaliacao=${avId}&turma=${b.t['2B'].id}&disciplina=${b.lp.id}`)
    .set('Accept', 'application/json');
  expect(g.status).toBe(200);
  expect(g.body.podeEditar).toBe(false);
  const painel = await profA
    .get(`/api/painel/dados?avaliacao=${avId}&turmas=${b.t['2B'].id}`)
    .set('Accept', 'application/json');
  expect(painel.status).toBe(200);
  expect(painel.body.kpis.avaliados).toBe(1);
});

test('professor NÃO vê série diferente', async () => {
  expect((await profC.get(`/api/avaliacoes/${avId}`).set('Accept', 'application/json')).status).toBe(403);
  expect(
    (
      await profC
        .get(`/api/lancamentos/grade?avaliacao=${avId}&turma=${b.t['2A'].id}&disciplina=${b.lp.id}`)
        .set('Accept', 'application/json')
    ).status,
  ).toBe(403);
  expect(
    (await profC.get(`/api/painel/dados?avaliacao=${avId}`).set('Accept', 'application/json')).status,
  ).toBe(403);
  const lista = await profC.get('/api/avaliacoes').set('Accept', 'application/json');
  expect(lista.body.find((a) => a.id === avId)).toBeUndefined();
  const al = await profC.get(`/api/alunos?turma_id=${b.t['2A'].id}`).set('Accept', 'application/json');
  expect(al.status).toBe(403);
});

test('coordenador recebe 403 em qualquer escrita, mas lê tudo', async () => {
  const q = await db.Questao.findOne({ where: { avaliacao_id: avId, codigo: 'LP01' } });
  const tentativas = [
    [
      'patch',
      '/api/lancamentos',
      {
        avaliacao_id: avId,
        turma_id: b.t['2A'].id,
        itens: [{ aluno_id: alunos['2A'][0].id, questao_id: q.id, valor: 'A' }],
      },
    ],
    ['post', '/api/alunos', { turma_id: b.t['2A'].id, numero_chamada: 9, nome: 'X Y Z', situacao: 'ativo' }],
    ['put', `/api/avaliacoes/${avId}/estrutura`, { disciplinas: [], questoes: [] }],
    ['patch', `/api/avaliacoes/${avId}/status`, { status: 'encerrada' }],
    [
      'post',
      '/api/estrutura/turmas',
      { ano_letivo_id: b.ano.id, serie_id: b.s2.id, letra: 'Z', periodo: 'manha' },
    ],
    ['post', `/api/admin/usuarios/${b.u.profA.id}/aprovar`, {}],
    ['delete', `/api/avaliacoes/${avId}`, undefined],
  ];
  for (const [m, url, corpo] of tentativas)
    expect([m, url, (await enviar(coord, m, url, corpo)).status]).toEqual([m, url, 403]);
  expect(
    (await coord.get(`/api/painel/dados?avaliacao=${avId}`).set('Accept', 'application/json')).status,
  ).toBe(200);
  expect((await coord.get(`/api/avaliacoes/${avId}`).set('Accept', 'application/json')).status).toBe(200);
  expect(
    (
      await coord
        .get(`/api/lancamentos/grade?avaliacao=${avId}&turma=${b.t['2A'].id}&disciplina=${b.lp.id}`)
        .set('Accept', 'application/json')
    ).body.podeEditar,
  ).toBe(false);
});

test('com respostas: estrutura bloqueada ao autor; gabarito corrigível com confirmação e recálculo', async () => {
  const atual = (await profA.get(`/api/avaliacoes/${avId}`).set('Accept', 'application/json')).body;
  expect(atual.permissoes.podeEditarEstrutura).toBe(false);
  expect(atual.permissoes.podeExcluir).toBe(false); // respostas de outra turma
  const base = {
    disciplinas: atual.avaliacao.disciplinas.map((d) => ({
      disciplina_id: d.disciplina_id,
      data_aplicacao: null,
    })),
  };
  // remover questão → bloqueado
  let r = await enviar(profA, 'put', `/api/avaliacoes/${avId}/estrutura`, {
    ...base,
    questoes: atual.questoes.filter((q) => q.codigo !== 'LP02'),
  });
  expect(r.status).toBe(409);
  expect(r.body.detalhes.estruturais).toBeTruthy();
  // corrigir gabarito LP03b C→D pede confirmação
  const corrigidas = atual.questoes.map((q) => (q.codigo === 'LP03b' ? { ...q, gabarito: 'D' } : q));
  r = await enviar(profA, 'put', `/api/avaliacoes/${avId}/estrutura`, { ...base, questoes: corrigidas });
  expect(r.status).toBe(409);
  expect(r.body.detalhes.precisaConfirmacao).toBe(true);
  r = await enviar(profA, 'put', `/api/avaliacoes/${avId}/estrutura`, {
    ...base,
    questoes: corrigidas,
    confirmar: true,
  });
  expect(r.status).toBe(200);
  expect(r.body.recalculadas).toBe(1);
  expect(Number(await db.Resposta.sum('pontos', { where: { aluno_id: alunos['2B'][0].id } }))).toBeCloseTo(2);
  expect(await db.Auditoria.count({ where: { acao: 'avaliacao.corrigir_gabarito' } })).toBe(1);
  // outro professor não edita avaliação alheia
  expect(
    (
      await enviar(profB, 'put', `/api/avaliacoes/${avId}/estrutura`, {
        ...base,
        questoes: corrigidas,
        confirmar: true,
      })
    ).status,
  ).toBe(403);
});

test('recalcular sem pares não altera nada', async () => {
  const correcao = require('../../src/services/correcao.service');
  expect(await correcao.recalcular(avId, { pares: [] })).toBe(0);
  expect(await correcao.recalcular(avId)).toBe(0);
});

test('admin acessa tudo', async () => {
  expect(
    (
      await admin
        .get(`/api/lancamentos/grade?avaliacao=${avId}&turma=${b.t['2A'].id}&disciplina=${b.lp.id}`)
        .set('Accept', 'application/json')
    ).body.podeEditar,
  ).toBe(true);
  expect(
    (
      await enviar(admin, 'post', '/api/estrutura/turmas', {
        ano_letivo_id: b.ano.id,
        serie_id: b.s3.id,
        letra: 'B',
        periodo: 'tarde',
      })
    ).status,
  ).toBe(201);
  expect((await admin.get('/api/admin/auditoria').set('Accept', 'application/json')).status).toBe(200);
  expect((await admin.get(`/api/painel/exportar?avaliacao=${avId}&visao=tudo&formato=xlsx`)).status).toBe(
    200,
  );
  expect(
    (
      await enviar(admin, 'post', '/api/alunos', {
        turma_id: b.t['3A'].id,
        numero_chamada: 9,
        nome: 'Novo Aluno',
        ra: '',
        situacao: 'ativo',
      })
    ).status,
  ).toBe(201);
});

test('professor gerencia alunos só das suas turmas', async () => {
  expect(
    (
      await enviar(profA, 'post', '/api/alunos', {
        turma_id: b.t['2A'].id,
        numero_chamada: 10,
        nome: 'Aluno Novo A',
        ra: '',
        situacao: 'ativo',
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await enviar(profA, 'post', '/api/alunos', {
        turma_id: b.t['2B'].id,
        numero_chamada: 10,
        nome: 'Aluno Novo B',
        ra: '',
        situacao: 'ativo',
      })
    ).status,
  ).toBe(403);
});
