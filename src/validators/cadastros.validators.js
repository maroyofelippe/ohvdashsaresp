const { z, id, textoOpc, listaIds } = require('./comuns');

const anoLetivo = z.object({
  ano: z.coerce.number().int().min(2000, 'Ano inválido.').max(2100, 'Ano inválido.'),
  ativo: z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean()),
});
const serie = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome (ex.: 2º ANO).')
    .max(40)
    .transform((s) => s.toUpperCase()),
  etapa: z.enum(['EF-AI', 'EF-AF', 'EM']),
  ordem: z.coerce.number().int().min(0).max(99),
});
const turma = z.object({
  ano_letivo_id: id,
  serie_id: id,
  letra: z
    .string()
    .trim()
    .min(1, 'Informe a letra.')
    .max(3)
    .transform((s) => s.toUpperCase()),
  periodo: z.enum(['manha', 'tarde', 'integral']),
});
const aluno = z.object({
  turma_id: id,
  numero_chamada: z.coerce
    .number({ invalid_type_error: 'Informe o nº.' })
    .int()
    .min(1, 'Nº inválido.')
    .max(999),
  nome: z.string().trim().min(3, 'Informe o nome.').max(150),
  ra: textoOpc(20).refine((s) => !s || /^[0-9A-Za-z-]{4,20}$/.test(s), 'RA inválido.'),
  situacao: z.enum(['ativo', 'transferido', 'remanejado']),
});
const usuarioAdmin = z.object({
  perfil: z.enum(['coordenador', 'professor', 'admin']),
  status: z.enum(['pendente_email', 'pendente', 'ativo', 'inativo']),
  turmas: listaIds,
});
const configuracoes = z.object({
  governo: textoOpc(200),
  secretaria: textoOpc(200),
  diretoria: textoOpc(200),
  escola: textoOpc(200),
  municipio: textoOpc(120),
  codigo_cie: textoOpc(20),
  endereco: textoOpc(250),
  telefone: textoOpc(60),
  email: textoOpc(120),
  logotipo: textoOpc(400).refine(
    (s) => !s || s.startsWith('/img/') || s.startsWith('data:image/'),
    'Use um caminho em /img/ ou imagem em data URI.',
  ),
});

module.exports = { anoLetivo, serie, turma, aluno, usuarioAdmin, configuracoes };
