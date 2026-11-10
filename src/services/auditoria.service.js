const { Auditoria, Usuario } = require('../models');
const { Op } = require('sequelize');
const { paginacao, meta } = require('../utils/paginacao');
const { escaparLike } = require('../utils/busca');
const logger = require('../utils/logger');

/** Registra uma ação. Nunca derruba a operação principal se falhar. */
async function registrar(
  { usuarioId = null, acao, entidade = null, entidadeId = null, antes = null, depois = null, ip = null },
  transaction,
) {
  try {
    await Auditoria.create(
      {
        usuario_id: usuarioId,
        acao,
        entidade,
        entidade_id: entidadeId == null ? null : String(entidadeId),
        antes,
        depois,
        ip,
      },
      { transaction },
    );
  } catch (e) {
    logger.error({ err: e }, 'Falha ao registrar auditoria');
  }
}

/** Atalho a partir da requisição. */
function doReq(req) {
  return (dados, transaction) =>
    registrar({ usuarioId: req.usuario?.id ?? null, ip: req.ip, ...dados }, transaction);
}

async function listar(filtros = {}) {
  const where = {};
  if (filtros.usuario_id) where.usuario_id = filtros.usuario_id;
  if (filtros.acao) where.acao = { [Op.iLike]: `${escaparLike(filtros.acao)}%` };
  if (filtros.de || filtros.ate) {
    where.criado_em = {};
    if (filtros.de) where.criado_em[Op.gte] = `${filtros.de} 00:00:00`;
    if (filtros.ate) where.criado_em[Op.lte] = `${filtros.ate} 23:59:59`;
  }
  const pg = paginacao(filtros, 50);
  const { rows, count } = await Auditoria.findAndCountAll({
    where,
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'], paranoid: false }],
    order: [['id', 'DESC']],
    limit: pg.limit,
    offset: pg.offset,
  });
  const acoes = await Auditoria.findAll({
    attributes: ['acao'],
    group: ['acao'],
    order: [['acao', 'ASC']],
    raw: true,
  });
  return { itens: rows, meta: meta(pg, count), acoes: acoes.map((a) => a.acao) };
}

module.exports = { registrar, doReq, listar };
