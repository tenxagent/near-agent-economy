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

/** Two-sided BLOCK-permutation p (2026-11-06, re-screen 4): shuffles the order of contiguous blocks of `block` weeks of b, so serial
 *  correlation inside a block survives the shuffle (a plain permutation assumes weeks are exchangeable, which overstates the evidence
 *  when weekly changes are autocorrelated). block = 1 is exactly permP. */
export function blockPermP(a, b, block = 4, shuffles = 10000, seed = 1) {
  if (block <= 1) return permP(a, b, shuffles, seed);
  const r0 = Math.abs(corr(a, b)), next = rng(seed), blocks = [];
  for (let i = 0; i < b.length; i += block) blocks.push(b.slice(i, i + block));
  let hits = 1;
  for (let k = 0; k < shuffles; k++) {
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    if (Math.abs(corr(a, blocks.flat())) >= r0 - 1e-15) hits++;
  }
  return hits / (shuffles + 1);
}

/** dN, dB, dI: weekly log changes of NEAR's price, BTC's price and Intents volume (same weeks, same order). */
export function marketControlled(dN, dB, dI, { shuffles = 10000, seed = 1, block = 4 } = {}) {
  if (!(dN.length === dB.length && dB.length === dI.length) || dN.length < 10) throw new Error('need ≥ 10 aligned weeks');
  const b = beta(dN, dB), mN = mean(dN), mB = mean(dB);
  const resid = dN.map((x, i) => x - mN - b * (dB[i] - mB));
  return {
    weeks_of_changes: dN.length,
    r_raw: corr(dN, dI), p_raw: permP(dN, dI, shuffles, seed),
    beta_btc: b, r2_btc: corr(dN, dB) ** 2,
    r_controlled: corr(resid, dI), p_controlled: permP(resid, dI, shuffles, seed), p_controlled_block: blockPermP(resid, dI, block, shuffles, seed),
    shuffles, seed, block,
  };
}

/** NEAR's own weekly move: the residual of dN after the OLS fit on BTC's dB (the series T4m correlates). */
export function residual(dN, dB) {
  const b = beta(dN, dB), mN = mean(dN), mB = mean(dB);
  return dN.map((x, i) => x - mN - b * (dB[i] - mB));
}

/** corr(x[t], y[t − k]) over the weeks both exist: k > 0 ⇒ y leads x by k weeks, k < 0 ⇒ x leads y. */
export function lagCorr(x, y, k) {
  const xs = [], ys = [];
  for (let t = 0; t < x.length; t++) { const u = t - k; if (u >= 0 && u < y.length) { xs.push(x[t]); ys.push(y[u]); } }
  return { k, r: corr(xs, ys), n: xs.length };
}

/** T4L (2026-11-09, post-lock REPORT): every lag from −maxLag to +maxLag, and a FAMILY-WISE p for the strongest one.
 *  Null: circular shifts of y. A shift by s turns lag k into the original lag k − s, so only shifts with 2·maxLag < s < n − 2·maxLag
 *  are used (none of them can bring back a real link that sits inside the scanned window). Each shift keeps y's own serial
 *  correlation. For each shift the max |r| over ALL scanned lags is taken; p = share of shifts (counting the observed series) whose
 *  max is ≥ the observed max. Every allowed shift is enumerated, so the result is exact and needs no seed. */
export function leadLag(x, y, maxLag = 8) {
  const n = x.length;
  if (y.length !== n || n < 4 * maxLag + 10) throw new Error(`need ≥ ${4 * maxLag + 10} aligned weeks for lags ±${maxLag}`);
  const scan = (yy) => { const lags = []; for (let k = -maxLag; k <= maxLag; k++) lags.push(lagCorr(x, yy, k)); return lags; };
  const maxAbs = (lags) => Math.max(...lags.map((l) => Math.abs(l.r)));
  const lags = scan(y), best = lags.reduce((a, l) => (Math.abs(l.r) > Math.abs(a.r) ? l : a)), obs = Math.abs(best.r);
  const nullMax = [];
  for (let s = 2 * maxLag + 1; s < n - 2 * maxLag; s++) nullMax.push(maxAbs(scan(y.map((_, i) => y[(i + s) % n]))));
  const sorted = [...nullMax].sort((a, b) => a - b), band95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  const p_fw = (1 + nullMax.filter((m) => m >= obs - 1e-15).length) / (1 + nullMax.length);
  return { max_lag: maxLag, lags, best, band95, p_fw, shifts: nullMax.length, above_band: lags.filter((l) => Math.abs(l.r) > band95).map((l) => l.k) };
}

/** Ranks 0…n−1 (T4L's rank check: the same scan on ranks, so a few extreme weeks cannot carry the result). Ties keep input order. */
export function ranks(a) {
  const r = new Array(a.length);
  a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).forEach(([, i], j) => { r[i] = j; });
  return r;
}
