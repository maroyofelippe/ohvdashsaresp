'use strict';

const ts = (Sequelize) => ({
  created_at: {
    type: Sequelize.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
  updated_at: {
    type: Sequelize.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usuarios', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      nome: { type: Sequelize.STRING(150), allowNull: false },
      email: { type: Sequelize.STRING(180), allowNull: false, unique: true },
      senha_hash: { type: Sequelize.STRING(100), allowNull: false },
      perfil: { type: Sequelize.ENUM('admin', 'coordenador', 'professor'), allowNull: false },
      status: {
        type: Sequelize.ENUM('pendente_email', 'pendente', 'ativo', 'inativo'),
        allowNull: false,
        defaultValue: 'pendente_email',
      },
      nativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      trocar_senha: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      falhas_login: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bloqueado_ate: { type: Sequelize.DATE, allowNull: true },
      ultimo_login: { type: Sequelize.DATE, allowNull: true },
      ...ts(Sequelize),
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('usuarios', ['status']);

    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
      familia: { type: Sequelize.CHAR(36), allowNull: false },
      expira_em: { type: Sequelize.DATE, allowNull: false },
      revogado_em: { type: Sequelize.DATE, allowNull: true },
      substituido_por: { type: Sequelize.BIGINT, allowNull: true },
      criado_ip: { type: Sequelize.STRING(45), allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      ...ts(Sequelize),
    });
    await queryInterface.addIndex('refresh_tokens', ['familia']);
    await queryInterface.addIndex('refresh_tokens', ['usuario_id']);

    await queryInterface.createTable('tokens_email', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'CASCADE',
      },
      tipo: { type: Sequelize.ENUM('confirmacao', 'reset'), allowNull: false },
      token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
      expira_em: { type: Sequelize.DATE, allowNull: false },
      usado_em: { type: Sequelize.DATE, allowNull: true },
      ...ts(Sequelize),
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tokens_email');
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('usuarios');
    // PostgreSQL: dropTable não remove os tipos ENUM criados com a tabela.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_usuarios_perfil"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_usuarios_status"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tokens_email_tipo"');
  },
};
