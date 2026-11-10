/**
 * Leitura de planilhas (xlsx/csv) e parsers de importação.
 * Tudo em memória; nada é gravado em disco.
 */
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const path = require('path');
const AppError = require('../utils/AppError');
const { normalizarCabecalho, normalizarNome } = require('../utils/normalizar');

const MAX_LINHAS = 5000;

function valorCelula(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return valorCelula(v.result);
    if (v.error) return '';
  }
  return String(v).trim();
}

function folhaParaLinhas(ws) {
  const linhas = [];
  let cabecalhos = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      valores[col - 1] = valorCelula(cell.value);
    });
    if (!cabecalhos) {
      cabecalhos = valores.map((v) => String(v ?? '').trim());
      return;
    }
    if (valores.every((v) => !v)) return;
    const o = {};
    cabecalhos.forEach((h, i) => {
      if (h) o[h] = valores[i] ?? '';
    });
    linhas.push(o);
  });
  return { cabecalhos: (cabecalhos || []).filter(Boolean), linhas };
}

/**
 * Lê o arquivo enviado.
 * @returns { folhas: { [nome]: { cabecalhos, linhas } }, principal: { cabecalhos, linhas } }
 */
async function lerPlanilha(buffer, nomeArquivo) {
  const ext = path.extname(nomeArquivo || '').toLowerCase();
  if (ext === '.csv') {
    let texto = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (texto.includes('�')) texto = buffer.toString('latin1');
    const primeira = texto.split(/\r?\n/, 1)[0] || '';
    const delimiter = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
    let registros;
    try {
      registros = parse(texto, {
        delimiter,
        columns: (h) => h.map((x) => String(x).trim()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      });
    } catch (e) {
      throw AppError.badRequest(`CSV inválido: ${e.message}`);
    }
    if (registros.length > MAX_LINHAS) throw AppError.badRequest(`Arquivo com mais de ${MAX_LINHAS} linhas.`);
    const principal = { cabecalhos: registros.length ? Object.keys(registros[0]) : [], linhas: registros };
    return { folhas: { CSV: principal }, principal };
  }
  if (ext !== '.xlsx') throw AppError.badRequest('Formato não suportado. Envie .xlsx ou .csv.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw AppError.badRequest('Não foi possível ler a planilha. Verifique se é um arquivo .xlsx válido.');
  }
  const folhas = {};
  let principal = null;
  wb.eachSheet((ws) => {
    const f = folhaParaLinhas(ws);
    if (f.linhas.length > MAX_LINHAS)
      throw AppError.badRequest(`Planilha "${ws.name}" com mais de ${MAX_LINHAS} linhas.`);
    folhas[ws.name] = f;
    if (!principal) principal = f;
  });
  if (!principal) throw AppError.badRequest('A planilha está vazia.');
  return { folhas, principal };
}

/** Indexa as colunas de uma linha pelo cabeçalho normalizado. */
function normalizarLinha(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    const nk = normalizarCabecalho(k);
    if (!(nk in r) || r[nk] === '') r[nk] = v;
  }
  return r;
}

/**
 * Parser da importação de alunos (colunas Nº, Nome, RA opcional).
 * @returns [{ linha, numero, nome, ra, erros: [] }]
 */
function parseAlunos(linhas) {
  const vistosNum = new Set();
  const vistosRa = new Set();
  return linhas.map((bruta, i) => {
    const o = normalizarLinha(bruta);
    const erros = [];
    const numero = parseInt(String(o.NUM ?? o.NUMERO ?? o.CHAMADA ?? '').replace(/\D/g, ''), 10);
    const nome = String(o.NOME ?? o.ALUNO ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const ra = String(o.RA ?? '').trim() || null;
    if (!Number.isInteger(numero) || numero < 1 || numero > 999) erros.push('Nº de chamada inválido');
    if (nome.length < 3) erros.push('Nome ausente ou muito curto');
    if (nome.length > 150) erros.push('Nome muito longo');
    if (ra && !/^[0-9A-Za-z-]{4,20}$/.test(ra)) erros.push('RA inválido');
    if (Number.isInteger(numero)) {
      if (vistosNum.has(numero)) erros.push('Nº repetido no arquivo');
      vistosNum.add(numero);
    }
    if (ra) {
      if (vistosRa.has(ra)) erros.push('RA repetido no arquivo');
      vistosRa.add(ra);
    }
    return { linha: i + 2, numero: Number.isInteger(numero) ? numero : null, nome, ra, erros };
  });
}

/**
 * Mapeia as colunas da planilha de respostas (layout da PoC) para as questões.
 * @param questoes definições folha com { id, codigo, tipo, aspectos:[{id,codigo}] }
 * @returns { mapa: { [colunaNormalizada]: { questao, aspecto|null } }, ignoradas: [] }
 */
function mapearColunasRespostas(cabecalhos, questoes) {
  const porCodigo = new Map(questoes.map((q) => [normalizarCabecalho(q.codigo), q]));
  const mapa = {};
  const ignoradas = [];
  const fixas = new Set(['NUM', 'NOME', 'ALUNO', 'TURMA', 'ANO', 'SERIE', 'RA']);
  for (const h of cabecalhos) {
    const n = normalizarCabecalho(h);
    if (fixas.has(n)) continue;
    let alvo = null;
    if (porCodigo.has(n)) {
      const q = porCodigo.get(n);
      alvo = { questao: q, aspecto: null };
    } else {
      const ms = n.match(/^(.*)S$/);
      const ma = n.match(/^(.*?)(A\d+)$/);
      if (ma && porCodigo.has(ma[1]) && porCodigo.get(ma[1]).tipo === 'producao_texto') {
        const q = porCodigo.get(ma[1]);
        const asp = (q.aspectos || []).find((a) => a.codigo.toUpperCase() === ma[2]);
        if (asp) alvo = { questao: q, aspecto: asp };
      } else if (ms && porCodigo.has(ms[1]) && porCodigo.get(ms[1]).tipo === 'producao_texto') {
        alvo = { questao: porCodigo.get(ms[1]), aspecto: null };
      }
    }
    if (alvo) mapa[n] = { ...alvo, original: h };
    else ignoradas.push(h);
  }
  return { mapa, ignoradas };
}

/** Casa um aluno por nome normalizado (prioridade) ou Nº de chamada. */
function casarAluno(alunos, { nome, numero }) {
  const nn = normalizarNome(nome);
  if (nn) {
    const porNome = alunos.find((a) => normalizarNome(a.nome) === nn);
    if (porNome) return { aluno: porNome, por: 'nome' };
  }
  if (numero) {
    const porNum = alunos.find((a) => a.numero_chamada === Number(numero));
    if (porNum && (!nn || similar(normalizarNome(porNum.nome), nn))) return { aluno: porNum, por: 'numero' };
    if (porNum && !nn) return { aluno: porNum, por: 'numero' };
  }
  return { aluno: null, por: null };
}

/** Similaridade simples: primeiro nome igual ou um contém o outro. */
function similar(a, b) {
  if (!a || !b) return false;
  return a.split(' ')[0] === b.split(' ')[0] || a.includes(b) || b.includes(a);
}

module.exports = {
  lerPlanilha,
  normalizarLinha,
  parseAlunos,
  mapearColunasRespostas,
  casarAluno,
  valorCelula,
};
