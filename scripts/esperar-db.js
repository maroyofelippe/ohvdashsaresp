// Aguarda o PostgreSQL aceitar conexões (até ~90 s). Usado pelo docker-entrypoint.sh.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { sslConfig } = require('../src/config/db-ssl');

const alvo = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslConfig(),
};
const LIMITE = Number(process.env.DB_WAIT_SECONDS || 90);

(async () => {
  const inicio = Date.now();
  for (;;) {
    const c = new Client({ ...alvo, connectionTimeoutMillis: 3000 });
    try {
      await c.connect();
      await c.query('SELECT 1');
      await c.end();
      console.log(`[esperar-db] PostgreSQL disponível em ${alvo.host}:${alvo.port}.`);
      return;
    } catch (e) {
      await c.end().catch(() => {});
      if ((Date.now() - inicio) / 1000 > LIMITE) {
        console.error(`[esperar-db] PostgreSQL não respondeu em ${LIMITE}s: ${e.message}`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
})();
