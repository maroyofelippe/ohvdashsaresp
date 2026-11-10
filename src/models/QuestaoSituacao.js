module.exports = (sequelize, DataTypes) => {
  const QuestaoSituacao = sequelize.define(
    'QuestaoSituacao',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: { type: DataTypes.INTEGER, allowNull: false },
      codigo: { type: DataTypes.STRING(2), allowNull: false },
      nome: { type: DataTypes.STRING(40), allowNull: false },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      zera_nota: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'questao_situacoes' },
  );
  QuestaoSituacao.associate = (m) =>
    QuestaoSituacao.belongsTo(m.Questao, { foreignKey: 'questao_id', as: 'questao' });
  return QuestaoSituacao;
};
