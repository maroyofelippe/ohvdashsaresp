const { Op } = require('sequelize');
const { Aluno, Turma, Serie, AnoLetivo, sequelize } = require('../models');
const { contem } = require('../utils/busca');
const AppError = require('../utils/AppError');
const escopoSvc = require('./escopo.service');
const importacao = require('./importacao.service');
const { paginacao, meta } = require('../utils/paginacao');

async function listar(filtros, escopo) {
  const where = {};
  if (filtros.turma_id) {
    if (!escopoSvc.podeVerTurma(escopo, filtros.turma_id)) throw AppError.forbidden();
    where.turma_id = filtros.turma_id;
  }
  if (filtros.busca) {
    where[Op.or] = contem(['Aluno.nome', 'Aluno.ra'], filtros.busca);
  }
  if (filtros.situacao) where.situacao = filtros.situacao;
  const pg = paginacao(filtros, 50);
  const { rows, count } = await Aluno.scope('defaultScope', {
    method: ['turmas', escopo.turmasVer],
  }).findAndCountAll({
    where,
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
    order: [
      [{ model: Turma, as: 'turma' }, 'letra', 'ASC'],
      ['numero_chamada', 'ASC'],
    ],
    limit: pg.limit,
    offset: pg.offset,
  });
  return {
    itens: rows.map((a) => ({
      id: a.id,
      turma_id: a.turma_id,
      numero_chamada: a.numero_chamada,
      nome: a.nome,
      ra: a.ra,
      situacao: a.situacao,
      turma: `${a.turma.serie.nome} ${a.turma.letra} · ${a.turma.anoLetivo.ano}`,
      podeEditar: escopoSvc.podeGerenciarAlunos(escopo, a.turma_id),
    })),
    meta: meta(pg, count),
  };
}

function exigirGerencia(escopo, turmaId) {
  if (!escopoSvc.podeGerenciarAlunos(escopo, turmaId))
    throw AppError.forbidden('Você só pode gerenciar alunos das suas turmas.');
}

async function salvar(id, dados, escopo, audit) {
  exigirGerencia(escopo, dados.turma_id);
  return sequelize.transaction(async (t) => {
    if (id) {
      const reg = await Aluno.findByPk(id, { transaction: t });
      if (!reg) throw AppError.notFound();
      exigirGerencia(escopo, reg.turma_id);
      const antes = reg.toJSON();
      await reg.update({ ...dados, ra: dados.ra || null }, { transaction: t });
      await audit(
        { acao: 'aluno.editar', entidade: 'alunos', entidadeId: id, antes, depois: reg.toJSON() },
        t,
      );
      return reg;
    }
    const reg = await Aluno.create({ ...dados, ra: dados.ra || null }, { transaction: t });
    await audit({ acao: 'aluno.criar', entidade: 'alunos', entidadeId: reg.id, depois: reg.toJSON() }, t);
    return reg;
  });
}

async function excluir(id, escopo, audit) {
  const reg = await Aluno.findByPk(id);
  if (!reg) throw AppError.notFound();
  exigirGerencia(escopo, reg.turma_id);
  await sequelize.transaction(async (t) => {
    // Libera o RA para reutilização e aplica exclusão lógica (paranoid).
    await reg.update({ ra: null }, { transaction: t });
    await reg.destroy({ transaction: t });
    await audit({ acao: 'aluno.excluir', entidade: 'alunos', entidadeId: id, antes: reg.toJSON() }, t);
  });
}

/** Pré-visualização da importação: valida linha a linha e indica o que será feito. */
async function previaImportacao(buffer, nomeArquivo, turmaId, escopo) {
  exigirGerencia(escopo, turmaId);
  const { principal } = await importacao.lerPlanilha(buffer, nomeArquivo);
  const linhas = importacao.parseAlunos(principal.linhas);
  const existentes = await Aluno.findAll({ where: { turma_id: turmaId }, raw: true });
  const ras = linhas.filter((l) => l.ra).map((l) => l.ra);
  const raOutros = ras.length
    ? await Aluno.findAll({ where: { ra: ras, turma_id: { [Op.ne]: turmaId } }, raw: true })
    : [];
  for (const l of linhas) {
    const ex = existentes.find((a) => a.numero_chamada === l.numero);
    if (l.ra && raOutros.some((a) => a.ra === l.ra)) l.erros.push('RA já cadastrado em outra turma');
    l.acao = l.erros.length
      ? 'erro'
      : ex
        ? ex.nome === l.nome && (ex.ra || null) === l.ra
          ? 'igual'
          : 'atualizar'
        : 'incluir';
    l.atual = ex ? { nome: ex.nome, ra: ex.ra } : null;
  }
  return {
    linhas,
    resumo: {
      total: linhas.length,
      incluir: linhas.filter((l) => l.acao === 'incluir').length,
      atualizar: linhas.filter((l) => l.acao === 'atualizar').length,
      iguais: linhas.filter((l) => l.acao === 'igual').length,
      erros: linhas.filter((l) => l.acao === 'erro').length,
    },
  };
}

/** Confirma a importação (revalida tudo no servidor). modo: 'atualizar' | 'novos' */
async function confirmarImportacao({ turma_id, modo, linhas }, escopo, audit) {
  exigirGerencia(escopo, turma_id);
  const validas = importacao
    .parseAlunos(linhas.map((l) => ({ Nº: l.numero, Nome: l.nome, RA: l.ra || '' })))
    .filter((l) => !l.erros.length);
  return sequelize.transaction(async (t) => {
    const existentes = await Aluno.findAll({ where: { turma_id }, transaction: t });
    let incluidos = 0;
    let atualizados = 0;
    for (const l of validas) {
      const ex = existentes.find((a) => a.numero_chamada === l.numero);
      if (ex) {
        if (modo !== 'atualizar') continue;
        if (ex.nome !== l.nome || (ex.ra || null) !== l.ra) {
          await ex.update({ nome: l.nome, ra: l.ra }, { transaction: t });
          atualizados++;
        }
      } else {
        await Aluno.create(
          { turma_id, numero_chamada: l.numero, nome: l.nome, ra: l.ra },
          { transaction: t },
        );
        incluidos++;
      }
    }
    await audit(
      {
        acao: 'aluno.importar',
        entidade: 'turmas',
        entidadeId: turma_id,
        depois: { incluidos, atualizados, modo },
      },
      t,
    );
    return { incluidos, atualizados, ignorados: linhas.length - incluidos - atualizados };
  });
}

module.exports = { listar, salvar, excluir, previaImportacao, confirmarImportacao, exigirGerencia };
