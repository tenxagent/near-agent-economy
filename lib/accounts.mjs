// P2 (2026-11-09): grouping NEAR accounts by parent, for sample-accounts.mjs and the build. Pure, no I/O (test/accounts.test.mjs).

/** Parent account: 'a.kaiching' -> 'kaiching', 'u.app.near' -> 'app.near'; a top-level user name ('alice.near', 'bob.tg') is its own;
 *  implicit accounts are grouped by kind. */
export function parentOf(acc) {
  if (/^[0-9a-f]{64}$/.test(acc)) return '(implicit, 64 hex)';
  if (/^0x[0-9a-f]{40}$/.test(acc)) return '(eth-implicit, 0x…)';
  const labels = acc.split('.');
  if (labels.length < 2) return acc;
  const parent = labels.slice(1).join('.');
  return parent === 'near' || parent === 'tg' ? acc : parent;
}
