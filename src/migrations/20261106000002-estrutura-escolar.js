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
    await queryInterface.createTable('configuracoes', {
      chave: { type: Sequelize.STRING(60), primaryKey: true },
      valor: { type: Sequelize.TEXT, allowNull: true },
      ...ts(Sequelize),
    });

    await queryInterface.createTable('anos_letivos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      ano: { type: Sequelize.SMALLINT, allowNull: false, unique: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(Sequelize),
    });

    await queryInterface.createTable('series', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      nome: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      etapa: { type: Sequelize.ENUM('EF-AI', 'EF-AF', 'EM'), allowNull: false, defaultValue: 'EF-AI' },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      ...ts(Sequelize),
    });

    await queryInterface.createTable('turmas', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      ano_letivo_id: fk(Sequelize, 'anos_letivos', { onDelete: 'RESTRICT' }),
      serie_id: fk(Sequelize, 'series', { onDelete: 'RESTRICT' }),
      letra: { type: Sequelize.STRING(3), allowNull: false },
      periodo: {
        type: Sequelize.ENUM('manha', 'tarde', 'integral'),
        allowNull: false,
        defaultValue: 'manha',
      },
      ...ts(Sequelize),
    });
    await queryInterface.addConstraint('turmas', {
      fields: ['ano_letivo_id', 'serie_id', 'letra'],
      type: 'unique',
      name: 'uq_turmas_ano_serie_letra',
    });

    await queryInterface.createTable('alunos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      turma_id: fk(Sequelize, 'turmas', { onDelete: 'RESTRICT' }),
      numero_chamada: { type: Sequelize.SMALLINT, allowNull: false },
      nome: { type: Sequelize.STRING(150), allowNull: false },
      ra: { type: Sequelize.STRING(20), allowNull: true, unique: true },
      situacao: {
        type: Sequelize.ENUM('ativo', 'transferido', 'remanejado'),
        allowNull: false,
        defaultValue: 'ativo',
      },
      ...ts(Sequelize),
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      // Coluna gerada: garante unicidade (turma, nº) apenas entre registros NÃO excluídos.
    });
    await queryInterface.sequelize.query(
      'ALTER TABLE alunos ADD COLUMN ativo_key SMALLINT GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN 1 END) STORED',
    );
    await queryInterface.addConstraint('alunos', {
      fields: ['turma_id', 'numero_chamada', 'ativo_key'],
      type: 'unique',
      name: 'uq_alunos_turma_numero',
    });
    await queryInterface.addIndex('alunos', ['nome']);

    await queryInterface.createTable('professor_turmas', {
      usuario_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'CASCADE',
      },
      turma_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'turmas', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: { type: Sequelize.ENUM('pendente', 'aprovado'), allowNull: false, defaultValue: 'pendente' },
      ...ts(Sequelize),
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('professor_turmas');
    await queryInterface.dropTable('alunos');
    await queryInterface.dropTable('turmas');
    await queryInterface.dropTable('series');
    await queryInterface.dropTable('anos_letivos');
    await queryInterface.dropTable('configuracoes');
    // PostgreSQL: dropTable não remove os tipos ENUM criados com a tabela.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_series_etapa"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_turmas_periodo"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alunos_situacao"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_professor_turmas_status"');
  },
};
