const express = require('express');
const { requireAuth } = require('../../middlewares/authenticate');
const { generateToken } = require('../../middlewares/csrf');
const a = require('../../utils/asyncHandler');

const router = express.Router();

router.get('/csrf', (req, res) => res.json({ token: generateToken(req, res) }));
router.get(
  '/saude',
  a(async (req, res) => {
    await require('../../models').sequelize.query('SELECT 1');
    res.json({ ok: true });
  }),
);

router.use(requireAuth);
router.use('/estrutura', require('./estrutura.routes'));
router.use('/alunos', require('./alunos.routes'));
router.use('/avaliacoes', require('./avaliacoes.routes'));
router.use('/lancamentos', require('./lancamentos.routes'));
router.use('/painel', require('./painel.routes'));
router.use('/admin', require('./admin.routes'));
router.use((req, res) => res.status(404).json({ erro: 'Recurso não encontrado.', detalhes: null }));

module.exports = router;
