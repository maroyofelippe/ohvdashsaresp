import './lib/tema.js';
// Tela de cadastro: mostra as turmas apenas para o perfil Professor.
const form = document.getElementById('formCadastro');
if (form) {
  const bloco = document.getElementById('blocoTurmas');
  const atualizar = () => {
    const prof = form.querySelector('input[name="perfil"]:checked')?.value !== 'coordenador';
    bloco.hidden = !prof;
  };
  form.querySelectorAll('input[name="perfil"]').forEach((r) => r.addEventListener('change', atualizar));
  atualizar();
}
