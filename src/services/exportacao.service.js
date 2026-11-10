const ExcelJS = require('exceljs');
const { celulaSegura } = require('../utils/normalizar');

/**
 * @param folhas [{ nome, colunas: [{ chave, titulo, largura? }], linhas: [obj] }]
 */
async function xlsx(folhas, { titulo } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OHVDashSaresp';
  wb.created = new Date();
  for (const f of folhas) {
    const ws = wb.addWorksheet(
      String(f.nome)
        .slice(0, 31)
        .replace(/[\\/?*[\]:]/g, ' '),
    );
    let inicio = 1;
    if (titulo) {
      ws.addRow([titulo]).font = { bold: true, size: 12 };
      inicio = 2;
    }
    ws.addRow(f.colunas.map((c) => c.titulo));
    const cab = ws.getRow(inicio);
    cab.font = { bold: true };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F4' } };
    for (const l of f.linhas) ws.addRow(f.colunas.map((c) => celulaSegura(l[c.chave] ?? '')));
    f.colunas.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.largura || Math.min(50, Math.max(8, String(c.titulo).length + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: inicio }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV com ";" (padrão do Excel em pt-BR), BOM UTF-8 e proteção contra fórmulas. */
function csv(colunas, linhas) {
  const esc = (v) => {
    let s = celulaSegura(v ?? '');
    if (typeof s === 'number') s = String(s).replace('.', ',');
    s = String(s);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [
    colunas.map((c) => esc(c.titulo)).join(';'),
    ...linhas.map((l) => colunas.map((c) => esc(l[c.chave])).join(';')),
  ];
  return Buffer.from('\uFEFF' + out.join('\r\n'), 'utf8');
}

function enviar(res, { buffer, nome, formato }) {
  const tipos = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8',
  };
  res.setHeader('Content-Type', tipos[formato]);
  res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\w.-]+/g, '_')}.${formato}"`);
  res.send(buffer);
}

module.exports = { xlsx, csv, enviar };
