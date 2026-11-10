const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const c = require('../../controllers/estrutura.controller');
const a = require('../../utils/asyncHandler');

const ver = authorize('estrutura:ver');
const gerir = authorize('estrutura:gerenciar');

router.get('/anos', ver, a(c.anos));
router.post('/anos', gerir, a(c.salvarAno));
router.put('/anos/:id', gerir, a(c.salvarAno));
router.delete('/anos/:id', gerir, a(c.excluirAno));
router.get('/series', ver, a(c.series));
router.post('/series', gerir, a(c.salvarSerie));
router.put('/series/:id', gerir, a(c.salvarSerie));
router.delete('/series/:id', gerir, a(c.excluirSerie));
router.get('/turmas', ver, a(c.turmas));
router.post('/turmas', gerir, a(c.salvarTurma));
router.put('/turmas/:id', gerir, a(c.salvarTurma));
router.delete('/turmas/:id', gerir, a(c.excluirTurma));

module.exports = router;
