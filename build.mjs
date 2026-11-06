#!/usr/bin/env node
// One command that rebuilds every number, test and chart of THESIS.md from raw public data.
//   node build.mjs            refresh raw inputs from the public APIs into data/raw/, then build
//   node build.mjs --offline  build only from the committed files in data/ (reproducible without network)
// Outputs: dist/index.html (static dashboard, charts as inline SVG), dist/results.json (every test with its inputs).
// No dependencies (Node 22). Sources are listed per chart and per test in the output.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { svgBars, svgLine, svgScatter } from './lib/charts.mjs';
import { classifyLedgerSummary, fetchNearSent, fetchNonces } from './lib/ledger.mjs';
import { fetchQuotes } from './lib/quotes.mjs';
import { fetchSupply, near } from './lib/capture.mjs';
import { sentence } from './lib/sentences.mjs';
import { baseFrom, summary as modelSummary, growthHistory, project, quarterLabel, HSP029 } from './lib/model.mjs';
import { marketControlled } from './lib/market.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(DIR, 'data', 'raw');
const DIST = path.join(DIR, 'dist');
const OFFLINE = process.argv.includes('--offline');
// --check: build offline, then fail if README's results block or PREREG.md differ from what the build and the NEAR anchor say
const CHECK = process.argv.includes('--check');
// 11-03 (screening): `--check --online` reads the anchored SHA-256 live from SocialDB instead of trusting the pinned constant
const ONLINE = process.argv.includes('--online');
const ANCHOR_ACCOUNT = '00537bf24e164c18f3512de1040d34c88a11f37976a3ef6d4de673dc9cef6590';
async function anchoredPreregSha() {
  const args = Buffer.from(JSON.stringify({ keys: [`${ANCHOR_ACCOUNT}/thesis/prereg/1/**`], options: { with_block_height: true } })).toString('base64');
  for (const url of ['https://rpc.mainnet.fastnear.com', 'https://rpc.mainnet.near.org']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: 'social.near', method_name: 'get', args_base64: args } }) });
      const j = await r.json(); const v = JSON.parse(Buffer.from(j.result.result).toString())[ANCHOR_ACCOUNT].thesis.prereg['1'];
      return { sha256: v.sha256[''], block: v.sha256[':block'], url };
    } catch { /* next RPC */ }
  }
  throw new Error('could not read the PREREG anchor from SocialDB');
}
// PREREG.md as anchored on NEAR mainnet (tx 5vrqMKwEUT3FnyqCmUwVnopAPrnyMhT6L8bZ8CiHdPWt, block 222474620; README shows the check)
const PREREG_SHA256 = '2f303e07684d8f9b4d337d8e14c8c1de9bdb37f97624fdd957da5b205c9f4126';
const UA = 'near-agent-economy-thesis/0.1';

// Raw inputs: file name -> public URL. Every number in the build traces back to one of these files.
const SOURCES = {
  'defillama-near-intents-volume.json': 'https://api.llama.fi/summary/dexs/near-intents?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true',
  'defillama-near-intents-fees.json': 'https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees',
  'defillama-near-chain-fees.json': 'https://api.llama.fi/summary/fees/near?dataType=dailyFees',
  'defillama-near-dex-volume.json': 'https://api.llama.fi/overview/dexs/near?excludeTotalDataChartBreakdown=true',
  'nearblocks-intents-daily-txns.json': 'https://api.nearblocks.io/v3/accounts/intents.near/stats/txns?limit=100',
  // C1 (added 2026-10-31 ~22Z): Intents revenue that buys NEAR back since the 2026-02-23 fee switch, NEAR's gas burn, market cap
  'defillama-near-intents-holders-revenue.json': 'https://api.llama.fi/summary/fees/near-intents?dataType=dailyHoldersRevenue',
  'defillama-near-chain-revenue.json': 'https://api.llama.fi/summary/fees/near?dataType=dailyRevenue',
  'nearblocks-stats.json': 'https://api.nearblocks.io/v1/stats',
};

async function refresh() {
  fs.mkdirSync(RAW, { recursive: true });
  for (const [file, url] of Object.entries(SOURCES)) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      const body = await r.json();
      fs.writeFileSync(path.join(RAW, file), JSON.stringify({ fetched_at: new Date().toISOString(), url, body }));
      console.log(`fetched ${file}`);
    } catch (e) {
      // a rate limit or outage on one source keeps the committed copy (its fetched_at says how old it is) instead of failing the build
      if (!fs.existsSync(path.join(RAW, file))) throw e;
      console.warn(`kept committed ${file} (fetched_at ${readRaw(file).fetched_at}): ${e.message}`);
    }
  }
  // NearBlocks daily network txns (F2's denominator) are refreshed here too, so scoring does not depend on collect.mjs running
  try {
    const j = await (await fetch('https://api.nearblocks.io/v1/charts', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })).json();
    const keep = ['date', 'txns', 'new_accounts', 'active_accounts', 'deleted_accounts', 'new_contracts', 'active_contracts', 'unique_contracts', 'multichain_txns', 'gas_used', 'blocks', 'near_price'];
    const rows = (j.charts || []).map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? null])));
    if (!rows.length) throw new Error('no rows');
    fs.writeFileSync(path.join(DIR, 'data', 'nearblocks-charts.json'), JSON.stringify({ fetched_at: new Date().toISOString(), source: 'https://api.nearblocks.io/v1/charts', rows }));
    console.log('fetched nearblocks-charts.json');
  } catch (e) { console.warn(`kept committed nearblocks-charts.json: ${e.message}`); }
  try {
    fs.writeFileSync(path.join(RAW, 'near-supply.json'), JSON.stringify({ fetched_at: new Date().toISOString(), ...(await fetchSupply()) }));
    console.log('fetched near-supply.json');
  } catch (e) { console.warn(`kept committed near-supply.json: ${e.message}`); }
  try {   // 11-05: NEAR governance HSP-029 (issuance ramp 2.5% → 1.6%), its House of Stake record read from chain
    const r = await (await fetch('https://rpc.mainnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: 'vote.dao', method_name: 'get_proposal', args_base64: Buffer.from('{"proposal_id":29}').toString('base64') } }) })).json();
    if (!r.result?.result) throw new Error(JSON.stringify(r.error ?? r.result?.error ?? r).slice(0, 160));
    const v = JSON.parse(Buffer.from(r.result.result).toString()); delete v.description;
    fs.writeFileSync(path.join(RAW, 'hsp029-vote.json'), JSON.stringify({ fetched_at: new Date().toISOString(), source: 'NEAR RPC call_function vote.dao get_proposal {"proposal_id":29}', proposal: v }));
    console.log('fetched hsp029-vote.json');
  } catch (e) { console.warn(`kept committed hsp029-vote.json: ${e.message}`); }
  try {   // 11-05 (T4m, post-lock REPORT): BTC's daily price, the market control for T4 (DefiLlama coins API, at most 500 days per call)
    const out = new Map();
    for (let s = Date.parse('2025-01-01T00:00:00Z') / 1000; s < Date.now() / 1000; s += 499 * 86400) {
      const span = Math.max(1, Math.min(499, Math.floor((Date.now() / 1000 - s) / 86400)));
      const j = await (await fetch(`https://coins.llama.fi/chart/coingecko:bitcoin?start=${s}&span=${span}&period=1d`, { signal: AbortSignal.timeout(30_000) })).json();
      const pts = j.coins?.['coingecko:bitcoin']?.prices; if (!pts) throw new Error(JSON.stringify(j).slice(0, 120));
      // timestamps sit within seconds of midnight UTC (23:59:5x or 00:00:0x) ⇒ round to the nearest midnight, one price per date
      for (const p of pts) out.set(new Date(Math.round(p.timestamp / 86400) * 86400_000).toISOString().slice(0, 10), p.price);
    }
    if (out.size < 300) throw new Error(`only ${out.size} days`);
    fs.writeFileSync(path.join(RAW, 'defillama-btc-price.json'), JSON.stringify({ fetched_at: new Date().toISOString(), source: 'https://coins.llama.fi/chart/coingecko:bitcoin (period=1d, chunks of at most 500 days from 2025-01-01)', prices: [...out].sort(([a], [b]) => (a < b ? -1 : 1)) }));
    console.log('fetched defillama-btc-price.json');
  } catch (e) { console.warn(`kept committed defillama-btc-price.json: ${e.message}`); }
  const gt = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'agent-ground-truth.json'), 'utf8'));
  fs.writeFileSync(path.join(RAW, 'agent-nonces.json'), JSON.stringify({ fetched_at: new Date().toISOString(), address: gt.address, nonces: await fetchNonces(gt.address),
    near: gt.near_account ? await fetchNearSent(gt.near_account.account) : undefined }));
  console.log('fetched agent-nonces.json');
  fs.writeFileSync(path.join(RAW, 'cross-chain-quotes.json'), JSON.stringify({ fetched_at: new Date().toISOString(), ...(await fetchQuotes()) }));
  console.log('fetched cross-chain-quotes.json');
}
const readRaw = (file) => JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));

// ---------- series helpers
const day = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const llamaDaily = (file) => new Map(readRaw(file).body.totalDataChart.map(([t, v]) => [day(t), Number(v)]));
function monthly(map, agg = 'sum') {
  const m = new Map();
  for (const [d, v] of map) { const k = d.slice(0, 7); const e = m.get(k) || { s: 0, n: 0 }; e.s += v; e.n++; m.set(k, e); }
  return new Map([...m].map(([k, e]) => [k, agg === 'sum' ? e.s : e.s / e.n]));
}
const sumRange = (map, from, to) => [...map].filter(([d]) => d >= from && d <= to).reduce((s, [, v]) => s + v, 0);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
function corr(a, b) {
  const n = Math.min(a.length, b.length); a = a.slice(-n); b = b.slice(-n);
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}
const FEE_SWITCH = '2026-02-23';   // NEAR Intents' fee switch: from here Intents revenue buys NEAR back (C1, T3 notes, T4m second window)
const fmtUsd = (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;

// ---------- build
async function main() {
  if (!OFFLINE && !CHECK) await refresh();
  const intentsVol = llamaDaily('defillama-near-intents-volume.json');
  const intentsFees = llamaDaily('defillama-near-intents-fees.json');
  const chainFees = llamaDaily('defillama-near-chain-fees.json');
  const dexVol = llamaDaily('defillama-near-dex-volume.json');
  const nb = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'nearblocks-charts.json'), 'utf8'));
  const nbDaily = new Map(nb.rows.map((r) => [r.date.slice(0, 10), r]));
  const snaps = fs.readFileSync(path.join(DIR, 'data', 'snapshots.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  // last full day common to the DefiLlama series
  const lastDay = [...intentsVol.keys()].sort().at(-1);
  const lastFullMonth = (() => { const d = new Date(lastDay + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const tests = [];

  // T1: usage shifted from counts to settled value
  const ivM = monthly(intentsVol), dexM = monthly(dexVol);
  const txM = monthly(new Map([...nbDaily].map(([d, r]) => [d, Number(r.txns)])), 'avg');
  const aaM = monthly(new Map([...nbDaily].map(([d, r]) => [d, Number(r.active_accounts)])), 'avg');
  const months6 = [...ivM.keys()].filter((m) => m <= lastFullMonth).sort().slice(-6);
  const share6 = months6.reduce((s, m) => s + ivM.get(m), 0) / months6.reduce((s, m) => s + (dexM.get(m) || 0), 0);
  const txChg = txM.get(lastFullMonth) / txM.get('2025-01') - 1, aaChg = aaM.get(lastFullMonth) / aaM.get('2025-01') - 1;
  const ivMult = ivM.get(lastFullMonth) / ivM.get('2025-01');
  tests.push({ id: 'T1', half: 'usage', question: 'Did NEAR usage shift from counts to settled value?',
    value: { intents_share_of_near_dex_volume_6m: share6, months: months6, txns_per_day_change: txChg, active_accounts_change: aaChg, intents_volume_multiple: ivMult, from: '2025-01', to: lastFullMonth },
    pass: share6 >= 0.70 && txChg <= -0.5 && aaChg <= -0.5 && ivMult >= 50,
    rule: 'share >= 0.70 AND txns and active accounts down >= 50% AND Intents monthly volume up >= 50x (2025-01 -> last full month)' });

  // T2: 90-day Intents volume vs the 90 days before
  const t2b = sumRange(intentsVol, addDays(lastDay, -89), lastDay), t2a = sumRange(intentsVol, addDays(lastDay, -179), addDays(lastDay, -90));
  tests.push({ id: 'T2', half: 'usage', question: 'Is the settlement flow still growing?', value: { last90: t2b, prior90: t2a, ratio: t2b / t2a, to: lastDay },
    pass: t2b / t2a >= 1.0, rule: 'ratio >= 1.0' });

  // T3: NEAR chain fees vs Intents fees, last 90 days
  const f90c = sumRange(chainFees, addDays(lastDay, -89), lastDay), f90i = sumRange(intentsFees, addDays(lastDay, -89), lastDay);
  tests.push({ id: 'T3', half: 'capture', question: 'Does the value reach the NEAR protocol?', value: { near_chain_fees_90d: f90c, intents_fees_90d: f90i, ratio: f90c / f90i },
    pass: f90c / f90i >= 0.25, rule: 'ratio >= 0.25 (expected FAIL)' });

  // T4: weekly log-change correlation, price vs Intents volume (Monday-start weeks, complete weeks only)
  const weeks = new Map();
  for (const [d, v] of intentsVol) {
    if (d < '2025-01-06' || !nbDaily.has(d)) continue;
    const dt = new Date(d + 'T00:00:00Z'); const monday = addDays(d, -((dt.getUTCDay() + 6) % 7));
    const w = weeks.get(monday) || { iv: 0, px: 0, n: 0 }; w.iv += v; w.px += Number(nbDaily.get(d).near_price); w.n++; weeks.set(monday, w);
  }
  const wk = [...weeks].filter(([, w]) => w.n === 7).sort(([a], [b]) => (a < b ? -1 : 1));
  const dlog = (arr) => arr.slice(1).map((x, i) => Math.log(x / arr[i]));
  const r4 = corr(dlog(wk.map(([, w]) => w.px / 7)), dlog(wk.map(([, w]) => w.iv)));
  tests.push({ id: 'T4', half: 'capture', question: "Does NEAR's price move with the usage that grew?", value: { r: r4, weeks: wk.length, from: wk[0]?.[0], to: wk.at(-1)?.[0] },
    pass: r4 >= 0.2, rule: 'r >= 0.20 (expected FAIL)' });

  // T4m (2026-11-05, post-lock REPORT; T4 itself is unchanged): the same weeks with the crypto market taken out. NEAR's weekly log change is
  // regressed on BTC's; the residual is correlated with Intents volume's weekly log change. Two-sided permutation p (lib/market.mjs).
  if (fs.existsSync(path.join(RAW, 'defillama-btc-price.json'))) {
    const btc = new Map(readRaw('defillama-btc-price.json').prices);
    const wkb = wk.filter(([monday]) => [0, 1, 2, 3, 4, 5, 6].every((i) => btc.has(addDays(monday, i))));
    const btcW = wkb.map(([monday]) => [0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + btc.get(addDays(monday, i)), 0) / 7);
    const m = marketControlled(dlog(wkb.map(([, w]) => w.px / 7)), dlog(btcW), dlog(wkb.map(([, w]) => w.iv)));
    // 11-06 (re-screen 4): the same test on the weeks since the 2026-02-23 fee switch (the break point T3/C1 already use). Added after
    // the reviewer had computed it (r +0.24, p ≈ 0.16 on 36 weeks), so it is not a blind test; reported, no threshold.
    const sinceI = wkb.findIndex(([monday]) => monday >= FEE_SWITCH);
    const rec = sinceI >= 0 && wkb.length - sinceI >= 11 ? (() => { const s = wkb.slice(sinceI), sb = btcW.slice(sinceI);
      return { ...marketControlled(dlog(s.map(([, w]) => w.px / 7)), dlog(sb), dlog(s.map(([, w]) => w.iv))), weeks: s.length, from: s[0][0], to: s.at(-1)[0] }; })() : null;
    tests.push({ id: 'T4m', half: 'capture', question: "Does NEAR's price move with Intents volume once the crypto market (BTC) is taken out?",
      value: { ...m, weeks: wkb.length, from: wkb[0]?.[0], to: wkb.at(-1)?.[0], since_fee_switch: rec }, pass: null,
      rule: 'post-lock REPORT (2026-11-05), no threshold: OLS beta on BTC, residual vs Intents volume, two-sided permutation p (10,000 shuffles, seed 1) and a 4-week block-permutation p (2026-11-06); a second window from the 2026-02-23 fee switch (2026-11-06)' });
  }

  // T5: Intents share of NEAR traffic from our own snapshots (counter method and RPC-sample method)
  const ok = snaps.filter((s) => s.nearblocks?.network?.total_txns && s.nearblocks?.intents_txns_total);
  const first = ok[0], last = ok.at(-1);
  const dNet = Number(last.nearblocks.network.total_txns) - Number(first.nearblocks.network.total_txns);
  const dInt = last.nearblocks.intents_txns_total - first.nearblocks.intents_txns_total;
  // NearBlocks' own daily per-account stats vs its daily network txns, last 7 days present in both (added 2026-10-31 ~20Z: the
  // account txns/count used above is an *estimated* count per NearBlocks' API spec, so its hourly deltas are not traffic)
  const intDaily = fs.existsSync(path.join(RAW, 'nearblocks-intents-daily-txns.json'))
    ? new Map(readRaw('nearblocks-intents-daily-txns.json').body.data.map((r) => [r.date, Number(r.txns)])) : new Map();
  const days7 = [...intDaily.keys()].filter((d) => nbDaily.has(d)).sort().slice(-7);
  // Cross-check of DefiLlama's volume (NEAR's own Dune dataset) against an independent count: NearBlocks' daily intents.near
  // transactions. Agreement in direction is some evidence the volume series tracks real activity; it is not a volume check.
  const xDays = [...intDaily.keys()].filter((d) => intentsVol.get(d) > 0 && intDaily.get(d) > 0).sort();
  if (xDays.length > 2) tests.find((t) => t.id === 'T2').value.cross_check_vs_nearblocks_txns = { days: [xDays[0], xDays.at(-1)], n: xDays.length,
    r_log_levels: corr(xDays.map((d) => Math.log(intentsVol.get(d))), xDays.map((d) => Math.log(intDaily.get(d)))),
    r_daily_log_changes: corr(dlog(xDays.map((d) => intentsVol.get(d))), dlog(xDays.map((d) => intDaily.get(d)))) };
  const int7 = days7.reduce((s, d) => s + intDaily.get(d), 0), net7 = days7.reduce((s, d) => s + Number(nbDaily.get(d).txns), 0);
  const samp = snaps.filter((s) => s.rpc_sample?.txs);
  const sTx = samp.reduce((s, x) => s + x.rpc_sample.txs, 0), sInt = samp.reduce((s, x) => s + x.rpc_sample.txs_to_intents, 0);
  tests.push({ id: 'T5', half: 'usage', question: "How much of NEAR's on-chain traffic is Intents right now?",
    value: { daily_stats_share_7d: net7 ? int7 / net7 : null, daily_stats_window: [days7[0], days7.at(-1)],
      counter_share_estimated: dNet ? dInt / dNet : null, counter_window: [first?.at, last?.at], rpc_sample_share: sTx ? sInt / sTx : null, rpc_sample_txs: sTx, rpc_samples: samp.length },
    pass: null, rule: 'reported, no threshold (daily stats and RPC sample; the hourly counter reads an estimated count, kept for the record)' });

  // T6/T7: Agent Market
  const am = snaps.filter((s) => s.agent_market?.agents);
  const a0 = am[0]?.agent_market, a1 = am.at(-1)?.agent_market;
  const jobsGrowth = a0 && a1 ? a1.delivered_jobs_total / a0.delivered_jobs_total - 1 : null;
  tests.push({ id: 'T6', half: 'agents', question: 'Is agent-native demand on NEAR growing?',
    value: { delivered_jobs_first: a0?.delivered_jobs_total, delivered_jobs_last: a1?.delivered_jobs_total, growth: jobsGrowth, window: [am[0]?.at, am.at(-1)?.at], agents_last: a1?.agents },
    // judged only once the pre-registered window has closed; until then the value is reported but not scored
    pass: jobsGrowth === null || Date.now() < Date.parse('2026-11-12T23:59:59Z') ? null : jobsGrowth >= 0.2,
    rule: 'delivered jobs grow >= 20% over 2026-10-31 -> 2026-11-12 (scored after the window closes)' });
  const PRICE_ASSUMPTION = 5; // USD per delivered job, from the marketplace docs' examples (2.50 USDC and 5 USD); stated, not observed
  const intents30 = sumRange(intentsVol, addDays(lastDay, -29), lastDay);
  tests.push({ id: 'T7', half: 'agents', question: 'How big is agent commerce next to Intents?',
    value: { agent_market_all_time_usd_at_assumed_price: (a1?.delivered_jobs_total || 0) * PRICE_ASSUMPTION, price_assumption_usd: PRICE_ASSUMPTION, intents_volume_30d: intents30 },
    pass: null, rule: 'order of magnitude, no threshold' });

  // T8: ground truth from claude-10x's own ledger (classification in lib/ledger.mjs)
  const t8 = classifyLedgerSummary();
  tests.push({ id: 'T8', half: 'agents', question: "What share of a live agent's money flow is cross-chain?", value: t8, pass: null, rule: 'reported with n and rules' });

  // T9: cross-chain cost at agent ticket sizes, NEAR Intents (1Click) vs Relay, dry quotes on the agent's real routes
  const q = readRaw('cross-chain-quotes.json');
  const qRoutes = q.routes ?? [{ route: q.route, rows: q.rows }]; // files fetched before 2026-10-31 17:00Z hold one route
  tests.push({ id: 'T9', half: 'agents', question: "What does a cross-chain move cost at agent ticket sizes, through NEAR Intents vs the route the agent used?",
    value: { quoted_at: q.fetched_at, routes: qRoutes.map((rt) => ({ route: rt.route, rows: rt.rows.map((r) => ({ usd: r.usd,
      intents: r.near_intents_1click.ok ? `${r.near_intents_1click.cost_pct}%` : `refused: ${r.near_intents_1click.message}`,
      relay: !r.relay ? 'no route' : r.relay.ok ? `${r.relay.cost_pct}%` : `error: ${r.relay.message}` })) })) },
    pass: null, rule: 'reported, not scored (added after the first probe on 2026-10-31; see THESIS.md)' });

  // C1 (post-lock, REPORT): value that reaches NEAR holders vs NEAR's issuance. Same 90 days as T3 for every revenue series;
  // supply growth over the span between two archival block headers (~90 days), both annualized.
  const hasC1 = ['defillama-near-intents-holders-revenue.json', 'defillama-near-chain-revenue.json', 'nearblocks-stats.json', 'near-supply.json'].every((f) => fs.existsSync(path.join(RAW, f)));
  let c1 = null;
  if (hasC1) {
    const holders = llamaDaily('defillama-near-intents-holders-revenue.json');
    const buyback90 = sumRange(holders, addDays(lastDay, -89), lastDay);
    // Cross-check: the NEAR that the buyback series would have bought at each day's NearBlocks price, vs the wallet's balance
    const bought = [...holders].filter(([d, x]) => x > 0 && Number(nbDaily.get(d)?.near_price) > 0);
    const burn90 = sumRange(llamaDaily('defillama-near-chain-revenue.json'), addDays(lastDay, -89), lastDay);
    const st = readRaw('nearblocks-stats.json').body.stats[0], sup = readRaw('near-supply.json');
    const days = (Number(sup.now.timestamp_ns) - Number(sup.then.timestamp_ns)) / 86400e9;
    const supNow = near(sup.now.total_supply_yocto), issuedPerYear = ((supNow - near(sup.then.total_supply_yocto)) * 365) / days;
    const price = Number(st.near_price), cap = Number(st.market_cap), captured = ((buyback90 + burn90) * 365) / 90;
    c1 = { window: [addDays(lastDay, -89), lastDay], buyback_90d: buyback90, burn_90d: burn90, intents_fees_90d: f90i,
      buyback_share_of_intents_fees: buyback90 / f90i, captured_share_of_intents_fees: (buyback90 + burn90) / f90i,
      captured_usd_per_year: captured, market_cap_usd: cap, near_price_usd: price, stats_fetched_at: readRaw('nearblocks-stats.json').fetched_at,
      capture_yield: captured / cap, supply_span_days: days, total_supply_near: supNow, net_issuance_near_per_year: issuedPerYear,
      net_issuance_rate: issuedPerYear / supNow, net_issuance_usd_per_year: issuedPerYear * price,
      // supply growth is already net of the gas burn, so the buyback alone is compared with it
      buyback_vs_net_issuance: ((buyback90 * 365) / 90) / (issuedPerYear * price),
      buyback_wallet_near: near(sup.buyback_wallet.balance_yocto), supply_read_at: sup.fetched_at,
      buyback_since_switch_usd: [...holders].reduce((a, [, x]) => a + x, 0),
      buyback_near_implied_at_daily_prices: bought.reduce((a, [d, x]) => a + x / Number(nbDaily.get(d).near_price), 0) };
    c1.buyback_wallet_vs_implied = c1.buyback_wallet_near / c1.buyback_near_implied_at_daily_prices;
    // 11-05 (post-lock REPORT, THESIS.md): HSP-029 lowers max issuance 2.5% → 1.6% over 24 months. Gross issuance = net supply growth +
    // gas burn; at the target, gross scales by 1.6/2.5 and the burn is held. Same buyback, compared with that lower net issuance.
    const burnNear = (burn90 * 365) / 90 / price, gross = issuedPerYear + burnNear, grossT = (gross * HSP029.toPct) / HSP029.fromPct;
    let vote = null;
    if (fs.existsSync(path.join(RAW, 'hsp029-vote.json'))) {
      const pr = readRaw('hsp029-vote.json').proposal, tot = near(pr.total_votes.total_venear);
      const end = Number(BigInt(pr.voting_start_time_ns) + BigInt(pr.voting_duration_ns)) / 1e6;
      vote = { status: pr.status, for_share: near(pr.votes[0].total_venear) / tot, turnout: tot / near(pr.snapshot_and_state.total_venear), voting_ended: new Date(end).toISOString(),
        timelock_ends: new Date(end + Number(BigInt(pr.timelock_duration_ns)) / 1e6).toISOString(), actions_attached: pr.actions !== null, read_at: readRaw('hsp029-vote.json').fetched_at };
    }
    c1.hsp029 = { from_pct: HSP029.fromPct, to_pct: HSP029.toPct, ramp_months: HSP029.rampQuarters * 3, source: HSP029.source, gross_issuance_near_per_year: gross,
      gross_issuance_rate: gross / supNow, net_issuance_near_per_year_at_target: grossT - burnNear,
      buyback_vs_net_issuance_at_target: ((buyback90 * 365) / 90) / ((grossT - burnNear) * price), vote };
  }
  tests.push({ id: 'C1', half: 'capture', question: "How much of Intents' usage reaches NEAR holders, next to NEAR's issuance?", value: c1,
    pass: null, rule: 'reported, not scored (added 2026-10-31 after the lock: the 2026-02-23 fee switch, missed before the lock; see THESIS.md)' });

  // P1 (registered 2026-10-31 ~23:10Z, before the sample was drawn; THESIS.md): sizes of the intents NEAR Intents executes,
  // per kind, against the fixed agent-size cutoffs. The sample is drawn by sample-intents.mjs, not by this build.
  const P1_KINDS = ['transfer', 'token_diff', 'withdraw'];
  let p1 = null;
  if (fs.existsSync(path.join(RAW, 'intents-sample.json'))) {
    const smp = readRaw('intents-sample.json');
    const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
    p1 = { sampled_at: smp.fetched_at, days: smp.days, blocks: smp.blocks_ok, intents_txs: smp.intents_txs, seed: smp.seed, kinds: Object.fromEntries(P1_KINDS.map((k) => {
      const all = smp.events.filter((e) => e.kind === k), sized = all.filter((e) => e.usd !== null).map((e) => e.usd);
      return [k, { n: all.length, unpriced: all.length - sized.length, median_usd: median(sized),
        share_under_50: sized.length ? sized.filter((u) => u < 50).length / sized.length : null, share_under_10: sized.length ? sized.filter((u) => u < 10).length / sized.length : null }];
    })) };
  }
  tests.push({ id: 'P1', half: 'agents', question: 'How large are the intents NEAR Intents executes?', value: p1,
    pass: null, rule: 'reported, no threshold (cutoffs < $50 and < $10 registered before sampling; THESIS.md)' });

  // The investment reading, written from the computed values only (shown on the dashboard and in the README)
  const v = Object.fromEntries(tests.map((t) => [t.id, t.value])), pc = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
  // T9 in one sentence, computed from the latest quotes (11-05: was a fixed string that went stale when Hood USDG → NEAR stopped quoting)
  const t9Sentence = (() => {
    const day = `${v.T9.quoted_at.slice(0, 16).replace('T', ' ')}Z`;
    const rows = v.T9.routes.flatMap((rt) => rt.rows.filter((r) => r.usd < 50).map((r) => ({ into: /->\s*NEAR\b/.test(rt.route), ok: /^[\d.]+%$/.test(r.intents), pct: parseFloat(r.intents) })));
    const into = rows.filter((r) => r.into), okInto = into.filter((r) => r.ok);
    if (into.length && okInto.length === into.length) return `Agent-size tickets into NEAR get a 1Click quote: ${Math.min(...okInto.map((r) => r.pct))}–${Math.max(...okInto.map((r) => r.pct))}% under $50 (T9, quotes of ${day}).`;
    if (okInto.length) return `${okInto.length} of ${into.length} agent-size tickets into NEAR got a 1Click quote (T9, quotes of ${day}).`;
    return `But in the quotes of ${day}, 1Click refused all ${rows.length} agent-size tickets (under $50) on the agent's own routes (T9), so for now small agent tickets stay off Intents.`;
  })();
  const conclusion = c1 && [
    `Usage moved to NEAR Intents: it settled ${pc(v.T1.intents_share_of_near_dex_volume_6m)} of NEAR's DEX volume over the last 6 full months and ${fmtUsd(v.T2.last90)} in the 90 days to ${v.T2.to}, ${v.T2.ratio.toFixed(2)}× the 90 days before (T1, T2).`,
    `Some of that value reaches NEAR holders, through buybacks rather than protocol fees. Since the fee switch of 2026-02-23, captured Intents revenue buys NEAR on the open market. In the 90 days to ${c1.window[1]} that was ${fmtUsd(c1.buyback_90d)}, ${pc(c1.buyback_share_of_intents_fees)} of Intents' fees; NEAR's gas burn added ${fmtUsd(c1.burn_90d)} (C1).`,
    `It is small next to the token. Annualized, captured value is ${fmtUsd(c1.captured_usd_per_year)}, ${pc(c1.capture_yield, 2)} a year of NEAR's ${fmtUsd(c1.market_cap_usd)} market cap. Over the same months NEAR's total supply grew ${pc(c1.net_issuance_rate, 1)} a year net of burns, about ${fmtUsd(c1.net_issuance_usd_per_year)} a year at $${c1.near_price_usd}; the buyback is ${pc(c1.buyback_vs_net_issuance)} of that. The bought-back NEAR is held (${(c1.buyback_wallet_near / 1e6).toFixed(2)}M NEAR in buybacks.multisignature.near), not burned.${c1.hsp029 ? ` If NEAR governance's HSP-029 cut (max issuance ${c1.hsp029.from_pct}% → ${c1.hsp029.to_pct}% over ${c1.hsp029.ramp_months} months) runs its full ramp, the same buyback would cover ${pc(c1.hsp029.buyback_vs_net_issuance_at_target)} of net issuance.` : ''}`,
    `NEAR's weekly price does not move with Intents volume (r = ${Math.abs(v.T4.r) < 0.005 ? '0.00' : v.T4.r.toFixed(2)} over ${v.T4.weeks} weeks, T4${v.T4m ? `; with BTC's moves taken out, r = ${v.T4m.r_controlled.toFixed(2)}, p = ${v.T4m.p_controlled.toFixed(2)}, T4m` : ''}), and agent commerce is tiny next to Intents (T7). ${p1 ? `Small tickets are not an edge case: ${pc(p1.kinds.token_diff.share_under_50)} of sampled swap legs and ${pc(p1.kinds.withdraw.share_under_50)} of withdrawals were under $50 (P1). ` : ''}${t9Sentence}`,
    `Read as an investment case: the usage half is supported by the record so far (T1 and T2 describe the past; the forward tests F1 and F2 check it on new data), value capture exists but covers about ${pc(c1.buyback_vs_net_issuance)} of issuance, and the agent half is still an option. The case for the token is that the captured share grows faster than supply; we would call it made when the buyback reaches half of net issuance over a 90-day window.`,
  ];

  // The re-runnable model (lib/model.mjs, `node model.mjs`): when would the buyback reach THESIS.md's bar (half of net issuance)?
  const model = c1 && { ...modelSummary(baseFrom(c1, v.T2)), history: growthHistory([...intentsVol].sort(), lastDay) };
  const qWhen = (q, at) => (q === null ? 'not within 10 years' : q === 0 ? 'already' : `in ${at} (${q} quarters)`);
  // 11-05 (re-screen X-6): lead with the fade the data implies, not the 2-quarter default flag that the same sentence calls generous
  const hlm = model?.history.impliedHalfLife, atMeasured = model && hlm > 0 ? project(model.base, { halfLife: hlm }) : null;
  // 11-06 (re-screen 4 Y-14): the dashboard card leads with the fade the data implies, not only the generous default flag
  if (model && atMeasured) model.measured = { half_life_q: +hlm.toFixed(2), coverage_in_4q: atMeasured.rows[4].coverage, coverage_in_8q: atMeasured.rows[8].coverage, quartersToHalf: atMeasured.quartersToHalf };
  // 11-05 (HSP-029, post-lock REPORT): the same model with gross issuance ramping 2.5% → 1.6% over 8 quarters from now (start not scheduled)
  const hspRun = (opts) => project(model.base, { ...opts, issuance: 'hsp029' });
  const hsp = model && c1?.hsp029 ? { measured: hlm > 0 ? hspRun({ halfLife: hlm }) : null, def: hspRun({}) } : null;
  const hv = c1?.hsp029?.vote;
  const hspLine = hsp ? ` If HSP-029 (max issuance ${HSP029.fromPct}% → ${HSP029.toPct}% over 24 months${hv ? `; House of Stake vote ${(100 * hv.for_share).toFixed(2)}% for, ${hv.status.toLowerCase()} until ${hv.timelock_ends.slice(0, 10)}` : ''}; no start date set) began its ramp now: `
    + `${hsp.measured ? `at the implied fade, ${qWhen(hsp.measured.quartersToHalf, quarterLabel(model.base.window_end, hsp.measured.quartersToHalf))}; ` : ''}`
    + `at the 2-quarter default, ${qWhen(hsp.def.quartersToHalf, quarterLabel(model.base.window_end, hsp.def.quartersToHalf))}.` : '';
  const modelLine = model && `Model (\`node model.mjs\`, every assumption is a flag): starting from today's ${pc(model.default.coverage_now)}, ${atMeasured
    ? `at the fade the data implies (Intents' growth halving about every ${hlm.toFixed(1)} quarters, see below) the buyback reaches half of net issuance ${qWhen(atMeasured.quartersToHalf, quarterLabel(model.base.window_end, atMeasured.quartersToHalf))}; with a slower fade, halving every 2 quarters (the default flag), ${qWhen(model.default.quartersToHalf, model.default.half_at)};`
    : `assuming Intents' growth fades by half every 2 quarters, the buyback reaches half of net issuance ${qWhen(model.default.quartersToHalf, model.default.half_at)};`} with no further growth it stays at ${pc(model.no_growth.coverage)}; if the measured ${v.T2.ratio.toFixed(2)}× per 90 days never fades, ${qWhen(model.measured_growth_forever.quartersToHalf, model.measured_growth_forever.half_at)}. A scenario, not a forecast. The measured quarter-on-quarter growth went ${model.history.quarters.map((q) => q.ratio.toFixed(1) + '×').join(' → ')}; fading from the oldest quarter to the latest four implies a half-life of about ${model.history.impliedHalfLife ? model.history.impliedHalfLife.toFixed(1) : '?'} quarters, so the 2-quarter default is ${model.history.impliedHalfLife && model.history.impliedHalfLife < 2 ? 'on the generous side' : 'not generous'}. The bought-back NEAR sits in a multisig (held, not burned); \`--resold\` models some of it returning to market.${hspLine}`;

  // F1–F3: forward tests (PREREG.md), scored only on 2026-11-02 → 11-12 against the 11 days before
  const daysIn = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
  const W = daysIn('2026-11-02', 11), B = daysIn('2026-10-22', 11);
  const sumDays = (map, days) => (days.every((d) => map.has(d)) ? days.reduce((s, d) => s + map.get(d), 0) : null);
  // pending until every input exists; still missing at the submission deadline = not scorable, never estimated
  const status = (scored) => (scored ? 'scored' : Date.now() > Date.parse('2026-11-14T23:59:59Z') ? 'not scorable' : 'pending');
  const forward = (id, half, question, w, b, rule) => ({ id, half, question, value: { status: status(w !== null && b !== null), window: [W[0], W.at(-1)], baseline: [B[0], B.at(-1)], w, b },
    pass: w === null || b === null ? null : w >= b, rule });
  tests.push(forward('F1', 'usage', 'Does settled value keep growing?', sumDays(intentsVol, W), sumDays(intentsVol, B), 'volume(W) >= volume(B) (PREREG.md)'));
  const netDaily = new Map([...nbDaily].map(([d, r]) => [d, Number(r.txns)]));
  const share = (days) => { const i = sumDays(intDaily, days), n = sumDays(netDaily, days); return i === null || n === null ? null : i / n; };
  tests.push(forward('F2', 'usage', "Does NEAR's traffic keep shifting to Intents?", share(W), share(B), 'share(W) >= share(B) (PREREG.md)'));
  const snapAt = (iso) => snaps.find((s) => s.agent_market?.delivered_by_agent && Date.parse(s.at) >= Date.parse(iso) && Date.parse(s.at) - Date.parse(iso) <= 3 * 3600_000);
  const jobsBetween = (a, b) => (a && b ? Object.entries(b.agent_market.delivered_by_agent).reduce((s, [k, n]) => s + n - (a.agent_market.delivered_by_agent[k] || 0), 0) : null);
  const [s0, s1, s2] = ['2026-11-02T00:00:00Z', '2026-11-07T00:00:00Z', '2026-11-13T00:00:00Z'].map(snapAt);
  const r1 = jobsBetween(s0, s1) === null ? null : jobsBetween(s0, s1) / 5, r2 = jobsBetween(s1, s2) === null ? null : jobsBetween(s1, s2) / 6;
  tests.push({ id: 'F3', half: 'agents', question: 'Is agent demand accelerating, not just present?',
    value: { status: status(r1 !== null && r2 !== null), snapshots: [s0?.at ?? null, s1?.at ?? null, s2?.at ?? null], jobs_per_day_first: r1, jobs_per_day_second: r2 },
    pass: r1 === null || r2 === null ? null : r2 >= r1 && r2 > 0, rule: 'rate(11-07 -> 11-13) >= rate(11-02 -> 11-07) and > 0 (PREREG.md)' });

  // ---------- charts
  const months = [...ivM.keys()].filter((m) => m >= '2024-12').sort();
  const charts = [];
  charts.push({ id: 'c1', title: 'Settled value up, transaction counts down', sentence: `Monthly NEAR Intents volume (left) against NEAR's average daily transactions and active accounts, ${months[0]} to ${lastFullMonth}, log scale.`,
    source: 'DefiLlama dexs/near-intents; NearBlocks /v1/charts', svg: svgLine({ log: true, series: [
      { name: 'Intents volume, USD/month', color: '#2563eb', points: months.map((m) => [m, ivM.get(m)]) },
      { name: 'NEAR txns/day (avg)', color: '#dc2626', points: months.map((m) => [m, txM.get(m)]) },
      { name: 'NEAR active accounts/day (avg)', color: '#ea580c', points: months.map((m) => [m, aaM.get(m)]) }] }) });
  charts.push({ id: 'c2', title: 'Intents share of NEAR DEX volume', sentence: `Share of NEAR's DEX volume that settles through NEAR Intents, by month. Last 6 full months: ${(share6 * 100).toFixed(0)}%.`,
    source: 'DefiLlama dexs/near-intents ÷ overview/dexs/near', svg: svgLine({ yMax: 1, pct: true, series: [
      { name: 'Intents / NEAR DEX volume', color: '#2563eb', points: months.filter((m) => m <= lastFullMonth).map((m) => [m, ivM.get(m) / (dexM.get(m) || NaN)]) }] }) });
  const fM = [...monthly(intentsFees).keys()].filter((m) => m <= lastFullMonth).sort();
  charts.push({ id: 'c3', title: 'Fees: Intents vs the NEAR protocol', sentence: `Last 90 days: NEAR chain fees ${fmtUsd(f90c)} vs NEAR Intents fees ${fmtUsd(f90i)} (ratio ${(f90c / f90i).toFixed(3)}).`,
    source: 'DefiLlama fees/near-intents, fees/near', svg: svgLine({ log: true, series: [
      { name: 'Intents fees, USD/month', color: '#2563eb', points: fM.map((m) => [m, monthly(intentsFees).get(m)]) },
      { name: 'NEAR chain fees, USD/month', color: '#16a34a', points: fM.map((m) => [m, monthly(chainFees).get(m)]) }] }) });
  const dP = dlog(wk.map(([, w]) => w.px / 7)), dI = dlog(wk.map(([, w]) => w.iv));
  charts.push({ id: 'c4', title: 'Price vs Intents volume, week by week', sentence: `Each dot is one week: change in NEAR price vs change in Intents volume. r = ${r4.toFixed(2)} over ${wk.length} weeks.`,
    source: 'DefiLlama dexs/near-intents; NearBlocks /v1/charts near_price', svg: svgScatter({ xLabel: 'Δlog Intents volume', yLabel: 'Δlog NEAR price', points: dI.map((x, i) => [x, dP[i]]) }) });
  if (am.length >= 2) charts.push({ id: 'c5', title: 'NEAR AI Agent Market: delivered jobs', sentence: `Delivered jobs across all listed agents, from our hourly snapshots: ${a0.delivered_jobs_total} → ${a1.delivered_jobs_total}.`,
    source: 'market.near.ai/v1/agents (collect.mjs)', svg: svgLine({ time: true, zero: false, series: [{ name: 'delivered jobs (cumulative)', color: '#7c3aed', points: am.map((s) => [s.at, s.agent_market.delivered_jobs_total]) }] }) });
  const shareDays = [...intDaily.keys()].filter((d) => nbDaily.has(d)).sort();
  if (shareDays.length >= 2) charts.push({ id: 'c6', title: "Intents' share of NEAR transactions, day by day", sentence: `Daily intents.near transactions ÷ NEAR's daily transactions, ${shareDays[0]} → ${shareDays.at(-1)}: from ${(100 * intDaily.get(shareDays[0]) / Number(nbDaily.get(shareDays[0]).txns)).toFixed(0)}% to ${(100 * intDaily.get(shareDays.at(-1)) / Number(nbDaily.get(shareDays.at(-1)).txns)).toFixed(0)}% (T5).`,
    source: 'NearBlocks /v3/accounts/intents.near/stats/txns ÷ /v1/charts txns', svg: svgLine({ pct: true, xfmt: 'day', series: [{ name: 'Intents share of NEAR txns', color: '#2563eb', points: shareDays.map((d) => [d, intDaily.get(d) / Number(nbDaily.get(d).txns)]) }] }) });
  const tickets = qRoutes[0].rows.map((r) => `$${r.usd.toLocaleString('en-US')}`);
  const costOf = (x) => (x?.ok ? x.cost_pct : null), noteOf = (x) => (x && !x.ok ? 'refused' : null);
  charts.push({ id: 'c7', title: 'What a cross-chain move costs, by ticket size', sentence: `Dry quotes of ${q.fetched_at.slice(0, 16).replace('T', ' ')}Z. A missing bar marked "refused" is a ticket NEAR Intents would not take (T9).`,
    source: 'NEAR Intents 1Click /v0/quote (dry) and Relay /quote', svg: svgBars({ unit: '%', categories: tickets, series: [
      ...qRoutes.map((rt, i) => ({ name: `Intents: ${rt.route.replace('Robinhood Chain ', 'hood ').replace(' -> ', ' → ').replace(' (native)', '')}`, color: ['#2563eb', '#16a34a'][i] ?? '#7c3aed',
        values: rt.rows.map((r) => costOf(r.near_intents_1click)), notes: rt.rows.map((r) => noteOf(r.near_intents_1click)) })),
      ...qRoutes.filter((rt) => rt.rows.some((r) => r.relay)).map((rt) => ({ name: `Relay: ${rt.route.replace('Robinhood Chain ', 'hood ').replace(' -> ', ' → ')}`, color: '#f59e0b',
        values: rt.rows.map((r) => costOf(r.relay)), notes: rt.rows.map(() => null) }))] }) });
  const perChain = t8.chains_with_sent_txs.map((c) => c.split(':'));
  charts.push({ id: 'c8', title: "The agent's own transactions, by chain", sentence: `${t8.sent_txs} transactions sent, ${t8.cross_chain_ops} of them cross-chain (${(100 * t8.cross_chain_share).toFixed(1)}%). Log scale (T8).`,
    source: 'eth_getTransactionCount on 12 EVM chains; NEAR access-key nonce; data/agent-ground-truth.json', svg: svgBars({ log: true, categories: [...perChain.map(([c]) => c), 'cross-chain'],
      series: [{ name: 'transactions sent', color: '#7c3aed', values: [...perChain.map(([, n]) => Number(n)), t8.cross_chain_ops] }] }) });
  const t7 = tests.find((t) => t.id === 'T7').value;
  charts.push({ id: 'c9', title: 'Agent commerce next to Intents', sentence: `All Agent Market jobs ever, at an assumed $${t7.price_assumption_usd} each, vs one month of Intents volume: a ratio of about 1 to ${(t7.intents_volume_30d / t7.agent_market_all_time_usd_at_assumed_price / 1e6).toFixed(1)} million. Log scale (T7).`,
    source: 'market.near.ai/v1/agents (collect.mjs); DefiLlama dexs/near-intents', svg: svgBars({ log: true, unit: '$', categories: ['Agent Market, all time', 'Intents, last 30 days'],
      series: [{ name: 'USD', color: '#0891b2', values: [t7.agent_market_all_time_usd_at_assumed_price, t7.intents_volume_30d] }] }) });
  if (p1) charts.push({ id: 'c11', title: 'How large NEAR Intents tickets are, by kind', sentence: `Share of sampled intents under the agent-size cutoffs, from ${p1.blocks} random blocks over the ${p1.days} days to ${p1.sampled_at.slice(0, 10)} (P1).`,
    source: 'NEAR archival RPC (blocks, chunks, tx outcomes of intents.near); 1Click /v0/tokens prices', svg: svgBars({ unit: '%', categories: P1_KINDS.map((k) => `${k} (n=${p1.kinds[k].n})`),
      series: [{ name: 'under $50', color: '#7c3aed', values: P1_KINDS.map((k) => (p1.kinds[k].share_under_50 ?? NaN) * 100) },
        { name: 'under $10', color: '#c4b5fd', values: P1_KINDS.map((k) => (p1.kinds[k].share_under_10 ?? NaN) * 100) }] }) });
  if (c1) charts.push({ id: 'c10', title: 'Value captured for NEAR holders vs new NEAR supply, per year', sentence: `Annualized from the 90 days to ${c1.window[1]}: Intents fees ${fmtUsd((c1.intents_fees_90d * 365) / 90)}, of which ${fmtUsd((c1.buyback_90d * 365) / 90)} bought NEAR back; gas burn ${fmtUsd((c1.burn_90d * 365) / 90)}; net new NEAR supply ${fmtUsd(c1.net_issuance_usd_per_year)} at $${c1.near_price_usd} (C1).`,
    source: 'DefiLlama fees/near-intents (dailyFees, dailyHoldersRevenue), fees/near (dailyRevenue); NEAR archival RPC block headers; NearBlocks /v1/stats', svg: svgBars({ unit: '$',
      categories: ['Intents fees', 'bought back', 'gas burn', 'new NEAR supply'],
      series: [{ name: 'USD per year', color: '#0f766e', values: [(c1.intents_fees_90d * 365) / 90, (c1.buyback_90d * 365) / 90, (c1.burn_90d * 365) / 90, c1.net_issuance_usd_per_year] }] }) });

  // ---------- write (--check is read-only: it compares, and leaves dist/ and the README untouched)
  const results = { built_at: new Date().toISOString(), offline: OFFLINE, last_day: lastDay, conclusion, model: model ? { ...model, sentence: modelLine } : null, tests, sources: SOURCES };
  if (!CHECK) {
    fs.mkdirSync(DIST, { recursive: true });
    fs.writeFileSync(path.join(DIST, 'results.json'), JSON.stringify(results, null, 1));
    fs.writeFileSync(path.join(DIST, 'index.html'), (await import('./lib/page.mjs')).page({ results, charts }));
  }
  for (const t of tests) console.log(`${t.id} ${t.pass === null ? 'REPORT' : t.pass ? 'PASS  ' : 'FAIL  '} ${t.question}  ${JSON.stringify(t.value).slice(0, 160)}`);
  if (!CHECK) console.log(`wrote dist/index.html and dist/results.json (${charts.length} charts)`);

  // README results block, generated (never typed by hand) between the two markers
  const verdictWord = (t) => (t.pass === true ? 'PASS' : t.pass === false ? 'FAIL' : t.value?.status === 'pending' ? 'pending' : t.value?.status === 'not scorable' ? 'not scorable' : 'REPORT');
  const block = [`Data through ${lastDay}; rebuilt by \`node build.mjs\`.`, '', ...(conclusion || []).map((p) => `- ${p}`), ...(modelLine ? [`- ${modelLine}`] : []), '',
    '| test | half | result | finding |', '|---|---|---|---|', ...tests.map((t) => `| ${t.id} | ${t.half} | ${verdictWord(t)} | ${sentence(t).replace(/\|/g, '/')} |`)].join('\n');
  const README = path.join(DIR, 'README.md'), readme = fs.readFileSync(README, 'utf8');
  const re = /(<!-- results:start -->\n)[\s\S]*?(<!-- results:end -->)/;
  // 11-06 (re-screen 4 Y-10/Y-12): THESIS.md's current-status lines are generated too, so the document the track asks for cannot drift
  // from the build. The dated notes elsewhere in THESIS.md are history; this block is the present.
  const byId = (id) => tests.find((t) => t.id === id), t9 = byId('T9'), t4m = byId('T4m'), vote = c1?.hsp029?.vote;
  const statusBlock = [`Generated by \`node build.mjs\` from the data through ${lastDay}; \`node build.mjs --check\` fails if this block differs from the build.`, '',
    t9 && `- **T9, agent-size tickets into NEAR:** ${sentence(t9)}`,
    c1 && `- **C1, buyback vs new NEAR supply:** the buyback covers ${pc(c1.buyback_vs_net_issuance)} of net issuance (90 days to ${c1.window[1]})${c1.hsp029 ? `; with HSP-029's cut to ${c1.hsp029.to_pct}% fully ramped, the same buyback would cover ${pc(c1.hsp029.buyback_vs_net_issuance_at_target)} (burn and buyback held constant)` : ''}. The bar in "What would change our mind" is 50%.`,
    vote && `- **HSP-029 on chain (vote.dao, read ${String(vote.read_at).slice(0, 16)}Z):** status ${vote.status}, ${pc(vote.for_share, 2)} of votes for, turnout ${pc(vote.turnout)}; timelock ends ${String(vote.timelock_ends).slice(0, 16)}Z; ${vote.actions_attached ? 'actions attached' : 'no actions attached, so no start date for the ramp yet'}.`,
    t4m && `- **T4m, T4 with the crypto market taken out:** ${sentence(t4m)}`,
    modelLine && `- ${modelLine.replace(/^Model /, '**Model** ')}`].filter(Boolean).join('\n');
  const THESIS = path.join(DIR, 'THESIS.md'), thesisMd = fs.existsSync(THESIS) ? fs.readFileSync(THESIS, 'utf8') : null;   // absent in the tests' synthetic builds
  const reS = /(<!-- status:start -->\n)[\s\S]*?(<!-- status:end -->)/;
  const prereg = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, 'PREREG.md'))).digest('hex');
  if (CHECK) {
    const errs = [];
    if (!re.test(readme) || readme.match(re)[0] !== `<!-- results:start -->\n${block}\n<!-- results:end -->`) errs.push('README results block differs from this build (run node build.mjs --offline)');
    if (thesisMd !== null && (!reS.test(thesisMd) || thesisMd.match(reS)[0] !== `<!-- status:start -->\n${statusBlock}\n<!-- status:end -->`)) errs.push('THESIS.md status block differs from this build (run node build.mjs --offline)');
    if (prereg !== PREREG_SHA256) errs.push(`PREREG.md sha256 ${prereg} differs from the anchored ${PREREG_SHA256}`);
    let src = 'the anchored value pinned in build.mjs';
    if (ONLINE) { const a = await anchoredPreregSha(); src = `SocialDB live (block ${a.block}, ${a.url})`;
      if (a.sha256 !== prereg) errs.push(`PREREG.md sha256 ${prereg} differs from SocialDB's ${a.sha256}`);
      if (a.sha256 !== PREREG_SHA256) errs.push(`the pinned constant ${PREREG_SHA256} differs from SocialDB's ${a.sha256}`); }
    console.log(errs.length ? `CHECK FAILED:\n- ${errs.join('\n- ')}` : `CHECK OK: README results block and THESIS.md status block match the build; PREREG.md matches its NEAR anchor (${src})`);
    if (errs.length) process.exit(1);
  } else {
    if (re.test(readme)) fs.writeFileSync(README, readme.replace(re, (_, a, b) => `${a}${block}\n${b}`)); // a function: block text contains '$'
    if (thesisMd !== null && reS.test(thesisMd)) fs.writeFileSync(THESIS, thesisMd.replace(reS, (_, a, b) => `${a}${statusBlock}\n${b}`));
    if (prereg !== PREREG_SHA256) console.warn(`WARNING: PREREG.md sha256 ${prereg} differs from the anchored ${PREREG_SHA256}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
