const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { semear, logado, enviar, db, DOM } = require('../helpers/app');
const poc = require('../helpers/poc');

const ARQ = path.join(__dirname, '..', '..', 'seed-data', 'backup_saresp_OHV_2026-11-06.json');
let b;
let admin;
beforeAll(async () => {
  b = await semear();
  admin = await logado(`admin@${DOM}`);
});
afterAll(() => db.sequelize.close());

/** Backup sintético (mesmo formato da PoC v3) para não depender de dados reais. */
function backupSintetico() {
  const q = [];
  for (let i = 1; i <= 4; i++)
    q.push({
      code: `LP0${i}`,
      disc: 'LP',
      tipo: 'obj',
      gab: 'ABCD'[i - 1],
      peso: 1,
      hab: `EF02LP0${i}`,
      desc: '',
    });
  q.push(
    { code: 'LP05a', disc: 'LP', tipo: 'obj', gab: 'B', peso: 0.5, hab: 'EF15LP03' },
    { code: 'LP05b', disc: 'LP', tipo: 'obj', gab: 'D', peso: 0.5, hab: 'EF35LP04' },
  );
  q.push({
    code: 'LP06',
    disc: 'LP',
    tipo: 'texto',
    gab: '',
    peso: 1,
    aspectos: [
      {
        id: 'A1',
        nome: 'Adequação',
        escala: [
          { c: 'A', pts: 2 },
          { c: 'B', pts: 1 },
          { c: 'C', pts: 0 },
        ],
      },
      {
        id: 'A2',
        nome: 'Tipologia',
        escala: [
          { c: 'A', pts: 3 },
          { c: 'B', pts: 2 },
          { c: 'C', pts: 1 },
          { c: 'D', pts: 0 },
        ],
      },
    ],
  });
  q.push(
    { code: 'MT01', disc: 'MT', tipo: 'obj', gab: 'C', peso: 1, hab: 'EF02MA01' },
    { code: 'MT02', disc: 'MT', tipo: 'obj', gab: '', peso: 1 },
  );
  q.push({
    code: 'MT03',
    disc: 'MT',
    tipo: 'esc',
    peso: 1,
    hab: 'EF02MA06',
    escala: [
      { c: 'A', cod: '20', cred: 'Integral', pts: 1 },
      { c: 'B', cod: '10', cred: 'Parcial', pts: 0.5 },
      { c: 'C', cod: '01', cred: 'Nenhum', pts: 0 },
    ],
  });
  const alunos = [];
  const resp = {};
  const vals = 'ABCD';
  let s = 7;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (const t of ['A', 'B']) {
    for (let n = 1; n <= 8; n++) {
      const id = `${t}${n}`;
      alunos.push({ id, num: String(n), nome: `ALUNO ${t} NUMERO ${n}`, turma: t, ano: '2º ANO' });
      if (n === 8) continue; // sem lançamento
      const r = {};
      for (const qq of q) {
        if (qq.tipo === 'obj') r[qq.code] = vals[Math.floor(rnd() * 4)];
        if (qq.tipo === 'esc') r[qq.code] = 'ABC'[Math.floor(rnd() * 3)];
        if (qq.tipo === 'texto') {
          r.LP06S = n === 3 ? 'B' : 'A';
          r.LP06A1 = 'ABC'[Math.floor(rnd() * 3)];
          r.LP06A2 = 'ABCD'[Math.floor(rnd() * 4)];
        }
      }
      if (n === 5) for (const k of Object.keys(r)) if (k.startsWith('MT')) delete r[k]; // só LP
      resp[id] = r;
    }
  }
  return {
    versao: 3,
    meta: { titulo: 'SIMULADO TESTE', ano: '2º ANO', dataLP: '05/11/2026', dataMT: '09/11/2026' },
    questoes: q,
    alunos,
    resp,
  };
}

async function importar(json) {
  const r = await admin
    .post('/api/admin/legado')
    .set('x-csrf-token', admin.csrf)
    .set('Accept', 'application/json')
    .attach('arquivo', Buffer.from(JSON.stringify(json)), {
      filename: 'backup.json',
      contentType: 'application/json',
    });
  expect(r.status).toBe(200);
  return r.body;
}

function conferir(dados, ref) {
  expect(dados.kpis.avaliados).toBe(ref.avaliados);
  expect(dados.kpis.media).toBeCloseTo(ref.media, 3);
  const lp = dados.kpis.porDisciplina.find((d) => d.sigla === 'LP');
  const mt = dados.kpis.porDisciplina.find((d) => d.sigla === 'MT');
  if (!Number.isNaN(ref.mLP)) expect(lp.media).toBeCloseTo(ref.mLP, 3);
  if (!Number.isNaN(ref.mMT)) expect(mt.media).toBeCloseTo(ref.mMT, 3);
  expect(dados.kpis.acima70).toBe(ref.acima);
  expect(dados.kpis.abaixo50).toBe(ref.abaixo);
  expect(dados.ranking.map((r) => r.nome)).toEqual(ref.ranking.map((r) => r.nome.toUpperCase()));
  dados.ranking.forEach((r, i) => expect(r.ac).toBeCloseTo(ref.ranking[i].ac, 3));
}

test('importação do legado (sintético) reproduz KPIs e ranking da PoC', async () => {
  const json = backupSintetico();
  const rel = await importar(json);
  expect(rel.questoes).toBe(json.questoes.length + 1); // + questão-mãe LP05
  expect(rel.criados.alunos).toBe(16);
  const d = (
    await admin.get(`/api/painel/dados?avaliacao=${rel.avaliacao.id}`).set('Accept', 'application/json')
  ).body;
  conferir(d, poc.kpis(json));
  expect(d.kpis.semGabarito).toEqual(['MT02']);
  const dB = (
    await admin
      .get(`/api/painel/dados?avaliacao=${rel.avaliacao.id}&turmas=${b.t['2B'].id}`)
      .set('Accept', 'application/json')
  ).body;
  conferir(dB, poc.kpis(json, 'B'));
  // reimportar é idempotente
  const rel2 = await importar(json);
  expect(rel2.avaliacaoNova).toBe(false);
  expect(rel2.criados.alunos).toBe(0);
});

(fs.existsSync(ARQ) ? test : test.skip)(
  'importar backup_saresp_OHV_2026-11-06.json gera os mesmos KPIs e rankings da PoC',
  async () => {
    const json = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
    const rel = await importar(json);
    const d = (
      await admin.get(`/api/painel/dados?avaliacao=${rel.avaliacao.id}`).set('Accept', 'application/json')
    ).body;
    conferir(d, poc.kpis(json));
    for (const t of ['A', 'B', 'C']) {
      const turma = await db.Turma.findOne({ where: { letra: t, serie_id: b.s2.id } });
      const dt = (
        await admin
          .get(`/api/painel/dados?avaliacao=${rel.avaliacao.id}&turmas=${turma.id}`)
          .set('Accept', 'application/json')
      ).body;
      const ref = poc.kpis(json, t);
      if (ref.avaliados) conferir(dt, ref);
      else expect(dt.kpis.avaliados).toBe(0);
    }
  },
);

test('importação de respostas no layout da PoC (xlsx) com pré-visualização e casamento por nome', async () => {
  const av = await db.Avaliacao.findOne({ where: { titulo: 'SIMULADO TESTE' } });
  const turma = b.t['2A'];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Alunos_Respostas');
  ws.addRow([
    'Nº',
    'Nome',
    'Turma',
    'Ano',
    'LP01',
    'LP02',
    'LP05a',
    'LP05b',
    'LP06S',
    'LP06A1',
    'LP06A2',
    'MT01',
    'MT03',
  ]);
  ws.addRow([1, 'Aluno A Número 1', 'A', '2º ANO', 'A', 'B', 'B', 'D', 'Normal', 'A', 'A', 'C', '20']);
  ws.addRow([2, 'ALUNO A NUMERO 2', 'A', '2º ANO', 'x', 'E', '', '', 'B', '', '', '', 'B']);
  ws.addRow([90, 'ALUNO INEXISTENTE', 'A', '2º ANO', 'A', '', '', '', '', '', '', '', '']);
  ws.addRow([4, 'ALUNO B NUMERO 4', 'B', '2º ANO', 'A', '', '', '', '', '', '', '', '']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const pr = await admin
    .post('/api/lancamentos/importar/previa')
    .set('x-csrf-token', admin.csrf)
    .set('Accept', 'application/json')
    .field('avaliacao_id', String(av.id))
    .field('turma_id', String(turma.id))
    .attach('arquivo', buf, {
      filename: 'respostas.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  expect(pr.status).toBe(200);
  expect(pr.body.resumo).toMatchObject({ total: 4, ok: 2, naoEncontrados: 1, outraTurma: 1 });
  const [l1, l2, l3] = pr.body.linhas;
  expect(l1.valores).toMatchObject({ LP01: 'A', LP06S: 'A', MT03: 'A' });
  expect(l2.erros).toEqual(['LP02: "E" inválido']);
  expect(l2.valores.LP01).toBe('X');
  expect(l3.status).toBe('nao_encontrado');
  const conf = await enviar(admin, 'post', '/api/lancamentos/importar/confirmar', {
    avaliacao_id: av.id,
    turma_id: turma.id,
    linhas: [
      { aluno_id: l1.aluno_id, valores: l1.valores },
      { aluno_id: l2.aluno_id, valores: l2.valores },
      { criar: { numero: 90, nome: 'ALUNO INEXISTENTE' }, valores: l3.valores },
    ],
  });
  expect(conf.status).toBe(200);
  expect(conf.body.alunosCriados).toBe(1);
  // LP01 A(1) + LP02 B(1) + LP05a B(0,5) + LP05b D(0,5) + LP06 A,A = 5/5 → 1 + MT01 C(1) + MT03 A(1)
  expect(
    Number(await db.Resposta.sum('pontos', { where: { aluno_id: l1.aluno_id, avaliacao_id: av.id } })),
  ).toBeCloseTo(6);
  const novo = await db.Aluno.findOne({ where: { turma_id: turma.id, numero_chamada: 90 } });
  expect(novo).toBeTruthy();
  // modelo e exportação no mesmo layout
  const ex = await admin
    .get(`/api/lancamentos/exportar?avaliacao=${av.id}&turma=${turma.id}`)
    .buffer(true)
    .parse((res, cb) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => cb(null, Buffer.concat(ch)));
    });
  expect(ex.status).toBe(200);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(ex.body);
  const cab = wb2.worksheets[0].getRow(1).values.slice(1);
  expect(cab.slice(0, 4)).toEqual(['Nº', 'Nome', 'Turma', 'Ano']);
  expect(cab).toEqual(expect.arrayContaining(['LP05a', 'LP06S', 'LP06A1', 'MT03']));
});

test('importação de alunos com pré-visualização', async () => {
  const csv = Buffer.from('Nº;Nome;RA\n1;ALUNO A NUMERO 1;\n91;Nova Aluna;123456\n92;;\n', 'utf8');
  const pr = await admin
    .post('/api/alunos/importar/previa')
    .set('x-csrf-token', admin.csrf)
    .set('Accept', 'application/json')
    .field('turma_id', String(b.t['2A'].id))
    .attach('arquivo', csv, { filename: 'alunos.csv', contentType: 'text/csv' });
  expect(pr.status).toBe(200);
  expect(pr.body.resumo).toMatchObject({ incluir: 1, iguais: 1, erros: 1 });
  const c = await enviar(admin, 'post', '/api/alunos/importar/confirmar', {
    turma_id: b.t['2A'].id,
    modo: 'novos',
    linhas: pr.body.linhas.filter((l) => !l.erros.length),
  });
  expect(c.body.incluidos).toBe(1);
});

test('upload inválido é recusado', async () => {
  const r = await admin
    .post('/api/admin/legado')
    .set('x-csrf-token', admin.csrf)
    .set('Accept', 'application/json')
    .attach('arquivo', Buffer.from('<html>'), { filename: 'x.html', contentType: 'text/html' });
  expect(r.status).toBe(400);
  const r2 = await admin
    .post('/api/admin/legado')
    .set('x-csrf-token', admin.csrf)
    .set('Accept', 'application/json')
    .attach('arquivo', Buffer.from('{"a":1}'), { filename: 'x.json', contentType: 'application/json' });
  expect(r2.status).toBe(400);
});
