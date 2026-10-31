# THESIS (v0, claim locked 2026-10-31 13:20Z)

## The claim

**NEAR's long-term investment case is a bet that NEAR Intents becomes the default settlement layer for cross-chain money moved by software, including autonomous agents.**

We test three halves of that bet separately. We expect them to come out differently:

1. **Usage.** NEAR's activity has changed form. Count metrics (transactions, active accounts) collapsed, while value settled through NEAR Intents grew by orders of magnitude and now dominates NEAR's trading volume.
2. **Value capture.** That usage does **not yet** accrue to the NEAR token in a measurable way: protocol fees are small next to Intents' own fees, and NEAR's price does not move with Intents volume.
3. **Agents.** Agent-native demand on NEAR (the NEAR AI Agent Market) is real but still tiny relative to Intents. A live autonomous agent's own money flow shows what share of an agent's activity is the cross-chain kind that Intents is built for.

An investment thesis that is judged on evidence has to say which half is proven and which is hope. That is what the tests below decide.

## What we looked at before locking (disclosure)

On 2026-10-31, before writing this file, we explored:
- DefiLlama's NEAR Intents and NEAR-chain series;
- NearBlocks' daily charts.

One exploratory result is already known and is reported as **evidence against**, not hidden:
- Weekly log-changes of NEAR price show **no correlation** with weekly log-changes of NEAR Intents volume (r ≈ 0.00), active accounts (≈ −0.05) or transactions (≈ 0.00), over 94 weeks from 2025-01-06.
- In levels, price vs Intents volume is negatively related (r ≈ −0.49), because Intents grew through 2025 while price fell.
- We therefore do **not** claim that price follows Intents.

## Pre-registered tests

The rebuild pipeline computes each test from raw data and prints PASS/FAIL. The thresholds below are fixed now.

| id | question | measure (source) | PASS if | half |
|---|---|---|---|---|
| T1 | Did NEAR's usage shift from counts to settled value? | Intents share of NEAR DEX volume, trailing 6 months (DefiLlama `near-intents` / `dexs/near`); change of NEAR daily txns and active accounts, Jan 2025 → last full month (NearBlocks charts); change of Intents monthly volume over the same span | share ≥ 0.70 **and** count metrics down ≥ 50% **and** Intents volume up ≥ 50× | usage |
| T2 | Is the settlement flow still growing? | Intents volume, the 90 days to the last full day vs the 90 days before (DefiLlama) | ratio ≥ 1.0 | usage |
| T3 | Does the value reach the NEAR protocol? | NEAR chain fees ÷ NEAR Intents fees, last 90 days (DefiLlama fees) | ratio ≥ 0.25 (expected FAIL) | capture |
| T4 | Does NEAR's price move with the usage that grew? | corr(weekly Δlog NEAR price, weekly Δlog Intents volume), 2025-01-06 → last full week (DefiLlama + NearBlocks price) | r ≥ 0.20 (expected FAIL; see disclosure) | capture |
| T5 | How much of NEAR's on-chain traffic is Intents right now? | Δ `intents.near` tx counter ÷ Δ network tx counter between hourly snapshots (NearBlocks), cross-checked against txs with receiver `intents.near` in hourly RPC block samples (`collect.mjs`) | reported, no threshold. The two methods already disagree (~4% vs ~20% on 10-31) and the pipeline reports both | usage |
| T6 | Is agent-native demand on NEAR growing? | NEAR AI Agent Market: delivered jobs and live listings in hourly snapshots 2026-10-31 → 2026-11-12; listing growth by `created_at` since July | delivered jobs grow ≥ 20% over the window | agents |
| T7 | How big is agent commerce next to Intents? | Agent Market delivered jobs × a stated price assumption vs Intents volume over the same days | reported as an order of magnitude; no threshold | agents |
| T8 | What share of a live agent's money flow is cross-chain? | claude-10x's own wallet: sent-transaction counts per chain, re-read from public RPCs (anyone can check them with `eth_getTransactionCount`), plus every bridge it sent, each listed with its tx hash in `data/agent-ground-truth.json`. One agent, so this is ground truth, not a sample | reported as a share, with n and per-bridge cost | agents |
| T9 | What does a cross-chain move cost at agent ticket sizes, through NEAR Intents vs the route the agent actually used? | Dry price quotes on the agent's own real route (Robinhood Chain ETH → BSC BNB) at $0.47 / $2 / $30 / $1,000 / $5,000: NEAR Intents 1Click (`dry: true`) vs Relay. Re-quoted on every online build and recorded hourly by `collect.mjs` | reported, **not scored**. Added on 2026-10-31 ~13:45Z, after the first probe had already shown the result, so it can't be a fair pre-registered test | agents |

## Findings added after the lock (disclosed)

**T9's first probe (2026-10-31 13:10Z) returned this for every ticket under $1,000:**

> `HTTP 400 "Temporary swap limits: minimum swap amount is $1,000"`

Measured cost by ticket size on the agent's real route:

| ticket | NEAR Intents (1Click) | Relay |
|---|---|---|
| $0.47 | refused | 5.3% |
| $2 | refused | 1.8% |
| $30 | refused | 0.87% |
| $1,000 | **0.33%** | 0.81% |
| $5,000 | **0.26%** | 0.81% |

So where Intents works on this route, it is ~2.5–3× cheaper than the bridge the agent used. **But its minimum is far above both bridges the agent sent before 10-31**: $0.47 on this route, and $2.02 to Somnia, a chain 1Click does not list.

**Second finding (2026-10-31 ~17:05Z): the minimum is per route, not general.** On the agent's second real route, Robinhood Chain USDG → NEAR (1Click delivers `wrap.near` as native NEAR), every ticket size was accepted:

| ticket | NEAR Intents (1Click), hood USDG → NEAR, range over 2–3 quote sets 16:59–17:03Z |
|---|---|
| $0.47 | 0.53–0.61% |
| $2 | 0.29–0.42% |
| $30 | 0.41–0.67% |
| $1,000 | 0.55–0.72% |
| $5,000 | 0.54–0.73% |

The quoted time to settle was 25–27 s. The agent also used this route for real: at 16:56Z it sent 1 USDG through 1Click to fund its own NEAR account. The account did not exist before; it received 0.21992 native NEAR. From the Robinhood deposit (16:56:25Z) to the NEAR transfer (16:56:39Z) took 14 s. That move is listed in `data/agent-ground-truth.json`. Relay has no NEAR route, so there is no comparison column.

What this changes: the gate is a property of the ETH → BSC route, not of NEAR Intents as a whole. Small agent tickets *into NEAR* settle today, at about the cost of Relay's mid-size tickets on the other route. Quotes move by a few tenths of a percent within minutes, so the dashboard shows each build's own quote set. One more observation: on the ETH → BSC route the $1,000 ticket sits on the limit and was refused in the 17:03Z set, when 1Click priced the ETH just under $1,000. `collect.mjs` records a $30 probe on both routes hourly.

**T8 extension (2026-10-31 ~19:40Z): the agent's own NEAR account is counted too.** The 1Click move above created a NEAR account for the agent. From 19:18Z that account sends transactions of its own, and T8 now counts them in its denominator. NEAR has no `eth_getTransactionCount`, so the count is read from the account's access-key nonce over public RPC. A new key's nonce starts at a round multiple of 10⁶ fixed when the key is added, and each included transaction adds 1, so sent = nonce mod 10⁶, summed over the account's keys. NearBlocks' transaction count for the account is recorded next to it as a cross-check. On 10-31 both read 3 (one failed with "Not enough storage balance", and as on EVM, a failed transaction still counts as sent). None of them is cross-chain, so T8's cross-chain count is unchanged and the share moves from 3/498 to 3/501 (0.6% either way). **Disclosure:** every one of these NEAR transactions is the companion project, run by the same agent, writing its records to SocialDB (`social.near`). They show that the agent can use NEAR directly, but they are not independent evidence of agent demand on NEAR, and T6/T7 do not use them.

**T5 note (2026-10-31 ~20Z): the counter method reads an estimate, and a third method agrees with the RPC sample.** The `intents.near` count that T5's counter method takes deltas of is, by NearBlocks' own API spec, an estimated count. Its hourly deltas therefore track the estimate, not traffic, which explains the low ~4%. NearBlocks also publishes daily per-account statistics (`/v3/accounts/intents.near/stats/txns`). Divided by NearBlocks' daily network transactions, they give 15% for 2026-10-24 → 10-30 (12–21% by day), against 14% in our own RPC block samples (784 transactions over 9 samples). T5 now reports the daily-stats share and the RPC-sample share as its measurements, and the counter share under a name that says it is estimated. T5 has no threshold, so no verdict changes.

## What would change our mind

- **Usage:** Intents' share of NEAR DEX volume falls below 0.50 in any month, or 90-day Intents volume drops by more than half (T2 < 0.5).
- **Capture (the bullish side):** NEAR protocol fees reach ≥ 25% of Intents fees, or a documented mechanism routes Intents fees to NEAR holders or stakers. That would make usage a valuation argument.
- **Agents:** Agent Market delivered jobs grow ≥ 20% a week, sustained through the window. That would mean agent demand is emerging rather than anecdotal.
- **Agents (T9):** the 1Click minimum drops below ~$10 at a cost near its $1,000 rate (≤ 0.5%). That would remove the gate that keeps small agent tickets off Intents. *Status 2026-10-31:* partly met, on one route only. Hood USDG → NEAR has no minimum and costs 0.3–0.7% depending on the quote, so it is under 0.5% only some of the time. Hood ETH → BSC still refuses anything under $1,000.

## Data limits (stated up front)

- DefiLlama's NEAR Intents volume is produced by DefiLlama's adapter; we do not re-derive it from chain data.
- NearBlocks' `active_accounts` and `txns` are NearBlocks' definitions.
- NearBlocks' per-method counters for `intents.near` looked frozen on 10-31, so they are recorded but not used.
- The Agent Market job board and competitions need a login, so job prices and unfilled demand are not observable. Only delivered-job counts are.
- **Why small tickets cost more (T9).** Same-chain dry quotes on Robinhood Chain (ETH → USDG through 1Click, 2026-10-31 17:40Z) cost 1.96% at $5, 0.66% at $20 and 0.36% at $100. That fits a fixed ≈ $0.075 per swap plus ≈ 0.29% of the ticket. Of the 0.29%, 0.2% is 1Click's fee for callers without a partner key (HACKATHON.md Q-006). The fixed part behaves like the bridge's per-withdrawal cost. We did not see the split directly, so this is a fit to three points, not a fee schedule. It is consistent with the per-route result above. The hood USDG → NEAR route, which never withdraws back to Robinhood Chain, costs a flat ~0.3–0.7% even at $0.47, where a $0.075 fixed part alone would be 16%. So for agent-size tickets, what matters is whether the route ends with a bridge withdrawal, not the ticket size alone.
- **Agent activity is not labelled on either source.** The agent's own NEAR account (T8) appears nowhere in the Agent Market: all 527 listings identify the builder and owner by a platform UUID, and none has a field that links it to a NEAR account (the few `.near` names that appear are in free-text descriptions). On NearBlocks the account is an ordinary implicit account with no label. So T6/T7 measure what is sold through the Agent Market, not what agents do on chain. Agent transactions are counted in T1's totals like everyone else's, without being identified as agent activity.
- **NearBlocks' per-account counts are estimates for busy accounts.** Its API spec titles them "Get estimated account transaction count", and for large accounts the response carries a query-planner `cost` next to the count (a small account, such as the agent's, gets an exact count with no `cost`). The `txns` variant also counts receipt rows, not transactions: 8 for the agent's 4 transactions. So T5's hourly counter method is kept for the record, but it is not used as a measurement (see the T5 note above).
- Anything we cannot compute from these sources is written here as unknown, never estimated silently.
