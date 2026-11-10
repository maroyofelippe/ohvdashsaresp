module.exports = (sequelize, DataTypes) => {
  const ProfessorTurma = sequelize.define(
    'ProfessorTurma',
    {
      usuario_id: { type: DataTypes.INTEGER, primaryKey: true },
      turma_id: { type: DataTypes.INTEGER, primaryKey: true },
      status: { type: DataTypes.ENUM('pendente', 'aprovado'), allowNull: false, defaultValue: 'pendente' },
    },
    { tableName: 'professor_turmas' },
  );
  ProfessorTurma.associate = (m) => {
    ProfessorTurma.belongsTo(m.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
    ProfessorTurma.belongsTo(m.Turma, { foreignKey: 'turma_id', as: 'turma' });
  };
  return ProfessorTurma;
};
