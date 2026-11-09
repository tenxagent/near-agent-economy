// lib/accounts.mjs (P2, 2026-11-09): grouping signers by parent account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parentOf } from '../lib/accounts.mjs';

test('parentOf: app sub-accounts group under the app; top-level user names and implicit accounts do not merge users', () => {
  assert.equal(parentOf('u123.kaiching'), 'kaiching');
  assert.equal(parentOf('x.users.app.near'), 'users.app.near');
  assert.equal(parentOf('alice.near'), 'alice.near');
  assert.equal(parentOf('bob.tg'), 'bob.tg');
  assert.equal(parentOf('a'.repeat(64)), '(implicit, 64 hex)');
  assert.equal(parentOf('0x' + 'b'.repeat(40)), '(eth-implicit, 0x…)');
  assert.equal(parentOf('near'), 'near');
});
