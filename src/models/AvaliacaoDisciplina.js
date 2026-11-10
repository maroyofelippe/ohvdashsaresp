module.exports = (sequelize, DataTypes) => {
  const AvaliacaoDisciplina = sequelize.define(
    'AvaliacaoDisciplina',
    {
      avaliacao_id: { type: DataTypes.INTEGER, primaryKey: true },
      disciplina_id: { type: DataTypes.INTEGER, primaryKey: true },
      data_aplicacao: { type: DataTypes.DATEONLY, allowNull: true },
    },
    { tableName: 'avaliacao_disciplinas' },
  );
  AvaliacaoDisciplina.associate = (m) => {
    AvaliacaoDisciplina.belongsTo(m.Avaliacao, { foreignKey: 'avaliacao_id', as: 'avaliacao' });
    AvaliacaoDisciplina.belongsTo(m.Disciplina, { foreignKey: 'disciplina_id', as: 'disciplina' });
  };
  return AvaliacaoDisciplina;
};
