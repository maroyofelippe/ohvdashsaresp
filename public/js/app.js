// Comportamentos globais do layout principal.
import { $, $$, toast, toastPendente, tabelasOrdenaveis, dadosJson, lembrar, confirmar } from './lib/ui.js';
import { api, baixar } from './lib/api.js';
import './lib/tema.js';
import './lib/senha.js';
import { iniciarSessao } from './lib/sessao.js';

// Menu recolhível (preferência por navegador)
if (lembrar('menuRecolhido')) document.body.classList.add('menu-recolhido');
$('#btnMenu')?.addEventListener('click', () => {
  document.body.classList.toggle('menu-recolhido');
  lembrar('menuRecolhido', document.body.classList.contains('menu-recolhido'));
});

iniciarSessao();
toastPendente();
const flash = dadosJson('flash');
if (flash) toast(flash.msg, flash.tipo);
tabelasOrdenaveis();

// Botões de impressão
$$('[data-imprimir]').forEach((b) => b.addEventListener('click', () => window.print()));

// Ações destrutivas genéricas: <button data-excluir="/api/..." data-confirmar="Texto">
$$('[data-excluir]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (
      !(await confirmar('Excluir', b.dataset.confirmar || 'Tem certeza? Esta ação não pode ser desfeita.', {
        texto: 'Excluir',
        perigo: true,
      }))
    )
      return;
    try {
      await api(b.dataset.excluir, { method: 'DELETE' });
      sessionStorage.setItem('ohv.toast', JSON.stringify({ msg: 'Excluído.', tipo: 'ok' }));
      location.reload();
    } catch (e) {
      toast(e.message, 'erro');
    }
  }),
);

// Downloads autenticados: <button data-baixar="/api/...">
$$('[data-baixar]').forEach((b) =>
  b.addEventListener('click', () => baixar(b.dataset.baixar).catch((e) => toast(e.message, 'erro'))),
);
