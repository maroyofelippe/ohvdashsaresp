const AppError = require('../utils/AppError');

/** Converte erros do zod em { campo: mensagem }. */
function errosZod(err) {
  const det = {};
  for (const i of err.issues) {
    const k = i.path.join('.') || '_';
    if (!det[k]) det[k] = i.message;
  }
  return det;
}

/** Valida req[origem] com o schema; resultado em req.dados. */
function validate(schema, origem = 'body') {
  return (req, _res, next) => {
    const r = schema.safeParse(req[origem]);
    if (!r.success) return next(AppError.badRequest('Verifique os campos destacados.', errosZod(r.error)));
    req.dados = r.data;
    next();
  };
}

function parse(schema, dados) {
  const r = schema.safeParse(dados);
  if (!r.success) throw AppError.badRequest('Verifique os campos destacados.', errosZod(r.error));
  return r.data;
}

module.exports = { validate, parse, errosZod };
