// node --test: unit checks of the pure helpers, invariants of the committed build, and the forward-test (F1–F3) scoring
// path on synthetic data in a temporary copy (so PREREG.md's rules are exercised before their window has any data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { svgBars, svgLine } from '../lib/charts.mjs';
import { near } from '../lib/capture.mjs';
import { QUERIES, sentence } from '../lib/sentences.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const build = (dir, ...args) => execFileSync(process.execPath, ['build.mjs', ...args], { cwd: dir, encoding: 'utf8' });

test('near() converts yoctoNEAR strings exactly to 6 decimals', () => {
  assert.equal(near('1000000000000000000000000'), 1);
  assert.equal(near('1310473021259523000000000000000000'), 1310473021.259523);
});

test('charts render without NaN and print notes for missing bars', () => {
  const bars = svgBars({ unit: '%', categories: ['$1', '$2'], series: [{ name: 'x', color: '#000', values: [1.75, null], notes: [null, 'refused'] }] });
  assert.match(bars, /1\.75%/);
  assert.match(bars, /refused/);
  assert.doesNotMatch(bars, /NaN/);
  assert.doesNotMatch(svgLine({ zero: false, time: true, series: [{ name: 'y', color: '#000', points: [['2026-10-31T12:00:00Z', 399], ['2026-10-31T13:00:00Z', 403]] }] }), /NaN/);
});

test('the committed build is reproducible: --check passes and writes nothing', () => {
  const before = fs.readFileSync(path.join(ROOT, 'dist', 'results.json'), 'utf8');
  assert.match(build(ROOT, '--check'), /CHECK OK/);
  assert.equal(fs.readFileSync(path.join(ROOT, 'dist', 'results.json'), 'utf8'), before);
});

test('committed results hold their internal invariants', () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'results.json'), 'utf8'));
  const v = Object.fromEntries(r.tests.map((t) => [t.id, t.value]));
  assert.deepEqual(r.tests.map((t) => t.id), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'C1', 'P1', 'F1', 'F2', 'F3']);
  assert.ok(Math.abs(v.T3.ratio - v.T3.near_chain_fees_90d / v.T3.intents_fees_90d) < 1e-12);
  assert.equal(v.C1.intents_fees_90d, v.T3.intents_fees_90d); // C1 and T3 cover the same 90 days
  assert.ok(Math.abs(v.C1.burn_90d / v.T3.near_chain_fees_90d - 0.7) < 0.01); // NEAR burns 70% of gas fees
  for (const x of [v.T1.intents_share_of_near_dex_volume_6m, v.T5.daily_stats_share_7d, v.T5.rpc_sample_share, v.C1.buyback_share_of_intents_fees]) assert.ok(x > 0 && x < 1);
  assert.equal(v.T8.sent_txs, v.T8.evm_sent_txs + v.T8.near_account_txs.sent);
  for (const k of Object.values(v.P1?.kinds ?? {})) if (k.n - k.unpriced > 0) assert.ok(k.share_under_10 <= k.share_under_50 && k.share_under_50 <= 1);
  for (const t of r.tests) {
    assert.ok(sentence(t).length > 20, `${t.id} has a sentence`);
    assert.ok(QUERIES[t.id]?.length, `${t.id} lists its queries`);
  }
});

test('forward tests score on synthetic window data exactly as PREREG.md says', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thesis-f-'));
  try {
  for (const f of ['build.mjs', 'PREREG.md', 'README.md', 'lib', 'data']) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
  const days = Array.from({ length: 22 }, (_, i) => new Date(Date.parse('2026-10-22T00:00:00Z') + i * 86400e3).toISOString().slice(0, 10));
  const W = (d) => d >= '2026-11-02';
  const edit = (f, fn) => { const p = path.join(tmp, f); const j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j)); };
  // F1: baseline 100M/day, window 120M/day -> PASS
  edit('data/raw/defillama-near-intents-volume.json', (j) => {
    const keep = j.body.totalDataChart.filter(([t]) => new Date(t * 1000).toISOString().slice(0, 10) < '2026-10-22');
    j.body.totalDataChart = [...keep, ...days.map((d) => [Date.parse(d + 'T00:00:00Z') / 1000, W(d) ? 120e6 : 100e6])];
  });
  // F2: share 15% in the baseline, 14% in the window -> FAIL
  edit('data/raw/nearblocks-intents-daily-txns.json', (j) => { j.body.data = [...j.body.data.filter((r) => r.date < '2026-10-22'), ...days.map((d) => ({ account: 'intents.near', date: d, txns: String(W(d) ? 140000 : 150000) }))]; });
  edit('data/nearblocks-charts.json', (j) => { j.rows = [...j.rows.filter((r) => r.date.slice(0, 10) < '2026-10-22'), ...days.map((d) => ({ date: `${d}T00:00:00.000Z`, txns: '1000000' }))]; });
  // F3: listings keyed by agent_id; a removed listing is ignored, a new one counts all its jobs.
  // first part (5 days): a 10 -> 20 = 10 jobs = 2/day; second part (6 days): a 20 -> 32 + new 6 = 18 jobs = 3/day -> PASS
  const snap = (at, m) => JSON.stringify({ v: 1, at, agent_market: { agents: 3, delivered_jobs_total: 0, delivered_by_agent: m } });
  fs.appendFileSync(path.join(tmp, 'data', 'snapshots.jsonl'), [snap('2026-11-02T00:07:00.000Z', { a: 10, gone: 50 }), snap('2026-11-07T00:07:00.000Z', { a: 20 }),
    snap('2026-11-13T00:07:00.000Z', { a: 32, b: 6 })].join('\n') + '\n');
  build(tmp, '--offline');
  const f = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'results.json'), 'utf8')).tests.filter((t) => t.id[0] === 'F').map((t) => [t.id, t]));
  assert.equal(f.F1.pass, true);
  assert.equal(f.F2.pass, false);
  assert.equal(f.F3.value.jobs_per_day_first, 2);
  assert.equal(f.F3.value.jobs_per_day_second, 3);
  assert.equal(f.F3.pass, true);
  // a final snapshot more than 3 h late is never used: F3 goes back to pending (not estimated)
  const lines = fs.readFileSync(path.join(tmp, 'data', 'snapshots.jsonl'), 'utf8').replace('2026-11-13T00:07:00.000Z', '2026-11-13T03:30:00.000Z');
  fs.writeFileSync(path.join(tmp, 'data', 'snapshots.jsonl'), lines);
  build(tmp, '--offline');
  const f3 = JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'results.json'), 'utf8')).tests.find((t) => t.id === 'F3');
  assert.equal(f3.pass, null);
  assert.equal(f3.value.status, 'pending');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); } // never leave copies in the temp dir, even on failure
});
