const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const upload = require('../../middlewares/upload');
const c = require('../../controllers/admin.controller');
const a = require('../../utils/asyncHandler');

router.get('/usuarios', authorize('usuarios:gerenciar'), a(c.usuarios));
router.post('/usuarios/:id/aprovar', authorize('usuarios:gerenciar'), a(c.aprovar));
router.put('/usuarios/:id', authorize('usuarios:gerenciar'), a(c.atualizar));
router.post('/usuarios/:id/senha', authorize('usuarios:gerenciar'), a(c.redefinirSenha));
router.post('/usuarios/:id/link-confirmacao', authorize('usuarios:gerenciar'), a(c.linkConfirmacao));
router.delete('/usuarios/:id', authorize('usuarios:gerenciar'), a(c.excluir));
router.get('/configuracoes', authorize('config:gerenciar'), a(c.obterConfig));
router.put('/configuracoes', authorize('config:gerenciar'), a(c.salvarConfig));
router.get('/auditoria', authorize('auditoria:ver'), a(c.auditoria));
router.post('/legado', authorize('config:gerenciar'), upload(['.json']), a(c.legado));

module.exports = router;
