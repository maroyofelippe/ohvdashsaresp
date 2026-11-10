const { pode } = require('../config/permissions');
const AppError = require('../utils/AppError');

/** Exige TODAS as permissões informadas (matriz em config/permissions.js). */
function authorize(...perms) {
  return (req, _res, next) => {
    if (!req.usuario) return next(AppError.unauthorized());
    for (const p of perms) if (!pode(req.usuario, p)) return next(AppError.forbidden());
    next();
  };
}
module.exports = authorize;
