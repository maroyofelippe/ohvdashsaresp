const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'senha',
      '*.senha',
      'password',
      '*.password',
      'req.body.senha',
    ],
    censor: '[oculto]',
  },
  transport: env.isDev
    ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

module.exports = logger;
