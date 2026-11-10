module.exports = (sequelize, DataTypes) => {
  const Avaliacao = sequelize.define(
    'Avaliacao',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      titulo: { type: DataTypes.STRING(150), allowNull: false },
      tipo: {
        type: DataTypes.ENUM('simulado', 'saresp_oficial', 'diagnostica'),
        allowNull: false,
        defaultValue: 'simulado',
      },
      ano_letivo_id: { type: DataTypes.INTEGER, allowNull: false },
      serie_id: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM('rascunho', 'publicada', 'encerrada'),
        allowNull: false,
        defaultValue: 'rascunho',
      },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'avaliacoes',
      paranoid: true,
      scopes: {
        /** Restringe a pares {ano_letivo_id, serie_id} visíveis (null = sem restrição). */
        series(pares) {
          if (!pares) return {};
          const { Op } = require('sequelize');
          if (!pares.length) return { where: { id: 0 } };
          return {
            where: { [Op.or]: pares.map((p) => ({ ano_letivo_id: p.ano_letivo_id, serie_id: p.serie_id })) },
          };
        },
      },
    },
  );
  Avaliacao.TIPOS = { simulado: 'Simulado', saresp_oficial: 'SARESP oficial', diagnostica: 'Diagnóstica' };
  Avaliacao.STATUS = { rascunho: 'Rascunho', publicada: 'Publicada', encerrada: 'Encerrada' };
  Avaliacao.associate = (m) => {
    Avaliacao.belongsTo(m.AnoLetivo, { foreignKey: 'ano_letivo_id', as: 'anoLetivo' });
    Avaliacao.belongsTo(m.Serie, { foreignKey: 'serie_id', as: 'serie' });
    Avaliacao.belongsTo(m.Usuario, { foreignKey: 'criado_por', as: 'autor' });
    Avaliacao.hasMany(m.AvaliacaoDisciplina, { foreignKey: 'avaliacao_id', as: 'disciplinas' });
    Avaliacao.hasMany(m.Questao, { foreignKey: 'avaliacao_id', as: 'questoes' });
  };
  return Avaliacao;
};
