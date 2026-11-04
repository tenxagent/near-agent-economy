// The re-runnable model (lib/model.mjs): formulas on a hand-checkable base, edge cases, and the committed build's inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { baseFrom, project, quarterLabel, grid, summary, BAR } from '../lib/model.mjs';

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

test('the committed build: model inputs come from C1/T2 and today matches C1 buyback ÷ issuance', () => {
  const r = JSON.parse(fs.readFileSync(new URL('../dist/results.json', import.meta.url), 'utf8'));
  const v = Object.fromEntries(r.tests.map((t) => [t.id, t.value]));
  if (!v.C1 || !v.T2) return;   // an offline build without capture data has no model
  const s = summary(baseFrom(v.C1, v.T2));
  assert.ok(Math.abs(s.default.coverage_now - v.C1.buyback_vs_net_issuance) < 0.005);
  assert.equal(BAR, 0.5);
});
