const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter;
/** Caixa de saída em memória (usada nos testes e em dev para inspeção). */
const caixaSaida = [];

function obterTransporter() {
  if (transporter) return transporter;
  if (env.SMTP_HOST && !env.isTest) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function modelo(titulo, paragrafos, botao) {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('');
  const btn = botao
    ? `<p style="margin:20px 0"><a href="${esc(botao.url)}" style="background:#1F4E8C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(botao.texto)}</a></p><p style="font-size:12px;color:#78716C">Se o botão não funcionar, copie este endereço: ${esc(botao.url)}</p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;color:#1C1917;max-width:520px"><h2 style="font-size:18px">${esc(titulo)}</h2>${corpo}${btn}<p style="font-size:12px;color:#78716C">E. E. Prof. Orlando Horácio Vita · OHVDashSaresp</p></div>`;
}

async function enviar({ para, assunto, titulo, paragrafos, botao }) {
  const texto = [...paragrafos, botao ? `${botao.texto}: ${botao.url}` : ''].join('\n\n');
  const msg = {
    from: env.MAIL_FROM,
    to: para,
    subject: assunto,
    text: texto,
    html: modelo(titulo || assunto, paragrafos, botao),
  };
  caixaSaida.push({ para, assunto, texto, botao });
  if (caixaSaida.length > 50) caixaSaida.shift();
  try {
    await obterTransporter().sendMail(msg);
    if (!env.SMTP_HOST && !env.isTest)
      logger.info({ para, assunto, link: botao?.url }, '[e-mail dev] mensagem gerada (sem SMTP configurado)');
  } catch (e) {
    logger.error({ err: e, para, assunto }, 'Falha ao enviar e-mail');
  }
}

const url = (caminho) => `${env.APP_URL.replace(/\/$/, '')}${caminho}`;

module.exports = {
  caixaSaida,
  enviar,
  linkConfirmacao: (token) => url(`/confirmar-email?token=${encodeURIComponent(token)}`),
  confirmacao: (u, token) =>
    enviar({
      para: u.email,
      assunto: 'Confirme seu e-mail — OHVDashSaresp',
      paragrafos: [
        `Olá, ${u.nome}.`,
        'Para concluir seu cadastro, confirme seu e-mail. O link vale por 24 horas.',
      ],
      botao: { texto: 'Confirmar e-mail', url: url(`/confirmar-email?token=${encodeURIComponent(token)}`) },
    }),
  jaCadastrado: (u) =>
    enviar({
      para: u.email,
      assunto: 'Tentativa de cadastro — OHVDashSaresp',
      paragrafos: [
        `Olá, ${u.nome}.`,
        'Alguém tentou criar uma conta com este e-mail, que já está cadastrado. Se foi você e esqueceu a senha, use "Esqueci minha senha".',
      ],
      botao: { texto: 'Recuperar senha', url: url('/esqueci-senha') },
    }),
  reset: (u, token) =>
    enviar({
      para: u.email,
      assunto: 'Redefinição de senha — OHVDashSaresp',
      paragrafos: [
        `Olá, ${u.nome}.`,
        'Recebemos um pedido para redefinir sua senha. O link vale por 1 hora e pode ser usado uma única vez. Se não foi você, ignore esta mensagem.',
      ],
      botao: { texto: 'Redefinir senha', url: url(`/redefinir-senha?token=${encodeURIComponent(token)}`) },
    }),
  novaAprovacao: (admin, u) =>
    enviar({
      para: admin.email,
      assunto: 'Nova conta aguardando aprovação — OHVDashSaresp',
      paragrafos: [`${u.nome} (${u.email}) confirmou o e-mail e aguarda aprovação como ${u.perfil}.`],
      botao: { texto: 'Abrir aprovações', url: url('/admin/aprovacoes') },
    }),
  contaAprovada: (u) =>
    enviar({
      para: u.email,
      assunto: 'Sua conta foi aprovada — OHVDashSaresp',
      paragrafos: [`Olá, ${u.nome}.`, 'Sua conta foi aprovada. Você já pode entrar no sistema.'],
      botao: { texto: 'Entrar', url: url('/login') },
    }),
};
