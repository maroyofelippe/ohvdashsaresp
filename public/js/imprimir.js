document
  .querySelectorAll('[data-imprimir]')
  .forEach((b) => b.addEventListener('click', () => window.print()));
if (new URLSearchParams(location.search).has('auto')) setTimeout(() => window.print(), 400);
