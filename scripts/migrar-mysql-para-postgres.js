/**
 * Copia os DADOS de um banco MySQL (esquema criado por estas migrations) para o PostgreSQL de destino.
 *
 * Pré-requisitos:
 *   1. No PostgreSQL de destino: `npm run db:migrate` (NÃO rode os seeders — o destino precisa estar vazio).
 *   2. Variáveis de origem no ambiente (ou .env): MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD,
 *      MYSQL_DATABASE. O destino usa as DB_* de sempre.
 *
 * Uso:
 *   node scripts/migrar-mysql-para-postgres.js            → só confere e mostra o que seria copiado
 *   node scripts/migrar-mysql-para-postgres.js --executar → copia (uma única transação: tudo ou nada)
 *
 * Detalhes: respeita a ordem das chaves estrangeiras, ignora colunas geradas, converte JSON/booleanos,
 * resolve chaves estrangeiras para a própria tabela (questões-filhas) em duas passadas, acerta as
 * sequências (próximos ids) e compara as contagens ao final.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { sslConfig } = require('../src/config/db-ssl');

const executar = process.argv.includes('--executar');
const LOTE_PARAMS = 30000;

const origemCfg = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};
const destinoCfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'OHVDashSaresp',
  ssl: sslConfig(),
};
const q = (s) => `"${s.replace(/"/g, '""')}"`;

/** Ordena as tabelas para que as referenciadas venham antes das que referenciam. */
function ordenar(tabelas, arestas) {
  const dep = new Map(tabelas.map((t) => [t, new Set()]));
  for (const [filha, pai] of arestas) if (filha !== pai) dep.get(filha)?.add(pai);
  const ordem = [];
  const feitos = new Set();
  while (ordem.length < tabelas.length) {
    const pronta = tabelas.find((t) => !feitos.has(t) && [...dep.get(t)].every((p) => feitos.has(p)));
    if (!pronta) throw new Error('Dependência circular entre tabelas; não é possível ordenar a carga.');
    feitos.add(pronta);
    ordem.push(pronta);
  }
  return ordem;
}

(async () => {
  if (!origemCfg.user || !origemCfg.database) {
    console.error('Defina MYSQL_USER, MYSQL_PASSWORD e MYSQL_DATABASE (e, se preciso, MYSQL_HOST/MYSQL_PORT).');
    process.exit(1);
  }
  const my = await mysql.createConnection({
    ...origemCfg,
    timezone: '-03:00', // o sistema grava DATETIME em horário de Brasília
    dateStrings: ['DATE'], // DATE puro vira 'aaaa-mm-dd' (evita deslocar o dia por fuso)
    decimalNumbers: true,
  });
  const pg = new Client(destinoCfg);
  await pg.connect();
  console.log(`Origem : MySQL ${origemCfg.user}@${origemCfg.host}:${origemCfg.port}/${origemCfg.database}`);
  console.log(`Destino: PostgreSQL ${destinoCfg.user}@${destinoCfg.host}:${destinoCfg.port}/${destinoCfg.database}\n`);

  // ---- esquema do destino ----
  const { rows: tabs } = await pg.query(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'sequelize_%'`,
  );
  const tabelas = tabs.map((r) => r.t);
  if (!tabelas.length) throw new Error('O destino não tem tabelas. Rode "npm run db:migrate" primeiro.');
  const { rows: cols } = await pg.query(
    `SELECT table_name AS t, column_name AS c, data_type AS tipo
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND is_generated = 'NEVER' ORDER BY table_name, ordinal_position`,
  );
  const colunas = new Map();
  for (const { t, c, tipo } of cols) {
    if (!colunas.has(t)) colunas.set(t, []);
    colunas.get(t).push({ nome: c, json: tipo === 'json' || tipo === 'jsonb' });
  }
  const { rows: fks } = await pg.query(
    `SELECT cl.relname AS filha, pl.relname AS pai, a.attname AS coluna
       FROM pg_constraint k
       JOIN pg_class cl ON cl.oid = k.conrelid
       JOIN pg_class pl ON pl.oid = k.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = current_schema()
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.contype = 'f'`,
  );
  const ordem = ordenar(
    tabelas,
    fks.map((f) => [f.filha, f.pai]),
  );
  const autoRef = new Map(); // tabela -> colunas que referenciam a própria tabela
  for (const f of fks)
    if (f.filha === f.pai) autoRef.set(f.filha, [...(autoRef.get(f.filha) || []), f.coluna]);

  // ---- conferência prévia ----
  const plano = [];
  for (const t of ordem) {
    let origem = null;
    try {
      [[{ n: origem }]] = await my.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    } catch (e) {
      throw new Error(`Tabela "${t}" não existe no MySQL de origem (${e.message}).`);
    }
    const {
      rows: [{ n: destino }],
    } = await pg.query(`SELECT COUNT(*)::int AS n FROM ${q(t)}`);
    plano.push({ t, origem: Number(origem), destino });
  }
  console.table(plano.map((p) => ({ tabela: p.t, 'linhas no MySQL': p.origem, 'linhas no PostgreSQL': p.destino })));
  if (plano.some((p) => p.destino > 0))
    throw new Error('O destino já tem dados. Use um banco recém-migrado, sem seeders (ou rode "npm run db:reset" antes).');
  if (!executar) {
    console.log('Simulação concluída. Rode novamente com --executar para copiar os dados.');
    await my.end();
    await pg.end();
    return;
  }

  // ---- carga ----
  await pg.query('BEGIN');
  try {
    for (const { t } of plano) {
      const cs = colunas.get(t);
      const nomes = cs.map((c) => c.nome);
      const refs = autoRef.get(t) || [];
      const temId = nomes.includes('id');
      const lote = Math.max(1, Math.floor(LOTE_PARAMS / nomes.length));
      const diferidos = []; // [id, coluna, valor] para a segunda passada
      let ultimoId = 0;
      let copiadas = 0;
      for (;;) {
        const sql = temId
          ? `SELECT ${nomes.map((n) => `\`${n}\``).join(',')} FROM \`${t}\` WHERE id > ? ORDER BY id LIMIT ${lote}`
          : `SELECT ${nomes.map((n) => `\`${n}\``).join(',')} FROM \`${t}\``;
        const [linhas] = await my.query(sql, temId ? [ultimoId] : []);
        if (!linhas.length) break;
        const valores = [];
        const marcas = linhas.map((l, i) => {
          const ps = nomes.map((n, j) => {
            let v = l[n];
            if (refs.includes(n) && v != null) {
              diferidos.push([l.id, n, v]);
              v = null;
            }
            if (v != null && cs[j].json && typeof v !== 'string') v = JSON.stringify(v);
            valores.push(v);
            return `$${i * nomes.length + j + 1}`;
          });
          return `(${ps.join(',')})`;
        });
        await pg.query(`INSERT INTO ${q(t)} (${nomes.map(q).join(',')}) VALUES ${marcas.join(',')}`, valores);
        copiadas += linhas.length;
        if (!temId) break;
        ultimoId = linhas[linhas.length - 1].id;
      }
      for (const col of refs) {
        const dados = diferidos.filter((d) => d[1] === col);
        for (let i = 0; i < dados.length; i += 5000) {
          const parte = dados.slice(i, i + 5000);
          const ps = [];
          const marcas = parte.map((d, k) => {
            ps.push(d[0], d[2]);
            return `($${k * 2 + 1}::bigint, $${k * 2 + 2}::bigint)`;
          });
          await pg.query(
            `UPDATE ${q(t)} x SET ${q(col)} = v.ref FROM (VALUES ${marcas.join(',')}) AS v(id, ref) WHERE x.id = v.id`,
            ps,
          );
        }
      }
      console.log(`✔ ${t}: ${copiadas} linha(s)`);
    }

    // próximos ids das sequências (SERIAL) logo acima do maior id copiado
    for (const { t } of plano) {
      if (!colunas.get(t).some((c) => c.nome === 'id')) continue;
      const {
        rows: [{ seq }],
      } = await pg.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [q(t)]);
      if (seq) await pg.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${q(t)}), 1), (SELECT MAX(id) IS NOT NULL FROM ${q(t)}))`, [seq]);
    }

    // conferência final
    const divergentes = [];
    for (const p of plano) {
      const {
        rows: [{ n }],
      } = await pg.query(`SELECT COUNT(*)::int AS n FROM ${q(p.t)}`);
      if (n !== p.origem) divergentes.push(`${p.t}: MySQL ${p.origem} ≠ PostgreSQL ${n}`);
    }
    if (divergentes.length) throw new Error(`Contagens divergentes:\n  ${divergentes.join('\n  ')}`);
    await pg.query('COMMIT');
    console.log('\nMigração concluída: as contagens de todas as tabelas conferem.');
  } catch (e) {
    await pg.query('ROLLBACK');
    console.error(`\n✖ Nada foi gravado no PostgreSQL (rollback). Motivo: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await my.end();
    await pg.end();
  }
})().catch((e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});
