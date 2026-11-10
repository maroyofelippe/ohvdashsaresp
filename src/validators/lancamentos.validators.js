const { z, id } = require('./comuns');

const item = z.object({
  aluno_id: id,
  questao_id: id,
  aspecto_id: id.nullable().optional(),
  valor: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().max(12).nullable()),
});
const lote = z.object({
  avaliacao_id: id,
  turma_id: id,
  disciplina_id: id.optional(),
  itens: z.array(item).max(5000).default([]),
  presencas: z
    .array(z.object({ aluno_id: id, disciplina_id: id, presenca: z.enum(['presente', 'ausente']) }))
    .max(500)
    .default([]),
});
const grade = z.object({ avaliacao: id, turma: id, disciplina: id });
const confirmarImportacao = z.object({
  avaliacao_id: id,
  turma_id: id,
  linhas: z
    .array(
      z.object({
        aluno_id: id.nullable().optional(),
        criar: z
          .object({
            numero: z.coerce.number().int().min(1).max(999),
            nome: z.string().trim().min(3).max(150),
          })
          .nullable()
          .optional(),
        valores: z.record(z.string().max(12), z.string().max(30).nullable()),
      }),
    )
    .max(200),
});
module.exports = { lote, grade, confirmarImportacao };
