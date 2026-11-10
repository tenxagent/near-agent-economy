// lib/accounts.mjs (P2, 2026-11-09): grouping signers by parent account.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parentOf } from '../lib/accounts.mjs';

test('parentOf: app sub-accounts group under the app; a named .near/.tg account is its own parent; implicit accounts share one bucket per kind', () => {
  assert.equal(parentOf('u123.kaiching'), 'kaiching');
  assert.equal(parentOf('x.users.app.near'), 'users.app.near');
  assert.equal(parentOf('alice.near'), 'alice.near');
  assert.equal(parentOf('bob.tg'), 'bob.tg');
  assert.equal(parentOf('a'.repeat(64)), '(implicit, 64 hex)');
  assert.equal(parentOf('0x' + 'b'.repeat(40)), '(eth-implicit, 0x…)');
  assert.equal(parentOf('near'), 'near');
});

test('committed P2 build: the spring drop share is a range that brackets the unlisted parent between 0 and the top-12 bound', () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const S = JSON.parse(fs.readFileSync(path.join(root, 'data', 'raw', 'accounts-sample.json'), 'utf8')), B = S.windows.before, A = S.windows.after;
  const p2 = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'results.json'), 'utf8')).tests.find((t) => t.id === 'P2').value;
  const drop = B.txs / B.blocks_ok - A.txs / A.blocks_ok;
  for (const l of p2.spring.left) {
    const b = B.top_parents.find((p) => p.parent === l.parent).txs / B.blocks_ok;
    const listed = A.top_parents.find((p) => p.parent === l.parent);
    if (listed) { assert.equal(l.after_per_block, listed.txs / A.blocks_ok); assert.equal(l.share_of_drop, l.share_of_drop_min); continue; }
    // unlisted: at most the smallest listed parent's count when the list is full (12), else under the floor
    const max = (A.top_parents.length >= 12 ? A.top_parents.at(-1).txs : Math.max(5, 0.01 * A.txs)) / A.blocks_ok;
    assert.equal(l.after_max_per_block, max);
    assert.ok(Math.abs(l.share_of_drop - b / drop) < 1e-12 && Math.abs(l.share_of_drop_min - (b - max) / drop) < 1e-12, l.parent);
    assert.ok(l.share_of_drop_min < l.share_of_drop);
  }
});
