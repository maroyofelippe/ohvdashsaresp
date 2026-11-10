const { Configuracao } = require('../models');

const PADRAO = {
  governo: 'GOVERNO DO ESTADO DE SÃO PAULO',
  secretaria: 'SECRETARIA DE ESTADO DA EDUCAÇÃO',
  diretoria: 'UNIDADE REGIONAL DE ENSINO – REGIÃO CENTRO',
  escola: 'E. E. Prof. Orlando Horácio Vita',
  municipio: 'São Paulo – SP',
  codigo_cie: '037746',
  endereco: 'Rua Diogo Cabrera, 424 – Imirim – São Paulo – SP – CEP 02467-060',
  telefone: '(11) 2256-5743',
  email: 'e0037746a@educacao.sp.gov.br',
  logotipo: '/img/cabecalho.png',
};
const CHAVES = Object.keys(PADRAO);
let cache = null;

async function obterTodas() {
  if (cache) return cache;
  const linhas = await Configuracao.findAll({ raw: true });
  const cfg = { ...PADRAO };
  for (const l of linhas) if (CHAVES.includes(l.chave)) cfg[l.chave] = l.valor ?? '';
  cache = cfg;
  return cfg;
}

async function salvar(valores) {
  for (const k of CHAVES) {
    if (valores[k] === undefined) continue;
    await Configuracao.upsert({ chave: k, valor: String(valores[k] ?? '').trim() });
  }
  cache = null;
  return obterTodas();
}

function limparCache() {
  cache = null;
}

module.exports = { obterTodas, salvar, limparCache, CHAVES, PADRAO };
