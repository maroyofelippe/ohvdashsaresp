const PERIODOS = { manha: 'Manhã', tarde: 'Tarde', integral: 'Integral' };

module.exports = (sequelize, DataTypes) => {
  const Turma = sequelize.define(
    'Turma',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      ano_letivo_id: { type: DataTypes.INTEGER, allowNull: false },
      serie_id: { type: DataTypes.INTEGER, allowNull: false },
      letra: {
        type: DataTypes.STRING(3),
        allowNull: false,
        set(v) {
          this.setDataValue(
            'letra',
            String(v || '')
              .trim()
              .toUpperCase(),
          );
        },
      },
      periodo: {
        type: DataTypes.ENUM('manha', 'tarde', 'integral'),
        allowNull: false,
        defaultValue: 'manha',
      },
    },
    {
      tableName: 'turmas',
      indexes: [{ unique: true, fields: ['ano_letivo_id', 'serie_id', 'letra'] }],
      scopes: {
        /** Restringe às turmas indicadas (null = sem restrição). */
        ids(ids) {
          return ids ? { where: { id: ids.length ? ids : [0] } } : {};
        },
      },
    },
  );
  Turma.PERIODOS = PERIODOS;
  Turma.associate = (m) => {
    Turma.belongsTo(m.AnoLetivo, { foreignKey: 'ano_letivo_id', as: 'anoLetivo' });
    Turma.belongsTo(m.Serie, { foreignKey: 'serie_id', as: 'serie' });
    Turma.hasMany(m.Aluno, { foreignKey: 'turma_id', as: 'alunos' });
    Turma.belongsToMany(m.Usuario, {
      through: m.ProfessorTurma,
      foreignKey: 'turma_id',
      otherKey: 'usuario_id',
      as: 'professores',
    });
  };
  return Turma;
};
