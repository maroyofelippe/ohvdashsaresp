const { z, id, textoOpc } = require('./comuns');
const { dataISO } = require('../utils/formatar');

const dataOpc = z.preprocess(
  (v) => (v ? dataISO(v) || '__invalida' : null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .nullable(),
);
const decimal = (min, max) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.replace(',', '.')) : v),
    z.number({ invalid_type_error: 'Número inválido.' }).min(min).max(max),
  );
const codigoNivel = z
  .string()
  .trim()
  .min(1)
  .max(2)
  .transform((s) => s.toUpperCase());

const nivel = z.object({
  codigo: codigoNivel,
  codigo_alt: textoOpc(4),
  credito: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['integral', 'parcial', 'nenhum']).nullable().optional(),
  ),
  pontos: decimal(0, 999),
  descricao: textoOpc(2000),
});
const aspecto = z.object({
  id: id.optional().nullable(),
  codigo: z
    .string()
    .trim()
    .min(1)
    .max(6)
    .transform((s) => s.toUpperCase()),
  nome: z.string().trim().min(1, 'Informe o nome do aspecto.').max(80),
  descricao: textoOpc(2000),
  niveis: z.array(nivel).min(1, 'Cada aspecto precisa de ao menos um nível.').max(10),
});
const situacao = z.object({
  codigo: codigoNivel,
  nome: z.string().trim().min(1).max(40),
  descricao: textoOpc(2000),
  zera_nota: z.boolean(),
});
const questao = z
  .object({
    id: id.optional().nullable(),
    chave: z.string().max(40),
    pai_chave: z.string().max(40).optional().nullable(),
    disciplina_id: id,
    codigo: z
      .string()
      .trim()
      .min(2)
      .max(12)
      .regex(/^[A-Za-z]{2,4}\d{1,3}[a-z]?$/, 'Código inválido (ex.: LP01, LP09a).'),
    ordem: z.coerce.number().int().min(0).max(9999),
    tipo: z.enum(['objetiva', 'escalar', 'producao_texto']),
    num_alternativas: z.coerce.number().int().min(2).max(10).default(4),
    gabarito: z.preprocess(
      (v) => (v ? String(v).trim().toUpperCase() : null),
      z
        .string()
        .regex(/^[A-J]$/)
        .nullable(),
    ),
    peso: decimal(0, 100),
    habilidade_bncc: textoOpc(20),
    descritor: textoOpc(400),
    item_codigo: textoOpc(30),
    enunciado_resumo: textoOpc(4000),
    anulada: z.boolean().default(false),
    niveis: z.array(nivel).max(10).default([]),
    situacoes: z.array(situacao).max(10).default([]),
    aspectos: z.array(aspecto).max(15).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.tipo === 'objetiva' && q.gabarito && q.gabarito.charCodeAt(0) - 65 >= q.num_alternativas) {
      ctx.addIssue({
        code: 'custom',
        message: `${q.codigo}: gabarito fora das alternativas.`,
        path: ['gabarito'],
      });
    }
    if (q.tipo === 'escalar' && !q.niveis.length)
      ctx.addIssue({
        code: 'custom',
        message: `${q.codigo}: cadastre os níveis da escala.`,
        path: ['niveis'],
      });
    if (q.tipo === 'producao_texto' && !q.aspectos.length)
      ctx.addIssue({ code: 'custom', message: `${q.codigo}: cadastre os aspectos.`, path: ['aspectos'] });
    if (q.tipo === 'producao_texto' && !q.situacoes.length)
      ctx.addIssue({
        code: 'custom',
        message: `${q.codigo}: cadastre as situações do texto.`,
        path: ['situacoes'],
      });
    const dup = (arr, k) => arr.length !== new Set(arr.map((x) => x[k])).size;
    if (dup(q.niveis, 'codigo') || dup(q.situacoes, 'codigo') || dup(q.aspectos, 'codigo'))
      ctx.addIssue({ code: 'custom', message: `${q.codigo}: códigos repetidos na escala/aspectos.` });
  });

const dados = z.object({
  titulo: z.string().trim().min(3, 'Informe o título.').max(150),
  tipo: z.enum(['simulado', 'saresp_oficial', 'diagnostica']),
  ano_letivo_id: id,
  serie_id: id,
  disciplinas: z
    .array(z.object({ disciplina_id: id, data_aplicacao: dataOpc }))
    .min(1, 'Selecione ao menos uma disciplina.'),
});

const estrutura = z
  .object({
    disciplinas: z.array(z.object({ disciplina_id: id, data_aplicacao: dataOpc })).min(1),
    questoes: z.array(questao).max(400),
    confirmar: z.boolean().optional(),
  })
  .superRefine((e, ctx) => {
    const cods = e.questoes.map((q) => q.codigo.toUpperCase());
    const rep = cods.filter((c, i) => cods.indexOf(c) !== i);
    if (rep.length)
      ctx.addIssue({
        code: 'custom',
        message: `Códigos repetidos: ${[...new Set(rep)].join(', ')}.`,
        path: ['questoes'],
      });
    const chaves = new Set(e.questoes.map((q) => q.chave));
    for (const q of e.questoes)
      if (q.pai_chave && !chaves.has(q.pai_chave))
        ctx.addIssue({ code: 'custom', message: `${q.codigo}: questão-mãe inexistente.` });
    const discs = new Set(e.disciplinas.map((d) => d.disciplina_id));
    for (const q of e.questoes)
      if (!discs.has(q.disciplina_id))
        ctx.addIssue({ code: 'custom', message: `${q.codigo}: disciplina não incluída na avaliação.` });
  });

const duplicar = z.object({ titulo: z.string().trim().min(3).max(150), ano_letivo_id: id, serie_id: id });
const status = z.object({ status: z.enum(['rascunho', 'publicada', 'encerrada']) });

module.exports = { dados, estrutura, duplicar, status, questao };
