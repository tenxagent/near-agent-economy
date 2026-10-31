// T8: one live agent's money flow, single-chain vs cross-chain. Inputs: data/agent-ground-truth.json (curated, every bridge
// with its tx hash) and data/raw/agent-nonces.json (sent-transaction counts per chain, re-read from public RPCs by build.mjs).
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

export function classifyLedgerSummary() {
  const gt = JSON.parse(fs.readFileSync(path.join(DIR, 'agent-ground-truth.json'), 'utf8'));
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'raw', 'agent-nonces.json'), 'utf8'));
  const sent = Object.values(raw.nonces).reduce((s, n) => s + (n || 0), 0);
  const chainsUsed = Object.entries(raw.nonces).filter(([, n]) => n > 0).map(([c, n]) => `${c}:${n}`);
  const ops = gt.cross_chain_ops;
  return { sent_txs: sent, chains_with_sent_txs: chainsUsed, nonces_read_at: raw.fetched_at, cross_chain_ops: ops.length,
    cross_chain_share: sent ? ops.length / sent : null,
    cross_chain_cost_pct: ops.map((o) => +(100 * (1 - o.usd_out / o.usd_in)).toFixed(2)), cross_chain_ticket_usd: ops.map((o) => o.usd_in),
    decisions: gt.decisions.length };
}
