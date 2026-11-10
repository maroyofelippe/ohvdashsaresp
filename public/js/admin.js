import {
  $,
  $$,
  drawer,
  modal,
  confirmar,
  dadosJson,
  toast,
  toastDepois,
  esc,
  mostrarErros,
} from './lib/ui.js';
import { api } from './lib/api.js';

$$('[data-auto-submit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));
const d = dadosJson('dadosAdmin');

$$('[data-aprovar]').forEach((b) =>
  b.addEventListener('click', async () => {
    try {
      await api(`/api/admin/usuarios/${b.dataset.aprovar}/aprovar`, { method: 'POST' });
      toastDepois('Conta aprovada. O usuário foi avisado por e-mail.');
      location.reload();
    } catch (e) {
      toast(e.message, 'erro');
    }
  }),
);

$$('[data-link-confirmacao]').forEach((b) =>
  b.addEventListener('click', async () => {
    try {
      const r = await api(`/api/admin/usuarios/${b.dataset.linkConfirmacao}/link-confirmacao`, {
        method: 'POST',
      });
      await modal({
        titulo: `Link de confirmação — ${b.dataset.nome}`,
        html: `<p>Copie este link e envie à pessoa (e-mail ou WhatsApp). Vale até ${esc(new Date(r.expira_em).toLocaleString('pt-BR'))} e só pode ser usado uma vez. Gerar outro link invalida este.</p>
          <input type="text" readonly id="campoLink" class="mono" style="width:100%;user-select:all" value="${esc(r.link)}">
          <p><button type="button" class="btn btn-primario" id="btnCopiarLink">Copiar link</button></p>`,
        botoes: [{ texto: 'Fechar', valor: true }],
        aoAbrir: () => {
          const campo = $('#campoLink');
          campo.select();
          $('#btnCopiarLink').addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(r.link);
            } catch {
              campo.select();
              document.execCommand('copy');
            }
            toast('Link copiado.', 'ok');
          });
        },
      });
    } catch (e) {
      toast(e.message, 'erro');
    }
  }),
);

$$('[data-editar-usuario]').forEach((b) =>
  b.addEventListener('click', () => {
    const u = JSON.parse(b.dataset.editarUsuario);
    drawer({
      titulo: `Editar ${u.nome}`,
      valores: u,
      campos: [
        ...(u.nativo
          ? [{ tipo: 'info', html: 'Administrador nativo: perfil e status não podem ser alterados.' }]
          : []),
        {
          nome: 'perfil',
          rotulo: 'Perfil',
          tipo: 'select',
          opcoes: [
            { valor: 'professor', rotulo: 'Professor' },
            { valor: 'coordenador', rotulo: 'Coordenador (somente leitura)' },
            { valor: 'admin', rotulo: 'Admin' },
          ],
        },
        {
          nome: 'status',
          rotulo: 'Status',
          tipo: 'select',
          opcoes: [
            { valor: 'ativo', rotulo: 'Ativo' },
            { valor: 'inativo', rotulo: 'Inativo' },
            { valor: 'pendente', rotulo: 'Aguardando aprovação' },
            { valor: 'pendente_email', rotulo: 'Aguardando e-mail' },
          ],
        },
        {
          nome: 'turmas',
          rotulo: 'Turmas que leciona (somente Professor)',
          tipo: 'checks',
          opcoes: d.turmas.map((t) => ({ valor: t.id, rotulo: t.nome })),
          ajuda: 'Professor lança nas turmas marcadas e visualiza todas as turmas da mesma série.',
        },
      ],
      aoSalvar: async (dados) => {
        await api(`/api/admin/usuarios/${u.id}`, { method: 'PUT', body: dados });
        toastDepois('Usuário atualizado.');
        location.reload();
      },
    });
  }),
);

$$('[data-senha]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (
      !(await confirmar(
        'Redefinir senha',
        `Gerar uma senha temporária para ${esc(b.dataset.nome)}? A pessoa terá de trocá-la no próximo acesso.`,
        { texto: 'Gerar senha' },
      ))
    )
      return;
    try {
      const r = await api(`/api/admin/usuarios/${b.dataset.senha}/senha`, { method: 'POST' });
      await modal({
        titulo: 'Senha temporária',
        html: `<p>Informe esta senha à pessoa por um canal seguro. Ela só é exibida agora.</p><p class="mono" style="font-size:20px;user-select:all">${esc(r.temporaria)}</p>`,
      });
    } catch (e) {
      toast(e.message, 'erro');
    }
  }),
);

$('#formConfig')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/admin/configuracoes', { method: 'PUT', body: dados });
    toastDepois('Configurações salvas.');
    location.reload();
  } catch (err) {
    mostrarErros(e.target, err);
  }
});

$('#formLegado')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const arq = $('#arqLegado').files[0];
  if (!arq) return toast('Selecione o arquivo .json.', 'erro');
  const fd = new FormData();
  fd.append('arquivo', arq);
  fd.append('somente_estrutura', String($('#somenteEstrutura').checked));
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  $('#relatorio').innerHTML = '<div class="card"><div class="skeleton" style="min-height:120px"></div></div>';
  try {
    const r = await api('/api/admin/legado', { method: 'POST', form: fd });
    $('#relatorio').innerHTML = `<div class="card"><h2>Importação concluída</h2>
      <ul class="lista-insights">
        <li>Avaliação: <b>${esc(r.avaliacao.titulo)}</b> (${r.avaliacaoNova ? 'criada' : 'atualizada'}) · ${r.questoes} questões</li>
        <li>Ano letivo ${r.criados.anoLetivo ? 'criado' : 'existente'} · série ${r.criados.serie ? 'criada' : 'existente'} · turmas criadas: ${r.criados.turmas.join(', ') || 'nenhuma'}</li>
        <li>Alunos: ${r.criados.alunos} novo(s), ${r.alunosAtualizados} já existente(s)</li>
        <li>Respostas gravadas: ${r.respostas} · participações: ${r.participacoes}</li>
      </ul>
      ${r.ignorados.length ? `<details><summary>${r.ignorados.length} item(ns) ignorado(s)</summary><ul class="small">${r.ignorados.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <p><a class="btn btn-primario" href="/painel?avaliacao=${r.avaliacao.id}">Abrir no painel →</a></p></div>`;
  } catch (err) {
    $('#relatorio').innerHTML =
      `<div class="alerta erro">${esc(err.message)}${err.detalhes?.erros ? `<br><span class="small">${err.detalhes.erros.map(esc).join('<br>')}</span>` : ''}</div>`;
  } finally {
    btn.disabled = false;
  }
});
