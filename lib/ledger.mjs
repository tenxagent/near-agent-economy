// T8: one live agent's money flow, single-chain vs cross-chain. Inputs: data/agent-ground-truth.json (curated, every bridge
// with its tx hash) and data/raw/agent-nonces.json (sent-transaction counts per chain, re-read from public RPCs by build.mjs).
// Since 2026-10-31 the agent also has its own NEAR account; its sent txs join the denominator (they are single-chain ops).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');

export const NONCE_RPCS = {
  robinhood: 'https://rpc.mainnet.chain.robinhood.com', base: 'https://mainnet.base.org', ethereum: 'https://ethereum-rpc.publicnode.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc', optimism: 'https://mainnet.optimism.io', bsc: 'https://bsc-dataseed.bnbchain.org',
  ink: 'https://rpc-gel.inkonchain.com', abstract: 'https://api.mainnet.abs.xyz', apechain: 'https://rpc.apechain.com',
  somnia: 'https://api.infra.mainnet.somnia.network', hyperevm: 'https://rpc.hyperliquid.xyz/evm', unichain: 'https://mainnet.unichain.org',
};

export async function fetchNonces(address) {
  const out = {};
  for (const [chain, url] of Object.entries(NONCE_RPCS)) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [address, 'latest'] }) });
      out[chain] = parseInt((await r.json()).result, 16);
    } catch { out[chain] = null; }
  }
  return out;
}

// NEAR has no eth_getTransactionCount. A new access key's nonce starts at (block height - 1) x 1e6 and every signed tx that is
// included (failed ones too, as on EVM) adds 1, so sent txs = sum over the account's keys of (nonce mod 1e6). NearBlocks'
// txns-only count (transactions the account signed or received) is recorded next to it as a cross-check.
export const NEAR_RPC = 'https://rpc.mainnet.fastnear.com';

export async function fetchNearSent(account) {
  const out = { account, sent_txs: null, nearblocks_txns_only: null };
  try {
    const r = await fetch(NEAR_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_access_key_list', finality: 'final', account_id: account } }) });
    const keys = (await r.json()).result?.keys;
    if (keys) out.sent_txs = keys.reduce((s, k) => s + Number(BigInt(k.access_key.nonce) % 1_000_000n), 0);
  } catch {}
  try {
    const r = await fetch(`https://api.nearblocks.io/v1/account/${account}/txns-only/count`, { signal: AbortSignal.timeout(15_000) });
    out.nearblocks_txns_only = Number((await r.json()).txns?.[0]?.count ?? NaN);
  } catch {}
  return out;
}

export function classifyLedgerSummary() {
  const gt = JSON.parse(fs.readFileSync(path.join(DIR, 'agent-ground-truth.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'raw', 'agent-nonces.json'), 'utf8'));
  const near = raw.near?.sent_txs || 0; // files fetched before 2026-10-31 ~20Z hold EVM nonces only
  const sent = Object.values(raw.nonces).reduce((s, n) => s + (n || 0), 0) + near;
  const chainsUsed = Object.entries(raw.nonces).filter(([, n]) => n > 0).map(([c, n]) => `${c}:${n}`).concat(near ? [`near:${near}`] : []);
  const ops = gt.cross_chain_ops;
  return { sent_txs: sent, chains_with_sent_txs: chainsUsed, nonces_read_at: raw.fetched_at, cross_chain_ops: ops.length,
    cross_chain_share: sent ? ops.length / sent : null,
    cross_chain_cost_pct: ops.map((o) => +(100 * (1 - o.usd_out / o.usd_in)).toFixed(2)), cross_chain_ticket_usd: ops.map((o) => o.usd_in),
    near_account_txs: raw.near ? { sent: raw.near.sent_txs, nearblocks_txns_only: raw.near.nearblocks_txns_only, what: gt.near_account?.sent_txs_are ?? null } : null,
    decisions: gt.decisions.length };
}
