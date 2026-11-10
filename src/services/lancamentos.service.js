const { Op } = require('sequelize');
const db = require('../models');
const AppError = require('../utils/AppError');
const { ultimaPorChave, chaveResposta } = require('../utils/busca');
const escopoSvc = require('./escopo.service');
const correcao = require('./correcao.service');
const cache = require('./cache.service');
const avaliacoesSvc = require('./avaliacoes.service');
const importacao = require('./importacao.service');
const { pode } = require('../config/permissions');

const {
  Avaliacao,
  Turma,
  Serie,
  AnoLetivo,
  Aluno,
  Resposta,
  Participacao,
  Disciplina,
  AvaliacaoDisciplina,
  sequelize,
} = db;

/** Opções para os selects encadeados (Avaliação → Turma → Disciplina). */
async function opcoes(usuario, escopo) {
  const turmas = await Turma.scope({ method: ['ids', escopo.turmasVer] }).findAll({
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo' },
    ],
    order: [
      [{ model: AnoLetivo, as: 'anoLetivo' }, 'ano', 'DESC'],
      [{ model: Serie, as: 'serie' }, 'ordem', 'ASC'],
      ['letra', 'ASC'],
    ],
  });
  const avs = await Avaliacao.scope({ method: ['series', escopo.pares] }).findAll({
    where: { status: { [Op.in]: ['publicada', 'encerrada'] } },
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo' },
      { model: AvaliacaoDisciplina, as: 'disciplinas', include: [{ model: Disciplina, as: 'disciplina' }] },
    ],
    order: [['updated_at', 'DESC']],
  });
  return {
    avaliacoes: avs.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      status: a.status,
      ano_letivo_id: a.ano_letivo_id,
      serie_id: a.serie_id,
      rotulo: `${a.titulo} — ${a.serie.nome} — ${a.anoLetivo.ano}${a.status === 'encerrada' ? ' (encerrada)' : ''}`,
      disciplinas: a.disciplinas
        .map((d) => ({
          id: d.disciplina_id,
          sigla: d.disciplina.sigla,
          nome: d.disciplina.nome,
          data: d.data_aplicacao,
        }))
        .sort((x, y) => x.id - y.id),
    })),
    turmas: turmas.map((t) => ({
      id: t.id,
      ano_letivo_id: t.ano_letivo_id,
      serie_id: t.serie_id,
      nome: `${t.serie.nome} ${t.letra}`,
      podeLancar: pode(usuario, 'lancamentos:lancar') && escopoSvc.podeLancarTurma(escopo, t.id),
    })),
  };
}

async function contexto(avaliacaoId, turmaId, escopo) {
  const av = await Avaliacao.findByPk(avaliacaoId);
  if (!av) throw AppError.notFound('Avaliação não encontrada.');
  const turma = await Turma.findByPk(turmaId, {
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo' },
    ],
  });
  if (!turma) throw AppError.notFound('Turma não encontrada.');
  if (!escopoSvc.podeVerTurma(escopo, turmaId)) throw AppError.forbidden('Você não tem acesso a esta turma.');
  if (av.serie_id !== turma.serie_id || av.ano_letivo_id !== turma.ano_letivo_id)
    throw AppError.badRequest('Esta avaliação não é da série/ano letivo da turma.');
  return { av, turma };
}

async function definicoes(avaliacaoId, { disciplinaId, transaction } = {}) {
  const qs = await avaliacoesSvc.carregarQuestoes(avaliacaoId, { disciplinaId, transaction });
  const folhas = correcao.questoesFolha(qs.map((q) => ({ id: q.id, questao_pai_id: q.questao_pai_id })));
  const idsFolha = new Set(folhas.map((q) => q.id));
  return qs.filter((q) => idsFolha.has(q.id));
}

/** Dados da grade: questões (folha), alunos, respostas e presença. */
async function carregarGrade({ avaliacao, turma, disciplina }, usuario, escopo) {
  const { av, turma: t } = await contexto(avaliacao, turma, escopo);
  if (av.status === 'rascunho') throw AppError.badRequest('A avaliação ainda está em rascunho.');
  const qs = await definicoes(avaliacao, { disciplinaId: disciplina });
  const alunos = await Aluno.findAll({
    where: { turma_id: turma },
    order: [['numero_chamada', 'ASC']],
    attributes: ['id', 'numero_chamada', 'nome', 'situacao'],
  });
  const ids = alunos.map((a) => a.id).concat(0);
  const respostas = await Resposta.findAll({
    where: { avaliacao_id: avaliacao, aluno_id: ids, questao_id: qs.map((q) => q.id).concat(0) },
    attributes: ['aluno_id', 'questao_id', 'aspecto_id', 'valor', 'pontos'],
    raw: true,
  });
  const participacoes = await Participacao.findAll({
    where: { avaliacao_id: avaliacao, disciplina_id: disciplina, aluno_id: ids },
    raw: true,
  });
  const podeEditar =
    pode(usuario, 'lancamentos:lancar') &&
    escopoSvc.podeLancarTurma(escopo, turma) &&
    av.status === 'publicada';
  return {
    avaliacao: { id: av.id, titulo: av.titulo, status: av.status },
    turma: { id: t.id, nome: `${t.serie.nome} ${t.letra}`, ano: t.anoLetivo.ano },
    disciplina_id: Number(disciplina),
    podeEditar,
    motivoLeitura: podeEditar
      ? null
      : av.status === 'encerrada'
        ? 'Avaliação encerrada — somente leitura.'
        : 'Somente leitura: você não leciona nesta turma.',
    questoes: qs.map(avaliacoesSvc.plainQuestao),
    alunos: alunos.map((a) => a.get({ plain: true })),
    respostas: respostas.map((r) => ({ ...r, pontos: Number(r.pontos) })),
    presencas: participacoes.map((p) => ({ aluno_id: p.aluno_id, presenca: p.presenca })),
  };
}

/**
 * Grava um lote de respostas/presenças (autosave da grade e importação).
 * Revalida tudo no servidor: turma no escopo de lançamento, aluno da turma, questão da avaliação, valor aceito.
 */
async function salvarLote(lote, usuario, escopo, audit, { origem = 'grade' } = {}) {
  const { av } = await contexto(lote.avaliacao_id, lote.turma_id, escopo);
  if (!pode(usuario, 'lancamentos:lancar') || !escopoSvc.podeLancarTurma(escopo, lote.turma_id))
    throw AppError.forbidden('Você só pode lançar respostas nas suas turmas.');
  if (av.status !== 'publicada') throw AppError.conflict('Só é possível lançar em avaliações publicadas.');

  const qsInst = await definicoes(lote.avaliacao_id, { disciplinaId: lote.disciplina_id });
  const defs = new Map(qsInst.map((q) => [q.id, correcao.definicao(q)]));
  const discDaQuestao = new Map(qsInst.map((q) => [q.id, q.disciplina_id]));
  const discsAv = (
    await AvaliacaoDisciplina.findAll({ where: { avaliacao_id: lote.avaliacao_id }, raw: true })
  ).map((d) => d.disciplina_id);
  const alunosTurma = new Set(
    (await Aluno.findAll({ where: { turma_id: lote.turma_id }, attributes: ['id'], raw: true })).map(
      (a) => a.id,
    ),
  );

  const erros = [];
  const gravar = [];
  const apagar = [];
  for (const [i, it] of lote.itens.entries()) {
    const def = defs.get(it.questao_id);
    if (!alunosTurma.has(it.aluno_id)) {
      erros.push({ indice: i, erro: 'Aluno não pertence à turma.' });
      continue;
    }
    if (!def) {
      erros.push({ indice: i, erro: 'Questão inválida para esta avaliação/disciplina.' });
      continue;
    }
    const asp = it.aspecto_id ? def.aspectos.find((a) => a.id === it.aspecto_id) : null;
    if (it.aspecto_id && !asp) {
      erros.push({ indice: i, erro: 'Aspecto inválido.' });
      continue;
    }
    if (def.tipo !== 'producao_texto' && it.aspecto_id) {
      erros.push({ indice: i, erro: 'Questão sem aspectos.' });
      continue;
    }
    const valor = correcao.normalizarValor(def, it.valor, asp);
    if (valor === undefined) {
      erros.push({
        indice: i,
        erro: `Valor "${it.valor}" não aceito em ${def.codigo}${asp ? asp.codigo : ''}.`,
      });
      continue;
    }
    const chave = { aluno_id: it.aluno_id, questao_id: it.questao_id, aspecto_id: it.aspecto_id || null };
    if (valor === null) apagar.push(chave);
    else gravar.push({ ...chave, valor });
  }
  for (const p of lote.presencas) {
    if (!alunosTurma.has(p.aluno_id) || !discsAv.includes(p.disciplina_id))
      erros.push({ erro: 'Presença inválida.' });
  }
  if (erros.length && !gravar.length && !apagar.length && !lote.presencas.length)
    throw AppError.badRequest('Nenhum valor válido para salvar.', { erros });

  const resultado = await sequelize.transaction(async (t) => {
    // Presenças explícitas
    for (const p of lote.presencas.filter(
      (x) => alunosTurma.has(x.aluno_id) && discsAv.includes(x.disciplina_id),
    )) {
      await Participacao.upsert(
        {
          aluno_id: p.aluno_id,
          avaliacao_id: lote.avaliacao_id,
          disciplina_id: p.disciplina_id,
          presenca: p.presenca,
        },
        { transaction: t },
      );
    }
    // Remoções
    if (apagar.length) {
      await Resposta.destroy({
        where: {
          avaliacao_id: lote.avaliacao_id,
          [Op.or]: apagar.map((a) => ({
            aluno_id: a.aluno_id,
            questao_id: a.questao_id,
            aspecto_id: a.aspecto_id,
          })),
        },
        transaction: t,
      });
    }
    // Inclusões/alterações (ON DUPLICATE KEY UPDATE pela chave única aluno+questão+aspecto)
    if (gravar.length) {
      await Resposta.bulkCreate(
        ultimaPorChave(
          gravar.map((g) => ({ ...g, avaliacao_id: lote.avaliacao_id, pontos: 0, lancado_por: usuario.id })),
          chaveResposta,
        ),
        { updateOnDuplicate: ['valor', 'lancado_por', 'updated_at'], transaction: t },
      );
      // Participação "presente" criada automaticamente para quem recebeu respostas
      const pares = new Map();
      for (const g of gravar)
        pares.set(`${g.aluno_id}:${discDaQuestao.get(g.questao_id)}`, {
          aluno_id: g.aluno_id,
          disciplina_id: discDaQuestao.get(g.questao_id),
        });
      const existentes = await Participacao.findAll({
        where: { avaliacao_id: lote.avaliacao_id, aluno_id: [...new Set(gravar.map((g) => g.aluno_id))] },
        transaction: t,
        raw: true,
      });
      const tem = new Set(existentes.map((e) => `${e.aluno_id}:${e.disciplina_id}`));
      const novas = [...pares.entries()]
        .filter(([k]) => !tem.has(k))
        .map(([, v]) => ({ ...v, avaliacao_id: lote.avaliacao_id, presenca: 'presente' }));
      if (novas.length) await Participacao.bulkCreate(novas, { transaction: t, ignoreDuplicates: true });
    }
    // Recalcula pontos dos pares afetados
    const afetados = new Map();
    for (const x of [...gravar, ...apagar])
      afetados.set(`${x.aluno_id}:${x.questao_id}`, { aluno_id: x.aluno_id, questao_id: x.questao_id });
    await correcao.recalcular(lote.avaliacao_id, { transaction: t, pares: [...afetados.values()] });

    const alunosAfetados = [...new Set([...gravar, ...apagar].map((x) => x.aluno_id))];
    const atualizadas = alunosAfetados.length
      ? await Resposta.findAll({
          where: { avaliacao_id: lote.avaliacao_id, aluno_id: alunosAfetados, questao_id: [...defs.keys()] },
          attributes: ['aluno_id', 'questao_id', 'aspecto_id', 'valor', 'pontos'],
          transaction: t,
          raw: true,
        })
      : [];
    if (gravar.length || apagar.length || lote.presencas.length) {
      await audit(
        {
          acao: origem === 'importacao' ? 'respostas.importar' : 'respostas.lancar',
          entidade: 'avaliacoes',
          entidadeId: lote.avaliacao_id,
          depois: {
            turma_id: lote.turma_id,
            gravadas: gravar.length,
            removidas: apagar.length,
            presencas: lote.presencas.length,
            itens:
              origem === 'grade'
                ? [...gravar, ...apagar.map((a) => ({ ...a, valor: null }))].slice(0, 100)
                : undefined,
          },
        },
        t,
      );
    }
    return { alunosAfetados, respostas: atualizadas.map((r) => ({ ...r, pontos: Number(r.pontos) })) };
  });
  cache.limpar();
  return {
    ...resultado,
    gravadas: gravar.length,
    removidas: apagar.length,
    erros,
    salvoEm: new Date().toISOString(),
  };
}

// ---------- Importação no layout da PoC ----------

async function previaImportacao(buffer, nomeArquivo, avaliacaoId, turmaId, usuario, escopo) {
  const { turma } = await contexto(avaliacaoId, turmaId, escopo);
  if (!escopoSvc.podeLancarTurma(escopo, turmaId))
    throw AppError.forbidden('Você só pode importar respostas nas suas turmas.');
  const qs = (await definicoes(avaliacaoId)).map(avaliacoesSvc.plainQuestao);
  const { principal } = await importacao.lerPlanilha(buffer, nomeArquivo);
  const { mapa, ignoradas } = importacao.mapearColunasRespostas(principal.cabecalhos, qs);
  if (!Object.keys(mapa).length)
    throw AppError.badRequest(
      'Nenhuma coluna de questão reconhecida (esperado: LP01, LP02… MT21, LP17S, LP17A1…).',
    );
  const alunos = await Aluno.findAll({ where: { turma_id: turmaId }, raw: true });
  const usados = new Set();
  const linhas = principal.linhas.map((bruta, i) => {
    const o = importacao.normalizarLinha(bruta);
    const nome = String(o.NOME ?? o.ALUNO ?? '').trim();
    const numero = parseInt(String(o.NUM ?? '').replace(/\D/g, ''), 10) || null;
    const turmaArq = String(o.TURMA ?? '')
      .trim()
      .toUpperCase();
    const r = {
      linha: i + 2,
      numero,
      nome,
      aluno_id: null,
      aluno_nome: null,
      status: 'ok',
      erros: [],
      valores: {},
    };
    if (turmaArq && turmaArq.replace(/.*\s/, '') !== turma.letra) {
      r.status = 'outra_turma';
      r.erros.push(`Turma "${turmaArq}" no arquivo`);
    }
    const { aluno, por } = importacao.casarAluno(alunos, { nome, numero });
    if (aluno) {
      r.aluno_id = aluno.id;
      r.aluno_nome = aluno.nome;
      r.casadoPor = por;
      if (usados.has(aluno.id)) r.erros.push('Aluno repetido no arquivo');
      usados.add(aluno.id);
    } else if (r.status === 'ok') r.status = 'nao_encontrado';
    let preenchidas = 0;
    for (const [col, alvo] of Object.entries(mapa)) {
      const bruto = o[col];
      if (bruto === undefined || String(bruto).trim() === '') continue;
      const v = correcao.normalizarValor(correcao.definicao(alvo.questao), bruto, alvo.aspecto);
      if (v === undefined) r.erros.push(`${alvo.original}: "${bruto}" inválido`);
      else if (v !== null) {
        r.valores[col] = v;
        preenchidas++;
      }
    }
    r.preenchidas = preenchidas;
    if (!preenchidas && r.status === 'ok') r.status = 'vazia';
    return r;
  });
  return {
    colunas: Object.entries(mapa).map(([k, v]) => ({ chave: k, original: v.original })),
    ignoradas,
    linhas,
    resumo: {
      total: linhas.length,
      ok: linhas.filter((l) => l.status === 'ok').length,
      naoEncontrados: linhas.filter((l) => l.status === 'nao_encontrado').length,
      outraTurma: linhas.filter((l) => l.status === 'outra_turma').length,
      vazias: linhas.filter((l) => l.status === 'vazia').length,
      comErros: linhas.filter((l) => l.erros.length).length,
    },
  };
}

/** Confirma a importação: cria alunos escolhidos e grava as respostas (mesmas validações do autosave). */
async function confirmarImportacao({ avaliacao_id, turma_id, linhas }, usuario, escopo, audit) {
  await contexto(avaliacao_id, turma_id, escopo);
  if (!escopoSvc.podeLancarTurma(escopo, turma_id)) throw AppError.forbidden();
  const qs = (await definicoes(avaliacao_id)).map(avaliacoesSvc.plainQuestao);
  const { mapa } = importacao.mapearColunasRespostas(
    Object.keys(Object.assign({}, ...linhas.map((l) => l.valores))),
    qs,
  );
  const itens = [];
  let criados = 0;
  for (const l of linhas) {
    let alunoId = l.aluno_id || null;
    if (!alunoId && l.criar) {
      if (!escopoSvc.podeGerenciarAlunos(escopo, turma_id))
        throw AppError.forbidden('Sem permissão para cadastrar alunos nesta turma.');
      const [a, novo] = await Aluno.findOrCreate({
        where: { turma_id, numero_chamada: l.criar.numero },
        defaults: { turma_id, numero_chamada: l.criar.numero, nome: l.criar.nome },
      });
      if (novo) {
        criados++;
        await audit({
          acao: 'aluno.criar',
          entidade: 'alunos',
          entidadeId: a.id,
          depois: { nome: a.nome, origem: 'importacao_respostas' },
        });
      }
      alunoId = a.id;
    }
    if (!alunoId) continue;
    for (const [col, valor] of Object.entries(l.valores)) {
      const alvo = mapa[col];
      if (!alvo || valor === null) continue;
      itens.push({
        aluno_id: alunoId,
        questao_id: alvo.questao.id,
        aspecto_id: alvo.aspecto ? alvo.aspecto.id : null,
        valor,
      });
    }
  }
  if (!itens.length) throw AppError.badRequest('Nada para importar.');
  const r = await salvarLote({ avaliacao_id, turma_id, itens, presencas: [] }, usuario, escopo, audit, {
    origem: 'importacao',
  });
  return { gravadas: r.gravadas, alunosCriados: criados, erros: r.erros };
}

/** Modelo de planilha (layout da PoC) já com os alunos da turma. */
async function modeloImportacao(avaliacaoId, turmaId, escopo) {
  const { turma } = await contexto(avaliacaoId, turmaId, escopo);
  const qs = (await definicoes(avaliacaoId)).map(avaliacoesSvc.plainQuestao);
  const colunasQ = [];
  for (const q of qs) {
    if (q.tipo === 'producao_texto') {
      colunasQ.push(`${q.codigo}S`);
      for (const a of q.aspectos) colunasQ.push(`${q.codigo}${a.codigo}`);
    } else colunasQ.push(q.codigo);
  }
  const alunos = await Aluno.findAll({
    where: { turma_id: turmaId },
    order: [['numero_chamada', 'ASC']],
    raw: true,
  });
  const colunas = [
    { chave: 'n', titulo: 'Nº', largura: 5 },
    { chave: 'nome', titulo: 'Nome', largura: 40 },
    { chave: 'turma', titulo: 'Turma', largura: 7 },
    { chave: 'ano', titulo: 'Ano', largura: 9 },
    ...colunasQ.map((c) => ({ chave: c, titulo: c, largura: 7 })),
  ];
  const linhas = alunos.map((a) => ({
    n: a.numero_chamada,
    nome: a.nome,
    turma: turma.letra,
    ano: turma.serie.nome,
  }));
  return { colunas, linhas, nome: `modelo_respostas_${turma.serie.nome.replace(/\W+/g, '')}_${turma.letra}` };
}

/** Progresso de lançamento por turma (página Início). */
async function progresso(usuario, escopo) {
  const turmasIds = escopo.turmasLancar === null ? null : escopo.turmasLancar;
  if (turmasIds && !turmasIds.length) return [];
  const turmas = await Turma.scope({ method: ['ids', turmasIds] }).findAll({
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo', where: { ativo: true } },
    ],
  });
  const out = [];
  for (const t of turmas) {
    const avs = await Avaliacao.findAll({
      where: { ano_letivo_id: t.ano_letivo_id, serie_id: t.serie_id, status: 'publicada' },
      include: [{ model: AvaliacaoDisciplina, as: 'disciplinas' }],
    });
    if (!avs.length) continue;
    const totalAlunos = await Aluno.count({ where: { turma_id: t.id } });
    for (const a of avs) {
      const [{ n }] = await sequelize.query(
        'SELECT COUNT(*) AS n FROM participacoes p JOIN alunos al ON al.id = p.aluno_id AND al.deleted_at IS NULL WHERE p.avaliacao_id = ? AND al.turma_id = ?',
        { replacements: [a.id, t.id], type: sequelize.QueryTypes.SELECT },
      );
      const esperado = totalAlunos * a.disciplinas.length;
      out.push({
        turma_id: t.id,
        turma: `${t.serie.nome} ${t.letra}`,
        avaliacao_id: a.id,
        avaliacao: a.titulo,
        lancados: Number(n),
        esperado,
        frac: esperado ? Number(n) / esperado : 0,
        disciplina_id: a.disciplinas[0]?.disciplina_id,
      });
    }
  }
  return out;
}

module.exports = {
  opcoes,
  carregarGrade,
  salvarLote,
  previaImportacao,
  confirmarImportacao,
  modeloImportacao,
  progresso,
  definicoes,
};
