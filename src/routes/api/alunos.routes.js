const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const upload = require('../../middlewares/upload');
const c = require('../../controllers/alunos.controller');
const a = require('../../utils/asyncHandler');

router.get('/', authorize('alunos:ver'), a(c.listar));
router.get('/modelo', authorize('alunos:gerenciar'), a(c.modelo));
router.post('/importar/previa', authorize('alunos:gerenciar'), upload(), a(c.previa));
router.post('/importar/confirmar', authorize('alunos:gerenciar'), a(c.confirmar));
router.post('/', authorize('alunos:gerenciar'), a(c.salvar));
router.put('/:id', authorize('alunos:gerenciar'), a(c.salvar));
router.delete('/:id', authorize('alunos:gerenciar'), a(c.excluir));

module.exports = router;
