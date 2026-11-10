module.exports = (sequelize, DataTypes) => {
  const Auditoria = sequelize.define(
    'Auditoria',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      acao: { type: DataTypes.STRING(60), allowNull: false },
      entidade: { type: DataTypes.STRING(60), allowNull: true },
      entidade_id: { type: DataTypes.STRING(40), allowNull: true },
      antes: { type: DataTypes.JSON, allowNull: true },
      depois: { type: DataTypes.JSON, allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      criado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'auditoria', timestamps: false },
  );
  Auditoria.associate = (m) => Auditoria.belongsTo(m.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  return Auditoria;
};
