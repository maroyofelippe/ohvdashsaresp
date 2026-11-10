// Configuração usada pelo sequelize-cli (migrations/seeders) e pela aplicação.
const env = require('./env');
const { sslConfig } = require('./db-ssl');

const ssl = sslConfig();

const base = {
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'postgres',
  timezone: '-03:00',
  logging: false,
  define: { underscored: true },
  dialectOptions: ssl ? { ssl } : {},
  migrationStorageTableName: 'sequelize_meta',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_data',
};

module.exports = {
  development: { ...base, database: env.DB_NAME },
  test: { ...base, database: env.DB_NAME_TEST },
  production: { ...base, database: env.DB_NAME, pool: { max: 10, min: 0, idle: 10000 } },
};
