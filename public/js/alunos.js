import { $, $$, drawer, modal, dadosJson, toast, toastDepois, esc } from './lib/ui.js';
import { api, baixar } from './lib/api.js';

const d = dadosJson('dadosAlunos');
$$('[data-auto-submit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));

const campos = () => [
  {
    nome: 'turma_id',
    rotulo: 'Turma',
    tipo: 'select',
    opcoes: d.turmas.map((t) => ({ valor: t.id, rotulo: t.nome })),
    obrigatorio: true,
    valor: d.turmaAtual,
  },
  {
    nome: 'numero_chamada',
    rotulo: 'Nº de chamada',
    tipo: 'number',
    obrigatorio: true,
    attrs: 'min="1" max="999"',
  },
  { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'ra', rotulo: 'RA (opcional)', attrs: 'inputmode="numeric"' },
  {
    nome: 'situacao',
    rotulo: 'Situação',
    tipo: 'select',
    opcoes: [
      { valor: 'ativo', rotulo: 'Ativo' },
      { valor: 'transferido', rotulo: 'Transferido' },
      { valor: 'remanejado', rotulo: 'Remanejado' },
    ],
  },
];

function abrir(reg) {
  drawer({
    titulo: reg ? 'Editar aluno' : 'Novo aluno',
    campos: campos(),
    valores: reg || {},
    aoSalvar: async (dados) => {
      await api(reg ? `/api/alunos/${reg.id}` : '/api/alunos', { method: reg ? 'PUT' : 'POST', body: dados });
      toastDepois('Aluno salvo.');
      location.reload();
    },
  });
}
$('#btnNovo')?.addEventListener('click', () => abrir());
$$('[data-editar-aluno]').forEach((b) =>
  b.addEventListener('click', () => abrir(JSON.parse(b.dataset.editarAluno))),
);

// ----- Importação com pré-visualização -----
$('#btnImportar')?.addEventListener('click', async () => {
  let previa = null;
  const html = `
    <p class="muted">Planilha .xlsx ou .csv com as colunas <b>Nº</b>, <b>Nome</b> e <b>RA</b> (opcional). <a href="#" id="lnkModelo">Baixar modelo</a></p>
    <div class="linha-campos">
      <div class="campo"><label for="impTurma">Turma</label><select id="impTurma">${d.turmas.map((t) => `<option value="${t.id}" ${t.id === d.turmaAtual ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="impArq">Arquivo</label><input type="file" id="impArq" accept=".xlsx,.csv"></div>
    </div>
    <fieldset class="campo" style="border:0;padding:0"><legend class="rotulo">Alunos que já existem (mesmo Nº)</legend>
      <div class="checks"><label class="check"><input type="radio" name="impModo" value="atualizar" checked> Atualizar nome/RA</label><label class="check"><input type="radio" name="impModo" value="novos"> Só incluir novos</label></div></fieldset>
    <div id="impPrevia"></div>`;
  const r = await modal({
    titulo: 'Importar alunos',
    html,
    largo: true,
    botoes: [
      { texto: 'Cancelar', valor: false },
      {
        texto: 'Importar',
        classe: 'btn-primario',
        valor: (m) => ({
          modo: $('input[name=impModo]:checked', m).value,
          turma: Number($('#impTurma', m).value),
        }),
        antes: () => {
          if (!previa) {
            toast('Escolha o arquivo e confira a pré-visualização.', 'erro');
            return false;
          }
          return true;
        },
      },
    ],
    aoAbrir: (m) => {
      $('#lnkModelo', m).addEventListener('click', (e) => {
        e.preventDefault();
        baixar('/api/alunos/modelo');
      });
      const carregar = async () => {
        const arq = $('#impArq', m).files[0];
        if (!arq) return;
        const fd = new FormData();
        fd.append('turma_id', $('#impTurma', m).value);
        fd.append('arquivo', arq);
        $('#impPrevia', m).innerHTML = '<div class="skeleton" style="min-height:120px"></div>';
        try {
          previa = await api('/api/alunos/importar/previa', { method: 'POST', form: fd });
          const rs = previa.resumo;
          $('#impPrevia', m).innerHTML = `
            <p><span class="tag ok">${rs.incluir} novos</span> <span class="tag info">${rs.atualizar} a atualizar</span> <span class="tag">${rs.iguais} sem mudança</span> <span class="tag erro">${rs.erros} com erro</span></p>
            <div class="tabela-wrap" style="max-height:300px"><table class="tabela"><thead><tr><th>Linha</th><th>Nº</th><th>Nome</th><th>RA</th><th>Situação</th></tr></thead><tbody>
            ${previa.linhas
              .map(
                (l) =>
                  `<tr class="${l.acao === 'erro' ? 'linha-erro' : l.acao === 'atualizar' ? 'linha-aviso' : ''}"><td>${l.linha}</td><td>${l.numero ?? ''}</td><td>${esc(l.nome)}${l.atual && l.acao === 'atualizar' ? `<br><span class="small muted">atual: ${esc(l.atual.nome)}</span>` : ''}</td><td>${esc(l.ra || '')}</td><td>${l.erros.length ? esc(l.erros.join('; ')) : { incluir: 'Novo', atualizar: 'Atualizar', igual: 'Sem mudança' }[l.acao]}</td></tr>`,
              )
              .join('')}</tbody></table></div>`;
        } catch (e) {
          previa = null;
          $('#impPrevia', m).innerHTML = `<div class="alerta erro">${esc(e.message)}</div>`;
        }
      };
      $('#impArq', m).addEventListener('change', carregar);
      $('#impTurma', m).addEventListener('change', carregar);
    },
  });
  if (!r || !previa) return;
  try {
    const res = await api('/api/alunos/importar/confirmar', {
      method: 'POST',
      body: {
        turma_id: r.turma,
        modo: r.modo,
        linhas: previa.linhas
          .filter((l) => !l.erros.length)
          .map((l) => ({ numero: l.numero, nome: l.nome, ra: l.ra })),
      },
    });
    toastDepois(`Importação concluída: ${res.incluidos} incluído(s), ${res.atualizados} atualizado(s).`);
    location.href = `/alunos?turma_id=${r.turma}`;
  } catch (e) {
    toast(e.message, 'erro');
  }
});
