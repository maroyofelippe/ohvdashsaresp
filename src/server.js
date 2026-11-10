process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { sequelize } = require('./models');

(async () => {
  try {
    await sequelize.authenticate();
    logger.info(`Banco ${env.DB_DATABASE} conectado.`);
  } catch (e) {
    logger.error({ err: e }, 'Não foi possível conectar ao PostgreSQL. Verifique o .env e se o banco está no ar.');
    process.exit(1);
  }
  const server = app.listen(env.PORT, () =>
    logger.info(`OHVDashSaresp em ${env.APP_URL} (porta ${env.PORT})`),
  );
  const encerrar = () => {
    server.close(() => sequelize.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);
})();
