'use strict';
/**
 * Avaliação de exemplo "SIMULADO SARESP — 2º ANO — 2026" (estrutura da PoC).
 * Gabaritos, habilidades e descritores das objetivas vêm de seed-data/backup_saresp_OHV_2026-11-06.json
 * (pelo mesmo serviço de importação do legado). Sem o arquivo, as objetivas ficam sem gabarito.
 * Apenas a ESTRUTURA é semeada; alunos e respostas reais devem ser importados em Administração › Importar legado.
 */
const fs = require('fs');
const path = require('path');

module.exports = {
  async up() {
    const { Usuario } = require('../models');
    const legado = require('../services/legado.service');
    const escopoSvc = require('../services/escopo.service');
    const auditoria = require('../services/auditoria.service');
    const { estruturaCanonica } = require('../../seed-data/estrutura-simulado-2ano');

    const admin = await Usuario.findOne({ where: { perfil: 'admin', nativo: true } });
    if (!admin) throw new Error('Execute antes o seeder do admin nativo.');
    const base = estruturaCanonica();
    const arq = path.join(__dirname, '..', '..', 'seed-data', 'backup_saresp_OHV_2026-11-06.json');
    if (fs.existsSync(arq)) {
      const bk = JSON.parse(fs.readFileSync(arq, 'utf8'));
      const porCodigo = new Map((bk.questoes || []).map((q) => [String(q.code).toUpperCase(), q]));
      for (const q of base.questoes) {
        const b = porCodigo.get(q.code.toUpperCase());
        if (!b) continue;
        if (q.tipo === 'obj') {
          q.gab = b.gab || q.gab;
          q.peso = b.peso ?? q.peso;
        }
        q.hab = b.hab || q.hab;
        q.desc = b.desc || q.desc;
      }
      if (bk.meta) base.meta = { ...base.meta, ...bk.meta };
      console.log('[seed] Gabaritos carregados de seed-data/backup_saresp_OHV_2026-11-06.json');
    } else {
      console.log('[seed] Arquivo de backup não encontrado: objetivas criadas sem gabarito.');
    }
    const escopo = await escopoSvc.calcular(admin);
    const audit = (d, t) => auditoria.registrar({ usuarioId: admin.id, ...d }, t);
    await legado.importar(base, {
      usuario: admin,
      escopo,
      audit,
      somenteEstrutura: true,
      status: 'publicada',
    });
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('avaliacoes', { titulo: 'SIMULADO SARESP' });
  },
};
