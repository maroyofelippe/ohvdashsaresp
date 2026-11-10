const crypto = require('crypto');
const env = require('../config/env');

const gerarToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const hashToken = (token) =>
  crypto.createHmac('sha256', env.REFRESH_SECRET).update(String(token)).digest('hex');
module.exports = { gerarToken, hashToken, uuid: () => crypto.randomUUID() };
