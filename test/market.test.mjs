// lib/market.mjs (T4m, 2026-11-05): beta, the market-controlled correlation and the permutation p-value on synthetic weeks
// with known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beta, blockPermP, corr, marketControlled, permP, rng } from '../lib/market.mjs';

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
