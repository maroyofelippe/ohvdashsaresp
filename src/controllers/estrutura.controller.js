const svc = require('../services/estrutura.service');
const auditoria = require('../services/auditoria.service');
const v = require('../validators/cadastros.validators');
const { parse } = require('../middlewares/validate');
const { id } = require('../validators/comuns');

const pid = (req) => parse(id, req.params.id);

module.exports = {
  anos: async (req, res) => res.json(await svc.listarAnos()),
  series: async (req, res) => res.json(await svc.listarSeries()),
  turmas: async (req, res) =>
    res.json(await svc.listarTurmas({ anoLetivoId: req.query.ano_letivo_id, serieId: req.query.serie_id })),
  salvarAno: async (req, res) =>
    res
      .status(req.params.id ? 200 : 201)
      .json(
        await svc.salvarAno(req.params.id && pid(req), parse(v.anoLetivo, req.body), auditoria.doReq(req)),
      ),
  excluirAno: async (req, res) => {
    await svc.excluirAno(pid(req), auditoria.doReq(req));
    res.status(204).end();
  },
  salvarSerie: async (req, res) =>
    res
      .status(req.params.id ? 200 : 201)
      .json(await svc.salvarSerie(req.params.id && pid(req), parse(v.serie, req.body), auditoria.doReq(req))),
  excluirSerie: async (req, res) => {
    await svc.excluirSerie(pid(req), auditoria.doReq(req));
    res.status(204).end();
  },
  salvarTurma: async (req, res) =>
    res
      .status(req.params.id ? 200 : 201)
      .json(await svc.salvarTurma(req.params.id && pid(req), parse(v.turma, req.body), auditoria.doReq(req))),
  excluirTurma: async (req, res) => {
    await svc.excluirTurma(pid(req), auditoria.doReq(req));
    res.status(204).end();
  },
};
