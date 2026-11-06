// C1 cross-check over NEAR archival RPC only (2026-11-06, screen 5): DefiLlama's near-intents adapter (DefiLlama/dimension-adapters,
// fees/near-intents/index.ts) counts NEAR/wNEAR swept into THREE NEAR revenue wallets, excludes hops between them, and labels all of
// it "NEAR Buyback" from 2026-02-23. So the series is compared with the three wallets' combined NEAR + wNEAR, at the fee switch and
// at the end of the series' last day, plus what the buyback wallet is known to have sent out (its receipt ledger).
export const REVENUE_WALLETS = ['buybacks.multisignature.near', '1csfundsadmin.sputnik-dao.near', 'fefundsadmin.sputnik-dao.near'];
const URLS = ['https://archival-rpc.mainnet.fastnear.com', 'https://archival-rpc.mainnet.near.org'];
const MISSING = /UNKNOWN_BLOCK|DB Not Found|not found/i;

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function call(method, params, tries = 4) {
  await pause(250);   // gentle on the public archival RPC (a burst of ~60 calls got 429s on 2026-11-06)
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await callOnce(method, params); }
    catch (e) { last = e; if (MISSING.test(String(e.message)) || /UNKNOWN_ACCOUNT/.test(String(e.message)) || !/429|rate|Too Many|timeout|fetch failed/i.test(String(e.message))) throw e; await pause(2000 * (i + 1)); }
  }
  throw last;
}
async function callOnce(method, params) {
  let last;
  for (const url of URLS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.result) return j.result;
      last = new Error(JSON.stringify(j.error ?? j).slice(0, 1000));
      if (MISSING.test(last.message) || /UNKNOWN_ACCOUNT/.test(last.message)) throw last;   // an answer, not an outage: do not try the next RPC
    } catch (e) { last = e; if (MISSING.test(String(e.message)) || /UNKNOWN_ACCOUNT/.test(String(e.message))) throw e; }
  }
  throw last;
}
// the first existing block at or after height h (heights can be skipped)
async function blockFrom(h) {
  for (let d = 0; d < 30; d++) {
    try { const b = await call('block', { block_id: h + d }); return { height: b.header.height, ms: Number(BigInt(b.header.timestamp) / 1_000_000n) }; }
    catch (e) { if (!MISSING.test(String(e.message))) throw e; }
  }
  throw new Error(`no block within 30 heights of ${h}`);
}
/** The first block whose timestamp is ≥ iso (binary search over the last ~40M heights, ~26 calls). */
export async function blockAt(iso, headHeight) {
  const target = Date.parse(iso);
  let lo = headHeight - 40_000_000, hi = headHeight;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); const b = await blockFrom(mid); if (b.ms < target) lo = b.height; else hi = mid; }
  const b = await blockFrom(hi);
  return { height: b.height, time: new Date(b.ms).toISOString() };
}
async function balances(account, block_id) {
  let near = 0n, wnear = 0n, exists = true;
  try { near = BigInt((await call('query', { request_type: 'view_account', block_id, account_id: account })).amount); }
  catch (e) { if (/UNKNOWN_ACCOUNT|does not exist/i.test(String(e.message))) exists = false; else throw e; }
  const r = await call('query', { request_type: 'call_function', block_id, account_id: 'wrap.near', method_name: 'ft_balance_of',
    args_base64: Buffer.from(JSON.stringify({ account_id: account })).toString('base64') });
  wnear = BigInt(JSON.parse(Buffer.from(r.result).toString()));
  return { account, exists, near_yocto: near.toString(), wnear_yocto: wnear.toString() };
}
/** Network: the three wallets at the first block of fromIso and of toIso. */
export async function readRevenueWallets(fromIso, toIso) {
  const head = await call('block', { finality: 'final' });
  const out = { fetched_at: new Date().toISOString(), source: `NEAR archival RPC (${URLS.join(', ')})`, wallets: REVENUE_WALLETS, points: [] };
  for (const iso of [fromIso, toIso]) {
    const b = await blockAt(iso, Number(head.header.height));
    const bal = [];
    for (const a of REVENUE_WALLETS) bal.push(await balances(a, b.height));
    out.points.push({ at: iso, block: b.height, block_time: b.time, balances: bal });
  }
  return out;
}
/** Pure (unit-tested): the series' implied NEAR vs the wallets' combined gain + known outflows. */
export function crossCheck(raw, impliedNear, knownOutNear) {
  const total = (p) => p.balances.reduce((a, x) => a + (Number(BigInt(x.near_yocto)) + Number(BigInt(x.wnear_yocto))) / 1e24, 0);
  const [a, b] = raw.points;
  const per = REVENUE_WALLETS.map((w) => {
    const x = a.balances.find((y) => y.account === w), y = b.balances.find((z) => z.account === w);
    const v = (q) => (Number(BigInt(q.near_yocto)) + Number(BigInt(q.wnear_yocto))) / 1e24;
    return { account: w, from_near: v(x), to_near: v(y), gain_near: v(y) - v(x) };
  });
  const gain = total(b) - total(a), accounted = gain + knownOutNear;
  return { from: a.at, to: b.at, from_block: a.block, to_block: b.block, wallets: per, gain_near: gain, known_out_near: knownOutNear,
    accounted_near: accounted, implied_near: impliedNear, ratio: accounted / impliedNear,
    frontend_share: per.find((x) => x.account === 'fefundsadmin.sputnik-dao.near').gain_near / impliedNear };
}
