const { z } = require('zod');
const env = require('../config/env');

const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Valida e-mail do domínio institucional (regex ancorada, minúsculas). */
function emailInstitucionalValido(email, dominio = env.ALLOWED_EMAIL_DOMAIN) {
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  const re = new RegExp(`^[a-z0-9._%+-]+@${escRegex(dominio.toLowerCase())}$`);
  return re.test(e);
}

const senhaForte = z
  .string({ required_error: 'Informe a senha.' })
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra.')
  .regex(/\d/, 'A senha deve conter ao menos um número.');

const id = z.coerce.number().int().positive();
const idOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional(),
);
const listaIds = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x !== '');
}, z.array(z.coerce.number().int().positive()));
const textoOpc = (max) =>
  z.preprocess((v) => (v === null || v === undefined ? '' : String(v).trim()), z.string().max(max));

module.exports = { emailInstitucionalValido, senhaForte, id, idOpcional, listaIds, textoOpc, z };
