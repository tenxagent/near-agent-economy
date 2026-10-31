#!/usr/bin/env node
// One command that rebuilds every number, test and chart of THESIS.md from raw public data.
//   node build.mjs            refresh raw inputs from the public APIs into data/raw/, then build
//   node build.mjs --offline  build only from the committed files in data/ (reproducible without network)
// Outputs: dist/index.html (static dashboard, charts as inline SVG), dist/results.json (every test with its inputs).
// No dependencies (Node 22). Sources are listed per chart and per test in the output.
import fs from 'node:fs';
import path from 'node:path';
import { svgBars, svgLine, svgScatter } from './lib/charts.mjs';
import { classifyLedgerSummary, fetchNearSent, fetchNonces } from './lib/ledger.mjs';
import { fetchQuotes } from './lib/quotes.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(DIR, 'data', 'raw');
const DIST = path.join(DIR, 'dist');
const OFFLINE = process.argv.includes('--offline');
const UA = 'near-agent-economy-thesis/0.1';

// Raw inputs: file name -> public URL. Every number in the build traces back to one of these files.
const SOURCES = {
  'defillama-near-intents-volume.json': 'https://api.llama.fi/summary/dexs/near-intents?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true',
  'defillama-near-intents-fees.json': 'https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees',
  'defillama-near-chain-fees.json': 'https://api.llama.fi/summary/fees/near?dataType=dailyFees',
  'defillama-near-dex-volume.json': 'https://api.llama.fi/overview/dexs/near?excludeTotalDataChartBreakdown=true',
  'nearblocks-intents-daily-txns.json': 'https://api.nearblocks.io/v3/accounts/intents.near/stats/txns?limit=100',
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
const fmtUsd = (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;

// ---------- build
async function main() {
  if (!OFFLINE) await refresh();
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

  // ---------- write
  fs.mkdirSync(DIST, { recursive: true });
  const results = { built_at: new Date().toISOString(), offline: OFFLINE, last_day: lastDay, tests, sources: SOURCES };
  fs.writeFileSync(path.join(DIST, 'results.json'), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(DIST, 'index.html'), (await import('./lib/page.mjs')).page({ results, charts }));
  for (const t of tests) console.log(`${t.id} ${t.pass === null ? 'REPORT' : t.pass ? 'PASS  ' : 'FAIL  '} ${t.question}  ${JSON.stringify(t.value).slice(0, 160)}`);
  console.log(`wrote dist/index.html and dist/results.json (${charts.length} charts)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
