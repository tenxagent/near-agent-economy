// T9: what a cross-chain move costs at agent ticket sizes. Dry price quotes only (1Click `dry: true`, Relay quote API):
// nothing is deposited or signed. Two routes the agent has really used:
//   - Robinhood Chain ETH -> BSC BNB (its bridge of 10-28), NEAR Intents vs Relay;
//   - Robinhood Chain USDG -> NEAR (1Click delivers wrap.near as native NEAR), the route the agent used on 2026-10-31 to fund
//     its NEAR anchor account. Relay has no NEAR route, so only NEAR Intents is quoted there.
const A = '0x00731cd9e0BC7CAD1b54f85187B09B942cD3be04';
// The agent's own implicit NEAR account (public id; created by the 2026-10-31 $1 move). Used only as the dry-quote recipient.
const NEAR_ACCOUNT = '00537bf24e164c18f3512de1040d34c88a11f37976a3ef6d4de673dc9cef6590';
export const TICKETS_USD = [0.47, 2, 30, 1000, 5000];

export const ROUTES = [
  { id: 'hood-eth-to-bsc-bnb', route: 'Robinhood Chain ETH -> BSC BNB', origin: 'nep141:hood.omft.near', decimals: 18,
    dest: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111', recipient: A, relay: { originCurrency: '0x0000000000000000000000000000000000000000', destinationChainId: 56 } },
  { id: 'hood-usdg-to-near', route: 'Robinhood Chain USDG -> NEAR (native)', origin: 'nep141:hood-0x5fc5360d0400a0fd4f2af552add042d716f1d168.omft.near', decimals: 6,
    dest: 'nep141:wrap.near', recipient: NEAR_ACCOUNT, relay: null },
];

const units = (usd, price, decimals) => BigInt(Math.round((usd / price) * 10 ** Math.min(decimals, 9))) * 10n ** BigInt(Math.max(decimals - 9, 0));

export async function oneClick(rt, usd, price) {
  const r = await fetch('https://1click.chaindefuser.com/v0/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: rt.origin, depositType: 'ORIGIN_CHAIN',
      destinationAsset: rt.dest, amount: units(usd, price, rt.decimals).toString(), refundTo: A, refundType: 'ORIGIN_CHAIN',
      recipient: rt.recipient, recipientType: 'DESTINATION_CHAIN', deadline: new Date(Date.now() + 3600e3).toISOString() }) });
  const j = await r.json().catch(() => ({}));
  const q = j.quote;
  return q ? { ok: true, in_usd: Number(q.amountInUsd), out_usd: Number(q.amountOutUsd), cost_pct: +(100 * (1 - Number(q.amountOutUsd) / Number(q.amountInUsd))).toFixed(3), eta_s: q.timeEstimate ?? null }
    : { ok: false, http: r.status, message: j.message ?? null };
}
async function relay(rt, usd, price) {
  const r = await fetch('https://api.relay.link/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ user: A, recipient: A, originChainId: 4663, destinationChainId: rt.relay.destinationChainId, originCurrency: rt.relay.originCurrency,
      destinationCurrency: '0x0000000000000000000000000000000000000000', amount: units(usd, price, rt.decimals).toString(), tradeType: 'EXACT_INPUT' }) });
  const j = await r.json().catch(() => ({}));
  const i = Number(j.details?.currencyIn?.amountUsd), o = Number(j.details?.currencyOut?.amountUsd);
  return o ? { ok: true, in_usd: i, out_usd: o, cost_pct: +(100 * (1 - o / i)).toFixed(3) } : { ok: false, http: r.status, message: (j.message || '').slice(0, 160) };
}

export async function originPrices() {
  const tok = await (await fetch('https://1click.chaindefuser.com/v0/tokens', { signal: AbortSignal.timeout(20_000) })).json();
  return Object.fromEntries(ROUTES.map((rt) => [rt.id, Number(tok.find((t) => t.assetId === rt.origin)?.price)]));
}

export async function fetchQuotes() {
  const prices = await originPrices();
  const routes = [];
  for (const rt of ROUTES) {
    const rows = [];
    for (const usd of TICKETS_USD) {
      rows.push({ usd, near_intents_1click: await oneClick(rt, usd, prices[rt.id]).catch((e) => ({ ok: false, error: String(e) })),
        relay: rt.relay ? await relay(rt, usd, prices[rt.id]).catch((e) => ({ ok: false, error: String(e) })) : null });
      await new Promise((r) => setTimeout(r, 1200));
    }
    routes.push({ id: rt.id, route: rt.route, origin_usd: prices[rt.id], rows });
  }
  return { routes };
}
