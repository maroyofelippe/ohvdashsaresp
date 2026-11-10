module.exports = (sequelize, DataTypes) => {
  const Resposta = sequelize.define(
    'Resposta',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      avaliacao_id: { type: DataTypes.INTEGER, allowNull: false },
      aluno_id: { type: DataTypes.INTEGER, allowNull: false },
      questao_id: { type: DataTypes.INTEGER, allowNull: false },
      aspecto_id: { type: DataTypes.INTEGER, allowNull: true },
      valor: { type: DataTypes.STRING(4), allowNull: false },
      pontos: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0 },
      lancado_por: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'respostas',
      defaultScope: { attributes: { exclude: ['aspecto_key'] } },
      // Alvo do ON CONFLICT (bulkCreate com updateOnDuplicate); aspecto_key é coluna gerada no banco.
      indexes: [{ unique: true, fields: ['aluno_id', 'questao_id', 'aspecto_key'] }],
    },
  );
  Resposta.associate = (m) => {
    Resposta.belongsTo(m.Avaliacao, { foreignKey: 'avaliacao_id', as: 'avaliacao' });
    Resposta.belongsTo(m.Aluno, { foreignKey: 'aluno_id', as: 'aluno' });
    Resposta.belongsTo(m.Questao, { foreignKey: 'questao_id', as: 'questao' });
    Resposta.belongsTo(m.QuestaoAspecto, { foreignKey: 'aspecto_id', as: 'aspecto' });
    Resposta.belongsTo(m.Usuario, { foreignKey: 'lancado_por', as: 'lancador' });
  };
  return Resposta;
};
