// C1: does Intents' usage reach NEAR holders, and how does that compare with issuance? Chain-side inputs, read over public
// archival RPC: NEAR total supply from two block headers ~90 days apart, and the balance of the wallet that holds the
// bought-back NEAR (the buyback buys on the open market and holds; it does not burn). Revenue series come from DefiLlama.
const ARCHIVAL = ['https://archival-rpc.mainnet.fastnear.com', 'https://archival-rpc.mainnet.near.org'];
export const BUYBACK_WALLET = 'buybacks.multisignature.near';
const BLOCKS_90D = 90 * 86400 * 10 / 6; // ~0.6 s blocks; the exact span is taken from the two header timestamps

async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (!j.result) throw new Error(`${url} ${method}: ${JSON.stringify(j.error ?? j).slice(0, 160)}`);
  return j.result;
}
const head = (h) => ({ height: h.height, timestamp_ns: h.timestamp_nanosec, total_supply_yocto: h.total_supply });

export async function fetchSupply() {
  let last;
  for (const url of ARCHIVAL) {
    try {
      const now = (await rpc(url, 'block', { finality: 'final' })).header;
      const then = (await rpc(url, 'block', { block_id: now.height - Math.round(BLOCKS_90D) })).header;
      const acct = await rpc(url, 'query', { request_type: 'view_account', finality: 'final', account_id: BUYBACK_WALLET });
      return { rpc: url, now: head(now), then: head(then), buyback_wallet: { account: BUYBACK_WALLET, balance_yocto: acct.amount } };
    } catch (e) { last = e; }
  }
  throw last;
}

// NEAR amounts are yoctoNEAR strings (1e24); keep 6 decimals of NEAR through BigInt before converting to Number.
export const near = (yocto) => Number(BigInt(yocto) / 10n ** 18n) / 1e6;
