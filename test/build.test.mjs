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
  assert.deepEqual(r.tests.map((t) => t.id), ['T1', 'T2', 'T3', 'T4', 'T4m', 'T5', 'T6', 'T7', 'T8', 'T9', 'C1', 'P1', 'F1', 'F2', 'F3']);   // T4m: post-lock REPORT 2026-11-05
  if (v.T4m.weeks === v.T4.weeks) assert.ok(Math.abs(v.T4m.r_raw - v.T4.r) < 1e-9, 'T4m on the same weeks reproduces T4\'s r');
  if (v.T4m.since_fee_switch) { const f = v.T4m.since_fee_switch; assert.ok(f.from >= '2026-02-23' && f.weeks < v.T4m.weeks && f.to === v.T4m.to, 'the fee-switch window is the tail of the T4m weeks'); }
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
  // keep only the real snapshots from before the window (the collector's own 11-02+ snapshots are committed now and would
  // otherwise be picked instead of the synthetic ones below)
  const sp = path.join(tmp, 'data', 'snapshots.jsonl');
  fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').split('\n').filter((l) => l.trim() && JSON.parse(l).at < '2026-11-02T00:00:00Z').map((l) => l + '\n').join(''));
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

// ---------- golden tests (screen 11-03 #6): the scored rules T1–T4 and the C1 arithmetic on SYNTHETIC inputs, with every
// expected value worked out by hand in the comments (literals, not re-computed), so `node --test` shows each number is
// computed as THESIS.md states, independently of the live data. Days 2025-01-01 → 2026-11-04 (the last day).
const DAYS = [];
for (let t = Date.parse('2025-01-01T00:00:00Z'); t <= Date.parse('2026-11-04T00:00:00Z'); t += 86400e3) DAYS.push(new Date(t).toISOString().slice(0, 10));
const llama = (f) => ({ fetched_at: 'synthetic', url: 'synthetic', body: { totalDataChart: DAYS.filter((d) => f(d) !== null).map((d) => [Date.parse(d + 'T00:00:00Z') / 1000, f(d)]) } });
const mondayIndex = (d) => Math.floor((Date.parse(d + 'T00:00:00Z') - Date.parse('2024-12-30T00:00:00Z')) / (7 * 86400e3)); // weeks start Monday
function synthBuild(s) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thesis-g-'));
  try {
    for (const f of ['build.mjs', 'PREREG.md', 'README.md', 'lib', 'data']) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
    const w = (rel, obj) => fs.writeFileSync(path.join(tmp, rel), JSON.stringify(obj));
    w('data/raw/defillama-near-intents-volume.json', llama(s.iv));
    w('data/raw/defillama-near-dex-volume.json', llama(s.dex));
    w('data/raw/defillama-near-intents-fees.json', llama(() => 1000));
    w('data/raw/defillama-near-chain-fees.json', llama(() => 300));
    w('data/raw/defillama-near-intents-holders-revenue.json', llama((d) => (d >= '2026-02-23' ? 100 : null)));
    w('data/raw/defillama-near-chain-revenue.json', llama(() => 10));
    const nbPath = path.join(tmp, 'data', 'nearblocks-charts.json');
    w('data/nearblocks-charts.json', { ...JSON.parse(fs.readFileSync(nbPath, 'utf8')), rows: DAYS.map((d) => ({ date: `${d}T00:00:00.000Z`, ...s.nb(d) })) });
    w('data/raw/nearblocks-stats.json', { fetched_at: 'synthetic', url: 'synthetic', body: { stats: [{ near_price: '2', market_cap: '2000000000' }] } });
    const then = 1_754_524_800_000_000_000n; // any start; "now" is exactly 100 days later
    w('data/raw/near-supply.json', { fetched_at: 'synthetic', rpc: 'synthetic',
      then: { height: 1, timestamp_ns: String(then), total_supply_yocto: '1000000000' + '0'.repeat(24) },          // 1,000,000,000 NEAR
      now: { height: 2, timestamp_ns: String(then + 100n * 86_400_000_000_000n), total_supply_yocto: '1001000000' + '0'.repeat(24) }, // +1,000,000 NEAR
      buyback_wallet: { account: 'synthetic', balance_yocto: '12750' + '0'.repeat(24) } });                       // 12,750 NEAR
    build(tmp, '--offline');
    return Object.fromEntries(JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'results.json'), 'utf8')).tests.map((t) => [t.id, t]));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
// Intents volume: 1,000/day in 2025-01, 100,000/day until 2026-08-06, 200,000/day in the last 90 days (2026-08-07 → 11-04).
const ivA = (d) => (d < '2025-02-01' ? 1000 : d < '2026-08-07' ? 100_000 : 200_000);
// NearBlocks: 4M txns and 1M active accounts a day in 2025-01; 1M and 400K in 2026-10 (the last full month); 2M / 700K between.
// Price 2 from 2026-02-01 (so C1's implied NEAR is exact); earlier it alternates weekly, which only feeds T4 (not checked here).
const nbA = (d) => ({ txns: String(d < '2025-02-01' ? 4_000_000 : d.startsWith('2026-10') ? 1_000_000 : 2_000_000),
  active_accounts: String(d < '2025-02-01' ? 1_000_000 : d.startsWith('2026-10') ? 400_000 : 700_000),
  near_price: String(d >= '2026-02-01' ? 2 : 1 + 0.5 * (mondayIndex(d) % 2)) });

test('golden: T1, T2, T3 and C1 on synthetic inputs give the hand-computed values', () => {
  const t = synthBuild({ iv: ivA, dex: (d) => ivA(d) * 1.25, nb: nbA });
  // T1 — share of DEX volume over the last 6 full months (2026-05 … 2026-10) = 1/1.25 = 0.8; txns 4M → 1M = −75 %;
  // active accounts 1M → 400K = −60 %; Intents volume Oct 2026 (31 × 200,000) ÷ Jan 2025 (31 × 1,000) = 200× ⇒ PASS
  assert.deepEqual(t.T1.value.months, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  close(t.T1.value.intents_share_of_near_dex_volume_6m, 0.8, 'T1 share');
  close(t.T1.value.txns_per_day_change, -0.75, 'T1 txns');
  close(t.T1.value.active_accounts_change, -0.6, 'T1 accounts');
  close(t.T1.value.intents_volume_multiple, 200, 'T1 multiple');
  assert.equal(t.T1.pass, true);
  // T2 — last 90 days 90 × 200,000 = 18,000,000; the 90 before 90 × 100,000 = 9,000,000; ratio 2 ⇒ PASS
  assert.equal(t.T2.value.last90, 18_000_000);
  assert.equal(t.T2.value.prior90, 9_000_000);
  assert.equal(t.T2.value.ratio, 2);
  assert.equal(t.T2.pass, true);
  // T3 — chain fees 90 × 300 = 27,000 vs Intents fees 90 × 1,000 = 90,000; ratio 0.3 ≥ 0.25 ⇒ PASS (the real data FAILs)
  assert.equal(t.T3.value.near_chain_fees_90d, 27_000);
  assert.equal(t.T3.value.intents_fees_90d, 90_000);
  close(t.T3.value.ratio, 0.3, 'T3 ratio');
  assert.equal(t.T3.pass, true);
  // C1 — buyback 90 × 100 = 9,000; burn 90 × 10 = 900; shares 0.1 and 0.11 of 90,000; captured per year (9,900 × 365/90)
  // = 40,150 USD; yield 40,150 / 2e9; supply +1,000,000 NEAR in 100 days = 3,650,000 NEAR/yr = 7,300,000 USD/yr at $2;
  // buyback per year 36,500 USD ÷ 7,300,000 = 0.005; since the switch (2026-02-23 → 11-04 = 255 days) 25,500 USD
  // = 12,750 NEAR at $2, and the wallet holds 12,750 ⇒ ratio 1
  const c = t.C1.value;
  assert.deepEqual(c.window, ['2026-08-07', '2026-11-04']);
  assert.equal(c.buyback_90d, 9000);
  assert.equal(c.burn_90d, 900);
  close(c.buyback_share_of_intents_fees, 0.1, 'C1 buyback share');
  close(c.captured_share_of_intents_fees, 0.11, 'C1 captured share');
  close(c.captured_usd_per_year, 40_150, 'C1 captured/yr');
  close(c.capture_yield, 40_150 / 2e9, 'C1 yield');
  close(c.supply_span_days, 100, 'C1 span');
  close(c.net_issuance_near_per_year, 3_650_000, 'C1 issuance');
  close(c.net_issuance_usd_per_year, 7_300_000, 'C1 issuance USD');
  close(c.buyback_vs_net_issuance, 0.005, 'C1 buyback vs issuance');
  assert.equal(c.buyback_since_switch_usd, 25_500);
  close(c.buyback_near_implied_at_daily_prices, 12_750, 'C1 implied NEAR');
  close(c.buyback_wallet_vs_implied, 1, 'C1 wallet vs implied');
});

test('golden: T1 fails when any one leg misses its bar', () => {
  // same as above but active accounts only fall to 600K (−40 % > −50 %) ⇒ the other three legs pass, T1 FAILs
  const t = synthBuild({ iv: ivA, dex: (d) => ivA(d) * 1.25, nb: (d) => ({ ...nbA(d), active_accounts: String(d < '2025-02-01' ? 1_000_000 : 600_000) }) });
  close(t.T1.value.active_accounts_change, -0.4, 'T1 accounts');
  close(t.T1.value.intents_share_of_near_dex_volume_6m, 0.8, 'T1 share');
  assert.equal(t.T1.pass, false);
});

test('golden: T4 is +1 when the weekly price moves exactly with weekly volume, −1 when exactly against it', () => {
  // volume constant within each Monday-start week, cycling ×1, ×1.5, ×2 across weeks; price per day = k × volume (or k ÷ volume),
  // so the weekly log-changes are identical (or opposite) ⇒ r = +1 ⇒ PASS, r = −1 ⇒ FAIL. 95 complete weeks 2025-01-06 → 2026-10-26.
  const iv = (d) => 100_000 * [1, 1.5, 2][mondayIndex(d) % 3];
  const nb = (px) => (d) => ({ txns: '1000000', active_accounts: '100000', near_price: String(px(iv(d))) });
  const up = synthBuild({ iv, dex: (d) => iv(d) * 2, nb: nb((v) => v / 50_000) });
  close(up.T4.value.r, 1, 'T4 r up');
  assert.equal(up.T4.value.weeks, 95);
  assert.equal(up.T4.pass, true);
  const down = synthBuild({ iv, dex: (d) => iv(d) * 2, nb: nb((v) => 200_000 / v) });
  close(down.T4.value.r, -1, 'T4 r down');
  assert.equal(down.T4.pass, false);
});

// ---------- 11-05 (re-screen 3, X-1): the T9 sentence of the investment reading is computed from the quotes, never a fixed string
test('golden: the T9 sentence follows the 1Click quotes (all quoted / some / none)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thesis-t9-'));
  try {
    for (const f of ['build.mjs', 'PREREG.md', 'README.md', 'lib', 'data']) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
    const qp = path.join(tmp, 'data', 'raw', 'cross-chain-quotes.json'), q0 = JSON.parse(fs.readFileSync(qp, 'utf8'));
    const intoNear = q0.routes.find((r) => /->\s*NEAR\b/.test(r.route));
    assert.ok(intoNear, 'the quotes file has a route into NEAR');
    const run = (fn) => {
      const q = structuredClone(q0); fn(q.routes.find((r) => r.route === intoNear.route).rows.filter((r) => r.usd < 50));
      fs.writeFileSync(qp, JSON.stringify(q)); build(tmp, '--offline');
      return JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'results.json'), 'utf8')).conclusion.join(' ');
    };
    const ok = (pct) => ({ ok: true, cost_pct: pct }), no = { ok: false, http: 400, message: 'Quoting for this pair is not available' };
    assert.match(run((rows) => rows.forEach((r, i) => { r.near_intents_1click = ok([0.41, 0.52, 0.6][i] ?? 0.5); })), /Agent-size tickets into NEAR get a 1Click quote: 0\.41–0\.60% under \$50 \(T9/);
    assert.match(run((rows) => rows.forEach((r, i) => { r.near_intents_1click = i === 0 ? ok(0.7) : no; })), new RegExp(`1 of ${intoNear.rows.filter((r) => r.usd < 50).length} agent-size tickets into NEAR got a 1Click quote`));
    const none = run((rows) => rows.forEach((r) => { r.near_intents_1click = no; }));
    assert.match(none, /1Click refused all \d+ agent-size tickets \(under \$50\) on the agent's own routes \(T9\)/);
    assert.doesNotMatch(none, /do settle/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
