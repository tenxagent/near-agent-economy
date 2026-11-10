// One plain sentence per test, written from the computed values (never typed by hand), and the exact public queries behind
// each test and chart. The dashboard (lib/page.mjs) shows both next to every result.
const usd = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`);
const pct = (v, d = 0) => `${(100 * v).toFixed(d)}%`;
const nearAmt = (v) => `${Math.round(v).toLocaleString('en-US')} NEAR`;
const ymd = (iso) => iso.slice(0, 10);
// C1 reconciliation (2026-11-06): what the wallet's own receipt history says about the gap
function ledgerSentence(L) {
  const [a, b] = L.senders, outs = [...L.outs].sort((x, y) => y.near - x.near);
  const first = L.months.find((m) => m.month === (L.first_intents_inflow ?? '').slice(0, 7));
  return `Its ${L.receipts.toLocaleString('en-US')} receipts through ${ymd(L.through)} (NearBlocks) ${Math.abs(L.residual_near) < 0.1 ? `close its balance on that day to within ${Math.abs(L.residual_near).toFixed(3)} NEAR (about its own transaction fees)` : `do NOT close that balance (${L.residual_near.toFixed(2)} NEAR unexplained)`}: ` +
    `${pct(a.share)} of the NEAR that arrived came from ${a.account} (first on ${ymd(a.first)})` + (b ? ` and ${pct(b.share)} from ${b.account} (largest single transfer ${nearAmt(b.largest.near)} on ${ymd(b.largest.at)})` : '') +
    `, and ${nearAmt(L.out_near)} left it${outs[0] ? ` (largest: ${nearAmt(outs[0].near)} on ${ymd(outs[0].at)})` : ''}. So the gap is not outflows: ` +
    (first ? `by the end of ${first.month} the wallet had received ${pct(first.cum_received_near / first.cum_implied_near)} of the NEAR implied since the fee switch, and by ${ymd(L.through)} (its newest receipt here) ${pct(L.received_share_of_implied_through)}.` : 'see the month table in results.json.') +
    (L.window ? ` In C1's own window (${L.window.from} to ${L.window.to}) this wallet received ${pct(L.window.received_share)} of the NEAR the series implies, ${pct(L.window.intents_share_of_implied)} of it from intents.near${L.window.largest && L.window.largest.from !== 'intents.near' ? ` and most of the rest as one ${nearAmt(L.window.largest.near)} transfer from ${L.window.largest.from} on ${L.window.largest.day} (a hop the series counted when the NEAR first reached that fund)` : ''}.` : '');
}
function walletsSentence(w) {
  const fe = w.wallets.find((x) => x.account === 'fefundsadmin.sputnik-dao.near');
  return ` The series is not one wallet: DefiLlama's adapter counts NEAR swept into three NEAR revenue wallets and labels all of it "NEAR Buyback" from ${FEE_SWITCH_DAY}. Across all three (balances at the fee switch and on ${ymd(w.to)}, archival RPC), the NEAR gained plus the ${nearAmt(w.known_out_near)} the buyback wallet sent out comes to ${nearAmt(w.accounted_near)}, ${pct(w.ratio)} of the ${nearAmt(w.implied_near)} the series implies through ${w.through_day}. ${pct(w.frontend_share)} of it (${nearAmt(fe.gain_near)}) is in the front-end fund DAO, fefundsadmin.sputnik-dao.near; the rest reached the buyback multisig, directly or through the 1Click fund DAO.`;
}
// 11-07 (post-lock REPORT): intents.near's own fee (lib/protocol-fee.mjs)
function protocolFeeSentence(f) {
  return ` The contract's own protocol fee is small next to the buyback: intents.near charges ${f.fee_pips} pip (${(f.fee_pips / 1e4).toFixed(4)}%) of each side's token_in in a token_diff and nothing on transfers, and its fee collector took in about ${usd(f.intake_usd_per_day)} a day over the 7 days to ${f.through_day} (archival RPC, 3-hourly balances; a lower bound), about ${usd(f.per_year_usd)} a year, ${pct(f.share_of_captured, 2)} of the captured value. The swaps that pay it come to about ${usd(f.implied_token_diff_volume_per_day)} a day, ${pct(f.token_diff_share_of_reported)} of the volume NEAR reports for those days, so most of the reported volume pays no protocol fee (a 1Click swap can settle as transfers alone, as the agent's own did on 2026-11-05).`;
}
const FEE_SWITCH_DAY = '2026-02-23';
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
  accounts: 'https://mainnet.neardata.xyz/v0/block/<height> (random blocks: every transaction\'s signer, intents.near dip4 events; sample-accounts.mjs)',
  corridors: 'https://1click.chaindefuser.com/v0/quote (dry: true) + https://api.relay.link/quote, 5 mainstream corridors x $100 / $1,000 / $10,000 (quote-corridors.mjs)',
  oneClickTokens: 'https://1click.chaindefuser.com/v0/tokens (prices at sampling time)',
  supply: 'https://archival-rpc.mainnet.fastnear.com block (header.total_supply, now and ~90 days earlier) + view_account buybacks.multisignature.near (lib/capture.mjs)',
  buybackLedger: 'https://api.nearblocks.io/v1/account/buybacks.multisignature.near/receipts?per_page=100&order=asc (cursor paging) + archival RPC view_account at the newest receipt\'s block (lib/buyback-ledger.mjs)',
  relay: 'https://api.relay.link/quote',
  btc: 'https://coins.llama.fi/chart/coingecko:bitcoin?period=1d (BTC daily price, the market control for T4m)',
  hsp029: 'https://rpc.mainnet.fastnear.com call_function vote.dao get_proposal {"proposal_id":29} (HSP-029, text: https://gov.near.org/t/42644)',
  revenueWallets: 'https://archival-rpc.mainnet.fastnear.com view_account + wrap.near ft_balance_of for buybacks.multisignature.near, 1csfundsadmin.sputnik-dao.near, fefundsadmin.sputnik-dao.near at the fee switch and the series\' last day (lib/revenue-wallets.mjs)',
  protocolFee: 'https://archival-rpc.mainnet.fastnear.com call_function intents.near fee, fee_collector, mt_tokens_for_owner / mt_batch_balance_of (the collector, every 3 hours over 7 days; lib/protocol-fee.mjs)',
};

// 11-05: the committed snapshot behind each source (repo-relative), so every card links the exact data it was computed from
export const FILES = {
  [Q.intentsVol]: 'data/raw/defillama-near-intents-volume.json', [Q.nearDex]: 'data/raw/defillama-near-dex-volume.json',
  [Q.intentsFees]: 'data/raw/defillama-near-intents-fees.json', [Q.chainFees]: 'data/raw/defillama-near-chain-fees.json',
  [Q.nbCharts]: 'data/nearblocks-charts.json', [Q.nbIntentsDaily]: 'data/raw/nearblocks-intents-daily-txns.json', [Q.nbStats]: 'data/raw/nearblocks-stats.json',
  [Q.nbIntentsCount]: 'data/snapshots.jsonl', [Q.rpc]: 'data/snapshots.jsonl', [Q.market]: 'data/snapshots.jsonl',
  [Q.nonces]: 'data/raw/agent-nonces.json', [Q.nearKeys]: 'data/raw/agent-nonces.json', [Q.groundTruth]: 'data/agent-ground-truth.json',
  [Q.oneClick]: 'data/raw/cross-chain-quotes.json', [Q.relay]: 'data/raw/cross-chain-quotes.json',
  [Q.holders]: 'data/raw/defillama-near-intents-holders-revenue.json', [Q.chainRev]: 'data/raw/defillama-near-chain-revenue.json', [Q.supply]: 'data/raw/near-supply.json', [Q.buybackLedger]: 'data/raw/nearblocks-buyback-receipts.json',
  [Q.btc]: 'data/raw/defillama-btc-price.json', [Q.revenueWallets]: 'data/raw/revenue-wallets.json', [Q.protocolFee]: 'data/raw/protocol-fee.json', [Q.hsp029]: 'data/raw/hsp029-vote.json', [Q.sample]: 'data/raw/intents-sample.json', [Q.oneClickTokens]: 'data/raw/intents-sample.json', [Q.accounts]: 'data/raw/accounts-sample.json', [Q.corridors]: 'data/raw/corridor-quotes.json',
};

export const QUERIES = {
  T1: [Q.intentsVol, Q.nearDex, Q.nbCharts], T2: [Q.intentsVol, Q.nbIntentsDaily], T3: [Q.intentsFees, Q.chainFees], T4: [Q.intentsVol, Q.nbCharts], T4m: [Q.intentsVol, Q.nbCharts, Q.btc], T4L: [Q.intentsVol, Q.nbCharts, Q.btc],
  T5: [Q.nbIntentsDaily, Q.nbCharts, Q.rpc, Q.nbIntentsCount], T6: [Q.market], T7: [Q.market, Q.intentsVol],
  T8: [Q.nonces, Q.nearKeys, Q.groundTruth], T9: [Q.oneClick, Q.relay], C1: [Q.holders, Q.chainRev, Q.intentsFees, Q.supply, Q.buybackLedger, Q.revenueWallets, Q.protocolFee, Q.nbStats, Q.hsp029], F1: [Q.intentsVol], F2: [Q.nbIntentsDaily, Q.nbCharts], F3: [Q.market],
  c1: [Q.intentsVol, Q.nbCharts], c2: [Q.intentsVol, Q.nearDex], c3: [Q.intentsFees, Q.chainFees], c4: [Q.intentsVol, Q.nbCharts],
  c5: [Q.market], c6: [Q.nbIntentsDaily, Q.nbCharts], c7: [Q.oneClick, Q.relay], c8: [Q.nonces, Q.nearKeys, Q.groundTruth], c9: [Q.market, Q.intentsVol], c10: [Q.intentsFees, Q.holders, Q.chainRev, Q.supply, Q.nbStats], P1: [Q.sample, Q.oneClickTokens], c11: [Q.sample, Q.oneClickTokens], P2: [Q.accounts], c12: [Q.accounts], P3: [Q.corridors], c13: [Q.corridors],
};

const pending = (v) => `Pending: scored on ${v.window?.[0] ?? '2026-11-02'} → ${v.window?.[1] ?? '2026-11-12'} data${v.baseline ? ` against ${v.baseline[0]} → ${v.baseline[1]}` : ''} (PREREG.md).`;

// screen 6 (11-08): C1 is one test with three findings; the README table and the dashboard card show them as three rows
// (C1 vs issuance · C1 cross-check · C1 protocol fee), results.json keeps one C1 entry.
function c1Parts(t) {
  const v = t.value || {};
  if (!t.value) return [['C1', 'Not built: the C1 raw files are missing (run node build.mjs).']];
  const main = `In the 90 days to ${v.window[1]}, ${usd(v.buyback_90d)} of Intents revenue bought NEAR back (${pct(v.buyback_share_of_intents_fees, 1)} of Intents' fees) and gas burn added ${usd(v.burn_90d)}: ${usd(v.captured_usd_per_year)} a year, ${pct(v.capture_yield, 2)} of NEAR's market cap. NEAR's supply grew ${pct(v.net_issuance_rate, 1)} a year net of burns (${usd(v.net_issuance_usd_per_year)}); the buyback is ${pct(v.buyback_vs_net_issuance)} of that.`
    + (v.buyback_vs_net_issuance_direct ? ` Counting only the NEAR that reached the buyback multisig straight from intents.near in the same window (${pct(v.ledger.window.intents_share_of_implied)} of what the series implies), it is ${pct(v.buyback_vs_net_issuance_direct)}, a lower bound. The 50% bar (THESIS.md) is read on the series figure, ${pct(v.buyback_vs_net_issuance)}, as preregistered.` : '');
  const check = (v.buyback_wallet_vs_implied ? `The buyback wallet holds ${pct(v.buyback_wallet_vs_implied)} of the NEAR the series would have bought at daily prices${v.ledger ? '' : ' (outflows not decoded)'}.` : '')
    + (v.ledger ? ` ${ledgerSentence(v.ledger)}` : '') + (v.wallets ? walletsSentence(v.wallets) : '');
  return [['C1', main], ...(check.trim() ? [['C1 cross-check', check.trim()]] : []), ...(v.protocol_fee ? [['C1 protocol fee', protocolFeeSentence(v.protocol_fee).trim()]] : [])];
}
/** The findings of one test as [row label, text] pairs: one pair, except C1 (three). */
export const sentenceParts = (t) => (t.id === 'C1' ? c1Parts(t) : [[t.id, sentence(t)]]);
export function sentence(t) {
  const v = t.value || {};
  switch (t.id) {
    case 'T1': return `Over the last 6 full months (${v.months[0]} → ${v.months.at(-1)}), NEAR Intents settled ${pct(v.intents_share_of_near_dex_volume_6m)} of NEAR's DEX volume. From ${v.from} to ${v.to}, NEAR's daily transactions fell ${pct(-v.txns_per_day_change)} and its active accounts ${pct(-v.active_accounts_change)}, while monthly Intents volume grew ${Math.round(v.intents_volume_multiple)}×.`;
    case 'T2': return `Intents settled ${usd(v.last90)} in the 90 days to ${v.to}, ${v.ratio.toFixed(2)}× the ${usd(v.prior90)} of the 90 days before.${v.cross_check_vs_nearblocks_txns ? ` Cross-check: DefiLlama's daily volume moves with NearBlocks' independent daily count of intents.near transactions (r = ${v.cross_check_vs_nearblocks_txns.r_daily_log_changes.toFixed(2)} for daily changes over ${v.cross_check_vs_nearblocks_txns.n} days).` : ''}`;
    case 'T3': return `In the last 90 days the NEAR protocol earned ${usd(v.near_chain_fees_90d)} in fees, ${pct(v.ratio, 1)} of the ${usd(v.intents_fees_90d)} that NEAR Intents earned. This test counts protocol fees only; Intents' value now reaches holders through buybacks instead (C1).`;
    case 'T4': return `Over ${v.weeks} weeks (${v.from} → ${v.to}), weekly changes in NEAR's price and in Intents volume are uncorrelated (r = ${Math.abs(v.r) < 0.005 ? '0.00' : v.r.toFixed(2)}).`;
    case 'T4L': {   // 2026-11-09, post-lock REPORT
      const wk = (k) => `${k} week${k === 1 ? '' : 's'}`, sg = (r) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}`, b = v.best, ld = v.volume_leads_best, rk = v.rank;
      const dir = b.k > 0 ? `Intents volume leading by ${wk(b.k)}` : b.k < 0 ? `NEAR's price leading by ${wk(-b.k)}` : 'in the same week';
      const leads = Math.abs(ld.r) > v.band95 ? `Intents volume leads NEAR's price by ${wk(ld.k)} (r = ${sg(ld.r)}, above the chance band)` : `Intents volume does not lead NEAR's price at any lag from 1 to ${v.max_lag} weeks (strongest r = ${sg(ld.r)}, at +${ld.k})`;
      const strongest = b.k === ld.k ? '' : ` The strongest link at any lag is r = ${sg(b.r)}, ${dir}; ${v.p_fw < 0.05 ? `it clears the family-wise band (${v.band95.toFixed(2)} from all ${v.shifts} allowed circular shifts of the volume series, p = ${v.p_fw.toFixed(2)})` : `it does not clear the family-wise band (${v.band95.toFixed(2)}, p = ${v.p_fw.toFixed(2)})`}${v.p_fw < 0.05 ? (rk.p_fw < 0.05 && rk.best.k === b.k ? ', and on ranks too' : ` but not on ranks (Spearman ${sg(rk.best.r)} vs its band ${rk.band95.toFixed(2)}, p = ${rk.p_fw.toFixed(2)}), so we read it as fragile`) : ''}.`;
      return `Over ${v.weeks} weeks, with BTC's moves taken out, ${leads}.${strongest} Added after the lock; T4 and T4m are unchanged.`;
    }
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
    case 'C1': return c1Parts(t).map(([, s]) => s).join(' ');
    case 'P1': return !t.value ? 'Not sampled yet (run node sample-intents.mjs).' : `From ${v.blocks} random blocks over ${v.days} days (${v.intents_txs} transactions to intents.near): ` + ['transfer', 'token_diff', 'withdraw'].map((k) => {
      const x = v.kinds[k]; return x.n ? `${k}${k === 'transfer' ? ' (mostly fee payouts, see THESIS.md)' : ''} n=${x.n}, ${pct(x.share_under_50)} under $50, ${pct(x.share_under_10)} under $10, median ${usd(x.median_usd)}` : `${k} n=0`;
    }).join('; ') + '. Agent-size describes the ticket, not who sent it.';
    case 'P2': {
      if (!t.value) return 'Not sampled yet (run node sample-accounts.mjs).';
      const n = v.now, sp = v.spring, l = sp.left[0], k = n.intent_account_kinds || {};
      const per = (x) => (x >= 10 ? x.toFixed(0) : x.toFixed(1));
      return `In ${n.blocks} random blocks over the ${n.days} days to ${ymd(v.sampled_at)}, ${n.intents_txs} transactions went to intents.near, signed by ${n.intents_tx_signers} accounts (the top 3 signed ${pct(n.intents_top_signers_share)}). `
        + `In the same blocks intents.near's dip4 events named ${n.intent_accounts} distinct accounts (${k.implicit || 0} implicit, ${k.eth || 0} 0x, ${k.named || 0} named; not matched to the transactions, and they include solver legs); ${n.intent_accounts_also_signers} of them signed any sampled transaction. `
        + `Spring 2026, ${sp.before.blocks} random blocks a week: NEAR carried ${per(sp.before.txs_per_block)} transactions a block in ${sp.before.from}..${sp.before.to.slice(5)} and ${per(sp.after.txs_per_block)} in ${sp.after.from}..${sp.after.to.slice(5)}`
        + (l && l.share_of_drop !== null ? `; ${l.parent} alone went from ${per(l.before_per_block)} a block to ${l.after_per_block === null ? `at most ${l.after_max_per_block.toFixed(2)} (out of the top-12 list)` : per(l.after_per_block)}, `
          + `${l.after_per_block === null ? `${(100 * l.share_of_drop_min).toFixed(1)}–${pct(Math.min(1, l.share_of_drop), 1)}` : pct(Math.min(1, l.share_of_drop))} of the drop.` : '.')
        + ' Added after the lock; a report, not scored.';
    }
    case 'P3': {
      if (!t.value) return 'Not quoted yet (run node quote-corridors.mjs).';
      const s = v.summary, b = s.by_size, p = (x) => `${x < 0.1 ? x.toFixed(3) : x.toFixed(2)}%`, $ = (n) => `$${n.toLocaleString('en-US')}`;
      const all = v.corridors.flatMap((c) => c.rows.flatMap((r) => [r.intents_pct, r.relay_pct])).filter(Number.isFinite);
      const parts = v.corridors.map((c) => c.route.split(' -> ')), chains = [...new Set(parts.flat().map((x) => x.split(' ')[0]))], assets = [...new Set(parts.flat().map((x) => x.split(' ').slice(1).join(' ')))];
      const lo = b[100], hi = b[10000], refused = s.intents_refused, msg = refused[0]?.message;
      const pr = v.minimum_probe ?? [], prNo = pr.filter((m) => !m.quoted), prOk = pr.filter((m) => m.quoted);
      const bscOnly = prNo.length && prNo.every((m) => /BSC/.test(m.route)) && !prOk.some((m) => /BSC/.test(m.route));
      return `On ${v.corridors.length} mainstream corridors (${assets.join(' and ')} between ${chains.join(', ')}; one asset per corridor, cost read in token units, BSC's Binance-Peg USDC taken at par), dry quotes of ${day(v.quoted_at)}: `
        + `every quote cost ${p(Math.min(...all))}–${p(Math.max(...all))} of the amount. NEAR Intents was cheaper on ${s.intents_cheaper} of the ${s.quoted_both} tickets both venues quoted`
        + (lo?.quoted_both ? ` (${lo.intents_cheaper} of ${lo.quoted_both} at $100, median ${p(lo.intents_median_pct)} vs Relay ${p(lo.relay_median_pct)}` : '')
        + (hi?.quoted_both ? `; at $10,000 ${p(hi.intents_median_pct)} vs ${p(hi.relay_median_pct)})` : lo?.quoted_both ? ')' : '') + '. '
        + (refused.length ? `1Click refused ${refused.map((r) => `${$(r.usd)} on ${(v.corridors.find((c) => c.id === r.corridor)?.route ?? r.corridor).replace(' -> ', ' → ')}`).join(', ')}${msg ? ` ("${msg}")` : ''}. ` : ' 1Click quoted every ticket. ')
        + (pr.length ? `The same $100 quote was refused ${prNo.length ? prNo.map((m) => m.route.replace(' -> ', ' → ')).join(', ') : 'nowhere'} and accepted ${prOk.length ? prOk.map((m) => m.route.replace(' -> ', ' → ')).join(', ') : 'nowhere'}${bscOnly ? ', so the minimum follows BSC, not NEAR Intents as a whole' : ''}.` : '')
        + ' Added after the lock; a report, not scored.';
    }
    case 'F1': return v.status !== 'scored' ? pending(v) : `Intents settled ${usd(v.w)} in the window against ${usd(v.b)} in the 11 days before.`;
    case 'F2': return v.status !== 'scored' ? pending(v) : `Intents received ${pct(v.w, 1)} of NEAR's transactions in the window against ${pct(v.b, 1)} in the 11 days before.`;
    case 'F3': return v.status !== 'scored' ? 'Pending: Agent Market jobs per day on 2026-11-07 → 11-13 against 2026-11-02 → 11-07 (PREREG.md).' : `Agent Market listings delivered ${v.jobs_per_day_second.toFixed(1)} jobs a day in the second part of the window against ${v.jobs_per_day_first.toFixed(1)} in the first.`;
    default: return '';
  }
}
