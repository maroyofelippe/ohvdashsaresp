module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Disciplina',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      sigla: { type: DataTypes.STRING(4), allowNull: false, unique: true },
      nome: { type: DataTypes.STRING(60), allowNull: false },
    },
    { tableName: 'disciplinas', defaultScope: { order: [['id', 'ASC']] } },
  );
