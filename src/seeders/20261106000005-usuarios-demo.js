'use strict';
/** Somente em NODE_ENV=development: 1 coordenador e 2 professores (2º ANO A e 2º ANO B) para testar escopos. */
module.exports = {
  async up() {
    const env = require('../config/env');
    if (!env.isDev) return;
    const { Usuario, Turma, Serie, AnoLetivo, ProfessorTurma } = require('../models');
    const auth = require('../services/auth.service');
    const dominio = env.ALLOWED_EMAIL_DOMAIN;
    const senha_hash = await auth.hashSenha('Demo2026');
    const turma = async (letra) =>
      Turma.findOne({
        where: { letra },
        include: [
          { model: Serie, as: 'serie', where: { nome: '2º ANO' } },
          { model: AnoLetivo, as: 'anoLetivo', where: { ano: 2026 } },
        ],
      });
    const demos = [
      { nome: 'Coordenação Demo', email: `coordenacao.demo@${dominio}`, perfil: 'coordenador', turmas: [] },
      { nome: 'Professora Ana Demo', email: `ana.demo@${dominio}`, perfil: 'professor', turmas: ['A'] },
      { nome: 'Professor Bruno Demo', email: `bruno.demo@${dominio}`, perfil: 'professor', turmas: ['B'] },
    ];
    for (const d of demos) {
      const [u] = await Usuario.findOrCreate({
        where: { email: d.email },
        defaults: { nome: d.nome, email: d.email, senha_hash, perfil: d.perfil, status: 'ativo' },
      });
      for (const l of d.turmas) {
        const t = await turma(l);
        if (t)
          await ProfessorTurma.findOrCreate({
            where: { usuario_id: u.id, turma_id: t.id },
            defaults: { usuario_id: u.id, turma_id: t.id, status: 'aprovado' },
          });
      }
    }
  },
  async down(queryInterface) {
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('usuarios', { email: { [Op.iLike]: '%.demo@%' } });
  },
};
