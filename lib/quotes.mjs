// T9: what a cross-chain move costs at agent ticket sizes. Dry price quotes only (1Click `dry: true`, Relay quote API):
// nothing is deposited or signed. Route = the agent's own real route, Robinhood Chain ETH -> BSC BNB.
const A = '0x00731cd9e0BC7CAD1b54f85187B09B942cD3be04';
export const TICKETS_USD = [0.47, 2, 30, 1000, 5000];

async function oneClick(usd, ethUsd) {
  const wei = BigInt(Math.round((usd / ethUsd) * 1e18));
  const r = await fetch('https://1click.chaindefuser.com/v0/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: 'nep141:hood.omft.near', depositType: 'ORIGIN_CHAIN',
      destinationAsset: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111', amount: wei.toString(), refundTo: A, refundType: 'ORIGIN_CHAIN',
      recipient: A, recipientType: 'DESTINATION_CHAIN', deadline: new Date(Date.now() + 3600e3).toISOString() }) });
  const j = await r.json().catch(() => ({}));
  const q = j.quote;
  return q ? { ok: true, in_usd: Number(q.amountInUsd), out_usd: Number(q.amountOutUsd), cost_pct: +(100 * (1 - Number(q.amountOutUsd) / Number(q.amountInUsd))).toFixed(3) }
    : { ok: false, http: r.status, message: j.message ?? null };
}
async function relay(usd, ethUsd) {
  const wei = BigInt(Math.round((usd / ethUsd) * 1e18));
  const r = await fetch('https://api.relay.link/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ user: A, recipient: A, originChainId: 4663, destinationChainId: 56, originCurrency: '0x0000000000000000000000000000000000000000',
      destinationCurrency: '0x0000000000000000000000000000000000000000', amount: wei.toString(), tradeType: 'EXACT_INPUT' }) });
  const j = await r.json().catch(() => ({}));
  const i = Number(j.details?.currencyIn?.amountUsd), o = Number(j.details?.currencyOut?.amountUsd);
  return o ? { ok: true, in_usd: i, out_usd: o, cost_pct: +(100 * (1 - o / i)).toFixed(3) } : { ok: false, http: r.status, message: (j.message || '').slice(0, 160) };
}
export async function fetchQuotes() {
  const tok = await (await fetch('https://1click.chaindefuser.com/v0/tokens', { signal: AbortSignal.timeout(20_000) })).json();
  const ethUsd = Number(tok.find((t) => t.assetId === 'nep141:hood.omft.near')?.price);
  const rows = [];
  for (const usd of TICKETS_USD) {
    rows.push({ usd, near_intents_1click: await oneClick(usd, ethUsd).catch((e) => ({ ok: false, error: String(e) })), relay: await relay(usd, ethUsd).catch((e) => ({ ok: false, error: String(e) })) });
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { route: 'Robinhood Chain ETH -> BSC BNB', eth_usd: ethUsd, rows };
}
