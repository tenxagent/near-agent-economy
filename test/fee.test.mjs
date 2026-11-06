// C1 protocol fee (lib/protocol-fee.mjs, post-lock REPORT 2026-11-07): feeIntake's arithmetic on a synthetic collector, then the
// committed raw file itself, so a rebuild re-proves the fee line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { feeIntake } from '../lib/protocol-fee.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const P = { 'nep141:usdc': { decimals: 6, price: 1 }, 'nep141:wrap.near': { decimals: 24, price: 2 } };
// 1 day, 2 windows, 3 tokens (the third has no price)
const raw = { fee_pips: 1, days: 1, windows_per_day: 2, token_ids: ['nep141:usdc', 'nep141:wrap.near', 'nep141:odd'], points: [
  { time: '2026-11-01T00:00:00.000Z', balances: ['1000000', (10n ** 24n).toString(), '5'] },
  { time: '2026-11-01T12:00:00.000Z', balances: ['3000000', (3n * 10n ** 24n).toString(), '9'] },   // +2 USDC, +2 NEAR (= $4), odd +4
  { time: '2026-11-02T00:00:00.000Z', balances: ['500000', (4n * 10n ** 24n).toString(), '9'] },    // −2.5 USDC (withdrawn), +1 NEAR (= $2)
] };

test('feeIntake: increases are intake, decreases withdrawals, unpriced tokens listed, two legs per swap', () => {
  const r = feeIntake(raw, P);
  assert.equal(r.fee_rate, 1e-6);
  assert.equal(r.days.length, 1);
  assert.equal(r.days[0].intake_usd, 8);          // 2 + 4 + 2
  assert.equal(r.days[0].withdrawn_usd, 2.5);
  assert.equal(r.intake_usd_per_day, 8);
  assert.equal(r.implied_token_diff_volume_per_day, 8 / 2e-6);   // the fee is paid on both parties' token_in
  assert.deepEqual(r.unpriced_tokens, ['nep141:odd']);
});

test('feeIntake: a withdrawal inside a window hides that window (a lower bound, never an overcount)', () => {
  const r = feeIntake({ ...raw, windows_per_day: 1, points: [raw.points[0], raw.points[2]] }, P);
  assert.equal(r.days[0].intake_usd, 6);           // NEAR +3 = $6; USDC net −0.5 shows as a withdrawal
  assert.equal(r.days[0].withdrawn_usd, 0.5);
});

test('committed data/raw/protocol-fee.json: whole UTC days, 1 pip, every snapshot complete, prices stored', () => {
  const f = path.join(ROOT, 'data/raw/protocol-fee.json');
  if (!fs.existsSync(f)) return;
  const pf = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(pf.fee_pips, 1);
  assert.equal(pf.points.length, pf.days * pf.windows_per_day + 1);
  for (const p of pf.points) assert.equal(p.balances.length, pf.token_ids.length);
  for (let d = 0; d <= pf.days; d++) {   // day boundaries: the first block at or after each UTC midnight (within a few seconds)
    const t = Date.parse(pf.points[d * pf.windows_per_day].time), mid = Date.parse(pf.end_iso) - (pf.days - d) * 86_400_000;
    assert.ok(t >= mid && t - mid < 10_000, `day ${d} starts at ${pf.points[d * pf.windows_per_day].time}`);
  }
  const r = feeIntake(pf);
  assert.ok(r.intake_usd_per_day > 0 && Object.keys(pf.prices).length > 0);
});
