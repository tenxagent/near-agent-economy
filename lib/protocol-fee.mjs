// C1, the protocol's own fee (added 2026-11-07, after the lock; THESIS.md): how much NEAR Intents' contract itself charges.
// intents.near takes fee() pips (1 pip = 1/1,000,000; near/intents crates/primitives/fees/src/lib.rs, Pips::MAX = 1,000,000) of each
// token_diff intent's negative deltas, i.e. on each party's token_in, rounded up, and pays it to fee_collector()
// (contracts/defuse/core/src/intents/token_diff.rs). Transfer intents, the path 1Click's private-liquidity swaps settle through, pay none.
// We read the collector's balances inside intents.near every 3 hours over the last 7 complete UTC days (archival RPC) and add up the
// increases. A withdrawal inside a window hides that window's intake for that token, so the sum is a lower bound; any non-fee
// deposit to the collector would count as intake. Prices: 1Click /v0/tokens at fetch time, stored in the raw file.
const URL_ARCHIVAL = 'https://archival-rpc.mainnet.fastnear.com';   // archival-rpc.mainnet.near.org is deprecated (answers 429)
const MISSING = /UNKNOWN_BLOCK|DB Not Found|not found/i;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function rpc(method, params, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    await pause(300 + 3000 * i);   // gentle: a burst of a few hundred archival calls got 429s on 2026-11-06
    try {
      const j = await (await fetch(URL_ARCHIVAL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
      if (j.result) return j.result;
      last = new Error(JSON.stringify(j.error ?? j).slice(0, 1000));
      if (MISSING.test(last.message)) throw last;
    } catch (e) { last = e; if (MISSING.test(String(e.message))) throw e; }
  }
  throw last;
}
const view = async (method, args, block_id) => JSON.parse(Buffer.from((await rpc('query', { request_type: 'call_function', account_id: 'intents.near',
  method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), block_id })).result).toString());
async function blockNear(h) {
  for (let d = 0; d < 30; d++) {
    try { const b = await rpc('block', { block_id: h + d }); return { height: b.header.height, ms: Number(BigInt(b.header.timestamp) / 1_000_000n) }; }
    catch (e) { if (!MISSING.test(String(e.message))) throw e; }
  }
  throw new Error(`no block within 30 heights of ${h}`);
}

/** Network: the collector's balances at 3-hour steps over the `days` complete UTC days before endIso (a UTC midnight). */
export async function readProtocolFee(endIso, days = 7, windowsPerDay = 8) {
  const final = await rpc('block', { finality: 'final' });
  const head = await blockNear(Number(final.header.height) - 5);
  // the first block at or after t: secant steps from the head (the block rate is near-steady), then a short walk
  async function firstAt(t) {
    let a = head, b = await blockNear(head.height - Math.round((head.ms - t) / 600));
    for (let i = 0; i < 6 && Math.abs(b.ms - t) > 2000; i++) {
      const r = (a.ms - b.ms) / (a.height - b.height) || 0.6;
      const n = await blockNear(b.height + Math.round((t - b.ms) / r)); a = b; b = n;
    }
    while (b.ms >= t) b = await blockNear(b.height - 3);
    while (b.ms < t) b = await blockNear(b.height + 1);
    return b;
  }
  const endMs = Date.parse(endIso), bounds = [];
  for (let d = days; d >= 0; d--) bounds.push(await firstAt(endMs - d * 86_400_000));
  const end = bounds[days].height;
  const fee = await view('fee', {}, end), collector = await view('fee_collector', {}, end);
  const ids = (await view('mt_tokens_for_owner', { account_id: collector, from_index: '0', limit: 1000 }, end)).map((t) => t.token_id);
  const points = [];
  for (let k = 0; k <= windowsPerDay * days; k++) {
    const d = Math.floor(k / windowsPerDay), j = k % windowsPerDay;
    const blk = j === 0 ? bounds[d] : await blockNear(Math.round(bounds[d].height + (bounds[d + 1].height - bounds[d].height) * j / windowsPerDay));
    points.push({ block: blk.height, time: new Date(blk.ms).toISOString(), balances: await view('mt_batch_balance_of', { account_id: collector, token_ids: ids }, blk.height) });
  }
  const tokens = await (await fetch('https://1click.chaindefuser.com/v0/tokens', { signal: AbortSignal.timeout(30_000) })).json();
  const prices = Object.fromEntries(tokens.filter((t) => ids.includes(t.assetId)).map((t) => [t.assetId, { symbol: t.symbol, decimals: t.decimals, price: t.price }]));
  return { fetched_at: new Date().toISOString(), source: `NEAR archival RPC (${URL_ARCHIVAL}): intents.near fee(), fee_collector(), mt_tokens_for_owner, mt_batch_balance_of; prices from https://1click.chaindefuser.com/v0/tokens at fetch time`,
    fee_pips: fee, collector, end_iso: endIso, days, windows_per_day: windowsPerDay, token_ids: ids, prices, points };
}

/** Pure (unit-tested): per-day intake in USD (balance increases only), withdrawals seen, and the token_diff volume they imply. */
export function feeIntake(raw, prices = raw.prices) {
  const W = raw.windows_per_day, rate = raw.fee_pips / 1e6, days = [], unpriced = new Set();
  for (let d = 0; d < raw.days; d++) {
    let inUsd = 0, outUsd = 0;
    for (let k = d * W; k < (d + 1) * W; k++) {
      const a = raw.points[k], b = raw.points[k + 1];
      raw.token_ids.forEach((id, i) => {
        const dd = BigInt(b.balances[i]) - BigInt(a.balances[i]);
        if (dd === 0n) return;
        const p = prices[id];
        if (!p) { unpriced.add(id); return; }
        const usd = (Number(dd) / 10 ** p.decimals) * p.price;
        if (usd > 0) inUsd += usd; else outUsd -= usd;
      });
    }
    days.push({ from: raw.points[d * W].time, to: raw.points[(d + 1) * W].time, intake_usd: inUsd, withdrawn_usd: outUsd });
  }
  const total = days.reduce((s, x) => s + x.intake_usd, 0);
  return { fee_pips: raw.fee_pips, fee_rate: rate, collector: raw.collector, days, intake_usd: total, intake_usd_per_day: total / raw.days,
    // the fee is paid on both parties' token_in, so a swap pays it twice: one-leg volume = intake / (2 × rate)
    implied_token_diff_volume_per_day: total / raw.days / (2 * rate), unpriced_tokens: [...unpriced] };
}
