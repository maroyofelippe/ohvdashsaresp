/**
 * Regras de correção — funções puras (100% cobertas por testes) + recálculo em banco.
 *
 * Definição de questão esperada (objeto simples):
 *   { id, tipo: 'objetiva'|'escalar'|'producao_texto', gabarito, peso, anulada, num_alternativas,
 *     niveis: [{ codigo, codigo_alt, pontos, credito }],                // escalar
 *     situacoes: [{ codigo, nome, zera_nota }],                          // produção de texto
 *     aspectos: [{ id, codigo, niveis: [{ codigo, pontos }] }] }         // produção de texto
 *
 * Para cada resposta grava-se `pontos = f × peso`, com f ∈ [0, 1].
 * Produção de texto: a linha da situação (aspecto_id = null) recebe 0 e cada aspecto recebe
 * (pontos do nível / Σ máximos dos aspectos) × peso — assim SUM(pontos) da questão = f × peso.
 */
const env = require('../config/env');

const BRANCO = '-';
const RASURA = 'X';
const LETRAS = 'ABCDEFGHIJ';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const arred = (v) => Math.round(v * 1000) / 1000;

function maxNiveis(niveis) {
  return (niveis || []).reduce((m, n) => Math.max(m, num(n.pontos)), 0);
}
function maxTexto(q) {
  return (q.aspectos || []).reduce((s, a) => s + maxNiveis(a.niveis), 0);
}
function opcoes(cfg) {
  return { anuladaContaAcerto: cfg?.anuladaContaAcerto ?? env.ANULADA_CONTA_ACERTO };
}

/** Questão entra no cálculo (tem gabarito/escala válidos)? */
function questaoAtiva(q, cfg) {
  const { anuladaContaAcerto } = opcoes(cfg);
  if (q.anulada) return anuladaContaAcerto;
  if (q.tipo === 'objetiva') return !!q.gabarito;
  if (q.tipo === 'escalar') return maxNiveis(q.niveis) > 0;
  if (q.tipo === 'producao_texto') return maxTexto(q) > 0;
  return false;
}

/** Valores aceitos na célula. `aspecto` (opcional) para aspectos da produção de texto. */
function valoresValidos(q, aspecto) {
  if (q.tipo === 'objetiva') return [...LETRAS.slice(0, q.num_alternativas || 4), BRANCO, RASURA];
  if (q.tipo === 'escalar') return [...(q.niveis || []).map((n) => n.codigo), BRANCO];
  if (aspecto) return (aspecto.niveis || []).map((n) => n.codigo);
  return (q.situacoes || []).map((s) => s.codigo);
}

/** Normaliza um valor digitado/importado (aceita códigos SARESP como "20"/"10" e nomes de situação). */
function normalizarValor(q, bruto, aspecto) {
  if (bruto === null || bruto === undefined) return null;
  let v = String(bruto).trim();
  if (v === '') return null;
  if (v === '—' || v === '–') v = BRANCO;
  const up = v.toUpperCase();
  const validos = valoresValidos(q, aspecto);
  if (validos.includes(up)) return up;
  if (q.tipo === 'escalar') {
    const n = (q.niveis || []).find(
      (x) =>
        x.codigo_alt &&
        String(x.codigo_alt).replace(/^0+(?=\d)/, '') === up.replace(/^0+(?=\d)/, '') &&
        String(x.codigo_alt).length === up.length,
    );
    if (n) return n.codigo;
  }
  if (q.tipo === 'producao_texto' && !aspecto) {
    const sem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const s = (q.situacoes || []).find(
      (x) => sem(x.nome) === sem(v) || sem(`${x.codigo} - ${x.nome}`) === sem(v),
    );
    if (s) return s.codigo;
  }
  return undefined; // inválido
}

function fracaoObjetiva(q, valor, cfg) {
  if (q.anulada) return opcoes(cfg).anuladaContaAcerto ? 1 : 0;
  if (!q.gabarito || !valor) return 0;
  return String(valor).toUpperCase() === String(q.gabarito).toUpperCase() ? 1 : 0;
}

function nivelEscalar(q, valor) {
  return (q.niveis || []).find((n) => n.codigo === valor) || null;
}

function fracaoEscalar(q, valor, cfg) {
  if (q.anulada) return opcoes(cfg).anuladaContaAcerto ? 1 : 0;
  const max = maxNiveis(q.niveis);
  const n = nivelEscalar(q, valor);
  if (!n || !max) return 0;
  return num(n.pontos) / max;
}

/**
 * Situação efetiva do texto: a informada; se ausente mas há aspectos lançados, assume a situação que pontua.
 * @param valores { situacao: 'A'|null, aspectos: { [aspectoId]: 'B' } }
 */
function situacaoTexto(q, valores) {
  const s = valores?.situacao;
  if (s && s !== BRANCO) return s;
  const temAspecto = Object.values(valores?.aspectos || {}).some((v) => v);
  if (!temAspecto) return null;
  const pontua = (q.situacoes || []).find((x) => !x.zera_nota);
  return pontua ? pontua.codigo : 'A';
}

/** Retorna { f, situacao, pontos, max, porAspecto: { [aspectoId]: contribuição em f×peso } } */
function pontuarTexto(q, valores, cfg) {
  const peso = num(q.peso);
  const max = maxTexto(q);
  const porAspecto = {};
  for (const a of q.aspectos || []) porAspecto[a.id] = 0;
  if (q.anulada) {
    const f = opcoes(cfg).anuladaContaAcerto ? 1 : 0;
    return {
      f,
      situacao: valores?.situacao || null,
      pontos: f * max,
      max,
      porAspecto,
      linhaSituacao: f * peso,
    };
  }
  const sit = situacaoTexto(q, valores);
  if (!sit) return { f: 0, situacao: null, pontos: 0, max, porAspecto, linhaSituacao: 0 };
  const defSit = (q.situacoes || []).find((x) => x.codigo === sit);
  if (!defSit || defSit.zera_nota || !max)
    return { f: 0, situacao: sit, pontos: 0, max, porAspecto, linhaSituacao: 0 };
  let pts = 0;
  for (const a of q.aspectos || []) {
    const v = valores?.aspectos?.[a.id];
    const n = (a.niveis || []).find((x) => x.codigo === v);
    if (n) {
      pts += num(n.pontos);
      porAspecto[a.id] = (num(n.pontos) / max) * peso;
    }
  }
  return { f: pts / max, situacao: sit, pontos: pts, max, porAspecto, linhaSituacao: 0 };
}

/**
 * Calcula os pontos de todas as linhas de resposta de UM aluno em UMA questão.
 * @param linhas [{ aspecto_id, valor }]
 * @returns { f, linhas: [{ aspecto_id, valor, pontos }] }
 */
function calcularQuestao(q, linhas, cfg) {
  const peso = num(q.peso);
  if (q.tipo === 'producao_texto') {
    const valores = { situacao: null, aspectos: {} };
    for (const l of linhas) {
      if (l.aspecto_id == null) valores.situacao = l.valor;
      else valores.aspectos[l.aspecto_id] = l.valor;
    }
    const r = pontuarTexto(q, valores, cfg);
    return {
      f: r.f,
      situacao: r.situacao,
      linhas: linhas.map((l) => ({
        ...l,
        pontos: arred(l.aspecto_id == null ? r.linhaSituacao : r.porAspecto[l.aspecto_id] || 0),
      })),
    };
  }
  const l = linhas.find((x) => x.aspecto_id == null);
  const f = q.tipo === 'objetiva' ? fracaoObjetiva(q, l?.valor, cfg) : fracaoEscalar(q, l?.valor, cfg);
  return {
    f: l ? f : q.anulada ? fracaoObjetiva(q, null, cfg) : 0,
    linhas: linhas.map((x) => ({ ...x, pontos: arred(x.aspecto_id == null ? f * peso : 0) })),
  };
}

/** Questões que recebem lançamento: exclui as "agrupadoras" (que possuem subitens). */
function questoesFolha(questoes) {
  const pais = new Set(questoes.filter((q) => q.questao_pai_id).map((q) => q.questao_pai_id));
  return questoes.filter((q) => !pais.has(q.id));
}

/**
 * Nota por disciplina: Σ pontos / Σ pesos (questões ativas).
 * @param pontosPorQuestao { [questaoId]: Σ pontos do aluno }
 */
function notaDisciplina(questoes, pontosPorQuestao, cfg) {
  let pontos = 0;
  let pesos = 0;
  for (const q of questoesFolha(questoes)) {
    if (!questaoAtiva(q, cfg)) continue;
    const peso = num(q.peso);
    pesos += peso;
    pontos += q.anulada ? peso : num(pontosPorQuestao[q.id]);
  }
  return { pontos: arred(pontos), pesos: arred(pesos), percentual: pesos ? pontos / pesos : null };
}

/** Converte instância Sequelize (com includes) em definição simples. */
function definicao(q) {
  const o = typeof q.get === 'function' ? q.get({ plain: true }) : q;
  return {
    id: o.id,
    codigo: o.codigo,
    disciplina_id: o.disciplina_id,
    questao_pai_id: o.questao_pai_id,
    tipo: o.tipo,
    gabarito: o.gabarito,
    peso: num(o.peso),
    anulada: !!o.anulada,
    num_alternativas: o.num_alternativas || 4,
    niveis: (o.niveis || []).map((n) => ({
      codigo: n.codigo,
      codigo_alt: n.codigo_alt,
      pontos: num(n.pontos),
      credito: n.credito,
    })),
    situacoes: (o.situacoes || []).map((s) => ({ codigo: s.codigo, nome: s.nome, zera_nota: !!s.zera_nota })),
    aspectos: (o.aspectos || []).map((a) => ({
      id: a.id,
      codigo: a.codigo,
      niveis: (a.niveis || []).map((n) => ({ codigo: n.codigo, pontos: num(n.pontos) })),
    })),
  };
}

/**
 * Recalcula (em transação) os pontos de todas as respostas de uma avaliação, ou só dos pares informados.
 * @param pares opcional: [{ aluno_id, questao_id }]
 */
async function recalcular(avaliacaoId, { transaction, pares } = {}) {
  const { Questao, EscalaNivel, QuestaoAspecto, QuestaoSituacao, Resposta } = require('../models');
  const { Op } = require('sequelize');
  const qs = await Questao.findAll({
    where: {
      avaliacao_id: avaliacaoId,
      ...(pares ? { id: [...new Set(pares.map((p) => p.questao_id))] } : {}),
    },
    include: [
      { model: EscalaNivel, as: 'niveis' },
      { model: QuestaoSituacao, as: 'situacoes' },
      { model: QuestaoAspecto, as: 'aspectos', include: [{ model: EscalaNivel, as: 'niveis' }] },
    ],
    transaction,
  });
  const defs = new Map(qs.map((q) => [q.id, definicao(q)]));
  const where = { avaliacao_id: avaliacaoId, questao_id: [...defs.keys(), 0] };
  if (pares) {
    if (!pares.length) return 0;
    where[Op.or] = pares.map((p) => ({ aluno_id: p.aluno_id, questao_id: p.questao_id }));
  }
  const respostas = await Resposta.findAll({
    where,
    attributes: ['id', 'aluno_id', 'questao_id', 'aspecto_id', 'valor', 'pontos'],
    transaction,
    raw: true,
  });
  const grupos = new Map();
  for (const r of respostas) {
    const k = `${r.aluno_id}:${r.questao_id}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const mudancas = [];
  for (const linhas of grupos.values()) {
    const def = defs.get(linhas[0].questao_id);
    const antes = new Map(linhas.map((x) => [x.id, num(x.pontos)]));
    for (const l of calcularQuestao(def, linhas).linhas) {
      if (Math.abs(num(l.pontos) - antes.get(l.id)) > 0.0005) mudancas.push(l);
    }
  }
  // Atualiza em lotes agrupados por valor de pontos (poucas queries).
  const porPontos = new Map();
  for (const m of mudancas) {
    const k = String(m.pontos);
    if (!porPontos.has(k)) porPontos.set(k, []);
    porPontos.get(k).push(m.id);
  }
  for (const [pts, ids] of porPontos)
    await Resposta.update({ pontos: Number(pts) }, { where: { id: ids }, transaction });
  return mudancas.length;
}

module.exports = {
  BRANCO,
  RASURA,
  maxNiveis,
  maxTexto,
  questaoAtiva,
  valoresValidos,
  normalizarValor,
  fracaoObjetiva,
  fracaoEscalar,
  nivelEscalar,
  situacaoTexto,
  pontuarTexto,
  calcularQuestao,
  questoesFolha,
  notaDisciplina,
  definicao,
  recalcular,
};
