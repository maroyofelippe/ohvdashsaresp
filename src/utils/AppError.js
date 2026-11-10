class AppError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
  static badRequest(m, d) {
    return new AppError(400, m, d);
  }
  static unauthorized(m = 'Não autenticado.') {
    return new AppError(401, m);
  }
  static forbidden(m = 'Você não tem permissão para esta ação.') {
    return new AppError(403, m);
  }
  static notFound(m = 'Registro não encontrado.') {
    return new AppError(404, m);
  }
  static conflict(m, d) {
    return new AppError(409, m, d);
  }
}
module.exports = AppError;
