// Recria o banco do ambiente atual: desfaz migrations, limpa o registro de seeders, migra e semeia.
const { execSync } = require('child_process');
const env = require('../src/config/env');

if (env.isProd && !process.argv.includes('--forcar')) {
  console.error('Recusado em produção. Use --forcar se tiver certeza.');
  process.exit(1);
}
const run = (c) => execSync(`npx sequelize-cli ${c}`, { stdio: 'inherit' });
(async () => {
  run('db:migrate:undo:all');
  const { sequelize } = require('../src/models');
  await sequelize.query('DROP TABLE IF EXISTS sequelize_data');
  await sequelize.close();
  run('db:migrate');
  run('db:seed:all');
})();
