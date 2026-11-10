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
    await queryInterface.createTable('disciplinas', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      sigla: { type: Sequelize.STRING(4), allowNull: false, unique: true },
      nome: { type: Sequelize.STRING(60), allowNull: false },
      ...ts(Sequelize),
    });

    await queryInterface.createTable('avaliacoes', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      titulo: { type: Sequelize.STRING(150), allowNull: false },
      tipo: {
        type: Sequelize.ENUM('simulado', 'saresp_oficial', 'diagnostica'),
        allowNull: false,
        defaultValue: 'simulado',
      },
      ano_letivo_id: fk(Sequelize, 'anos_letivos', { onDelete: 'RESTRICT' }),
      serie_id: fk(Sequelize, 'series', { onDelete: 'RESTRICT' }),
      status: {
        type: Sequelize.ENUM('rascunho', 'publicada', 'encerrada'),
        allowNull: false,
        defaultValue: 'rascunho',
      },
      criado_por: fk(Sequelize, 'usuarios', { allowNull: true, onDelete: 'SET NULL' }),
      ...ts(Sequelize),
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('avaliacoes', ['ano_letivo_id', 'serie_id', 'status']);

    await queryInterface.createTable('avaliacao_disciplinas', {
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
      data_aplicacao: { type: Sequelize.DATEONLY, allowNull: true },
      ...ts(Sequelize),
    });

    await queryInterface.createTable('questoes', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      avaliacao_id: fk(Sequelize, 'avaliacoes', { onDelete: 'CASCADE' }),
      disciplina_id: fk(Sequelize, 'disciplinas', { onDelete: 'RESTRICT' }),
      codigo: { type: Sequelize.STRING(12), allowNull: false },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      tipo: {
        type: Sequelize.ENUM('objetiva', 'escalar', 'producao_texto'),
        allowNull: false,
        defaultValue: 'objetiva',
      },
      num_alternativas: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 4 },
      gabarito: { type: Sequelize.CHAR(1), allowNull: true },
      peso: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
      questao_pai_id: fk(Sequelize, 'questoes', { allowNull: true, onDelete: 'CASCADE' }),
      habilidade_bncc: { type: Sequelize.STRING(20), allowNull: true },
      descritor: { type: Sequelize.STRING(400), allowNull: true },
      item_codigo: { type: Sequelize.STRING(30), allowNull: true },
      enunciado_resumo: { type: Sequelize.TEXT, allowNull: true },
      anulada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts(Sequelize),
    });
    await queryInterface.addConstraint('questoes', {
      fields: ['avaliacao_id', 'codigo'],
      type: 'unique',
      name: 'uq_questoes_avaliacao_codigo',
    });

    await queryInterface.createTable('questao_aspectos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: fk(Sequelize, 'questoes', { onDelete: 'CASCADE' }),
      codigo: { type: Sequelize.STRING(6), allowNull: false },
      nome: { type: Sequelize.STRING(80), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      ...ts(Sequelize),
    });
    await queryInterface.addConstraint('questao_aspectos', {
      fields: ['questao_id', 'codigo'],
      type: 'unique',
      name: 'uq_aspectos_questao_codigo',
    });

    await queryInterface.createTable('escala_niveis', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: fk(Sequelize, 'questoes', { allowNull: true, onDelete: 'CASCADE' }),
      aspecto_id: fk(Sequelize, 'questao_aspectos', { allowNull: true, onDelete: 'CASCADE' }),
      codigo: { type: Sequelize.STRING(2), allowNull: false },
      codigo_alt: {
        type: Sequelize.STRING(4),
        allowNull: true,
        comment: 'Código numérico da chave SARESP (ex.: 20, 10, 01)',
      },
      credito: { type: Sequelize.ENUM('integral', 'parcial', 'nenhum'), allowNull: true },
      pontos: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      ...ts(Sequelize),
    });
    await queryInterface.sequelize.query(
      'ALTER TABLE escala_niveis ADD CONSTRAINT ck_escala_dono CHECK ((questao_id IS NULL) <> (aspecto_id IS NULL))',
    );

    await queryInterface.createTable('questao_situacoes', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: fk(Sequelize, 'questoes', { onDelete: 'CASCADE' }),
      codigo: { type: Sequelize.STRING(2), allowNull: false },
      nome: { type: Sequelize.STRING(40), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      zera_nota: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      ...ts(Sequelize),
    });
  },

  async down(queryInterface) {
    for (const t of [
      'questao_situacoes',
      'escala_niveis',
      'questao_aspectos',
      'questoes',
      'avaliacao_disciplinas',
      'avaliacoes',
      'disciplinas',
    ]) {
      await queryInterface.dropTable(t);
    }
    // PostgreSQL: dropTable não remove os tipos ENUM criados com a tabela.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_avaliacoes_tipo"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_avaliacoes_status"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_questoes_tipo"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_escala_niveis_credito"');
  },
};
