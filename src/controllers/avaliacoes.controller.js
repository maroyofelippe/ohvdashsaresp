const svc = require('../services/avaliacoes.service');
const auditoria = require('../services/auditoria.service');
const exportacao = require('../services/exportacao.service');
const v = require('../validators/avaliacoes.validators');
const { parse } = require('../middlewares/validate');
const { id } = require('../validators/comuns');
const AppError = require('../utils/AppError');

const pid = (req) => parse(id, req.params.id);

module.exports = {
  listar: async (req, res) => res.json(await svc.listar(req.query, req.escopo)),
  obter: async (req, res) => res.json(await svc.obter(pid(req), req.usuario, req.escopo)),
  criar: async (req, res) =>
    res
      .status(201)
      .json(await svc.criar(parse(v.dados, req.body), req.usuario, req.escopo, auditoria.doReq(req))),
  atualizarDados: async (req, res) =>
    res.json(
      await svc.atualizarDados(
        pid(req),
        parse(v.dados, req.body),
        req.usuario,
        req.escopo,
        auditoria.doReq(req),
      ),
    ),
  salvarEstrutura: async (req, res) =>
    res.json(
      await svc.salvarEstrutura(
        pid(req),
        parse(v.estrutura, req.body),
        req.usuario,
        req.escopo,
        auditoria.doReq(req),
      ),
    ),
  status: async (req, res) =>
    res.json(
      await svc.alterarStatus(
        pid(req),
        parse(v.status, req.body).status,
        req.usuario,
        req.escopo,
        auditoria.doReq(req),
      ),
    ),
  excluir: async (req, res) => {
    await svc.excluir(pid(req), req.usuario, req.escopo, auditoria.doReq(req));
    res.status(204).end();
  },
  duplicar: async (req, res) =>
    res
      .status(201)
      .json(
        await svc.duplicar(
          pid(req),
          parse(v.duplicar, req.body),
          req.usuario,
          req.escopo,
          auditoria.doReq(req),
        ),
      ),
  exportarGabarito: async (req, res) => {
    const r = await svc.exportarGabarito(
      pid(req),
      req.usuario,
      req.escopo,
      req.query.formato === 'csv' ? 'csv' : 'xlsx',
    );
    await auditoria.doReq(req)({
      acao: 'exportar.gabarito',
      entidade: 'avaliacoes',
      entidadeId: req.params.id,
      depois: { formato: r.formato },
    });
    exportacao.enviar(res, r);
  },
  importarGabarito: async (req, res) => {
    if (!req.file) throw AppError.badRequest('Selecione um arquivo .xlsx ou .csv.');
    res.json(
      await svc.importarGabarito(pid(req), req.file.buffer, req.file.originalname, req.usuario, req.escopo),
    );
  },
};
