/**
 * Estatísticas do painel. Agregações no PostgreSQL (GROUP BY) + composição em JS.
 * Resultado em cache por 60 s (invalidado ao lançar respostas).
 */
const { QueryTypes } = require('sequelize');
const db = require('../models');
const AppError = require('../utils/AppError');
const escopoSvc = require('./escopo.service');
const correcao = require('./correcao.service');
const avaliacoesSvc = require('./avaliacoes.service');
const insights = require('./insights.service');
const cache = require('./cache.service');

const {
  Avaliacao,
  Turma,
  Serie,
  AnoLetivo,
  Aluno,
  Participacao,
  Disciplina,
  AvaliacaoDisciplina,
  sequelize,
} = db;

const media = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const r4 = (v) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000;

/** Opções dos filtros, limitadas ao escopo. */
async function opcoesFiltro(escopo) {
  const anos = await AnoLetivo.findAll({ order: [['ano', 'DESC']], raw: true });
  const series = await Serie.findAll({ raw: true });
  const avs = await Avaliacao.scope({ method: ['series', escopo.pares] }).findAll({
    where: { status: ['publicada', 'encerrada'] },
    include: [{ model: AvaliacaoDisciplina, as: 'disciplinas' }],
    order: [['updated_at', 'DESC']],
  });
  const turmas = await Turma.scope({ method: ['ids', escopo.turmasVer] }).findAll({
    include: [{ model: Serie, as: 'serie' }],
    order: [['letra', 'ASC']],
  });
  const disciplinas = await Disciplina.findAll({ raw: true });
  const paresVisiveis = new Set(avs.map((a) => `${a.ano_letivo_id}:${a.serie_id}`));
  return {
    anos: anos
      .filter((a) => avs.some((v) => v.ano_letivo_id === a.id))
      .map((a) => ({ id: a.id, ano: a.ano })),
    series: series
      .filter((s) => avs.some((v) => v.serie_id === s.id))
      .map((s) => ({ id: s.id, nome: s.nome })),
    avaliacoes: avs.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      ano_letivo_id: a.ano_letivo_id,
      serie_id: a.serie_id,
      disciplinas: a.disciplinas.map((d) => d.disciplina_id),
    })),
    turmas: turmas
      .filter((t) => paresVisiveis.has(`${t.ano_letivo_id}:${t.serie_id}`))
      .map((t) => ({
        id: t.id,
        letra: t.letra,
        nome: `${t.serie.nome} ${t.letra}`,
        ano_letivo_id: t.ano_letivo_id,
        serie_id: t.serie_id,
      })),
    disciplinas: disciplinas.map((d) => ({ id: d.id, sigla: d.sigla, nome: d.nome })),
  };
}

async function alunosFiltro(avaliacaoId, turmaIds, escopo) {
  const av = await avaliacoesSvc.buscar(avaliacaoId, escopo);
  const turmas = await turmasDoFiltro(av, turmaIds, escopo);
  return Aluno.findAll({
    where: { turma_id: turmas.map((t) => t.id).concat(0) },
    attributes: ['id', 'nome', 'numero_chamada', 'turma_id'],
    order: [['nome', 'ASC']],
    raw: true,
  });
}

async function turmasDoFiltro(av, turmaIds, escopo) {
  const todas = await Turma.findAll({
    where: { ano_letivo_id: av.ano_letivo_id, serie_id: av.serie_id },
    include: [{ model: Serie, as: 'serie' }],
    order: [['letra', 'ASC']],
  });
  const visiveis = todas.filter((t) => escopoSvc.podeVerTurma(escopo, t.id));
  if (turmaIds && turmaIds.length) {
    const pedidas = visiveis.filter((t) => turmaIds.includes(t.id));
    if (pedidas.length !== new Set(turmaIds).size)
      throw AppError.forbidden('Uma ou mais turmas não estão no seu escopo de visualização.');
    return pedidas;
  }
  return visiveis;
}

/**
 * @param f { avaliacao, turmas: [ids], aluno, disciplina }
 */
async function calcular(f, escopo) {
  const av = await avaliacoesSvc.buscar(f.avaliacao, escopo);
  const turmas = await turmasDoFiltro(av, f.turmas, escopo);
  const chave = `painel:${av.id}:${turmas.map((t) => t.id).join(',')}:${f.disciplina || ''}:${f.aluno || ''}`;
  return cache.lembrar(chave, () => computar(av, turmas, f));
}

async function computar(av, turmas, f) {
  const discsAv = await AvaliacaoDisciplina.findAll({
    where: { avaliacao_id: av.id },
    include: [{ model: Disciplina, as: 'disciplina' }],
    order: [['disciplina_id', 'ASC']],
  });
  let discs = discsAv.map((d) => ({
    id: d.disciplina_id,
    sigla: d.disciplina.sigla,
    nome: d.disciplina.nome,
    data: d.data_aplicacao,
  }));
  if (f.disciplina) discs = discs.filter((d) => d.id === Number(f.disciplina));
  const discIds = new Set(discs.map((d) => d.id));
  const siglaDe = Object.fromEntries(discs.map((d) => [d.id, d.sigla]));

  const qsInst = (await avaliacoesSvc.carregarQuestoes(av.id)).filter((q) => discIds.has(q.disciplina_id));
  const todasDefs = qsInst.map((q) => ({ ...correcao.definicao(q), plain: avaliacoesSvc.plainQuestao(q) }));
  const folhas = correcao.questoesFolha(todasDefs);
  const ativas = folhas.filter((q) => correcao.questaoAtiva(q));
  const semGabarito = folhas.filter((q) => !correcao.questaoAtiva(q)).map((q) => q.codigo);
  const turmaNome = Object.fromEntries(turmas.map((t) => [t.id, `${t.serie.nome} ${t.letra}`]));

  const alunos = await Aluno.findAll({
    where: { turma_id: turmas.map((t) => t.id).concat(0) },
    attributes: ['id', 'nome', 'numero_chamada', 'turma_id'],
    raw: true,
  });
  const alunoIds = alunos.map((a) => a.id).concat(0);
  const parts = await Participacao.findAll({ where: { avaliacao_id: av.id, aluno_id: alunoIds }, raw: true });
  const pres = new Map();
  for (const p of parts) {
    if (!pres.has(p.aluno_id)) pres.set(p.aluno_id, {});
    pres.get(p.aluno_id)[p.disciplina_id] = p.presenca;
  }
  const presente = (aid, did) => pres.get(aid)?.[did] === 'presente';

  // (A) pontos por aluno × questão
  const somaRows = await sequelize.query(
    `SELECT r.aluno_id, r.questao_id, SUM(r.pontos) AS pts
       FROM respostas r
      WHERE r.avaliacao_id = :av AND r.aluno_id IN (:alunos)
      GROUP BY r.aluno_id, r.questao_id`,
    { replacements: { av: av.id, alunos: alunoIds }, type: QueryTypes.SELECT },
  );
  const pts = new Map();
  for (const r of somaRows) pts.set(`${r.aluno_id}:${r.questao_id}`, Number(r.pts));

  // (B) distribuição das respostas por turma × questão × valor (somente presentes)
  const distRows = await sequelize.query(
    `SELECT a.turma_id, r.questao_id, r.valor, COUNT(*) AS n
       FROM respostas r
       JOIN alunos a ON a.id = r.aluno_id
       JOIN questoes q ON q.id = r.questao_id
       JOIN participacoes p ON p.aluno_id = r.aluno_id AND p.avaliacao_id = r.avaliacao_id AND p.disciplina_id = q.disciplina_id AND p.presenca = 'presente'
      WHERE r.avaliacao_id = :av AND r.aluno_id IN (:alunos) AND r.aspecto_id IS NULL
      GROUP BY a.turma_id, r.questao_id, r.valor`,
    { replacements: { av: av.id, alunos: alunoIds }, type: QueryTypes.SELECT },
  );

  // (C) linhas da produção de texto (situação + aspectos)
  const textoIds = ativas.filter((q) => q.tipo === 'producao_texto').map((q) => q.id);
  const textoRows = textoIds.length
    ? await sequelize.query(
        'SELECT aluno_id, questao_id, aspecto_id, valor FROM respostas WHERE avaliacao_id = :av AND aluno_id IN (:alunos) AND questao_id IN (:qs)',
        {
          replacements: { av: av.id, alunos: alunoIds, qs: textoIds },
          type: QueryTypes.SELECT,
        },
      )
    : [];

  const textoPorAluno = new Map();
  for (const r of textoRows) {
    const k = `${r.aluno_id}:${r.questao_id}`;
    if (!textoPorAluno.has(k)) textoPorAluno.set(k, { situacao: null, aspectos: {} });
    if (r.aspecto_id == null) textoPorAluno.get(k).situacao = r.valor;
    else textoPorAluno.get(k).aspectos[r.aspecto_id] = r.valor;
  }

  const fracao = (aid, q) => {
    if (q.anulada) return 1;
    // Produção de texto: cálculo exato a partir dos níveis (evita acumular arredondamentos por aspecto)
    if (q.tipo === 'producao_texto')
      return correcao.pontuarTexto(q, textoPorAluno.get(`${aid}:${q.id}`) || {}).f;
    return q.peso ? (pts.get(`${aid}:${q.id}`) || 0) / q.peso : 0;
  };

  // ---------- Desempenho por aluno ----------
  const resultados = alunos.map((a) => {
    const porDisc = {};
    let ac = 0;
    let tot = 0;
    let part = false;
    let ausente = false;
    for (const d of discs) {
      const qs = ativas.filter((q) => q.disciplina_id === d.id);
      const totD = qs.reduce((s, q) => s + q.peso, 0);
      if (pres.get(a.id)?.[d.id] === 'ausente') ausente = true;
      if (!presente(a.id, d.id) || !totD) {
        porDisc[d.sigla] = null;
        continue;
      }
      const acD = qs.reduce((s, q) => s + fracao(a.id, q) * q.peso, 0);
      porDisc[d.sigla] = {
        ac: r4(acD),
        tot: totD,
        p: r4(acD / totD),
        acertos: qs.filter((q) => fracao(a.id, q) >= 1).length,
      };
      ac += acD;
      tot += totD;
      part = true;
    }
    return {
      id: a.id,
      nome: a.nome,
      numero: a.numero_chamada,
      turma_id: a.turma_id,
      turma: turmaNome[a.turma_id],
      porDisc,
      ac: r4(ac),
      tot,
      p: part ? r4(ac / tot) : null,
      part,
      ausente: !part && ausente,
    };
  });
  const avaliados = resultados.filter((r) => r.part && r.tot);
  const mediaDisc = (lista, sigla) => {
    const l = lista.filter((r) => r.porDisc[sigla]);
    return r4(media(l.map((r) => r.porDisc[sigla].p)));
  };

  const kpis = {
    alunos: resultados.length,
    avaliados: avaliados.length,
    ausentes: resultados.filter((r) => r.ausente).length,
    media: r4(media(avaliados.map((r) => r.p))),
    porDisciplina: discs.map((d) => ({ sigla: d.sigla, nome: d.nome, media: mediaDisc(avaliados, d.sigla) })),
    acima70: avaliados.filter((r) => r.p >= 0.7).length,
    abaixo50: avaliados.filter((r) => r.p < 0.5).length,
    questoes: ativas.length,
    pontos: ativas.reduce((s, q) => s + q.peso, 0),
    semGabarito,
  };
  kpis.pctAcima70 = avaliados.length ? r4(kpis.acima70 / avaliados.length) : null;

  // ---------- Estatística por questão (geral e por turma) ----------
  const distPor = new Map(); // `${turma}:${questao}` → { valor: n }
  for (const r of distRows) {
    const k = `${r.turma_id}:${r.questao_id}`;
    if (!distPor.has(k)) distPor.set(k, {});
    distPor.get(k)[r.valor] = (distPor.get(k)[r.valor] || 0) + Number(r.n);
  }
  function statsQuestao(q, lista) {
    const presentes = lista.filter((a) => presente(a.id, q.disciplina_id));
    const dist = {};
    let soma = 0;
    let nInt = 0;
    let nPar = 0;
    let nZero = 0;
    for (const a of presentes) {
      const fr = fracao(a.id, q);
      soma += fr;
      if (fr >= 1) nInt++;
      else if (fr > 0) nPar++;
      else nZero++;
    }
    if (q.tipo === 'producao_texto') {
      for (const a of presentes) {
        const s = correcao.situacaoTexto(q, textoPorAluno.get(`${a.id}:${q.id}`)) || '—';
        dist[s] = (dist[s] || 0) + 1;
      }
    } else {
      const turmasLista = [...new Set(lista.map((a) => a.turma_id))];
      for (const t of turmasLista)
        for (const [v, n] of Object.entries(distPor.get(`${t}:${q.id}`) || {})) dist[v] = (dist[v] || 0) + n;
      const lancadas = Object.values(dist).reduce((s, n) => s + n, 0);
      if (presentes.length - lancadas > 0) dist['—'] = presentes.length - lancadas;
    }
    return {
      part: presentes.length,
      p: presentes.length ? r4(soma / presentes.length) : null,
      dist,
      nInt,
      nPar,
      nZero,
    };
  }

  const questoes = ativas.map((q) => {
    const s = statsQuestao(q, alunos);
    return {
      id: q.id,
      codigo: q.codigo,
      disciplina: siglaDe[q.disciplina_id],
      tipo: q.tipo,
      gabarito: q.gabarito,
      peso: q.peso,
      anulada: q.anulada,
      habilidade: q.plain.habilidade_bncc,
      descritor: q.plain.descritor,
      niveis: q.plain.niveis,
      situacoes: q.plain.situacoes,
      ...s,
    };
  });
  const comPart = questoes.filter((q) => q.part > 0 && q.p !== null);
  const ordenadas = [...comPart].sort(
    (a, b) => b.p - a.p || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
  );
  const maiores = ordenadas.slice(0, 5);
  const menores = [...comPart]
    .sort((a, b) => a.p - b.p || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    .slice(0, 5);

  // ---------- Ranking ----------
  // Mesma ordenação da PoC: pontos, depois percentual, depois nome.
  const ranking = [...avaliados].sort(
    (a, b) => b.ac - a.ac || b.p - a.p || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  let pos = 0;
  let ult = null;
  ranking.forEach((r, i) => {
    const k = Math.round(r.ac * 10);
    if (k !== ult) {
      pos = i + 1;
      ult = k;
    }
    r.posicao = pos;
  });

  // ---------- Habilidades (geral e por turma) ----------
  function habilidades(lista) {
    const mapa = new Map();
    for (const q of ativas) {
      const cod = q.plain.habilidade_bncc;
      if (!cod) continue;
      const presentes = lista.filter((a) => presente(a.id, q.disciplina_id));
      if (!mapa.has(cod))
        mapa.set(cod, {
          codigo: cod,
          descritor: q.plain.descritor,
          disciplina: siglaDe[q.disciplina_id],
          soma: 0,
          peso: 0,
          n: 0,
          questoes: [],
        });
      const h = mapa.get(cod);
      h.questoes.push(q.codigo);
      for (const a of presentes) {
        h.soma += fracao(a.id, q) * q.peso;
        h.peso += q.peso;
      }
      h.n = Math.max(h.n, presentes.length);
    }
    return [...mapa.values()].map((h) => ({
      codigo: h.codigo,
      descritor: h.descritor,
      disciplina: h.disciplina,
      questoes: h.questoes,
      n: h.n,
      p: h.peso ? r4(h.soma / h.peso) : null,
    }));
  }
  const habilidadesGeral = habilidades(alunos);
  const habilidadesPorTurma = turmas.map((t) => ({
    turma_id: t.id,
    turma: turmaNome[t.id],
    habilidades: habilidades(alunos.filter((a) => a.turma_id === t.id)),
  }));

  // ---------- Produção de texto ----------
  const texto = ativas
    .filter((q) => q.tipo === 'producao_texto')
    .map((q) => {
      const presentes = alunos.filter((a) => presente(a.id, q.disciplina_id));
      const situacoes = {};
      const aspectos = q.plain.aspectos.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nome: a.nome,
        max: correcao.maxNiveis(a.niveis),
        niveis: a.niveis,
        dist: {},
        soma: 0,
        n: 0,
      }));
      let somaPts = 0;
      for (const al of presentes) {
        const v = textoPorAluno.get(`${al.id}:${q.id}`);
        const r = correcao.pontuarTexto(q, v || {});
        const s = r.situacao || '—';
        situacoes[s] = (situacoes[s] || 0) + 1;
        somaPts += r.pontos;
        const def = q.situacoes.find((x) => x.codigo === r.situacao);
        if (!def || def.zera_nota) continue;
        for (const a of aspectos) {
          const val = v?.aspectos?.[a.id];
          const n = a.niveis.find((x) => x.codigo === val);
          if (!n) continue;
          a.dist[val] = (a.dist[val] || 0) + 1;
          a.soma += a.max ? n.pontos / a.max : 0;
          a.n++;
        }
      }
      return {
        codigo: q.codigo,
        max: correcao.maxTexto(q),
        mediaPontos: presentes.length ? r4(somaPts / presentes.length) : null,
        p: presentes.length ? r4(somaPts / presentes.length / (correcao.maxTexto(q) || 1)) : null,
        situacoes: q.plain.situacoes
          .map((s) => ({ ...s, n: situacoes[s.codigo] || 0 }))
          .concat(
            situacoes['—']
              ? [{ codigo: '—', nome: 'Sem lançamento', zera_nota: true, n: situacoes['—'] }]
              : [],
          ),
        aspectos: aspectos.map((a) => ({
          codigo: a.codigo,
          nome: a.nome,
          max: a.max,
          niveis: a.niveis.map((n) => ({ codigo: n.codigo, pontos: n.pontos, n: a.dist[n.codigo] || 0 })),
          p: a.n ? r4(a.soma / a.n) : null,
          n: a.n,
        })),
      };
    });

  // ---------- Escalares ----------
  const escalares = questoes
    .filter((q) => q.tipo === 'escalar')
    .map((q) => ({
      codigo: q.codigo,
      habilidade: q.habilidade,
      p: q.p,
      part: q.part,
      niveis: q.niveis.map((n) => ({
        codigo: n.codigo,
        credito: n.credito,
        pontos: n.pontos,
        descricao: n.descricao,
        n: q.dist[n.codigo] || 0,
      })),
      semResposta: (q.dist['—'] || 0) + (q.dist['-'] || 0),
      integral: q.nInt,
      parcial: q.nPar,
      nenhum: q.nZero,
    }));

  // ---------- Mapa de calor ----------
  const mapaCalor = {
    questoes: ativas.map((q) => ({ id: q.id, codigo: q.codigo, disciplina: siglaDe[q.disciplina_id] })),
    alunos: ranking.map((r) => ({
      id: r.id,
      nome: r.nome,
      turma: r.turma,
      p: r.p,
      valores: ativas.map((q) => (presente(r.id, q.disciplina_id) ? r4(fracao(r.id, q)) : null)),
    })),
  };

  // ---------- Comparativo e insights por turma ----------
  const porTurma = turmas.map((t) => {
    const lista = alunos.filter((a) => a.turma_id === t.id);
    const av2 = avaliados.filter((r) => r.turma_id === t.id);
    const qsT = ativas.map((q) => {
      const s = statsQuestao(q, lista);
      return {
        codigo: q.codigo,
        tipo: q.tipo,
        gabarito: q.gabarito,
        habilidade: q.plain.habilidade_bncc,
        ...s,
      };
    });
    const textoT = ativas
      .filter((q) => q.tipo === 'producao_texto')
      .map((q) => {
        const zeradas = {};
        for (const a of lista.filter((x) => presente(x.id, q.disciplina_id))) {
          const s = correcao.situacaoTexto(q, textoPorAluno.get(`${a.id}:${q.id}`));
          const def = q.situacoes.find((x) => x.codigo === s);
          if (def && def.zera_nota) zeradas[def.nome] = (zeradas[def.nome] || 0) + 1;
        }
        return { codigo: q.codigo, zeradas };
      });
    const resumo = {
      turma_id: t.id,
      turma: turmaNome[t.id],
      alunos: lista.length,
      avaliados: av2.length,
      ausentes: resultados.filter((r) => r.turma_id === t.id && r.ausente).length,
      media: r4(media(av2.map((r) => r.p))),
      porDisciplina: discs.map((d) => ({ sigla: d.sigla, media: mediaDisc(av2, d.sigla) })),
      acima70: av2.filter((r) => r.p >= 0.7).length,
    };
    resumo.insights = insights.gerar({
      nome: resumo.turma,
      avaliados: av2.length,
      media: resumo.media,
      habilidades: habilidadesPorTurma.find((h) => h.turma_id === t.id).habilidades,
      questoes: qsT,
      alunos: av2.map((r) => ({ nome: r.nome, p: r.p })),
      texto: textoT,
    });
    return resumo;
  });

  // ---------- Aluno individual ----------
  let aluno = null;
  if (f.aluno) {
    const r = resultados.find((x) => x.id === Number(f.aluno));
    if (r) {
      aluno = {
        ...r,
        posicao: ranking.find((x) => x.id === r.id)?.posicao || null,
        de: ranking.length,
        questoes: ativas.map((q) => {
          const t = textoPorAluno.get(`${r.id}:${q.id}`);
          return {
            codigo: q.codigo,
            disciplina: siglaDe[q.disciplina_id],
            gabarito: q.gabarito,
            presente: presente(r.id, q.disciplina_id),
            f: presente(r.id, q.disciplina_id) ? r4(fracao(r.id, q)) : null,
            situacao: q.tipo === 'producao_texto' ? correcao.situacaoTexto(q, t) : undefined,
          };
        }),
      };
    }
  }

  return {
    avaliacao: { id: av.id, titulo: av.titulo, status: av.status, disciplinas: discs },
    turmas: turmas.map((t) => ({ id: t.id, nome: turmaNome[t.id] })),
    kpis,
    questoes,
    maiores,
    menores,
    ranking: ranking.map((r) => ({
      posicao: r.posicao,
      id: r.id,
      nome: r.nome,
      numero: r.numero,
      turma: r.turma,
      porDisc: r.porDisc,
      ac: r.ac,
      tot: r.tot,
      p: r.p,
    })),
    habilidades: habilidadesGeral,
    habilidadesPorTurma,
    texto,
    escalares,
    mapaCalor,
    porTurma,
    aluno,
    geradoEm: new Date().toISOString(),
  };
}

/** Linhas tabulares de cada visão (exportação xlsx/csv). */
function tabelaVisao(dados, visao) {
  const pct = (v) => (v === null || v === undefined ? '' : Math.round(v * 1000) / 10);
  const discs = dados.avaliacao.disciplinas.map((d) => d.sigla);
  switch (visao) {
    case 'kpis':
      return {
        colunas: [
          { chave: 'k', titulo: 'Indicador', largura: 34 },
          { chave: 'v', titulo: 'Valor' },
        ],
        linhas: [
          { k: 'Alunos avaliados', v: dados.kpis.avaliados },
          { k: 'Ausentes', v: dados.kpis.ausentes },
          { k: 'Média geral (%)', v: pct(dados.kpis.media) },
          ...dados.kpis.porDisciplina.map((d) => ({ k: `Média ${d.sigla} (%)`, v: pct(d.media) })),
          { k: 'Alunos ≥ 70%', v: dados.kpis.acima70 },
          { k: '% de alunos ≥ 70%', v: pct(dados.kpis.pctAcima70) },
        ],
      };
    case 'questoes': {
      const valores = [...new Set(dados.questoes.flatMap((q) => Object.keys(q.dist)))].sort();
      return {
        colunas: [
          { chave: 'codigo', titulo: 'Questão' },
          { chave: 'disciplina', titulo: 'Disc.' },
          { chave: 'tipo', titulo: 'Tipo' },
          { chave: 'gabarito', titulo: 'Gabarito' },
          { chave: 'habilidade', titulo: 'Habilidade' },
          { chave: 'part', titulo: 'Respondentes' },
          { chave: 'p', titulo: '% acerto' },
          ...valores.map((v) => ({
            chave: `d_${v}`,
            titulo: v === '—' ? 'Sem resposta' : v === '-' ? 'Em branco' : v === 'X' ? 'Rasura' : v,
          })),
        ],
        linhas: dados.questoes.map((q) => ({
          ...q,
          p: pct(q.p),
          ...Object.fromEntries(valores.map((v) => [`d_${v}`, q.dist[v] || 0])),
        })),
      };
    }
    case 'ranking':
      return {
        colunas: [
          { chave: 'posicao', titulo: 'Posição' },
          { chave: 'nome', titulo: 'Aluno', largura: 40 },
          { chave: 'turma', titulo: 'Turma' },
          ...discs.map((d) => ({ chave: `p_${d}`, titulo: `${d} (%)` })),
          { chave: 'ac', titulo: 'Pontos' },
          { chave: 'tot', titulo: 'Total' },
          { chave: 'p', titulo: 'Geral (%)' },
        ],
        linhas: dados.ranking.map((r) => ({
          ...r,
          p: pct(r.p),
          ...Object.fromEntries(discs.map((d) => [`p_${d}`, r.porDisc[d] ? pct(r.porDisc[d].p) : ''])),
        })),
      };
    case 'habilidades':
      return {
        colunas: [
          { chave: 'turma', titulo: 'Turma' },
          { chave: 'codigo', titulo: 'Habilidade' },
          { chave: 'descritor', titulo: 'Descritor', largura: 60 },
          { chave: 'questoes', titulo: 'Questões' },
          { chave: 'p', titulo: '% acerto' },
        ],
        linhas: [
          ...dados.habilidades.map((h) => ({
            turma: 'Todas',
            ...h,
            questoes: h.questoes.join(', '),
            p: pct(h.p),
          })),
          ...dados.habilidadesPorTurma.flatMap((t) =>
            t.habilidades.map((h) => ({
              turma: t.turma,
              ...h,
              questoes: h.questoes.join(', '),
              p: pct(h.p),
            })),
          ),
        ],
      };
    case 'comparativo':
      return {
        colunas: [
          { chave: 'turma', titulo: 'Turma' },
          { chave: 'alunos', titulo: 'Alunos' },
          { chave: 'avaliados', titulo: 'Avaliados' },
          { chave: 'ausentes', titulo: 'Ausentes' },
          { chave: 'media', titulo: 'Média (%)' },
          ...discs.map((d) => ({ chave: `m_${d}`, titulo: `${d} (%)` })),
          { chave: 'acima70', titulo: '≥ 70%' },
        ],
        linhas: dados.porTurma.map((t) => ({
          ...t,
          media: pct(t.media),
          ...Object.fromEntries(t.porDisciplina.map((d) => [`m_${d.sigla}`, pct(d.media)])),
        })),
      };
    case 'mapa':
      return {
        colunas: [
          { chave: 'nome', titulo: 'Aluno', largura: 40 },
          { chave: 'turma', titulo: 'Turma' },
          ...dados.mapaCalor.questoes.map((q) => ({ chave: q.codigo, titulo: q.codigo })),
          { chave: 'p', titulo: 'Geral (%)' },
        ],
        linhas: dados.mapaCalor.alunos.map((a) => ({
          nome: a.nome,
          turma: a.turma,
          p: pct(a.p),
          ...Object.fromEntries(
            dados.mapaCalor.questoes.map((q, i) => [
              q.codigo,
              a.valores[i] === null ? 'F' : pct(a.valores[i]),
            ]),
          ),
        })),
      };
    case 'texto':
      return {
        colunas: [
          { chave: 'q', titulo: 'Questão' },
          { chave: 'item', titulo: 'Situação / aspecto', largura: 30 },
          { chave: 'detalhe', titulo: 'Distribuição', largura: 50 },
          { chave: 'p', titulo: '% aproveitamento' },
        ],
        linhas: dados.texto.flatMap((t) => [
          ...t.situacoes.map((s) => ({
            q: t.codigo,
            item: `Situação ${s.codigo} – ${s.nome}`,
            detalhe: s.n,
            p: '',
          })),
          ...t.aspectos.map((a) => ({
            q: t.codigo,
            item: `${a.codigo} – ${a.nome}`,
            detalhe: a.niveis.map((n) => `${n.codigo}: ${n.n}`).join(' · '),
            p: pct(a.p),
          })),
        ]),
      };
    case 'escalares':
      return {
        colunas: [
          { chave: 'q', titulo: 'Questão' },
          { chave: 'nivel', titulo: 'Nível' },
          { chave: 'credito', titulo: 'Crédito' },
          { chave: 'n', titulo: 'Alunos' },
        ],
        linhas: dados.escalares.flatMap((e) =>
          e.niveis.map((n) => ({ q: e.codigo, nivel: n.codigo, credito: n.credito, n: n.n })),
        ),
      };
    case 'insights':
      return {
        colunas: [
          { chave: 'turma', titulo: 'Turma' },
          { chave: 'tipo', titulo: 'Tipo' },
          { chave: 'texto', titulo: 'Insight', largura: 100 },
        ],
        linhas: dados.porTurma.flatMap((t) => [
          ...t.insights.positivos.map((x) => ({ turma: t.turma, tipo: 'Ponto positivo', texto: x })),
          ...t.insights.atencao.map((x) => ({ turma: t.turma, tipo: 'Ponto de atenção', texto: x })),
          ...t.insights.recomendacoes.map((x) => ({ turma: t.turma, tipo: 'Recomendação', texto: x })),
        ]),
      };
    default:
      throw AppError.badRequest('Visão desconhecida.');
  }
}

const VISOES = [
  'kpis',
  'questoes',
  'ranking',
  'habilidades',
  'comparativo',
  'mapa',
  'texto',
  'escalares',
  'insights',
];

module.exports = { opcoesFiltro, alunosFiltro, calcular, tabelaVisao, VISOES };
