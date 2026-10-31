#!/usr/bin/env node
// P1: how large are the intents NEAR Intents executes? A one-off sample, separate from the hourly collector.
//   node sample-intents.mjs [blocks=300] [days=7]
// Picks block heights at random (seeded by the head height, recorded) over the last `days` days, reads every transaction
// sent to intents.near in those blocks over public archival RPC, and sizes each executed intent in USD at 1Click's token
// prices at run time. Writes data/raw/intents-sample.json; build.mjs reports it as P1. Read-only: nothing is signed or sent.
//   transfer    dip4 `transfer`: the 1Click path, the user's tokens move to a solver (sized by the tokens moved)
//   token_diff  dip4 `token_diff`: a swap leg, sized by the side the account gives (each swap shows a user and a solver leg)
//   withdraw    dip4 `ft_withdraw` / `mt_withdraw` / `native_withdraw`: tokens leave Intents to an outside account
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'data', 'raw', 'intents-sample.json');
const ARCHIVAL = ['https://archival-rpc.mainnet.fastnear.com', 'https://archival-rpc.mainnet.near.org'];
const BLOCKS = Number(process.argv[2] || 300), DAYS = Number(process.argv[3] || 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let turn = 0;
async function rpc(method, params) {
  for (let i = 0; i < 10; i++) {
    const url = ARCHIVAL[turn++ % ARCHIVAL.length];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.result) return j.result;
      const name = j.error?.cause?.name;
      if (name === 'UNKNOWN_BLOCK' || name === 'UNKNOWN_TRANSACTION') return null; // skipped heights exist on NEAR
    } catch {}
    await sleep(500 * (i + 1)); // rate limits: back off and switch endpoint
  }
  throw new Error(`${method} failed on every archival endpoint`);
}

// mulberry32: a small seeded PRNG, so the sampled heights can be regenerated from the recorded seed
const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const tokens = await (await fetch('https://1click.chaindefuser.com/v0/tokens', { signal: AbortSignal.timeout(30_000) })).json();
const PRICE = new Map(tokens.map((t) => [t.assetId, { price: Number(t.price), decimals: Number(t.decimals) }]));
const usdOf = (asset, raw) => { const p = PRICE.get(asset); return p && p.price > 0 ? (Number(raw) / 10 ** p.decimals) * p.price : null; };
// sum of USD over a {asset: amount} map; null if any leg is unpriced (counted, never guessed)
const usdMap = (m, sign = 1) => { let s = 0; for (const [a, x] of Object.entries(m)) { if (sign * Number(x) <= 0) continue; const u = usdOf(a, sign * Number(x)); if (u === null) return null; s += u; } return s; };

const head = (await rpc('block', { finality: 'final' })).header;
const span = Math.round((DAYS * 86400) / 0.6), rand = prng(head.height);
const heights = [...new Set(Array.from({ length: BLOCKS }, () => head.height - 1000 - Math.floor(rand() * span)))].sort((a, b) => a - b);
const events = [], counts = { blocks_ok: 0, blocks_missing: 0, txs: 0, intents_txs: 0, tx_status_missing: 0 };
const t0 = Date.now();
for (const [i, h] of heights.entries()) {
  const b = await rpc('block', { block_id: h });
  if (!b) { counts.blocks_missing++; continue; }
  counts.blocks_ok++;
  for (const c of b.chunks) {
    if (c.height_included !== h) continue;
    const ch = await rpc('chunk', { chunk_id: c.chunk_hash });
    for (const tx of ch?.transactions ?? []) {
      counts.txs++;
      if (tx.receiver_id !== 'intents.near') continue;
      counts.intents_txs++;
      const st = await rpc('tx', { tx_hash: tx.hash, sender_account_id: tx.signer_id, wait_until: 'NONE' });
      if (!st) { counts.tx_status_missing++; continue; }
      for (const o of st.receipts_outcome) {
        if (o.outcome.executor_id !== 'intents.near') continue;
        for (const l of o.outcome.logs) {
          if (!l.startsWith('EVENT_JSON:')) continue;
          let e; try { e = JSON.parse(l.slice(11)); } catch { continue; }
          if (e.standard !== 'dip4') continue;
          for (const d of [].concat(e.data ?? [])) {
            if (e.event === 'transfer') events.push({ h, kind: 'transfer', usd: usdMap(d.tokens ?? {}) });
            else if (e.event === 'token_diff') events.push({ h, kind: 'token_diff', usd: usdMap(d.diff ?? {}, -1) });
            else if (e.event === 'ft_withdraw') events.push({ h, kind: 'withdraw', usd: usdOf(`nep141:${d.token}`, d.amount) });
            else if (e.event === 'native_withdraw') events.push({ h, kind: 'withdraw', usd: usdOf('nep141:wrap.near', d.amount) });
            else if (e.event === 'mt_withdraw') events.push({ h, kind: 'withdraw', usd: null }); // multi-token ids are not priced here
          }
        }
      }
    }
  }
  if ((i + 1) % 25 === 0) console.error(`${i + 1}/${heights.length} blocks, ${counts.intents_txs} intents txs, ${events.length} intents, ${Math.round((Date.now() - t0) / 1000)} s`);
}
const out = { fetched_at: new Date().toISOString(), rpc: ARCHIVAL, prices: 'https://1click.chaindefuser.com/v0/tokens (at run time)', seed: head.height,
  head: head.height, days: DAYS, heights_sampled: heights.length, ...counts, events };
if (!process.argv.includes('--dry')) fs.writeFileSync(OUT, JSON.stringify(out));
// counts only: the distribution is read by build.mjs (P1), so a run does not print sizes
console.log(JSON.stringify({ written: !process.argv.includes('--dry'), ...counts, intents: events.length,
  by_kind: events.reduce((m, e) => ((m[e.kind] = (m[e.kind] || 0) + 1), m), {}), unpriced: events.filter((e) => e.usd === null).length, s: Math.round((Date.now() - t0) / 1000) }));
