module.exports = (sequelize, DataTypes) => {
  const Usuario = sequelize.define(
    'Usuario',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      nome: { type: DataTypes.STRING(150), allowNull: false },
      email: {
        type: DataTypes.STRING(180),
        allowNull: false,
        unique: true,
        set(v) {
          this.setDataValue(
            'email',
            String(v || '')
              .trim()
              .toLowerCase(),
          );
        },
      },
      senha_hash: { type: DataTypes.STRING(100), allowNull: false },
      perfil: { type: DataTypes.ENUM('admin', 'coordenador', 'professor'), allowNull: false },
      status: {
        type: DataTypes.ENUM('pendente_email', 'pendente', 'ativo', 'inativo'),
        allowNull: false,
        defaultValue: 'pendente_email',
      },
      nativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      trocar_senha: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      falhas_login: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      bloqueado_ate: { type: DataTypes.DATE, allowNull: true },
      ultimo_login: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'usuarios',
      paranoid: true,
      defaultScope: { attributes: { exclude: ['senha_hash'] } },
      scopes: { comSenha: { attributes: { include: ['senha_hash'] } } },
    },
  );
  Usuario.associate = (m) => {
    Usuario.hasMany(m.RefreshToken, { foreignKey: 'usuario_id', as: 'refreshTokens' });
    Usuario.hasMany(m.ProfessorTurma, { foreignKey: 'usuario_id', as: 'vinculos' });
    Usuario.belongsToMany(m.Turma, {
      through: m.ProfessorTurma,
      foreignKey: 'usuario_id',
      otherKey: 'turma_id',
      as: 'turmas',
    });
  };
  Usuario.prototype.toJSON = function toJSON() {
    const v = { ...this.get() };
    delete v.senha_hash;
    return v;
  };
  return Usuario;
};
