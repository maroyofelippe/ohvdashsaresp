// Utilidades de interface: toasts, modal de confirmação, drawer, formatação, escape.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export const pct = (f) =>
  f === null || f === undefined || !Number.isFinite(f) ? '–' : `${Math.round(f * 100)}%`;
export const num = (v, casas = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? '–'
    : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
export function data(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : iso;
}
export const classePct = (f) =>
  f === null || f === undefined ? '' : f >= 0.7 ? 'ok' : f >= 0.5 ? 'aviso' : 'erro';

export function toast(msg, tipo = '') {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3500);
}

/** Toast que sobrevive a um reload. */
export function toastDepois(msg, tipo = 'ok') {
  try {
    sessionStorage.setItem('ohv.toast', JSON.stringify({ msg, tipo }));
  } catch {
    /* sem storage */
  }
}
export function toastPendente() {
  try {
    const t = JSON.parse(sessionStorage.getItem('ohv.toast') || 'null');
    sessionStorage.removeItem('ohv.toast');
    if (t) toast(t.msg, t.tipo);
  } catch {
    /* sem storage */
  }
}

let focoAnterior = null;
function prenderFoco(container, e) {
  if (e.key !== 'Tab') return;
  const foc = $$(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    container,
  ).filter((x) => !x.disabled && x.offsetParent !== null);
  if (!foc.length) return;
  const [pri, ult] = [foc[0], foc[foc.length - 1]];
  if (e.shiftKey && document.activeElement === pri) {
    e.preventDefault();
    ult.focus();
  } else if (!e.shiftKey && document.activeElement === ult) {
    e.preventDefault();
    pri.focus();
  }
}

/** Modal genérico. Retorna Promise com o valor do botão clicado. */
export function modal({
  titulo,
  html,
  botoes = [{ texto: 'OK', valor: true, classe: 'btn-primario' }],
  largo = false,
  aoAbrir,
}) {
  return new Promise((resolve) => {
    const m = $('#modal');
    const f = $('#modalFundo');
    focoAnterior = document.activeElement;
    m.className = `modal${largo ? ' largo' : ''}`;
    m.innerHTML = `<h2 id="modalTitulo">${esc(titulo)}</h2><div class="modal-corpo">${html}</div><div class="acoes">${botoes
      .map(
        (b, i) =>
          `<button type="button" class="btn ${b.classe || ''}" data-i="${i}">${esc(b.texto)}</button>`,
      )
      .join('')}</div>`;
    m.hidden = false;
    f.hidden = false;
    const fechar = (valor) => {
      m.hidden = true;
      f.hidden = true;
      m.removeEventListener('keydown', tecla);
      focoAnterior?.focus?.();
      resolve(valor);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') fechar(undefined);
      prenderFoco(m, e);
    };
    m.addEventListener('keydown', tecla);
    $$('[data-i]', m).forEach((b) =>
      b.addEventListener('click', () => {
        const bt = botoes[Number(b.dataset.i)];
        if (bt.antes && bt.antes(m) === false) return;
        fechar(typeof bt.valor === 'function' ? bt.valor(m) : bt.valor);
      }),
    );
    f.onclick = () => fechar(undefined);
    if (aoAbrir) aoAbrir(m);
    ($('[autofocus]', m) || $('[data-i]:last-child', m))?.focus();
  });
}

export function confirmar(titulo, mensagem, { texto = 'Confirmar', perigo = false } = {}) {
  return modal({
    titulo,
    html: `<p>${mensagem}</p>`,
    botoes: [
      { texto: 'Cancelar', valor: false },
      { texto, valor: true, classe: perigo ? 'btn-perigo cheio' : 'btn-primario' },
    ],
  });
}

/** Drawer lateral com formulário. campos: [{ nome, rotulo, tipo, opcoes, valor, ajuda, obrigatorio }] */
export function drawer({ titulo, campos, valores = {}, aoSalvar, textoSalvar = 'Salvar' }) {
  const d = $('#drawer');
  const f = $('#drawerFundo');
  const corpo = $('#drawerCorpo');
  const form = $('#drawerForm');
  focoAnterior = document.activeElement;
  $('#drawerTitulo').textContent = titulo;
  $('#drawerSalvar').textContent = textoSalvar;
  corpo.innerHTML = campos.map((c) => campoHtml(c, valores[c.nome])).join('');
  d.hidden = false;
  f.hidden = false;
  requestAnimationFrame(() => d.classList.add('aberto'));
  const fechar = () => {
    d.classList.remove('aberto');
    setTimeout(() => {
      d.hidden = true;
      f.hidden = true;
    }, 180);
    document.removeEventListener('keydown', tecla);
    focoAnterior?.focus?.();
  };
  const tecla = (e) => {
    if (e.key === 'Escape') fechar();
    prenderFoco(d, e);
  };
  document.addEventListener('keydown', tecla);
  $$('[data-fechar-drawer]', d).forEach((b) => (b.onclick = fechar));
  f.onclick = fechar;
  form.onsubmit = async (e) => {
    e.preventDefault();
    $$('.erro', corpo).forEach((x) => x.remove());
    $$('[aria-invalid]', corpo).forEach((x) => x.removeAttribute('aria-invalid'));
    const dados = lerForm(form, campos);
    const btn = $('#drawerSalvar');
    btn.disabled = true;
    try {
      await aoSalvar(dados);
      fechar();
    } catch (err) {
      mostrarErros(corpo, err);
    } finally {
      btn.disabled = false;
    }
  };
  setTimeout(() => $('input:not([type=hidden]), select, textarea', corpo)?.focus(), 200);
  return { fechar };
}

function campoHtml(c, valor) {
  const v = valor ?? c.valor ?? '';
  const id = `dc_${c.nome}`;
  const req = c.obrigatorio ? 'required' : '';
  let input;
  if (c.tipo === 'select') {
    input = `<select id="${id}" name="${c.nome}" ${req}>${(c.opcoes || []).map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(v) ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('')}</select>`;
  } else if (c.tipo === 'checkbox') {
    return `<div class="campo"><label class="check"><input type="checkbox" id="${id}" name="${c.nome}" ${v ? 'checked' : ''}> ${esc(c.rotulo)}</label></div>`;
  } else if (c.tipo === 'checks') {
    const sel = (Array.isArray(v) ? v : []).map(String);
    return `<fieldset class="campo" style="border:0;padding:0"><legend class="rotulo">${esc(c.rotulo)}</legend><div class="checks" data-checks="${c.nome}">${(
      c.opcoes || []
    )
      .map(
        (o) =>
          `<label class="check"><input type="checkbox" name="${c.nome}" value="${esc(o.valor)}" ${sel.includes(String(o.valor)) ? 'checked' : ''}> ${esc(o.rotulo)}</label>`,
      )
      .join('')}</div>${c.ajuda ? `<span class="ajuda">${esc(c.ajuda)}</span>` : ''}</fieldset>`;
  } else if (c.tipo === 'textarea') {
    input = `<textarea id="${id}" name="${c.nome}" ${req}>${esc(v)}</textarea>`;
  } else if (c.tipo === 'info') {
    return `<div class="alerta">${c.html}</div>`;
  } else {
    input = `<input id="${id}" name="${c.nome}" type="${c.tipo || 'text'}" value="${esc(v)}" ${req} ${c.attrs || ''}>`;
  }
  return `<div class="campo"><label for="${id}">${esc(c.rotulo)}</label>${input}${c.ajuda ? `<span class="ajuda">${esc(c.ajuda)}</span>` : ''}</div>`;
}

function lerForm(form, campos) {
  const o = {};
  for (const c of campos) {
    if (c.tipo === 'info') continue;
    if (c.tipo === 'checkbox') o[c.nome] = !!form.elements[c.nome]?.checked;
    else if (c.tipo === 'checks') o[c.nome] = $$(`input[name="${c.nome}"]:checked`, form).map((x) => x.value);
    else o[c.nome] = form.elements[c.nome]?.value ?? '';
  }
  return o;
}

export function mostrarErros(container, err) {
  const det = err?.detalhes || {};
  let algum = false;
  for (const [k, msg] of Object.entries(det)) {
    const el = container.querySelector(`[name="${k}"]`);
    if (!el || typeof msg !== 'string') continue;
    algum = true;
    el.setAttribute('aria-invalid', 'true');
    const s = document.createElement('span');
    s.className = 'erro';
    s.textContent = msg;
    (el.closest('.campo') || el.parentElement).appendChild(s);
  }
  toast(err?.message || 'Não foi possível salvar.', 'erro');
  return algum;
}

/** Ordenação de tabelas por clique no cabeçalho (th[data-ordenar]). */
export function tabelasOrdenaveis(raiz = document) {
  $$('table.tabela', raiz).forEach((t) => {
    $$('th[data-ordenar]', t).forEach((th, idx) => {
      th.tabIndex = 0;
      th.setAttribute('aria-sort', 'none');
      const ordenar = () => {
        const col = [...th.parentElement.children].indexOf(th);
        const asc = th.getAttribute('aria-sort') !== 'ascending';
        $$('th', t).forEach((x) => x.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        const corpo = t.tBodies[0];
        const linhas = [...corpo.rows];
        const val = (r) => {
          const c = r.cells[col];
          const v = c?.dataset.valor ?? c?.textContent.trim() ?? '';
          const n = Number(String(v).replace('%', '').replace(',', '.'));
          return Number.isFinite(n) && v !== '' ? n : v.toLocaleLowerCase('pt-BR');
        };
        linhas.sort((a, b) => {
          const x = val(a);
          const y = val(b);
          return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1);
        });
        linhas.forEach((r) => corpo.appendChild(r));
      };
      th.addEventListener('click', ordenar);
      th.addEventListener(
        'keydown',
        (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ordenar()),
      );
      void idx;
    });
  });
}

export function dadosJson(id) {
  const el = document.getElementById(id);
  return el ? JSON.parse(el.textContent) : null;
}

export function lembrar(chave, valor) {
  try {
    if (valor === undefined) return JSON.parse(localStorage.getItem(`ohv.${chave}`) || 'null');
    localStorage.setItem(`ohv.${chave}`, JSON.stringify(valor));
  } catch {
    return null;
  }
  return valor;
}
