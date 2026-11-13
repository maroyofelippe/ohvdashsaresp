const { Op } = require('sequelize');
const db = require('../models');
const estrutura = require('../services/estrutura.service');
const alunosSvc = require('../services/alunos.service');
const avaliacoesSvc = require('../services/avaliacoes.service');
const lancamentos = require('../services/lancamentos.service');
const estatisticas = require('../services/estatisticas.service');
const usuarios = require('../services/usuarios.service');
const auditoria = require('../services/auditoria.service');
const configuracoes = require('../services/configuracoes.service');
const { pode } = require('../config/permissions');
const { parse } = require('../middlewares/validate');
const { id } = require('../validators/comuns');
const env = require('../config/env');

const { Usuario, Turma, Aluno, Avaliacao, ProfessorTurma, Disciplina } = db;

module.exports = {
  async inicio(req, res) {
    const u = req.usuario;
    const dados = { titulo: 'Início' };
    if (u.perfil === 'professor') {
      dados.progresso = await lancamentos.progresso(u, req.escopo);
      dados.semTurmas = !(req.escopo.turmasLancar || []).length;
    }
    if (u.perfil === 'coordenador' || u.perfil === 'admin') {
      const recente = await Avaliacao.findOne({
        where: { status: { [Op.in]: ['publicada', 'encerrada'] } },
        order: [['updated_at', 'DESC']],
      });
      if (recente) {
        try {
          dados.resumo = await estatisticas.calcular({ avaliacao: recente.id, turmas: [] }, req.escopo);
        } catch {
          dados.resumo = null;
        }
      }
    }
    if (u.perfil === 'admin') {
      const turmas = await estrutura.listarTurmas();
      dados.saude = {
        pendentes: await usuarios.contarPendentes(),
        usuariosAtivos: await Usuario.count({ where: { status: 'ativo' } }),
        turmas: turmas.length,
        alunos: await Aluno.count(),
        avaliacoes: await Avaliacao.count(),
        turmasSemAlunos: turmas.filter((t) => t.anoAtivo && !t.alunos).map((t) => t.nomeCompleto),
        turmasSemProfessor: turmas
          .filter((t) => t.anoAtivo && !t.professores.length)
          .map((t) => t.nomeCompleto),
        rascunhos: await Avaliacao.count({ where: { status: 'rascunho' } }),
      };
    }
    res.render('pages/inicio/index', dados);
  },

  lancamentos(req, res) {
    res.render('pages/lancamentos/index', {
      titulo: pode(req.usuario, 'lancamentos:lancar') ? 'Lançar respostas' : 'Respostas',
    });
  },

  painel(req, res) {
    res.render('pages/painel/index', { titulo: 'Painel' });
  },

  hall(req, res) {
    res.render('pages/hall/index', { titulo: 'Hall da Fama' });
  },

  async avaliacoes(req, res) {
    const lista = await avaliacoesSvc.listar(req.query, req.escopo);
    res.render('pages/avaliacoes/index', { titulo: 'Avaliações', lista, Avaliacao });
  },

  async novaAvaliacao(req, res) {
    const anos = (await estrutura.listarAnos()).filter((a) => a.ativo);
    let series = await estrutura.listarSeries();
    if (req.usuario.perfil === 'professor') {
      const pares = req.escopo.pares || [];
      series = series.filter((s) => pares.some((p) => p.serie_id === s.id));
    }
    const disciplinas = await Disciplina.findAll();
    res.render('pages/avaliacoes/editor', {
      titulo: 'Nova avaliação',
      dadosEditor: {
        novo: true,
        anos,
        series,
        disciplinas,
        pares: req.escopo.pares,
        perfil: req.usuario.perfil,
      },
    });
  },

  async editarAvaliacao(req, res) {
    const avId = parse(id, req.params.id);
    const est = await avaliacoesSvc.obter(avId, req.usuario, req.escopo);
    const anos = await estrutura.listarAnos();
    const series = await estrutura.listarSeries();
    const disciplinas = await Disciplina.findAll();
    res.render('pages/avaliacoes/editor', {
      titulo: `Editar — ${est.avaliacao.titulo}`,
      dadosEditor: {
        novo: false,
        ...est,
        anos,
        series,
        disciplinas,
        pares: req.escopo.pares,
        perfil: req.usuario.perfil,
        passo: req.query.passo || '2',
      },
    });
  },

  async verAvaliacao(req, res) {
    const avId = parse(id, req.params.id);
    const est = await avaliacoesSvc.obter(avId, req.usuario, req.escopo);
    const imprimir = req.path.endsWith('/imprimir');
    const anos = await estrutura.listarAnos();
    const series = await estrutura.listarSeries();
    res.render('pages/avaliacoes/ver', {
      titulo: `Gabarito — ${est.avaliacao.titulo}`,
      ...est,
      anos,
      series,
      imprimir,
      layout: imprimir ? 'layouts/print' : 'layouts/main',
    });
  },

  async alunos(req, res) {
    const turmas = await estrutura.listarTurmas({ ids: req.escopo.turmasVer });
    const turmaId = req.query.turma_id ? Number(req.query.turma_id) : null;
    const lista = await alunosSvc.listar({ ...req.query, turma_id: turmaId || undefined }, req.escopo);
    const turmasGerenciaveis = turmas.filter(
      (t) => req.escopo.turmasGerenciarAlunos === null || req.escopo.turmasGerenciarAlunos.includes(t.id),
    );
    res.render('pages/alunos/index', {
      titulo: 'Alunos',
      turmas,
      turmasGerenciaveis,
      lista,
      filtros: { turma_id: turmaId, busca: req.query.busca || '', situacao: req.query.situacao || '' },
    });
  },

  async turmas(req, res) {
    const [anos, series, turmas] = await Promise.all([
      estrutura.listarAnos(),
      estrutura.listarSeries(),
      estrutura.listarTurmas(),
    ]);
    res.render('pages/turmas/index', {
      titulo: 'Turmas',
      anos,
      series,
      turmas,
      aba: req.query.aba || 'turmas',
    });
  },

  async adminUsuarios(req, res) {
    const status = req.path.endsWith('/aprovacoes') ? 'pendente' : req.query.status || '';
    const lista = await usuarios.listar({ ...req.query, status });
    const turmas = await estrutura.listarTurmas();
    res.render('pages/admin/usuarios', {
      titulo: status === 'pendente' ? 'Aprovações' : 'Usuários',
      lista,
      turmas,
      filtros: { status, perfil: req.query.perfil || '', busca: req.query.busca || '' },
      aprovacoes: status === 'pendente',
      aprovacaoObrigatoria: env.REQUIRE_ADMIN_APPROVAL,
    });
  },

  async adminConfiguracoes(req, res) {
    res.render('pages/admin/configuracoes', {
      titulo: 'Configurações da escola',
      cfg: await configuracoes.obterTodas(),
    });
  },

  async adminAuditoria(req, res) {
    const r = await auditoria.listar(req.query);
    const usuariosLista = await Usuario.findAll({
      attributes: ['id', 'nome'],
      order: [['nome', 'ASC']],
      paranoid: false,
    });
    res.render('pages/admin/auditoria', { titulo: 'Auditoria', ...r, usuariosLista, filtros: req.query });
  },

  adminLegado(req, res) {
    res.render('pages/admin/legado', { titulo: 'Importar backup da PoC' });
  },
};

void ProfessorTurma;
void Turma;
