// Inatividade da sessão (executa só nas páginas autenticadas).
//  - O uso (mouse, teclado, toque, rolagem) em QUALQUER aba conta como atividade (localStorage).
//  - A cada 5 min: houve uso → avisa o servidor (mantém a sessão e o "online"); sem uso → recarrega
//    para o início (o recarregamento por ociosidade não conta como atividade).
//  - Sem uso por 30 min (configurável) → encerra a sessão e vai para o login.
// O servidor também impõe o limite: sem sinais de uso, a sessão deixa de valer mesmo com a aba parada.
import { api } from './api.js';

const TICK_MS = 5 * 60 * 1000;
const LIMITE_MS =
  (Number(document.querySelector('meta[name="ohv-inatividade-min"]')?.content) || 30) * 60 * 1000;
const CHAVE = 'ohv.atividade';
const FLAG_OCIOSO = 'ohv.ocioso';

const guardar = {
  ler: () => {
    try {
      return Number(localStorage.getItem(CHAVE)) || 0;
    } catch {
      return 0;
    }
  },
  gravar: (t) => {
    try {
      localStorage.setItem(CHAVE, String(t));
    } catch {
      /* armazenamento indisponível: vale só a memória desta aba */
    }
  },
};

let ultima = Date.now();
let gravadoEm = 0;
let inicioJanela = Date.now();

function marcar() {
  const agora = Date.now();
  ultima = agora;
  if (agora - gravadoEm > 5000) {
    gravadoEm = agora;
    guardar.gravar(agora);
  }
}
const referencia = () => Math.max(ultima, guardar.ler());

async function avisarAtividade() {
  try {
    await api('/api/sessao/atividade', { method: 'POST' });
  } catch {
    /* sessão inválida: a api() já redireciona para o login */
  }
}

async function encerrar() {
  try {
    await fetch('/auth/refresh/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
      credentials: 'same-origin',
      redirect: 'manual',
    });
  } finally {
    location.href = '/login?msg=inativo';
  }
}

function verificar() {
  const agora = Date.now();
  const ref = referencia();
  if (agora - ref >= LIMITE_MS) return encerrar();
  if (ref > inicioJanela) {
    inicioJanela = agora;
    return avisarAtividade();
  }
  // Janela inteira sem uso: volta ao início (só uma vez por tick)
  inicioJanela = agora;
  try {
    sessionStorage.setItem(FLAG_OCIOSO, '1');
  } catch {
    /* sem sessionStorage: o recarregamento contará como atividade */
  }
  if (location.pathname === '/' && !location.search) location.reload();
  else location.assign('/');
}

export function iniciarSessao() {
  let recargaOciosa = false;
  try {
    recargaOciosa = sessionStorage.getItem(FLAG_OCIOSO) === '1';
    sessionStorage.removeItem(FLAG_OCIOSO);
  } catch {
    /* ignora */
  }
  if (recargaOciosa) {
    // Carga causada pela própria ociosidade: não é uso — mantém o último momento de atividade real
    ultima = guardar.ler() || ultima;
  } else {
    marcar();
    avisarAtividade();
  }
  inicioJanela = Date.now();
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'])
    window.addEventListener(ev, marcar, { passive: true, capture: true });
  setInterval(verificar, TICK_MS);
  // Aba que "acordou" (notebook suspenso, aba em segundo plano): confere o limite na hora
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - referencia() >= LIMITE_MS) encerrar();
  });
}
