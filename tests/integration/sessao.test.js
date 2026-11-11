const { semear, logado, enviar, db, DOM } = require('../helpers/app');

let base;
beforeAll(async () => {
  base = await semear();
});
afterAll(() => db.sequelize.close());

const haMinutos = (m) => new Date(Date.now() - m * 60 * 1000);
const definirAtividade = (usuario, quando) =>
  db.Usuario.update({ ultima_atividade: quando }, { where: { id: usuario.id } });

test('login e sinal de atividade marcam o usuário como online no painel do admin', async () => {
  const prof = await logado(`profA@${DOM}`);
  await base.u.profA.reload();
  expect(base.u.profA.ultima_atividade).not.toBeNull();

  await definirAtividade(base.u.profA, haMinutos(9));
  const admin = await logado(`admin@${DOM}`);
  let html = (await admin.get('/admin').set('Accept', 'text/html')).text;
  expect(html).toMatch(/farol on/);

  // sem sinal além do limite de "online": fica offline (mas a sessão ainda vale)
  await definirAtividade(base.u.profA, haMinutos(15));
  html = (await admin.get('/admin').set('Accept', 'text/html')).text;
  expect(html).toMatch(/aria-label="Offline"/);
  expect((await prof.get('/api/painel/opcoes').set('Accept', 'application/json')).status).toBe(200);

  // o sinal do navegador reativa
  const r = await enviar(prof, 'post', '/api/sessao/atividade');
  expect(r.status).toBe(200);
  html = (await admin.get('/admin').set('Accept', 'text/html')).text;
  expect(html).toMatch(/aria-label="Online"/);
});

test('sem uso por mais de 30 min a sessão deixa de valer (acesso e renovação)', async () => {
  const prof = await logado(`profB@${DOM}`);
  expect((await prof.get('/api/painel/opcoes').set('Accept', 'application/json')).status).toBe(200);

  await definirAtividade(base.u.profB, haMinutos(31));
  const r = await prof.get('/api/painel/opcoes').set('Accept', 'application/json');
  expect(r.status).toBe(401);
  // a renovação também é recusada: é preciso entrar de novo
  const renovar = await prof
    .post('/auth/refresh')
    .set('x-csrf-token', prof.csrf)
    .set('Accept', 'application/json');
  expect(renovar.status).toBe(401);
});

test('sair marca o usuário como offline', async () => {
  const prof = await logado(`profC@${DOM}`);
  await base.u.profC.reload();
  expect(base.u.profC.ultima_atividade).not.toBeNull();
  const r = await prof.post('/auth/refresh/logout').set('x-csrf-token', prof.csrf);
  expect(r.status).toBe(302);
  await base.u.profC.reload();
  expect(base.u.profC.ultima_atividade).toBeNull();
});
