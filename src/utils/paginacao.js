function paginacao(query, porPaginaPadrao = 25) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const porPagina = Math.min(200, Math.max(5, parseInt(query.porPagina, 10) || porPaginaPadrao));
  return { pagina, porPagina, limit: porPagina, offset: (pagina - 1) * porPagina };
}
function meta({ pagina, porPagina }, total) {
  return { pagina, porPagina, total, paginas: Math.max(1, Math.ceil(total / porPagina)) };
}
module.exports = { paginacao, meta };
