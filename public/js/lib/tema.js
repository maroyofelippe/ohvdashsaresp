// Botão de alternância claro/escuro (preferência gravada neste navegador).
import { $$, lembrar } from './ui.js';

const raiz = document.documentElement;

function rotular() {
  const escuro = raiz.dataset.tema === 'escuro';
  $$('[data-tema-alternar]').forEach((b) => {
    b.setAttribute('aria-label', escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
    b.title = escuro ? 'Tema claro' : 'Tema escuro';
  });
}

$$('[data-tema-alternar]').forEach((b) =>
  b.addEventListener('click', () => {
    const novo = raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro';
    raiz.dataset.tema = novo;
    lembrar('tema', novo);
    rotular();
    document.dispatchEvent(new CustomEvent('ohv:tema', { detail: novo }));
  }),
);
rotular();
