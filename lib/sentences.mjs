// One plain sentence per test, written from the computed values (never typed by hand), and the exact public queries behind
// each test and chart. The dashboard (lib/page.mjs) shows both next to every result.
const usd = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`);
const pct = (v, d = 0) => `${(100 * v).toFixed(d)}%`;
const range = (a, b, d = 2) => (a.toFixed(d) === b.toFixed(d) ? `${a.toFixed(d)}%` : `${a.toFixed(d)}–${b.toFixed(d)}%`);
const day = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') + (iso.length > 10 ? 'Z' : '') : '?');

const LLAMA = 'https://api.llama.fi';
const Q = {
  intentsVol: `${LLAMA}/summary/dexs/near-intents?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`,
  nearDex: `${LLAMA}/overview/dexs/near?excludeTotalDataChartBreakdown=true`,
  intentsFees: `${LLAMA}/summary/fees/near-intents?dataType=dailyFees`,
  chainFees: `${LLAMA}/summary/fees/near?dataType=dailyFees`,
  nbCharts: 'https://api.nearblocks.io/v1/charts',
  nbIntentsDaily: 'https://api.nearblocks.io/v3/accounts/intents.near/stats/txns?limit=100',
  nbIntentsCount: 'https://api.nearblocks.io/v1/account/intents.near/txns/count',
  nbStats: 'https://api.nearblocks.io/v1/stats',
  rpc: 'https://rpc.mainnet.fastnear.com (block + chunk, 20 blocks x all shards per snapshot, collect.mjs)',
  market: 'https://market.near.ai/v1/agents?limit=50&offset=N (hourly, collect.mjs)',
  nonces: 'eth_getTransactionCount(0x00731cd9e0BC7CAD1b54f85187B09B942cD3be04) on 12 public EVM RPCs (lib/ledger.mjs)',
  nearKeys: 'https://rpc.mainnet.fastnear.com view_access_key_list (the agent NEAR account, lib/ledger.mjs)',
  groundTruth: 'data/agent-ground-truth.json (every bridge the agent sent, each with its tx hash)',
  oneClick: 'https://1click.chaindefuser.com/v0/quote (dry: true, nothing is sent)',
  holders: `${LLAMA}/summary/fees/near-intents?dataType=dailyHoldersRevenue`,
  chainRev: `${LLAMA}/summary/fees/near?dataType=dailyRevenue`,
  sample: 'https://archival-rpc.mainnet.fastnear.com block + chunk + tx (random blocks, intents.near dip4 events; sample-intents.mjs)',
  oneClickTokens: 'https://1click.chaindefuser.com/v0/tokens (prices at sampling time)',
  supply: 'https://archival-rpc.mainnet.fastnear.com block (header.total_supply, now and ~90 days earlier) + view_account buybacks.multisignature.near (lib/capture.mjs)',
  relay: 'https://api.relay.link/quote',
  btc: 'https://coins.llama.fi/chart/coingecko:bitcoin?period=1d (BTC daily price, the market control for T4m)',
  hsp029: 'https://rpc.mainnet.fastnear.com call_function vote.dao get_proposal {"proposal_id":29} (HSP-029, text: https://gov.near.org/t/42644)',
};

// 11-05: the committed snapshot behind each source (repo-relative), so every card links the exact data it was computed from
export const FILES = {
  [Q.intentsVol]: 'data/raw/defillama-near-intents-volume.json', [Q.nearDex]: 'data/raw/defillama-near-dex-volume.json',
  [Q.intentsFees]: 'data/raw/defillama-near-intents-fees.json', [Q.chainFees]: 'data/raw/defillama-near-chain-fees.json',
  [Q.nbCharts]: 'data/nearblocks-charts.json', [Q.nbIntentsDaily]: 'data/raw/nearblocks-intents-daily-txns.json', [Q.nbStats]: 'data/raw/nearblocks-stats.json',
  [Q.nbIntentsCount]: 'data/snapshots.jsonl', [Q.rpc]: 'data/snapshots.jsonl', [Q.market]: 'data/snapshots.jsonl',
  [Q.nonces]: 'data/raw/agent-nonces.json', [Q.nearKeys]: 'data/raw/agent-nonces.json', [Q.groundTruth]: 'data/agent-ground-truth.json',
  [Q.oneClick]: 'data/raw/cross-chain-quotes.json', [Q.relay]: 'data/raw/cross-chain-quotes.json',
  [Q.holders]: 'data/raw/defillama-near-intents-holders-revenue.json', [Q.chainRev]: 'data/raw/defillama-near-chain-revenue.json', [Q.supply]: 'data/raw/near-supply.json',
  [Q.btc]: 'data/raw/defillama-btc-price.json', [Q.hsp029]: 'data/raw/hsp029-vote.json', [Q.sample]: 'data/raw/intents-sample.json', [Q.oneClickTokens]: 'data/raw/intents-sample.json',
};

export const QUERIES = {
  T1: [Q.intentsVol, Q.nearDex, Q.nbCharts], T2: [Q.intentsVol, Q.nbIntentsDaily], T3: [Q.intentsFees, Q.chainFees], T4: [Q.intentsVol, Q.nbCharts], T4m: [Q.intentsVol, Q.nbCharts, Q.btc],
  T5: [Q.nbIntentsDaily, Q.nbCharts, Q.rpc, Q.nbIntentsCount], T6: [Q.market], T7: [Q.market, Q.intentsVol],
  T8: [Q.nonces, Q.nearKeys, Q.groundTruth], T9: [Q.oneClick, Q.relay], C1: [Q.holders, Q.chainRev, Q.intentsFees, Q.supply, Q.nbStats, Q.hsp029], F1: [Q.intentsVol], F2: [Q.nbIntentsDaily, Q.nbCharts], F3: [Q.market],
  c1: [Q.intentsVol, Q.nbCharts], c2: [Q.intentsVol, Q.nearDex], c3: [Q.intentsFees, Q.chainFees], c4: [Q.intentsVol, Q.nbCharts],
  c5: [Q.market], c6: [Q.nbIntentsDaily, Q.nbCharts], c7: [Q.oneClick, Q.relay], c8: [Q.nonces, Q.nearKeys, Q.groundTruth], c9: [Q.market, Q.intentsVol], c10: [Q.intentsFees, Q.holders, Q.chainRev, Q.supply, Q.nbStats], P1: [Q.sample, Q.oneClickTokens], c11: [Q.sample, Q.oneClickTokens],
};

const pending = (v) => `Pending: scored on ${v.window?.[0] ?? '2026-11-02'} → ${v.window?.[1] ?? '2026-11-12'} data${v.baseline ? ` against ${v.baseline[0]} → ${v.baseline[1]}` : ''} (PREREG.md).`;

export function sentence(t) {
  const v = t.value || {};
  switch (t.id) {
    case 'T1': return `Over the last 6 full months (${v.months[0]} → ${v.months.at(-1)}), NEAR Intents settled ${pct(v.intents_share_of_near_dex_volume_6m)} of NEAR's DEX volume. From ${v.from} to ${v.to}, NEAR's daily transactions fell ${pct(-v.txns_per_day_change)} and its active accounts ${pct(-v.active_accounts_change)}, while monthly Intents volume grew ${Math.round(v.intents_volume_multiple)}×.`;
    case 'T2': return `Intents settled ${usd(v.last90)} in the 90 days to ${v.to}, ${v.ratio.toFixed(2)}× the ${usd(v.prior90)} of the 90 days before.${v.cross_check_vs_nearblocks_txns ? ` Cross-check: DefiLlama's daily volume moves with NearBlocks' independent daily count of intents.near transactions (r = ${v.cross_check_vs_nearblocks_txns.r_daily_log_changes.toFixed(2)} for daily changes over ${v.cross_check_vs_nearblocks_txns.n} days).` : ''}`;
    case 'T3': return `In the last 90 days the NEAR protocol earned ${usd(v.near_chain_fees_90d)} in fees, ${pct(v.ratio, 1)} of the ${usd(v.intents_fees_90d)} that NEAR Intents earned. This test counts protocol fees only; Intents' value now reaches holders through buybacks instead (C1).`;
    case 'T4': return `Over ${v.weeks} weeks (${v.from} → ${v.to}), weekly changes in NEAR's price and in Intents volume are uncorrelated (r = ${Math.abs(v.r) < 0.005 ? '0.00' : v.r.toFixed(2)}).`;
    case 'T4m': return `Over ${v.weeks} weeks, BTC explains ${pct(v.r2_btc)} of NEAR's weekly price moves (beta ${v.beta_btc.toFixed(2)}). What is left after that ${Math.abs(v.r_controlled) < 0.2 || v.p_controlled >= 0.05 ? 'does not track' : 'tracks'} Intents volume (r = ${v.r_controlled.toFixed(2)}, p = ${v.p_controlled.toFixed(2)}${v.p_controlled_block !== undefined ? `, 4-week block p = ${v.p_controlled_block.toFixed(2)}` : ''}; before removing BTC, r = ${v.r_raw.toFixed(2)}, p = ${v.p_raw.toFixed(2)}).${v.since_fee_switch ? ` Since the ${v.since_fee_switch.from.slice(0, 10)} fee switch (${v.since_fee_switch.weeks} weeks): r = ${v.since_fee_switch.r_controlled >= 0 ? '+' : ''}${v.since_fee_switch.r_controlled.toFixed(2)}, p = ${v.since_fee_switch.p_controlled.toFixed(2)}, block p = ${v.since_fee_switch.p_controlled_block.toFixed(2)}, ${v.since_fee_switch.p_controlled < 0.05 && v.since_fee_switch.p_controlled_block < 0.05 ? 'which clears p < 0.05' : 'not significant'}.` : ''} Added after the lock; T4 itself is unchanged.`;
    case 'T5': return `Intents received ${pct(v.daily_stats_share_7d)} of NEAR's transactions on ${v.daily_stats_window[0]} → ${v.daily_stats_window[1]} by NearBlocks' daily stats, and ${pct(v.rpc_sample_share)} of the ${v.rpc_sample_txs} transactions in our ${v.rpc_samples} RPC block samples. NearBlocks' hourly counter, an estimate, says ${pct(v.counter_share_estimated)}; it is kept for the record only.`;
    case 'T6': return `The Agent Market's ${v.agents_last} listings had delivered ${v.delivered_jobs_last} jobs at ${day(v.window[1])}, against ${v.delivered_jobs_first} at ${day(v.window[0])} (${v.growth >= 0 ? '+' : ''}${pct(v.growth, 1)}). Scored after 2026-11-12.`;
    case 'T7': return `Every Agent Market job ever delivered, at an assumed $${v.price_assumption_usd} each, comes to about ${usd(v.agent_market_all_time_usd_at_assumed_price)}; NEAR Intents settled ${usd(v.intents_volume_30d)} in the last 30 days.`;
    case 'T8': return `The agent has sent ${v.sent_txs} transactions (${v.chains_with_sent_txs.join(', ').replace(/:/g, ' ')}). ${v.cross_chain_ops} of them (${pct(v.cross_chain_share, 1)}; ${pct(v.cross_chain_share_evm_only ?? v.cross_chain_share, 1)} of its ${v.evm_sent_txs ?? v.sent_txs} EVM transactions) moved money across chains, at a cost of ${v.cross_chain_cost_pct.map((c) => `${c}%`).join(', ')}.${v.near_account_txs ? ` Its ${v.near_account_txs.sent} NEAR transactions are the companion project anchoring its records, not demand.` : ''}`;
    case 'T9': return v.routes.map((rt) => {
      const ok = rt.rows.filter((r) => !r.intents.startsWith('refused')), no = rt.rows.filter((r) => r.intents.startsWith('refused'));
      const costs = ok.map((r) => parseFloat(r.intents));
      return `${rt.route.replace(' -> ', ' → ')}: NEAR Intents ${no.length ? `refused ${no.map((r) => `$${r.usd.toLocaleString('en-US')}`).join(', ')}` : 'accepted every ticket'}${ok.length ? `${no.length ? ' and accepted the rest' : ''} at ${range(Math.min(...costs), Math.max(...costs))}` : ''}.`;
    }).join(' ') + ` (quotes of ${day(v.quoted_at)})`;
    case 'C1': return !t.value ? 'Not built: the C1 raw files are missing (run node build.mjs).' : `In the 90 days to ${v.window[1]}, ${usd(v.buyback_90d)} of Intents revenue bought NEAR back (${pct(v.buyback_share_of_intents_fees, 1)} of Intents' fees) and gas burn added ${usd(v.burn_90d)}: ${usd(v.captured_usd_per_year)} a year, ${pct(v.capture_yield, 2)} of NEAR's market cap. NEAR's supply grew ${pct(v.net_issuance_rate, 1)} a year net of burns (${usd(v.net_issuance_usd_per_year)}); the buyback is ${pct(v.buyback_vs_net_issuance)} of that.${v.buyback_wallet_vs_implied ? ` Cross-check: the buyback wallet holds ${pct(v.buyback_wallet_vs_implied)} of the NEAR the series would have bought at daily prices (outflows not decoded).` : ''}`;
    case 'P1': return !t.value ? 'Not sampled yet (run node sample-intents.mjs).' : `From ${v.blocks} random blocks over ${v.days} days (${v.intents_txs} transactions to intents.near): ` + ['transfer', 'token_diff', 'withdraw'].map((k) => {
      const x = v.kinds[k]; return x.n ? `${k}${k === 'transfer' ? ' (mostly fee payouts, see THESIS.md)' : ''} n=${x.n}, ${pct(x.share_under_50)} under $50, ${pct(x.share_under_10)} under $10, median ${usd(x.median_usd)}` : `${k} n=0`;
    }).join('; ') + '. Agent-size describes the ticket, not who sent it.';
    case 'F1': return v.status !== 'scored' ? pending(v) : `Intents settled ${usd(v.w)} in the window against ${usd(v.b)} in the 11 days before.`;
    case 'F2': return v.status !== 'scored' ? pending(v) : `Intents received ${pct(v.w, 1)} of NEAR's transactions in the window against ${pct(v.b, 1)} in the 11 days before.`;
    case 'F3': return v.status !== 'scored' ? 'Pending: Agent Market jobs per day on 2026-11-07 → 11-13 against 2026-11-02 → 11-07 (PREREG.md).' : `Agent Market listings delivered ${v.jobs_per_day_second.toFixed(1)} jobs a day in the second part of the window against ${v.jobs_per_day_first.toFixed(1)} in the first.`;
    default: return '';
  }
}
