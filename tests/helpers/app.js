const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/models');
const auth = require('../../src/services/auth.service');
const cache = require('../../src/services/cache.service');

const DOM = 'professor.educacao.sp.gov.br';
const SENHA = 'Senha2026';

async function limparBanco() {
  const [tabelas] = await db.sequelize.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'sequelize_%'",
  );
  if (tabelas.length)
    await db.sequelize.query(
      `TRUNCATE TABLE ${tabelas.map(({ t }) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  cache.limpar();
}

/** Estrutura mínima: LP/MT, 2º e 3º ANO, 2026, turmas 2A/2B/2C/3A e usuários de cada perfil. */
async function semear() {
  await limparBanco();
  const { Disciplina, Serie, AnoLetivo, Turma, Usuario, ProfessorTurma } = db;
  const lp = await Disciplina.create({ sigla: 'LP', nome: 'Língua Portuguesa' });
  const mt = await Disciplina.create({ sigla: 'MT', nome: 'Matemática' });
  const s2 = await Serie.create({ nome: '2º ANO', etapa: 'EF-AI', ordem: 2 });
  const s3 = await Serie.create({ nome: '3º ANO', etapa: 'EF-AI', ordem: 3 });
  const ano = await AnoLetivo.create({ ano: 2026, ativo: true });
  const t = {};
  for (const [k, s, l] of [
    ['2A', s2, 'A'],
    ['2B', s2, 'B'],
    ['2C', s2, 'C'],
    ['3A', s3, 'A'],
  ])
    t[k] = await Turma.create({ ano_letivo_id: ano.id, serie_id: s.id, letra: l });
  const senha_hash = await auth.hashSenha(SENHA);
  const u = {};
  const criar = async (k, perfil, extra = {}) =>
    (u[k] = await Usuario.create({
      nome: `Usuário ${k}`,
      email: `${k}@${DOM}`,
      senha_hash,
      perfil,
      status: 'ativo',
      ...extra,
    }));
  await criar('admin', 'admin', { nativo: true });
  await criar('coord', 'coordenador');
  await criar('profA', 'professor');
  await criar('profB', 'professor');
  await criar('profC', 'professor');
  await ProfessorTurma.bulkCreate([
    { usuario_id: u.profA.id, turma_id: t['2A'].id, status: 'aprovado' },
    { usuario_id: u.profB.id, turma_id: t['2B'].id, status: 'aprovado' },
    { usuario_id: u.profC.id, turma_id: t['3A'].id, status: 'aprovado' },
  ]);
  return { lp, mt, s2, s3, ano, t, u };
}

/** Agente com cookies + token CSRF já obtido. */
async function agente() {
  const ag = request.agent(app);
  const r = await ag.get('/api/csrf');
  ag.csrf = r.body.token;
  return ag;
}

async function logado(email, senha = SENHA) {
  const ag = await agente();
  const r = await ag.post('/login').type('form').send({ email, senha, _csrf: ag.csrf });
  if (r.status !== 302) throw new Error(`Login falhou para ${email}: ${r.status}`);
  return ag;
}

const enviar = (ag, metodo, url, corpo) =>
  ag[metodo](url).set('x-csrf-token', ag.csrf).set('Accept', 'application/json').send(corpo);

module.exports = { app, db, request, semear, limparBanco, agente, logado, enviar, DOM, SENHA };
