const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const env = require('../config/env');
const db = require('../models');
const { gerarToken, hashToken, uuid } = require('../utils/tokens');
const AppError = require('../utils/AppError');
const email = require('./email.service');
const auditoria = require('./auditoria.service');

const { Usuario, RefreshToken, TokenEmail, ProfessorTurma, Turma, sequelize } = db;

const CUSTO_BCRYPT = env.isTest ? 4 : 12;
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FALHAS = 10;
const BLOQUEIO_MS = 15 * 60 * 1000;
const MSG_LOGIN = 'E-mail ou senha inválidos.';
const HASH_FALSO = bcrypt.hashSync('senha-inexistente', CUSTO_BCRYPT);

const hashSenha = (s) => bcrypt.hash(s, CUSTO_BCRYPT);
const conferirSenha = (s, h) => bcrypt.compare(String(s), h);

function emitirAccessToken(usuario) {
  return jwt.sign({ sub: usuario.id, role: usuario.perfil, tv: usuario.token_version }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL_S,
  });
}
function verificarAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

async function criarRefresh(usuario, { ip, ua, familia } = {}, transaction) {
  const token = gerarToken(48);
  const reg = await RefreshToken.create(
    {
      usuario_id: usuario.id,
      token_hash: hashToken(token),
      familia: familia || uuid(),
      expira_em: new Date(Date.now() + REFRESH_TTL_MS),
      criado_ip: ip || null,
      user_agent: ua ? String(ua).slice(0, 255) : null,
    },
    { transaction },
  );
  return { token, registro: reg };
}

async function revogarFamilia(familia, transaction) {
  await RefreshToken.update(
    { revogado_em: new Date() },
    { where: { familia, revogado_em: null }, transaction },
  );
}

/** Rotação com detecção de reuso: reuso de token já revogado revoga a família inteira. */
async function rotacionarRefresh(token, meta = {}) {
  if (!token) return null;
  return sequelize.transaction(async (t) => {
    const atual = await RefreshToken.findOne({
      where: { token_hash: hashToken(token) },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!atual) return null;
    if (atual.revogado_em) {
      await revogarFamilia(atual.familia, t);
      await auditoria.registrar(
        {
          usuarioId: atual.usuario_id,
          acao: 'auth.refresh_reuso',
          entidade: 'refresh_tokens',
          entidadeId: atual.id,
          ip: meta.ip,
        },
        t,
      );
      return null;
    }
    if (new Date(atual.expira_em) < new Date()) return null;
    const usuario = await Usuario.findByPk(atual.usuario_id, { transaction: t });
    if (!usuario || usuario.status !== 'ativo') {
      await revogarFamilia(atual.familia, t);
      return null;
    }
    const novo = await criarRefresh(usuario, { ...meta, familia: atual.familia }, t);
    await atual.update({ revogado_em: new Date(), substituido_por: novo.registro.id }, { transaction: t });
    return { usuario, refresh: novo.token, access: emitirAccessToken(usuario) };
  });
}

async function revogarRefresh(token) {
  if (!token) return;
  await RefreshToken.update(
    { revogado_em: new Date() },
    { where: { token_hash: hashToken(token), revogado_em: null } },
  );
}

async function login({ email: em, senha }, meta = {}) {
  const usuario = await Usuario.scope('comSenha').findOne({ where: { email: em } });
  if (!usuario) {
    await bcrypt.compare(String(senha), HASH_FALSO); // tempo constante
    throw AppError.unauthorized(MSG_LOGIN);
  }
  if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    throw new AppError(
      429,
      'Muitas tentativas. Conta bloqueada temporariamente; tente novamente em alguns minutos.',
    );
  }
  const ok = await conferirSenha(senha, usuario.senha_hash);
  if (!ok) {
    const falhas = usuario.falhas_login + 1;
    await usuario.update({
      falhas_login: falhas >= MAX_FALHAS ? 0 : falhas,
      bloqueado_ate: falhas >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MS) : usuario.bloqueado_ate,
    });
    await auditoria.registrar({
      usuarioId: usuario.id,
      acao: 'auth.login_falha',
      entidade: 'usuarios',
      entidadeId: usuario.id,
      ip: meta.ip,
    });
    throw AppError.unauthorized(MSG_LOGIN);
  }
  if (usuario.status === 'pendente_email')
    throw AppError.forbidden('Confirme seu e-mail pelo link que enviamos antes de entrar.');
  if (usuario.status === 'pendente')
    throw AppError.forbidden('Seu cadastro aguarda aprovação do administrador.');
  if (usuario.status === 'inativo')
    throw AppError.forbidden('Sua conta está desativada. Procure a administração.');
  await usuario.update({ falhas_login: 0, bloqueado_ate: null, ultimo_login: new Date() });
  const { token: refresh } = await criarRefresh(usuario, meta);
  await auditoria.registrar({
    usuarioId: usuario.id,
    acao: 'auth.login',
    entidade: 'usuarios',
    entidadeId: usuario.id,
    ip: meta.ip,
  });
  return { usuario, access: emitirAccessToken(usuario), refresh };
}

async function criarTokenEmail(usuario, tipo, horas, transaction) {
  const token = gerarToken(32);
  await TokenEmail.create(
    {
      usuario_id: usuario.id,
      tipo,
      token_hash: hashToken(token),
      expira_em: new Date(Date.now() + horas * 3600 * 1000),
    },
    { transaction },
  );
  return token;
}

async function consumirTokenEmail(token, tipo, transaction) {
  const reg = await TokenEmail.findOne({
    where: { token_hash: hashToken(token || ''), tipo },
    transaction,
    lock: transaction?.LOCK.UPDATE,
  });
  if (!reg || reg.usado_em || new Date(reg.expira_em) < new Date()) return null;
  await reg.update({ usado_em: new Date() }, { transaction });
  return reg;
}

async function cadastrar(dados, meta = {}) {
  const existente = await Usuario.findOne({ where: { email: dados.email }, paranoid: false });
  if (existente) {
    // Não revela que o e-mail existe; avisa o titular por e-mail.
    if (!existente.deleted_at) await email.jaCadastrado(existente);
    return { criado: false };
  }
  let turmasValidas = [];
  if (dados.perfil === 'professor') {
    const ts = await Turma.findAll({ where: { id: dados.turmas }, attributes: ['id'] });
    turmasValidas = ts.map((t) => t.id);
    if (!turmasValidas.length) throw AppError.badRequest('Selecione turmas válidas.');
  }
  const { usuario, token } = await sequelize.transaction(async (t) => {
    const u = await Usuario.create(
      {
        nome: dados.nome,
        email: dados.email,
        senha_hash: await hashSenha(dados.senha),
        perfil: dados.perfil,
        status: 'pendente_email',
      },
      { transaction: t },
    );
    if (turmasValidas.length) {
      await ProfessorTurma.bulkCreate(
        turmasValidas.map((tid) => ({ usuario_id: u.id, turma_id: tid, status: 'pendente' })),
        { transaction: t },
      );
    }
    const tk = await criarTokenEmail(u, 'confirmacao', 24, t);
    await auditoria.registrar(
      {
        usuarioId: u.id,
        acao: 'usuario.cadastro',
        entidade: 'usuarios',
        entidadeId: u.id,
        depois: { perfil: u.perfil, turmas: turmasValidas },
        ip: meta.ip,
      },
      t,
    );
    return { usuario: u, token: tk };
  });
  await email.confirmacao(usuario, token);
  return { criado: true, usuario };
}

/**
 * Gera um novo link de confirmação para um usuário que ainda não confirmou o e-mail
 * (uso do administrador, que o repassa manualmente). Invalida links anteriores não usados.
 */
async function gerarLinkConfirmacao(usuarioId, horas = 72) {
  return sequelize.transaction(async (t) => {
    const u = await Usuario.findByPk(usuarioId, { transaction: t });
    if (!u) throw AppError.notFound();
    if (u.status !== 'pendente_email')
      throw AppError.conflict('Este usuário não está aguardando confirmação de e-mail.');
    await TokenEmail.update(
      { usado_em: new Date() },
      { where: { usuario_id: u.id, tipo: 'confirmacao', usado_em: null }, transaction: t },
    );
    const token = await criarTokenEmail(u, 'confirmacao', horas, t);
    return {
      link: email.linkConfirmacao(token),
      expira_em: new Date(Date.now() + horas * 3600 * 1000),
      usuario: { id: u.id, nome: u.nome, email: u.email },
    };
  });
}

async function confirmarEmail(token, meta = {}) {
  const resultado = await sequelize.transaction(async (t) => {
    const reg = await consumirTokenEmail(token, 'confirmacao', t);
    if (!reg) return null;
    const u = await Usuario.findByPk(reg.usuario_id, { transaction: t });
    if (!u || u.status !== 'pendente_email') return { usuario: u, status: u?.status };
    if (env.REQUIRE_ADMIN_APPROVAL) {
      await u.update({ status: 'pendente' }, { transaction: t });
    } else {
      await u.update({ status: 'ativo' }, { transaction: t });
      await ProfessorTurma.update({ status: 'aprovado' }, { where: { usuario_id: u.id }, transaction: t });
    }
    await auditoria.registrar(
      {
        usuarioId: u.id,
        acao: 'usuario.email_confirmado',
        entidade: 'usuarios',
        entidadeId: u.id,
        ip: meta.ip,
      },
      t,
    );
    return { usuario: u, status: u.status };
  });
  if (resultado?.status === 'pendente') {
    const admins = await Usuario.findAll({ where: { perfil: 'admin', status: 'ativo' } });
    await Promise.all(admins.map((a) => email.novaAprovacao(a, resultado.usuario)));
  }
  return resultado;
}

async function solicitarReset(em, meta = {}) {
  const u = await Usuario.findOne({ where: { email: em, status: { [Op.in]: ['ativo', 'pendente'] } } });
  if (!u) return;
  const token = await criarTokenEmail(u, 'reset', 1);
  await auditoria.registrar({
    usuarioId: u.id,
    acao: 'auth.reset_solicitado',
    entidade: 'usuarios',
    entidadeId: u.id,
    ip: meta.ip,
  });
  await email.reset(u, token);
}

async function redefinirSenha(token, senha, meta = {}) {
  return sequelize.transaction(async (t) => {
    const reg = await consumirTokenEmail(token, 'reset', t);
    if (!reg) return false;
    const u = await Usuario.findByPk(reg.usuario_id, { transaction: t });
    if (!u) return false;
    await u.update(
      {
        senha_hash: await hashSenha(senha),
        token_version: u.token_version + 1,
        trocar_senha: false,
        falhas_login: 0,
        bloqueado_ate: null,
      },
      { transaction: t },
    );
    await RefreshToken.update(
      { revogado_em: new Date() },
      { where: { usuario_id: u.id, revogado_em: null }, transaction: t },
    );
    await auditoria.registrar(
      { usuarioId: u.id, acao: 'auth.senha_redefinida', entidade: 'usuarios', entidadeId: u.id, ip: meta.ip },
      t,
    );
    return true;
  });
}

async function trocarSenha(usuarioId, { senha_atual, senha }, meta = {}) {
  const u = await Usuario.scope('comSenha').findByPk(usuarioId);
  if (!u || !(await conferirSenha(senha_atual, u.senha_hash)))
    throw AppError.badRequest('A senha atual está incorreta.', {
      senha_atual: 'A senha atual está incorreta.',
    });
  await sequelize.transaction(async (t) => {
    await u.update(
      { senha_hash: await hashSenha(senha), token_version: u.token_version + 1, trocar_senha: false },
      { transaction: t },
    );
    await RefreshToken.update(
      { revogado_em: new Date() },
      { where: { usuario_id: u.id, revogado_em: null }, transaction: t },
    );
    await auditoria.registrar(
      { usuarioId: u.id, acao: 'auth.senha_alterada', entidade: 'usuarios', entidadeId: u.id, ip: meta.ip },
      t,
    );
  });
  const reloaded = await Usuario.findByPk(u.id);
  const { token: refresh } = await criarRefresh(reloaded, meta);
  return { usuario: reloaded, access: emitirAccessToken(reloaded), refresh };
}

module.exports = {
  hashSenha,
  conferirSenha,
  emitirAccessToken,
  verificarAccessToken,
  criarRefresh,
  rotacionarRefresh,
  revogarRefresh,
  login,
  cadastrar,
  confirmarEmail,
  gerarLinkConfirmacao,
  solicitarReset,
  redefinirSenha,
  trocarSenha,
  ACCESS_TTL_S,
  REFRESH_TTL_MS,
};
