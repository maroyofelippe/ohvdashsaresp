import { $$, drawer, dadosJson, toastDepois } from './lib/ui.js';
import { api } from './lib/api.js';

const d = dadosJson('dadosTurmas');
const CFG = {
  turma: {
    titulo: 'Turma',
    url: '/api/estrutura/turmas',
    campos: [
      {
        nome: 'ano_letivo_id',
        rotulo: 'Ano letivo',
        tipo: 'select',
        opcoes: d.anos.map((a) => ({ valor: a.id, rotulo: a.ano })),
        obrigatorio: true,
      },
      {
        nome: 'serie_id',
        rotulo: 'Série',
        tipo: 'select',
        opcoes: d.series.map((s) => ({ valor: s.id, rotulo: s.nome })),
        obrigatorio: true,
      },
      {
        nome: 'letra',
        rotulo: 'Letra',
        ajuda: 'Ex.: A, B, C',
        obrigatorio: true,
        attrs: 'maxlength="3" autocapitalize="characters"',
      },
      {
        nome: 'periodo',
        rotulo: 'Período',
        tipo: 'select',
        opcoes: [
          { valor: 'manha', rotulo: 'Manhã' },
          { valor: 'tarde', rotulo: 'Tarde' },
          { valor: 'integral', rotulo: 'Integral' },
        ],
      },
    ],
  },
  ano: {
    titulo: 'Ano letivo',
    url: '/api/estrutura/anos',
    campos: [
      {
        nome: 'ano',
        rotulo: 'Ano',
        tipo: 'number',
        obrigatorio: true,
        attrs: 'min="2000" max="2100"',
        valor: new Date().getFullYear(),
      },
      {
        nome: 'ativo',
        rotulo: 'Ano letivo ativo (aparece no cadastro e nos lançamentos)',
        tipo: 'checkbox',
        valor: true,
      },
    ],
  },
  serie: {
    titulo: 'Série',
    url: '/api/estrutura/series',
    campos: [
      { nome: 'nome', rotulo: 'Nome', ajuda: 'Ex.: 2º ANO', obrigatorio: true },
      {
        nome: 'etapa',
        rotulo: 'Etapa',
        tipo: 'select',
        opcoes: [
          { valor: 'EF-AI', rotulo: 'Ensino Fundamental – Anos Iniciais' },
          { valor: 'EF-AF', rotulo: 'Ensino Fundamental – Anos Finais' },
          { valor: 'EM', rotulo: 'Ensino Médio' },
        ],
      },
      { nome: 'ordem', rotulo: 'Ordem de exibição', tipo: 'number', valor: 0 },
    ],
  },
};

function abrir(tipo, reg) {
  const c = CFG[tipo];
  drawer({
    titulo: reg
      ? `Editar ${c.titulo.toLowerCase()}`
      : `Nova ${c.titulo.toLowerCase()}`.replace('Nova ano', 'Novo ano'),
    campos: c.campos,
    valores: reg || {},
    aoSalvar: async (dados) => {
      await api(reg ? `${c.url}/${reg.id}` : c.url, { method: reg ? 'PUT' : 'POST', body: dados });
      toastDepois('Salvo.');
      location.reload();
    },
  });
}
$$('[data-novo]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.novo)));
$$('[data-editar]').forEach((b) =>
  b.addEventListener('click', () => abrir(b.dataset.editar, JSON.parse(b.dataset.registro))),
);
