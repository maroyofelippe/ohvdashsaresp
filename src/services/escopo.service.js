/**
 * Calcula o escopo de dados do usuário (quais turmas pode ver/lançar).
 * null = sem restrição. Array = lista fechada de ids.
 */
const { Turma, ProfessorTurma } = require('../models');
const { Op } = require('sequelize');

async function calcular(usuario) {
  if (!usuario) return null;
  if (usuario.perfil === 'admin') {
    return { perfil: 'admin', turmasLancar: null, turmasVer: null, pares: null, turmasGerenciarAlunos: null };
  }
  if (usuario.perfil === 'coordenador') {
    return {
      perfil: 'coordenador',
      turmasLancar: [],
      turmasVer: null,
      pares: null,
      turmasGerenciarAlunos: [],
    };
  }
  const vinculos = await ProfessorTurma.findAll({
    where: { usuario_id: usuario.id, status: 'aprovado' },
    include: [{ model: Turma, as: 'turma', attributes: ['id', 'ano_letivo_id', 'serie_id'] }],
  });
  const proprias = vinculos.filter((v) => v.turma).map((v) => v.turma);
  const paresMap = new Map();
  for (const t of proprias)
    paresMap.set(`${t.ano_letivo_id}:${t.serie_id}`, {
      ano_letivo_id: t.ano_letivo_id,
      serie_id: t.serie_id,
    });
  const pares = [...paresMap.values()];
  let turmasVer = [];
  if (pares.length) {
    const ts = await Turma.findAll({ attributes: ['id'], where: { [Op.or]: pares }, raw: true });
    turmasVer = ts.map((t) => t.id);
  }
  const ids = proprias.map((t) => t.id);
  return { perfil: 'professor', turmasLancar: ids, turmasVer, pares, turmasGerenciarAlunos: ids };
}

const dentro = (lista, id) => lista === null || lista.includes(Number(id));

function podeVerTurma(escopo, turmaId) {
  return !!escopo && dentro(escopo.turmasVer, turmaId);
}
function podeLancarTurma(escopo, turmaId) {
  return !!escopo && dentro(escopo.turmasLancar, turmaId);
}
function podeGerenciarAlunos(escopo, turmaId) {
  return !!escopo && dentro(escopo.turmasGerenciarAlunos, turmaId);
}
function podeVerSerie(escopo, anoLetivoId, serieId) {
  if (!escopo) return false;
  if (escopo.pares === null) return true;
  return escopo.pares.some((p) => p.ano_letivo_id === Number(anoLetivoId) && p.serie_id === Number(serieId));
}

module.exports = { calcular, podeVerTurma, podeLancarTurma, podeGerenciarAlunos, podeVerSerie };
