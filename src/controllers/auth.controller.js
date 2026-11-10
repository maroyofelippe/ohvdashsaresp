const rateLimit = require('express-rate-limit');
const authService = require('../services/auth.service');
const { Turma, Serie, AnoLetivo } = require('../models');
const v = require('../validators/auth.validators');
const { errosZod } = require('../middlewares/validate');
const { definirCookiesSessao, limparCookiesSessao } = require('../middlewares/authenticate');
const env = require('../config/env');

const LAYOUT = { layout: 'layouts/auth' };
const meta = (req) => ({ ip: req.ip, ua: req.get('user-agent') });
/** Evita open redirect: só caminhos internos. */
const destinoSeguro = (n) =>
  typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/';

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${req.ip}|${String(req.body?.email || '')
      .trim()
      .toLowerCase()}`,
  handler: (req, res) =>
    res.status(429).render('pages/auth/login', {
      ...LAYOUT,
      titulo: 'Entrar',
      erros: { _: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      valores: { email: req.body?.email },
      next: req.body?.next,
    }),
});
const limiteFormularios = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

async function turmasParaCadastro() {
  const ts = await Turma.findAll({
    include: [
      { model: Serie, as: 'serie' },
      { model: AnoLetivo, as: 'anoLetivo', where: { ativo: true } },
    ],
    order: [
      [{ model: AnoLetivo, as: 'anoLetivo' }, 'ano', 'DESC'],
      [{ model: Serie, as: 'serie' }, 'ordem', 'ASC'],
      ['letra', 'ASC'],
    ],
  });
  return ts.map((t) => ({ id: t.id, letra: t.letra, serieNome: t.serie.nome, ano: t.anoLetivo.ano }));
}

module.exports = {
  limiteLogin,
  limiteFormularios,

  telaLogin(req, res) {
    const avisos = {
      saiu: ['Você saiu do sistema.', 'ok'],
      expirou: ['Sua sessão expirou. Entre novamente.', 'aviso'],
      senha: ['Senha redefinida. Entre com a nova senha.', 'ok'],
    };
    const [aviso, avisoTipo] = avisos[req.query.msg] || [];
    res.render('pages/auth/login', { ...LAYOUT, titulo: 'Entrar', next: req.query.next, aviso, avisoTipo });
  },

  async login(req, res, next) {
    const r = v.login.safeParse(req.body);
    const valores = { email: req.body.email };
    if (!r.success)
      return res
        .status(400)
        .render('pages/auth/login', {
          ...LAYOUT,
          titulo: 'Entrar',
          erros: errosZod(r.error),
          valores,
          next: req.body.next,
        });
    try {
      const sessao = await authService.login(r.data, meta(req));
      definirCookiesSessao(res, sessao);
      return res.redirect(sessao.usuario.trocar_senha ? '/conta/senha' : destinoSeguro(req.body.next));
    } catch (e) {
      if (!e.status || e.status >= 500) return next(e);
      return res
        .status(e.status)
        .render('pages/auth/login', {
          ...LAYOUT,
          titulo: 'Entrar',
          erros: { _: e.message },
          valores,
          next: req.body.next,
        });
    }
  },

  async telaCadastro(req, res, next) {
    try {
      res.render('pages/auth/cadastro', {
        ...LAYOUT,
        titulo: 'Criar conta',
        turmas: await turmasParaCadastro(),
        dominio: env.ALLOWED_EMAIL_DOMAIN,
      });
    } catch (e) {
      next(e);
    }
  },

  async cadastrar(req, res, next) {
    try {
      const r = v.cadastro.safeParse(req.body);
      if (!r.success) {
        return res.status(400).render('pages/auth/cadastro', {
          ...LAYOUT,
          titulo: 'Criar conta',
          turmas: await turmasParaCadastro(),
          dominio: env.ALLOWED_EMAIL_DOMAIN,
          erros: errosZod(r.error),
          valores: { ...req.body, turmas: [].concat(req.body.turmas || []) },
        });
      }
      await authService.cadastrar(r.data, meta(req));
      res.render('pages/auth/mensagem', {
        ...LAYOUT,
        titulo: 'Confirme seu e-mail',
        tituloMsg: 'Quase lá!',
        tipo: 'ok',
        mensagem: `Enviamos um link de confirmação para ${r.data.email}. Ele vale por 24 horas.${env.REQUIRE_ADMIN_APPROVAL ? ' Depois da confirmação, a administração vai aprovar seu acesso.' : ''}`,
      });
    } catch (e) {
      next(e);
    }
  },

  async confirmarEmail(req, res, next) {
    try {
      const r = await authService.confirmarEmail(String(req.query.token || ''), meta(req));
      if (!r) {
        return res
          .status(400)
          .render('pages/auth/mensagem', {
            ...LAYOUT,
            titulo: 'Link inválido',
            tituloMsg: 'Link inválido ou expirado',
            tipo: 'erro',
            mensagem: 'Este link não é mais válido. Faça o cadastro novamente ou procure a administração.',
          });
      }
      const mensagem =
        r.status === 'pendente'
          ? 'E-mail confirmado! Seu cadastro agora aguarda aprovação da administração. Você receberá um aviso por e-mail.'
          : 'E-mail confirmado! Você já pode entrar.';
      res.render('pages/auth/mensagem', {
        ...LAYOUT,
        titulo: 'E-mail confirmado',
        tituloMsg: 'E-mail confirmado',
        tipo: 'ok',
        mensagem,
      });
    } catch (e) {
      next(e);
    }
  },

  telaEsqueci(req, res) {
    res.render('pages/auth/esqueci', { ...LAYOUT, titulo: 'Recuperar senha' });
  },

  async esqueci(req, res, next) {
    try {
      const r = v.esqueci.safeParse(req.body);
      if (r.success) await authService.solicitarReset(r.data.email, meta(req));
      res.render('pages/auth/mensagem', {
        ...LAYOUT,
        titulo: 'Verifique seu e-mail',
        tituloMsg: 'Verifique seu e-mail',
        tipo: 'ok',
        mensagem:
          'Se houver uma conta com este e-mail, você receberá um link para redefinir a senha (válido por 1 hora).',
      });
    } catch (e) {
      next(e);
    }
  },

  telaRedefinir(req, res) {
    res.render('pages/auth/redefinir', {
      ...LAYOUT,
      titulo: 'Nova senha',
      token: String(req.query.token || ''),
    });
  },

  async redefinir(req, res, next) {
    try {
      const r = v.redefinir.safeParse(req.body);
      if (!r.success)
        return res
          .status(400)
          .render('pages/auth/redefinir', {
            ...LAYOUT,
            titulo: 'Nova senha',
            token: req.body.token,
            erros: errosZod(r.error),
          });
      const ok = await authService.redefinirSenha(r.data.token, r.data.senha, meta(req));
      if (!ok)
        return res
          .status(400)
          .render('pages/auth/redefinir', {
            ...LAYOUT,
            titulo: 'Nova senha',
            token: req.body.token,
            erros: { _: 'Link inválido ou expirado. Solicite um novo.' },
          });
      limparCookiesSessao(res);
      res.redirect('/login?msg=senha');
    } catch (e) {
      next(e);
    }
  },

  /** GET: renovação transparente de páginas (o cookie de refresh só trafega neste caminho). */
  async refreshPagina(req, res, next) {
    try {
      const destino = destinoSeguro(req.query.next);
      const r = await authService.rotacionarRefresh(req.cookies.ohv_rt, meta(req));
      if (!r) {
        limparCookiesSessao(res);
        return res.redirect(`/login?msg=expirou&next=${encodeURIComponent(destino)}`);
      }
      definirCookiesSessao(res, r);
      res.redirect(destino);
    } catch (e) {
      next(e);
    }
  },

  /** POST (fetch): renova e responde JSON. */
  async refreshApi(req, res, next) {
    try {
      const r = await authService.rotacionarRefresh(req.cookies.ohv_rt, meta(req));
      if (!r) {
        limparCookiesSessao(res);
        return res
          .status(401)
          .json({ erro: 'Sessão expirada. Entre novamente.', detalhes: { codigo: 'nao_autenticado' } });
      }
      definirCookiesSessao(res, r);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },

  async logout(req, res, next) {
    try {
      await authService.revogarRefresh(req.cookies.ohv_rt);
      limparCookiesSessao(res);
      res.redirect('/login?msg=saiu');
    } catch (e) {
      next(e);
    }
  },

  telaSenha(req, res) {
    res.render('pages/conta/senha', { titulo: 'Minha conta', ok: req.query.ok === '1' });
  },

  async trocarSenha(req, res, next) {
    try {
      const r = v.trocarSenha.safeParse(req.body);
      if (!r.success)
        return res
          .status(400)
          .render('pages/conta/senha', { titulo: 'Minha conta', erros: errosZod(r.error) });
      const sessao = await authService.trocarSenha(req.usuario.id, r.data, meta(req));
      definirCookiesSessao(res, sessao);
      res.redirect(req.usuario.trocar_senha ? '/' : '/conta/senha?ok=1');
    } catch (e) {
      if (e.status === 400)
        return res
          .status(400)
          .render('pages/conta/senha', { titulo: 'Minha conta', erros: e.detalhes || { _: e.message } });
      next(e);
    }
  },
};
