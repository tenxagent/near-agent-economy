// lib/market.mjs (T4m, 2026-11-05): beta, the market-controlled correlation and the permutation p-value on synthetic weeks
// with known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beta, blockPermP, corr, lagCorr, leadLag, marketControlled, permP, ranks, residual, rng } from '../lib/market.mjs';

// 60 synthetic weeks: BTC moves dB; Intents volume moves dI, built ORTHOGONAL to dB (Gram-Schmidt) so the true beta is exact.
const next = rng(7), n = 60;
const dB = Array.from({ length: n }, () => next() - 0.5);
const raw = Array.from({ length: n }, () => next() - 0.5);
const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const proj = beta(raw, dB);
const dI = raw.map((x, i) => x - m(raw) - proj * (dB[i] - m(dB)));   // mean 0, uncorrelated with dB

test('NEAR = 2 × BTC + 0.5 × volume: beta is exactly 2 and the controlled r is 1', () => {
  const dN = dB.map((x, i) => 2 * x + 0.5 * dI[i]);
  const r = marketControlled(dN, dB, dI, { shuffles: 2000 });
  assert.ok(Math.abs(r.beta_btc - 2) < 1e-12);
  assert.ok(Math.abs(r.r_controlled - 1) < 1e-12);
  assert.ok(r.p_controlled <= 1 / 2001 + 1e-12);   // no shuffle matches a perfect correlation
});

test('NEAR = 2 × BTC + noise unrelated to volume: the controlled r is small and not significant', () => {
  const noise = Array.from({ length: n }, () => (next() - 0.5) * 0.2);
  const dN = dB.map((x, i) => 2 * x + noise[i]);
  const r = marketControlled(dN, dB, dI, { shuffles: 2000 });
  assert.ok(Math.abs(r.beta_btc - 2) < 0.1);
  assert.ok(Math.abs(r.r_controlled) < 0.35);
  assert.ok(r.p_controlled > 0.01);
});

test('permutation p is reproducible (same seed, same p) and two-sided', () => {
  const a = dB, b = dI.map((x, i) => x + 0.3 * dB[i]);
  assert.equal(permP(a, b, 500, 1), permP(a, b, 500, 1));
  assert.equal(permP(a, b, 500, 1), permP(a, b.map((x) => -x), 500, 1));   // sign of r does not matter
  assert.ok(Math.abs(corr(a, b)) > 0);
});

test('refuses misaligned or too-short series', () => {
  assert.throws(() => marketControlled([1, 2], [1, 2], [1, 2]));
  assert.throws(() => marketControlled(dB, dB.slice(1), dI));
});

test('block permutation: block 1 is the plain permutation; it is reproducible; persistent series get a larger (more honest) p', () => {
  const x = dB, y = dI.map((v, i) => v + 0.2 * dB[i]);
  assert.equal(blockPermP(x, y, 1, 500, 3), permP(x, y, 500, 3));
  assert.equal(blockPermP(x, y, 4, 500, 3), blockPermP(x, y, 4, 500, 3));
  // two UNRELATED but highly persistent series (AR(1), phi 0.95): a plain permutation treats the weeks as exchangeable and is too sure
  const ar = (seed) => { const r = rng(seed); let v = 0; return Array.from({ length: 96 }, () => (v = 0.95 * v + (r() - 0.5))); };
  const a = ar(11), b = ar(12);
  assert.ok(blockPermP(a, b, 8, 2000, 1) > permP(a, b, 2000, 1));
  const m = marketControlled(dB.map((v, i) => 2 * v + 0.5 * dI[i]), dB, dI, { shuffles: 500 });
  assert.equal(m.block, 4); assert.ok(m.p_controlled_block > 0 && m.p_controlled_block <= 1);
});

// T4L (2026-11-09): lagged correlations and the family-wise circular-shift p on 96 synthetic weeks with a planted lead.
test('T4L: a link planted at lag +3 (y leads x by 3 weeks) is found at +3 and clears the family-wise band', () => {
  const g = rng(21), N = 96, y = Array.from({ length: N }, () => g() - 0.5);
  const x = y.map((_, t) => (t >= 3 ? y[t - 3] : 0) + 0.6 * (g() - 0.5));
  const L = leadLag(x, y, 8);
  assert.equal(L.best.k, 3);
  assert.equal(L.lags.length, 17);
  assert.equal(L.shifts, N - 4 * 8 - 1, 'only shifts 17…78 can never bring a lag back inside ±8');
  assert.ok(L.best.r > L.band95 && L.p_fw <= 1 / (1 + L.shifts) + 1e-12, `p_fw ${L.p_fw}`);
  assert.deepEqual(L.above_band, [3]);
  assert.equal(lagCorr(x, y, 3).n, N - 3);
});

test('T4L: on independent noise no lag clears chance, and lag 0 is the plain correlation', () => {
  const g = rng(5), N = 96, x = Array.from({ length: N }, () => g() - 0.5), y = Array.from({ length: N }, () => g() - 0.5);
  const L = leadLag(x, y, 8);
  assert.ok(L.p_fw > 0.05, `p_fw ${L.p_fw}`);
  assert.ok(Math.abs(L.lags.find((l) => l.k === 0).r - corr(x, y)) < 1e-12);
  assert.throws(() => leadLag(x.slice(0, 30), y.slice(0, 30), 8), /aligned weeks/);
});

test('residual() is the series marketControlled correlates (its r_controlled = corr(residual, dI))', () => {
  const dN = dB.map((v, i) => 1.3 * v + 0.2 * dI[i] + 0.01 * Math.sin(i));
  assert.ok(Math.abs(corr(residual(dN, dB), dI) - marketControlled(dN, dB, dI, { shuffles: 100 }).r_controlled) < 1e-12);
});

test('ranks(): 0…n−1 in value order, ties in input order', () => {
  assert.deepEqual(ranks([0.3, -1, 7, 0.3]), [1, 0, 3, 2]);
});
