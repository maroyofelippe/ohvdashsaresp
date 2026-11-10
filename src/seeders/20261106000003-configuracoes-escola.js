'use strict';
/** Cabeçalho institucional (igual ao da PoC / documentos da escola). */
module.exports = {
  async up() {
    const { Configuracao } = require('../models');
    const { PADRAO } = require('../services/configuracoes.service');
    for (const [chave, valor] of Object.entries(PADRAO)) {
      await Configuracao.findOrCreate({ where: { chave }, defaults: { chave, valor } });
    }
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('configuracoes', null);
  },
};
