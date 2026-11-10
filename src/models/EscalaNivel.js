module.exports = (sequelize, DataTypes) => {
  const EscalaNivel = sequelize.define(
    'EscalaNivel',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      questao_id: { type: DataTypes.INTEGER, allowNull: true },
      aspecto_id: { type: DataTypes.INTEGER, allowNull: true },
      codigo: { type: DataTypes.STRING(2), allowNull: false },
      codigo_alt: { type: DataTypes.STRING(4), allowNull: true },
      credito: { type: DataTypes.ENUM('integral', 'parcial', 'nenhum'), allowNull: true },
      pontos: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'escala_niveis',
      validate: {
        umDono() {
          if ((this.questao_id == null) === (this.aspecto_id == null)) {
            throw new Error('O nível deve pertencer a uma questão OU a um aspecto.');
          }
        },
      },
    },
  );
  EscalaNivel.associate = (m) => {
    EscalaNivel.belongsTo(m.Questao, { foreignKey: 'questao_id', as: 'questao' });
    EscalaNivel.belongsTo(m.QuestaoAspecto, { foreignKey: 'aspecto_id', as: 'aspecto' });
  };
  return EscalaNivel;
};
