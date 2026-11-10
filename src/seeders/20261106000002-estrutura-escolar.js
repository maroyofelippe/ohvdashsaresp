'use strict';
/** Disciplinas LP/MT, séries do 1º ao 5º ANO, ano letivo 2026 e turmas 2º ANO A, B e C. */
module.exports = {
  async up() {
    const { Disciplina, Serie, AnoLetivo, Turma } = require('../models');
    for (const d of [
      { sigla: 'LP', nome: 'Língua Portuguesa' },
      { sigla: 'MT', nome: 'Matemática' },
    ]) {
      await Disciplina.findOrCreate({ where: { sigla: d.sigla }, defaults: d });
    }
    const series = {};
    for (let i = 1; i <= 5; i++) {
      const [s] = await Serie.findOrCreate({
        where: { nome: `${i}º ANO` },
        defaults: { nome: `${i}º ANO`, etapa: 'EF-AI', ordem: i },
      });
      series[i] = s;
    }
    const [ano] = await AnoLetivo.findOrCreate({
      where: { ano: 2026 },
      defaults: { ano: 2026, ativo: true },
    });
    for (const letra of ['A', 'B', 'C']) {
      await Turma.findOrCreate({
        where: { ano_letivo_id: ano.id, serie_id: series[2].id, letra },
        defaults: { ano_letivo_id: ano.id, serie_id: series[2].id, letra, periodo: 'manha' },
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('turmas', null);
    await queryInterface.bulkDelete('anos_letivos', { ano: 2026 });
    await queryInterface.bulkDelete('series', null);
    await queryInterface.bulkDelete('disciplinas', null);
  },
};
