const { Usuario } = require('../models');
const auth = require('../services/auth.service');
const escopoService = require('../services/escopo.service');
const { pode, menuPara } = require('../config/permissions');
const env = require('../config/env');

const COOKIE_BASE = { httpOnly: true, secure: env.isProd, sameSite: 'lax' };

function definirCookiesSessao(res, { access, refresh }) {
  res.cookie('ohv_at', access, { ...COOKIE_BASE, path: '/', maxAge: auth.ACCESS_TTL_S * 1000 });
  if (refresh) {
    res.cookie('ohv_rt', refresh, { ...COOKIE_BASE, path: '/auth/refresh', maxAge: auth.REFRESH_TTL_MS });
    // Indicador sem conteúdo sensível: permite saber, fora de /auth/refresh, que existe sessão renovável.
    res.cookie('ohv_s', '1', { ...COOKIE_BASE, path: '/', maxAge: auth.REFRESH_TTL_MS });
  }
}
function limparCookiesSessao(res) {
  res.clearCookie('ohv_at', { ...COOKIE_BASE, path: '/' });
  res.clearCookie('ohv_rt', { ...COOKIE_BASE, path: '/auth/refresh' });
  res.clearCookie('ohv_s', { ...COOKIE_BASE, path: '/' });
}

const ehApi = (req) =>
  req.originalUrl.startsWith('/api/') || (req.get('accept') || '').includes('application/json');

/** Identifica o usuário (se houver). Não bloqueia. */
async function authenticate(req, res, next) {
  try {
    req.usuario = null;
    req.escopo = null;
    const at = req.cookies?.ohv_at;
    let payload = null;
    if (at) {
      try {
        payload = auth.verificarAccessToken(at);
      } catch (e) {
        req.tokenExpirado = e.name === 'TokenExpiredError';
      }
    }
    if (payload) {
      const u = await Usuario.findByPk(payload.sub);
      if (u && u.status === 'ativo' && u.token_version === payload.tv) {
        req.usuario = u;
        req.escopo = await escopoService.calcular(u);
      }
    }
    if (!req.usuario && req.cookies?.ohv_s) req.podeRenovar = true;
    res.locals.usuario = req.usuario;
    res.locals.pode = (perm) => pode(req.usuario, perm);
    res.locals.menu = req.usuario ? menuPara(req.usuario) : [];
    next();
  } catch (e) {
    next(e);
  }
}

/** Exige usuário autenticado (com renovação transparente via refresh). */
function requireAuth(req, res, next) {
  if (req.usuario) {
    const livre = ['/conta/senha', '/logout'];
    if (req.usuario.trocar_senha && !livre.includes(req.path) && !req.originalUrl.startsWith('/api/conta')) {
      if (ehApi(req))
        return res
          .status(403)
          .json({ erro: 'Troque sua senha antes de continuar.', detalhes: { codigo: 'trocar_senha' } });
      return res.redirect('/conta/senha');
    }
    return next();
  }
  if (ehApi(req)) {
    return res
      .status(401)
      .json({
        erro: 'Sessão expirada ou inexistente.',
        detalhes: { codigo: req.podeRenovar ? 'token_expirado' : 'nao_autenticado' },
      });
  }
  const destino = encodeURIComponent(req.originalUrl);
  if (req.podeRenovar) return res.redirect(`/auth/refresh?next=${destino}`);
  return res.redirect(`/login?next=${destino}`);
}

function redirectSeLogado(req, res, next) {
  if (req.usuario) return res.redirect('/');
  if (req.podeRenovar && req.method === 'GET')
    return res.redirect(`/auth/refresh?next=${encodeURIComponent('/')}`);
  next();
}

module.exports = {
  authenticate,
  requireAuth,
  redirectSeLogado,
  definirCookiesSessao,
  limparCookiesSessao,
  ehApi,
};
