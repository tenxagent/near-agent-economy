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

So where Intents works, it is ~2.5–3× cheaper than the bridge the agent used. **But its current minimum excludes every cross-chain move the agent ever made** ($0.47 and $2.02). This bears directly on the "agents" half: today the settlement layer is priced and gated for large tickets, not for software making small payments. `collect.mjs` records the $30 probe hourly, so the dashboard shows if and when the "temporary" limit lifts.

## What would change our mind

- **Usage:** Intents' share of NEAR DEX volume falls below 0.50 in any month, or 90-day Intents volume drops by more than half (T2 < 0.5).
- **Capture (the bullish side):** NEAR protocol fees reach ≥ 25% of Intents fees, or a documented mechanism routes Intents fees to NEAR holders or stakers. That would make usage a valuation argument.
- **Agents:** Agent Market delivered jobs grow ≥ 20% a week, sustained through the window. That would mean agent demand is emerging rather than anecdotal.
- **Agents (T9):** the 1Click minimum drops below ~$10 at a cost near its $1,000 rate (≤ 0.5%). That would remove the gate that keeps small agent tickets off Intents.

## Data limits (stated up front)

- DefiLlama's NEAR Intents volume is produced by DefiLlama's adapter; we do not re-derive it from chain data.
- NearBlocks' `active_accounts` and `txns` are NearBlocks' definitions.
- NearBlocks' per-method counters for `intents.near` looked frozen on 10-31, so they are recorded but not used.
- The Agent Market job board and competitions need a login, so job prices and unfilled demand are not observable. Only delivered-job counts are.
- Anything we cannot compute from these sources is written here as unknown, never estimated silently.
