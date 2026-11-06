// C1 reconciliation (lib/buyback-ledger.mjs): the arithmetic on synthetic receipts, then the committed receipt file itself,
// so a rebuild re-proves that the buyback wallet's balance is closed by its receipts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reconcile, trim, inflowsBetween } from '../lib/buyback-ledger.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const W = 'buybacks.multisignature.near', Y = 10n ** 24n;
const row = (id, from, to, near, { ok = true, block = id, a = 'TRANSFER', ts = '1777000000000000000' } = {}) =>
  ({ id: String(id), block, ts, from, to, ok, actions: [{ a, d: (BigInt(near) * Y).toString() }] });

test('reconcile: in, gas refunds, out and residual on synthetic receipts', () => {
  const rows = [
    row(1, 'nf-payments.near', W, 60), row(2, 'intents.near', W, 1000), row(3, 'intents.near', W, 500),
    row(4, 'system', W, 1),                       // gas refund: counted apart, not as a sender
    row(5, W, 'nf-payments.near', 25),            // outflow
    row(6, W, W, 0, { a: 'FUNCTION_CALL' }),      // the multisig calling itself moves nothing
    row(7, 'someone.near', W, 99, { ok: false }), // failed receipt: its deposit never landed
    row(8, 'intents.near', W, 7, { block: 99 }),  // after the balance block: outside the check
  ];
  const r = reconcile(rows, (1535n * Y).toString(), { account: W, uptoBlock: 10 });
  assert.equal(r.rows, 7);
  assert.equal(r.in_yocto, (1560n * Y).toString());
  assert.equal(r.refunds_yocto, (1n * Y).toString());
  assert.equal(r.out_yocto, (25n * Y).toString());
  assert.equal(r.residual_yocto, 0n.toString());   // 1560 − 25 − 1535: the refund is listed, not added (it returns part of a signing deduction)
  assert.deepEqual(r.in_by_sender, [['intents.near', (1500n * Y).toString()], ['nf-payments.near', (60n * Y).toString()]]);
  assert.deepEqual(r.out_by_receiver, [['nf-payments.near', (25n * Y).toString()]]);
});

test('trim keeps a double deposit as its integer string', () => {
  const t = trim({ id: 5, receipt_id: 'r', transaction_hash: 'h', receipt_block: { block_height: 9, block_timestamp: 1777000000000000000 },
    predecessor_account_id: 'intents.near', receiver_account_id: W, receipt_outcome: { status: true }, actions: [{ action: 'TRANSFER', deposit: 7.1414637504e+23 }] });
  assert.equal(t.actions[0].d, '714146375040000000000000');
  assert.equal(t.ok, true);
});

test('the committed receipts close the buyback wallet balance (residual = its own net fees, under 0.1 NEAR) and cover the count when complete', () => {
  const file = path.join(ROOT, 'data', 'raw', 'nearblocks-buyback-receipts.json');
  if (!fs.existsSync(file)) return;   // before the first online build
  const L = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (L.complete) assert.ok(L.rows.length >= L.count_listed, `${L.rows.length} receipts < NearBlocks count ${L.count_listed}`);   // a partial file is closed at its newest block instead
  assert.equal(new Set(L.rows.map((r) => r.id)).size, L.rows.length, 'duplicate receipt rows');
  const r = reconcile(L.rows, L.balance.yocto, { account: L.account, uptoBlock: L.balance.block });
  const residual = Number(BigInt(r.residual_yocto)) / 1e24;
  assert.ok(Math.abs(residual) < 0.1, `residual ${residual} NEAR: receipts are missing or misread`);
});

test('inflowsBetween: only successful deposits from others on the given UTC days, system refunds and outflows left out', () => {
  const day = (iso) => String(BigInt(Date.parse(iso)) * 1_000_000n);
  const rows = [
    row(1, 'intents.near', W, 10, { ts: day('2026-07-27T23:59:59Z') }),   // the day before the window
    row(2, 'intents.near', W, 20, { ts: day('2026-07-28T00:00:00Z') }),
    row(3, 'dao.near', W, 500, { ts: day('2026-09-09T12:00:00Z') }),
    row(4, 'system', W, 1, { ts: day('2026-09-10T00:00:00Z') }),
    row(5, W, 'x.near', 7, { ts: day('2026-09-11T00:00:00Z') }),
    row(6, 'intents.near', W, 30, { ok: false, ts: day('2026-09-12T00:00:00Z') }),
    row(7, 'intents.near', W, 40, { ts: day('2026-10-25T23:00:00Z') }),
    row(8, 'intents.near', W, 50, { ts: day('2026-10-26T00:00:00Z') }),   // the day after
  ];
  const r = inflowsBetween(rows, { account: W, fromDay: '2026-07-28', toDay: '2026-10-25' });
  assert.equal(r.in_yocto, (560n * Y).toString());
  assert.deepEqual(r.by_sender, [['dao.near', (500n * Y).toString()], ['intents.near', (60n * Y).toString()]]);
  assert.equal(r.largest.from, 'dao.near'); assert.equal(r.largest.day, '2026-09-09');
});
