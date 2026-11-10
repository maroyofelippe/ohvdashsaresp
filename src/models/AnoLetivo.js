module.exports = (sequelize, DataTypes) => {
  const AnoLetivo = sequelize.define(
    'AnoLetivo',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      ano: { type: DataTypes.SMALLINT, allowNull: false, unique: true },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'anos_letivos' },
  );
  AnoLetivo.associate = (m) => {
    AnoLetivo.hasMany(m.Turma, { foreignKey: 'ano_letivo_id', as: 'turmas' });
    AnoLetivo.hasMany(m.Avaliacao, { foreignKey: 'ano_letivo_id', as: 'avaliacoes' });
  };
  return AnoLetivo;
};
