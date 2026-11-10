// Assistente de avaliação: (1) Dados → (2) Questões → (3) Revisar e publicar.
import { $, $$, esc, toast, toastDepois, modal, confirmar, dadosJson, mostrarErros, data } from './lib/ui.js';
import { api, baixar } from './lib/api.js';

const D = dadosJson('dadosEditor');
const raiz = $('#editor');
const LETRAS = 'ABCDEFGHIJ';
const TIPOS = {
  objetiva: 'Objetiva',
  escalar: 'Escalar (dissertativa)',
  producao_texto: 'Produção de texto',
};
const TIPOS_AV = { simulado: 'Simulado', saresp_oficial: 'SARESP oficial', diagnostica: 'Diagnóstica' };
const CREDITOS = { integral: 'Integral', parcial: 'Parcial', nenhum: 'Nenhum' };
const SITUACOES_PADRAO = [
  {
    codigo: 'A',
    nome: 'Normal',
    descricao: 'Resposta passível de ser corrigida, de acordo com os critérios do guia.',
    zera_nota: false,
  },
  { codigo: 'B', nome: 'Branco', descricao: 'Questão em branco, sem nenhuma resposta.', zera_nota: true },
  {
    codigo: 'C',
    nome: 'Pré-silábico',
    descricao: 'Escrita apresentada em nível silábico e/ou pré-silábico.',
    zera_nota: true,
  },
  {
    codigo: 'D',
    nome: 'Cópia',
    descricao: 'Texto apresenta apenas trechos transcritos do enunciado.',
    zera_nota: true,
  },
  {
    codigo: 'E',
    nome: 'Outra língua',
    descricao: 'Resposta em idioma diferente do português.',
    zera_nota: true,
  },
];

const estado = {
  av: D.novo
    ? {
        titulo: 'SIMULADO SARESP',
        tipo: 'simulado',
        ano_letivo_id: D.anos[0]?.id,
        serie_id: D.series[0]?.id,
        disciplinas: D.disciplinas.map((d) => ({ disciplina_id: d.id, data_aplicacao: null })),
      }
    : { ...D.avaliacao },
  questoes: D.novo ? [] : D.questoes,
  perm: D.permissoes || { podeEditarDados: true, podeEditarEstrutura: true, podeCorrigirGabarito: true },
  passo: D.novo ? '1' : D.passo || '2',
  sujo: false,
  abertos: new Set(),
};
let seq = 0;
const novaChave = () => `n${Date.now().toString(36)}${seq++}`;
const disc = (id) => D.disciplinas.find((d) => d.id === Number(id));
const somenteLeitura = () => !estado.perm.podeCorrigirGabarito;
const travaEstrutura = () =>
  somenteLeitura() || (estado.perm.temRespostas && !estado.perm.podeEditarEstrutura);
const ehPai = (q) => estado.questoes.some((x) => x.pai_chave === q.chave);
const filhos = (q) => estado.questoes.filter((x) => x.pai_chave === q.chave);
const dis = (cond) => (cond ? 'disabled' : '');

function marcarSujo() {
  estado.sujo = true;
  const s = $('#statusSalvar');
  if (s) s.textContent = 'Alterações não salvas';
}
window.addEventListener('beforeunload', (e) => {
  if (estado.sujo) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------------- Navegação ----------------
function irPara(p) {
  if (D.novo && p !== '1') return;
  estado.passo = p;
  $$('.passos button').forEach((b) =>
    b.getAttribute('data-passo') === p
      ? b.setAttribute('aria-current', 'step')
      : b.removeAttribute('aria-current'),
  );
  const url = new URL(location.href);
  if (!D.novo) {
    url.searchParams.set('passo', p);
    history.replaceState(null, '', url);
  }
  ({ 1: passo1, 2: passo2, 3: passo3 })[p]();
}
$$('.passos button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.passo)));

// ---------------- Passo 1: dados ----------------
function passo1() {
  const av = estado.av;
  const series =
    D.perfil === 'professor' && D.pares
      ? D.series.filter((s) => D.pares.some((p) => p.serie_id === s.id))
      : D.series;
  const bloqueado = !D.novo && !estado.perm.podeEditarDados;
  const discSel = new Map(av.disciplinas.map((d) => [d.disciplina_id, d]));
  raiz.innerHTML = `
  <form class="card" id="formDados" novalidate style="max-width:760px">
    ${bloqueado ? '<div class="alerta aviso">Esta avaliação já tem respostas lançadas ou não é sua: ano letivo e série não podem ser alterados.</div>' : ''}
    <div class="campo"><label for="titulo">Título</label><input id="titulo" name="titulo" value="${esc(av.titulo)}" required ${dis(somenteLeitura())}></div>
    <div class="linha-campos">
      <div class="campo"><label for="tipo">Tipo</label><select id="tipo" name="tipo" ${dis(somenteLeitura())}>${Object.entries(
        TIPOS_AV,
      )
        .map(([k, v]) => `<option value="${k}" ${av.tipo === k ? 'selected' : ''}>${v}</option>`)
        .join('')}</select></div>
      <div class="campo"><label for="ano_letivo_id">Ano letivo</label><select id="ano_letivo_id" name="ano_letivo_id" ${dis(bloqueado)}>${D.anos.map((a) => `<option value="${a.id}" ${av.ano_letivo_id === a.id ? 'selected' : ''}>${a.ano}</option>`).join('')}</select></div>
      <div class="campo"><label for="serie_id">Série</label><select id="serie_id" name="serie_id" ${dis(bloqueado)}>${series.map((s) => `<option value="${s.id}" ${av.serie_id === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select>
      ${D.perfil === 'professor' ? '<span class="ajuda">Somente séries em que você leciona.</span>' : ''}</div>
    </div>
    <fieldset class="campo" style="border:0;padding:0"><legend class="rotulo">Disciplinas e datas de aplicação</legend>
      ${D.disciplinas
        .map((d) => {
          const s = discSel.get(d.id);
          return `<div class="linha-campos" style="align-items:center"><label class="check"><input type="checkbox" name="disc" value="${d.id}" ${s ? 'checked' : ''} ${dis(somenteLeitura())}> ${esc(d.nome)} (${esc(d.sigla)})</label>
          <div class="campo" style="margin:0"><label class="sr-only" for="data_${d.id}">Data ${esc(d.sigla)}</label><input type="date" id="data_${d.id}" name="data_${d.id}" value="${s?.data_aplicacao || ''}" ${dis(somenteLeitura())}></div></div>`;
        })
        .join('')}
      <span class="erro" data-erro="disciplinas"></span>
    </fieldset>
    ${somenteLeitura() ? '' : `<div class="acoes"><button class="btn btn-primario" type="submit">${D.novo ? 'Criar e cadastrar questões' : 'Salvar e continuar'} →</button></div>`}
  </form>`;
  $('#formDados').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const corpo = {
      titulo: f.titulo.value,
      tipo: f.tipo.value,
      ano_letivo_id: Number(f.ano_letivo_id.value),
      serie_id: Number(f.serie_id.value),
      disciplinas: $$('input[name=disc]:checked', f).map((c) => ({
        disciplina_id: Number(c.value),
        data_aplicacao: f[`data_${c.value}`].value || null,
      })),
    };
    try {
      if (D.novo) {
        const av = await api('/api/avaliacoes', { method: 'POST', body: corpo });
        toastDepois('Avaliação criada. Agora cadastre as questões.');
        location.href = `/avaliacoes/${av.id}/editar?passo=2`;
        return;
      }
      await api(`/api/avaliacoes/${estado.av.id}`, { method: 'PUT', body: corpo });
      Object.assign(estado.av, corpo);
      $('#edTitulo').textContent = corpo.titulo;
      toast('Dados salvos.', 'ok');
      irPara('2');
    } catch (err) {
      if (err.detalhes?.disciplinas) $('[data-erro=disciplinas]').textContent = err.detalhes.disciplinas;
      mostrarErros(f, err);
    }
  });
}

// ---------------- Passo 2: questões ----------------
function ordenarCodigo(a, b) {
  return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
}

function proximoNumero(discId) {
  const sig = disc(discId).sigla;
  const nums = estado.questoes
    .filter((q) => q.disciplina_id === discId)
    .map((q) => Number((q.codigo.match(new RegExp(`^${sig}(\\d+)`)) || [0, 0])[1]));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

function novaQuestao(discId, tipo, codigo) {
  const q = {
    id: null,
    chave: novaChave(),
    pai_chave: null,
    disciplina_id: discId,
    codigo,
    ordem: 0,
    tipo,
    num_alternativas: 4,
    gabarito: null,
    peso: 1,
    habilidade_bncc: '',
    descritor: '',
    item_codigo: '',
    enunciado_resumo: '',
    anulada: false,
    niveis: [],
    situacoes: [],
    aspectos: [],
  };
  aplicarTipo(q, tipo);
  return q;
}

function aplicarTipo(q, tipo) {
  q.tipo = tipo;
  if (tipo !== 'objetiva') q.gabarito = null;
  if (tipo === 'escalar' && !q.niveis.length) {
    q.niveis = [
      { codigo: 'A', codigo_alt: '', credito: 'integral', pontos: 1, descricao: '' },
      { codigo: 'B', codigo_alt: '', credito: 'parcial', pontos: 0.5, descricao: '' },
      { codigo: 'C', codigo_alt: '', credito: 'nenhum', pontos: 0, descricao: '' },
    ];
  }
  if (tipo === 'producao_texto') {
    if (!q.situacoes.length) q.situacoes = SITUACOES_PADRAO.map((s) => ({ ...s }));
    if (!q.aspectos.length)
      q.aspectos = [
        {
          id: null,
          codigo: 'A1',
          nome: 'Adequação à proposta',
          descricao: '',
          niveis: [
            { codigo: 'A', pontos: 2, descricao: '' },
            { codigo: 'B', pontos: 1, descricao: '' },
            { codigo: 'C', pontos: 0, descricao: '' },
          ],
        },
      ];
  }
}

function inserirApos(ref, novas) {
  const lista = estado.questoes;
  let idx = lista.indexOf(ref);
  while (idx + 1 < lista.length && lista[idx + 1].pai_chave === ref.chave) idx++;
  lista.splice(idx + 1, 0, ...novas);
}

const totalPesos = (discId) =>
  estado.questoes
    .filter((q) => q.disciplina_id === discId && !ehPai(q) && !q.anulada)
    .reduce((s, q) => s + Number(q.peso || 0), 0);
const fmtN = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function linhaNiveis(n, i, { credito = true, trava }) {
  return `<tr data-nivel="${i}">
    <td><input aria-label="Código do nível" data-n="codigo" value="${esc(n.codigo)}" maxlength="2" style="width:48px" ${dis(trava)}></td>
    ${
      credito
        ? `<td><select aria-label="Crédito" data-n="credito" ${dis(trava)}>${Object.entries(CREDITOS)
            .map(([k, v]) => `<option value="${k}" ${n.credito === k ? 'selected' : ''}>${v}</option>`)
            .join(
              '',
            )}</select></td><td><input aria-label="Código SARESP" data-n="codigo_alt" value="${esc(n.codigo_alt || '')}" maxlength="4" style="width:56px" ${dis(trava)} placeholder="20"></td>`
        : ''
    }
    <td><input aria-label="Pontos" data-n="pontos" type="number" step="0.5" min="0" value="${n.pontos}" style="width:72px" ${dis(trava)}></td>
    <td><input aria-label="Descrição" data-n="descricao" value="${esc(n.descricao || '')}" ${dis(trava && somenteLeitura())}></td>
    <td>${trava ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-acao="rem-nivel" aria-label="Remover nível">✕</button>'}</td></tr>`;
}

function editorEscalar(q, trava) {
  return `<div class="editor-escala" data-escala="questao"><b class="small">Níveis da escala</b> <span class="small muted">(f = pontos do nível ÷ maior pontuação)</span>
    <table><thead><tr><th>Nível</th><th>Crédito</th><th>Cód.</th><th>Pontos</th><th>Descrição (critério de correção)</th><th></th></tr></thead><tbody>${q.niveis.map((n, i) => linhaNiveis(n, i, { trava })).join('')}</tbody></table>
    ${trava ? '' : '<button type="button" class="btn btn-sm" data-acao="add-nivel">+ Nível</button>'}</div>`;
}

function editorTexto(q, trava) {
  const max = q.aspectos.reduce((s, a) => s + Math.max(0, ...a.niveis.map((n) => Number(n.pontos) || 0)), 0);
  return `<div class="editor-escala"><b class="small">Situações do texto</b> <span class="small muted">(situações que zeram ignoram os aspectos)</span>
    <table><thead><tr><th>Cód.</th><th>Nome</th><th>Zera a nota?</th><th>Descrição</th><th></th></tr></thead><tbody>
    ${q.situacoes
      .map(
        (s, i) =>
          `<tr data-situacao="${i}"><td><input aria-label="Código" data-s="codigo" value="${esc(s.codigo)}" maxlength="2" style="width:48px" ${dis(trava)}></td><td><input aria-label="Nome" data-s="nome" value="${esc(s.nome)}" ${dis(trava)}></td><td><input type="checkbox" aria-label="Zera a nota" data-s="zera_nota" ${s.zera_nota ? 'checked' : ''} ${dis(trava)}></td><td><input aria-label="Descrição" data-s="descricao" value="${esc(s.descricao || '')}" ${dis(somenteLeitura())}></td><td>${trava ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-acao="rem-situacao" aria-label="Remover">✕</button>'}</td></tr>`,
      )
      .join(
        '',
      )}</tbody></table>${trava ? '' : '<button type="button" class="btn btn-sm" data-acao="add-situacao">+ Situação</button>'}
  </div>
  <div class="editor-escala"><b class="small">Aspectos avaliados</b> <span class="small muted">· total máximo: <b>${fmtN(max)}</b> pontos</span>
    ${q.aspectos
      .map(
        (
          a,
          ai,
        ) => `<div data-aspecto="${ai}" style="border-top:1px solid var(--c-borda);padding-top:8px;margin-top:8px">
        <div class="linha-campos"><div class="campo" style="margin:0"><label>Código</label><input data-a="codigo" value="${esc(a.codigo)}" maxlength="6" ${dis(trava)}></div><div class="campo" style="margin:0"><label>Nome</label><input data-a="nome" value="${esc(a.nome)}" ${dis(trava)}></div></div>
        <div class="campo" style="margin:4px 0"><label>Sobre o aspecto</label><input data-a="descricao" value="${esc(a.descricao || '')}" ${dis(somenteLeitura())}></div>
        <table><thead><tr><th>Nível</th><th>Pontos</th><th>Descrição</th><th></th></tr></thead><tbody>${a.niveis.map((n, i) => linhaNiveis(n, i, { credito: false, trava })).join('')}</tbody></table>
        ${trava ? '' : `<button type="button" class="btn btn-sm" data-acao="add-nivel-asp">+ Nível</button> <button type="button" class="btn btn-sm btn-perigo" data-acao="rem-aspecto">Remover aspecto</button>`}
      </div>`,
      )
      .join('')}
    ${trava ? '' : '<p style="margin-top:8px"><button type="button" class="btn btn-sm" data-acao="add-aspecto">+ Aspecto</button></p>'}
  </div>`;
}

function linhaQuestao(q) {
  const pai = ehPai(q);
  const trava = travaEstrutura();
  const ro = somenteLeitura();
  const aberto = estado.abertos.has(q.chave);
  const gab =
    q.tipo === 'objetiva' && !pai
      ? `<div class="btn-grupo" role="group" aria-label="Gabarito de ${esc(q.codigo)}">${LETRAS.slice(
          0,
          q.num_alternativas,
        )
          .split('')
          .map(
            (l) =>
              `<button type="button" class="btn btn-letra" data-acao="gab" data-letra="${l}" aria-pressed="${q.gabarito === l}" ${dis(ro)}>${l}</button>`,
          )
          .join('')}</div>`
      : pai
        ? `<span class="small muted">Desdobrada em ${filhos(q)
            .map((f) => esc(f.codigo))
            .join(' + ')}</span>`
        : `<span class="small muted">${q.tipo === 'escalar' ? `${q.niveis.length} níveis` : `${q.aspectos.length} aspectos · ${q.situacoes.length} situações`}</span>`;
  return `<div class="questao-linha ${q.pai_chave ? 'sub' : ''}" data-chave="${q.chave}">
    <input class="codigo" aria-label="Código" data-campo="codigo" value="${esc(q.codigo)}" ${dis(trava)}>
    <select aria-label="Tipo de ${esc(q.codigo)}" data-campo="tipo" ${dis(trava || pai || q.pai_chave)}>${Object.entries(
      TIPOS,
    )
      .map(([k, v]) => `<option value="${k}" ${q.tipo === k ? 'selected' : ''}>${v}</option>`)
      .join('')}</select>
    <div class="gab-col">${gab}</div>
    ${pai ? '<span></span>' : `<input aria-label="Peso de ${esc(q.codigo)}" title="Peso" data-campo="peso" type="number" step="0.25" min="0" value="${q.peso}" ${dis(ro)}>`}
    <input aria-label="Habilidade BNCC de ${esc(q.codigo)}" placeholder="Habilidade" data-campo="habilidade_bncc" value="${esc(q.habilidade_bncc || '')}" ${dis(ro)}>
    <div class="btn-grupo">
      <button type="button" class="btn btn-sm btn-ghost" data-acao="mais" aria-expanded="${aberto}">${aberto ? 'Menos' : 'Mais'}</button>
      ${!trava && q.tipo === 'objetiva' && !q.pai_chave && !pai ? '<button type="button" class="btn btn-sm btn-ghost" data-acao="desdobrar" title="Dividir em subitens (ex.: 09a e 09b)">Desdobrar</button>' : ''}
      ${!trava && pai ? '<button type="button" class="btn btn-sm btn-ghost" data-acao="add-sub">+ Subitem</button>' : ''}
      ${!trava ? '<button type="button" class="btn btn-sm btn-ghost btn-perigo" data-acao="remover" aria-label="Remover questão">✕</button>' : ''}
    </div>
    ${
      aberto
        ? `<div class="questao-extra">
        <div class="campo" style="margin:0"><label>Descritor</label><input data-campo="descritor" value="${esc(q.descritor || '')}" ${dis(ro)}></div>
        <div class="campo" style="margin:0"><label>Código do item</label><input data-campo="item_codigo" value="${esc(q.item_codigo || '')}" ${dis(ro)}></div>
        <div class="campo" style="margin:0"><label>Enunciado (resumo)</label><input data-campo="enunciado_resumo" value="${esc(q.enunciado_resumo || '')}" ${dis(ro)}></div>
        ${q.tipo === 'objetiva' && !pai ? `<div class="campo" style="margin:0"><label>Nº de alternativas</label><input type="number" min="2" max="10" data-campo="num_alternativas" value="${q.num_alternativas}" ${dis(trava)}></div>` : ''}
        ${!pai ? `<label class="check"><input type="checkbox" data-campo="anulada" ${q.anulada ? 'checked' : ''} ${dis(ro)}> Questão anulada</label>` : ''}
      </div>`
        : ''
    }
    ${!pai && q.tipo === 'escalar' && (aberto || !q.id) ? editorEscalar(q, trava) : ''}
    ${!pai && q.tipo === 'producao_texto' && (aberto || !q.id) ? editorTexto(q, trava) : ''}
  </div>`;
}

function passo2() {
  const ro = somenteLeitura();
  const trava = travaEstrutura();
  const avisos = [];
  if (ro)
    avisos.push(
      '<div class="alerta">Modo consulta: somente o autor da avaliação ou o administrador podem editar.</div>',
    );
  else if (trava)
    avisos.push(
      '<div class="alerta aviso"><b>Já existem respostas lançadas.</b> Alterações estruturais estão bloqueadas; você pode corrigir gabarito, peso e anulação — as pontuações serão recalculadas.</div>',
    );
  raiz.innerHTML = `${avisos.join('')}
    ${estado.av.disciplinas
      .map((dd) => {
        const d = disc(dd.disciplina_id);
        const qs = estado.questoes.filter((q) => q.disciplina_id === d.id);
        return `<section class="card" data-disc="${d.id}">
          <div class="pagina-topo" style="margin-bottom:8px"><div><h2 style="margin:0">${esc(d.nome)} <span class="muted small">${qs.filter((q) => !ehPai(q)).length} itens · ${fmtN(totalPesos(d.id))} pontos</span></h2></div>
          ${
            trava
              ? ''
              : `<div class="acoes">
            <label class="sr-only" for="n_${d.id}">Quantidade</label><input id="n_${d.id}" type="number" min="1" max="100" value="${qs.length ? 5 : 16}" style="width:72px">
            <button type="button" class="btn btn-sm" data-acao="gerar">Gerar objetivas</button>
            <select aria-label="Adicionar questão de tipo" data-acao-select="adicionar" class="btn-sm" style="width:auto"><option value="">+ Adicionar…</option><option value="objetiva">Objetiva</option><option value="escalar">Escalar</option><option value="producao_texto">Produção de texto</option></select>
          </div>`
          }</div>
          ${qs.length ? `<div class="questao-linha small muted" aria-hidden="true" style="border:0"><span>Código</span><span>Tipo</span><span>Gabarito</span><span>Peso</span><span>Habilidade</span><span></span></div>` : '<p class="muted">Nenhuma questão. Use “Gerar objetivas” para criar ' + d.sigla + '01, ' + d.sigla + '02… de uma vez.</p>'}
          <div data-lista>${qs.map(linhaQuestao).join('')}</div>
        </section>`;
      })
      .join('')}
    ${
      ro
        ? ''
        : `<div class="card nao-imprimir" style="position:sticky;bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button type="button" class="btn btn-primario" id="btnSalvar">Salvar questões</button>
      <span class="status-salvo" id="statusSalvar" aria-live="polite">${estado.sujo ? 'Alterações não salvas' : ''}</span>
      <span style="flex:1"></span>
      <button type="button" class="btn" id="btnImportarGab">${'Importar gabarito'}</button>
      <button type="button" class="btn" id="btnExportarGab">Exportar gabarito</button>
      <button type="button" class="btn" id="btnRevisar">Revisar e publicar →</button>
    </div>`
    }`;
  $('#btnSalvar')?.addEventListener('click', () => salvar());
  $('#btnRevisar')?.addEventListener('click', async () => {
    if (estado.sujo && !(await salvar())) return;
    irPara('3');
  });
  $('#btnExportarGab')?.addEventListener('click', () => baixar(`/api/avaliacoes/${estado.av.id}/gabarito`));
  $('#btnImportarGab')?.addEventListener('click', importarGabarito);
}

// Delegação de eventos do passo 2
raiz.addEventListener('input', (e) => {
  if (estado.passo !== '2') return;
  const el = e.target;
  const linha = el.closest('[data-chave]');
  if (!linha) return;
  const q = estado.questoes.find((x) => x.chave === linha.dataset.chave);
  if (el.dataset.campo && !['tipo'].includes(el.dataset.campo)) {
    const c = el.dataset.campo;
    if (c === 'anulada') q.anulada = el.checked;
    else if (c === 'peso') q.peso = Number(el.value || 0);
    else if (c === 'num_alternativas') q.num_alternativas = Math.min(10, Math.max(2, Number(el.value || 4)));
    else if (c === 'codigo') q.codigo = el.value.trim();
    else q[c] = el.value;
    marcarSujo();
    return;
  }
  const nivelTr = el.closest('[data-nivel]');
  const aspDiv = el.closest('[data-aspecto]');
  if (el.dataset.n && nivelTr) {
    const lista = aspDiv ? q.aspectos[Number(aspDiv.dataset.aspecto)].niveis : q.niveis;
    const n = lista[Number(nivelTr.dataset.nivel)];
    n[el.dataset.n] =
      el.dataset.n === 'pontos'
        ? Number(el.value || 0)
        : el.dataset.n === 'codigo'
          ? el.value.toUpperCase()
          : el.value;
  } else if (el.dataset.a && aspDiv) {
    q.aspectos[Number(aspDiv.dataset.aspecto)][el.dataset.a] =
      el.dataset.a === 'codigo' ? el.value.toUpperCase() : el.value;
  } else if (el.dataset.s) {
    const s = q.situacoes[Number(el.closest('[data-situacao]').dataset.situacao)];
    s[el.dataset.s] =
      el.dataset.s === 'zera_nota'
        ? el.checked
        : el.dataset.s === 'codigo'
          ? el.value.toUpperCase()
          : el.value;
  }
  marcarSujo();
});

raiz.addEventListener('change', (e) => {
  if (estado.passo !== '2') return;
  const el = e.target;
  if (el.dataset.acaoSelect === 'adicionar' && el.value) {
    const discId = Number(el.closest('[data-disc]').dataset.disc);
    const sig = disc(discId).sigla;
    const q = novaQuestao(discId, el.value, `${sig}${String(proximoNumero(discId)).padStart(2, '0')}`);
    estado.questoes.push(q);
    estado.abertos.add(q.chave);
    marcarSujo();
    passo2();
    return;
  }
  if (el.dataset.campo === 'tipo') {
    const q = estado.questoes.find((x) => x.chave === el.closest('[data-chave]').dataset.chave);
    aplicarTipo(q, el.value);
    estado.abertos.add(q.chave);
    marcarSujo();
    passo2();
  }
  if (el.dataset.campo === 'num_alternativas') passo2();
});

raiz.addEventListener('click', (e) => {
  if (estado.passo !== '2') return;
  const b = e.target.closest('[data-acao]');
  if (!b || b.tagName === 'SELECT') return;
  const acao = b.dataset.acao;
  const secao = b.closest('[data-disc]');
  const linha = b.closest('[data-chave]');
  const q = linha ? estado.questoes.find((x) => x.chave === linha.dataset.chave) : null;
  if (acao === 'gerar') {
    const discId = Number(secao.dataset.disc);
    const n = Math.min(100, Math.max(1, Number($(`#n_${discId}`).value || 1)));
    const sig = disc(discId).sigla;
    let inicio = proximoNumero(discId);
    for (let i = 0; i < n; i++)
      estado.questoes.push(novaQuestao(discId, 'objetiva', `${sig}${String(inicio++).padStart(2, '0')}`));
    marcarSujo();
    return passo2();
  }
  if (!q) return;
  const redesenhar = () => {
    marcarSujo();
    passo2();
    $(`[data-chave="${q.chave}"] [data-acao="${acao}"]`)?.focus();
  };
  switch (acao) {
    case 'gab':
      q.gabarito = q.gabarito === b.dataset.letra ? null : b.dataset.letra;
      $$('[data-acao=gab]', linha).forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.letra === q.gabarito)),
      );
      return marcarSujo();
    case 'mais':
      estado.abertos.has(q.chave) ? estado.abertos.delete(q.chave) : estado.abertos.add(q.chave);
      return redesenhar();
    case 'remover': {
      const remover = new Set([q.chave, ...filhos(q).map((f) => f.chave)]);
      estado.questoes = estado.questoes.filter((x) => !remover.has(x.chave));
      marcarSujo();
      return passo2();
    }
    case 'desdobrar': {
      const peso = Number(q.peso || 1) / 2;
      const subs = ['a', 'b'].map((l) => ({
        ...novaQuestao(q.disciplina_id, 'objetiva', `${q.codigo}${l}`),
        pai_chave: q.chave,
        peso,
        habilidade_bncc: q.habilidade_bncc,
        descritor: q.descritor,
      }));
      q.gabarito = null;
      inserirApos(q, subs);
      return redesenhar();
    }
    case 'add-sub': {
      const fs = filhos(q);
      const letra = String.fromCharCode(97 + fs.length);
      inserirApos(q, [
        {
          ...novaQuestao(q.disciplina_id, 'objetiva', `${q.codigo}${letra}`),
          pai_chave: q.chave,
          peso: fs[0]?.peso ?? 0.5,
        },
      ]);
      return redesenhar();
    }
    case 'add-nivel': {
      const prox = LETRAS[q.niveis.length] || 'Z';
      q.niveis.push({ codigo: prox, codigo_alt: '', credito: 'nenhum', pontos: 0, descricao: '' });
      return redesenhar();
    }
    case 'rem-nivel': {
      const asp = b.closest('[data-aspecto]');
      const lista = asp ? q.aspectos[Number(asp.dataset.aspecto)].niveis : q.niveis;
      lista.splice(Number(b.closest('[data-nivel]').dataset.nivel), 1);
      return redesenhar();
    }
    case 'add-nivel-asp': {
      const a = q.aspectos[Number(b.closest('[data-aspecto]').dataset.aspecto)];
      a.niveis.push({ codigo: LETRAS[a.niveis.length] || 'Z', pontos: 0, descricao: '' });
      return redesenhar();
    }
    case 'add-aspecto':
      q.aspectos.push({
        id: null,
        codigo: `A${q.aspectos.length + 1}`,
        nome: '',
        descricao: '',
        niveis: [
          { codigo: 'A', pontos: 1, descricao: '' },
          { codigo: 'B', pontos: 0, descricao: '' },
        ],
      });
      return redesenhar();
    case 'rem-aspecto':
      q.aspectos.splice(Number(b.closest('[data-aspecto]').dataset.aspecto), 1);
      return redesenhar();
    case 'add-situacao':
      q.situacoes.push({
        codigo: LETRAS[q.situacoes.length] || 'Z',
        nome: '',
        descricao: '',
        zera_nota: true,
      });
      return redesenhar();
    case 'rem-situacao':
      q.situacoes.splice(Number(b.closest('[data-situacao]').dataset.situacao), 1);
      return redesenhar();
    default:
  }
});

function payload(confirmar = false) {
  // Ordem: por disciplina, mantendo a sequência da tela (subitens logo após a mãe)
  const porDisc = estado.av.disciplinas.flatMap((d) =>
    estado.questoes.filter((q) => q.disciplina_id === d.disciplina_id),
  );
  return {
    disciplinas: estado.av.disciplinas.map((d) => ({
      disciplina_id: d.disciplina_id,
      data_aplicacao: d.data_aplicacao || null,
    })),
    questoes: porDisc.map((q, i) => ({
      ...q,
      ordem: i + 1,
      peso: ehPai(q) ? 1 : Number(q.peso || 0),
      gabarito: q.tipo === 'objetiva' && !ehPai(q) ? q.gabarito : null,
      niveis: q.tipo === 'escalar' ? q.niveis : [],
      situacoes: q.tipo === 'producao_texto' ? q.situacoes : [],
      aspectos: q.tipo === 'producao_texto' ? q.aspectos : [],
    })),
    confirmar,
  };
}

async function salvar(confirmarRecalc = false) {
  const st = $('#statusSalvar');
  if (st) {
    st.className = 'status-salvo salvando';
    st.textContent = 'Salvando…';
  }
  try {
    const r = await api(`/api/avaliacoes/${estado.av.id}/estrutura`, {
      method: 'PUT',
      body: payload(confirmarRecalc),
    });
    const atual = await api(`/api/avaliacoes/${estado.av.id}`);
    estado.questoes = atual.questoes;
    estado.perm = atual.permissoes;
    estado.sujo = false;
    toast(
      r.recalculadas
        ? `Questões salvas. ${r.recalculadas} pontuação(ões) recalculada(s).`
        : 'Questões salvas.',
      'ok',
    );
    if (estado.passo === '2') passo2();
    const st2 = $('#statusSalvar');
    if (st2) {
      st2.className = 'status-salvo ok';
      st2.textContent = `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return true;
  } catch (err) {
    if (err.status === 409 && err.detalhes?.precisaConfirmacao) {
      const ok = await confirmar(
        'Recalcular pontuações?',
        `Já existem respostas lançadas. As alterações abaixo serão aplicadas e todas as pontuações recalculadas (fica registrado na auditoria):<br><br>${err.detalhes.alteracoes.map((a) => `• ${esc(a)}`).join('<br>')}`,
        { texto: 'Confirmar e recalcular' },
      );
      if (ok) return salvar(true);
    } else {
      const det = err.detalhes?.estruturais
        ? `${err.message} (${err.detalhes.estruturais.join('; ')})`
        : err.detalhes && typeof err.detalhes === 'object'
          ? `${err.message} ${Object.values(err.detalhes)
              .filter((x) => typeof x === 'string')
              .join(' ')}`
          : err.message;
      toast(det, 'erro');
    }
    if (st) {
      st.className = 'status-salvo erro';
      st.textContent = 'Erro ao salvar — tente novamente';
    }
    return false;
  }
}

async function importarGabarito() {
  const r = await modal({
    titulo: 'Importar gabarito',
    html: `<p class="muted">Planilha no layout do <b>modelo_gabarito.xlsx</b>: aba <i>Gabarito</i> (Questão, Disciplina, Tipo, Gabarito, Peso, Habilidade, Descritor) e, opcionalmente, <i>Escalas</i> e <i>Situacoes</i>. O conteúdo é carregado no editor para você revisar antes de salvar.</p>
      <div class="campo"><label for="arqGab">Arquivo (.xlsx ou .csv)</label><input type="file" id="arqGab" accept=".xlsx,.csv"></div>`,
    botoes: [
      { texto: 'Cancelar', valor: false },
      { texto: 'Carregar', classe: 'btn-primario', valor: (m) => $('#arqGab', m).files[0] || null },
    ],
  });
  if (!r) return;
  const fd = new FormData();
  fd.append('arquivo', r);
  try {
    const res = await api(`/api/avaliacoes/${estado.av.id}/gabarito/importar`, { method: 'POST', form: fd });
    estado.questoes = res.questoes;
    estado.av.disciplinas = res.disciplinas;
    marcarSujo();
    passo2();
    toast(
      `${res.questoes.length} questões carregadas. Revise e clique em “Salvar questões”.${res.erros.length ? ` ${res.erros.length} linha(s) ignorada(s).` : ''}`,
      res.erros.length ? '' : 'ok',
    );
    if (res.erros.length)
      await modal({
        titulo: 'Linhas ignoradas',
        html: res.erros.map((x) => `<div class="small">${esc(x)}</div>`).join(''),
      });
  } catch (e) {
    toast(e.message, 'erro');
  }
}

// ---------------- Passo 3: revisar e publicar ----------------
function passo3() {
  const p = estado.perm;
  const av = estado.av;
  const blocos = av.disciplinas.map((dd) => {
    const d = disc(dd.disciplina_id);
    const qs = estado.questoes.filter((q) => q.disciplina_id === d.id && !ehPai(q));
    const semGab = qs.filter((q) => q.tipo === 'objetiva' && !q.gabarito && !q.anulada).map((q) => q.codigo);
    const porTipo = Object.keys(TIPOS)
      .map((t) => [t, qs.filter((q) => q.tipo === t).length])
      .filter(([, n]) => n);
    return `<div class="card"><h3>${esc(d.nome)} <span class="muted small">${dd.data_aplicacao ? `aplicação em ${data(dd.data_aplicacao)}` : 'sem data'}</span></h3>
      <p>${qs.length} itens · ${fmtN(totalPesos(d.id))} pontos · ${porTipo.map(([t, n]) => `${n} ${TIPOS[t].toLowerCase()}`).join(' · ')}</p>
      ${semGab.length ? `<div class="alerta aviso">Sem gabarito (não entram no cálculo): ${semGab.join(', ')}</div>` : '<div class="alerta ok">Todas as objetivas têm gabarito.</div>'}
      <div class="gabarito-grade">${qs
        .sort(ordenarCodigo)
        .map(
          (q) =>
            `<div class="item"><b>${esc(q.codigo)}</b><span class="resp">${q.anulada ? '∅' : q.tipo === 'objetiva' ? q.gabarito || '—' : q.tipo === 'escalar' ? 'Esc.' : 'Texto'}</span><span class="small muted">${esc(q.habilidade_bncc || '')} · ${fmtN(q.peso)}</span></div>`,
        )
        .join('')}</div></div>`;
  });
  const status = av.status;
  raiz.innerHTML = `
    <div class="card"><h2>Situação: <span class="tag ${status === 'publicada' ? 'ok' : status === 'rascunho' ? 'aviso' : ''}">${{ rascunho: 'Rascunho', publicada: 'Publicada', encerrada: 'Encerrada' }[status]}</span></h2>
      <p class="muted">${status === 'rascunho' ? 'Publique para que os professores da série possam lançar respostas.' : status === 'publicada' ? 'Os professores da série já podem lançar respostas.' : 'Encerrada: lançamentos bloqueados; o painel continua disponível.'}</p>
      <div class="acoes">
        ${p.podePublicar && status !== 'publicada' ? '<button class="btn btn-primario" data-status="publicada">Publicar</button>' : ''}
        ${p.podePublicar && status === 'publicada' ? '<button class="btn" data-status="encerrada">Encerrar lançamentos</button>' : ''}
        ${p.podePublicar && status !== 'rascunho' && !p.temRespostas ? '<button class="btn" data-status="rascunho">Voltar a rascunho</button>' : ''}
        ${status === 'publicada' && p.podeLancar ? `<a class="btn btn-primario" href="/lancamentos?avaliacao=${av.id}">Usar esta avaliação →</a>` : ''}
        <a class="btn" href="/avaliacoes/${av.id}">Ver gabarito / imprimir</a>
        ${p.podeDuplicar ? '<button class="btn" id="btnDuplicar">Duplicar</button>' : ''}
        ${p.podeExcluir ? '<button class="btn btn-perigo" id="btnExcluir">Excluir</button>' : ''}
      </div>
    </div>${blocos.join('')}`;
  $$('[data-status]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api(`/api/avaliacoes/${av.id}/status`, { method: 'PATCH', body: { status: b.dataset.status } });
        av.status = b.dataset.status;
        $('#edStatus') && ($('#edStatus').textContent = av.status);
        toast('Situação atualizada.', 'ok');
        passo3();
      } catch (e) {
        toast(e.message, 'erro');
      }
    }),
  );
  $('#btnExcluir')?.addEventListener('click', async () => {
    if (
      !(await confirmar(
        'Excluir avaliação',
        'A avaliação e suas respostas deixarão de aparecer. Deseja continuar?',
        { texto: 'Excluir', perigo: true },
      ))
    )
      return;
    try {
      await api(`/api/avaliacoes/${av.id}`, { method: 'DELETE' });
      estado.sujo = false;
      toastDepois('Avaliação excluída.');
      location.href = '/avaliacoes';
    } catch (e) {
      toast(e.message, 'erro');
    }
  });
  $('#btnDuplicar')?.addEventListener('click', () => duplicar(av));
}

async function duplicar(av) {
  const series =
    D.perfil === 'professor' && D.pares
      ? D.series.filter((s) => D.pares.some((p) => p.serie_id === s.id))
      : D.series;
  const r = await modal({
    titulo: 'Duplicar avaliação',
    html: `<p class="muted">Copia as questões, escalas e aspectos (sem respostas) para outro ano letivo/série.</p>
      <div class="campo"><label for="dupTitulo">Título</label><input id="dupTitulo" value="${esc(av.titulo)}"></div>
      <div class="linha-campos"><div class="campo"><label for="dupAno">Ano letivo</label><select id="dupAno">${D.anos.map((a) => `<option value="${a.id}">${a.ano}</option>`).join('')}</select></div>
      <div class="campo"><label for="dupSerie">Série</label><select id="dupSerie">${series.map((s) => `<option value="${s.id}" ${s.id === av.serie_id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></div></div>`,
    botoes: [
      { texto: 'Cancelar', valor: false },
      {
        texto: 'Duplicar',
        classe: 'btn-primario',
        valor: (m) => ({
          titulo: $('#dupTitulo', m).value,
          ano_letivo_id: Number($('#dupAno', m).value),
          serie_id: Number($('#dupSerie', m).value),
        }),
      },
    ],
  });
  if (!r) return;
  try {
    const nova = await api(`/api/avaliacoes/${av.id}/duplicar`, { method: 'POST', body: r });
    toastDepois('Avaliação duplicada como rascunho.');
    location.href = `/avaliacoes/${nova.id}/editar?passo=2`;
  } catch (e) {
    toast(e.message, 'erro');
  }
}

irPara(estado.passo);
