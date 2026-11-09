#!/usr/bin/env node
// P2 (2026-11-09, post-lock REPORT): who signs NEAR's transactions, and how many NEAR Intents accounts do signer counts miss?
//   node sample-accounts.mjs [blocks=300] [--head N] [--dry]
// A one-off sample, separate from the hourly collector (collect.mjs is not touched). Read-only, public data.
// Source: neardata.xyz (FastNEAR's block API), one call per block with every chunk's transactions and every receipt outcome
// executed in that block. (The first run on 11-09 used the archival RPC, ~38 calls a block; both archival endpoints answered
// 429 after ~16k calls, so the sample moved to one call a block. Part A's heights are pinned to that run's head, so the
// transaction counts can be checked against its log: 1353 txs, 284 to intents.near, 7 signers; the "before" week 5049 txs.)
// Part A, the last 7 days: random block heights (seeded by the head height, recorded). Every transaction's signer is counted.
//   In the same sampled blocks, every dip4 event logged by intents.near names the account whose signed intent ran
//   (data.account_id). A relayer signs the NEAR transaction; the intent's own account need never appear as a signer.
// Part B, around the drop in NEAR's signer counts in spring 2026 (another entry, NearBI, traced most of it to one app's
//   sub-accounts leaving between 2026-03-23 and 04-06): the same signer count on two fixed weeks, 2026-03-09..16 and
//   2026-04-13..20, grouped by parent account, so the build can say which parents left. Seeds are the window start heights.
// Writes data/raw/accounts-sample.json (after each part); build.mjs reports it as P2. Accounts are public chain ids; only
// counts and the largest parent accounts (apps, relayers) are written, never a list of user accounts.
import fs from 'node:fs';
import path from 'node:path';
import { parentOf } from './lib/accounts.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'data', 'raw', 'accounts-sample.json');
const SOURCE = 'https://mainnet.neardata.xyz/v0/block';
const arg = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const BLOCKS = Number(process.argv.slice(2).find((a, i, all) => /^\d+$/.test(a) && all[i - 1] !== '--head') || 300), DRY = process.argv.includes('--dry');
// Window heights: found 11-09 by binary search on block timestamps (first height at or after 00:00Z of each date); checked below.
const WINDOWS = [['before', '2026-03-09', '2026-03-16', 188711799, 189714875], ['after', '2026-04-13', '2026-04-20', 193749316, 194749351]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let calls = 0;
/** One block from neardata; null for a skipped height. Throws only after retries (the caller counts it as failed).
 *  The free tier allows 30 blocks a minute ("rate-limit exceeded of 30 blocks per minute"), so calls are paced at one per
 *  2.2 s, and a 429 waits out the minute instead of counting against the block. */
let last = 0;
async function block(h) {
  for (let i = 0, limited = 0; i < 6 && limited < 10; i++) {
    await sleep(Math.max(0, last + 2200 - Date.now())); last = Date.now();
    calls++;
    try {
      const r = await fetch(`${SOURCE}/${h}`, { signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) return null;
      if (r.status === 429) { limited++; i--; await sleep(61_000); continue; }
      if (r.ok) return await r.json();   // body "null" = skipped height
    } catch {}
    await sleep(2000 * 2 ** i);
  }
  throw new Error(`block ${h} failed`);
}

const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

async function signersIn(heights, { intents = false } = {}) {
  const s = { blocks_ok: 0, blocks_missing: 0, blocks_failed: 0, txs: 0, signers: new Map(), parents: new Map(), intents_txs: 0, intents_signers: new Map(), intent_accounts: new Set(), intent_events: 0 };
  const t0 = Date.now();
  for (const [i, h] of heights.entries()) {
    let b;
    try { b = await block(h); } catch { s.blocks_failed++; continue; }
    if (!b) { s.blocks_missing++; continue; }
    s.blocks_ok++;
    for (const sh of b.shards) {
      const c = sh.chunk;
      if (c && (c.header?.height_included ?? h) === h) for (const { transaction: tx } of c.transactions ?? []) {
        s.txs++;
        s.signers.set(tx.signer_id, (s.signers.get(tx.signer_id) || 0) + 1);
        const p = parentOf(tx.signer_id), e = s.parents.get(p) || { txs: 0, signers: new Set() };
        e.txs++; e.signers.add(tx.signer_id); s.parents.set(p, e);
        if (intents && tx.receiver_id === 'intents.near') { s.intents_txs++; s.intents_signers.set(tx.signer_id, (s.intents_signers.get(tx.signer_id) || 0) + 1); }
      }
      if (!intents) continue;
      for (const o of sh.receipt_execution_outcomes ?? []) {
        const out = o.execution_outcome?.outcome;
        if (out?.executor_id !== 'intents.near') continue;
        for (const l of out.logs ?? []) {
          if (!l.startsWith('EVENT_JSON:')) continue;
          let ev; try { ev = JSON.parse(l.slice(11)); } catch { continue; }
          if (ev.standard !== 'dip4') continue;
          for (const d of [].concat(ev.data ?? [])) if (d?.account_id) { s.intent_accounts.add(d.account_id); s.intent_events++; }
        }
      }
    }
    if ((i + 1) % 50 === 0) console.error(`${i + 1}/${heights.length} blocks, ${s.txs} txs, ${s.intents_txs} intents txs, ${calls} calls, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  return s;
}

const top = (m, n, f = (v) => v) => [...m].map(([k, v]) => [k, f(v)]).sort((a, b) => b[1] - a[1]).slice(0, n);
// Only parents big enough to be an app, relayer or bot are named: >= 5 txs and >= 1% of the sample (in 300 random blocks of a
// week that is tens of thousands of transactions a week). A named .near/.tg account is its own parent, so smaller ones could
// be one person; they are counted in others_txs, never listed.
const named = (txs, total) => txs >= 5 && txs >= 0.01 * total;
const summary = (s) => {
  const listed = top(s.parents, 12, (e) => e.txs).filter(([, txs]) => named(txs, s.txs));
  return { blocks_ok: s.blocks_ok, blocks_missing: s.blocks_missing, blocks_failed: s.blocks_failed, txs: s.txs, distinct_signers: s.signers.size,
    top_parents: listed.map(([p, txs]) => ({ parent: p, txs, signers: s.parents.get(p).signers.size })), others_txs: s.txs - listed.reduce((x, [, n]) => x + n, 0) };
};

const out = { fetched_at: null, source: SOURCE, calls: 0, now: null, windows: {} };
const save = () => { out.fetched_at = new Date().toISOString(); out.calls = calls; if (!DRY) fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n'); };

const pinned = Number(arg('--head')) || null;
const head = pinned ?? (await (await fetch(`${SOURCE.replace('/block', '')}/last_block/final`, { signal: AbortSignal.timeout(30_000) })).json()).block.header.height;
const span = Math.round((7 * 86400) / 0.6), rand = prng(head);
const heightsA = [...new Set(Array.from({ length: BLOCKS }, () => head - 1000 - Math.floor(rand() * span)))].sort((a, b) => a - b);
console.error(`Part A: ${heightsA.length} heights in the 7 days before ${head}${pinned ? ' (pinned)' : ''}`);
const A = await signersIn(heightsA, { intents: true });
const signerSet = new Set(A.signers.keys());
out.now = { ...summary(A), seed: head, head, head_pinned: !!pinned, days: 7, heights_sampled: heightsA.length,
  intents_txs: A.intents_txs, intents_tx_signers: A.intents_signers.size,
  intents_top_signers_share: (() => { const t = top(A.intents_signers, 3).reduce((x, [, n]) => x + n, 0); return A.intents_txs ? t / A.intents_txs : null; })(),
  intents_top_signer_parents: top(A.intents_signers, 3).filter(([, n]) => named(n, A.intents_txs)).map(([k, n]) => ({ parent: parentOf(k), txs: n })),
  intent_events: A.intent_events, intent_accounts: A.intent_accounts.size,
  intent_accounts_also_signers: [...A.intent_accounts].filter((x) => signerSet.has(x)).length,
  intent_account_kinds: [...A.intent_accounts].reduce((m, x) => { const k = /^[0-9a-f]{64}$/.test(x) ? 'implicit' : /^0x[0-9a-f]{40}$/.test(x) ? 'eth' : 'named'; m[k] = (m[k] || 0) + 1; return m; }, {}) };
save();
console.error(JSON.stringify({ txs: out.now.txs, intents_txs: out.now.intents_txs, intents_tx_signers: out.now.intents_tx_signers, intent_accounts: out.now.intent_accounts }));

for (const [name, from, to, lo, hi] of WINDOWS) {
  const ts = async (h) => { for (let d = 0; d < 5; d++) { const b = await block(h + d).catch(() => null); if (b) return Number(BigInt(b.block.header.timestamp_nanosec) / 1_000_000n); } return null; };
  const [tLo, tHi] = [await ts(lo), await ts(hi)];
  const ok = tLo !== null && tHi !== null && Math.abs(tLo - Date.parse(from + 'T00:00:00Z')) < 3_600_000 && Math.abs(tHi - Date.parse(to + 'T00:00:00Z')) < 3_600_000;
  const r = prng(lo), hs = [...new Set(Array.from({ length: Math.round(BLOCKS / 2) }, () => lo + Math.floor(r() * (hi - lo))))].sort((a, b) => a - b);
  console.error(`Part B ${name}: ${hs.length} heights in ${lo}..${hi} (bounds ${ok ? 'match' : 'DO NOT match'} the dates)`);
  out.windows[name] = { from, to, height_from: lo, height_to: hi, bounds_match_dates: ok, seed: lo, heights_sampled: hs.length, ...summary(await signersIn(hs)) };
  save();
}

const W = out.windows;
console.log(JSON.stringify({ written: !DRY, calls, now: { txs: out.now.txs, signers: out.now.distinct_signers, intents_txs: out.now.intents_txs, intents_tx_signers: out.now.intents_tx_signers, intent_accounts: out.now.intent_accounts, failed: out.now.blocks_failed },
  before: W.before && { txs: W.before.txs, signers: W.before.distinct_signers, failed: W.before.blocks_failed, top: W.before.top_parents.slice(0, 3) },
  after: W.after && { txs: W.after.txs, signers: W.after.distinct_signers, failed: W.after.blocks_failed, top: W.after.top_parents.slice(0, 3) } }));
