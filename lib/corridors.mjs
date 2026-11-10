// P3 (2026-11-10, post-lock REPORT): what NEAR Intents (1Click) and Relay charge on mainstream corridors at $100 / $1,000 / $10,000.
// T9 quotes the agent's own two routes; this asks the same question where most cross-chain money moves. Dry quotes only
// (1Click `dry: true`, Relay /quote): nothing is deposited or signed, no keys. Every corridor moves ONE asset (USDC → USDC,
// ETH → ETH), so the cost is read in token units (amount out ÷ amount in), not from each API's own USD prices, which differ by a
// few hundredths of a percent and would leak into the comparison. Both sides quote the same raw input amount.
// Not in either cost: the origin-chain gas of the deposit transaction (Relay reports it as fees.gas; 1Click does not). Recorded
// next to the quote, never added to one side.
const A = '0x00731cd9e0BC7CAD1b54f85187B09B942cD3be04';   // the agent's own public EVM address: quote user, recipient and refund address
export const TICKETS_USD = [100, 1000, 10000];
const NATIVE = '0x0000000000000000000000000000000000000000';
const USDC = { eth: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', arb: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' };
const side = (chainId, currency, decimals, intents) => ({ chainId, currency, decimals, intents });
export const CORRIDORS = [
  { id: 'eth-usdc-to-base-usdc', route: 'Ethereum USDC -> Base USDC', from: side(1, USDC.eth, 6, `nep141:eth-${USDC.eth}.omft.near`), to: side(8453, USDC.base, 6, `nep141:base-${USDC.base}.omft.near`) },
  { id: 'arb-usdc-to-base-usdc', route: 'Arbitrum USDC -> Base USDC', from: side(42161, USDC.arb, 6, `nep141:arb-${USDC.arb}.omft.near`), to: side(8453, USDC.base, 6, `nep141:base-${USDC.base}.omft.near`) },
  { id: 'eth-eth-to-arb-eth', route: 'Ethereum ETH -> Arbitrum ETH', from: side(1, NATIVE, 18, 'nep141:eth.omft.near'), to: side(42161, NATIVE, 18, 'nep141:arb.omft.near') },
  { id: 'base-eth-to-eth-eth', route: 'Base ETH -> Ethereum ETH', from: side(8453, NATIVE, 18, 'nep141:base.omft.near'), to: side(1, NATIVE, 18, 'nep141:eth.omft.near') },
  // BSC USDC has 18 decimals on BSC and on 1Click's bridged asset (HOT Omni). 1Click's "$1,000 minimum" sat on this chain (11-10 probes).
  { id: 'eth-usdc-to-bsc-usdc', route: 'Ethereum USDC -> BSC USDC', from: side(1, USDC.eth, 6, `nep141:eth-${USDC.eth}.omft.near`), to: side(56, USDC.bsc, 18, 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r') },
];

/** Cost of a same-asset move in percent of what went in, from raw token amounts (BigInt-safe strings or numbers). */
export function costPct(amountIn, decimalsIn, amountOut, decimalsOut) {
  const i = Number(amountIn) / 10 ** decimalsIn, o = Number(amountOut) / 10 ** decimalsOut;
  if (!(i > 0) || !(o >= 0)) return null;
  return +(100 * (1 - o / i)).toFixed(4);
}

export const units = (usd, price, decimals) => BigInt(Math.round((usd / price) * 10 ** Math.min(decimals, 9))) * 10n ** BigInt(Math.max(decimals - 9, 0));

export async function quote1Click(c, amount) {
  const r = await fetch('https://1click.chaindefuser.com/v0/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: c.from.intents, depositType: 'ORIGIN_CHAIN', destinationAsset: c.to.intents,
      amount: String(amount), refundTo: A, refundType: 'ORIGIN_CHAIN', recipient: A, recipientType: 'DESTINATION_CHAIN', deadline: new Date(Date.now() + 3600e3).toISOString() }) });
  const j = await r.json().catch(() => ({})), q = j.quote;
  if (!q) return { ok: false, http: r.status, message: String(j.message ?? '').slice(0, 200) || null };
  return { ok: true, amount_in: q.amountIn, amount_out: q.amountOut, cost_pct: costPct(q.amountIn, c.from.decimals, q.amountOut, c.to.decimals),
    in_usd: Number(q.amountInUsd), out_usd: Number(q.amountOutUsd), eta_s: q.timeEstimate ?? null };
}

export async function quoteRelay(c, amount) {
  const r = await fetch('https://api.relay.link/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ user: A, recipient: A, originChainId: c.from.chainId, destinationChainId: c.to.chainId, originCurrency: c.from.currency,
      destinationCurrency: c.to.currency, amount: String(amount), tradeType: 'EXACT_INPUT' }) });
  const j = await r.json().catch(() => ({})), d = j.details;
  if (!d?.currencyOut?.amount) return { ok: false, http: r.status, message: String(j.message ?? '').slice(0, 200) || null };
  return { ok: true, amount_in: d.currencyIn.amount, amount_out: d.currencyOut.amount, cost_pct: costPct(d.currencyIn.amount, c.from.decimals, d.currencyOut.amount, c.to.decimals),
    in_usd: Number(d.currencyIn.amountUsd), out_usd: Number(d.currencyOut.amountUsd), eta_s: d.timeEstimate ?? null, origin_gas_usd: j.fees?.gas?.amountUsd != null ? Number(j.fees.gas.amountUsd) : null };
}

/** Pure: the numbers the build reports, from the rows quote-corridors.mjs wrote. */
export function summarizeCorridors(corridors) {
  const pairs = corridors.flatMap((c) => c.rows.map((r) => ({ corridor: c.id, usd: r.usd, i: r.near_intents_1click, x: r.relay })));
  const both = pairs.filter((p) => p.i?.ok && p.x?.ok);
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const bySize = Object.fromEntries(TICKETS_USD.map((usd) => {
    const b = both.filter((p) => p.usd === usd);
    return [usd, { quoted_both: b.length, intents_cheaper: b.filter((p) => p.i.cost_pct < p.x.cost_pct).length,
      intents_median_pct: med(b.map((p) => p.i.cost_pct)), relay_median_pct: med(b.map((p) => p.x.cost_pct)) }];
  }));
  return { tickets: pairs.length, quoted_both: both.length, intents_cheaper: both.filter((p) => p.i.cost_pct < p.x.cost_pct).length,
    intents_refused: pairs.filter((p) => p.i && !p.i.ok).map((p) => ({ corridor: p.corridor, usd: p.usd, message: p.i.message })),
    relay_refused: pairs.filter((p) => p.x && !p.x.ok).map((p) => ({ corridor: p.corridor, usd: p.usd, message: p.x.message })), by_size: bySize };
}
