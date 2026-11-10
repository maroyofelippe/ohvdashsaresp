module.exports = (sequelize, DataTypes) => {
  const QuestaoAspecto = sequelize.define(
    'QuestaoAspecto',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: { type: DataTypes.INTEGER, allowNull: false },
      codigo: { type: DataTypes.STRING(6), allowNull: false },
      nome: { type: DataTypes.STRING(80), allowNull: false },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'questao_aspectos' },
  );
  QuestaoAspecto.associate = (m) => {
    QuestaoAspecto.belongsTo(m.Questao, { foreignKey: 'questao_id', as: 'questao' });
    QuestaoAspecto.hasMany(m.EscalaNivel, { foreignKey: 'aspecto_id', as: 'niveis' });
  };
  return QuestaoAspecto;
};
