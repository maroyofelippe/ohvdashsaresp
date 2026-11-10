const {
  AnoLetivo,
  Serie,
  Turma,
  Aluno,
  ProfessorTurma,
  Usuario,
  Avaliacao,
  sequelize,
} = require('../models');
const { fn, col } = require('sequelize');
const AppError = require('../utils/AppError');

async function listarAnos() {
  return AnoLetivo.findAll({ order: [['ano', 'DESC']] });
}
async function listarSeries() {
  return Serie.findAll();
}

/** Turmas com contagem de alunos (sem N+1), opcionalmente restritas a ids. */
async function listarTurmas({ ids = null, anoLetivoId, serieId } = {}) {
  const where = {};
  if (anoLetivoId) where.ano_letivo_id = anoLetivoId;
  if (serieId) where.serie_id = serieId;
  const turmas = await Turma.scope({ method: ['ids', ids] }).findAll({
    where,
    include: [
      { model: AnoLetivo, as: 'anoLetivo' },
      { model: Serie, as: 'serie' },
    ],
    order: [
      [{ model: AnoLetivo, as: 'anoLetivo' }, 'ano', 'DESC'],
      [{ model: Serie, as: 'serie' }, 'ordem', 'ASC'],
      ['letra', 'ASC'],
    ],
  });
  const contagens = await Aluno.findAll({
    attributes: ['turma_id', [fn('COUNT', col('id')), 'total']],
    where: { turma_id: turmas.map((t) => t.id).concat(0) },
    group: ['turma_id'],
    raw: true,
  });
  const profs = await ProfessorTurma.findAll({
    where: { turma_id: turmas.map((t) => t.id).concat(0), status: 'aprovado' },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome'] }],
  });
  const mapa = Object.fromEntries(contagens.map((c) => [c.turma_id, Number(c.total)]));
  return turmas.map((t) => ({
    id: t.id,
    letra: t.letra,
    periodo: t.periodo,
    ano_letivo_id: t.ano_letivo_id,
    serie_id: t.serie_id,
    ano: t.anoLetivo.ano,
    anoAtivo: t.anoLetivo.ativo,
    serie: t.serie.nome,
    nome: `${t.serie.nome} ${t.letra}`,
    nomeCompleto: `${t.serie.nome} ${t.letra} · ${t.anoLetivo.ano}`,
    alunos: mapa[t.id] || 0,
    professores: profs.filter((p) => p.turma_id === t.id && p.usuario).map((p) => p.usuario.nome),
  }));
}

async function salvarAno(id, dados, audit) {
  return sequelize.transaction(async (t) => {
    let reg;
    if (id) {
      reg = await AnoLetivo.findByPk(id, { transaction: t });
      if (!reg) throw AppError.notFound();
      const antes = reg.toJSON();
      await reg.update(dados, { transaction: t });
      await audit(
        { acao: 'ano_letivo.editar', entidade: 'anos_letivos', entidadeId: id, antes, depois: reg.toJSON() },
        t,
      );
    } else {
      reg = await AnoLetivo.create(dados, { transaction: t });
      await audit(
        { acao: 'ano_letivo.criar', entidade: 'anos_letivos', entidadeId: reg.id, depois: reg.toJSON() },
        t,
      );
    }
    return reg;
  });
}
async function excluirAno(id, audit) {
  const reg = await AnoLetivo.findByPk(id);
  if (!reg) throw AppError.notFound();
  if (
    (await Turma.count({ where: { ano_letivo_id: id } })) ||
    (await Avaliacao.count({ where: { ano_letivo_id: id }, paranoid: false }))
  ) {
    throw AppError.conflict(
      'Este ano letivo possui turmas ou avaliações e não pode ser excluído. Desative-o.',
    );
  }
  await reg.destroy();
  await audit({ acao: 'ano_letivo.excluir', entidade: 'anos_letivos', entidadeId: id, antes: reg.toJSON() });
}

async function salvarSerie(id, dados, audit) {
  if (id) {
    const reg = await Serie.findByPk(id);
    if (!reg) throw AppError.notFound();
    const antes = reg.toJSON();
    await reg.update(dados);
    await audit({ acao: 'serie.editar', entidade: 'series', entidadeId: id, antes, depois: reg.toJSON() });
    return reg;
  }
  const reg = await Serie.create(dados);
  await audit({ acao: 'serie.criar', entidade: 'series', entidadeId: reg.id, depois: reg.toJSON() });
  return reg;
}
async function excluirSerie(id, audit) {
  const reg = await Serie.findByPk(id);
  if (!reg) throw AppError.notFound();
  if (
    (await Turma.count({ where: { serie_id: id } })) ||
    (await Avaliacao.count({ where: { serie_id: id }, paranoid: false }))
  ) {
    throw AppError.conflict('Esta série possui turmas ou avaliações e não pode ser excluída.');
  }
  await reg.destroy();
  await audit({ acao: 'serie.excluir', entidade: 'series', entidadeId: id, antes: reg.toJSON() });
}

async function salvarTurma(id, dados, audit) {
  if (id) {
    const reg = await Turma.findByPk(id);
    if (!reg) throw AppError.notFound();
    const antes = reg.toJSON();
    await reg.update(dados);
    await audit({ acao: 'turma.editar', entidade: 'turmas', entidadeId: id, antes, depois: reg.toJSON() });
    return reg;
  }
  const reg = await Turma.create(dados);
  await audit({ acao: 'turma.criar', entidade: 'turmas', entidadeId: reg.id, depois: reg.toJSON() });
  return reg;
}
async function excluirTurma(id, audit) {
  const reg = await Turma.findByPk(id);
  if (!reg) throw AppError.notFound();
  if (await Aluno.count({ where: { turma_id: id }, paranoid: false }))
    throw AppError.conflict('A turma possui alunos e não pode ser excluída.');
  await reg.destroy();
  await audit({ acao: 'turma.excluir', entidade: 'turmas', entidadeId: id, antes: reg.toJSON() });
}

module.exports = {
  listarAnos,
  listarSeries,
  listarTurmas,
  salvarAno,
  excluirAno,
  salvarSerie,
  excluirSerie,
  salvarTurma,
  excluirTurma,
};
