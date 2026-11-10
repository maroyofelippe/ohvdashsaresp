// Aplica o tema salvo antes da primeira pintura (carregado de forma síncrona no <head>,
// por isso é um arquivo externo: a CSP não permite script inline).
(function () {
  var tema = null;
  try {
    tema = JSON.parse(localStorage.getItem('ohv.tema') || 'null');
  } catch (e) {
    /* sem storage */
  }
  if (tema !== 'claro' && tema !== 'escuro') {
    tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  document.documentElement.dataset.tema = tema;
})();
