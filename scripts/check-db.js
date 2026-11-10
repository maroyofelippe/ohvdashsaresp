/**
 * Diagnóstico da conexão com o PostgreSQL (npm run db:check).
 * Mostra versão, codificação, fuso e se as tabelas/migrations/seeders já existem.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { sslConfig } = require('../src/config/db-ssl');

const MIGRATIONS = 5;

(async () => {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'OHVDashSaresp',
    ssl: sslConfig(),
  };
  console.log(`Conectando em ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}…`);
  const con = new Client(cfg);
  try {
    await con.connect();
  } catch (e) {
    console.error(`✖ Falha: ${e.message}`);
    const dicas = {
      ECONNREFUSED: 'O serviço PostgreSQL não está em execução ou a porta está errada.',
      '28P01': 'Usuário ou senha incorretos. Rode "npm run db:setup" para criar o usuário da aplicação.',
      '3D000': 'O banco não existe. Rode "npm run db:setup".',
    };
    if (dicas[e.code]) console.error(`  Dica: ${dicas[e.code]}`);
    process.exit(1);
  }
  const q = async (sql) => (await con.query(sql)).rows;
  const [s] = await q(
    "SELECT version() AS versao, current_setting('server_version_num')::int AS num, pg_encoding_to_char(encoding) AS codificacao, current_setting('TimeZone') AS fuso, now() AS agora FROM pg_database WHERE datname = current_database()",
  );
  const [{ n: tabs }] = await q(
    'SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema()',
  );
  const [{ n: unaccent }] = await q("SELECT COUNT(*)::int AS n FROM pg_extension WHERE extname = 'unaccent'");
  let migr = 0;
  let usuarios = '–';
  try {
    migr = (await q('SELECT COUNT(*)::int AS n FROM sequelize_meta'))[0].n;
    usuarios = (await q('SELECT COUNT(*)::int AS n FROM usuarios'))[0].n;
  } catch {
    /* ainda sem migrations */
  }
  await con.end();
  const ok = (c) => (c ? '✔' : '✖');
  console.log(`${ok(s.num >= 140000)} ${s.versao.split(' on ')[0]}`);
  console.log(`${ok(s.codificacao === 'UTF8')} codificação: ${s.codificacao}`);
  console.log(`✔ fuso da sessão: ${s.fuso} (agora: ${s.agora.toISOString()})`);
  console.log(`${ok(unaccent)} extensão unaccent (busca sem acentos)`);
  console.log(
    `${ok(migr >= MIGRATIONS)} migrations aplicadas: ${migr}/${MIGRATIONS} · tabelas: ${tabs} · usuários: ${usuarios}`,
  );
  if (migr < MIGRATIONS) console.log('  → rode: npm run db:migrate && npm run db:seed');
})();
