const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { ehApi } = require('./authenticate');

function notFound(req, _res, next) {
  next(AppError.notFound('Página não encontrada.'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let mensagem = err.message;
  let detalhes = err.detalhes;
  if (err.code === 'EBADCSRFTOKEN') status = 403;
  if (err.name === 'MulterError') {
    status = 400;
    mensagem = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 5 MB.' : 'Falha no envio do arquivo.';
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    mensagem = 'Já existe um registro com estes dados.';
    detalhes = Object.fromEntries((err.errors || []).map((e) => [e.path, 'Valor já utilizado.']));
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    status = 409;
    mensagem = 'Este registro está em uso e não pode ser removido.';
  }
  if (err.name === 'SequelizeValidationError') {
    status = 400;
    mensagem = 'Dados inválidos.';
    detalhes = Object.fromEntries((err.errors || []).map((e) => [e.path, e.message]));
  }
  if (status >= 500) {
    logger.error({ err, url: req.originalUrl }, 'Erro interno');
    mensagem = 'Ocorreu um erro inesperado. Tente novamente.';
    detalhes = undefined;
  }
  if (res.headersSent) return;
  if (ehApi(req)) return res.status(status).json({ erro: mensagem, detalhes: detalhes || null });
  const pagina = status === 403 ? '403' : status === 404 ? '404' : status >= 500 ? '500' : 'generico';
  res
    .status(status)
    .render(`pages/erros/${pagina}`, {
      titulo: `Erro ${status}`,
      mensagem,
      status,
      layout: req.usuario ? 'layouts/main' : 'layouts/auth',
    });
}

module.exports = { notFound, errorHandler };
