const { Op, fn, col } = require('sequelize');
const db = require('../models');
const AppError = require('../utils/AppError');
const escopoSvc = require('./escopo.service');
const correcao = require('./correcao.service');
const cache = require('./cache.service');
const exportacao = require('./exportacao.service');
const importacao = require('./importacao.service');
const { normalizarNome } = require('../utils/normalizar');

const {
  Avaliacao,
  AvaliacaoDisciplina,
  Disciplina,
  Questao,
  QuestaoAspecto,
  EscalaNivel,
  QuestaoSituacao,
  Resposta,
  Aluno,
  Serie,
  AnoLetivo,
  Usuario,
  sequelize,
} = db;

const INCLUDE_QUESTAO = [
  {
    model: EscalaNivel,
    as: 'niveis',
    separate: true,
    order: [
      ['ordem', 'ASC'],
      ['codigo', 'ASC'],
    ],
  },
  {
    model: QuestaoSituacao,
    as: 'situacoes',
    separate: true,
    order: [
      ['ordem', 'ASC'],
      ['codigo', 'ASC'],
    ],
  },
  {
    model: QuestaoAspecto,
    as: 'aspectos',
    separate: true,
    order: [['ordem', 'ASC']],
    include: [
      {
        model: EscalaNivel,
        as: 'niveis',
        separate: true,
        order: [
          ['ordem', 'ASC'],
          ['codigo', 'ASC'],
        ],
      },
    ],
  },
];

/** Questões da avaliação (com escalas/aspectos), ordenadas por disciplina e ordem. */
async function carregarQuestoes(avaliacaoId, { disciplinaId, transaction } = {}) {
  const where = { avaliacao_id: avaliacaoId };
  if (disciplinaId) where.disciplina_id = disciplinaId;
  return Questao.findAll({
    where,
    include: INCLUDE_QUESTAO,
    order: [
      ['disciplina_id', 'ASC'],
      ['ordem', 'ASC'],
      ['codigo', 'ASC'],
    ],
    transaction,
  });
}

function plainQuestao(q) {
  const o = q.get({ plain: true });
  return {
    id: o.id,
    disciplina_id: o.disciplina_id,
    codigo: o.codigo,
    ordem: o.ordem,
    tipo: o.tipo,
    num_alternativas: o.num_alternativas,
    gabarito: o.gabarito,
    peso: Number(o.peso),
    questao_pai_id: o.questao_pai_id,
    habilidade_bncc: o.habilidade_bncc || '',
    descritor: o.descritor || '',
    item_codigo: o.item_codigo || '',
    enunciado_resumo: o.enunciado_resumo || '',
    anulada: !!o.anulada,
    niveis: (o.niveis || []).map((n) => ({
      codigo: n.codigo,
      codigo_alt: n.codigo_alt || '',
      credito: n.credito,
      pontos: Number(n.pontos),
      descricao: n.descricao || '',
    })),
    situacoes: (o.situacoes || []).map((s) => ({
      codigo: s.codigo,
      nome: s.nome,
      descricao: s.descricao || '',
      zera_nota: !!s.zera_nota,
    })),
    aspectos: (o.aspectos || []).map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nome: a.nome,
      descricao: a.descricao || '',
      niveis: (a.niveis || []).map((n) => ({
        codigo: n.codigo,
        codigo_alt: n.codigo_alt || '',
        credito: n.credito,
        pontos: Number(n.pontos),
        descricao: n.descricao || '',
      })),
    })),
  };
}

async function buscar(id, escopo, { transaction } = {}) {
  const av = await Avaliacao.findByPk(id, {
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo' },
      { model: Usuario, as: 'autor', attributes: ['id', 'nome'], paranoid: false },
      { model: AvaliacaoDisciplina, as: 'disciplinas', include: [{ model: Disciplina, as: 'disciplina' }] },
    ],
    transaction,
  });
  if (!av) throw AppError.notFound('Avaliação não encontrada.');
  if (escopo && !escopoSvc.podeVerSerie(escopo, av.ano_letivo_id, av.serie_id))
    throw AppError.forbidden('Esta avaliação é de uma série que você não acompanha.');
  return av;
}

async function contarRespostas(avaliacaoId, { turmasExcluidas = null, transaction } = {}) {
  if (!turmasExcluidas) return Resposta.count({ where: { avaliacao_id: avaliacaoId }, transaction });
  return Resposta.count({
    where: { avaliacao_id: avaliacaoId },
    include: [
      {
        model: Aluno,
        as: 'aluno',
        attributes: [],
        where: { turma_id: { [Op.notIn]: turmasExcluidas.concat(0) } },
        paranoid: false,
      },
    ],
    transaction,
  });
}

/** Regras de edição (ver matriz em config/permissions.js e seção 3.3 do escopo). */
async function permissoes(av, usuario, escopo) {
  const temRespostas = (await contarRespostas(av.id)) > 0;
  const base = {
    temRespostas,
    podeEditarDados: false,
    podeEditarEstrutura: false,
    podeCorrigirGabarito: false,
    podeExcluir: false,
    podePublicar: false,
    podeDuplicar: false,
    podeLancar: false,
  };
  if (!usuario) return base;
  base.podeDuplicar = ['admin', 'professor'].includes(usuario.perfil);
  base.podeLancar =
    av.status === 'publicada' &&
    (usuario.perfil === 'admin' ||
      (usuario.perfil === 'professor' && (escopo.turmasLancar || []).length > 0));
  if (usuario.perfil === 'admin') {
    return {
      ...base,
      podeEditarDados: true,
      podeEditarEstrutura: true,
      podeCorrigirGabarito: true,
      podeExcluir: true,
      podePublicar: true,
    };
  }
  if (usuario.perfil === 'professor' && av.criado_por === usuario.id) {
    const outras = temRespostas
      ? (await contarRespostas(av.id, { turmasExcluidas: escopo.turmasLancar || [] })) > 0
      : false;
    return {
      ...base,
      podeEditarDados: !temRespostas,
      podeEditarEstrutura: !temRespostas,
      podeCorrigirGabarito: true,
      podeExcluir: !outras,
      podePublicar: true,
    };
  }
  return base;
}

async function listar(filtros, escopo) {
  const where = {};
  if (filtros.ano_letivo_id) where.ano_letivo_id = filtros.ano_letivo_id;
  if (filtros.serie_id) where.serie_id = filtros.serie_id;
  if (filtros.status) where.status = filtros.status;
  const avs = await Avaliacao.scope({ method: ['series', escopo.pares] }).findAll({
    where,
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo' },
      { model: Usuario, as: 'autor', attributes: ['id', 'nome'], paranoid: false },
      { model: AvaliacaoDisciplina, as: 'disciplinas', include: [{ model: Disciplina, as: 'disciplina' }] },
    ],
    order: [
      [{ model: AnoLetivo, as: 'anoLetivo' }, 'ano', 'DESC'],
      ['updated_at', 'DESC'],
    ],
  });
  const ids = avs.map((a) => a.id).concat(0);
  const qtd = await Questao.findAll({
    attributes: ['avaliacao_id', [fn('COUNT', col('id')), 'n']],
    where: { avaliacao_id: ids },
    group: ['avaliacao_id'],
    raw: true,
  });
  const resp = await Resposta.findAll({
    attributes: ['avaliacao_id', [fn('COUNT', fn('DISTINCT', col('aluno_id'))), 'n']],
    where: { avaliacao_id: ids },
    group: ['avaliacao_id'],
    raw: true,
  });
  const mq = Object.fromEntries(qtd.map((r) => [r.avaliacao_id, Number(r.n)]));
  const mr = Object.fromEntries(resp.map((r) => [r.avaliacao_id, Number(r.n)]));
  return avs.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    tipo: a.tipo,
    status: a.status,
    ano: a.anoLetivo.ano,
    serie: a.serie.nome,
    ano_letivo_id: a.ano_letivo_id,
    serie_id: a.serie_id,
    autor: a.autor?.nome || '—',
    criado_por: a.criado_por,
    disciplinas: a.disciplinas.map((d) => ({ sigla: d.disciplina.sigla, data: d.data_aplicacao })),
    questoes: mq[a.id] || 0,
    alunosComResposta: mr[a.id] || 0,
  }));
}

/** Estrutura completa para o editor/visualização. */
async function obter(id, usuario, escopo) {
  const av = await buscar(id, escopo);
  const questoes = await carregarQuestoes(id);
  const porId = new Map(questoes.map((q) => [q.id, q]));
  return {
    avaliacao: {
      id: av.id,
      titulo: av.titulo,
      tipo: av.tipo,
      status: av.status,
      ano_letivo_id: av.ano_letivo_id,
      serie_id: av.serie_id,
      ano: av.anoLetivo.ano,
      serie: av.serie.nome,
      autor: av.autor?.nome || '—',
      criado_por: av.criado_por,
      disciplinas: av.disciplinas
        .map((d) => ({
          disciplina_id: d.disciplina_id,
          sigla: d.disciplina.sigla,
          nome: d.disciplina.nome,
          data_aplicacao: d.data_aplicacao,
        }))
        .sort((a, b) => a.disciplina_id - b.disciplina_id),
    },
    questoes: questoes.map((q) => ({
      ...plainQuestao(q),
      chave: `q${q.id}`,
      pai_chave: q.questao_pai_id && porId.has(q.questao_pai_id) ? `q${q.questao_pai_id}` : null,
    })),
    permissoes: await permissoes(av, usuario, escopo),
  };
}

function exigirCriacao(usuario, escopo, anoLetivoId, serieId) {
  if (usuario.perfil === 'admin') return;
  if (usuario.perfil !== 'professor' || !escopoSvc.podeVerSerie(escopo, anoLetivoId, serieId)) {
    throw AppError.forbidden('Você só pode criar avaliações para séries em que leciona.');
  }
}

async function validarDisciplinas(lista, transaction) {
  const ids = [...new Set(lista.map((d) => d.disciplina_id))];
  const n = await Disciplina.count({ where: { id: ids }, transaction });
  if (n !== ids.length) throw AppError.badRequest('Disciplina inválida.');
}

async function criar(dados, usuario, escopo, audit) {
  exigirCriacao(usuario, escopo, dados.ano_letivo_id, dados.serie_id);
  return sequelize.transaction(async (t) => {
    await validarDisciplinas(dados.disciplinas, t);
    if (
      !(await AnoLetivo.findByPk(dados.ano_letivo_id, { transaction: t })) ||
      !(await Serie.findByPk(dados.serie_id, { transaction: t }))
    )
      throw AppError.badRequest('Ano letivo ou série inválidos.');
    const av = await Avaliacao.create(
      {
        titulo: dados.titulo,
        tipo: dados.tipo,
        ano_letivo_id: dados.ano_letivo_id,
        serie_id: dados.serie_id,
        criado_por: usuario.id,
        status: 'rascunho',
      },
      { transaction: t },
    );
    await AvaliacaoDisciplina.bulkCreate(
      dados.disciplinas.map((d) => ({
        avaliacao_id: av.id,
        disciplina_id: d.disciplina_id,
        data_aplicacao: d.data_aplicacao,
      })),
      { transaction: t },
    );
    await audit({ acao: 'avaliacao.criar', entidade: 'avaliacoes', entidadeId: av.id, depois: dados }, t);
    return av;
  });
}

async function atualizarDados(id, dados, usuario, escopo, audit) {
  const av = await buscar(id, escopo);
  const p = await permissoes(av, usuario, escopo);
  if (!p.podeCorrigirGabarito)
    throw AppError.forbidden('Somente o autor ou o administrador podem editar esta avaliação.');
  const mudaSerie = dados.ano_letivo_id !== av.ano_letivo_id || dados.serie_id !== av.serie_id;
  if (mudaSerie && p.temRespostas)
    throw AppError.conflict('Já existem respostas lançadas: não é possível mudar o ano letivo ou a série.');
  if (mudaSerie) exigirCriacao(usuario, escopo, dados.ano_letivo_id, dados.serie_id);
  const atuais = av.disciplinas.map((d) => d.disciplina_id);
  const novas = dados.disciplinas.map((d) => d.disciplina_id);
  const removidas = atuais.filter((d) => !novas.includes(d));
  if (removidas.length && (await Questao.count({ where: { avaliacao_id: id, disciplina_id: removidas } }))) {
    throw AppError.conflict('Remova as questões da disciplina antes de retirá-la da avaliação.');
  }
  return sequelize.transaction(async (t) => {
    await validarDisciplinas(dados.disciplinas, t);
    const antes = {
      titulo: av.titulo,
      tipo: av.tipo,
      ano_letivo_id: av.ano_letivo_id,
      serie_id: av.serie_id,
      disciplinas: av.disciplinas.map((d) => ({
        disciplina_id: d.disciplina_id,
        data_aplicacao: d.data_aplicacao,
      })),
    };
    await av.update(
      {
        titulo: dados.titulo,
        tipo: dados.tipo,
        ano_letivo_id: dados.ano_letivo_id,
        serie_id: dados.serie_id,
      },
      { transaction: t },
    );
    await AvaliacaoDisciplina.destroy({
      where: { avaliacao_id: id, disciplina_id: { [Op.notIn]: novas } },
      transaction: t,
    });
    for (const d of dados.disciplinas)
      await AvaliacaoDisciplina.upsert(
        { avaliacao_id: id, disciplina_id: d.disciplina_id, data_aplicacao: d.data_aplicacao },
        { transaction: t },
      );
    await audit(
      { acao: 'avaliacao.editar_dados', entidade: 'avaliacoes', entidadeId: id, antes, depois: dados },
      t,
    );
    cache.limpar();
    return av;
  });
}

// ---------- Estrutura (questões, escalas, aspectos) ----------

const assinaturaNiveis = (ns) =>
  JSON.stringify((ns || []).map((n) => [n.codigo, Number(n.pontos), n.credito || null]));
const assinaturaEstrutural = (q) =>
  JSON.stringify({
    tipo: q.tipo,
    alt: q.num_alternativas,
    niveis: assinaturaNiveis(q.niveis),
    sit: (q.situacoes || []).map((s) => [s.codigo, !!s.zera_nota]),
    asp: (q.aspectos || []).map((a) => [a.codigo, assinaturaNiveis(a.niveis)]),
  });

/**
 * Compara a estrutura enviada com a atual e classifica as mudanças.
 * @returns { estruturais: [], pontuacao: [] } — listas de descrições legíveis.
 */
function compararEstrutura(atuais, novas) {
  const estruturais = [];
  const pontuacao = [];
  const porId = new Map(atuais.map((q) => [q.id, q]));
  const idsNovos = new Set(novas.filter((q) => q.id).map((q) => q.id));
  for (const q of atuais) if (!idsNovos.has(q.id)) estruturais.push(`${q.codigo}: questão removida`);
  for (const n of novas) {
    if (!n.id || !porId.has(n.id)) {
      estruturais.push(`${n.codigo}: questão nova`);
      continue;
    }
    const a = porId.get(n.id);
    if (a.tipo !== n.tipo) estruturais.push(`${n.codigo}: tipo alterado`);
    else if (assinaturaEstrutural(a) !== assinaturaEstrutural(n))
      estruturais.push(`${n.codigo}: escala/aspectos alterados`);
    if ((a.questao_pai_id || null) !== (n.questao_pai_id || null))
      estruturais.push(`${n.codigo}: desdobramento alterado`);
    if ((a.gabarito || null) !== (n.gabarito || null))
      pontuacao.push(`${n.codigo}: gabarito ${a.gabarito || '—'} → ${n.gabarito || '—'}`);
    if (Number(a.peso) !== Number(n.peso)) pontuacao.push(`${n.codigo}: peso ${a.peso} → ${n.peso}`);
    if (!!a.anulada !== !!n.anulada) pontuacao.push(`${n.codigo}: ${n.anulada ? 'anulada' : 'reativada'}`);
  }
  return { estruturais, pontuacao };
}

async function gravarNiveis(dono, niveis, t) {
  await EscalaNivel.destroy({ where: dono, transaction: t });
  if (niveis.length) {
    await EscalaNivel.bulkCreate(
      niveis.map((n, i) => ({
        ...dono,
        codigo: n.codigo,
        codigo_alt: n.codigo_alt || null,
        credito: n.credito || null,
        pontos: n.pontos,
        descricao: n.descricao || null,
        ordem: i,
      })),
      { transaction: t, validate: true },
    );
  }
}

async function salvarEstrutura(id, payload, usuario, escopo, audit) {
  const av = await buscar(id, escopo);
  const p = await permissoes(av, usuario, escopo);
  if (!p.podeCorrigirGabarito)
    throw AppError.forbidden('Somente o autor ou o administrador podem editar esta avaliação.');
  if (av.status === 'encerrada' && usuario.perfil !== 'admin')
    throw AppError.conflict('A avaliação está encerrada. Reabra-a para editar.');

  const atuaisInst = await carregarQuestoes(id);
  const atuais = atuaisInst.map(plainQuestao);
  const idsAtuais = new Set(atuais.map((q) => q.id));
  for (const q of payload.questoes)
    if (q.id && !idsAtuais.has(q.id))
      throw AppError.badRequest(`${q.codigo}: questão não pertence a esta avaliação.`);

  // questao_pai_id "lógico" para comparação
  const chaveParaId = new Map(payload.questoes.filter((q) => q.id).map((q) => [q.chave, q.id]));
  const novasCmp = payload.questoes.map((q) => ({
    ...q,
    questao_pai_id: q.pai_chave ? chaveParaId.get(q.pai_chave) || -1 : null,
  }));
  const { estruturais, pontuacao } = compararEstrutura(atuais, novasCmp);

  if (p.temRespostas && estruturais.length && !p.podeEditarEstrutura) {
    throw AppError.conflict(
      'Já existem respostas lançadas: alterações estruturais estão bloqueadas. Você pode corrigir gabarito e peso.',
      { estruturais },
    );
  }
  if (p.temRespostas && (pontuacao.length || estruturais.length) && !payload.confirmar) {
    throw new AppError(409, 'Confirme: as pontuações já lançadas serão recalculadas.', {
      precisaConfirmacao: true,
      alteracoes: [...estruturais, ...pontuacao],
    });
  }

  const resultado = await sequelize.transaction(async (t) => {
    // Disciplinas
    const novasDisc = payload.disciplinas.map((d) => d.disciplina_id);
    await validarDisciplinas(payload.disciplinas, t);
    await AvaliacaoDisciplina.destroy({
      where: { avaliacao_id: id, disciplina_id: { [Op.notIn]: novasDisc } },
      transaction: t,
    });
    for (const d of payload.disciplinas)
      await AvaliacaoDisciplina.upsert(
        { avaliacao_id: id, disciplina_id: d.disciplina_id, data_aplicacao: d.data_aplicacao },
        { transaction: t },
      );

    // Remoções (respostas primeiro: aspecto_id usa RESTRICT)
    const manter = new Set(payload.questoes.filter((q) => q.id).map((q) => q.id));
    const remover = atuais.filter((q) => !manter.has(q.id)).map((q) => q.id);
    if (remover.length) {
      const filhos = atuais.filter((q) => remover.includes(q.questao_pai_id)).map((q) => q.id);
      const todos = [...new Set([...remover, ...filhos])];
      await Resposta.destroy({ where: { questao_id: todos }, transaction: t });
      await Questao.update({ questao_pai_id: null }, { where: { id: todos }, transaction: t });
      await Questao.destroy({ where: { id: todos }, transaction: t });
    }
    // Evita colisão de códigos durante renomeações
    await Questao.update(
      { codigo: sequelize.fn('CONCAT', '~', sequelize.col('id')) },
      { where: { avaliacao_id: id }, transaction: t },
    );

    const ids = new Map();
    const ordenadas = [...payload.questoes].sort((a, b) => (a.pai_chave ? 1 : 0) - (b.pai_chave ? 1 : 0));
    for (const q of ordenadas) {
      const campos = {
        avaliacao_id: id,
        disciplina_id: q.disciplina_id,
        codigo: q.codigo,
        ordem: q.ordem,
        tipo: q.tipo,
        num_alternativas: q.tipo === 'objetiva' ? q.num_alternativas : 4,
        gabarito: q.tipo === 'objetiva' ? q.gabarito : null,
        peso: q.peso,
        questao_pai_id: q.pai_chave ? ids.get(q.pai_chave) || null : null,
        habilidade_bncc: q.habilidade_bncc || null,
        descritor: q.descritor || null,
        item_codigo: q.item_codigo || null,
        enunciado_resumo: q.enunciado_resumo || null,
        anulada: q.anulada,
      };
      let reg;
      if (q.id) {
        reg = atuaisInst.find((x) => x.id === q.id);
        await Questao.update(campos, { where: { id: q.id }, transaction: t });
      } else {
        reg = await Questao.create(campos, { transaction: t });
      }
      ids.set(q.chave, reg.id);
      const qid = reg.id;
      await gravarNiveis({ questao_id: qid }, q.tipo === 'escalar' ? q.niveis : [], t);
      await QuestaoSituacao.destroy({ where: { questao_id: qid }, transaction: t });
      if (q.tipo === 'producao_texto' && q.situacoes.length) {
        await QuestaoSituacao.bulkCreate(
          q.situacoes.map((s, i) => ({
            questao_id: qid,
            codigo: s.codigo,
            nome: s.nome,
            descricao: s.descricao || null,
            zera_nota: s.zera_nota,
            ordem: i,
          })),
          { transaction: t },
        );
      }
      // Aspectos: atualiza no lugar (respostas referenciam o id)
      const aspAtuais = await QuestaoAspecto.findAll({ where: { questao_id: qid }, transaction: t });
      const aspNovos = q.tipo === 'producao_texto' ? q.aspectos : [];
      const manterAsp = new Set();
      for (const [i, a] of aspNovos.entries()) {
        let ar =
          (a.id && aspAtuais.find((x) => x.id === a.id)) ||
          aspAtuais.find((x) => x.codigo === a.codigo && !manterAsp.has(x.id));
        if (ar)
          await ar.update(
            { codigo: a.codigo, nome: a.nome, descricao: a.descricao || null, ordem: i },
            { transaction: t },
          );
        else
          ar = await QuestaoAspecto.create(
            { questao_id: qid, codigo: a.codigo, nome: a.nome, descricao: a.descricao || null, ordem: i },
            { transaction: t },
          );
        manterAsp.add(ar.id);
        await gravarNiveis({ aspecto_id: ar.id }, a.niveis, t);
      }
      const remAsp = aspAtuais.filter((x) => !manterAsp.has(x.id)).map((x) => x.id);
      if (remAsp.length) {
        await Resposta.destroy({ where: { aspecto_id: remAsp }, transaction: t });
        await QuestaoAspecto.destroy({ where: { id: remAsp }, transaction: t });
      }
      if (q.tipo !== 'producao_texto')
        await Resposta.destroy({ where: { questao_id: qid, aspecto_id: { [Op.ne]: null } }, transaction: t });
    }
    let recalculadas = 0;
    if (p.temRespostas) recalculadas = await correcao.recalcular(id, { transaction: t });
    await av.changed('updated_at', true);
    await av.save({ transaction: t });
    await audit(
      {
        acao:
          p.temRespostas && pontuacao.length ? 'avaliacao.corrigir_gabarito' : 'avaliacao.editar_estrutura',
        entidade: 'avaliacoes',
        entidadeId: id,
        antes: p.temRespostas ? { alteracoes: [...estruturais, ...pontuacao] } : null,
        depois: { questoes: payload.questoes.length, recalculadas },
      },
      t,
    );
    return { recalculadas };
  });
  cache.limpar();
  return resultado;
}

async function alterarStatus(id, status, usuario, escopo, audit) {
  const av = await buscar(id, escopo);
  const p = await permissoes(av, usuario, escopo);
  if (!p.podePublicar) throw AppError.forbidden();
  if (status === 'publicada') {
    const qs = correcao.questoesFolha((await carregarQuestoes(id)).map(correcao.definicao));
    if (!qs.length) throw AppError.badRequest('Cadastre ao menos uma questão antes de publicar.');
  }
  if (status === 'rascunho' && p.temRespostas)
    throw AppError.conflict('Já existem respostas: a avaliação não pode voltar a rascunho. Use "Encerrar".');
  const antes = av.status;
  await av.update({ status });
  await audit({
    acao: `avaliacao.status`,
    entidade: 'avaliacoes',
    entidadeId: id,
    antes: { status: antes },
    depois: { status },
  });
  cache.limpar();
  return av;
}

async function excluir(id, usuario, escopo, audit) {
  const av = await buscar(id, escopo);
  const p = await permissoes(av, usuario, escopo);
  if (!p.podeExcluir)
    throw AppError.forbidden(
      'Esta avaliação possui respostas de outras turmas e não pode ser excluída por você.',
    );
  await sequelize.transaction(async (t) => {
    await av.destroy({ transaction: t });
    await audit(
      { acao: 'avaliacao.excluir', entidade: 'avaliacoes', entidadeId: id, antes: { titulo: av.titulo } },
      t,
    );
  });
  cache.limpar();
}

async function duplicar(id, dados, usuario, escopo, audit) {
  const origem = await obter(id, usuario, escopo);
  exigirCriacao(usuario, escopo, dados.ano_letivo_id, dados.serie_id);
  const nova = await criar(
    {
      titulo: dados.titulo,
      tipo: origem.avaliacao.tipo,
      ano_letivo_id: dados.ano_letivo_id,
      serie_id: dados.serie_id,
      disciplinas: origem.avaliacao.disciplinas.map((d) => ({
        disciplina_id: d.disciplina_id,
        data_aplicacao: null,
      })),
    },
    usuario,
    escopo,
    audit,
  );
  const novoEscopo =
    usuario.perfil === 'admin'
      ? escopo
      : {
          ...escopo,
          pares: [...(escopo.pares || []), { ano_letivo_id: dados.ano_letivo_id, serie_id: dados.serie_id }],
        };
  await salvarEstrutura(
    nova.id,
    {
      disciplinas: origem.avaliacao.disciplinas.map((d) => ({
        disciplina_id: d.disciplina_id,
        data_aplicacao: null,
      })),
      questoes: origem.questoes.map((q) => ({
        ...q,
        id: null,
        aspectos: q.aspectos.map((a) => ({ ...a, id: null })),
      })),
    },
    usuario,
    novoEscopo,
    audit,
  );
  return nova;
}

// ---------- Importação / exportação de gabarito (compatível com modelo_gabarito.xlsx da PoC) ----------

const TIPO_ROTULO = { objetiva: 'Objetiva', escalar: 'Dissertativa', producao_texto: 'Producao de texto' };
const CREDITO_ROTULO = { integral: 'Integral', parcial: 'Parcial', nenhum: 'Nenhum' };

async function exportarGabarito(id, usuario, escopo, formato = 'xlsx') {
  const { avaliacao, questoes } = await obter(id, usuario, escopo);
  const sigla = Object.fromEntries(avaliacao.disciplinas.map((d) => [d.disciplina_id, d.sigla]));
  const pais = new Set(questoes.filter((q) => q.questao_pai_id).map((q) => q.questao_pai_id));
  const folha = questoes
    .filter((q) => !pais.has(q.id))
    .map((q) => ({
      Questao: q.codigo,
      Disciplina: sigla[q.disciplina_id],
      Tipo: TIPO_ROTULO[q.tipo],
      Gabarito: q.tipo === 'objetiva' ? q.gabarito || '' : '(escalar)',
      Peso: q.peso,
      Habilidade: q.habilidade_bncc,
      Descritor: q.descritor,
      Item: q.item_codigo,
      Anulada: q.anulada ? 'Sim' : '',
    }));
  const escalas = [];
  const situacoes = [];
  for (const q of questoes) {
    for (const a of q.aspectos)
      for (const n of a.niveis)
        escalas.push({
          Questao: `${q.codigo}${a.codigo}`,
          Aspecto: a.nome,
          Conceito: n.codigo,
          Codigo: n.codigo_alt,
          Credito: '',
          Pontos: n.pontos,
          Descricao: n.descricao,
        });
    for (const n of q.niveis)
      escalas.push({
        Questao: q.codigo,
        Aspecto: '',
        Conceito: n.codigo,
        Codigo: n.codigo_alt,
        Credito: CREDITO_ROTULO[n.credito] || '',
        Pontos: n.pontos,
        Descricao: n.descricao,
      });
    for (const s of q.situacoes)
      situacoes.push({
        Questao: q.codigo,
        Situacao: s.codigo,
        Nome: s.nome,
        ZeraNota: s.zera_nota ? 'Sim' : 'Não',
        Descricao: s.descricao,
      });
  }
  const cols = (o) =>
    Object.keys(o).map((k) => ({
      chave: k,
      titulo: k,
      largura: k === 'Descricao' || k === 'Descritor' ? 60 : 12,
    }));
  const colsG = cols(
    folha[0] || {
      Questao: '',
      Disciplina: '',
      Tipo: '',
      Gabarito: '',
      Peso: '',
      Habilidade: '',
      Descritor: '',
      Item: '',
      Anulada: '',
    },
  );
  const nome = `gabarito_${normalizarNome(avaliacao.titulo).replace(/ /g, '_')}_${normalizarNome(avaliacao.serie).replace(/ /g, '')}_${avaliacao.ano}`;
  if (formato === 'csv') return { buffer: exportacao.csv(colsG, folha), nome, formato };
  const buffer = await exportacao.xlsx([
    { nome: 'Gabarito', colunas: colsG, linhas: folha },
    {
      nome: 'Escalas',
      colunas: cols({
        Questao: '',
        Aspecto: '',
        Conceito: '',
        Codigo: '',
        Credito: '',
        Pontos: '',
        Descricao: '',
      }),
      linhas: escalas,
    },
    {
      nome: 'Situacoes',
      colunas: cols({ Questao: '', Situacao: '', Nome: '', ZeraNota: '', Descricao: '' }),
      linhas: situacoes,
    },
  ]);
  return { buffer, nome, formato };
}

const SITUACOES_PADRAO = [
  {
    codigo: 'A',
    nome: 'Normal',
    descricao: 'Resposta passível de ser corrigida, de acordo com os critérios do guia.',
    zera_nota: false,
  },
  { codigo: 'B', nome: 'Branco', descricao: 'Questão em branco, sem nenhuma resposta.', zera_nota: true },
  {
    codigo: 'C',
    nome: 'Pré-silábico',
    descricao: 'Escrita apresentada em nível silábico e/ou pré-silábico.',
    zera_nota: true,
  },
  {
    codigo: 'D',
    nome: 'Cópia',
    descricao: 'Texto apresenta apenas trechos transcritos do enunciado.',
    zera_nota: true,
  },
  {
    codigo: 'E',
    nome: 'Outra língua',
    descricao: 'Resposta em idioma diferente do português.',
    zera_nota: true,
  },
];

/**
 * Lê a planilha de gabarito e devolve a estrutura de questões para o editor (o usuário revisa e salva).
 * Questões existentes (mesmo código) mantêm o id; itens "09a/09b" criam a questão-mãe automaticamente.
 */
async function importarGabarito(id, buffer, nomeArquivo, usuario, escopo) {
  const atual = await obter(id, usuario, escopo);
  const discs = await Disciplina.findAll();
  const porSigla = Object.fromEntries(discs.map((d) => [d.sigla.toUpperCase(), d]));
  const { folhas, principal } = await importacao.lerPlanilha(buffer, nomeArquivo);
  const achar = (nome) => Object.entries(folhas).find(([k]) => normalizarNome(k) === nome)?.[1];
  const gab = achar('GABARITO') || principal;
  const esc = achar('ESCALAS');
  const sit = achar('SITUACOES');
  const erros = [];
  const existentes = new Map(atual.questoes.map((q) => [q.codigo.toUpperCase(), q]));
  const questoes = [];
  const disciplinas = new Map(
    atual.avaliacao.disciplinas.map((d) => [
      d.disciplina_id,
      { disciplina_id: d.disciplina_id, data_aplicacao: d.data_aplicacao },
    ]),
  );
  const n = (o, ...ks) => {
    for (const k of ks) {
      const e = Object.entries(o).find(([h]) => normalizarNome(h).replace(/ /g, '') === k);
      if (e && String(e[1]).trim() !== '') return String(e[1]).trim();
    }
    return '';
  };
  gab.linhas.forEach((l, i) => {
    const codigoBruto = n(l, 'QUESTAO', 'CODIGO');
    if (!codigoBruto) return;
    const m = codigoBruto.match(/^([A-Za-z]{2,4})0*(\d{1,3})([A-Za-z]?)$/);
    if (!m) return erros.push(`Linha ${i + 2}: código "${codigoBruto}" inválido.`);
    const codigo = `${m[1].toUpperCase()}${m[2].padStart(2, '0')}${m[3].toLowerCase()}`;
    const sig = (n(l, 'DISCIPLINA') || m[1]).toUpperCase();
    const d = porSigla[sig];
    if (!d) return erros.push(`Linha ${i + 2}: disciplina "${sig}" não cadastrada.`);
    disciplinas.set(d.id, disciplinas.get(d.id) || { disciplina_id: d.id, data_aplicacao: null });
    const tipoTxt = normalizarNome(n(l, 'TIPO'));
    const tipo =
      tipoTxt.startsWith('PROD') || tipoTxt.includes('TEXTO')
        ? 'producao_texto'
        : tipoTxt.startsWith('DISS') || tipoTxt.startsWith('ESC')
          ? 'escalar'
          : 'objetiva';
    const gabTxt = n(l, 'GABARITO').toUpperCase();
    const peso = Number(String(n(l, 'PESO') || '1').replace(',', '.'));
    const ex = existentes.get(codigo.toUpperCase());
    questoes.push({
      id: ex?.id || null,
      chave: ex ? ex.chave : `n${i}`,
      pai_chave: null,
      disciplina_id: d.id,
      codigo,
      ordem: 0,
      tipo,
      num_alternativas: ex?.num_alternativas || 4,
      gabarito: tipo === 'objetiva' && /^[A-J]$/.test(gabTxt) ? gabTxt : null,
      peso: Number.isFinite(peso) ? peso : 1,
      habilidade_bncc: n(l, 'HABILIDADE')
        .split(/\s|–|-/)[0]
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 20),
      descritor: n(l, 'DESCRITOR').slice(0, 400),
      item_codigo: n(l, 'ITEM'),
      enunciado_resumo: ex?.enunciado_resumo || '',
      anulada: /^S/i.test(n(l, 'ANULADA')),
      niveis: [],
      situacoes: tipo === 'producao_texto' ? (ex?.situacoes?.length ? ex.situacoes : SITUACOES_PADRAO) : [],
      aspectos: [],
    });
  });
  const porCodigo = new Map(questoes.map((q) => [q.codigo.toUpperCase(), q]));
  for (const l of esc?.linhas || []) {
    const cod = normalizarNome(n(l, 'QUESTAO')).replace(/ /g, '');
    const ma = cod.match(/^([A-Z]{2,4})0*(\d{1,3})(A\d+)$/);
    const mq = cod.match(/^([A-Z]{2,4})0*(\d{1,3})([A-Z]?)$/);
    const nivel = {
      codigo: n(l, 'CONCEITO', 'NIVEL').toUpperCase().slice(0, 2),
      codigo_alt: n(l, 'CODIGO').slice(0, 4),
      credito: normalizarNome(n(l, 'CREDITO')).toLowerCase() || null,
      pontos: Number(String(n(l, 'PONTOS') || '0').replace(',', '.')),
      descricao: n(l, 'DESCRICAO'),
    };
    if (!nivel.codigo) continue;
    if (!['integral', 'parcial', 'nenhum'].includes(nivel.credito)) nivel.credito = null;
    if (ma) {
      const q = porCodigo.get(`${ma[1]}${ma[2].padStart(2, '0')}`);
      if (!q || q.tipo !== 'producao_texto') continue;
      let a = q.aspectos.find((x) => x.codigo === ma[3]);
      if (!a) {
        const exA = existentes.get(q.codigo.toUpperCase())?.aspectos?.find((x) => x.codigo === ma[3]);
        a = {
          id: exA?.id || null,
          codigo: ma[3],
          nome: n(l, 'ASPECTO') || ma[3],
          descricao: exA?.descricao || '',
          niveis: [],
        };
        q.aspectos.push(a);
      }
      a.niveis.push(nivel);
    } else if (mq) {
      const q = porCodigo.get(`${mq[1]}${mq[2].padStart(2, '0')}${mq[3].toLowerCase()}`);
      if (q && q.tipo === 'escalar') q.niveis.push(nivel);
    }
  }
  if (sit) {
    for (const q of questoes.filter((x) => x.tipo === 'producao_texto')) {
      const linhas = sit.linhas.filter(
        (l) => normalizarNome(n(l, 'QUESTAO')).replace(/ /g, '') === q.codigo.toUpperCase(),
      );
      if (linhas.length)
        q.situacoes = linhas.map((l) => ({
          codigo: n(l, 'SITUACAO').toUpperCase().slice(0, 2),
          nome: n(l, 'NOME'),
          descricao: n(l, 'DESCRICAO'),
          zera_nota: !/^N/i.test(n(l, 'ZERANOTA')),
        }));
    }
  }
  // Mantém a estrutura de aspectos existente quando a planilha não traz escalas
  for (const q of questoes) {
    const ex = existentes.get(q.codigo.toUpperCase());
    if (q.tipo === 'producao_texto' && !q.aspectos.length && ex?.aspectos?.length) q.aspectos = ex.aspectos;
    if (q.tipo === 'escalar' && !q.niveis.length && ex?.niveis?.length) q.niveis = ex.niveis;
  }
  // Desdobramentos: LP09a/LP09b → mãe LP09
  for (const q of [...questoes]) {
    const m = q.codigo.match(/^(.*\d)([a-z])$/);
    if (!m) continue;
    let pai = porCodigo.get(m[1].toUpperCase());
    if (!pai) {
      const ex = existentes.get(m[1].toUpperCase());
      pai = {
        id: ex?.id || null,
        chave: ex ? ex.chave : `p${m[1]}`,
        pai_chave: null,
        disciplina_id: q.disciplina_id,
        codigo: m[1],
        ordem: 0,
        tipo: 'objetiva',
        num_alternativas: 4,
        gabarito: null,
        peso: 1,
        habilidade_bncc: '',
        descritor: ex?.descritor || '',
        item_codigo: '',
        enunciado_resumo: '',
        anulada: false,
        niveis: [],
        situacoes: [],
        aspectos: [],
      };
      porCodigo.set(m[1].toUpperCase(), pai);
      questoes.push(pai);
    }
    q.pai_chave = pai.chave;
  }
  const chaveOrd = (c) => {
    const m = c.match(/^([A-Z]+)(\d+)([a-z]?)$/i);
    return m ? [m[1], Number(m[2]), m[3]] : [c, 0, ''];
  };
  questoes.sort((a, b) => {
    const [ad, an, as] = chaveOrd(a.codigo);
    const [bd, bn, bs] = chaveOrd(b.codigo);
    return a.disciplina_id - b.disciplina_id || ad.localeCompare(bd) || an - bn || as.localeCompare(bs);
  });
  questoes.forEach((q, i) => (q.ordem = i + 1));
  return { disciplinas: [...disciplinas.values()], questoes, erros };
}

module.exports = {
  INCLUDE_QUESTAO,
  carregarQuestoes,
  plainQuestao,
  buscar,
  permissoes,
  listar,
  obter,
  criar,
  atualizarDados,
  compararEstrutura,
  salvarEstrutura,
  alterarStatus,
  excluir,
  duplicar,
  exportarGabarito,
  importarGabarito,
  SITUACOES_PADRAO,
};
