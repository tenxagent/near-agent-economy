# NEAR's agent economy, measured

[![check](https://github.com/tenxagent/near-agent-economy/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/tenxagent/near-agent-economy/actions/workflows/check.yml)
(GitHub rebuilds from the committed data on every push and daily, compares with the committed results, checks PREREG.md against its NEAR anchor, and runs the tests. No keys.)

An evidence-first investment thesis for NEAR (NEAR HACKATHON, tracks `thesis`, `agents`, `open`), built by **claude-10x**, an openly autonomous AI agent operated by gh.

**Demo video (68 s):** https://x.com/mr_ghdc/status/2116851596596564385 (the operator's NEAR HACKATHON post).

**Live dashboard:** https://tenxagent.github.io/near-agent-economy/dist/ (the committed `dist/index.html`, rebuilt by `node build.mjs`).

**The claim, in one line:** NEAR's long-term case is a bet that NEAR Intents becomes the settlement layer for cross-chain money moved by software. The data says the **usage** half is real. **Value capture** exists but is small: since a fee switch in February, part of Intents' fees buys NEAR back, which covers only a small fraction of new NEAR supply. The **agent** half depends on the route: NEAR Intents refuses the agent's ETH → BSC route below $1,000, but it settled the agent's own $1 USDG → NEAR move in 14 s.

**A correction we made in public:** we wrote down what would change our mind about value capture ("a documented mechanism routes Intents fees to NEAR holders"). It had already happened, on 2026-02-23, before we locked the claim, and we missed it. THESIS.md says so at the top, keeps the original test T3 as registered, and adds C1 to measure the buyback.

The claim, nine pre-registered tests and what would change our mind are in [`THESIS.md`](THESIS.md). Three forward tests, scored only on 2026-11-02 → 11-12 data that did not exist when they were written, are in [`PREREG.md`](PREREG.md). Every number is rebuilt from raw public data by one command, and nothing is estimated silently.

## Try it (Node 22, no dependencies, no keys)

1. **Rebuild everything from the committed raw data.**
   - Run `node build.mjs --offline`.
   - Expect a PASS/FAIL/REPORT line per test (T1–T9, T4m, C1, P1, F1–F3) in the terminal.
   - It writes `dist/index.html` (the dashboard), `dist/results.json` (every test with its inputs) and the results block of this README.
   - `node --test` runs the unit tests, including the forward tests' scoring on synthetic window data and golden tests for T1–T4 and C1: synthetic inputs whose right answers are worked out by hand in `test/build.test.mjs`, so each scored rule is shown to compute exactly as THESIS.md states.
   - `node build.mjs --check` recomputes offline without writing anything, and fails if this README's results block differs from the build, or if `PREREG.md`'s SHA-256 differs from its NEAR anchor (offline: the anchored value pinned in `build.mjs`; add `--online` to read it live from SocialDB on NEAR mainnet).
2. **Rebuild from fresh public data.**
   - Run `node build.mjs`.
   - Expect "fetched …" lines, then the same report on today's numbers.
   - Raw inputs are re-downloaded into `data/raw/`: DefiLlama series (volume, fees, buyback revenue, gas burn), NearBlocks' daily `intents.near` stats and market cap, NEAR total supply from two archival block headers, the agent's per-chain transaction counts, and dry cross-chain quotes. A source that fails keeps its committed copy and says so.
3. **Open the dashboard.** Open `dist/index.html` in a browser, or the hosted copy at https://tenxagent.github.io/near-agent-economy/dist/. Expect, from the top:
   - a verdict strip for the three halves (usage, value capture, agents);
   - "What it means for a NEAR holder", written from the computed values;
   - one card per test with its result, one plain sentence, its rule, and its exact queries and computed value;
   - eleven charts, each with one sentence, its source and its queries;
   - the model card (see step 5).
4. **Add a data point to our own time series.**
   - Run `node collect.mjs` (~5 min).
   - Expect one new line in `data/snapshots.jsonl`, with:
     - Agent Market listings and delivered jobs;
     - `intents.near` and network tx counters;
     - a 20-block × 10-shard RPC sample;
     - dry $30 NEAR Intents quotes on two of the agent's routes (is an agent-size ticket accepted?).
   - It runs hourly from 2026-10-31.
5. **Re-run the model with your own assumptions.**
   - Run `node model.mjs` (reads `dist/results.json`; no network, no keys).
   - Expect the measured starting point, a quarter-by-quarter table of coverage (NEAR bought back per year ÷ net new NEAR per year) and a sensitivity grid: quarters until the buyback reaches half (THESIS.md's bar) and all of net issuance.
   - NEAR's governance issuance cut: `node model.mjs --issuance hsp029` ramps max issuance 2.5% → 1.6% over 24 months as HSP-029 sets out (passed, start not scheduled; `--ramp-start-q <n>` delays it). Sources: THESIS.md.
   - Change any assumption: `--half-life <quarters|inf>` (how fast Intents' growth fades; `0` = no growth), `--capture <0–1>` (share of Intents fees bought back), `--price-q <change per quarter>`, `--resold <0–1>` (share of the bought-back NEAR that returns to market; the buyback wallet is a multisig that holds it), `--quarters <horizon>`; `--json` prints the full projection. It also prints the measured quarter-on-quarter growth history and the half-life that history implies. Formulas: `lib/model.mjs`; tests: `test/model.test.mjs`.
6. **Re-draw P1's sample yourself.**
   - Run `node sample-intents.mjs` (300 random blocks over 7 days, public archival RPC, about 2 hours: the registered sample ran 22:01Z → 00:09Z, and a rate-limited RPC can stall it; read-only).
   - It rewrites `data/raw/intents-sample.json` with a new seeded sample; `node build.mjs --offline` then reports your P1 (the shares move a few points between samples; the cutoffs stay as registered in THESIS.md).

## Pre-registration, anchored on NEAR mainnet

The forward tests in [`PREREG.md`](PREREG.md) were registered before their data window (2026-11-02 → 11-12) opened. The file's SHA-256 and the commit that scores it were written to SocialDB by the agent's own NEAR account in tx [`5vrqMKwEUT3FnyqCmUwVnopAPrnyMhT6L8bZ8CiHdPWt`](https://nearblocks.io/txns/5vrqMKwEUT3FnyqCmUwVnopAPrnyMhT6L8bZ8CiHdPWt) (block 222474620, 2026-10-31 21:19:23Z, about 27 h before the window opened). Check it with any NEAR RPC and no extra tools:

```sh
A=00537bf24e164c18f3512de1040d34c88a11f37976a3ef6d4de673dc9cef6590
ARGS=$(printf '{"keys":["%s/thesis/prereg/1/**"],"options":{"with_block_height":true}}' $A | base64 -w0)
curl -s https://rpc.fastnear.com -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"social.near\",\"method_name\":\"get\",\"args_base64\":\"$ARGS\"}}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(Buffer.from(JSON.parse(s).result.result).toString())[process.argv[1]].thesis.prereg["1"];console.log("sha256",r.sha256[""],"commit",r.commit[""],"block",r.sha256[":block"])})' $A
sha256sum PREREG.md   # must print the same sha256
```

**P1's cutoffs are anchored the same way.** `THESIS.md` as of commit `4b489b5` (2026-10-31 22:00:43Z), which fixes P1's agent-size cutoffs, has its SHA-256 under key `…/thesis/prereg/2` in tx [`BHEka3RfXtrCsj1VYFKbK1Rk1hp6xPFi6uuv1KT2viJE`](https://nearblocks.io/txns/BHEka3RfXtrCsj1VYFKbK1Rk1hp6xPFi6uuv1KT2viJE) (block 222479133, 22:02:34Z). The sample started at 22:01:14Z, and `sample-intents.mjs` writes sizes only when it finishes, so no size existed when either was written. To check, run the command above with `prereg/2` in place of `prereg/1` (and `["2"]` in the decoder), then `git show 4b489b5:THESIS.md | sha256sum`. That pins the version at that commit; the live `THESIS.md` keeps changing.

## Scoring day (2026-11-13 → 11-14)

- **11-13 00:00–03:00Z:** the snapshot F3 needs: the first collector snapshot with Agent Market data (PREREG.md: never more than 3 hours late). The operator's collector retries every 10 minutes in this window.
- **From 11-13 06:31Z,** at 06:31, 14:31 and 22:31Z through 11-14, the operator's refresh does the following:
  - rebuilds from fresh public data, then runs `node build.mjs --check --online` and the tests;
  - commits `README.md`, `dist/` and `data/`, and publishes.
- **When F1–F3 score:** F1 and F2 as soon as DefiLlama and NearBlocks have every day through 11-12; F3 as soon as the 11-13 snapshot exists.
- **The first build with F1, F2 and F3 all scored is anchored once** in SocialDB under `00537bf2…6590/thesis/scored/1`. The anchor holds the SHA-256 of `dist/results.json` at that commit, the commit, and the three verdicts.
  - To check it, run the PREREG query above with the key `…/thesis/scored/1/**`.
  - Then compare with `git show <commit>:dist/results.json | sha256sum`.
- **11-14 23:59Z, the submission deadline:** a forward test whose inputs are still missing is reported **not scorable**, never estimated.

## What the tests say

<!-- results:start -->
Data through 2026-11-07; rebuilt by `node build.mjs`.

- Usage moved to NEAR Intents: it settled 83% of NEAR's DEX volume over the last 6 full months and $11.92B in the 90 days to 2026-11-07, 1.83× the 90 days before (T1, T2).
- Some of that value reaches NEAR holders, through buybacks rather than protocol fees. Since the fee switch of 2026-02-23, captured Intents revenue buys NEAR on the open market. In the 90 days to 2026-11-07 that was $5.0M, 27% of Intents' fees; NEAR's gas burn added $258.2K (C1). "Buyback" is DefiLlama's label for revenue swept as NEAR into NEAR's revenue wallets, held, not burned; on chain those wallets account for 98% of it, 33% in the front-end fund rather than the buyback multisig.
- It is small next to the token. Annualized, captured value is $21.2M, 0.46% a year of NEAR's $4.63B market cap. Over the same months NEAR's total supply grew 2.5% a year net of burns, about $113.8M a year at $3.53; the buyback is 18% of that. The bought-back NEAR is held (2.22M NEAR in buybacks.multisignature.near), not burned. If NEAR governance's HSP-029 cut (max issuance 2.5% → 1.6% over 24 months) runs its full ramp, the same buyback would cover 28% of net issuance.
- NEAR's weekly price does not move with Intents volume (r = 0.00 over 95 weeks, T4; with BTC's moves taken out, r = -0.03, p = 0.79, T4m), and agent commerce is tiny next to Intents (T7). Small tickets are not an edge case: 48% of sampled swap legs and 47% of withdrawals were under $50 (P1). Agent-size tickets into NEAR get a 1Click quote: 0.61–0.78% under $50 (T9, quotes of 2026-11-08 22:38Z).
- Read as an investment case: the usage half is supported by the record so far (T1 and T2 describe the past; the forward tests F1 and F2 check it on new data), value capture exists but covers about 18% of issuance, and the agent half is still an option. The case for the token is that the captured share grows faster than supply; we would call it made when the buyback reaches half of net issuance over a 90-day window.
- Model (`node model.mjs`, every assumption is a flag): starting from today's 18%, when the buyback reaches half of net issuance depends on how fast Intents' growth fades: in 2027-Q2 (2 quarters) if the measured 1.83× per 90 days never fades, and never with no further growth (it stays at 18%). In between: halving every 2 quarters (the default flag), in 2027-Q3 (3 quarters); halving about every 1.0 quarters (the fade a two-point fit to the measured quarters implies, see below), not within 10 years. A scenario, not a forecast. The measured quarter-on-quarter growth went 6.3× → 6.0× → 2.0× → 0.7× → 1.1× → 1.8×; fading from the oldest quarter to the latest four implies a half-life of about 1.0 quarters, but the last 2 quarters re-accelerated (0.7× → 1.1× → 1.8×), so one steady fade fits this series poorly: that half-life is a two-point fit, and the sensitivity grid (`node model.mjs`, and the dashboard's model section) shows how much the choice matters. The bought-back NEAR sits in a multisig (held, not burned); `--resold` models some of it returning to market. If HSP-029 (max issuance 2.5% → 1.6% over 24 months; House of Stake vote 99.97% for, timelock until 2026-11-16; no start date set) began its ramp now: at the 2-quarter default, in 2027-Q3 (3 quarters); at the two-point-fit fade, in 2028-Q3 (7 quarters).

| test | half | result | finding |
|---|---|---|---|
| T1 | usage | PASS | Over the last 6 full months (2026-05 → 2026-10), NEAR Intents settled 83% of NEAR's DEX volume. From 2025-01 to 2026-10, NEAR's daily transactions fell 90% and its active accounts 92%, while monthly Intents volume grew 622×. |
| T2 | usage | PASS | Intents settled $11.92B in the 90 days to 2026-11-07, 1.83× the $6.51B of the 90 days before. Cross-check: DefiLlama's daily volume moves with NearBlocks' independent daily count of intents.near transactions (r = 0.56 for daily changes over 100 days). |
| T3 | capture | FAIL | In the last 90 days the NEAR protocol earned $368.8K in fees, 2.0% of the $18.3M that NEAR Intents earned. This test counts protocol fees only; Intents' value now reaches holders through buybacks instead (C1). |
| T4 | capture | FAIL | Over 95 weeks (2025-01-06 → 2026-10-26), weekly changes in NEAR's price and in Intents volume are uncorrelated (r = 0.00). |
| T4m | capture | REPORT | Over 95 weeks, BTC explains 34% of NEAR's weekly price moves (beta 1.42). What is left after that does not track Intents volume (r = -0.03, p = 0.79, 4-week block p = 0.75; before removing BTC, r = -0.00, p = 0.97). Since the 2026-02-23 fee switch (36 weeks): r = +0.25, p = 0.14, block p = 0.15, not significant. Added after the lock; T4 itself is unchanged. |
| T5 | usage | REPORT | Intents received 24% of NEAR's transactions on 2026-11-01 → 2026-11-07 by NearBlocks' daily stats, and 19% of the 17251 transactions in our 206 RPC block samples. NearBlocks' hourly counter, an estimate, says 0%; it is kept for the record only. |
| T6 | agents | REPORT | The Agent Market's 643 listings had delivered 534 jobs at 2026-11-08 23:07Z, against 399 at 2026-10-31 12:50Z (+33.8%). Scored after 2026-11-12. |
| T7 | agents | REPORT | Every Agent Market job ever delivered, at an assumed $5 each, comes to about $2.7K; NEAR Intents settled $3.88B in the last 30 days. |
| T8 | agents | REPORT | The agent has sent 806 transactions (robinhood 725, bsc 4, hyperevm 1, near 76). 3 of them (0.4%; 0.4% of its 730 EVM transactions) moved money across chains, at a cost of 5.42%, 4.92%, 0.38%. Its 76 NEAR transactions are the companion project anchoring its records, not demand. |
| T9 | agents | REPORT | Robinhood Chain ETH → BSC BNB: NEAR Intents refused $0.47, $2, $30 and accepted the rest at 0.21–0.22%. Robinhood Chain USDG → NEAR (native): NEAR Intents accepted every ticket at 0.61–0.78%. (quotes of 2026-11-08 22:38Z) |
| C1 | capture | REPORT | In the 90 days to 2026-11-07, $5.0M of Intents revenue bought NEAR back (27.2% of Intents' fees) and gas burn added $258.2K: $21.2M a year, 0.46% of NEAR's market cap. NEAR's supply grew 2.5% a year net of burns ($113.8M); the buyback is 18% of that. Counting only the NEAR that reached the buyback multisig straight from intents.near in the same window (67% of what the series implies), it is 12%, a lower bound. The 50% bar (THESIS.md) is read on the series figure, 18%, as preregistered. |
| C1 cross-check | capture | REPORT | The buyback wallet holds 68% of the NEAR the series would have bought at daily prices. Its 3,267 receipts through 2026-11-08 (NearBlocks) close its balance on that day to within 0.015 NEAR (about its own transaction fees): 77% of the NEAR that arrived came from intents.near (first on 2026-04-23) and 23% from 1csfundsadmin.sputnik-dao.near (largest single transfer 502,793 NEAR on 2026-09-09), and 12,025 NEAR left it (largest: 12,000 NEAR on 2026-07-10). So the gap is not outflows: by the end of 2026-04 the wallet had received 4% of the NEAR implied since the fee switch, and by 2026-11-08 (its newest receipt here) 69%. In C1's own window (2026-08-10 to 2026-11-07) this wallet received 102% of the NEAR the series implies, 67% of it from intents.near and most of the rest as one 502,793 NEAR transfer from 1csfundsadmin.sputnik-dao.near on 2026-09-09 (a hop the series counted when the NEAR first reached that fund). The series is not one wallet: DefiLlama's adapter counts NEAR swept into three NEAR revenue wallets and labels all of it "NEAR Buyback" from 2026-02-23. Across all three (balances at the fee switch and on 2026-11-08, archival RPC), the NEAR gained plus the 12,025 NEAR the buyback wallet sent out comes to 3,164,404 NEAR, 98% of the 3,243,773 NEAR the series implies through 2026-11-07. 33% of it (1,064,761 NEAR) is in the front-end fund DAO, fefundsadmin.sputnik-dao.near; the rest reached the buyback multisig, directly or through the 1Click fund DAO. |
| C1 protocol fee | capture | REPORT | The contract's own protocol fee is small next to the buyback: intents.near charges 1 pip (0.0001%) of each side's token_in in a token_diff and nothing on transfers, and its fee collector took in about $30 a day over the 7 days to 2026-11-07 (archival RPC, 3-hourly balances; a lower bound), about $11.0K a year, 0.05% of the captured value. The swaps that pay it come to about $15.1M a day, 12% of the volume NEAR reports for those days, so most of the reported volume pays no protocol fee (a 1Click swap can settle as transfers alone, as the agent's own did on 2026-11-05). |
| P1 | agents | REPORT | From 300 random blocks over 7 days (163 transactions to intents.near): transfer (mostly fee payouts, see THESIS.md) n=204, 85% under $50, 79% under $10, median $0.29; token_diff n=98, 48% under $50, 26% under $10, median $65; withdraw n=55, 47% under $50, 21% under $10, median $68. Agent-size describes the ticket, not who sent it. |
| F1 | usage | pending | Pending: scored on 2026-11-02 → 2026-11-12 data against 2026-10-22 → 2026-11-01 (PREREG.md). |
| F2 | usage | pending | Pending: scored on 2026-11-02 → 2026-11-12 data against 2026-10-22 → 2026-11-01 (PREREG.md). |
| F3 | agents | pending | Pending: Agent Market jobs per day on 2026-11-07 → 11-13 against 2026-11-02 → 11-07 (PREREG.md). |
<!-- results:end -->

## Data sources (all public)

| source | used for | endpoint |
|---|---|---|
| DefiLlama | Intents volume, fees and buyback revenue (`dailyHoldersRevenue`); NEAR DEX volume; NEAR chain fees and gas burn (`dailyRevenue`) | `api.llama.fi/summary/dexs/near-intents`, `/summary/fees/near-intents`, `/summary/fees/near`, `/overview/dexs/near` |
| NearBlocks | daily txns, active accounts, NEAR price and market cap; `intents.near` and network tx counters; cross-check of the agent's NEAR tx count | `api.nearblocks.io/v1/charts`, `/v1/stats`, `/v3/accounts/intents.near/stats/txns`, `/v1/account/<id>/txns/count`, `/txns-only/count` |
| NEAR JSON-RPC | hourly block/chunk samples; the agent's NEAR sent-tx count (access-key nonce); total supply from archival block headers; the buyback wallet's balance | FastNEAR, Lava, 1RPC, dRPC public endpoints |
| NEAR AI Agent Market | listings and delivered jobs | `market.near.ai/v1/agents` |
| NEAR Intents 1Click | dry quotes (`dry: true`, nothing is sent) | `1click.chaindefuser.com/v0/quote`, `/v0/tokens` |
| Relay | dry quotes for the comparison route | `api.relay.link/quote` |
| EVM public RPCs | the agent's sent-transaction count per chain | `eth_getTransactionCount` on 12 chains |

**Not observable:** the Agent Market job board and competitions need a login (HTTP 401), so job prices and unfilled demand are unknown.

**Collector outage (2026-11-04 → 11-05, resolved):** `data/snapshots.jsonl` has no Agent Market data in 26 hourly rows from 2026-11-04 08:07Z to 2026-11-05 10:07Z (one success at 11-04 15:36Z); every row since 11-05 11:07Z has it. Neither F3 window (11-07, 11-13) is affected so far. What we wrote during the outage: from about 08:00Z the operator's collector server could not open a connection to `market.near.ai`. It timed out on TCP to that host's network, and to `railway.com` itself, while every other source answered. So this is most likely our server's network path, not proven to be a fault at the Agent Market. An earlier version of this note blamed the source. The hourly collector logs the error and still writes the other sources. F3 uses the first snapshot that has Agent Market data within 3 hours of 2026-11-07 00:00Z and 2026-11-13 00:00Z, as PREREG.md fixes; in those two windows the operator's collector retries every 10 minutes, and the operator will take that snapshot from a second network if this server still cannot connect. If no snapshot with Agent Market data exists in time, F3 is reported **not scorable**, never estimated (PREREG.md: missing because our collector failed ⇒ said so here).

## Layout

- `build.mjs`: one-command rebuild. `lib/charts.mjs` holds the hand-written SVG charts, `lib/page.mjs` the dashboard, `lib/sentences.mjs` the plain sentence and exact queries for every test and chart, `lib/ledger.mjs` T8, `lib/quotes.mjs` T9, `lib/capture.mjs` C1's chain reads and `lib/buyback-ledger.mjs` C1's reconciliation (the buyback wallet's receipts, closed against its balance).
- `model.mjs` + `lib/model.mjs`: the re-runnable value-capture model (default run in the results block and on the dashboard).
- `PREREG.md`: the forward tests, unchanged since their NEAR anchor. `LICENSE`: MIT.
- Committing: run `node build.mjs --offline && node build.mjs --check` right before each commit, and commit `data/snapshots.jsonl` and `data/nearblocks-charts.json` with it, so the README results block always matches the committed data.
- `collect.mjs`: the hourly snapshot collector.
- `data/`: committed raw inputs:
  - `raw/` (fetched by `build.mjs`, each file with `fetched_at` and URL);
  - `nearblocks-charts.json`;
  - `snapshots.jsonl`;
  - `agent-ground-truth.json` (every bridge the agent sent, with its tx hash).

## Provenance

- All code was written inside the hackathon window. The window opened with the announcement on 2026-10-19 (HACKATHON.md Q-001: "Earlier commits are baseline"). This repo's first commit is 2026-10-31, so there is no pre-hackathon baseline code and no `pre-hackathon` tag.
- The agent's own data is limited to what anyone can check on chain (tx counts, bridge tx hashes), plus two self-reported decision notes that are labelled as such.
- Companion project by the same agent, disclosed per rule Q-015: **"Black box"**, a verifiable flight recorder for agent money. It is a separate, independent codebase.
