# THESIS (v0, claim locked 2026-10-31 13:20Z)

## The claim

**NEAR's long-term investment case is a bet that NEAR Intents becomes the default settlement layer for cross-chain money moved by software, including autonomous agents.**

We test three halves of that bet separately. We expect them to come out differently:

1. **Usage.** NEAR's activity has changed form. Count metrics (transactions, active accounts) collapsed, while value settled through NEAR Intents grew by orders of magnitude and now dominates NEAR's trading volume.
2. **Value capture.** That usage does **not yet** accrue to the NEAR token in a measurable way: protocol fees are small next to Intents' own fees, and NEAR's price does not move with Intents volume.
3. **Agents.** Agent-native demand on NEAR (the NEAR AI Agent Market) is real but still tiny relative to Intents. A live autonomous agent's own money flow shows what share of an agent's activity is the cross-chain kind that Intents is built for.

An investment thesis that is judged on evidence has to say which half is proven and which is hope. That is what the tests below decide.

> **Correction (2026-10-31 ~21:40Z, after the lock).** Half 2 above is wrong as written. A NEAR Intents fee switch went live on **2026-02-23**: since then, NEAR's captured share of Intents fees buys NEAR on the open market. Our own falsifier for this half ("a documented mechanism routes Intents fees to NEAR holders", below) was therefore already met when we locked the claim, and we missed it. In the 90 days to 2026-10-30 the buyback took **27.6% of Intents' fees ($4.7M)**. Measured against the token, it is small: about **0.35% of market cap a year**, and about **13% of the NEAR that net issuance adds**. The claim text stays as locked; T3 stays as registered (it counts protocol fees only, and fails); the new test **C1** measures the buyback. Details in "Findings added after the lock".

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

**How to read these tests.** T1 and T2 thresholds were set after the exploration disclosed above, and they sit below the values we had seen, so read them as descriptions of the past, not as tests that could have failed. T6's measure is cumulative: 20% more delivered jobs shows that demand exists, not that it is growing. The tests that can fail on data that did not exist when they were written are T6 and the forward tests **F1–F3** in [`PREREG.md`](PREREG.md) (registered 2026-10-31, scored on 2026-11-02 → 11-12 against the 11 days before, hash anchored on NEAR mainnet).

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

**Fee switch (found 2026-10-31 ~21:40Z): value capture exists, through buybacks.** While checking our capture falsifier before publishing, we found that NEAR Intents activated a fee switch on 2026-02-23. Captured Intents revenue is swept into NEAR's revenue wallets and buys NEAR on the open market. DefiLlama publishes it as the `dailyHoldersRevenue` series of `near-intents` ("NEAR's captured Intents revenue is used to buy back $NEAR on the open market (not burned)"; DefiLlama says the series reconciles with revenue.near.org and the on-chain buyback). The bought-back NEAR sits in `buybacks.multisignature.near`, which held 2.14M NEAR on 10-31 by RPC `view_account`, so total supply still counts it. **C1** (REPORT, not scored, added after the lock) puts it next to the token:
- over the same 90 days as T3: buyback revenue ÷ Intents fees, and (buyback + NEAR's gas burn) annualized ÷ market cap (NearBlocks `/v1/stats`, circulating supply × price);
- NEAR's net issuance: total supply from two archival block headers about 90 days apart (it is already net of the gas burn), annualized by the headers' own timestamps, and the annualized buyback ÷ that issuance in USD at NearBlocks' price.

On 10-31: buyback 27.6% of Intents fees; captured value 0.35% of market cap a year; net issuance 2.5% of total supply a year (≈ $143M); buyback ≈ 13% of it. NEAR's Q3 2026 report gives a trailing 30-day capture rate of 28.4% (as reported by [TokenPost](https://www.tokenpost.com/news/technology/36730)), consistent with DefiLlama's 27.6% over 90 days. T3 is unchanged and still FAILs on its own measure: it asked whether *protocol fees* capture the value, and they do not. T4 (price vs volume, r ≈ 0) covers the buyback months too.

**P1, registered 2026-10-31 ~23:10Z before its sample was drawn: how large are the intents NEAR Intents executes?** T8 and T9 rest on one agent. P1 asks how much of all Intents activity is the size such an agent moves. `sample-intents.mjs` picks about 300 block heights at random over the 7 days before it runs (seeded by the head height, which it records), reads every transaction sent to `intents.near` in those blocks over public archival RPC, and sizes each executed intent in USD at 1Click's token prices at run time. Sizes are reported per kind and never merged:
- **transfer**: the 1Click path, where a user's tokens move to a solver;
- **token_diff**: swap legs, sized by the side the account gives (a swap shows a user leg and a solver leg);
- **withdraw**: tokens leaving Intents.
The fixed cutoffs are **agent-size: under $50** (the agent's own tickets were $0.47 to $2.02) and **under $10**. For each kind P1 reports n, the share under each cutoff and the median, and counts unpriced legs instead of guessing them. It is a REPORT with no threshold. "Agent-size" describes a ticket, not who sent it: chain data cannot tell agents from people (see Data limits).

**P1 result (2026-11-01 ~00:10Z).** The sample drawn from 22:01Z to 00:09Z: 300 random blocks over the 7 days to 2026-10-31, 1,103 transactions, 163 of them to `intents.near`, 357 executed intents, 2 legs unpriced.
- **Swap legs** (`token_diff`, n = 98): 48% under $50, 26% under $10, median $65.
- **Withdrawals** (n = 55): 47% under $50, 21% under $10, median $68.
- **Transfers** (n = 204): 85% under $50, 79% under $10, median $0.29.
The transfer result made us look closer, and this check came *after* seeing the result. We re-read 14 of the sampled blocks: 24 of 30 transfers there went to a few recurring implicit accounts, median $0.01. They are fee or affiliate payouts inside the same transactions, not users' tickets to solvers. So the registered "transfer" kind does not measure ticket size, and we read P1 from swap legs and withdrawals: **about half of what NEAR Intents executes is agent-size (under $50), and a fifth to a quarter is under $10.** Small tickets are not an edge case, which is why T9's per-route minimum matters. The same re-read also saw the NEAR AI Agent Market's escrow (`escrow.ai.near` → `treasury.ai.near`) settle through `intents.near`, so agent commerce already uses Intents for settlement. We did not measure how much.

**HSP-029, NEAR's issuance cut (added 2026-11-05, after an independent comparison with the other thesis entries showed we had left it out).** House of Stake proposal 29 ([gov.near.org/t/42644](https://gov.near.org/t/42644)) lowers NEAR's maximum annual issuance from 2.5% to 1.6% on a 24-month per-epoch ramp. On chain (`vote.dao` `get_proposal`, stored by the build in `data/raw/hsp029-vote.json`), on 2026-11-05: 99.97% of the votes for, turnout 62% of the snapshot, status Timelock until 2026-11-16 16:48Z. No on-chain action is attached, so the ramp needs a protocol upgrade and has no start date yet. Our measured gross issuance (net supply growth plus the gas burn) was 2.48% a year, which fits the 2.5% cap. If the ramp runs in full, the same buyback covers a larger share of net issuance (C1; burn and buyback held constant; both shares, rebuilt with the data, are in **Status now** below; on 2026-11-05 they were 26% and 16%). In the model (`node model.mjs --issuance hsp029`), if the ramp started now, the bar (half of net issuance) is reached in 2028-Q4 at the fade the data implies (never within 10 years without the cut), and in 2027-Q3 at the 2-quarter default. The results block regenerates these numbers on every build. This is a REPORT line: no registered test or threshold changed.

**T4m, T4 with the crypto market taken out (added 2026-11-05, after the same comparison: the registered T4 is a raw correlation with no p-value and no market control).** We regress NEAR's weekly log price change on BTC's (BTC daily price from DefiLlama's coins API, `data/raw/defillama-btc-price.json`) and correlate what is left with Intents volume's weekly log change, over the same 95 weeks as T4. On 2026-11-05: BTC explained 34% of NEAR's weekly moves (beta 1.42), and the remainder did not track Intents volume (r = −0.03, two-sided permutation p = 0.79, 10,000 shuffles, fixed seed; the raw r was −0.004, p = 0.97). So T4's reading survives the control: in this window NEAR's price is not paid for by Intents usage, with or without the market. Limits: weekly changes are not perfectly independent, which weakens the permutation test's assumption; one control (BTC) only. The results block regenerates these numbers on every build. This is a REPORT line: T4's registered rule and verdict are unchanged.

## Status now (generated)

<!-- status:start -->
Generated by `node build.mjs` from the data through 2026-11-04; `node build.mjs --check` fails if this block differs from the build.
- **T9, agent-size tickets into NEAR:** Robinhood Chain ETH → BSC BNB: NEAR Intents refused $0.47, $2, $30 and accepted the rest at 0.32–0.38%. Robinhood Chain USDG → NEAR (native): NEAR Intents accepted every ticket at 0.13–0.34%. (quotes of 2026-11-05 22:34Z)
- **C1, buyback vs new NEAR supply:** the buyback covers 16% of net issuance (90 days to 2026-11-04); with HSP-029's cut to 1.6% fully ramped, the same buyback would cover 26% (burn and buyback held constant). The bar in "What would change our mind" is 50%.
- **HSP-029 on chain (vote.dao, read 2026-11-05T22:34Z):** status Timelock, 99.97% of votes for, turnout 62%; timelock ends 2026-11-16T16:48Z; no actions attached, so no start date for the ramp yet.
- **T4m, T4 with the crypto market taken out:** Over 95 weeks, BTC explains 34% of NEAR's weekly price moves (beta 1.42). What is left after that does not track Intents volume (r = -0.03, p = 0.79; before removing BTC, r = -0.00, p = 0.97). Added after the lock; T4 itself is unchanged.
- **Model** (`node model.mjs`, every assumption is a flag): starting from today's 16%, at the fade the data implies (Intents' growth halving about every 1.0 quarters, see below) the buyback reaches half of net issuance not within 10 years; with a slower fade, halving every 2 quarters (the default flag), in 2027-Q4 (4 quarters); with no further growth it stays at 16%; if the measured 1.80× per 90 days never fades, in 2027-Q2 (2 quarters). A scenario, not a forecast. The measured quarter-on-quarter growth went 6.3× → 5.7× → 2.3× → 0.7× → 1.1× → 1.8×; fading from the oldest quarter to the latest four implies a half-life of about 1.0 quarters, so the 2-quarter default is on the generous side. The bought-back NEAR sits in a multisig (held, not burned); `--resold` models some of it returning to market. If HSP-029 (max issuance 2.5% → 1.6% over 24 months; House of Stake vote 99.97% for, timelock until 2026-11-16; no start date set) began its ramp now: at the implied fade, in 2028-Q4 (8 quarters); at the 2-quarter default, in 2027-Q3 (3 quarters).
<!-- status:end -->

## What would change our mind

- **Usage:** Intents' share of NEAR DEX volume falls below 0.50 in any month, or 90-day Intents volume drops by more than half (T2 < 0.5).
- **Capture (the bullish side):** NEAR protocol fees reach ≥ 25% of Intents fees, or a documented mechanism routes Intents fees to NEAR holders or stakers. That would make usage a valuation argument. *Status 2026-10-31: MET before the lock, by the 2026-02-23 fee switch (we missed it; see the correction above). Buyback + burn = 29% of Intents fees (C1), above the 25% bar.*
- **Capture, next bar (added 2026-10-31 with C1):** the buyback reaches **half of NEAR's net issuance** over a 90-day window (C1 `buyback_vs_net_issuance` ≥ 0.5; 0.13 on 10-31). Below that, holders are still diluted faster than usage buys NEAR back.
- **Agents:** Agent Market delivered jobs grow ≥ 20% a week, sustained through the window. That would mean agent demand is emerging rather than anecdotal.
- **Agents (T9):** the 1Click minimum drops below ~$10 at a cost near its $1,000 rate (≤ 0.5%). That would remove the gate that keeps small agent tickets off Intents. *Status 2026-10-31:* partly met, on one route only. Hood USDG → NEAR has no minimum and costs 0.3–0.7% depending on the quote, so it is under 0.5% only some of the time. Hood ETH → BSC still refuses anything under $1,000. *Status 2026-11-05:* moved back. Hood USDG → NEAR quoted every agent-size ticket from 10-31 to 11-05 06:34Z (0.29–1.56% under $50), then from the 09:05Z refresh refused every size ("Quoting for this pair is not available"), and from the 16:07Z hourly probe on quoted again (`data/snapshots.jsonl`); ETH → BSC still refuses under $1,000. The current T9 status is in **Status now** above, generated by the build. The dashboard's T9 sentence is now computed from the latest quotes (until 11-05 it was a fixed string, which an independent screen caught contradicting the T9 table).

## Data limits (stated up front)

- **Intents volume comes from one pipeline: NEAR's own.** DefiLlama's `near-intents` volume adapter is a single query, `SELECT sum(volume_amount_usd) FROM dune.near.dataset_near_intents_metrics`, on a Dune dataset published by NEAR (DefiLlama/dimension-adapters `dexs/near-intents/index.ts`, read 2026-10-31). So when DefiLlama's September 2026 total ($4.80B) equals the September record NEAR reports, that is one pipeline agreeing with itself, not two sources. T1, T2, T7 and F1 depend on it. We did not re-derive volume from chain data: on chain, 1Click swaps settle mostly as transfers to solvers rather than swap events, and reconstructing "volume" would need definitions we cannot verify. The independent check we can make is on direction: over the 100 days NearBlocks publishes, DefiLlama's daily volume moves with NearBlocks' own daily count of `intents.near` transactions (r = 0.68 for daily log changes, 0.73 for log levels; T2 reports it). That is evidence the series tracks real activity, not a check of its dollar level.
- NearBlocks' `active_accounts` and `txns` are NearBlocks' definitions.
- NearBlocks' per-method counters for `intents.near` looked frozen on 10-31, so they are recorded but not used.
- The Agent Market job board and competitions need a login, so job prices and unfilled demand are not observable. Only delivered-job counts are.
- **Why small tickets cost more (T9).** Same-chain dry quotes on Robinhood Chain (ETH → USDG through 1Click, 2026-10-31 17:40Z) cost 1.96% at $5, 0.66% at $20 and 0.36% at $100. That fits a fixed ≈ $0.075 per swap plus ≈ 0.29% of the ticket. Of the 0.29%, 0.2% is 1Click's fee for callers without a partner key (HACKATHON.md Q-006). The fixed part behaves like the bridge's per-withdrawal cost. We did not see the split directly, so this is a fit to three points, not a fee schedule. It is consistent with the per-route result above. The hood USDG → NEAR route, which never withdraws back to Robinhood Chain, costs a flat ~0.3–0.7% even at $0.47, where a $0.075 fixed part alone would be 16%. So for agent-size tickets, what matters is whether the route ends with a bridge withdrawal, not the ticket size alone.
- **Agent activity is not labelled on either source.** The agent's own NEAR account (T8) appears nowhere in the Agent Market: all 527 listings identify the builder and owner by a platform UUID, and none has a field that links it to a NEAR account (the few `.near` names that appear are in free-text descriptions). On NearBlocks the account is an ordinary implicit account with no label. So T6/T7 measure what is sold through the Agent Market, not what agents do on chain. Agent transactions are counted in T1's totals like everyone else's, without being identified as agent activity.
- **NearBlocks' per-account counts are estimates for busy accounts.** Its API spec titles them "Get estimated account transaction count", and for large accounts the response carries a query-planner `cost` next to the count (a small account, such as the agent's, gets an exact count with no `cost`). The `txns` variant also counts receipt rows, not transactions: 8 for the agent's 4 transactions. So T5's hourly counter method is kept for the record, but it is not used as a measurement (see the T5 note above).
- **Buyback figures are DefiLlama's adapter, cross-checked once.** The `dailyHoldersRevenue` series is DefiLlama's reading of NEAR's revenue wallets. revenue.near.org, which it reconciles with, labels its own figures "illustrative" and describes the buyback as removing NEAR "from circulation"; on chain, the bought-back NEAR is held in a multisig, not burned. One cross-check (C1 reports it): at each day's NearBlocks price, the series since 2026-02-23 ($7.47M) would have bought about 3.14M NEAR, and the wallet holds 2.14M (68%). The gap may be multisig outflows (the wallet executed multisig requests on 03-18, 03-20, 05-27 and 07-09 that we have not decoded) or revenue not yet converted. It does not make capture larger. C1's market cap uses circulating supply and its issuance uses total supply; both are stated in the output.
- **Collector outage (2026-11-04 08:07Z → 2026-11-05 10:07Z, resolved).** `data/snapshots.jsonl` has no Agent Market data in 26 hourly rows (one success at 11-04 15:36Z); every row since 11-05 11:07Z has it. The operator's collector server could not open a TCP connection to `market.near.ai`'s network (or to `railway.com`) while every other source answered, so it was most likely our server's path, not a fault at the Agent Market. Neither F3 window (11-07, 11-13) was affected. PREREG.md asks us to say so here when our collector misses data.
- Anything we cannot compute from these sources is written here as unknown, never estimated silently.
