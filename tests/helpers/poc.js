// Porte fiel das funções de cálculo da PoC (SARESP_OHV_Dashboard.html v3.1) para conferência.
const SIT_PONTUA = 'A';
const maxEsc = (e) => (e || []).reduce((m, x) => Math.max(m, +x.pts || 0), 0);
const maxTexto = (q) => q.aspectos.reduce((s, a) => s + maxEsc(a.escala), 0);
function ativa(q) {
  if (q.tipo === 'obj') return !!q.gab;
  if (q.tipo === 'esc') return maxEsc(q.escala) > 0;
  return (q.aspectos || []).length > 0 && maxTexto(q) > 0;
}
const respondeu = (r, disc) => Object.keys(r).some((k) => r[k] && k.startsWith(disc));
const correta = (q, v) =>
  q.tipo === 'obj' && !!q.gab && !!v && String(v).toUpperCase() === String(q.gab).toUpperCase();
function sitTexto(q, r) {
  const s = r[`${q.code}S`];
  if (s) return s;
  return q.aspectos.some((a) => r[q.code + a.id]) ? 'A' : '';
}
function pontuar(q, r) {
  if (q.tipo === 'obj') {
    const v = r[q.code];
    return v ? { frac: correta(q, v) ? 1 : 0 } : { frac: 0 };
  }
  if (q.tipo === 'esc') {
    const v = r[q.code];
    if (!v) return { frac: 0 };
    const e = (q.escala || []).find((x) => x.c === v);
    const m = maxEsc(q.escala);
    return { frac: e && m ? (+e.pts || 0) / m : 0 };
  }
  const s = sitTexto(q, r);
  const mx = maxTexto(q);
  if (!s || s !== SIT_PONTUA) return { frac: 0 };
  let p = 0;
  q.aspectos.forEach((a) => {
    const e = a.escala.find((x) => x.c === r[q.code + a.id]);
    if (e) p += +e.pts || 0;
  });
  return { frac: mx ? p / mx : 0 };
}
function desempenho(questoes, r) {
  const out = { LP: { ac: 0, tot: 0, part: false }, MT: { ac: 0, tot: 0, part: false } };
  ['LP', 'MT'].forEach((d) => {
    out[d].part = respondeu(r, d);
    if (!out[d].part) return;
    questoes.forEach((q) => {
      if (q.disc !== d || !ativa(q)) return;
      const w = +q.peso || 0;
      out[d].tot += w;
      out[d].ac += w * pontuar(q, r).frac;
    });
  });
  const ac = out.LP.ac + out.MT.ac;
  const tot = out.LP.tot + out.MT.tot;
  return { ...out, ac, tot, p: tot ? ac / tot : NaN, part: out.LP.part || out.MT.part };
}
function kpis(json, turma) {
  const al = json.alunos.filter((a) => !turma || a.turma === turma);
  const desemp = al
    .map((a) => ({ a, d: desempenho(json.questoes, json.resp[a.id] || {}) }))
    .filter((x) => x.d.part && x.d.tot);
  const media = desemp.reduce((s, x) => s + x.d.p, 0) / desemp.length;
  const md = (d) => {
    const l = desemp.filter((x) => x.d[d].part && x.d[d].tot);
    return l.length ? l.reduce((s, x) => s + x.d[d].ac / x.d[d].tot, 0) / l.length : NaN;
  };
  const rk = desemp
    .slice()
    .sort((a, b) => b.d.ac - a.d.ac || b.d.p - a.d.p || a.a.nome.localeCompare(b.a.nome, 'pt'));
  return {
    avaliados: desemp.length,
    media,
    mLP: md('LP'),
    mMT: md('MT'),
    acima: desemp.filter((x) => x.d.p >= 0.7).length,
    abaixo: desemp.filter((x) => x.d.p < 0.5).length,
    ranking: rk.map((x) => ({ nome: x.a.nome, ac: x.d.ac })),
  };
}
module.exports = { kpis };
