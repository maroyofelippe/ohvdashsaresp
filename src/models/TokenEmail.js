module.exports = (sequelize, DataTypes) => {
  const TokenEmail = sequelize.define(
    'TokenEmail',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      tipo: { type: DataTypes.ENUM('confirmacao', 'reset'), allowNull: false },
      token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      expira_em: { type: DataTypes.DATE, allowNull: false },
      usado_em: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'tokens_email' },
  );
  TokenEmail.associate = (m) => TokenEmail.belongsTo(m.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  return TokenEmail;
};
