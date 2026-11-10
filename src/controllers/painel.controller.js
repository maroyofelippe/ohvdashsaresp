const svc = require('../services/estatisticas.service');
const auditoria = require('../services/auditoria.service');
const exportacao = require('../services/exportacao.service');
const { parse } = require('../middlewares/validate');
const { z, id, idOpcional } = require('../validators/comuns');
const AppError = require('../utils/AppError');

const filtro = z.object({
  avaliacao: id,
  turmas: z.preprocess(
    (v) => (v ? String(v).split(',').filter(Boolean) : []),
    z.array(z.coerce.number().int().positive()),
  ),
  aluno: idOpcional,
  disciplina: idOpcional,
});

module.exports = {
  opcoes: async (req, res) => res.json(await svc.opcoesFiltro(req.escopo)),
  alunos: async (req, res) => {
    const f = parse(filtro.pick({ avaliacao: true, turmas: true }), req.query);
    res.json(await svc.alunosFiltro(f.avaliacao, f.turmas, req.escopo));
  },
  dados: async (req, res) => res.json(await svc.calcular(parse(filtro, req.query), req.escopo)),
  visao: async (req, res) => {
    if (!svc.VISOES.includes(req.params.visao)) throw AppError.notFound('Visão desconhecida.');
    const d = await svc.calcular(parse(filtro, req.query), req.escopo);
    res.json(svc.tabelaVisao(d, req.params.visao));
  },
  exportar: async (req, res) => {
    const f = parse(filtro, req.query);
    const visao = String(req.query.visao || 'ranking');
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    const d = await svc.calcular(f, req.escopo);
    const nome = `painel_${visao}_${d.avaliacao.titulo.replace(/\W+/g, '_')}`;
    let buffer;
    if (visao === 'tudo' && formato === 'xlsx') {
      buffer = await exportacao.xlsx(
        svc.VISOES.map((v) => ({ nome: v, ...svc.tabelaVisao(d, v) })),
        { titulo: `${d.avaliacao.titulo} — ${d.turmas.map((t) => t.nome).join(', ')}` },
      );
    } else {
      const t = svc.tabelaVisao(d, visao);
      buffer =
        formato === 'csv'
          ? exportacao.csv(t.colunas, t.linhas)
          : await exportacao.xlsx([{ nome: visao, ...t }], {
              titulo: `${d.avaliacao.titulo} — ${d.turmas.map((x) => x.nome).join(', ')}`,
            });
    }
    await auditoria.doReq(req)({
      acao: 'exportar.painel',
      entidade: 'avaliacoes',
      entidadeId: f.avaliacao,
      depois: { visao, formato, turmas: f.turmas },
    });
    exportacao.enviar(res, { buffer, nome, formato });
  },
};
