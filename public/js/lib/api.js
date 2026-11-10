// Cliente HTTP: CSRF em toda escrita + renovação transparente do access token.
const meta = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
let renovando = null;

async function renovar() {
  if (!renovando) {
    renovando = fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'x-csrf-token': meta(), Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then((r) => r.ok)
      .finally(() => setTimeout(() => (renovando = null), 0));
  }
  return renovando;
}

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || `Erro ${status}`);
    this.status = status;
    this.detalhes = corpo?.detalhes || null;
  }
}

export async function api(url, { method = 'GET', body, form, tentativa = 0, bruto = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['x-csrf-token'] = meta();
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  if (r.status === 401 && tentativa === 0) {
    const corpo = await r.json().catch(() => ({}));
    if (corpo?.detalhes?.codigo === 'token_expirado' && (await renovar()))
      return api(url, { method, body, form, tentativa: 1, bruto });
    location.href = `/login?msg=expirou&next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ErroApi(401, corpo);
  }
  if (bruto) {
    if (!r.ok) throw new ErroApi(r.status, await r.json().catch(() => ({})));
    return r;
  }
  if (r.status === 204) return null;
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(r.status, corpo);
  return corpo;
}

/** Baixa um arquivo (xlsx/csv) respeitando autenticação e renovação. */
export async function baixar(url) {
  const r = await api(url, { bruto: true });
  const blob = await r.blob();
  const nome = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'arquivo';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
