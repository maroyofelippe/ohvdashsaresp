const { emailInstitucionalValido } = require('../../src/validators/comuns');
const v = require('../../src/validators/auth.validators');

describe('domínio institucional', () => {
  test.each([
    ['maria.silva@professor.educacao.sp.gov.br', true],
    ['MARIA@PROFESSOR.EDUCACAO.SP.GOV.BR', true],
    ['  joao@professor.educacao.sp.gov.br ', true],
    ['maria@gmail.com', false],
    ['maria@educacao.sp.gov.br', false],
    ['maria@professor.educacao.sp.gov.br.evil.com', false],
    ['maria@xprofessor.educacao.sp.gov.br', false],
    ['maria@professorXeducacao.sp.gov.br', false],
    ['@professor.educacao.sp.gov.br', false],
    ['', false],
  ])('%s → %s', (email, ok) =>
    expect(emailInstitucionalValido(email, 'professor.educacao.sp.gov.br')).toBe(ok),
  );

  test('cadastro recusa domínio externo com mensagem clara', () => {
    const r = v.cadastro.safeParse({
      nome: 'Maria da Silva',
      email: 'maria@gmail.com',
      senha: 'abc12345',
      confirmar_senha: 'abc12345',
      perfil: 'coordenador',
      turmas: [],
    });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/@professor\.educacao\.sp\.gov\.br/);
  });
  test('senha exige 8 caracteres com letra e número; professor exige turma', () => {
    const base = {
      nome: 'Maria da Silva',
      email: 'maria@professor.educacao.sp.gov.br',
      confirmar_senha: 'x',
      perfil: 'professor',
      turmas: [],
    };
    expect(v.cadastro.safeParse({ ...base, senha: 'abcdefgh', confirmar_senha: 'abcdefgh' }).success).toBe(
      false,
    );
    expect(v.cadastro.safeParse({ ...base, senha: 'abc12345', confirmar_senha: 'abc12345' }).success).toBe(
      false,
    );
    expect(
      v.cadastro.safeParse({ ...base, senha: 'abc12345', confirmar_senha: 'abc12345', turmas: ['3'] })
        .success,
    ).toBe(true);
  });
});
