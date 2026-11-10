const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const upload = require('../../middlewares/upload');
const c = require('../../controllers/avaliacoes.controller');
const a = require('../../utils/asyncHandler');

router.get('/', authorize('avaliacoes:ver'), a(c.listar));
router.post('/', authorize('avaliacoes:criar'), a(c.criar));
router.get('/:id', authorize('avaliacoes:ver'), a(c.obter));
router.put('/:id', authorize('avaliacoes:editar'), a(c.atualizarDados));
router.put('/:id/estrutura', authorize('avaliacoes:editar'), a(c.salvarEstrutura));
router.patch('/:id/status', authorize('avaliacoes:editar'), a(c.status));
router.delete('/:id', authorize('avaliacoes:editar'), a(c.excluir));
router.post('/:id/duplicar', authorize('avaliacoes:criar'), a(c.duplicar));
router.get('/:id/gabarito', authorize('avaliacoes:ver', 'exportar'), a(c.exportarGabarito));
router.post('/:id/gabarito/importar', authorize('avaliacoes:editar'), upload(), a(c.importarGabarito));

module.exports = router;
