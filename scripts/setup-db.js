/**
 * Prepara o PostgreSQL (14 ou superior; alvo: 18) para o OHVDashSaresp:
 *   1. verifica a versão do servidor;
 *   2. cria o usuário (role) da aplicação — DB_USER/DB_PASSWORD do .env — e os bancos, com ele como dono;
 *   3. habilita a extensão unaccent (busca sem acentos) em cada banco;
 *   4. com --completo, executa as migrations e os seeders.
 *
 * Uso:  npm run db:setup              (pede o usuário/senha de administrador, ex.: postgres)
 *       npm run setup                 (o mesmo + migrations + seeders)
 * Sem perguntas: defina DB_ADMIN_USER e DB_ADMIN_PASSWORD no ambiente.
 * Se o provedor não permite criar bancos/usuários, crie-os pelo painel dele e rode apenas:
 *       npm run db:migrate && npm run db:seed
 */
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { sslConfig } = require('../src/config/db-ssl');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  banco: process.env.DB_NAME || 'OHVDashSaresp',
  bancoTeste: process.env.DB_NAME_TEST || '',
  usuario: process.env.DB_USER || 'ohv',
  senha: process.env.DB_PASSWORD || '',
};

function perguntar(texto, { oculto = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      // Não ecoa a senha digitada
      rl._writeToOutput = (s) => {
        if (s.includes(texto)) rl.output.write(s);
        else rl.output.write('');
      };
    }
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write('\n');
      resolve(r.trim());
    });
  });
}

const ident = (s) => {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(s)) throw new Error(`Nome inválido: "${s}" (use letras, números e _).`);
  return `"${s}"`;
};

(async () => {
  console.log(`\nOHVDashSaresp — preparação do PostgreSQL (${cfg.host}:${cfg.port})\n`);
  if (!process.env.JWT_SECRET)
    console.log('Aviso: .env não encontrado ou incompleto. Copie .env.example para .env antes de continuar.\n');
  if (!cfg.senha) {
    console.error('Defina DB_PASSWORD no .env (senha que será criada para o usuário da aplicação).');
    process.exit(1);
  }
  const adminUser =
    process.env.DB_ADMIN_USER ||
    (await perguntar('Usuário administrador do PostgreSQL [postgres]: ')) ||
    'postgres';
  const adminSenha =
    process.env.DB_ADMIN_PASSWORD ?? (await perguntar(`Senha de ${adminUser}: `, { oculto: true }));
  const conectar = async (user, password, database) => {
    const c = new Client({ host: cfg.host, port: cfg.port, user, password, database, ssl: sslConfig() });
    await c.connect();
    return c;
  };

  let admin;
  try {
    admin = await conectar(adminUser, adminSenha, process.env.DB_ADMIN_DATABASE || 'postgres');
  } catch (e) {
    console.error(`\nNão foi possível conectar ao PostgreSQL: ${e.message}`);
    console.error('Verifique se o serviço está em execução, a porta, a senha do administrador e DB_ADMIN_DATABASE');
    console.error('(banco de manutenção usado para criar os demais: "postgres" por padrão; no Aiven é "defaultdb").');
    process.exit(1);
  }

  const {
    rows: [{ v, n }],
  } = await admin.query("SELECT version() AS v, current_setting('server_version_num')::int AS n");
  console.log(`${v.split(' on ')[0]} encontrado.`);
  if (n < 140000) {
    console.error('É necessário PostgreSQL 14 ou superior (alvo: 18).');
    process.exit(1);
  }

  const bancos = [...new Set([cfg.banco, cfg.bancoTeste].filter(Boolean))];
  const criarRole = cfg.usuario !== adminUser;
  if (criarRole) {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [cfg.usuario]);
    await admin.query(
      `${rowCount ? 'ALTER' : 'CREATE'} ROLE ${ident(cfg.usuario)} WITH LOGIN PASSWORD ${admin.escapeLiteral(cfg.senha)}`,
    );
    console.log(`✔ Usuário ${cfg.usuario} ${rowCount ? 'atualizado' : 'criado'}.`);
  }
  for (const b of bancos) {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [b]);
    const dono = criarRole ? ` OWNER ${ident(cfg.usuario)}` : '';
    if (!rowCount) await admin.query(`CREATE DATABASE ${ident(b)} ENCODING 'UTF8' TEMPLATE template0${dono}`);
    else if (criarRole) await admin.query(`ALTER DATABASE ${ident(b)} OWNER TO ${ident(cfg.usuario)}`);
    console.log(`✔ Banco ${b} pronto.`);
    const doBanco = await conectar(adminUser, adminSenha, b);
    await doBanco.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await doBanco.end();
  }
  await admin.end();

  // Testa a conexão com as credenciais da aplicação
  try {
    const app = await conectar(cfg.usuario, cfg.senha, cfg.banco);
    await app.end();
    console.log(`✔ Conexão da aplicação (${cfg.usuario}) testada com sucesso.`);
  } catch (e) {
    console.error(`✖ A aplicação não conseguiu conectar com ${cfg.usuario}: ${e.message}`);
    process.exit(1);
  }

  if (process.argv.includes('--completo')) {
    const run = (c) =>
      execSync(`npx sequelize-cli ${c}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    console.log('\nExecutando migrations e seeders…');
    run('db:migrate');
    run('db:seed:all');
  }
  console.log(
    `\nPronto! ${process.argv.includes('--completo') ? 'Inicie com: npm run dev' : 'Agora rode: npm run db:migrate && npm run db:seed'}\n`,
  );
})().catch((e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});
