// Opções de SSL/TLS do PostgreSQL (obrigatório em provedores como o Aiven).
// Lê DB_SSL (true/false) e DB_SSL_CA (caminho do certificado da CA; também aceita DB_CA_PATH).
// Retorna `undefined` quando SSL está desligado — pode ser espalhado direto nas configs do driver.
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');

function sslConfig(e = process.env) {
  if (!['1', 'true', 'sim', 'yes'].includes(String(e.DB_SSL || '').toLowerCase())) return undefined;
  const caInformado = e.DB_SSL_CA || e.DB_CA_PATH;
  if (!caInformado) return { rejectUnauthorized: true };
  // aceita barras invertidas do Windows no .env e caminhos relativos à raiz do projeto
  const caminho = path.resolve(RAIZ, caInformado.replace(/\\/g, '/'));
  if (!fs.existsSync(caminho)) {
    throw new Error(`DB_SSL_CA aponta para um arquivo inexistente: ${caminho}`);
  }
  return { ca: fs.readFileSync(caminho, 'utf8'), rejectUnauthorized: true };
}

module.exports = { sslConfig };
