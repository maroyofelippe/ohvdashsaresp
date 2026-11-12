// Botão "olho" dos campos de senha: um clique revela, outro oculta.
document.querySelectorAll('[data-alternar-senha]').forEach((botao) => {
  const campo = document.getElementById(botao.dataset.alternarSenha);
  if (!campo) return;
  botao.addEventListener('click', () => {
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.setAttribute('aria-pressed', String(mostrar));
    const rotulo = mostrar ? 'Ocultar senha' : 'Mostrar senha';
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
    botao.querySelector('.ico-mostrar').hidden = mostrar;
    botao.querySelector('.ico-ocultar').hidden = !mostrar;
    campo.focus();
  });
});
