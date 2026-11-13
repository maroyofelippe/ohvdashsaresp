const router = require('express').Router();
const { requireAuth, redirectSeLogado } = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const auth = require('../../controllers/auth.controller');
const p = require('../../controllers/paginas.controller');
const usuarios = require('../../services/usuarios.service');
const a = require('../../utils/asyncHandler');

// ----- Autenticação (público) -----
router.get('/login', redirectSeLogado, auth.telaLogin);
router.post('/login', auth.limiteLogin, auth.login);
router.get('/cadastro', redirectSeLogado, auth.telaCadastro);
router.post('/cadastro', auth.limiteFormularios, auth.cadastrar);
router.get('/confirmar-email', auth.confirmarEmail);
router.get('/esqueci-senha', auth.telaEsqueci);
router.post('/esqueci-senha', auth.limiteFormularios, auth.esqueci);
router.get('/redefinir-senha', auth.telaRedefinir);
router.post('/redefinir-senha', auth.limiteFormularios, auth.redefinir);
// O cookie de refresh (path=/auth/refresh) só é enviado para estes caminhos:
router.get('/auth/refresh', auth.refreshPagina);
router.post('/auth/refresh', auth.refreshApi);
router.post('/auth/refresh/logout', auth.logout);
router.post('/logout', auth.logout);

// ----- Área autenticada -----
router.use(requireAuth);
router.use(
  a(async (req, res, next) => {
    if (req.usuario.perfil === 'admin') res.locals.pendentesAprovacao = await usuarios.contarPendentes();
    next();
  }),
);
router.get('/conta/senha', auth.telaSenha);
router.post('/conta/senha', auth.trocarSenha);

router.get('/', a(p.inicio));
router.get('/lancamentos', authorize('lancamentos:ver'), p.lancamentos);
router.get('/painel', authorize('painel:ver'), p.painel);
router.get('/hall-da-fama', authorize('painel:ver'), p.hall);
router.get('/avaliacoes', authorize('avaliacoes:ver'), a(p.avaliacoes));
router.get('/avaliacoes/nova', authorize('avaliacoes:criar'), a(p.novaAvaliacao));
router.get('/avaliacoes/:id/editar', authorize('avaliacoes:editar'), a(p.editarAvaliacao));
router.get('/avaliacoes/:id/imprimir', authorize('avaliacoes:ver'), a(p.verAvaliacao));
router.get('/avaliacoes/:id', authorize('avaliacoes:ver'), a(p.verAvaliacao));
router.get('/alunos', authorize('alunos:ver'), a(p.alunos));
router.get('/turmas', authorize('estrutura:ver'), a(p.turmas));
router.get('/admin', authorize('usuarios:gerenciar'), a(p.adminUsuarios));
router.get('/admin/aprovacoes', authorize('usuarios:gerenciar'), a(p.adminUsuarios));
router.get('/admin/configuracoes', authorize('config:gerenciar'), a(p.adminConfiguracoes));
router.get('/admin/auditoria', authorize('auditoria:ver'), a(p.adminAuditoria));
router.get('/admin/legado', authorize('config:gerenciar'), p.adminLegado);

module.exports = router;
