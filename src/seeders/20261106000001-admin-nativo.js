'use strict';
/** Admin nativo a partir de ADMIN_EMAIL / ADMIN_PASSWORD (troca de senha obrigatória no 1º login). */
module.exports = {
  async up() {
    const env = require('../config/env');
    const { Usuario } = require('../models');
    const auth = require('../services/auth.service');
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    const existe = await Usuario.findOne({ where: { email }, paranoid: false });
    if (existe) {
      if (!existe.nativo) await existe.update({ nativo: true, perfil: 'admin', status: 'ativo' });
      return;
    }
    await Usuario.create({
      nome: env.ADMIN_NOME,
      email,
      senha_hash: await auth.hashSenha(env.ADMIN_PASSWORD),
      perfil: 'admin',
      status: 'ativo',
      nativo: true,
      trocar_senha: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('usuarios', { nativo: true });
  },
};
