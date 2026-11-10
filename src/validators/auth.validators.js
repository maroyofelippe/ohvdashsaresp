const { z, senhaForte, emailInstitucionalValido, listaIds } = require('./comuns');
const env = require('../config/env');

const email = z
  .string({ required_error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .email('E-mail inválido.')
  .max(180);

const cadastro = z
  .object({
    nome: z.string().trim().min(5, 'Informe o nome completo.').max(150),
    email: email.refine((e) => emailInstitucionalValido(e), {
      message: `Use seu e-mail institucional @${env.ALLOWED_EMAIL_DOMAIN}.`,
    }),
    senha: senhaForte,
    confirmar_senha: z.string(),
    perfil: z.enum(['professor', 'coordenador'], {
      errorMap: () => ({ message: 'Escolha Professor ou Coordenador.' }),
    }),
    turmas: listaIds,
  })
  .refine((d) => d.senha === d.confirmar_senha, {
    message: 'As senhas não conferem.',
    path: ['confirmar_senha'],
  })
  .refine((d) => d.perfil !== 'professor' || d.turmas.length > 0, {
    message: 'Selecione ao menos uma turma em que você leciona.',
    path: ['turmas'],
  });

const login = z.object({ email, senha: z.string().min(1, 'Informe a senha.').max(200) });
const esqueci = z.object({ email });
const redefinir = z
  .object({ token: z.string().min(10), senha: senhaForte, confirmar_senha: z.string() })
  .refine((d) => d.senha === d.confirmar_senha, {
    message: 'As senhas não conferem.',
    path: ['confirmar_senha'],
  });
const trocarSenha = z
  .object({
    senha_atual: z.string().min(1, 'Informe a senha atual.'),
    senha: senhaForte,
    confirmar_senha: z.string(),
  })
  .refine((d) => d.senha === d.confirmar_senha, {
    message: 'As senhas não conferem.',
    path: ['confirmar_senha'],
  })
  .refine((d) => d.senha !== d.senha_atual, {
    message: 'A nova senha deve ser diferente da atual.',
    path: ['senha'],
  });

module.exports = { cadastro, login, esqueci, redefinir, trocarSenha };
