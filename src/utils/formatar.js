const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function numero(v, casas = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  return (casas === 2 ? nf2 : nf).format(Number(v));
}
function percentual(frac) {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return '–';
  return `${Math.round(frac * 100)}%`;
}
/** 'aaaa-mm-dd' ou Date → 'dd/mm/aaaa' */
function data(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function dataHora(v) {
  if (!v) return '';
  const dt = new Date(typeof v === 'string' && !v.includes('T') ? v.replace(' ', 'T') + '-03:00' : v);
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
/** 'dd/mm/aaaa' → 'aaaa-mm-dd' (ou null) */
function dataISO(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const PERFIS = { admin: 'Admin', coordenador: 'Coordenador', professor: 'Professor' };
const STATUS_USUARIO = {
  pendente_email: 'Aguardando e-mail',
  pendente: 'Aguardando aprovação',
  ativo: 'Ativo',
  inativo: 'Inativo',
};

module.exports = { numero, percentual, data, dataHora, dataISO, PERFIS, STATUS_USUARIO };
