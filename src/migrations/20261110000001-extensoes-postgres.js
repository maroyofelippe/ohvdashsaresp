'use strict';

// unaccent: busca de nomes sem diferenciar acentos (ex.: "joao" encontra "João").
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  },
  async down() {
    // A extensão é mantida: pode ser compartilhada com outros objetos do banco.
  },
};
