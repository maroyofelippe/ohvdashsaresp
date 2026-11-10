// Gera os modelos de planilha (sem dados pessoais) em /templates.
const path = require('path');
const fs = require('fs');
const exportacao = require('../src/services/exportacao.service');
const { estruturaCanonica } = require('../seed-data/estrutura-simulado-2ano');

(async () => {
  const dir = path.join(__dirname, '..', 'templates');
  fs.mkdirSync(dir, { recursive: true });
  const col = (t, l = 8) => ({ chave: t, titulo: t, largura: l });
  await fs.promises.writeFile(
    path.join(dir, 'modelo_alunos.xlsx'),
    await exportacao.xlsx([{ nome: 'Alunos', colunas: [col('Nº', 6), col('Nome', 44), col('RA', 16)], linhas: [{ 'Nº': 1, Nome: 'NOME COMPLETO DO ALUNO', RA: '' }] }]),
  );
  const est = estruturaCanonica();
  const cols = ['Nº', 'Nome', 'Turma', 'Ano'];
  for (const q of est.questoes) {
    if (q.tipo === 'texto') cols.push(`${q.code}S`, ...q.aspectos.map((a) => `${q.code}${a.id}`));
    else cols.push(q.code);
  }
  await fs.promises.writeFile(
    path.join(dir, 'modelo_alunos_respostas.xlsx'),
    await exportacao.xlsx([{ nome: 'Alunos_Respostas', colunas: cols.map((c) => col(c, c === 'Nome' ? 40 : 7)), linhas: [{ 'Nº': 1, Nome: 'NOME DO ALUNO', Turma: 'A', Ano: '2º ANO' }] }]),
  );
  const gab = est.questoes.map((q) => ({ Questao: q.code, Disciplina: q.disc, Tipo: { obj: 'Objetiva', esc: 'Dissertativa', texto: 'Producao de texto' }[q.tipo], Gabarito: q.tipo === 'obj' ? q.gab : '(escalar)', Peso: q.peso, Habilidade: q.hab, Descritor: q.desc }));
  const esc = [];
  for (const q of est.questoes) {
    for (const a of q.aspectos || []) for (const n of a.escala) esc.push({ Questao: `${q.code}${a.id}`, Aspecto: a.nome, Conceito: n.c, Codigo: '', Credito: '', Pontos: n.pts, Descricao: n.desc });
    for (const n of q.escala || []) esc.push({ Questao: q.code, Aspecto: '', Conceito: n.c, Codigo: n.cod || '', Credito: n.cred || '', Pontos: n.pts, Descricao: n.desc });
  }
  const c = (o) => Object.keys(o).map((k) => col(k, k === 'Descricao' || k === 'Descritor' ? 60 : 12));
  await fs.promises.writeFile(path.join(dir, 'modelo_gabarito.xlsx'), await exportacao.xlsx([{ nome: 'Gabarito', colunas: c(gab[0]), linhas: gab }, { nome: 'Escalas', colunas: c(esc[0]), linhas: esc }]));
  console.log('Modelos gerados em templates/');
})();
