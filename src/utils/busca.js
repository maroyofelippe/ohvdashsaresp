const { Op, fn, col, where } = require('sequelize');

/** Escapa os curingas do LIKE (\ % _) para o termo ser tratado como texto literal. */
const escaparLike = (t) => String(t).trim().replace(/[\\%_]/g, '\\$&');

/**
 * Condição "contém" sem diferenciar maiúsculas nem acentos (PostgreSQL + extensão unaccent).
 * `colunas`: nomes qualificados pelo alias do model, ex.: ['Usuario.nome', 'Usuario.email'].
 */
function contem(colunas, termo) {
  const padrao = `%${escaparLike(termo)}%`;
  return colunas.map((c) => where(fn('unaccent', col(c)), { [Op.iLike]: fn('unaccent', padrao) }));
}

/** Mantém a última ocorrência de cada chave (PostgreSQL recusa duas linhas iguais no mesmo upsert). */
function ultimaPorChave(linhas, chaveDe) {
  return [...new Map(linhas.map((l) => [chaveDe(l), l])).values()];
}
const chaveResposta = (l) => `${l.aluno_id}:${l.questao_id}:${l.aspecto_id ?? 0}`;

module.exports = { escaparLike, contem, ultimaPorChave, chaveResposta };
