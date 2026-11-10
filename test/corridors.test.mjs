// P3: the corridor cost math and the summary the build reports, offline (no quotes are fetched).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { costPct, units, summarizeCorridors, CORRIDORS, TICKETS_USD } from '../lib/corridors.mjs';

test('costPct reads token units, across decimals', () => {
  assert.equal(costPct('100000000', 6, '99968800', 6), 0.0312);                       // 100 USDC in, 99.9688 out
  assert.equal(costPct('1000000000', 6, '999799000000000000000', 18), 0.0201);        // USDC 6 decimals -> BSC USDC 18 decimals
  assert.equal(costPct('1000000000000000000', 18, '1000000000000000000', 18), 0);
  assert.equal(costPct('0', 6, '1', 6), null);
  assert.ok(costPct('100000000', 6, '100010000', 6) < 0, 'a bonus reads as a negative cost, not clipped');
});

test('units sizes the same raw input for both APIs', () => {
  assert.equal(units(100, 1, 6), 100000000n);
  assert.equal(units(1000, 2000, 18), 500000000000000000n);
});

test('every corridor moves one asset and has both venues', () => {
  for (const c of CORRIDORS) {
    const [a, b] = c.route.split(' -> ');
    assert.equal(a.split(' ').slice(1).join(' '), b.split(' ').slice(1).join(' '), `${c.id} is same-asset`);
    assert.ok(c.from.intents && c.to.intents && c.from.chainId && c.to.chainId);
  }
  assert.deepEqual(TICKETS_USD, [100, 1000, 10000]);
});

const row = (usd, i, x) => ({ usd, near_intents_1click: i == null ? { ok: false, message: 'min' } : { ok: true, cost_pct: i }, relay: { ok: true, cost_pct: x } });
test('summary counts only tickets both venues quoted', () => {
  const s = summarizeCorridors([
    { id: 'a', rows: [row(100, 0.01, 0.03), row(1000, 0.02, 0.01), row(10000, 0.02, 0.01)] },
    { id: 'b', rows: [row(100, null, 0.2), row(1000, 0.02, 0.2), row(10000, 0.02, 0.2)] },
  ]);
  assert.equal(s.tickets, 6);
  assert.equal(s.quoted_both, 5);
  assert.equal(s.intents_cheaper, 3);
  assert.deepEqual(s.intents_refused, [{ corridor: 'b', usd: 100, message: 'min' }]);
  assert.deepEqual(s.by_size[100], { quoted_both: 1, intents_cheaper: 1, intents_median_pct: 0.01, relay_median_pct: 0.03 });
  assert.equal(s.by_size[1000].relay_median_pct, (0.01 + 0.2) / 2);
});

test('committed quote set: summary matches its rows', () => {
  const f = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'raw', 'corridor-quotes.json');
  if (!fs.existsSync(f)) return;
  const q = JSON.parse(fs.readFileSync(f, 'utf8')), s = summarizeCorridors(q.corridors);
  assert.equal(s.tickets, CORRIDORS.length * TICKETS_USD.length);
  for (const c of q.corridors) for (const r of c.rows) for (const k of ['near_intents_1click', 'relay']) {
    const x = r[k], cor = CORRIDORS.find((y) => y.id === c.id);
    if (x.ok) assert.equal(x.cost_pct, costPct(x.amount_in, cor.from.decimals, x.amount_out, cor.to.decimals), `${c.id} ${r.usd} ${k}`);
  }
});
