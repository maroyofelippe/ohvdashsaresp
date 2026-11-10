const crypto = require('crypto');
const { doubleCsrf } = require('csrf-csrf');
const env = require('../config/env');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req) => req.cookies?.ohv_sid || '',
  cookieName: env.isProd ? '__Host-ohv.x-csrf' : 'ohv.x-csrf',
  cookieOptions: { sameSite: 'lax', path: '/', secure: env.isProd, httpOnly: true },
  size: 32,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body?._csrf,
  errorConfig: {
    statusCode: 403,
    message: 'Token de segurança inválido. Recarregue a página e tente novamente.',
    code: 'EBADCSRFTOKEN',
  },
});

/** Garante um identificador anônimo por navegador (vincula o token CSRF). */
function identificadorNavegador(req, res, next) {
  if (!req.cookies.ohv_sid) {
    const sid = crypto.randomBytes(16).toString('hex');
    req.cookies.ohv_sid = sid;
    res.cookie('ohv_sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      path: '/',
      maxAge: 365 * 24 * 3600 * 1000,
    });
  }
  next();
}

/** Disponibiliza o token nas views (formulários e <meta>). */
function tokenNasViews(req, res, next) {
  res.locals.csrfToken = generateToken(req, res);
  next();
}

module.exports = { generateToken, doubleCsrfProtection, identificadorNavegador, tokenNasViews };
