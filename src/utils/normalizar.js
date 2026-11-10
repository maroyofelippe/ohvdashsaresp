/** Remove acentos, espaços extras e caixa — usado para casar nomes de alunos. */
function normalizarNome(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Normaliza cabeçalho de coluna de importação: "LP 1" → "LP01", "LP17 Situação" → "LP17S", "LP17 A1" → "LP17A1". */
function normalizarCabecalho(h) {
  let s = normalizarNome(h).replace(/\s+/g, '');
  if (/^N(O|UM|UMERO|º)?$/.test(s) || s === 'NO' || s === 'N') return 'NUM';
  let m = s.match(/^([A-Z]{2,4}?)0*(\d+)([A-Z]?)(SITUACAO|SIT|S)$/);
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].toLowerCase()}S`;
  m = s.match(/^([A-Z]{2,4}?)0*(\d+)([A-Z]?)A(\d+)$/);
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].toLowerCase()}A${m[4]}`;
  m = s.match(/^([A-Z]{2,4}?)0*(\d+)([A-Z]?)$/);
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].toLowerCase()}`;
  return s;
}

/** Escapa células para exportação, evitando CSV/Formula injection. */
function celulaSegura(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

module.exports = { normalizarNome, normalizarCabecalho, celulaSegura };
