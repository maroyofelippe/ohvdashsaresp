module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      familia: { type: DataTypes.CHAR(36), allowNull: false },
      expira_em: { type: DataTypes.DATE, allowNull: false },
      revogado_em: { type: DataTypes.DATE, allowNull: true },
      substituido_por: { type: DataTypes.BIGINT, allowNull: true },
      criado_ip: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'refresh_tokens' },
  );
  RefreshToken.associate = (m) =>
    RefreshToken.belongsTo(m.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  return RefreshToken;
};
