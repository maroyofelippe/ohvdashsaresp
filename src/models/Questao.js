module.exports = (sequelize, DataTypes) => {
  const Questao = sequelize.define(
    'Questao',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      avaliacao_id: { type: DataTypes.INTEGER, allowNull: false },
      disciplina_id: { type: DataTypes.INTEGER, allowNull: false },
      codigo: { type: DataTypes.STRING(12), allowNull: false },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      tipo: {
        type: DataTypes.ENUM('objetiva', 'escalar', 'producao_texto'),
        allowNull: false,
        defaultValue: 'objetiva',
      },
      num_alternativas: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 4 },
      gabarito: { type: DataTypes.CHAR(1), allowNull: true },
      peso: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
      questao_pai_id: { type: DataTypes.INTEGER, allowNull: true },
      habilidade_bncc: { type: DataTypes.STRING(20), allowNull: true },
      descritor: { type: DataTypes.STRING(400), allowNull: true },
      item_codigo: { type: DataTypes.STRING(30), allowNull: true },
      enunciado_resumo: { type: DataTypes.TEXT, allowNull: true },
      anulada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'questoes' },
  );
  Questao.TIPOS = {
    objetiva: 'Objetiva',
    escalar: 'Escalar (dissertativa)',
    producao_texto: 'Produção de texto',
  };
  Questao.associate = (m) => {
    Questao.belongsTo(m.Avaliacao, { foreignKey: 'avaliacao_id', as: 'avaliacao' });
    Questao.belongsTo(m.Disciplina, { foreignKey: 'disciplina_id', as: 'disciplina' });
    Questao.belongsTo(Questao, { foreignKey: 'questao_pai_id', as: 'pai' });
    Questao.hasMany(Questao, { foreignKey: 'questao_pai_id', as: 'subitens' });
    Questao.hasMany(m.EscalaNivel, { foreignKey: 'questao_id', as: 'niveis' });
    Questao.hasMany(m.QuestaoAspecto, { foreignKey: 'questao_id', as: 'aspectos' });
    Questao.hasMany(m.QuestaoSituacao, { foreignKey: 'questao_id', as: 'situacoes' });
    Questao.hasMany(m.Resposta, { foreignKey: 'questao_id', as: 'respostas' });
  };
  return Questao;
};
