/** Cache em memória com TTL (padrão 60 s), invalidado ao lançar respostas. */
const TTL_PADRAO = 60 * 1000;
const mapa = new Map();

function obter(chave) {
  const e = mapa.get(chave);
  if (!e) return undefined;
  if (e.expira < Date.now()) {
    mapa.delete(chave);
    return undefined;
  }
  return e.valor;
}
function definir(chave, valor, ttl = TTL_PADRAO) {
  mapa.set(chave, { valor, expira: Date.now() + ttl });
  if (mapa.size > 500) mapa.delete(mapa.keys().next().value);
  return valor;
}
async function lembrar(chave, fn, ttl) {
  const v = obter(chave);
  if (v !== undefined) return v;
  return definir(chave, await fn(), ttl);
}
function limpar(prefixo) {
  if (!prefixo) return mapa.clear();
  for (const k of mapa.keys()) if (k.startsWith(prefixo)) mapa.delete(k);
}
module.exports = { obter, definir, lembrar, limpar };
