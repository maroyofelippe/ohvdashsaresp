const crypto = require('crypto');
const { Op } = require('sequelize');
const { Usuario, ProfessorTurma, Turma, Serie, AnoLetivo, RefreshToken, sequelize } = require('../models');
const { contem } = require('../utils/busca');
const AppError = require('../utils/AppError');
const authService = require('./auth.service');
const email = require('./email.service');
const { paginacao, meta } = require('../utils/paginacao');

async function listar(filtros = {}) {
  const where = {};
  if (filtros.status) where.status = filtros.status;
  if (filtros.perfil) where.perfil = filtros.perfil;
  if (filtros.busca) {
    where[Op.or] = contem(['Usuario.nome', 'Usuario.email'], filtros.busca);
  }
  const pg = paginacao(filtros, 50);
  const { rows, count } = await Usuario.findAndCountAll({
    where,
    include: [
      {
        model: ProfessorTurma,
        as: 'vinculos',
        include: [
          {
            model: Turma,
            as: 'turma',
            include: [
              { model: Serie, as: 'serie' },
              { model: AnoLetivo, as: 'anoLetivo' },
            ],
          },
        ],
      },
    ],
    order: [
      ['status', 'ASC'],
      ['nome', 'ASC'],
    ],
    limit: pg.limit,
    offset: pg.offset,
    distinct: true,
  });
  return {
    itens: rows.map((u) => ({
      ...u.toJSON(),
      vinculos: (u.vinculos || [])
        .filter((v) => v.turma)
        .map((v) => ({
          turma_id: v.turma_id,
          status: v.status,
          nome: `${v.turma.serie.nome} ${v.turma.letra} · ${v.turma.anoLetivo.ano}`,
        })),
    })),
    meta: meta(pg, count),
  };
}

const contarPendentes = () => Usuario.count({ where: { status: 'pendente' } });

async function aprovar(id, audit) {
  const u = await Usuario.findByPk(id);
  if (!u) throw AppError.notFound();
  if (u.status !== 'pendente') throw AppError.conflict('Esta conta não está aguardando aprovação.');
  await sequelize.transaction(async (t) => {
    await u.update({ status: 'ativo' }, { transaction: t });
    await ProfessorTurma.update({ status: 'aprovado' }, { where: { usuario_id: id }, transaction: t });
    await audit(
      {
        acao: 'usuario.aprovar',
        entidade: 'usuarios',
        entidadeId: id,
        depois: { status: 'ativo', perfil: u.perfil },
      },
      t,
    );
  });
  await email.contaAprovada(u);
  return u;
}

async function atualizar(id, { perfil, status, turmas }, audit, ator) {
  const u = await Usuario.findByPk(id, { include: [{ model: ProfessorTurma, as: 'vinculos' }] });
  if (!u) throw AppError.notFound();
  if (u.nativo && (perfil !== 'admin' || status !== 'ativo'))
    throw AppError.forbidden('O administrador nativo não pode ser rebaixado nem desativado.');
  if (u.id === ator.id && status !== 'ativo')
    throw AppError.badRequest('Você não pode desativar a própria conta.');
  const validas = turmas.length
    ? (await Turma.findAll({ where: { id: turmas }, attributes: ['id'] })).map((t) => t.id)
    : [];
  const antes = { perfil: u.perfil, status: u.status, turmas: u.vinculos.map((v) => v.turma_id) };
  await sequelize.transaction(async (t) => {
    const mudouAcesso = perfil !== u.perfil || status !== u.status;
    await u.update(
      { perfil, status, token_version: mudouAcesso ? u.token_version + 1 : u.token_version },
      { transaction: t },
    );
    if (mudouAcesso && status !== 'ativo')
      await RefreshToken.update(
        { revogado_em: new Date() },
        { where: { usuario_id: id, revogado_em: null }, transaction: t },
      );
    await ProfessorTurma.destroy({
      where: { usuario_id: id, turma_id: { [Op.notIn]: validas.concat(0) } },
      transaction: t,
    });
    if (perfil === 'professor') {
      for (const tid of validas) {
        await ProfessorTurma.upsert(
          { usuario_id: id, turma_id: tid, status: status === 'ativo' ? 'aprovado' : 'pendente' },
          { transaction: t },
        );
      }
    } else {
      await ProfessorTurma.destroy({ where: { usuario_id: id }, transaction: t });
    }
    await audit(
      {
        acao: 'usuario.editar',
        entidade: 'usuarios',
        entidadeId: id,
        antes,
        depois: { perfil, status, turmas: perfil === 'professor' ? validas : [] },
      },
      t,
    );
  });
  return u;
}

/** Gera senha temporária (exibida uma única vez ao admin); exige troca no próximo login. */
async function redefinirSenha(id, audit) {
  const u = await Usuario.findByPk(id);
  if (!u) throw AppError.notFound();
  const temporaria = `Ohv${crypto.randomInt(100000, 999999)}${crypto.randomBytes(2).toString('hex')}`;
  await sequelize.transaction(async (t) => {
    await u.update(
      {
        senha_hash: await authService.hashSenha(temporaria),
        trocar_senha: true,
        token_version: u.token_version + 1,
        falhas_login: 0,
        bloqueado_ate: null,
      },
      { transaction: t },
    );
    await RefreshToken.update(
      { revogado_em: new Date() },
      { where: { usuario_id: id, revogado_em: null }, transaction: t },
    );
    await audit({ acao: 'usuario.senha_redefinida_admin', entidade: 'usuarios', entidadeId: id }, t);
  });
  return { temporaria };
}

async function excluir(id, audit, ator) {
  const u = await Usuario.findByPk(id);
  if (!u) throw AppError.notFound();
  if (u.nativo) throw AppError.forbidden('O administrador nativo não pode ser excluído.');
  if (u.id === ator.id) throw AppError.badRequest('Você não pode excluir a própria conta.');
  await sequelize.transaction(async (t) => {
    await RefreshToken.update(
      { revogado_em: new Date() },
      { where: { usuario_id: id, revogado_em: null }, transaction: t },
    );
    await u.update({ status: 'inativo', token_version: u.token_version + 1 }, { transaction: t });
    await u.destroy({ transaction: t });
    await audit({ acao: 'usuario.excluir', entidade: 'usuarios', entidadeId: id, antes: u.toJSON() }, t);
  });
}

module.exports = { listar, contarPendentes, aprovar, atualizar, redefinirSenha, excluir };
