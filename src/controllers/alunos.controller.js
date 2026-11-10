const svc = require('../services/alunos.service');
const auditoria = require('../services/auditoria.service');
const exportacao = require('../services/exportacao.service');
const v = require('../validators/cadastros.validators');
const { parse } = require('../middlewares/validate');
const { id, z } = require('../validators/comuns');
const AppError = require('../utils/AppError');

module.exports = {
  listar: async (req, res) => res.json(await svc.listar(req.query, req.escopo)),
  salvar: async (req, res) => {
    const reg = await svc.salvar(
      req.params.id ? parse(id, req.params.id) : null,
      parse(v.aluno, req.body),
      req.escopo,
      auditoria.doReq(req),
    );
    res.status(req.params.id ? 200 : 201).json(reg);
  },
  excluir: async (req, res) => {
    await svc.excluir(parse(id, req.params.id), req.escopo, auditoria.doReq(req));
    res.status(204).end();
  },
  previa: async (req, res) => {
    if (!req.file) throw AppError.badRequest('Selecione um arquivo .xlsx ou .csv.');
    res.json(
      await svc.previaImportacao(
        req.file.buffer,
        req.file.originalname,
        parse(id, req.body.turma_id),
        req.escopo,
      ),
    );
  },
  confirmar: async (req, res) => {
    const dados = parse(
      z.object({
        turma_id: id,
        modo: z.enum(['atualizar', 'novos']),
        linhas: z
          .array(
            z.object({
              numero: z.coerce.number().int(),
              nome: z.string().max(150),
              ra: z.string().max(20).nullable().optional(),
            }),
          )
          .max(2000),
      }),
      req.body,
    );
    res.json(await svc.confirmarImportacao(dados, req.escopo, auditoria.doReq(req)));
  },
  modelo: async (req, res) => {
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    const colunas = [
      { chave: 'n', titulo: 'Nº', largura: 6 },
      { chave: 'nome', titulo: 'Nome', largura: 44 },
      { chave: 'ra', titulo: 'RA', largura: 16 },
    ];
    const linhas = [{ n: 1, nome: 'NOME COMPLETO DO ALUNO', ra: '' }];
    const buffer =
      formato === 'csv'
        ? exportacao.csv(colunas, linhas)
        : await exportacao.xlsx([{ nome: 'Alunos', colunas, linhas }]);
    exportacao.enviar(res, { buffer, nome: 'modelo_alunos', formato });
  },
};
