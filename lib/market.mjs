// T4m (2026-11-05, post-lock REPORT): T4 with the crypto market taken out. Pure functions, no I/O (tested in test/market.test.mjs).
// NEAR's weekly log change is regressed on BTC's (OLS beta); the residual is NEAR's own move. Its correlation with Intents volume's
// weekly log change is the market-controlled r. p-values: two-sided permutation test (shuffle the volume series, keep the pairing of
// NEAR and BTC), fixed seed so every build gives the same number. Weekly returns are close to independent but not exactly; the
// permutation test assumes exchangeability, which serial correlation weakens (stated in THESIS.md).

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}

/** OLS slope of y on x. */
export function beta(y, x) {
  const my = mean(y), mx = mean(x);
  let c = 0, v = 0;
  for (let i = 0; i < x.length; i++) { c += (x[i] - mx) * (y[i] - my); v += (x[i] - mx) ** 2; }
  return c / v;
}

/** Seeded PRNG (mulberry32), so the permutation p-value is reproducible. */
export function rng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** Two-sided permutation p-value of corr(a, b): share of shuffles of b with |r| >= |observed| (counting the observed one). */
export function permP(a, b, shuffles = 10000, seed = 1) {
  const r0 = Math.abs(corr(a, b)), next = rng(seed), s = [...b];
  let hits = 1;
  for (let k = 0; k < shuffles; k++) {
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    if (Math.abs(corr(a, s)) >= r0 - 1e-15) hits++;
  }
  return hits / (shuffles + 1);
}

/** dN, dB, dI: weekly log changes of NEAR's price, BTC's price and Intents volume (same weeks, same order). */
export function marketControlled(dN, dB, dI, { shuffles = 10000, seed = 1 } = {}) {
  if (!(dN.length === dB.length && dB.length === dI.length) || dN.length < 10) throw new Error('need ≥ 10 aligned weeks');
  const b = beta(dN, dB), mN = mean(dN), mB = mean(dB);
  const resid = dN.map((x, i) => x - mN - b * (dB[i] - mB));
  return {
    weeks_of_changes: dN.length,
    r_raw: corr(dN, dI), p_raw: permP(dN, dI, shuffles, seed),
    beta_btc: b, r2_btc: corr(dN, dB) ** 2,
    r_controlled: corr(resid, dI), p_controlled: permP(resid, dI, shuffles, seed),
    shuffles, seed,
  };
}
