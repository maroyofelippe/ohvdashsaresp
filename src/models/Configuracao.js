module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Configuracao',
    {
      chave: { type: DataTypes.STRING(60), primaryKey: true },
      valor: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'configuracoes' },
  );
