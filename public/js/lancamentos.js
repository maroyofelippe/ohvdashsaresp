// Grade de lançamento (estilo planilha), com teclado, autosave e popovers analíticos.
import { $, $$, esc, toast, modal, lembrar, pct } from './lib/ui.js';
import { api, baixar } from './lib/api.js';

const selAv = $('#selAvaliacao');
const selTu = $('#selTurma');
const selDi = $('#selDisciplina');
const grade = $('#grade');
const pop = $('#popover');
const statusEl = $('#statusSalvo');

let opcoes = null;
let G = null; // dados da grade
let cols = []; // colunas navegáveis: { tipo: 'presenca' | 'questao', q }
const valores = new Map(); // `${aluno}:${questao}:${aspecto|0}` → valor
const presencas = new Map(); // aluno → 'presente' | 'ausente'
const pendentes = new Map(); // chave → item
const presencasPendentes = new Map();
let timer = null;
let salvando = false;
let ativa = { l: 0, c: 1 };

const k = (a, q, asp) => `${a}:${q}:${asp || 0}`;
const alunoDaLinha = (l) => G.alunos[l];

// ---------------- Seleção encadeada ----------------
async function iniciar() {
  try {
    opcoes = await api('/api/lancamentos/opcoes');
  } catch (e) {
    toast(e.message, 'erro');
    return;
  }
  if (!opcoes.avaliacoes.length) {
    selAv.innerHTML = '<option value="">Nenhuma avaliação publicada</option>';
    $('#vazio').innerHTML =
      `<div class="card vazio"><p>Nenhuma avaliação publicada para as séries das suas turmas.</p><a class="btn btn-primario" href="/avaliacoes/nova">Criar avaliação →</a></div>`;
    return;
  }
  selAv.innerHTML =
    '<option value="">Selecione…</option>' +
    opcoes.avaliacoes.map((a) => `<option value="${a.id}">${esc(a.rotulo)}</option>`).join('');
  const url = new URLSearchParams(location.search);
  const ult = lembrar('ultimaSelecao') || {};
  const ini = {
    avaliacao: url.get('avaliacao') || ult.avaliacao,
    turma: url.get('turma') || (url.get('avaliacao') ? null : ult.turma),
    disciplina: url.get('disciplina') || (url.get('avaliacao') ? null : ult.disciplina),
  };
  if (ini.avaliacao && opcoes.avaliacoes.some((a) => String(a.id) === String(ini.avaliacao))) {
    selAv.value = ini.avaliacao;
    preencherTurmas(ini.turma);
    if (selTu.value) preencherDisciplinas(ini.disciplina);
  } else if (opcoes.avaliacoes.length === 1) {
    selAv.value = opcoes.avaliacoes[0].id;
    preencherTurmas();
  }
  if (selAv.value && selTu.value && selDi.value) carregar();
}

function avaliacaoSel() {
  return opcoes.avaliacoes.find((a) => String(a.id) === selAv.value);
}

function preencherTurmas(preferida) {
  const av = avaliacaoSel();
  selDi.innerHTML = '<option value="">—</option>';
  selDi.disabled = true;
  if (!av) {
    selTu.innerHTML = '<option value="">—</option>';
    selTu.disabled = true;
    return;
  }
  $('#lnkGabarito').hidden = false;
  $('#lnkGabarito').href = `/avaliacoes/${av.id}`;
  const ts = opcoes.turmas
    .filter((t) => t.ano_letivo_id === av.ano_letivo_id && t.serie_id === av.serie_id)
    .sort((a, b) => Number(b.podeLancar) - Number(a.podeLancar) || a.nome.localeCompare(b.nome));
  selTu.innerHTML = ts.length
    ? '<option value="">Selecione…</option>' +
      ts
        .map((t) => `<option value="${t.id}">${esc(t.nome)}${t.podeLancar ? '' : ' (consulta)'}</option>`)
        .join('')
    : '<option value="">Nenhuma turma disponível</option>';
  selTu.disabled = !ts.length;
  const lancaveis = ts.filter((t) => t.podeLancar);
  if (preferida && ts.some((t) => String(t.id) === String(preferida))) selTu.value = preferida;
  else if (lancaveis.length === 1) selTu.value = lancaveis[0].id;
  if (selTu.value) preencherDisciplinas();
}

function preencherDisciplinas(preferida) {
  const av = avaliacaoSel();
  selDi.innerHTML = av.disciplinas
    .map(
      (d) =>
        `<option value="${d.id}">${esc(d.nome)}${d.data ? ` · ${d.data.split('-').reverse().join('/')}` : ''}</option>`,
    )
    .join('');
  selDi.disabled = false;
  if (preferida && av.disciplinas.some((d) => String(d.id) === String(preferida))) selDi.value = preferida;
}

selAv.addEventListener('change', async () => {
  if (!(await podeTrocar())) return;
  preencherTurmas();
  if (selTu.value && selDi.value) carregar();
  else esconderGrade();
});
selTu.addEventListener('change', async () => {
  if (!(await podeTrocar())) return;
  if (selTu.value) {
    if (selDi.disabled) preencherDisciplinas();
    carregar();
  } else esconderGrade();
});
selDi.addEventListener('change', async () => {
  if (!(await podeTrocar())) return;
  if (selTu.value) carregar();
});

async function podeTrocar() {
  if (!pendentes.size && !presencasPendentes.size && !salvando) return true;
  await salvarAgora();
  return true;
}

function esconderGrade() {
  $('#areaGrade').hidden = true;
  G = null;
}

// ---------------- Carregamento e renderização ----------------
async function carregar() {
  const p = { avaliacao: selAv.value, turma: selTu.value, disciplina: selDi.value };
  $('#areaGrade').hidden = false;
  $('#gradeWrap').hidden = false;
  grade.innerHTML =
    '<tbody><tr><td><div class="skeleton" style="width:min(900px,80vw);min-height:240px"></div></td></tr></tbody>';
  try {
    G = await api(`/api/lancamentos/grade?${new URLSearchParams(p)}`);
  } catch (e) {
    grade.innerHTML = '';
    $('#areaGrade').hidden = true;
    toast(e.message, 'erro');
    return;
  }
  const av = avaliacaoSel();
  lembrar('ultimaSelecao', {
    ...p,
    rotulo: `${G.avaliacao.titulo} · ${G.turma.nome} · ${av.disciplinas.find((d) => String(d.id) === p.disciplina)?.nome || ''}`,
  });
  history.replaceState(null, '', `/lancamentos?${new URLSearchParams(p)}`);
  valores.clear();
  presencas.clear();
  for (const r of G.respostas) valores.set(k(r.aluno_id, r.questao_id, r.aspecto_id), r.valor);
  for (const pr of G.presencas) presencas.set(pr.aluno_id, pr.presenca);
  cols = [{ tipo: 'presenca' }, ...G.questoes.map((q) => ({ tipo: 'questao', q }))];
  $('#gradeTitulo').textContent =
    `${G.turma.nome} · ${G.alunos.length} alunos · ${G.questoes.length} questões`;
  $('#cadeado').hidden = G.podeEditar;
  $('#cadeadoTexto').textContent = G.motivoLeitura || 'Somente leitura';
  $('#btnImportar').hidden = !G.podeEditar;
  $('#btnModelo').hidden = !G.podeEditar;
  grade.classList.toggle('grade-leitura', !G.podeEditar);
  setStatus('', '');
  $('#vazio').innerHTML = '';
  $('#gradeWrap').hidden = !G.alunos.length;
  if (!G.alunos.length) {
    grade.innerHTML = '';
    $('#vazio').innerHTML =
      `<div class="card vazio"><p>Esta turma ainda não tem alunos cadastrados.</p><a class="btn btn-primario" href="/alunos?turma_id=${G.turma.id}">Cadastrar/importar alunos →</a></div>`;
    return;
  }
  render();
  focar(0, G.podeEditar ? 1 : 1);
}

function cabecalho(q) {
  const tit =
    q.tipo === 'objetiva'
      ? `Gabarito: ${q.gabarito || '—'}`
      : q.tipo === 'escalar'
        ? 'Escalar'
        : 'Produção de texto';
  return `<th scope="col" title="${esc(`${q.codigo} · ${tit}${q.habilidade_bncc ? ` · ${q.habilidade_bncc}` : ''}`)}">${esc(q.codigo.replace(/^[A-Z]+/, ''))}<small>${q.tipo === 'objetiva' ? (q.anulada ? '∅' : esc(q.gabarito || '·')) : q.tipo === 'escalar' ? 'esc' : 'texto'}</small></th>`;
}

function render() {
  const g = $('#grade');
  const thead = `<thead><tr><th class="fixa" scope="col">Nº · Aluno</th><th scope="col" title="Presença">P/F</th>${G.questoes.map(cabecalho).join('')}<th scope="col">Acertos</th><th scope="col">%</th></tr></thead>`;
  const linhas = G.alunos
    .map((a, l) => {
      const aus = presencas.get(a.id) === 'ausente';
      return `<tr data-l="${l}" class="${aus ? 'ausente' : ''}"><th class="fixa" scope="row" title="${esc(a.nome)}"><span class="num">${a.numero_chamada}</span>${esc(a.nome)}${a.situacao !== 'ativo' ? ` <span class="tag aviso">${esc(a.situacao)}</span>` : ''}</th>
      <td class="cel presenca ${aus ? 'ausente' : ''}" data-l="${l}" data-c="0" tabindex="-1" role="gridcell" aria-label="Presença de ${esc(a.nome)}">${aus ? 'F' : presencas.get(a.id) === 'presente' ? 'P' : ''}</td>
      ${G.questoes.map((q, i) => `<td class="cel ${q.tipo === 'producao_texto' ? 'texto' : ''}" data-l="${l}" data-c="${i + 1}" tabindex="-1" role="gridcell"></td>`).join('')}
      <td class="total" data-tot="acertos"></td><td class="total" data-tot="pct"></td></tr>`;
    })
    .join('');
  g.innerHTML = `${thead}<tbody>${linhas}</tbody>`;
  G.alunos.forEach((_, l) => {
    G.questoes.forEach((_q, i) => pintar(l, i + 1));
    totais(l);
  });
}

function celula(l, c) {
  return $(`#grade td.cel[data-l="${l}"][data-c="${c}"]`);
}

// fração de acerto calculada no cliente (mesmas regras do servidor) para feedback imediato
function fracao(q, alunoId) {
  if (q.anulada) return 1;
  if (q.tipo === 'objetiva') {
    const v = valores.get(k(alunoId, q.id));
    return v === undefined ? null : q.gabarito && v === q.gabarito ? 1 : 0;
  }
  if (q.tipo === 'escalar') {
    const v = valores.get(k(alunoId, q.id));
    if (v === undefined) return null;
    const max = Math.max(0, ...q.niveis.map((n) => n.pontos));
    const n = q.niveis.find((x) => x.codigo === v);
    return n && max ? n.pontos / max : 0;
  }
  const r = texto(q, alunoId);
  return r.vazio ? null : r.f;
}

function texto(q, alunoId) {
  let sit = valores.get(k(alunoId, q.id));
  const asp = q.aspectos.map((a) => ({ a, v: valores.get(k(alunoId, q.id, a.id)) }));
  const algum = asp.some((x) => x.v);
  if (!sit && algum) sit = q.situacoes.find((s) => !s.zera_nota)?.codigo;
  const max = q.aspectos.reduce((s, a) => s + Math.max(0, ...a.niveis.map((n) => n.pontos)), 0);
  if (!sit) return { vazio: true, f: 0, pts: 0, max, sit: null, preenchidos: 0 };
  const def = q.situacoes.find((s) => s.codigo === sit);
  if (!def || def.zera_nota) return { f: 0, pts: 0, max, sit, zera: true, preenchidos: 0 };
  let pts = 0;
  let preenchidos = 0;
  for (const { a, v } of asp) {
    const n = a.niveis.find((x) => x.codigo === v);
    if (n) {
      pts += n.pontos;
      preenchidos++;
    }
  }
  return { f: max ? pts / max : 0, pts, max, sit, preenchidos };
}

function pintar(l, c) {
  const el = celula(l, c);
  if (!el) return;
  const q = cols[c].q;
  const a = alunoDaLinha(l);
  let txt = '';
  if (q.tipo === 'producao_texto') {
    const r = texto(q, a.id);
    txt = r.vazio ? '' : r.zera ? r.sit : `${r.sit}·${r.pts}${r.preenchidos < q.aspectos.length ? '…' : ''}`;
  } else txt = valores.get(k(a.id, q.id)) || '';
  el.textContent = txt;
  const f = fracao(q, a.id);
  el.classList.remove('acerto', 'erro', 'parcial');
  if (f !== null && txt) el.classList.add(f >= 1 ? 'acerto' : f > 0 ? 'parcial' : 'erro');
  el.setAttribute('aria-label', `${a.nome}, ${q.codigo}: ${txt || 'vazio'}`);
  const pend = [...pendentes.keys()].some((x) => x.startsWith(`${a.id}:${q.id}:`));
  el.classList.toggle('pendente', pend);
}

function totais(l) {
  const a = alunoDaLinha(l);
  const tr = $(`#grade tr[data-l="${l}"]`);
  let ac = 0;
  let tot = 0;
  let acertos = 0;
  let algum = false;
  for (const q of G.questoes) {
    const ativa = q.anulada || (q.tipo === 'objetiva' ? !!q.gabarito : true);
    if (!ativa) continue;
    const f = fracao(q, a.id);
    if (f !== null) algum = true;
    tot += q.peso;
    ac += (f || 0) * q.peso;
    if (f !== null && f >= 1) acertos++;
  }
  const aus = presencas.get(a.id) === 'ausente';
  $('[data-tot=acertos]', tr).textContent = aus ? '—' : algum ? `${acertos}/${G.questoes.length}` : '';
  $('[data-tot=pct]', tr).textContent = aus ? 'F' : algum && tot ? pct(ac / tot) : '';
}

// ---------------- Navegação ----------------
function focar(l, c) {
  if (!G || !G.alunos.length) return;
  l = Math.max(0, Math.min(G.alunos.length - 1, l));
  c = Math.max(0, Math.min(cols.length - 1, c));
  const ant = celula(ativa.l, ativa.c);
  if (ant) {
    ant.tabIndex = -1;
    ant.classList.remove('ativa');
  }
  ativa = { l, c };
  const el = celula(l, c);
  if (!el) return;
  el.tabIndex = 0;
  el.classList.add('ativa');
  el.focus({ preventScroll: false });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function avancar() {
  if (ativa.c < cols.length - 1) focar(ativa.l, ativa.c + 1);
  else if (ativa.l < G.alunos.length - 1) focar(ativa.l + 1, 1);
}

grade.parentElement.addEventListener('click', (e) => {
  const td = e.target.closest('td.cel');
  if (!td) return;
  focar(Number(td.dataset.l), Number(td.dataset.c));
  const col = cols[ativa.c];
  if (col.tipo === 'presenca' && G.podeEditar) return alternarPresenca(ativa.l);
  if (col.tipo === 'questao' && col.q.tipo !== 'objetiva') abrirPopover();
});

grade.parentElement.addEventListener('keydown', (e) => {
  if (!G || !e.target.closest('td.cel')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const col = cols[ativa.c];
  const tecla = e.key;
  const nav = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
  if (nav[tecla]) {
    e.preventDefault();
    return focar(ativa.l + nav[tecla][0], ativa.c + nav[tecla][1]);
  }
  if (tecla === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) return ativa.c > 0 ? focar(ativa.l, ativa.c - 1) : focar(ativa.l - 1, cols.length - 1);
    return avancar();
  }
  if (tecla === 'Home') return focar(ativa.l, e.shiftKey ? 0 : 1);
  if (tecla === 'End') return focar(ativa.l, cols.length - 1);
  if (tecla === 'Enter') {
    e.preventDefault();
    if (col.tipo === 'questao' && col.q.tipo !== 'objetiva') return abrirPopover();
    return focar(ativa.l + 1, ativa.c);
  }
  if (!G.podeEditar) return;
  if (tecla === 'Backspace' || tecla === 'Delete') {
    e.preventDefault();
    if (col.tipo === 'presenca') return definirPresenca(ativa.l, null);
    if (col.q.tipo === 'producao_texto') {
      definir(ativa.l, col.q, null, null);
      col.q.aspectos.forEach((a) => definir(ativa.l, col.q, a.id, null));
    } else definir(ativa.l, col.q, null, null);
    return;
  }
  if (tecla.length !== 1) return;
  e.preventDefault();
  const v = tecla.toUpperCase();
  if (col.tipo === 'presenca') {
    if (v === 'P' || v === 'F') {
      definirPresenca(ativa.l, v === 'P' ? 'presente' : 'ausente');
      return avancar();
    }
    return recusar();
  }
  const q = col.q;
  if (presencas.get(alunoDaLinha(ativa.l).id) === 'ausente') {
    toast('Aluno marcado como ausente (F). Marque P para lançar respostas.', '');
    return recusar();
  }
  if (q.tipo === 'producao_texto') return abrirPopover(v);
  const validos =
    q.tipo === 'objetiva'
      ? [...'ABCDEFGHIJ'.slice(0, q.num_alternativas), '-', 'X']
      : [...q.niveis.map((n) => n.codigo), '-'];
  if (!validos.includes(v)) return recusar();
  definir(ativa.l, q, null, v);
  avancar();
});

function recusar() {
  const el = celula(ativa.l, ativa.c);
  el.classList.remove('invalida');
  void el.offsetWidth;
  el.classList.add('invalida');
  setTimeout(() => el.classList.remove('invalida'), 300);
}

// ---------------- Edição e salvamento ----------------
function definir(l, q, aspectoId, valor) {
  const a = alunoDaLinha(l);
  const chave = k(a.id, q.id, aspectoId);
  const atual = valores.get(chave);
  if ((atual ?? null) === (valor ?? null)) return;
  if (valor === null) valores.delete(chave);
  else valores.set(chave, valor);
  if (valor !== null && !presencas.has(a.id)) {
    presencas.set(a.id, 'presente');
    const pc = celula(l, 0);
    if (pc) pc.textContent = 'P';
  }
  pendentes.set(chave, { aluno_id: a.id, questao_id: q.id, aspecto_id: aspectoId || null, valor });
  pintar(
    l,
    cols.findIndex((c) => c.q === q),
  );
  totais(l);
  agendar();
}

function definirPresenca(l, presenca) {
  const a = alunoDaLinha(l);
  if (presenca === null) return;
  presencas.set(a.id, presenca);
  presencasPendentes.set(a.id, { aluno_id: a.id, disciplina_id: G.disciplina_id, presenca });
  const tr = $(`#grade tr[data-l="${l}"]`);
  tr.classList.toggle('ausente', presenca === 'ausente');
  const pc = celula(l, 0);
  pc.textContent = presenca === 'ausente' ? 'F' : 'P';
  pc.classList.toggle('ausente', presenca === 'ausente');
  totais(l);
  agendar();
}

function alternarPresenca(l) {
  const a = alunoDaLinha(l);
  definirPresenca(l, presencas.get(a.id) === 'ausente' ? 'presente' : 'ausente');
}

function setStatus(texto, classe) {
  statusEl.textContent = texto;
  statusEl.className = `status-salvo ${classe}`;
  $('#btnTentar').hidden = classe !== 'erro';
}

function agendar() {
  setStatus('Alterações pendentes…', 'salvando');
  clearTimeout(timer);
  timer = setTimeout(salvarAgora, 800);
}

async function salvarAgora() {
  clearTimeout(timer);
  if (salvando || !G || (!pendentes.size && !presencasPendentes.size)) return;
  salvando = true;
  const itens = [...pendentes.values()];
  const pres = [...presencasPendentes.values()];
  const chaves = [...pendentes.keys()];
  pendentes.clear();
  presencasPendentes.clear();
  setStatus('Salvando…', 'salvando');
  try {
    const r = await api('/api/lancamentos', {
      method: 'PATCH',
      body: {
        avaliacao_id: G.avaliacao.id,
        turma_id: G.turma.id,
        disciplina_id: G.disciplina_id,
        itens,
        presencas: pres,
      },
    });
    if (r.erros?.length) toast(`${r.erros.length} valor(es) recusado(s): ${r.erros[0].erro}`, 'erro');
    const hora = new Date(r.salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setStatus(
      pendentes.size ? 'Alterações pendentes…' : `Salvo às ${hora}`,
      pendentes.size ? 'salvando' : 'ok',
    );
    // remove marcação "pendente" das células salvas
    for (const ch of chaves) {
      const [aid, qid] = ch.split(':').map(Number);
      const l = G.alunos.findIndex((x) => x.id === aid);
      const c = cols.findIndex((x) => x.q && x.q.id === qid);
      if (l >= 0 && c >= 0) pintar(l, c);
    }
  } catch (e) {
    // devolve à fila (sem sobrescrever edições mais novas)
    itens.forEach((it, i) => !pendentes.has(chaves[i]) && pendentes.set(chaves[i], it));
    pres.forEach((p) => !presencasPendentes.has(p.aluno_id) && presencasPendentes.set(p.aluno_id, p));
    setStatus('Erro ao salvar — tentar novamente', 'erro');
    toast(e.message, 'erro');
  } finally {
    salvando = false;
    if ((pendentes.size || presencasPendentes.size) && statusEl.classList.contains('salvando')) agendar();
  }
}
$('#btnTentar').addEventListener('click', salvarAgora);
window.addEventListener('beforeunload', (e) => {
  if (pendentes.size || presencasPendentes.size || salvando) {
    salvarAgora();
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && salvarAgora());

$('#chkAcertos').addEventListener('change', (e) => {
  $('#grade')?.classList.toggle('mostrar-acertos', e.target.checked);
  lembrar('mostrarAcertos', e.target.checked);
});
if (lembrar('mostrarAcertos')) {
  $('#chkAcertos').checked = true;
  grade.classList.add('mostrar-acertos');
}

// ---------------- Popovers (escalar e produção de texto) ----------------
function posicionar(el) {
  const r = el.getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 4}px`;
  pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8))}px`;
}

function fecharPopover(avancarDepois = false) {
  pop.hidden = true;
  pop.onkeydown = null;
  document.removeEventListener('mousedown', foraDoPopover);
  if (avancarDepois) avancar();
  else focar(ativa.l, ativa.c);
}
function foraDoPopover(e) {
  if (!pop.contains(e.target) && !e.target.closest('td.cel')) fecharPopover();
}

function abrirPopover(teclaInicial) {
  const col = cols[ativa.c];
  if (!col || col.tipo !== 'questao' || col.q.tipo === 'objetiva') return;
  const q = col.q;
  const a = alunoDaLinha(ativa.l);
  const ro = !G.podeEditar;
  if (q.tipo === 'escalar') {
    const atual = valores.get(k(a.id, q.id));
    pop.className = 'popover';
    pop.innerHTML = `<h4>${esc(q.codigo)} · ${esc(a.nome.split(' ')[0])}</h4>${q.enunciado_resumo ? `<p class="muted">${esc(q.enunciado_resumo)}</p>` : ''}
      ${q.niveis.map((n) => `<button type="button" class="opcao" data-v="${esc(n.codigo)}" aria-pressed="${atual === n.codigo}" ${ro ? 'disabled' : ''}><b>${esc(n.codigo)}</b><span><span class="tag ${n.credito === 'integral' ? 'ok' : n.credito === 'parcial' ? 'aviso' : 'erro'}">${esc(n.credito || '')} · ${n.pontos}</span> ${esc(n.descricao || '')}</span></button>`).join('')}
      ${ro ? '' : `<button type="button" class="opcao" data-v="-" aria-pressed="${atual === '-'}"><b>-</b><span>Em branco</span></button>`}`;
    pop.hidden = false;
    posicionar(celula(ativa.l, ativa.c));
    const escolher = (v) => {
      definir(ativa.l, q, null, v);
      fecharPopover(true);
    };
    $$('[data-v]', pop).forEach((b) => b.addEventListener('click', () => escolher(b.dataset.v)));
    pop.onkeydown = (e) => {
      if (e.key === 'Escape') return fecharPopover();
      const v = e.key.toUpperCase();
      if (!ro && (q.niveis.some((n) => n.codigo === v) || v === '-')) {
        e.preventDefault();
        escolher(v);
      }
    };
    ($('[aria-pressed=true]', pop) || $('[data-v]', pop))?.focus();
    setTimeout(() => document.addEventListener('mousedown', foraDoPopover), 0);
    return;
  }
  // Produção de texto: situação + aspectos
  let foco = 0; // 0 = situação; 1..n = aspectos
  const desenhar = () => {
    const r = texto(q, a.id);
    const sit = valores.get(k(a.id, q.id)) || (r.sit && !r.vazio ? r.sit : '');
    const zera = q.situacoes.find((s) => s.codigo === sit)?.zera_nota;
    pop.className = 'popover painel-texto';
    pop.innerHTML = `<h4>${esc(q.codigo)} · ${esc(a.nome)} <span class="muted">· ${r.vazio ? '—' : zera ? '0' : `${r.pts}/${r.max}`} pts</span></h4>
      <div class="asp ${foco === 0 ? 'foco' : ''}" data-linha="0"><span><b>Situação</b></span><div class="btn-grupo">${q.situacoes.map((s) => `<button type="button" class="btn btn-letra" title="${esc(s.nome)}${s.zera_nota ? ' (zera)' : ''}" data-sit="${esc(s.codigo)}" aria-pressed="${sit === s.codigo}" ${ro ? 'disabled' : ''}>${esc(s.codigo)}</button>`).join('')}</div></div>
      <div class="small muted" style="margin:2px 0 6px">${q.situacoes.map((s) => `${esc(s.codigo)} ${esc(s.nome)}`).join(' · ')}</div>
      ${q.aspectos
        .map((as, i) => {
          const v = valores.get(k(a.id, q.id, as.id));
          return `<div class="asp ${foco === i + 1 ? 'foco' : ''} ${zera ? 'desab' : ''}" data-linha="${i + 1}"><span title="${esc(as.descricao || '')}"><b>${esc(as.codigo)}</b> ${esc(as.nome)}</span><div class="btn-grupo">${as.niveis.map((n) => `<button type="button" class="btn btn-letra" data-asp="${as.id}" data-v="${esc(n.codigo)}" title="${esc(`${n.pontos} pt – ${n.descricao || ''}`)}" aria-pressed="${v === n.codigo}" ${ro || zera ? 'disabled' : ''}>${esc(n.codigo)}</button>`).join('')}</div></div>`;
        })
        .join('')}
      <p class="small muted" style="margin:8px 0 0">Digite as letras em sequência (situação, depois A1…${esc(q.aspectos.at(-1)?.codigo || '')}). ↑↓ muda a linha · Esc fecha.</p>`;
    $$('[data-sit]', pop).forEach((b) =>
      b.addEventListener('click', () => {
        escolherSit(b.dataset.sit);
      }),
    );
    $$('[data-asp]', pop).forEach((b) =>
      b.addEventListener('click', () => {
        foco = q.aspectos.findIndex((x) => String(x.id) === b.dataset.asp) + 1;
        escolherAsp(b.dataset.v);
      }),
    );
  };
  const escolherSit = (v) => {
    definir(ativa.l, q, null, v);
    const def = q.situacoes.find((s) => s.codigo === v);
    if (def?.zera_nota) {
      q.aspectos.forEach((as) => definir(ativa.l, q, as.id, null));
      return fecharPopover(true);
    }
    foco = 1;
    desenhar();
    pop.focus();
  };
  const escolherAsp = (v) => {
    const as = q.aspectos[foco - 1];
    if (!as) return;
    if (!valores.get(k(a.id, q.id)))
      definir(ativa.l, q, null, q.situacoes.find((s) => !s.zera_nota)?.codigo || 'A');
    definir(ativa.l, q, as.id, v);
    if (foco >= q.aspectos.length) return fecharPopover(true);
    foco++;
    desenhar();
    pop.focus();
  };
  desenhar();
  pop.tabIndex = -1;
  pop.hidden = false;
  posicionar(celula(ativa.l, ativa.c));
  pop.focus();
  pop.onkeydown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.target === pop)) {
      e.preventDefault();
      return fecharPopover(e.key === 'Enter');
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      foco = Math.max(0, Math.min(q.aspectos.length, foco + (e.key === 'ArrowDown' ? 1 : -1)));
      desenhar();
      return pop.focus();
    }
    if (ro || e.key.length !== 1) return;
    const v = e.key.toUpperCase();
    if (foco === 0 && q.situacoes.some((s) => s.codigo === v)) {
      e.preventDefault();
      return escolherSit(v);
    }
    const as = q.aspectos[foco - 1];
    if (as && as.niveis.some((n) => n.codigo === v)) {
      e.preventDefault();
      return escolherAsp(v);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', foraDoPopover), 0);
  if (teclaInicial && !ro) {
    if (q.situacoes.some((s) => s.codigo === teclaInicial)) escolherSit(teclaInicial);
  }
}

// ---------------- Ajuda, modelo, exportação e importação ----------------
$('#btnAjuda').addEventListener('click', () =>
  modal({
    titulo: 'Atalhos da grade',
    html: `<ul class="lista-insights"><li><b>Letra</b> (A, B, C…): grava e avança para a próxima célula</li><li><b>-</b> em branco · <b>X</b> rasura/dupla marcação</li><li><b>Setas</b>, <b>Tab</b> e <b>Shift+Tab</b>: navegar · <b>Home/End</b>: início/fim da linha</li><li><b>Enter</b>: abre os níveis (questões escalares e produção de texto)</li><li><b>Backspace/Delete</b>: limpa a célula</li><li>Coluna <b>P/F</b>: P presente, F ausente (ausentes ficam fora das médias)</li><li>O salvamento é automático; acompanhe o indicador “Salvo às…”.</li></ul>`,
  }),
);
$('#btnModelo').addEventListener('click', () =>
  baixar(`/api/lancamentos/modelo?avaliacao=${G.avaliacao.id}&turma=${G.turma.id}`).catch((e) =>
    toast(e.message, 'erro'),
  ),
);
$('#btnExportar').addEventListener('click', async () => {
  await salvarAgora();
  baixar(`/api/lancamentos/exportar?avaliacao=${G.avaliacao.id}&turma=${G.turma.id}`).catch((e) =>
    toast(e.message, 'erro'),
  );
});

$('#btnImportar').addEventListener('click', async () => {
  await salvarAgora();
  let previa = null;
  const alunosOpc = G.alunos
    .map((a) => `<option value="${a.id}">${a.numero_chamada} · ${esc(a.nome)}</option>`)
    .join('');
  const r = await modal({
    titulo: `Importar respostas — ${G.turma.nome}`,
    largo: true,
    html: `<p class="muted">Mesmo layout da planilha da PoC: <b>Nº, Nome, Turma, LP01, LP02… LP09a, LP09b… LP17S, LP17A1…A7, MT01… MT21</b>. Todas as disciplinas da avaliação são importadas. Alunos são reconhecidos pelo nome (sem acento/caixa) ou pelo Nº.</p>
      <div class="campo"><label for="arqResp">Arquivo (.xlsx ou .csv)</label><input type="file" id="arqResp" accept=".xlsx,.csv"></div><div id="previaResp"></div>`,
    botoes: [
      { texto: 'Cancelar', valor: false },
      {
        texto: 'Importar',
        classe: 'btn-primario',
        antes: () => !!previa || (toast('Selecione o arquivo e confira a pré-visualização.', 'erro'), false),
        valor: (m) =>
          previa.linhas
            .map((l, i) => {
              const dec = $(`[data-dec="${i}"]`, m)?.value;
              if (l.status === 'outra_turma' || l.status === 'vazia') return null;
              if (l.aluno_id && (!dec || dec === 'auto')) return { aluno_id: l.aluno_id, valores: l.valores };
              if (!dec || dec === 'ignorar') return null;
              if (dec === 'criar')
                return {
                  criar: { numero: l.numero || G.alunos.length + i + 1, nome: l.nome },
                  valores: l.valores,
                };
              return { aluno_id: Number(dec), valores: l.valores };
            })
            .filter(Boolean),
      },
    ],
    aoAbrir: (m) => {
      $('#arqResp', m).addEventListener('change', async (e) => {
        const arq = e.target.files[0];
        if (!arq) return;
        const fd = new FormData();
        fd.append('avaliacao_id', G.avaliacao.id);
        fd.append('turma_id', G.turma.id);
        fd.append('arquivo', arq);
        $('#previaResp', m).innerHTML = '<div class="skeleton" style="min-height:120px"></div>';
        try {
          previa = await api('/api/lancamentos/importar/previa', { method: 'POST', form: fd });
          const s = previa.resumo;
          $('#previaResp', m).innerHTML =
            `<p><span class="tag ok">${s.ok} reconhecidos</span> <span class="tag aviso">${s.naoEncontrados} não encontrados</span> <span class="tag">${s.outraTurma} de outra turma</span> <span class="tag">${s.vazias} sem respostas</span> <span class="tag erro">${s.comErros} com avisos</span></p>
            <p class="small muted">${previa.colunas.length} colunas reconhecidas${previa.ignoradas.length ? ` · ignoradas: ${esc(previa.ignoradas.join(', '))}` : ''}</p>
            <div class="tabela-wrap" style="max-height:340px"><table class="tabela"><thead><tr><th>Linha</th><th>No arquivo</th><th>Aluno no sistema</th><th>Respostas</th><th>Avisos</th></tr></thead><tbody>
            ${previa.linhas
              .map(
                (
                  l,
                  i,
                ) => `<tr class="${l.status === 'nao_encontrado' ? 'linha-aviso' : l.erros.length ? 'linha-erro' : ''}"><td>${l.linha}</td><td>${l.numero ?? ''} ${esc(l.nome)}</td>
              <td>${l.status === 'outra_turma' ? '<span class="muted">ignorado (outra turma)</span>' : l.aluno_id ? `${esc(l.aluno_nome)} <span class="small muted">(por ${l.casadoPor})</span>` : `<select data-dec="${i}" aria-label="Decisão para ${esc(l.nome)}"><option value="ignorar">Ignorar</option><option value="criar">Cadastrar como novo aluno</option>${alunosOpc}</select>`}</td>
              <td>${l.preenchidas}</td><td class="small">${esc(l.erros.join('; '))}</td></tr>`,
              )
              .join('')}</tbody></table></div>`;
        } catch (err) {
          previa = null;
          $('#previaResp', m).innerHTML = `<div class="alerta erro">${esc(err.message)}</div>`;
        }
      });
    },
  });
  if (!r) return;
  if (!r.length) return toast('Nada para importar.', '');
  try {
    const res = await api('/api/lancamentos/importar/confirmar', {
      method: 'POST',
      body: { avaliacao_id: G.avaliacao.id, turma_id: G.turma.id, linhas: r },
    });
    toast(
      `Importação concluída: ${res.gravadas} resposta(s)${res.alunosCriados ? `, ${res.alunosCriados} aluno(s) cadastrado(s)` : ''}.`,
      'ok',
    );
    carregar();
  } catch (e) {
    toast(e.message, 'erro');
  }
});

iniciar();
