/**
 * Hall da Fama: melhores alunos por turma, por série e na escola.
 * Critério: % de acerto nas questões de alternativas/escalares (LP + MT), igual ao ranking do painel.
 * Base: um ano letivo; cada série usa a sua avaliação mais recente (ou a escolhida no filtro).
 * Tudo respeita o escopo do usuário (só entram turmas que ele pode ver).
 */
const estatisticas = require('./estatisticas.service');
const AppError = require('../utils/AppError');

const r4 = (v) => Math.round(v * 10000) / 10000;

/** Ordena (maior % primeiro; depois pontos e nome) e numera as posições; empates dividem a posição. */
function classificar(lista) {
  const ord = [...lista].sort(
    (a, b) => b.p - a.p || b.acObj - a.acObj || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  let pos = 0;
  let ultimo = null;
  return ord.map((a, i) => {
    const chave = Math.round(a.p * 1000); // empate = mesma décima de ponto percentual
    if (chave !== ultimo) {
      pos = i + 1;
      ultimo = chave;
    }
    return { ...a, pos };
  });
}

/** Quem está até a posição `ate` (inclui empatados). */
const topo = (ranking, ate) => ranking.filter((r) => r.pos <= ate);

async function calcular({ ano, avaliacao } = {}, escopo) {
  const opc = await estatisticas.opcoesFiltro(escopo);
  const anoSel = opc.anos.find((a) => a.id === ano) || opc.anos[0] || null;
  if (!anoSel)
    return { ano: null, anos: [], avaliacoes: [], referencias: [], escola: null, series: [], turmas: [] };

  const avsAno = opc.avaliacoes.filter((a) => a.ano_letivo_id === anoSel.id);
  const nomeSerie = new Map(opc.series.map((s) => [s.id, s.nome]));

  // Uma avaliação de referência por série: a mais recente (a lista já vem ordenada), ou a escolhida.
  const refs = new Map();
  for (const a of avsAno) if (!refs.has(a.serie_id)) refs.set(a.serie_id, a);
  if (avaliacao) {
    const escolhida = avsAno.find((a) => a.id === avaliacao);
    if (!escolhida) throw AppError.badRequest('Avaliação fora do ano letivo ou do seu escopo.');
    refs.set(escolhida.serie_id, escolhida);
  }

  const todos = [];
  const porSerie = [];
  for (const [serieId, av] of [...refs].sort((a, b) =>
    (nomeSerie.get(a[0]) || '').localeCompare(nomeSerie.get(b[0]) || '', 'pt-BR', { numeric: true }),
  )) {
    const dados = await estatisticas.calcular({ avaliacao: av.id }, escopo);
    const serie = nomeSerie.get(serieId) || '';
    const alunos = dados.ranking
      .filter((r) => r.totObj > 0)
      .map((r) => ({
        id: r.id,
        nome: r.nome,
        turma: r.turma,
        serie,
        acObj: r.acObj,
        totObj: r.totObj,
        p: r4(r.acObj / r.totObj),
      }));
    todos.push(...alunos);
    porSerie.push({ serie, avaliacao: { id: av.id, titulo: av.titulo }, alunos });
  }

  const series = porSerie.map((s) => {
    const ranking = classificar(s.alunos);
    return { serie: s.serie, avaliacao: s.avaliacao, total: ranking.length, ranking: topo(ranking, 5) };
  });

  const turmas = [];
  for (const s of porSerie) {
    const nomes = [...new Set(s.alunos.map((a) => a.turma))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );
    for (const turma of nomes) {
      const ranking = classificar(s.alunos.filter((a) => a.turma === turma));
      turmas.push({ turma, serie: s.serie, total: ranking.length, podio: topo(ranking, 3) });
    }
  }

  const escola = classificar(todos);
  return {
    ano: { id: anoSel.id, ano: anoSel.ano },
    anos: opc.anos,
    avaliacoes: avsAno.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      serie: nomeSerie.get(a.serie_id) || '',
    })),
    referencias: porSerie.map((s) => ({
      serie: s.serie,
      avaliacao_id: s.avaliacao.id,
      titulo: s.avaliacao.titulo,
    })),
    escola: { total: escola.length, ranking: escola },
    series,
    turmas,
  };
}

module.exports = { calcular, classificar };
