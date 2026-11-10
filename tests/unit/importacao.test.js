const ExcelJS = require('exceljs');
const imp = require('../../src/services/importacao.service');
const { normalizarCabecalho, normalizarNome, celulaSegura } = require('../../src/utils/normalizar');

test('normaliza cabeçalhos do layout da PoC', () => {
  expect(normalizarCabecalho('Nº')).toBe('NUM');
  expect(normalizarCabecalho('LP1')).toBe('LP01');
  expect(normalizarCabecalho('lp 09a')).toBe('LP09a');
  expect(normalizarCabecalho('LP17S')).toBe('LP17S');
  expect(normalizarCabecalho('LP17 Situação')).toBe('LP17S');
  expect(normalizarCabecalho('LP17A1')).toBe('LP17A1');
  expect(normalizarCabecalho('MT21')).toBe('MT21');
  expect(normalizarCabecalho('Nome')).toBe('NOME');
});

test('normaliza nomes (acento/caixa) e protege contra fórmulas', () => {
  expect(normalizarNome('  Ágatha  de Oliveira ')).toBe('AGATHA DE OLIVEIRA');
  expect(celulaSegura('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
  expect(celulaSegura('-1')).toBe("'-1");
  expect(celulaSegura('Maria')).toBe('Maria');
  expect(celulaSegura(5)).toBe(5);
});

test('parseAlunos valida linha a linha', () => {
  const r = imp.parseAlunos([
    { Nº: '1', Nome: 'Ana Lima', RA: '' },
    { Nº: '1', Nome: 'Bia', RA: 'x' },
    { Nº: 'a', Nome: '' },
  ]);
  expect(r[0].erros).toEqual([]);
  expect(r[0].nome).toBe('ANA LIMA');
  expect(r[1].erros).toEqual(expect.arrayContaining(['Nº repetido no arquivo', 'RA inválido']));
  expect(r[2].erros).toEqual(
    expect.arrayContaining(['Nº de chamada inválido', 'Nome ausente ou muito curto']),
  );
});

test('mapeia colunas de respostas e casa alunos', () => {
  const qs = [
    { id: 1, codigo: 'LP01', tipo: 'objetiva', aspectos: [] },
    { id: 2, codigo: 'LP09a', tipo: 'objetiva', aspectos: [] },
    { id: 3, codigo: 'LP17', tipo: 'producao_texto', aspectos: [{ id: 30, codigo: 'A1' }] },
  ];
  const { mapa, ignoradas } = imp.mapearColunasRespostas(
    ['Nº', 'Nome', 'Turma', 'LP01', 'LP09a', 'LP17S', 'LP17A1', 'LP17A9', 'XYZ'],
    qs,
  );
  expect(mapa.LP01.questao.id).toBe(1);
  expect(mapa.LP09a.questao.id).toBe(2);
  expect(mapa.LP17S.aspecto).toBeNull();
  expect(mapa.LP17A1.aspecto.id).toBe(30);
  expect(ignoradas).toEqual(['LP17A9', 'XYZ']);
  const alunos = [
    { id: 7, nome: 'ÁGATHA DE OLIVEIRA', numero_chamada: 1 },
    { id: 8, nome: 'BRUNO', numero_chamada: 2 },
  ];
  expect(imp.casarAluno(alunos, { nome: 'agatha de oliveira', numero: 9 }).aluno.id).toBe(7);
  expect(imp.casarAluno(alunos, { nome: '', numero: 2 }).aluno.id).toBe(8);
  expect(imp.casarAluno(alunos, { nome: 'Carlos', numero: 2 }).aluno).toBeNull();
});

test('lê csv (; e ,) e xlsx', async () => {
  const csv = Buffer.from('\uFEFFNº;Nome;RA\n1;Ana;123456\n', 'utf8');
  const r = await imp.lerPlanilha(csv, 'a.csv');
  expect(r.principal.linhas[0]).toEqual({ Nº: '1', Nome: 'Ana', RA: '123456' });
  const csv2 = await imp.lerPlanilha(Buffer.from('Nome,LP01\nAna,B\n'), 'b.csv');
  expect(csv2.principal.linhas[0].LP01).toBe('B');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Alunos_Respostas');
  ws.addRow(['Nº', 'Nome', 'LP01']);
  ws.addRow([1, { richText: [{ text: 'Ana ' }, { text: 'Lima' }] }, 'C']);
  const x = await imp.lerPlanilha(Buffer.from(await wb.xlsx.writeBuffer()), 'c.xlsx');
  expect(x.principal.linhas[0]).toEqual({ Nº: '1', Nome: 'Ana Lima', LP01: 'C' });
  await expect(imp.lerPlanilha(Buffer.from('x'), 'd.pdf')).rejects.toThrow(/não suportado/);
  await expect(imp.lerPlanilha(Buffer.from('lixo'), 'e.xlsx')).rejects.toThrow(/Não foi possível/);
});
