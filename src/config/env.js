// Carrega e valida variáveis de ambiente (fonte única de configuração).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
const { z } = require('zod');

const bool = (padrao) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? padrao : ['1', 'true', 'sim', 'yes'].includes(v.toLowerCase()),
    );
const num = (padrao) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? padrao : Number(v)));

const isTest = process.env.NODE_ENV === 'test';
const segredoTeste = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: num(3000),
  APP_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default(isTest ? 'silent' : 'info'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: num(5432),
  DB_NAME: z.string().default('OHVDashSaresp'),
  DB_NAME_TEST: z.string().default('OHVDashSaresp_test'),
  DB_USER: z.string().default('ohv'),
  DB_PASSWORD: z.string().default(''),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
  REFRESH_SECRET: z.string().min(32, 'REFRESH_SECRET deve ter ao menos 32 caracteres'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET deve ter ao menos 32 caracteres'),
  ADMIN_NOME: z.string().default('Administrador'),
  ADMIN_EMAIL: z.string().email().default('admin@professor.educacao.sp.gov.br'),
  ADMIN_PASSWORD: z.string().min(8).default('TroqueJa2026'),
  ALLOWED_EMAIL_DOMAIN: z.string().default('professor.educacao.sp.gov.br'),
  REQUIRE_ADMIN_APPROVAL: bool(true),
  ANULADA_CONTA_ACERTO: bool(true),
  INSIGHT_HABILIDADE_POSITIVA: num(70),
  INSIGHT_HABILIDADE_ATENCAO: num(50),
  INSIGHT_ALUNO_CRITICO: num(40),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: num(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('OHVDashSaresp <nao-responda@escola.sp.gov.br>'),
});

const bruto = { ...process.env };
if (isTest) {
  for (const k of ['JWT_SECRET', 'REFRESH_SECRET', 'CSRF_SECRET']) bruto[k] = bruto[k] || segredoTeste + k;
}
const r = schema.safeParse(bruto);
if (!r.success) {
  const msgs = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[config] Variáveis de ambiente inválidas:\n${msgs}\nVeja o arquivo .env.example.\n`);
  process.exit(1);
}
const env = r.data;
env.isProd = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';
env.isDev = env.NODE_ENV === 'development';
env.DB_DATABASE = env.isTest ? env.DB_NAME_TEST : env.DB_NAME;

module.exports = env;
