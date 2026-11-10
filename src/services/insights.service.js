/**
 * Insights automáticos por turma — regras simples, linguagem para o coordenador.
 * Função pura: recebe estatísticas já calculadas e limiares (em %).
 */
const env = require('../config/env');

const pct = (f) => `${Math.round((f || 0) * 100)}%`;

function limiaresPadrao() {
  return {
    positiva: env.INSIGHT_HABILIDADE_POSITIVA,
    atencao: env.INSIGHT_HABILIDADE_ATENCAO,
    critico: env.INSIGHT_ALUNO_CRITICO,
  };
}

/**
 * @param t {
 *   nome, avaliados, media,                                   // média 0..1
 *   habilidades: [{ codigo, descritor, p, n }],               // p 0..1
 *   questoes: [{ codigo, tipo, gabarito, habilidade, p, part, dist: { A: n, ... } }],
 *   alunos: [{ nome, p }],
 *   texto: [{ codigo, zeradas: { nome: n } }]
 * }
 */
function gerar(t, limiares = limiaresPadrao()) {
  const pos = limiares.positiva / 100;
  const aten = limiares.atencao / 100;
  const crit = limiares.critico / 100;
  const positivos = [];
  const atencao = [];
  const recomendacoes = [];
  if (!t || !t.avaliados)
    return { positivos, atencao, recomendacoes: ['Ainda não há respostas lançadas para gerar insights.'] };

  if (t.media >= pos)
    positivos.push(`Aproveitamento geral de ${pct(t.media)}, acima da meta de ${limiares.positiva}%.`);
  else if (t.media < aten)
    atencao.push(`Aproveitamento geral de ${pct(t.media)}, abaixo de ${limiares.atencao}%.`);

  const habs = (t.habilidades || []).filter((h) => h.n > 0);
  const fortes = habs
    .filter((h) => h.p >= pos)
    .sort((a, b) => b.p - a.p)
    .slice(0, 5);
  const fracas = habs
    .filter((h) => h.p < aten)
    .sort((a, b) => a.p - b.p)
    .slice(0, 5);
  for (const h of fortes)
    positivos.push(
      `Habilidade ${h.codigo}${h.descritor ? ` (${h.descritor.toLowerCase()})` : ''}: ${pct(h.p)} de acerto.`,
    );
  for (const h of fracas)
    atencao.push(
      `Habilidade ${h.codigo}${h.descritor ? ` (${h.descritor.toLowerCase()})` : ''}: apenas ${pct(h.p)} de acerto.`,
    );

  const dominadas = (t.questoes || []).filter((q) => q.part > 0 && q.p >= 0.9).map((q) => q.codigo);
  if (dominadas.length) positivos.push(`Questões dominadas pela turma (≥ 90%): ${dominadas.join(', ')}.`);

  const distratores = [];
  for (const q of t.questoes || []) {
    if (q.tipo !== 'objetiva' || !q.gabarito || !q.part) continue;
    const certo = q.dist?.[q.gabarito] || 0;
    const [letra, n] =
      Object.entries(q.dist || {})
        .filter(([k]) => /^[A-J]$/.test(k) && k !== q.gabarito)
        .sort((a, b) => b[1] - a[1])[0] || [];
    if (letra && n > certo) distratores.push({ codigo: q.codigo, letra, n, gabarito: q.gabarito, certo });
  }
  for (const d of distratores.slice(0, 6)) {
    atencao.push(
      `${d.codigo}: a alternativa ${d.letra} (${d.n} aluno${d.n > 1 ? 's' : ''}) foi mais marcada que o gabarito ${d.gabarito} (${d.certo}).`,
    );
  }

  const criticos = (t.alunos || []).filter((a) => a.p !== null && a.p < crit).sort((a, b) => a.p - b.p);
  if (criticos.length) {
    const nomes = criticos.slice(0, 8).map((a) => `${a.nome.split(' ').slice(0, 2).join(' ')} (${pct(a.p)})`);
    atencao.push(
      `${criticos.length} aluno${criticos.length > 1 ? 's' : ''} com desempenho abaixo de ${limiares.critico}%: ${nomes.join(', ')}${criticos.length > 8 ? '…' : ''}.`,
    );
  }
  for (const tx of t.texto || []) {
    const z = Object.entries(tx.zeradas || {}).filter(([, n]) => n > 0);
    if (z.length)
      atencao.push(
        `${tx.codigo} – textos fora da situação Normal (nota zero): ${z.map(([k, n]) => `${k}: ${n}`).join(' · ')}.`,
      );
  }

  if (fracas.length)
    recomendacoes.push(
      `Retomar ${fracas.map((h) => h.codigo).join(', ')} com atividades diversificadas e intervenções em pequenos grupos.`,
    );
  if (distratores.length)
    recomendacoes.push(
      'Discutir com a turma os distratores mais marcados: eles revelam hipóteses equivocadas que podem ser trabalhadas.',
    );
  if (criticos.length)
    recomendacoes.push(
      'Organizar reagrupamentos produtivos e recuperação contínua para os alunos em situação crítica.',
    );
  if (fortes.length)
    recomendacoes.push(
      'Aproveitar as habilidades consolidadas como ponto de partida para os conteúdos seguintes.',
    );
  if (!recomendacoes.length)
    recomendacoes.push('Manter o acompanhamento e comparar com as próximas avaliações.');
  return { positivos, atencao, recomendacoes };
}

module.exports = { gerar, limiaresPadrao };
