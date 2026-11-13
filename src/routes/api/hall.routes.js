const router = require('express').Router();
const authorize = require('../../middlewares/authorize');
const a = require('../../utils/asyncHandler');
const { parse } = require('../../middlewares/validate');
const { z, idOpcional } = require('../../validators/comuns');
const svc = require('../../services/hall.service');

const filtro = z.object({ ano: idOpcional, avaliacao: idOpcional });

router.use(authorize('painel:ver'));
router.get(
  '/',
  a(async (req, res) => res.json(await svc.calcular(parse(filtro, req.query), req.escopo))),
);

module.exports = router;
