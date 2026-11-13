/**
 * Matriz de permissões — FONTE ÚNICA.
 * Cada permissão indica, por perfil, o alcance:
 *   'todos'   → sem restrição de escopo
 *   'serie'   → turmas da(s) mesma(s) série(s)/ano letivo das turmas vinculadas ao professor
 *   'proprias'→ somente turmas vinculadas ao professor (ou registros criados por ele)
 *   ausente   → negado
 * As checagens de escopo fino (qual turma/avaliação) acontecem nos serviços via `escopo`.
 */
const PERFIS = ['admin', 'coordenador', 'professor'];

const MATRIZ = {
  'usuarios:gerenciar': { admin: 'todos' },
  'estrutura:ver': { admin: 'todos', coordenador: 'todos', professor: 'todos' },
  'estrutura:gerenciar': { admin: 'todos' },
  'alunos:ver': { admin: 'todos', coordenador: 'todos', professor: 'serie' },
  'alunos:gerenciar': { admin: 'todos', professor: 'proprias' },
  'avaliacoes:ver': { admin: 'todos', coordenador: 'todos', professor: 'serie' },
  'avaliacoes:criar': { admin: 'todos', professor: 'serie' },
  'avaliacoes:editar': { admin: 'todos', professor: 'proprias' },
  'lancamentos:ver': { admin: 'todos', coordenador: 'todos', professor: 'serie' },
  'lancamentos:lancar': { admin: 'todos', professor: 'proprias' },
  'painel:ver': { admin: 'todos', coordenador: 'todos', professor: 'serie' },
  exportar: { admin: 'todos', coordenador: 'todos', professor: 'serie' },
  'config:gerenciar': { admin: 'todos' },
  'auditoria:ver': { admin: 'todos' },
};

function alcance(perfil, permissao) {
  const regra = MATRIZ[permissao];
  if (!regra) throw new Error(`Permissão desconhecida: ${permissao}`);
  return regra[perfil] || null;
}

function pode(usuario, permissao) {
  return !!(usuario && alcance(usuario.perfil, permissao));
}

/** Itens do menu lateral, exibidos conforme a matriz. */
const MENU = [
  { href: '/', rotulo: 'Início', icone: 'home', perm: null },
  { href: '/lancamentos', rotulo: 'Lançar respostas', icone: 'edit', perm: 'lancamentos:lancar' },
  {
    href: '/lancamentos',
    rotulo: 'Respostas',
    icone: 'edit',
    perm: 'lancamentos:ver',
    soSemPerm: 'lancamentos:lancar',
  },
  { href: '/painel', rotulo: 'Painel', icone: 'chart', perm: 'painel:ver' },
  { href: '/hall-da-fama', rotulo: 'Hall da Fama', icone: 'trophy', perm: 'painel:ver' },
  { href: '/avaliacoes', rotulo: 'Avaliações', icone: 'clipboard', perm: 'avaliacoes:ver' },
  { href: '/alunos', rotulo: 'Alunos', icone: 'users', perm: 'alunos:ver' },
  { href: '/turmas', rotulo: 'Turmas', icone: 'grid', perm: 'estrutura:ver' },
  { href: '/admin', rotulo: 'Administração', icone: 'shield', perm: 'usuarios:gerenciar' },
];

function menuPara(usuario) {
  return MENU.filter(
    (m) => (!m.perm || pode(usuario, m.perm)) && !(m.soSemPerm && pode(usuario, m.soSemPerm)),
  );
}

module.exports = { PERFIS, MATRIZ, alcance, pode, menuPara };
