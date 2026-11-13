// Painel estatístico: filtros na URL, visões com Chart.js (servido localmente) e exportação.
import { $, $$, esc, pct, num, toast, classePct, tabelasOrdenaveis } from './lib/ui.js';
import { api, baixar } from './lib/api.js';

const raiz = $('#painel');
const f = {
  ano: $('#fAno'),
  serie: $('#fSerie'),
  av: $('#fAvaliacao'),
  turmas: $('#fTurma'),
  aluno: $('#fAluno'),
  disc: $('#fDisc'),
};
let opcoes = null;
let graficos = [];
let dados = null;

// Paleta categórica validada (ordem fixa; cor segue a entidade). Status reservado para acerto/erro.
const escuro = document.documentElement.dataset.tema === 'escuro';
// Trocar o tema recarrega o painel para os gráficos serem redesenhados com a nova paleta.
document.addEventListener('ohv:tema', () => location.reload());
const CAT = escuro
  ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
  : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COR = {
  ok: css('--c-sucesso'),
  aviso: css('--c-alerta'),
  erro: css('--c-erro'),
  neutro: escuro ? '#57534e' : '#d6d3d1',
  texto: css('--c-texto-2'),
  grade: css('--c-borda'),
  superficie: css('--c-superficie'),
};
// Cor por alternativa (fixa): o gabarito é sempre pintado com a cor de "acerto".
const COR_LETRA = {
  A: CAT[0],
  B: CAT[1],
  C: CAT[6],
  D: CAT[3],
  E: CAT[4],
  F: CAT[2],
  '-': COR.neutro,
  X: escuro ? '#78716c' : '#a8a29e',
  '—': escuro ? '#3a3633' : '#e7e5e4',
};
const ROTULO_VALOR = { '-': 'Em branco', X: 'Rasura', '—': 'Sem resposta' };

if (window.Chart) {
  Chart.defaults.font.family = css('--f-familia') || 'system-ui';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COR.texto;
  Chart.defaults.borderColor = COR.grade;
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.boxHeight = 12;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches
    ? false
    : { duration: 250 };
}
const barra = { borderRadius: 4, borderSkipped: 'start', borderWidth: 0, maxBarThickness: 28 };

// ---------------- Filtros ----------------
const lerURL = () => Object.fromEntries(new URLSearchParams(location.search));
function gravarURL() {
  const p = new URLSearchParams();
  if (f.ano.value) p.set('ano', f.ano.value);
  if (f.serie.value) p.set('serie', f.serie.value);
  if (f.av.value) p.set('avaliacao', f.av.value);
  const ts = turmasSel();
  if (ts.length) p.set('turmas', ts.join(','));
  if (f.aluno.value) p.set('aluno', f.aluno.value);
  if (f.disc.value) p.set('disciplina', f.disc.value);
  history.replaceState(null, '', `/painel?${p}`);
}
const turmasSel = () => $$('input[name=turma]:checked', f.turmas).map((c) => c.value);
const opt = (v, t, sel) =>
  `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;

async function iniciar() {
  try {
    opcoes = await api('/api/painel/opcoes');
  } catch (e) {
    return toast(e.message, 'erro');
  }
  if (!opcoes.avaliacoes.length) {
    raiz.setAttribute('aria-busy', 'false');
    raiz.innerHTML =
      '<div class="card vazio"><p>Ainda não há avaliações publicadas no seu escopo.</p><a class="btn btn-primario" href="/avaliacoes">Ver avaliações →</a></div>';
    return;
  }
  const u = lerURL();
  let av = opcoes.avaliacoes.find((a) => String(a.id) === u.avaliacao) || null;
  const ano = av?.ano_letivo_id || u.ano || opcoes.anos[0]?.id;
  f.ano.innerHTML = opcoes.anos.map((a) => opt(a.id, a.ano, ano)).join('');
  preencherSeries(av?.serie_id || u.serie);
  preencherAvaliacoes(av?.id);
  preencherTurmas((u.turmas || '').split(',').filter(Boolean));
  preencherDisciplinas(u.disciplina);
  await preencherAlunos(u.aluno);
  f.ano.addEventListener(
    'change',
    () => (preencherSeries(), preencherAvaliacoes(), preencherTurmas(), preencherDisciplinas(), mudou(true)),
  );
  f.serie.addEventListener(
    'change',
    () => (preencherAvaliacoes(), preencherTurmas(), preencherDisciplinas(), mudou(true)),
  );
  f.av.addEventListener('change', () => (preencherTurmas(), preencherDisciplinas(), mudou(true)));
  f.turmas.addEventListener('change', () => mudou(true));
  f.aluno.addEventListener('change', () => mudou(false));
  f.disc.addEventListener('change', () => mudou(false));
  carregar();
}

function preencherSeries(sel) {
  const ss = opcoes.series.filter((s) =>
    opcoes.avaliacoes.some((a) => a.serie_id === s.id && String(a.ano_letivo_id) === f.ano.value),
  );
  f.serie.innerHTML = ss.map((s) => opt(s.id, s.nome, sel)).join('') || '<option value="">—</option>';
}
function preencherAvaliacoes(sel) {
  const avs = opcoes.avaliacoes.filter(
    (a) => String(a.ano_letivo_id) === f.ano.value && String(a.serie_id) === f.serie.value,
  );
  f.av.innerHTML =
    avs.map((a) => opt(a.id, a.titulo, sel)).join('') || '<option value="">Nenhuma avaliação</option>';
}
function preencherTurmas(sel = []) {
  const ts = opcoes.turmas.filter(
    (t) => String(t.ano_letivo_id) === f.ano.value && String(t.serie_id) === f.serie.value,
  );
  f.turmas.innerHTML =
    ts
      .map(
        (t) =>
          `<label class="check"><input type="checkbox" name="turma" value="${t.id}" ${sel.includes(String(t.id)) ? 'checked' : ''}> ${esc(t.letra)}</label>`,
      )
      .join('') || '<span class="muted small">—</span>';
}
function preencherDisciplinas(sel) {
  const av = opcoes.avaliacoes.find((a) => String(a.id) === f.av.value);
  const ds = opcoes.disciplinas.filter((d) => av?.disciplinas.includes(d.id));
  f.disc.innerHTML = '<option value="">Todas</option>' + ds.map((d) => opt(d.id, d.nome, sel)).join('');
}
async function preencherAlunos(sel) {
  if (!f.av.value) return;
  try {
    const lista = await api(`/api/painel/alunos?avaliacao=${f.av.value}&turmas=${turmasSel().join(',')}`);
    f.aluno.innerHTML = '<option value="">Todos</option>' + lista.map((a) => opt(a.id, a.nome, sel)).join('');
  } catch {
    f.aluno.innerHTML = '<option value="">Todos</option>';
  }
}
async function mudou(recarregarAlunos) {
  if (recarregarAlunos) await preencherAlunos(f.aluno.value);
  carregar();
}

function query() {
  return new URLSearchParams({
    avaliacao: f.av.value,
    turmas: turmasSel().join(','),
    aluno: f.aluno.value,
    disciplina: f.disc.value,
  });
}

async function carregar() {
  gravarURL();
  if (!f.av.value) return;
  raiz.setAttribute('aria-busy', 'true');
  raiz.style.opacity = '.55';
  try {
    dados = await api(`/api/painel/dados?${query()}`);
    render();
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    raiz.style.opacity = '';
    raiz.setAttribute('aria-busy', 'false');
  }
}

$('#btnExportarTudo').addEventListener(
  'click',
  () =>
    f.av.value &&
    baixar(`/api/painel/exportar?${query()}&visao=tudo&formato=xlsx`).catch((e) => toast(e.message, 'erro')),
);

// ---------------- Renderização ----------------
const exp = (visao) =>
  `<span class="card-acoes nao-imprimir"><button class="btn btn-sm btn-ghost" data-exp="${visao}" data-fmt="xlsx" title="Exportar xlsx">xlsx</button><button class="btn btn-sm btn-ghost" data-exp="${visao}" data-fmt="csv" title="Exportar csv">csv</button></span>`;
// Seções ocultadas a pedido (basta trocar para true para exibir de novo).
const MOSTRAR = { rankingRespostas: false, radarTexto: false };
const tagPct = (p) => `<span class="tag ${classePct(p)}">${pct(p)}</span>`;

function render() {
  graficos.forEach((g) => g.destroy());
  graficos = [];
  const d = dados;
  $('#painelSub').textContent =
    `${d.avaliacao.titulo} · ${d.turmas.map((t) => t.nome).join(', ') || 'nenhuma turma'}`;
  if (!d.kpis.avaliados) {
    raiz.innerHTML = `<div class="card vazio"><p>Ainda não há respostas lançadas para este filtro.</p><a class="btn btn-primario" href="/lancamentos?avaliacao=${d.avaliacao.id}">Lançar respostas →</a></div>`;
    return;
  }
  const k = d.kpis;
  const discs = d.avaliacao.disciplinas;
  raiz.innerHTML = `
    ${k.semGabarito.length ? `<div class="alerta aviso">${k.semGabarito.length} questão(ões) sem gabarito não entram nas estatísticas: ${esc(k.semGabarito.join(', '))}.</div>` : ''}
    <div class="kpis">
      <div class="kpi"><div class="rot">Alunos avaliados</div><div class="val">${k.avaliados}</div><div class="det">de ${k.alunos} no filtro</div></div>
      <div class="kpi"><div class="rot">Ausentes</div><div class="val">${k.ausentes}</div><div class="det">fora das médias</div></div>
      <div class="kpi"><div class="rot">Média geral</div><div class="val">${pct(k.media)}</div><div class="det">${k.questoes} questões · ${num(k.pontos)} pontos</div></div>
      ${k.porDisciplina.map((x) => `<div class="kpi"><div class="rot">Média ${esc(x.sigla)}</div><div class="val">${pct(x.media)}</div><div class="det">${esc(x.nome)}</div></div>`).join('')}
      <div class="kpi"><div class="rot">Alunos ≥ 70%</div><div class="val">${pct(k.pctAcima70)}</div><div class="det">${k.acima70} aluno(s) · ${k.abaixo50} abaixo de 50%</div></div>
    </div>
    ${d.aluno ? cardAluno(d) : ''}
    <div class="painel-grid">
      ${
        MOSTRAR.rankingRespostas
          ? discs
              .map((di) => {
                const n = d.questoes.filter(
                  (q) => q.disciplina === di.sigla && q.tipo === 'objetiva' && q.part > 0,
                ).length;
                return n
                  ? `<div class="card largo"><h2>Ranking de respostas por questão — ${esc(di.nome)} ${exp('questoes')}</h2><p class="card-sub">Distribuição das alternativas marcadas; o gabarito aparece em verde. Distratores mais marcados que o gabarito merecem atenção.</p><div class="grafico" style="height:390px"><canvas id="gResp_${di.sigla}" role="img" aria-label="Distribuição das respostas por questão de ${esc(di.nome)}"></canvas></div></div>`
                  : '';
              })
              .join('')
          : ''
      }
      <div class="card largo"><h2>Desempenho por habilidade ${exp('habilidades')}</h2><p class="card-sub">% de acerto (ponderado pelo peso) nas questões de cada habilidade BNCC, por turma.</p>${quadrosHabilidades(d)}</div>
      ${discs
        .filter((di) => radarHabilidades(di.sigla).eixos.length)
        .map(
          (di) =>
            `<div class="card"><h2>Radar de habilidades — ${esc(di.nome)} ${exp('habilidades')}</h2><p class="card-sub">% de acerto em cada habilidade BNCC: cada turma comparada com o geral (todas as turmas do filtro).</p><div class="grafico grafico-radar"><canvas id="gRadHab_${di.sigla}" role="img" aria-label="Radar de habilidades de ${esc(di.nome)}: turmas e geral"></canvas></div></div>`,
        )
        .join('')}
      ${d.texto
        .map(
          (
            t,
            i,
          ) => `<div class="card"><h2>Produção de texto — ${esc(t.codigo)} ${exp('texto')}</h2><p class="card-sub">Média de ${num(t.mediaPontos)} de ${num(t.max)} pontos (${pct(t.p)}). Aproveitamento por aspecto nos textos em situação que pontua.</p>
        <p>${t.situacoes.map((s) => `<span class="tag ${s.zera_nota ? (s.n ? 'erro' : '') : 'ok'}">${esc(s.codigo)} ${esc(s.nome)}: ${s.n}</span>`).join(' ')}</p>
        <div class="grafico"><canvas id="gTexto_${i}" role="img" aria-label="Aproveitamento por aspecto"></canvas></div></div>${
          MOSTRAR.radarTexto
            ? `
      <div class="card"><h2>Radar da produção de texto — ${esc(t.codigo)} ${exp('texto')}</h2><p class="card-sub">Aproveitamento por critério: cada turma comparada com o geral.</p><div class="grafico grafico-radar"><canvas id="gRadTexto_${i}" role="img" aria-label="Radar dos critérios de produção de texto: turmas e geral"></canvas></div></div>`
            : ''
        }`,
        )
        .join('')}
      ${
        d.escalares.some((e) => e.part)
          ? `<div class="card"><h2>Questões escalares ${exp('escalares')}</h2><p class="card-sub">Distribuição dos níveis de crédito (integral, parcial, nenhum).</p><div class="grafico" style="height:${Math.max(200, d.escalares.length * 70)}px"><canvas id="gEsc" role="img" aria-label="Distribuição das questões escalares"></canvas></div>
        <div class="small muted">${d.escalares.map((e) => `<div><b>${esc(e.codigo)}</b> (${esc(e.habilidade || '')}): ${e.niveis.map((n) => `${esc(n.codigo)}=${n.n}`).join(' · ')}${e.semResposta ? ` · sem resposta ${e.semResposta}` : ''}</div>`).join('')}</div></div>`
          : ''
      }
      <div class="card"><h2>Maiores acertos ${exp('questoes')}</h2>${tabelaQuestoes(d.maiores)}</div>
      <div class="card"><h2>Menores acertos ${exp('questoes')}</h2>${tabelaQuestoes(d.menores)}</div>
      <div class="card largo"><h2>Ranking dos alunos ${exp('ranking')}</h2>
        <div class="tabela-wrap" style="max-height:440px"><table class="tabela cartoes"><thead><tr><th data-ordenar>Pos.</th><th data-ordenar>Aluno</th><th data-ordenar>Turma</th>${discs.map((x) => `<th data-ordenar>${esc(x.sigla)}</th>`).join('')}<th data-ordenar>Pontos</th><th data-ordenar>Geral</th></tr></thead><tbody>
        ${d.ranking
          .map(
            (r) =>
              `<tr${d.aluno && d.aluno.id === r.id ? ' style="background:var(--c-destaque-suave)"' : ''}><td data-rotulo="Posição" data-valor="${r.posicao}"><b>${r.posicao}º</b></td><td data-rotulo="Aluno">${esc(r.nome)}</td><td data-rotulo="Turma">${esc(r.turma)}</td>${discs
                .map(
                  (x) =>
                    `<td data-rotulo="${esc(x.sigla)}" data-valor="${r.porDisc[x.sigla] ? r.porDisc[x.sigla].p : -1}">${r.porDisc[x.sigla] ? `${num(r.porDisc[x.sigla].ac)}/${num(r.porDisc[x.sigla].tot)}` : '–'}</td>`,
                )
                .join(
                  '',
                )}<td data-rotulo="Pontos" data-valor="${r.ac}">${num(r.ac)}/${num(r.tot)}</td><td data-rotulo="Geral" data-valor="${r.p}">${tagPct(r.p)}</td></tr>`,
          )
          .join('')}</tbody></table></div></div>
      <div class="card largo"><h2>Comparativo entre turmas ${exp('comparativo')}</h2><div class="grafico"><canvas id="gComp" role="img" aria-label="Comparativo entre turmas"></canvas></div>
        <div class="tabela-wrap" style="margin-top:12px"><table class="tabela cartoes"><thead><tr><th>Turma</th><th>Avaliados</th><th>Ausentes</th><th>Média</th>${discs.map((x) => `<th>${esc(x.sigla)}</th>`).join('')}<th>≥ 70%</th></tr></thead><tbody>
        ${d.porTurma.map((t) => `<tr><td data-rotulo="Turma"><b>${esc(t.turma)}</b></td><td data-rotulo="Avaliados">${t.avaliados}/${t.alunos}</td><td data-rotulo="Ausentes">${t.ausentes}</td><td data-rotulo="Média">${tagPct(t.media)}</td>${t.porDisciplina.map((x) => `<td data-rotulo="${esc(x.sigla)}">${pct(x.media)}</td>`).join('')}<td data-rotulo="≥ 70%">${t.acima70}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card largo"><h2>Insights por turma ${exp('insights')}</h2>
        <div class="grid grid-${Math.min(3, d.porTurma.length) || 1}">${d.porTurma
          .map(
            (t) => `<div><h3>${esc(t.turma)} ${tagPct(t.media)}</h3>
          ${t.insights.positivos.length ? `<div class="insight pos"><b>Pontos positivos</b><ul class="lista-insights">${t.insights.positivos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${t.insights.atencao.length ? `<div class="insight neg"><b>Pontos de atenção</b><ul class="lista-insights">${t.insights.atencao.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <div class="insight rec"><b>Sugestões</b><ul class="lista-insights">${t.insights.recomendacoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`,
          )
          .join('')}</div></div>
      <div class="card largo"><h2>Mapa de calor — aluno × questão ${exp('mapa')}</h2><p class="card-sub">LP 1–16 e MT 1–21, por turma, em ordem alfabética. Verde com ✓ = acerto; vermelho com ✗ = erro; amarelo = crédito parcial (% da questão). F = ausente na disciplina. Passe o mouse para ver os detalhes.</p>${mapaCalor(d)}</div>
    </div>`;
  tabelasOrdenaveis(raiz);
  $$('[data-exp]', raiz).forEach((b) =>
    b.addEventListener('click', () =>
      baixar(`/api/painel/exportar?${query()}&visao=${b.dataset.exp}&formato=${b.dataset.fmt}`).catch((e) =>
        toast(e.message, 'erro'),
      ),
    ),
  );
  if (!window.Chart) return;
  if (MOSTRAR.rankingRespostas) discs.forEach((di) => graficoRespostas(di.sigla));
  discs.forEach((di) => graficoRadarHabilidades(di.sigla));
  d.texto.forEach((t, i) => {
    graficoTexto(t, i);
    if (MOSTRAR.radarTexto) graficoRadarTexto(t, i);
  });
  if (d.escalares.some((e) => e.part)) graficoEscalares();
  graficoComparativo();
}

/** Quadro por habilidade (geral + turmas), agrupado por disciplina: Matemática antes de Língua Portuguesa. */
function quadrosHabilidades(d) {
  const ordem = (sigla) => (sigla === 'MT' ? 0 : sigla === 'LP' ? 1 : 2);
  const grupos = d.avaliacao.disciplinas
    .map((di) => ({
      di,
      habs: d.habilidades
        .filter((h) => h.disciplina === di.sigla && h.p !== null && h.n > 0)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })),
    }))
    .filter((g) => g.habs.length)
    .sort((a, b) => ordem(a.di.sigla) - ordem(b.di.sigla) || a.di.nome.localeCompare(b.di.nome, 'pt-BR'));
  if (!grupos.length) return '';
  const turmas = d.habilidadesPorTurma.filter((t) => t.habilidades.some((h) => h.p !== null));
  return `<div class="hab-quadros">${grupos
    .map(
      (g) =>
        `<section class="hab-grupo" aria-label="Habilidades de ${esc(g.di.nome)}"><h3>${esc(g.di.nome)}</h3><div class="hab-grade">${g.habs
          .map((h) => {
            const porTurma =
              turmas.length > 1
                ? `<div class="hab-turmas">${turmas
                    .map((t) => {
                      const x = t.habilidades.find((y) => y.codigo === h.codigo);
                      return `<span class="${classePct(x?.p)}" title="${esc(t.turma)}">${esc(t.turma.split(' ').pop())} ${pct(x?.p ?? null)}</span>`;
                    })
                    .join('')}</div>`
                : '';
            return `<div class="hab-cel ${classePct(h.p)}" title="${esc(`${h.codigo} — ${h.descritor || ''} · questões: ${h.questoes.join(', ')}`)}"><div class="hab-cod">${esc(h.codigo)}</div><div class="hab-pct">${pct(h.p)}</div>${porTurma}</div>`;
          })
          .join('')}</div></section>`,
    )
    .join('')}</div>`;
}

function tabelaQuestoes(lista) {
  if (!lista.length) return '<p class="muted">Sem dados.</p>';
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Questão</th><th>Habilidade</th><th>Acerto</th></tr></thead><tbody>${lista
    .map(
      (q) =>
        `<tr><td class="mono"><b>${esc(q.codigo)}</b></td><td class="small"><span class="mono">${esc(q.habilidade || '—')}</span>${q.descritor ? `<br><span class="muted">${esc(q.descritor)}</span>` : ''}</td><td>${tagPct(q.p)}</td></tr>`,
    )
    .join('')}</tbody></table></div>`;
}

function cardAluno(d) {
  const a = d.aluno;
  return `<div class="card"><h2>${esc(a.nome)} <span class="muted small">${esc(a.turma)} · ${a.posicao ? `${a.posicao}º de ${a.de}` : 'sem lançamento'}</span></h2>
    <div class="kpis">${d.avaliacao.disciplinas.map((x) => `<div class="kpi"><div class="rot">${esc(x.nome)}</div><div class="val">${a.porDisc[x.sigla] ? pct(a.porDisc[x.sigla].p) : 'F'}</div><div class="det">${a.porDisc[x.sigla] ? `${a.porDisc[x.sigla].acertos} acertos` : 'ausente/sem lançamento'}</div></div>`).join('')}<div class="kpi"><div class="rot">Geral</div><div class="val">${pct(a.p)}</div></div></div>
    <div class="gabarito-grade">${a.questoes.map((q) => `<div class="item" style="background:${q.f === null ? 'transparent' : q.f >= 1 ? 'var(--c-sucesso-suave)' : q.f > 0 ? 'var(--c-alerta-suave)' : 'var(--c-erro-suave)'}"><b>${esc(q.codigo)}</b><span class="small">${q.f === null ? 'F' : pct(q.f)}</span></div>`).join('')}</div></div>`;
}

// Ícones Font Awesome Free 6 (solid: check, xmark) — CC BY 4.0, https://fontawesome.com/license/free
const FA_CHECK =
  '<svg class="hm-ico" viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>';
const FA_XMARK =
  '<svg class="hm-ico" viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.3c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg>';

// Limite de questões exibidas no mapa de calor, por disciplina (LP 1–16 e MT 1–21).
const LIMITE_MAPA = { LP: 16, MT: 21 };
function mapaCalor(d) {
  const m = d.mapaCalor;
  // índices das questões que entram no mapa (número entre 1 e o limite da disciplina; exclui produção textual)
  const indices = m.questoes
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      const mt = /^([A-Z]+)0*(\d+)/.exec(q.codigo);
      const limite = mt && LIMITE_MAPA[mt[1]];
      return limite && Number(mt[2]) >= 1 && Number(mt[2]) <= limite;
    });
  if (!indices.length) return '<p class="muted">Sem questões de LP (1–16) ou MT (1–21) neste filtro.</p>';
  const cel = (v, a, q) => {
    if (v === null) return `<td class="hm hm-f" title="${esc(`${a.nome} · ${q.codigo}: ausente`)}">F</td>`;
    if (v >= 1)
      return `<td class="hm hm-ok" title="${esc(`${a.nome} · ${q.codigo}: acerto`)}">${FA_CHECK}<span class="sr-only">acerto</span></td>`;
    if (v <= 0)
      return `<td class="hm hm-erro" title="${esc(`${a.nome} · ${q.codigo}: erro`)}">${FA_XMARK}<span class="sr-only">erro</span></td>`;
    return `<td class="hm hm-parc" title="${esc(`${a.nome} · ${q.codigo}: ${pct(v)} (parcial)`)}">${Math.round(v * 100)}</td>`;
  };
  const turmas = [...new Set(m.alunos.map((a) => a.turma))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true }),
  );
  return turmas
    .map((turma) => {
      const alunos = m.alunos
        .filter((a) => a.turma === turma)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      return `<section class="mapa-turma" aria-label="Mapa de calor — ${esc(turma)}"><h3>${esc(turma)} <span class="muted small">· ${alunos.length} aluno(s)</span></h3><div class="tabela-wrap" style="max-height:520px"><table class="heatmap"><thead><tr><th class="nome" style="position:sticky;left:0;z-index:2">Aluno</th>${indices.map(({ q }) => `<th title="${esc(q.codigo)}">${esc(q.codigo.replace(/^[A-Z]+/, ''))}<br><span class="muted">${esc(q.disciplina)}</span></th>`).join('')}<th>%</th></tr></thead><tbody>
    ${alunos.map((a) => `<tr><td class="nome">${esc(a.nome)}</td>${indices.map(({ q, i }) => cel(a.valores[i], a, q)).join('')}<td><b>${pct(a.p)}</b></td></tr>`).join('')}
  </tbody></table></div></section>`;
    })
    .join('');
}

// Plugin local (sem dependência externa): escreve o valor no topo de cada coluna.
const rotulosTopo = {
  id: 'rotulosTopo',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = `600 11px ${Chart.defaults.font.family}`;
    ctx.fillStyle = css('--c-texto') || COR.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((ds, i) => {
      if (ds.rotulo === false || (ds.type || chart.config.type) !== 'bar') return;
      chart.getDatasetMeta(i).data.forEach((barra, j) => {
        const v = ds.data[j];
        if (v === null || v === undefined) return;
        ctx.fillText(`${v}%`, barra.x, barra.y - 4);
      });
    });
    ctx.restore();
  },
};
const pctTick = { callback: (v) => `${v}%` };
const tooltipPct = { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y ?? c.parsed.x}%` } };

function graficoRespostas(sigla) {
  const el = document.getElementById(`gResp_${sigla}`);
  if (!el) return;
  const qs = dados.questoes.filter((q) => q.disciplina === sigla && q.tipo === 'objetiva' && q.part > 0);
  const letras = [...new Set(qs.flatMap((q) => Object.keys(q.dist)))].sort((a, b) =>
    (a.length === 1 && /[A-J]/.test(a) ? a : `~${a}`).localeCompare(
      b.length === 1 && /[A-J]/.test(b) ? b : `~${b}`,
    ),
  );
  const datasets = letras.map((l) => ({
    label: ROTULO_VALOR[l] || `Alternativa ${l}`,
    data: qs.map((q) => (q.part ? Math.round(((q.dist[l] || 0) / q.part) * 1000) / 10 : 0)),
    backgroundColor: qs.map((q) => (q.gabarito === l ? COR.ok : COR_LETRA[l] || COR.neutro)),
    borderColor: COR.superficie,
    borderWidth: { top: 2 },
    borderSkipped: false,
    borderRadius: 0,
    maxBarThickness: 28,
    stack: 's',
  }));
  graficos.push(
    new Chart(el, {
      type: 'bar',
      data: { labels: qs.map((q) => `${q.codigo}${q.gabarito ? ` (${q.gabarito})` : ''}`), datasets },
      options: {
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, max: 100, ticks: pctTick },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              generateLabels: (c) => [
                { text: 'Gabarito (acerto)', fillStyle: COR.ok, strokeStyle: COR.ok, lineWidth: 0 },
                ...Chart.defaults.plugins.legend.labels.generateLabels(c).map((x) => ({
                  ...x,
                  fillStyle: COR_LETRA[letras[x.datasetIndex]] || COR.neutro,
                  strokeStyle: 'transparent',
                })),
              ],
            },
          },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.dataset.label}: ${c.parsed.y}%${qs[c.dataIndex].gabarito === letras[c.datasetIndex] ? ' ✓ gabarito' : ''}`,
              footer: (it) =>
                `${qs[it[0].dataIndex].part} respondentes · ${qs[it[0].dataIndex].habilidade || ''}`,
            },
          },
        },
      },
    }),
  );
}

// ---------------- Radares: eixo × turma × geral ----------------
const p100 = (p) => (p === null || p === undefined ? null : Math.round(p * 1000) / 10);
const encurtar = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Habilidades de uma disciplina com dados, e as séries (geral + turmas) alinhadas a elas. */
function radarHabilidades(sigla) {
  const eixos = dados.habilidades
    .filter((h) => h.disciplina === sigla && h.p !== null && h.n > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const valor = (lista, cod) => p100(lista.find((y) => y.codigo === cod)?.p);
  return {
    eixos,
    geral: eixos.map((h) => p100(h.p)),
    turmas: dados.habilidadesPorTurma.map((t) => ({
      nome: t.turma,
      dados: eixos.map((h) => valor(t.habilidades, h.codigo)),
    })),
  };
}

/** Radar genérico: série "Geral" tracejada e uma série por turma (cor fixa por turma). */
function radar(el, { rotulos, titulos, geral, turmas, rodape }) {
  const hex2rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const turmasComDados = turmas.filter((t) => t.dados.some((v) => v !== null));
  const datasets = [
    ...turmasComDados.map((t, i) => ({
      label: t.nome,
      data: t.dados,
      borderColor: CAT[i % CAT.length],
      backgroundColor: hex2rgba(CAT[i % CAT.length], 0.12),
      pointBackgroundColor: CAT[i % CAT.length],
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 7,
      pointHitRadius: 14,
    })),
    {
      label: 'Geral',
      data: geral,
      borderColor: COR.texto,
      backgroundColor: 'transparent',
      pointBackgroundColor: COR.texto,
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 7,
      pointHitRadius: 14,
    },
  ];
  graficos.push(
    new Chart(el, {
      type: 'radar',
      data: { labels: rotulos, datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        hover: { mode: 'index', intersect: false },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, callback: (v) => `${v}%`, backdropColor: 'transparent' },
            grid: { color: COR.grade },
            angleLines: { color: COR.grade },
            pointLabels: { font: { size: 11 } },
          },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              title: (it) => titulos[it[0].dataIndex],
              label: (c) => `${c.dataset.label}: ${c.parsed.r === null ? 'sem dados' : `${c.parsed.r}%`}`,
              footer: (it) => (rodape ? rodape[it[0].dataIndex] : ''),
            },
          },
        },
      },
    }),
  );
}

function graficoRadarHabilidades(sigla) {
  const el = document.getElementById(`gRadHab_${sigla}`);
  if (!el) return;
  const r = radarHabilidades(sigla);
  radar(el, {
    rotulos: r.eixos.map((h) => h.codigo),
    titulos: r.eixos.map((h) => `${h.codigo} — ${h.descritor || ''}`),
    rodape: r.eixos.map((h) => `Questões: ${h.questoes.join(', ')}`),
    geral: r.geral,
    turmas: r.turmas,
  });
}

function graficoRadarTexto(t, i) {
  const el = document.getElementById(`gRadTexto_${i}`);
  if (!el) return;
  radar(el, {
    rotulos: t.aspectos.map((a) => encurtar(`${a.codigo} ${a.nome}`)),
    titulos: t.aspectos.map((a) => `${a.codigo} — ${a.nome}`),
    geral: t.aspectos.map((a) => p100(a.p)),
    turmas: t.porTurma.map((pt) => ({ nome: pt.turma, dados: pt.aspectos.map((a) => p100(a.p)) })),
  });
}

function graficoTexto(t, i) {
  const el = document.getElementById(`gTexto_${i}`);
  graficos.push(
    new Chart(el, {
      type: 'bar',
      data: {
        labels: t.aspectos.map((a) => `${a.codigo} ${a.nome}`),
        datasets: [
          {
            label: 'Aproveitamento',
            data: t.aspectos.map((a) => (a.p === null ? 0 : Math.round(a.p * 1000) / 10)),
            backgroundColor: CAT[0],
            ...barra,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: pctTick }, y: { grid: { display: false } } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.parsed.x}% · ${t.aspectos[c.dataIndex].niveis.map((n) => `${n.codigo}(${n.pontos}): ${n.n}`).join(' · ')}`,
            },
          },
        },
      },
    }),
  );
}

function graficoEscalares() {
  const el = document.getElementById('gEsc');
  const es = dados.escalares;
  const serie = (label, campo, cor) => ({
    label,
    data: es.map((e) => e[campo]),
    backgroundColor: cor,
    borderColor: COR.superficie,
    borderWidth: { right: 2 },
    borderSkipped: false,
    maxBarThickness: 26,
    stack: 's',
  });
  graficos.push(
    new Chart(el, {
      type: 'bar',
      data: {
        labels: es.map((e) => e.codigo),
        datasets: [
          serie('Crédito integral', 'integral', COR.ok),
          serie('Crédito parcial', 'parcial', COR.aviso),
          serie('Nenhum crédito', 'nenhum', COR.neutro),
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { stacked: true, ticks: { precision: 0 }, title: { display: true, text: 'alunos' } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    }),
  );
}

function graficoComparativo() {
  const el = document.getElementById('gComp');
  const discs = dados.avaliacao.disciplinas;
  const series = [
    { label: 'Média geral', get: (t) => t.media },
    ...discs.map((x) => ({
      label: x.nome,
      get: (t) => t.porDisciplina.find((y) => y.sigla === x.sigla)?.media,
    })),
  ];
  const mediaGeral = p100(dados.kpis.media);
  graficos.push(
    new Chart(el, {
      type: 'bar',
      plugins: [rotulosTopo],
      data: {
        labels: dados.porTurma.map((t) => t.turma),
        datasets: [
          ...series.map((s, i) => ({
            label: s.label,
            data: dados.porTurma.map((t) =>
              s.get(t) === null || s.get(t) === undefined ? null : Math.round(s.get(t) * 1000) / 10,
            ),
            backgroundColor: CAT[i % CAT.length],
            ...barra,
            order: 2,
          })),
          // Linha combinada: média geral de todas as turmas do filtro (referência para cada turma)
          {
            type: 'line',
            label: 'Média geral (todas as turmas)',
            data: dados.porTurma.map(() => mediaGeral),
            borderColor: COR.texto,
            backgroundColor: COR.texto,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0,
            order: 1,
            rotulo: false,
          },
        ],
      },
      options: {
        layout: { padding: { top: 18 } },
        scales: { y: { min: 0, max: 100, ticks: pctTick }, x: { grid: { display: false } } },
        plugins: { legend: { position: 'bottom' }, tooltip: tooltipPct },
      },
    }),
  );
}

iniciar();
