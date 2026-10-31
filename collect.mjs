#!/usr/bin/env node
// Snapshot collector: one JSON line per run appended to data/snapshots.jsonl, so the thesis has its own time series.
// Free, keyless sources only. Each source is independent: a failure is recorded in `errors` and the rest still lands.
//   node collect.mjs            one snapshot (~1-2 min: Agent Market pages, NearBlocks counters, an RPC block sample)
//   node collect.mjs --dry      same, printed but not written
// Sources:
//   - NEAR Agent Market public API (market.near.ai/v1/agents): listings, delivered_jobs per agent, builders, verification
//   - NearBlocks public API: cumulative tx counters for intents.near (all, and per method), network totals
//   - NEAR JSON-RPC: a sample of the latest final blocks, every shard's chunk, counted by action type
//   - NEAR Intents 1Click: dry $30 quotes on two of the agent's real routes, hood ETH -> BSC BNB and hood USDG -> NEAR (is an agent-size ticket accepted?)
//   - NearBlocks daily charts (network history since 2020), refreshed at most once a day into data/nearblocks-charts.json
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(DIR, 'data');
const OUT = path.join(DATA, 'snapshots.jsonl');
const CHARTS = path.join(DATA, 'nearblocks-charts.json');
const DRY = process.argv.includes('--dry');
const UA = 'near-agent-economy-thesis/0.1 (+https://github.com/tenxagent)';
// Free providers from docs.near.org/api/rpc/providers; rpc.mainnet.near.org is deprecated and answers 429, so not used.
const RPCS = ['https://rpc.mainnet.fastnear.com', 'https://near.lava.build', 'https://1rpc.io/near', 'https://near.drpc.org'];
const RPC_GAP_MS = 120; // pacing between sample calls; a burst of ~200 chunk calls trips FastNEAR's free limit
const SAMPLE_BLOCKS = 20; // consecutive final blocks per run (~11 s of chain time at ~0.56 s/block)
const INTENTS = 'intents.near';
const INTENT_METHODS = ['execute_intents', 'ft_withdraw', 'mt_transfer', 'mt_transfer_call', 'add_public_key', 'storage_deposit'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, { timeout = 20_000, tries = 3, gap = 2000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 429) { last = 'HTTP 429'; await sleep(gap * (i + 2)); continue; }
      if (!r.ok) { last = `HTTP ${r.status}`; await sleep(gap); continue; }
      return await r.json();
    } catch (e) { last = String(e.message || e); await sleep(gap); }
  }
  throw new Error(`${url}: ${last}`);
}
async function rpc(method, params) {
  let last;
  await sleep(RPC_GAP_MS);
  for (const url of [...RPCS, ...RPCS]) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
      const j = await r.json();
      if (j.result) return j.result;
      last = JSON.stringify(j.error).slice(0, 200);
      if (/429|rate|limit/i.test(last)) await sleep(1500);
    } catch (e) { last = String(e.message || e); }
  }
  throw new Error(`rpc ${method}: ${last}`);
}

// ---- NEAR Agent Market
async function agentMarket() {
  const agents = [];
  for (let off = 0; off < 5000; off += 50) {
    const j = await getJson(`https://market.near.ai/v1/agents?limit=50&offset=${off}`);
    const page = j.agents || [];
    agents.push(...page);
    if (page.length < 50) break;
    await sleep(300);
  }
  const byCat = {}, byVerif = {}, builders = new Set(), delivered = {};
  let jobs = 0, withJobs = 0, live = 0, newest = '';
  for (const a of agents) {
    const dj = Number(a.delivered_jobs) || 0;
    jobs += dj; if (dj > 0) withJobs++;
    if (a.listing_status === 'live' || a.available_now) live++;
    byCat[a.category || 'none'] = (byCat[a.category || 'none'] || 0) + 1;
    const v = a.builder?.verification?.level || 'none';
    byVerif[v] = (byVerif[v] || 0) + 1;
    if (a.owner_account_id) builders.add(a.owner_account_id);
    if (dj > 0) delivered[a.agent_id || a.handle] = dj; // keyed by the stable id: a renamed listing must not look new (PREREG.md F3)
    if ((a.created_at || '') > newest) newest = a.created_at;
  }
  return { agents: agents.length, builders: builders.size, live_or_available: live, agents_with_jobs: withJobs,
    delivered_jobs_total: jobs, by_category: byCat, by_builder_verification: byVerif, newest_agent_created_at: newest,
    delivered_by_agent: delivered };
}

// ---- NearBlocks cumulative counters
async function nearblocks() {
  const out = {};
  const s = await getJson('https://api.nearblocks.io/v1/stats');
  const st = s.stats?.[0] || {};
  out.network = { total_txns: st.total_txns ?? null, tps: st.tps ?? null, avg_block_time: st.avg_block_time ?? null, near_price_usd: st.near_price ?? null };
  await sleep(2500);
  const c = await getJson(`https://api.nearblocks.io/v1/account/${INTENTS}/txns/count`);
  out.intents_txns_total = Number(c.txns?.[0]?.count ?? NaN);
  out.intents_methods = {};
  for (const m of INTENT_METHODS) {
    await sleep(2500);
    try { const j = await getJson(`https://api.nearblocks.io/v1/account/${INTENTS}/txns/count?method=${m}`); out.intents_methods[m] = Number(j.txns?.[0]?.count ?? NaN); }
    catch (e) { out.intents_methods[m] = null; }
  }
  return out;
}

// ---- RPC sample: the latest SAMPLE_BLOCKS final blocks, all chunks, counted by action type and receiver
async function rpcSample() {
  const head = await rpc('block', { finality: 'final' });
  const res = { head_height: head.header.height, head_time: new Date(Number(BigInt(head.header.timestamp_nanosec) / 1000000n)).toISOString(),
    blocks: 0, chunks: 0, chunk_errors: 0, txs: 0, txs_to_intents: 0, actions: {}, add_key_function_call: 0, add_key_full_access: 0,
    delegate_actions: 0, signers: 0, span_sec: null };
  const signers = new Set();
  let h = head.header.height, oldest = null;
  for (let i = 0; i < SAMPLE_BLOCKS; i++, h--) {
    let b;
    try { b = await rpc('block', { block_id: h }); } catch { continue; } // skipped heights are normal on NEAR
    res.blocks++; oldest = b.header.timestamp_nanosec;
    for (const ch of b.chunks) {
      if (ch.height_included !== b.header.height) continue; // chunk not produced in this block
      let c;
      try { c = await rpc('chunk', { chunk_id: ch.chunk_hash }); } catch { res.chunk_errors++; continue; }
      res.chunks++;
      for (const tx of c.transactions || []) {
        res.txs++; signers.add(tx.signer_id);
        if (tx.receiver_id === INTENTS) res.txs_to_intents++;
        for (const act of tx.actions || []) {
          const kind = typeof act === 'string' ? act : Object.keys(act)[0];
          res.actions[kind] = (res.actions[kind] || 0) + 1;
          if (kind === 'AddKey') {
            const perm = act.AddKey?.access_key?.permission;
            if (perm === 'FullAccess') res.add_key_full_access++; else res.add_key_function_call++;
          }
          if (kind === 'Delegate') res.delegate_actions++;
        }
      }
    }
  }
  res.signers = signers.size;
  if (oldest) res.span_sec = Number(BigInt(head.header.timestamp_nanosec) - BigInt(oldest)) / 1e9;
  return res;
}

// ---- NearBlocks daily charts, refreshed at most once a day
async function charts() {
  try { if (Date.now() - fs.statSync(CHARTS).mtimeMs < 20 * 3600_000) return { refreshed: false }; } catch {}
  const j = await getJson('https://api.nearblocks.io/v1/charts', { timeout: 60_000 });
  const keep = ['date', 'txns', 'new_accounts', 'active_accounts', 'deleted_accounts', 'new_contracts', 'active_contracts', 'unique_contracts', 'multichain_txns', 'gas_used', 'blocks', 'near_price'];
  const rows = (j.charts || []).map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? null])));
  if (!DRY) fs.writeFileSync(CHARTS, JSON.stringify({ fetched_at: new Date().toISOString(), source: 'https://api.nearblocks.io/v1/charts', rows }));
  return { refreshed: true, days: rows.length, last_day: rows.at(-1)?.date ?? null };
}

if (!DRY) fs.mkdirSync(DATA, { recursive: true });
// ---- NEAR Intents 1Click: is a $30 agent-size ticket accepted? (one dry quote; dry:true returns a price only, nothing is sent)
async function intentsSmallTicket() {
  const tok = await getJson('https://1click.chaindefuser.com/v0/tokens');
  const ethUsd = Number(tok.find((t) => t.assetId === 'nep141:hood.omft.near')?.price);
  const A = '0x00731cd9e0BC7CAD1b54f85187B09B942cD3be04';
  const r = await fetch('https://1click.chaindefuser.com/v0/quote', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: 'nep141:hood.omft.near', depositType: 'ORIGIN_CHAIN',
      destinationAsset: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111', amount: BigInt(Math.round((30 / ethUsd) * 1e18)).toString(), refundTo: A,
      refundType: 'ORIGIN_CHAIN', recipient: A, recipientType: 'DESTINATION_CHAIN', deadline: new Date(Date.now() + 3600e3).toISOString() }) });
  const j = await r.json().catch(() => ({}));
  return { ticket_usd: 30, http: r.status, accepted: Boolean(j.quote), message: j.message ?? null,
    cost_pct: j.quote ? +(100 * (1 - Number(j.quote.amountOutUsd) / Number(j.quote.amountInUsd))).toFixed(3) : null };
}
// Same $30 dry probe on the agent's second real route, Robinhood Chain USDG -> NEAR (added 2026-10-31 17:xxZ; the $1,000
// minimum turned out to be per route). Same output shape as intents_small_ticket.
async function intentsSmallTicketNear() {
  const { ROUTES, oneClick } = await import('./lib/quotes.mjs');
  const q = await oneClick(ROUTES.find((rt) => rt.id === 'hood-usdg-to-near'), 30, 1);
  return { ticket_usd: 30, route: 'hood USDG -> NEAR', http: q.ok ? 200 : q.http, accepted: q.ok, message: q.message ?? null, cost_pct: q.ok ? q.cost_pct : null };
}

const snap = { v: 1, at: new Date().toISOString(), errors: {} };
for (const [key, fn] of [['agent_market', agentMarket], ['nearblocks', nearblocks], ['rpc_sample', rpcSample], ['intents_small_ticket', intentsSmallTicket], ['intents_small_ticket_near', intentsSmallTicketNear], ['charts', charts]]) {
  const t0 = Date.now();
  try { snap[key] = await fn(); } catch (e) { snap.errors[key] = String(e.message || e).split(DIR).join('.').slice(0, 300); } // no local paths in the data
  snap[`${key}_ms`] = Date.now() - t0;
}
if (!Object.keys(snap.errors).length) delete snap.errors;
if (!DRY) { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(OUT, JSON.stringify(snap) + '\n'); }
const am = snap.agent_market || {}, nb = snap.nearblocks || {}, rs = snap.rpc_sample || {};
console.log(JSON.stringify({ at: snap.at, written: !DRY, agents: am.agents, delivered_jobs_total: am.delivered_jobs_total,
  intents_txns_total: nb.intents_txns_total, sample: { blocks: rs.blocks, txs: rs.txs, to_intents: rs.txs_to_intents, fck_adds: rs.add_key_function_call },
  charts: snap.charts, errors: snap.errors || null }));
