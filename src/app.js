const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./utils/logger');
const { authenticate } = require('./middlewares/authenticate');
const { doubleCsrfProtection, identificadorNavegador, tokenNasViews } = require('./middlewares/csrf');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const configuracoes = require('./services/configuracoes.service');
const fmt = require('./utils/formatar');
const { icone } = require('./utils/icones');

const app = express();
if (env.isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': env.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

if (!env.isTest) {
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) =>
          req.url.startsWith('/css') || req.url.startsWith('/js') || req.url.startsWith('/vendor'),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (r) => ({ method: r.method, url: r.url }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
    }),
  );
}

// Imagens/fontes/vendor: cache longo. JS e CSS não têm hash no nome, então o navegador precisa
// revalidar (ETag → 304 barato) a cada uso; senão um deploy novo só chega ao usuário após 7 dias.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: env.isProd ? '7d' : 0,
    index: false,
    setHeaders: (res, arquivo) => {
      if (/\.(js|css)$/i.test(arquivo) && !arquivo.includes(`${path.sep}vendor${path.sep}`))
        res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '4mb' }));
app.use(hpp({ whitelist: ['turma', 'turmas'] }));
app.use(cookieParser());
app.use(identificadorNavegador);
app.use(authenticate);

// Variáveis comuns às views
app.use(async (req, res, next) => {
  try {
    res.locals.escola = await configuracoes.obterTodas();
    res.locals.fmt = fmt;
    res.locals.icone = icone;
    res.locals.caminho = req.path;
    res.locals.titulo = 'OHVDashSaresp';
    res.locals.erros = {};
    res.locals.valores = {};
    res.locals.json = (obj) =>
      JSON.stringify(obj ?? null)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    next();
  } catch (e) {
    next(e);
  }
});

app.use(doubleCsrfProtection);
app.use(tokenNasViews);

app.use('/api', require('./routes/api'));
app.use('/', require('./routes/web'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
