/**
 * Importação do backup JSON da prova de conceito (SARESP_OHV_Dashboard.html, versão 3):
 * chaves { versao, meta, questoes, alunos, resp }.
 * Migra avaliação, gabarito (escalas, aspectos, situações, desdobramentos), turmas, alunos e respostas.
 */
const { z } = require('zod');
const db = require('../models');
const AppError = require('../utils/AppError');
const { ultimaPorChave, chaveResposta } = require('../utils/busca');
const avaliacoesSvc = require('./avaliacoes.service');
const correcao = require('./correcao.service');
const cache = require('./cache.service');
const { normalizarNome } = require('../utils/normalizar');
const { dataISO } = require('../utils/formatar');

const { AnoLetivo, Serie, Turma, Aluno, Disciplina, Avaliacao, Resposta, Participacao, sequelize } = db;

const NOMES_DISC = { LP: 'Língua Portuguesa', MT: 'Matemática', CN: 'Ciências', CH: 'Ciências Humanas' };
const CREDITO = { INTEGRAL: 'integral', PARCIAL: 'parcial', NENHUM: 'nenhum' };

const schema = z.object({
  versao: z.union([z.number(), z.string()]).optional(),
  meta: z
    .object({
      titulo: z.string().default('SIMULADO SARESP'),
      ano: z.string().min(1),
      dataLP: z.string().optional(),
      dataMT: z.string().optional(),
    })
    .passthrough(),
  questoes: z
    .array(
      z
        .object({
          code: z.string().regex(/^[A-Za-z]{2,4}\d{1,3}[a-zA-Z]?$/),
          disc: z.string().min(2).max(4),
          tipo: z.enum(['obj', 'esc', 'texto']),
          gab: z.string().optional().default(''),
          peso: z.union([z.number(), z.string()]).optional().default(1),
          hab: z.string().optional().default(''),
          desc: z.string().optional().default(''),
          item: z.string().optional(),
          enunc: z.string().optional(),
          escala: z
            .array(
              z
                .object({
                  c: z.string(),
                  cod: z.string().optional(),
                  cred: z.string().optional(),
                  pts: z.union([z.number(), z.string()]),
                  desc: z.string().optional(),
                })
                .passthrough(),
            )
            .optional(),
          aspectos: z
            .array(
              z
                .object({
                  id: z.string(),
                  nome: z.string(),
                  sobre: z.string().optional(),
                  escala: z.array(
                    z
                      .object({
                        c: z.string(),
                        pts: z.union([z.number(), z.string()]),
                        desc: z.string().optional(),
                      })
                      .passthrough(),
                  ),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    )
    .min(1),
  alunos: z
    .array(
      z
        .object({
          id: z.string(),
          num: z.union([z.string(), z.number()]).optional(),
          nome: z.string(),
          turma: z.string(),
          ano: z.string().optional(),
        })
        .passthrough(),
    )
    .default([]),
  resp: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).default({}),
});

function codigoNormalizado(c) {
  const m = String(c).match(/^([A-Za-z]{2,4})0*(\d{1,3})([a-zA-Z]?)$/);
  return `${m[1].toUpperCase()}${m[2].padStart(2, '0')}${m[3].toLowerCase()}`;
}

/** Converte as questões do legado para o payload de salvarEstrutura (preservando ids existentes). */
function montarEstrutura(dados, discPorSigla, existentes) {
  const porCodigo = new Map(existentes.map((q) => [q.codigo.toUpperCase(), q]));
  const questoes = [];
  dados.questoes.forEach((lq, i) => {
    const codigo = codigoNormalizado(lq.code);
    const ex = porCodigo.get(codigo.toUpperCase());
    const tipo = { obj: 'objetiva', esc: 'escalar', texto: 'producao_texto' }[lq.tipo];
    const peso = Number(String(lq.peso ?? 1).replace(',', '.')) || 1;
    questoes.push({
      id: ex?.id || null,
      chave: ex?.chave || `l${i}`,
      pai_chave: null,
      disciplina_id: discPorSigla[lq.disc.toUpperCase()].id,
      codigo,
      ordem: i + 1,
      tipo,
      num_alternativas: 4,
      gabarito: tipo === 'objetiva' && /^[A-J]$/i.test(lq.gab || '') ? lq.gab.toUpperCase() : null,
      peso,
      habilidade_bncc: String(lq.hab || '')
        .split(/\s|–/)[0]
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 20),
      descritor: String(lq.desc || '')
        .trim()
        .slice(0, 400),
      item_codigo: lq.item || '',
      enunciado_resumo: lq.enunc || '',
      anulada: false,
      niveis:
        tipo === 'escalar'
          ? (lq.escala || []).map((e) => ({
              codigo: e.c.toUpperCase(),
              codigo_alt: e.cod || '',
              credito: CREDITO[normalizarNome(e.cred)] || null,
              pontos: Number(e.pts) || 0,
              descricao: e.desc || '',
            }))
          : [],
      situacoes: tipo === 'producao_texto' ? avaliacoesSvc.SITUACOES_PADRAO : [],
      aspectos:
        tipo === 'producao_texto'
          ? (lq.aspectos || []).map((a) => ({
              id: ex?.aspectos?.find((x) => x.codigo === a.id.toUpperCase())?.id || null,
              codigo: a.id.toUpperCase(),
              nome: a.nome,
              descricao: a.sobre || '',
              niveis: a.escala.map((e) => ({
                codigo: e.c.toUpperCase(),
                codigo_alt: '',
                credito: null,
                pontos: Number(e.pts) || 0,
                descricao: e.desc || '',
              })),
            }))
          : [],
    });
  });
  // Itens desdobrados (LP09a/LP09b) → questão-mãe LP09
  const codigos = new Map(questoes.map((q) => [q.codigo.toUpperCase(), q]));
  for (const q of [...questoes]) {
    const m = q.codigo.match(/^(.*\d)([a-z])$/);
    if (!m) continue;
    let pai = codigos.get(m[1].toUpperCase());
    if (!pai) {
      const ex = porCodigo.get(m[1].toUpperCase());
      pai = {
        id: ex?.id || null,
        chave: ex?.chave || `pai_${m[1]}`,
        pai_chave: null,
        disciplina_id: q.disciplina_id,
        codigo: m[1],
        ordem: q.ordem - 0.5,
        tipo: 'objetiva',
        num_alternativas: 4,
        gabarito: null,
        peso: 1,
        habilidade_bncc: '',
        descritor: ex?.descritor || '',
        item_codigo: '',
        enunciado_resumo: 'Item desdobrado em subitens.',
        anulada: false,
        niveis: [],
        situacoes: [],
        aspectos: [],
      };
      codigos.set(m[1].toUpperCase(), pai);
      questoes.push(pai);
    }
    q.pai_chave = pai.chave;
  }
  questoes.sort((a, b) => a.ordem - b.ordem);
  questoes.forEach((q, i) => (q.ordem = i + 1));
  return questoes;
}

/**
 * @param json conteúdo do arquivo (objeto)
 * @param opcoes { usuario (admin), escopo, audit, somenteEstrutura, status }
 */
async function importar(json, { usuario, escopo, audit, somenteEstrutura = false, status = 'publicada' }) {
  const r = schema.safeParse(json);
  if (!r.success)
    throw AppError.badRequest(
      'Arquivo não reconhecido como backup da PoC (versão 3: meta, questoes, alunos, resp).',
      { erros: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) },
    );
  const dados = r.data;
  const rel = {
    criados: { anoLetivo: false, serie: false, turmas: [], alunos: 0, disciplinas: [] },
    avaliacao: null,
    avaliacaoNova: false,
    questoes: 0,
    alunosAtualizados: 0,
    respostas: 0,
    participacoes: 0,
    ignorados: [],
  };

  // Ano letivo e série
  const dataBase = dataISO(dados.meta.dataLP) || dataISO(dados.meta.dataMT);
  const ano = dataBase ? Number(dataBase.slice(0, 4)) : new Date().getFullYear();
  const [anoLetivo, anoNovo] = await AnoLetivo.findOrCreate({
    where: { ano },
    defaults: { ano, ativo: true },
  });
  rel.criados.anoLetivo = anoNovo;
  const nomeSerie = dados.meta.ano.trim().toUpperCase();
  let serie = (await Serie.findAll()).find((s) => normalizarNome(s.nome) === normalizarNome(nomeSerie));
  if (!serie) {
    const ordem = Number((nomeSerie.match(/\d+/) || [0])[0]);
    serie = await Serie.create({
      nome: nomeSerie,
      etapa: ordem <= 5 ? 'EF-AI' : ordem <= 9 ? 'EF-AF' : 'EM',
      ordem,
    });
    rel.criados.serie = true;
  }

  // Disciplinas
  const discPorSigla = {};
  for (const sig of [...new Set(dados.questoes.map((q) => q.disc.toUpperCase()))]) {
    const [d, novo] = await Disciplina.findOrCreate({
      where: { sigla: sig },
      defaults: { sigla: sig, nome: NOMES_DISC[sig] || sig },
    });
    discPorSigla[sig] = d;
    if (novo) rel.criados.disciplinas.push(sig);
  }
  const datas = { LP: dataISO(dados.meta.dataLP), MT: dataISO(dados.meta.dataMT) };
  const disciplinas = Object.values(discPorSigla).map((d) => ({
    disciplina_id: d.id,
    data_aplicacao: datas[d.sigla] || null,
  }));

  // Avaliação (reutiliza a de mesmo título/série/ano)
  let av = await Avaliacao.findOne({
    where: { titulo: dados.meta.titulo.trim(), ano_letivo_id: anoLetivo.id, serie_id: serie.id },
  });
  if (!av) {
    av = await avaliacoesSvc.criar(
      {
        titulo: dados.meta.titulo.trim(),
        tipo:
          /SARESP/i.test(dados.meta.titulo) && !/SIMULADO/i.test(dados.meta.titulo)
            ? 'saresp_oficial'
            : 'simulado',
        ano_letivo_id: anoLetivo.id,
        serie_id: serie.id,
        disciplinas,
      },
      usuario,
      escopo,
      audit,
    );
    rel.avaliacaoNova = true;
  }
  const atual = await avaliacoesSvc.obter(av.id, usuario, escopo);
  const questoes = montarEstrutura(dados, discPorSigla, atual.questoes);
  await avaliacoesSvc.salvarEstrutura(
    av.id,
    { disciplinas, questoes, confirmar: true },
    usuario,
    escopo,
    audit,
  );
  await Avaliacao.update({ status }, { where: { id: av.id } });
  rel.avaliacao = { id: av.id, titulo: av.titulo };
  rel.questoes = questoes.length;
  if (somenteEstrutura) {
    cache.limpar();
    return rel;
  }

  // Turmas e alunos
  const defs = (await avaliacoesSvc.carregarQuestoes(av.id)).map((q) => ({
    ...correcao.definicao(q),
    codigo: q.codigo,
  }));
  const folhas = correcao.questoesFolha(defs);
  const porCodigo = new Map(folhas.map((q) => [q.codigo.toUpperCase(), q]));
  await sequelize.transaction(async (t) => {
    const turmas = {};
    for (const letra of [...new Set(dados.alunos.map((a) => a.turma.trim().toUpperCase()).filter(Boolean))]) {
      const [tu, novo] = await Turma.findOrCreate({
        where: { ano_letivo_id: anoLetivo.id, serie_id: serie.id, letra },
        defaults: { ano_letivo_id: anoLetivo.id, serie_id: serie.id, letra, periodo: 'manha' },
        transaction: t,
      });
      turmas[letra] = tu;
      if (novo) rel.criados.turmas.push(letra);
    }
    const alunoDe = new Map();
    for (const la of dados.alunos) {
      if (la.ano && normalizarNome(la.ano) !== normalizarNome(nomeSerie)) {
        rel.ignorados.push(`${la.nome}: série "${la.ano}" diferente da avaliação`);
        continue;
      }
      const tu = turmas[la.turma.trim().toUpperCase()];
      if (!tu) {
        rel.ignorados.push(`${la.nome}: sem turma`);
        continue;
      }
      const lista = await Aluno.findAll({ where: { turma_id: tu.id }, transaction: t });
      const num = parseInt(String(la.num ?? ''), 10) || null;
      let al = lista.find((a) => normalizarNome(a.nome) === normalizarNome(la.nome));
      if (!al && num) {
        const mesmoNum = lista.find((a) => a.numero_chamada === num);
        if (mesmoNum && normalizarNome(mesmoNum.nome).split(' ')[0] === normalizarNome(la.nome).split(' ')[0])
          al = mesmoNum;
      }
      if (!al) {
        let numero = num || 1;
        while (lista.some((a) => a.numero_chamada === numero)) numero++;
        al = await Aluno.create(
          { turma_id: tu.id, numero_chamada: numero, nome: la.nome },
          { transaction: t },
        );
        rel.criados.alunos++;
      } else rel.alunosAtualizados++;
      alunoDe.set(la.id, al.id);
    }

    // Respostas (substitui as existentes dos alunos importados nesta avaliação)
    const ids = [...new Set(alunoDe.values())];
    if (ids.length) {
      await Resposta.destroy({ where: { avaliacao_id: av.id, aluno_id: ids }, transaction: t });
      await Participacao.destroy({ where: { avaliacao_id: av.id, aluno_id: ids }, transaction: t });
    }
    const linhas = [];
    const presencas = new Map();
    for (const [lid, respostas] of Object.entries(dados.resp)) {
      const alunoId = alunoDe.get(lid);
      if (!alunoId) continue;
      for (const [k, bruto] of Object.entries(respostas)) {
        if (bruto === null || String(bruto).trim() === '') continue;
        const chave = String(k).trim();
        let q = null;
        let aspecto = null;
        let ehSit = false;
        const mA = chave.match(/^(.*?)(A\d+)$/);
        const mS = chave.match(/^(.*\d)S$/);
        if (mA && porCodigo.get(codigoNormalizado(mA[1]).toUpperCase())?.tipo === 'producao_texto') {
          q = porCodigo.get(codigoNormalizado(mA[1]).toUpperCase());
          aspecto = q.aspectos.find((a) => a.codigo === mA[2].toUpperCase());
        } else if (mS && porCodigo.get(codigoNormalizado(mS[1]).toUpperCase())?.tipo === 'producao_texto') {
          q = porCodigo.get(codigoNormalizado(mS[1]).toUpperCase());
          ehSit = true;
        } else {
          q = /^[A-Za-z]{2,4}\d{1,3}[a-zA-Z]?$/.test(chave)
            ? porCodigo.get(codigoNormalizado(chave).toUpperCase())
            : null;
        }
        if (!q || (q.tipo === 'producao_texto' && !aspecto && !ehSit)) {
          rel.ignorados.push(`Resposta "${chave}" sem questão correspondente`);
          continue;
        }
        const valor = correcao.normalizarValor(q, bruto, aspecto);
        if (!valor) {
          rel.ignorados.push(`Valor "${bruto}" inválido em ${chave}`);
          continue;
        }
        linhas.push({
          avaliacao_id: av.id,
          aluno_id: alunoId,
          questao_id: q.id,
          aspecto_id: aspecto ? aspecto.id : null,
          valor,
          pontos: 0,
          lancado_por: usuario.id,
        });
        presencas.set(`${alunoId}:${q.disciplina_id}`, {
          aluno_id: alunoId,
          avaliacao_id: av.id,
          disciplina_id: q.disciplina_id,
          presenca: 'presente',
        });
      }
    }
    const unicas = ultimaPorChave(linhas, chaveResposta);
    for (let i = 0; i < unicas.length; i += 1000)
      await Resposta.bulkCreate(unicas.slice(i, i + 1000), {
        transaction: t,
        updateOnDuplicate: ['valor', 'updated_at'],
      });
    if (presencas.size)
      await Participacao.bulkCreate([...presencas.values()], { transaction: t, ignoreDuplicates: true });
    rel.respostas = linhas.length;
    rel.participacoes = presencas.size;
    await correcao.recalcular(av.id, { transaction: t });
    await audit(
      {
        acao: 'legado.importar',
        entidade: 'avaliacoes',
        entidadeId: av.id,
        depois: { ...rel, ignorados: rel.ignorados.length },
      },
      t,
    );
  });
  rel.ignorados = [...new Set(rel.ignorados)];
  cache.limpar();
  return rel;
}

module.exports = { importar, montarEstrutura, schema };
