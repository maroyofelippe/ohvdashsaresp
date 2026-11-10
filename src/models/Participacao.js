module.exports = (sequelize, DataTypes) => {
  const Participacao = sequelize.define(
    'Participacao',
    {
      aluno_id: { type: DataTypes.INTEGER, primaryKey: true },
      avaliacao_id: { type: DataTypes.INTEGER, primaryKey: true },
      disciplina_id: { type: DataTypes.INTEGER, primaryKey: true },
      presenca: { type: DataTypes.ENUM('presente', 'ausente'), allowNull: false, defaultValue: 'presente' },
    },
    { tableName: 'participacoes' },
  );
  Participacao.associate = (m) => {
    Participacao.belongsTo(m.Aluno, { foreignKey: 'aluno_id', as: 'aluno' });
    Participacao.belongsTo(m.Avaliacao, { foreignKey: 'avaliacao_id', as: 'avaliacao' });
    Participacao.belongsTo(m.Disciplina, { foreignKey: 'disciplina_id', as: 'disciplina' });
  };
  return Participacao;
};
