'use strict';

// Sinal de atividade do usuário: base do indicador online/offline e do desligamento por inatividade.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'ultima_atividade', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'ultima_atividade');
  },
};
