const { semear, agente, logado, enviar, db, DOM, SENHA, request, app } = require('../helpers/app');
const email = require('../../src/services/email.service');

let base;
beforeAll(async () => {
  base = await semear();
});
afterAll(() => db.sequelize.close());

const ultimoLink = (para, tipo) => {
  const m = [...email.caixaSaida].reverse().find((x) => x.para === para && x.botao?.url.includes(tipo));
  return m && new URL(m.botao.url);
};

test('cadastro → confirmação → aprovação → login → refresh → logout', async () => {
  const ag = await agente();
  const novo = `nova.prof@${DOM}`;
  let r = await ag
    .post('/cadastro')
    .type('form')
    .send({
      _csrf: ag.csrf,
      nome: 'Nova Professora Teste',
      email: novo,
      senha: 'Abc12345',
      confirmar_senha: 'Abc12345',
      perfil: 'professor',
      turmas: String(base.t['2C'].id),
    });
  expect(r.status).toBe(200);
  expect(r.text).toMatch(/link de confirmação/);
  let u = await db.Usuario.findOne({ where: { email: novo } });
  expect(u.status).toBe('pendente_email');

  // login antes de confirmar é recusado
  r = await ag.post('/login').type('form').send({ _csrf: ag.csrf, email: novo, senha: 'Abc12345' });
  expect(r.status).toBe(403);

  const link = ultimoLink(novo, 'confirmar-email');
  r = await ag.get(`${link.pathname}${link.search}`);
  expect(r.status).toBe(200);
  await u.reload();
  expect(u.status).toBe('pendente');

  r = await ag.post('/login').type('form').send({ _csrf: ag.csrf, email: novo, senha: 'Abc12345' });
  expect(r.status).toBe(403);
  expect(r.text).toMatch(/aguarda aprovação/);

  const admin = await logado(`admin@${DOM}`);
  r = await enviar(admin, 'post', `/api/admin/usuarios/${u.id}/aprovar`);
  expect(r.status).toBe(200);
  const vinc = await db.ProfessorTurma.findOne({ where: { usuario_id: u.id } });
  expect(vinc.status).toBe('aprovado');

  r = await ag.post('/login').type('form').send({ _csrf: ag.csrf, email: novo, senha: 'Abc12345' });
  expect(r.status).toBe(302);
  const cookies = r.headers['set-cookie'].join(';');
  expect(cookies).toMatch(/ohv_at=.*HttpOnly/);
  expect(cookies).toMatch(/ohv_rt=.*Path=\/auth\/refresh/);
  expect((await ag.get('/').set('Accept', 'text/html')).status).toBe(200);

  // refresh com rotação
  const antes = await db.RefreshToken.count({ where: { usuario_id: u.id, revogado_em: null } });
  r = await enviar(ag, 'post', '/auth/refresh');
  expect(r.status).toBe(200);
  expect(await db.RefreshToken.count({ where: { usuario_id: u.id, revogado_em: null } })).toBe(antes);
  expect(await db.RefreshToken.count({ where: { usuario_id: u.id } })).toBe(antes + 1);

  // logout revoga
  r = await ag.post('/auth/refresh/logout').type('form').send({ _csrf: ag.csrf });
  expect(r.status).toBe(302);
  expect(await db.RefreshToken.count({ where: { usuario_id: u.id, revogado_em: null } })).toBe(0);
});

test('reuso de refresh token revoga a família inteira', async () => {
  const ag = await logado(`profA@${DOM}`);
  const rt = ag.jar.getCookie('ohv_rt', {
    domain: '127.0.0.1',
    path: '/auth/refresh',
    secure: false,
    script: false,
  });
  expect(rt).toBeTruthy();
  const velho = rt.value;
  expect((await enviar(ag, 'post', '/auth/refresh')).status).toBe(200);
  // atacante reutiliza o token antigo
  const atk = await agente();
  const r = await atk
    .post('/auth/refresh')
    .set(
      'Cookie',
      `ohv_rt=${velho}; ohv_sid=${atk.jar.getCookie('ohv_sid', { domain: '127.0.0.1', path: '/', secure: false, script: false }).value}`,
    )
    .set('x-csrf-token', atk.csrf);
  expect(r.status).toBe(401);
  const u = await db.Usuario.findOne({ where: { email: `profA@${DOM}`.toLowerCase() } });
  expect(await db.RefreshToken.count({ where: { usuario_id: u.id, revogado_em: null } })).toBe(0);
});

test('cadastro com e-mail fora do domínio é recusado com mensagem clara', async () => {
  const ag = await agente();
  const r = await ag
    .post('/cadastro')
    .type('form')
    .send({
      _csrf: ag.csrf,
      nome: 'Fulano de Tal',
      email: 'fulano@gmail.com',
      senha: 'Abc12345',
      confirmar_senha: 'Abc12345',
      perfil: 'coordenador',
    });
  expect(r.status).toBe(400);
  expect(r.text).toMatch(/professor\.educacao\.sp\.gov\.br/);
});

test('CSRF obrigatório em escrita e mensagem de login genérica', async () => {
  const ag = await agente();
  expect(
    (
      await ag
        .post('/login')
        .type('form')
        .send({ email: `admin@${DOM}`, senha: SENHA })
    ).status,
  ).toBe(403);
  const r = await ag
    .post('/login')
    .type('form')
    .send({ _csrf: ag.csrf, email: `naoexiste@${DOM}`, senha: 'x' });
  expect(r.status).toBe(401);
  expect(r.text).toMatch(/E-mail ou senha inválidos/);
  const adm = await logado(`admin@${DOM}`);
  expect((await adm.put('/api/admin/configuracoes').send({ escola: 'X' })).status).toBe(403);
});

test('troca de senha incrementa token_version e invalida sessões', async () => {
  const ag = await logado(`profB@${DOM}`);
  const outro = await logado(`profB@${DOM}`);
  let r = await ag
    .post('/conta/senha')
    .type('form')
    .send({ _csrf: ag.csrf, senha_atual: SENHA, senha: 'NovaSenha99', confirmar_senha: 'NovaSenha99' });
  expect(r.status).toBe(302);
  r = await outro.get('/api/estrutura/turmas').set('Accept', 'application/json');
  expect(r.status).toBe(401);
  expect((await ag.get('/api/estrutura/turmas').set('Accept', 'application/json')).status).toBe(200);
});

test('recuperação de senha por token de uso único', async () => {
  const ag = await agente();
  await ag
    .post('/esqueci-senha')
    .type('form')
    .send({ _csrf: ag.csrf, email: `coord@${DOM}` });
  const link = ultimoLink(`coord@${DOM}`, 'redefinir-senha');
  const token = link.searchParams.get('token');
  let r = await ag
    .post('/redefinir-senha')
    .type('form')
    .send({ _csrf: ag.csrf, token, senha: 'Recupera123', confirmar_senha: 'Recupera123' });
  expect(r.status).toBe(302);
  r = await ag
    .post('/redefinir-senha')
    .type('form')
    .send({ _csrf: ag.csrf, token, senha: 'Outra12345', confirmar_senha: 'Outra12345' });
  expect(r.status).toBe(400);
  await logado(`coord@${DOM}`, 'Recupera123');
});

test('admin nativo não pode ser rebaixado; páginas protegidas redirecionam', async () => {
  const adm = await logado(`admin@${DOM}`);
  const r = await enviar(adm, 'put', `/api/admin/usuarios/${base.u.admin.id}`, {
    perfil: 'professor',
    status: 'ativo',
    turmas: [],
  });
  expect(r.status).toBe(403);
  const anon = request(app);
  const p = await anon.get('/painel');
  expect(p.status).toBe(302);
  expect(p.headers.location).toMatch(/^\/login/);
});
