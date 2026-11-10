const svc = require('../services/lancamentos.service');
const auditoria = require('../services/auditoria.service');
const exportacao = require('../services/exportacao.service');
const v = require('../validators/lancamentos.validators');
const { parse } = require('../middlewares/validate');
const { id } = require('../validators/comuns');
const AppError = require('../utils/AppError');

module.exports = {
  opcoes: async (req, res) => res.json(await svc.opcoes(req.usuario, req.escopo)),
  grade: async (req, res) =>
    res.json(await svc.carregarGrade(parse(v.grade, req.query), req.usuario, req.escopo)),
  salvar: async (req, res) =>
    res.json(await svc.salvarLote(parse(v.lote, req.body), req.usuario, req.escopo, auditoria.doReq(req))),
  previa: async (req, res) => {
    if (!req.file) throw AppError.badRequest('Selecione um arquivo .xlsx ou .csv.');
    res.json(
      await svc.previaImportacao(
        req.file.buffer,
        req.file.originalname,
        parse(id, req.body.avaliacao_id),
        parse(id, req.body.turma_id),
        req.usuario,
        req.escopo,
      ),
    );
  },
  confirmar: async (req, res) =>
    res.json(
      await svc.confirmarImportacao(
        parse(v.confirmarImportacao, req.body),
        req.usuario,
        req.escopo,
        auditoria.doReq(req),
      ),
    ),
  modelo: async (req, res) => {
    const m = await svc.modeloImportacao(
      parse(id, req.query.avaliacao),
      parse(id, req.query.turma),
      req.escopo,
    );
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    const buffer =
      formato === 'csv'
        ? exportacao.csv(m.colunas, m.linhas)
        : await exportacao.xlsx([{ nome: 'Alunos_Respostas', colunas: m.colunas, linhas: m.linhas }]);
    exportacao.enviar(res, { buffer, nome: m.nome, formato });
  },
  /** Exporta as respostas da turma no layout da PoC (mesmo formato aceito na importação). */
  exportar: async (req, res) => {
    const avaliacao = parse(id, req.query.avaliacao);
    const turma = parse(id, req.query.turma);
    const m = await svc.modeloImportacao(avaliacao, turma, req.escopo);
    const defs = await svc.definicoes(avaliacao);
    const { Resposta, Aluno } = require('../models');
    const alunos = await Aluno.findAll({ where: { turma_id: turma }, raw: true });
    const resp = await Resposta.findAll({
      where: { avaliacao_id: avaliacao, aluno_id: alunos.map((a) => a.id).concat(0) },
      raw: true,
    });
    const porId = new Map(defs.map((q) => [q.id, q]));
    const porNum = new Map(alunos.map((a) => [a.id, a.numero_chamada]));
    for (const r of resp) {
      const q = porId.get(r.questao_id);
      if (!q) continue;
      const linha = m.linhas.find((l) => l.n === porNum.get(r.aluno_id));
      if (!linha) continue;
      const col =
        q.tipo === 'producao_texto'
          ? r.aspecto_id
            ? `${q.codigo}${q.aspectos.find((a) => a.id === r.aspecto_id)?.codigo}`
            : `${q.codigo}S`
          : q.codigo;
      linha[col] = r.valor;
    }
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    const buffer =
      formato === 'csv'
        ? exportacao.csv(m.colunas, m.linhas)
        : await exportacao.xlsx([{ nome: 'Alunos_Respostas', colunas: m.colunas, linhas: m.linhas }]);
    await auditoria.doReq(req)({
      acao: 'exportar.respostas',
      entidade: 'turmas',
      entidadeId: turma,
      depois: { avaliacao, formato },
    });
    exportacao.enviar(res, { buffer, nome: m.nome.replace('modelo_', ''), formato });
  },
};
