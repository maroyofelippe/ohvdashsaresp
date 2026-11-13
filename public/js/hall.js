// Hall da Fama: pódio por turma, destaques por série e ranking da escola.
import { $, esc, pct, num, toast, tabelasOrdenaveis } from './lib/ui.js';
import { api } from './lib/api.js';
import { medalha } from './lib/medalha.js';

const raiz = $('#hall');
const selAno = $('#hAno');
const selAv = $('#hAvaliacao');

const lerURL = () => Object.fromEntries(new URLSearchParams(location.search));
const opt = (v, t, sel) =>
  `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;

async function carregar(ano, avaliacao) {
  raiz.setAttribute('aria-busy', 'true');
  raiz.style.opacity = '.55';
  try {
    const q = new URLSearchParams();
    if (ano) q.set('ano', ano);
    if (avaliacao) q.set('avaliacao', avaliacao);
    const d = await api(`/api/hall-da-fama?${q}`);
    history.replaceState(null, '', `/hall-da-fama${q.size ? `?${q}` : ''}`);
    filtros(d, avaliacao);
    render(d);
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    raiz.style.opacity = '';
    raiz.setAttribute('aria-busy', 'false');
  }
}

function filtros(d, avaliacao) {
  selAno.innerHTML = d.anos.map((a) => opt(a.id, a.ano, d.ano?.id)).join('') || '<option value="">—</option>';
  selAv.innerHTML =
    '<option value="">Mais recente de cada série</option>' +
    d.avaliacoes.map((a) => opt(a.id, `${a.serie} · ${a.titulo}`, avaliacao)).join('');
}

/** Linha de aluno: medalha (pódio), nome, turma e % de acerto. */
const linhaAluno = (r, { serie = false } = {}) =>
  `<li class="hall-aluno"><span class="hall-pos">${medalha(r.pos) || `<b>${r.pos}º</b>`}</span><span class="hall-nome">${esc(r.nome)}<small class="muted">${esc(serie ? `${r.serie} · ${r.turma}` : r.turma)}</small></span><span class="tag ${r.p >= 0.7 ? 'ok' : r.p >= 0.5 ? 'aviso' : 'erro'}" title="${num(r.acObj)}/${num(r.totObj)} pontos">${pct(r.p)}</span></li>`;

function podioEscola(ranking) {
  const top = ranking.filter((r) => r.pos <= 3);
  return `<div class="podio">${top
    .map(
      (r) =>
        `<div class="podio-cartao pos-${r.pos}">${medalha(r.pos)}<div class="podio-nome">${esc(r.nome)}</div><div class="muted small">${esc(r.serie)} · ${esc(r.turma)}</div><div class="podio-pct">${pct(r.p)}</div><div class="muted small">${num(r.acObj)}/${num(r.totObj)} pontos</div></div>`,
    )
    .join('')}</div>`;
}

function render(d) {
  if (!d.ano || !d.escola?.total) {
    raiz.innerHTML =
      '<div class="card vazio"><p>Ainda não há resultados para montar o Hall da Fama neste ano letivo.</p><a class="btn btn-primario" href="/lancamentos">Lançar respostas →</a></div>';
    return;
  }
  raiz.innerHTML = `
    <p class="small muted">Avaliações usadas: ${d.referencias.map((r) => `<span class="tag">${esc(r.serie)} · ${esc(r.titulo)}</span>`).join(' ')}</p>
    <div class="card largo"><h2>Ranking da escola <span class="muted small">· ${d.escola.total} aluno(s)</span></h2>
      ${podioEscola(d.escola.ranking)}
      <div class="tabela-wrap" style="max-height:460px;margin-top:12px"><table class="tabela cartoes"><thead><tr><th data-ordenar>Pos.</th><th data-ordenar>Aluno</th><th data-ordenar>Série</th><th data-ordenar>Turma</th><th data-ordenar>Pontos</th><th data-ordenar>Acerto</th></tr></thead><tbody>
      ${d.escola.ranking
        .map(
          (r) =>
            `<tr><td data-rotulo="Posição" data-valor="${r.pos}">${medalha(r.pos)}<b>${r.pos}º</b></td><td data-rotulo="Aluno">${esc(r.nome)}</td><td data-rotulo="Série">${esc(r.serie)}</td><td data-rotulo="Turma">${esc(r.turma)}</td><td data-rotulo="Pontos" data-valor="${r.acObj}">${num(r.acObj)}/${num(r.totObj)}</td><td data-rotulo="Acerto" data-valor="${r.p}"><span class="tag ${r.p >= 0.7 ? 'ok' : r.p >= 0.5 ? 'aviso' : 'erro'}">${pct(r.p)}</span></td></tr>`,
        )
        .join('')}</tbody></table></div></div>
    <h2 class="hall-titulo">Destaques por série</h2>
    <div class="hall-grade">${d.series
      .map(
        (s) =>
          `<div class="card"><h3>${esc(s.serie)} <span class="muted small">· ${s.total} aluno(s)</span></h3><p class="small muted">${esc(s.avaliacao.titulo)}</p><ol class="hall-lista">${s.ranking.map((r) => linhaAluno(r)).join('')}</ol></div>`,
      )
      .join('')}</div>
    <h2 class="hall-titulo">Pódio por turma</h2>
    <div class="hall-grade">${d.turmas
      .map(
        (t) =>
          `<div class="card"><h3>${esc(t.turma)} <span class="muted small">· ${t.total} aluno(s)</span></h3><ol class="hall-lista">${t.podio.map((r) => linhaAluno(r)).join('')}</ol></div>`,
      )
      .join('')}</div>`;
  tabelasOrdenaveis(raiz);
}

selAno.addEventListener('change', () => carregar(selAno.value, ''));
selAv.addEventListener('change', () => carregar(selAno.value, selAv.value));

const u = lerURL();
carregar(u.ano, u.avaliacao);
