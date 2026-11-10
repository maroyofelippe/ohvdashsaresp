const usuarios = require('../services/usuarios.service');
const authService = require('../services/auth.service');
const auditoria = require('../services/auditoria.service');
const configuracoes = require('../services/configuracoes.service');
const legado = require('../services/legado.service');
const v = require('../validators/cadastros.validators');
const { parse } = require('../middlewares/validate');
const { id } = require('../validators/comuns');
const AppError = require('../utils/AppError');

const pid = (req) => parse(id, req.params.id);

module.exports = {
  usuarios: async (req, res) => res.json(await usuarios.listar(req.query)),
  aprovar: async (req, res) => res.json(await usuarios.aprovar(pid(req), auditoria.doReq(req))),
  atualizar: async (req, res) =>
    res.json(
      await usuarios.atualizar(pid(req), parse(v.usuarioAdmin, req.body), auditoria.doReq(req), req.usuario),
    ),
  redefinirSenha: async (req, res) => res.json(await usuarios.redefinirSenha(pid(req), auditoria.doReq(req))),
  linkConfirmacao: async (req, res) => {
    const r = await authService.gerarLinkConfirmacao(pid(req));
    await auditoria.doReq(req)({
      acao: 'usuario.link_confirmacao_gerado',
      entidade: 'usuarios',
      entidadeId: r.usuario.id,
    });
    res.json(r);
  },
  excluir: async (req, res) => {
    await usuarios.excluir(pid(req), auditoria.doReq(req), req.usuario);
    res.status(204).end();
  },
  obterConfig: async (req, res) => res.json(await configuracoes.obterTodas()),
  salvarConfig: async (req, res) => {
    const antes = await configuracoes.obterTodas();
    const depois = await configuracoes.salvar(parse(v.configuracoes, req.body));
    await auditoria.doReq(req)({ acao: 'configuracoes.salvar', entidade: 'configuracoes', antes, depois });
    res.json(depois);
  },
  auditoria: async (req, res) => res.json(await auditoria.listar(req.query)),
  legado: async (req, res) => {
    if (!req.file) throw AppError.badRequest('Selecione o arquivo .json do backup.');
    let json;
    try {
      json = JSON.parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw AppError.badRequest('O arquivo não é um JSON válido.');
    }
    const rel = await legado.importar(json, {
      usuario: req.usuario,
      escopo: req.escopo,
      audit: auditoria.doReq(req),
      somenteEstrutura: req.body.somente_estrutura === 'true',
    });
    res.json(rel);
  },
};
