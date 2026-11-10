const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const upload = require('../../middlewares/upload');
const c = require('../../controllers/lancamentos.controller');
const a = require('../../utils/asyncHandler');

router.get('/opcoes', authorize('lancamentos:ver'), a(c.opcoes));
router.get('/grade', authorize('lancamentos:ver'), a(c.grade));
router.patch('/', authorize('lancamentos:lancar'), a(c.salvar));
router.get('/modelo', authorize('lancamentos:lancar'), a(c.modelo));
router.get('/exportar', authorize('lancamentos:ver', 'exportar'), a(c.exportar));
router.post('/importar/previa', authorize('lancamentos:lancar'), upload(), a(c.previa));
router.post('/importar/confirmar', authorize('lancamentos:lancar'), a(c.confirmar));

module.exports = router;
