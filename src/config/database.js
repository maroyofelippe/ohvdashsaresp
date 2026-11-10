const { Sequelize } = require('sequelize');
const pg = require('pg');
const env = require('./env');
const cfg = require('./sequelize-cli')[env.NODE_ENV];
const logger = require('../utils/logger');

// O driver devolve BIGINT (COUNT, ids) e NUMERIC como texto; o código espera números.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

const sequelize = new Sequelize(cfg.database, cfg.username, cfg.password, {
  ...cfg,
  logging: env.LOG_LEVEL === 'debug' ? (sql) => logger.debug(sql) : false,
});

module.exports = sequelize;
