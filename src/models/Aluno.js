module.exports = (sequelize, DataTypes) => {
  const Aluno = sequelize.define(
    'Aluno',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      turma_id: { type: DataTypes.INTEGER, allowNull: false },
      numero_chamada: { type: DataTypes.SMALLINT, allowNull: false },
      nome: {
        type: DataTypes.STRING(150),
        allowNull: false,
        set(v) {
          this.setDataValue(
            'nome',
            String(v || '')
              .replace(/\s+/g, ' ')
              .trim()
              .toUpperCase(),
          );
        },
      },
      ra: {
        type: DataTypes.STRING(20),
        allowNull: true,
        set(v) {
          const s = String(v ?? '').trim();
          this.setDataValue('ra', s || null);
        },
      },
      situacao: {
        type: DataTypes.ENUM('ativo', 'transferido', 'remanejado'),
        allowNull: false,
        defaultValue: 'ativo',
      },
    },
    {
      tableName: 'alunos',
      paranoid: true,
      defaultScope: { attributes: { exclude: ['ativo_key'] } },
      scopes: {
        turmas(ids) {
          return ids ? { where: { turma_id: ids.length ? ids : [0] } } : {};
        },
      },
    },
  );
  Aluno.associate = (m) => {
    Aluno.belongsTo(m.Turma, { foreignKey: 'turma_id', as: 'turma' });
    Aluno.hasMany(m.Resposta, { foreignKey: 'aluno_id', as: 'respostas' });
    Aluno.hasMany(m.Participacao, { foreignKey: 'aluno_id', as: 'participacoes' });
  };
  return Aluno;
};
