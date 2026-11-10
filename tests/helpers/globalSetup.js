// Recria o schema do banco de teste a partir das migrations (nunca sync()).
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const opts = {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'pipe',
  };
  execSync('npx sequelize-cli db:migrate:undo:all', opts);
  execSync('npx sequelize-cli db:migrate', opts);
};
