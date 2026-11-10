const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const c = require('../../controllers/painel.controller');
const a = require('../../utils/asyncHandler');

router.use(authorize('painel:ver'));
router.get('/opcoes', a(c.opcoes));
router.get('/alunos', a(c.alunos));
router.get('/dados', a(c.dados));
router.get('/exportar', authorize('exportar'), a(c.exportar));
router.get('/:visao', a(c.visao));

module.exports = router;
