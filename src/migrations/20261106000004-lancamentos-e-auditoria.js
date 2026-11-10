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
const fk = (Sequelize, model, extra = {}) => ({
  type: Sequelize.INTEGER,
  allowNull: false,
  references: { model, key: 'id' },
  ...extra,
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('participacoes', {
      aluno_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'alunos', key: 'id' },
        onDelete: 'CASCADE',
      },
      avaliacao_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'avaliacoes', key: 'id' },
        onDelete: 'CASCADE',
      },
      disciplina_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'disciplinas', key: 'id' },
        onDelete: 'RESTRICT',
      },
      presenca: { type: Sequelize.ENUM('presente', 'ausente'), allowNull: false, defaultValue: 'presente' },
      ...ts(Sequelize),
    });
    await queryInterface.addIndex('participacoes', ['avaliacao_id', 'disciplina_id', 'presenca']);

    await queryInterface.createTable('respostas', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      avaliacao_id: fk(Sequelize, 'avaliacoes', { onDelete: 'CASCADE' }),
      aluno_id: fk(Sequelize, 'alunos', { onDelete: 'CASCADE' }),
      questao_id: fk(Sequelize, 'questoes', { onDelete: 'CASCADE' }),
      // RESTRICT: o código apaga as respostas do aspecto antes de removê-lo.
      aspecto_id: fk(Sequelize, 'questao_aspectos', { allowNull: true, onDelete: 'RESTRICT' }),
      valor: { type: Sequelize.STRING(4), allowNull: false },
      pontos: { type: Sequelize.DECIMAL(6, 3), allowNull: false, defaultValue: 0 },
      lancado_por: fk(Sequelize, 'usuarios', { allowNull: true, onDelete: 'SET NULL' }),
      ...ts(Sequelize),
    });
    // Unicidade (aluno, questão, aspecto) — UNIQUE aceita vários NULL (inclusive no PostgreSQL), por isso a coluna gerada.
    await queryInterface.sequelize.query(
      'ALTER TABLE respostas ADD COLUMN aspecto_key INTEGER GENERATED ALWAYS AS (COALESCE(aspecto_id, 0)) STORED',
    );
    await queryInterface.addConstraint('respostas', {
      fields: ['aluno_id', 'questao_id', 'aspecto_key'],
      type: 'unique',
      name: 'uq_respostas_aluno_questao_aspecto',
    });
    await queryInterface.addIndex('respostas', ['avaliacao_id', 'aluno_id'], {
      name: 'ix_respostas_av_aluno',
    });
    await queryInterface.addIndex('respostas', ['avaliacao_id', 'questao_id'], {
      name: 'ix_respostas_av_questao',
    });

    await queryInterface.createTable('auditoria', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: fk(Sequelize, 'usuarios', { allowNull: true, onDelete: 'SET NULL' }),
      acao: { type: Sequelize.STRING(60), allowNull: false },
      entidade: { type: Sequelize.STRING(60), allowNull: true },
      entidade_id: { type: Sequelize.STRING(40), allowNull: true },
      antes: { type: Sequelize.JSON, allowNull: true },
      depois: { type: Sequelize.JSON, allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      criado_em: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('auditoria', ['usuario_id', 'criado_em']);
    await queryInterface.addIndex('auditoria', ['acao', 'criado_em']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auditoria');
    await queryInterface.dropTable('respostas');
    await queryInterface.dropTable('participacoes');
    // PostgreSQL: dropTable não remove os tipos ENUM criados com a tabela.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_participacoes_presenca"');
  },
};
