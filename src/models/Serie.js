module.exports = (sequelize, DataTypes) => {
  const Serie = sequelize.define(
    'Serie',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      nome: { type: DataTypes.STRING(40), allowNull: false, unique: true },
      etapa: { type: DataTypes.ENUM('EF-AI', 'EF-AF', 'EM'), allowNull: false, defaultValue: 'EF-AI' },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'series', defaultScope: { order: [['ordem', 'ASC']] } },
  );
  Serie.associate = (m) => {
    Serie.hasMany(m.Turma, { foreignKey: 'serie_id', as: 'turmas' });
    Serie.hasMany(m.Avaliacao, { foreignKey: 'serie_id', as: 'avaliacoes' });
  };
  return Serie;
};
