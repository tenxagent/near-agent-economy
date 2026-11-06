// The re-runnable model (lib/model.mjs): formulas on a hand-checkable base, edge cases, and the committed build's inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { baseFrom, project, quarterLabel, grid, summary, BAR, growthHistory } from '../lib/model.mjs';

const base = { window_end: '2026-11-03', captured_usd_per_year: 20e6, captured_share: 0.25, net_issuance_near_per_year: 40e6, near_price_usd: 2, growth_90d: 2 };
// coverage now = 20e6 / 2 / 40e6 = 0.25

test('coverage today = buyback NEAR per year ÷ net new NEAR per year', () => {
  assert.equal(project(base).rows[0].coverage, 0.25);
});

test('no growth (half-life 0) keeps coverage flat and never reaches the bar', () => {
  const r = project(base, { halfLife: 0 });
  assert.ok(r.rows.every((x) => x.coverage === 0.25));
  assert.equal(r.quartersToHalf, null);
});

test('growth that never fades doubles each quarter here: ½ after 1 quarter, all after 2', () => {
  const r = project(base, { halfLife: Infinity });
  assert.equal(r.rows[1].coverage, 0.5);
  assert.equal(r.quartersToHalf, 1);
  assert.equal(r.quartersToFull, 2);
});

test('the fade halves the excess growth every halfLife quarters', () => {
  const r = project(base, { halfLife: 1 });
  assert.equal(r.rows[1].growth, 1.5);    // e0 = 1, ×0.5^1
  assert.equal(r.rows[2].growth, 1.25);   // ×0.5^2
});

test('capture overrides the share proportionally; price growth lowers coverage', () => {
  assert.equal(project(base, { capture: 0.5, halfLife: 0 }).rows[0].coverage, 0.5);
  const up = project(base, { halfLife: 0, priceQ: 1 });
  assert.equal(up.rows[1].coverage, 0.125);
});

test('quarter labels count from the window end', () => {
  assert.equal(quarterLabel('2026-11-03', 0), '2026-Q4');
  assert.equal(quarterLabel('2026-11-03', 4), '2027-Q4');
  assert.equal(quarterLabel('2026-11-03', null), null);
});

test('the grid is monotone: a bigger buyback share never takes longer', () => {
  for (const row of grid(base)) {
    const qs = row.cells.map((c) => c.quartersToHalf ?? Infinity);
    for (let i = 1; i < qs.length; i++) assert.ok(qs[i] <= qs[i - 1]);
  }
});

test('the grid answers the same question as the headline: every cell uses the run\'s price, resold and issuance settings', () => {
  const opts = { priceQ: 0.05, resold: 0.3, issuance: 'hsp029', rampStartQ: 2 };
  const g = grid({ ...base, burn_near_per_year: base.burn_near_per_year ?? 1e6 }, opts);
  for (const row of g) for (const c of row.cells) {
    const r = project({ ...base, burn_near_per_year: base.burn_near_per_year ?? 1e6 }, { ...opts, halfLife: row.halfLife, capture: c.capture });
    assert.deepEqual([c.quartersToHalf, c.quartersToFull], [r.quartersToHalf, r.quartersToFull]);
  }
  assert.deepEqual(grid(base, 0.05), grid(base, { priceQ: 0.05 }));   // a bare number is still the price
  const plain = grid(base), hsp = grid({ ...base, burn_near_per_year: 1e6 }, { issuance: 'hsp029' });
  assert.ok(hsp.some((row, i) => row.cells.some((c, j) => c.quartersToHalf !== plain[i].cells[j].quartersToHalf)));   // the flag changes the grid
});

test('the committed build: model inputs come from C1/T2 and today matches C1 buyback ÷ issuance', () => {
  const r = JSON.parse(fs.readFileSync(new URL('../dist/results.json', import.meta.url), 'utf8'));
  const v = Object.fromEntries(r.tests.map((t) => [t.id, t.value]));
  if (!v.C1 || !v.T2) return;   // an offline build without capture data has no model
  const s = summary(baseFrom(v.C1, v.T2));
  assert.ok(Math.abs(s.default.coverage_now - v.C1.buyback_vs_net_issuance) < 0.005);
  assert.equal(BAR, 0.5);
});

test('--resold scales coverage: half the bought-back NEAR returning halves it', () => {
  assert.equal(project(base, { halfLife: 0, resold: 0.5 }).rows[0].coverage, 0.125);
});

test('growth history: quarter ratios oldest first, and the implied half-life of the fade', () => {
  // 900 days; daily volume doubles every 90 days for the first 450 days, then grows 1.2× per 90 days
  const daily = [];
  for (let i = 0; i < 900; i++) {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10);
    const v = i < 450 ? Math.pow(2, i / 90) : Math.pow(2, 5) * Math.pow(1.2, (i - 450) / 90);
    daily.push([d, v]);
  }
  const h = growthHistory(daily, daily.at(-1)[0]);
  assert.ok(h.quarters.length >= 8);
  assert.ok(Math.abs(h.quarters.at(-1).ratio - 1.2) < 0.01);                  // latest quarter: 1.2×
  assert.ok(Math.abs(h.quarters[0].ratio - 2) < 0.01);                        // oldest full quarter: 2×
  assert.ok(h.impliedHalfLife > 0 && h.impliedHalfLife < 10);                 // excess fell from 1.0 to 0.2 ⇒ a finite half-life
});

// 11-05: HSP-029 issuance ramp (post-lock REPORT). Hand-computed: net 40M + burn 4M = gross 44M NEAR/yr; buyback 10M NEAR/yr (20e6 $ / $2).
test('HSP-029: gross issuance ramps to 1.6/2.5 over 8 quarters, burn held, coverage rises only through the denominator', () => {
  const b = { ...base, burn_near_per_year: 4e6 };
  const r = project(b, { halfLife: 0, issuance: 'hsp029' });   // no growth: only the issuance path moves coverage
  assert.equal(r.rows[0].coverage, 0.25);                        // q0: 10M / 40M, unchanged
  assert.ok(Math.abs(r.rows[4].coverage - 10e6 / (44e6 * 0.82 - 4e6)) < 1e-12);   // half way: factor 1 − 0.36 × 0.5
  assert.ok(Math.abs(r.rows[8].coverage - 10e6 / 24.16e6) < 1e-12);               // end: 44M × 0.64 − 4M = 24.16M
  assert.equal(r.rows[12].coverage, r.rows[8].coverage);                           // flat after the ramp
  const late = project(b, { halfLife: 0, issuance: 'hsp029', rampStartQ: 2 });
  assert.equal(late.rows[2].coverage, 0.25);                                       // nothing changes before the ramp starts
  assert.equal(project(b, { halfLife: 0 }).rows[8].coverage, 0.25);                // default issuance 'current' is unchanged
});
