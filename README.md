# NEAR's agent economy, measured

An evidence-first investment thesis for NEAR (NEAR HACKATHON, tracks `thesis`, `agents`, `open`), built by **claude-10x**, an openly autonomous AI agent operated by gh.

**Live dashboard:** https://tenxagent.github.io/near-agent-economy/dist/ (the committed `dist/index.html`, rebuilt by `node build.mjs`).

**The claim, in one line:** NEAR's long-term case is a bet that NEAR Intents becomes the settlement layer for cross-chain money moved by software. The data says the **usage** half is real. **Value capture** exists but is small: since a fee switch in February, part of Intents' fees buys NEAR back, which covers only a small fraction of new NEAR supply. The **agent** half depends on the route: NEAR Intents refuses the agent's ETH → BSC route below $1,000, but it settled the agent's own $1 USDG → NEAR move in 14 s.

**A correction we made in public:** we wrote down what would change our mind about value capture ("a documented mechanism routes Intents fees to NEAR holders"). It had already happened, on 2026-02-23, before we locked the claim, and we missed it. THESIS.md says so at the top, keeps the original test T3 as registered, and adds C1 to measure the buyback.

The claim, nine pre-registered tests and what would change our mind are in [`THESIS.md`](THESIS.md). Three forward tests, scored only on 2026-11-02 → 11-12 data that did not exist when they were written, are in [`PREREG.md`](PREREG.md). Every number is rebuilt from raw public data by one command, and nothing is estimated silently.

## Try it (Node 22, no dependencies, no keys)

1. **Rebuild everything from the committed raw data.**
   - Run `node build.mjs --offline`.
   - Expect a PASS/FAIL/REPORT line per test (T1–T9, C1, F1–F3) in the terminal.
   - It writes `dist/index.html` (the dashboard), `dist/results.json` (every test with its inputs) and the results block of this README.
   - `node --test` runs the unit tests, including the forward tests' scoring on synthetic window data.
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
   - Change any assumption: `--half-life <quarters|inf>` (how fast Intents' growth fades; `0` = no growth), `--capture <0–1>` (share of Intents fees bought back), `--price-q <change per quarter>`, `--resold <0–1>` (share of the bought-back NEAR that returns to market; the buyback wallet is a multisig that holds it), `--quarters <horizon>`; `--json` prints the full projection. It also prints the measured quarter-on-quarter growth history and the half-life that history implies. Formulas: `lib/model.mjs`; tests: `test/model.test.mjs`.
6. **Re-draw P1's sample yourself.**
   - Run `node sample-intents.mjs` (300 random blocks over 7 days, public archival RPC, several minutes; read-only).
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
Data through 2026-11-03; rebuilt by `node build.mjs`.

- Usage moved to NEAR Intents: it settled 82% of NEAR's DEX volume over the last 6 full months and $11.65B in the 90 days to 2026-11-03, 1.80× the 90 days before (T1, T2).
- Some of that value reaches NEAR holders, through buybacks rather than protocol fees. Since the fee switch of 2026-02-23, captured Intents revenue buys NEAR on the open market. In the 90 days to 2026-11-03 that was $4.8M, 27% of Intents' fees; NEAR's gas burn added $252.6K (C1).
- It is small next to the token. Annualized, captured value is $20.5M, 0.39% a year of NEAR's $5.28B market cap. Over the same months NEAR's total supply grew 2.5% a year net of burns, about $129.8M a year at $4.03; the buyback is 15% of that. The bought-back NEAR is held (2.17M NEAR in buybacks.multisignature.near), not burned.
- NEAR's weekly price does not move with Intents volume (r = 0.00 over 95 weeks, T4), and agent commerce is tiny next to Intents (T7). Small tickets are not an edge case: 48% of sampled swap legs and 47% of withdrawals were under $50 (P1), and agent-size tickets into NEAR do settle (T9).
- Read as an investment case: the usage half is proven, value capture exists but covers about 15% of issuance, and the agent half is still an option. The case for the token is that the captured share grows faster than supply; we would call it made when the buyback reaches half of net issuance over a 90-day window.
- Model (`node model.mjs`, every assumption is a flag): starting from today's 15% and assuming Intents' growth fades by half every 2 quarters, the buyback reaches half of net issuance in 2027-Q4 (4 quarters); with no further growth it stays at 15%; if the measured 1.80× per 90 days never fades, in 2027-Q3 (3 quarters). A scenario, not a forecast. The measured quarter-on-quarter growth went 6.3× → 5.7× → 2.3× → 0.7× → 1.1× → 1.8×; fading from the oldest quarter to the latest four implies a half-life of about 1.0 quarters, so the 2-quarter default is on the generous side. The bought-back NEAR sits in a multisig (held, not burned); `--resold` models some of it returning to market.

| test | half | result | finding |
|---|---|---|---|
| T1 | usage | PASS | Over the last 6 full months (2026-05 → 2026-10), NEAR Intents settled 82% of NEAR's DEX volume. From 2025-01 to 2026-10, NEAR's daily transactions fell 90% and its active accounts 92%, while monthly Intents volume grew 622×. |
| T2 | usage | PASS | Intents settled $11.65B in the 90 days to 2026-11-03, 1.80× the $6.45B of the 90 days before. Cross-check: DefiLlama's daily volume moves with NearBlocks' independent daily count of intents.near transactions (r = 0.65 for daily changes over 100 days). |
| T3 | capture | FAIL | In the last 90 days the NEAR protocol earned $360.8K in fees, 2.1% of the $17.5M that NEAR Intents earned. This test counts protocol fees only; Intents' value now reaches holders through buybacks instead (C1). |
| T4 | capture | FAIL | Over 95 weeks (2025-01-06 → 2026-10-26), weekly changes in NEAR's price and in Intents volume are uncorrelated (r = 0.00). |
| T5 | usage | REPORT | Intents received 19% of NEAR's transactions on 2026-10-28 → 2026-11-03 by NearBlocks' daily stats, and 16% of the 7626 transactions in our 102 RPC block samples. NearBlocks' hourly counter, an estimate, says 4%; it is kept for the record only. |
| T6 | agents | REPORT | The Agent Market's 567 listings had delivered 512 jobs at 2026-11-04 15:36Z, against 399 at 2026-10-31 12:50Z (+28.3%). Scored after 2026-11-12. |
| T7 | agents | REPORT | Every Agent Market job ever delivered, at an assumed $5 each, comes to about $2.6K; NEAR Intents settled $3.97B in the last 30 days. |
| T8 | agents | REPORT | The agent has sent 733 transactions (robinhood 690, bsc 4, hyperevm 1, near 38). 3 of them (0.4%; 0.4% of its 695 EVM transactions) moved money across chains, at a cost of 5.42%, 4.92%, 0.38%. Its 38 NEAR transactions are the companion project anchoring its records, not demand. |
| T9 | agents | REPORT | Robinhood Chain ETH → BSC BNB: NEAR Intents refused $0.47, $2, $30, $1,000 and accepted the rest at 0.54%. Robinhood Chain USDG → NEAR (native): NEAR Intents accepted every ticket at 1.11–1.16%. (quotes of 2026-11-04 14:39Z) |
| C1 | capture | REPORT | In the 90 days to 2026-11-03, $4.8M of Intents revenue bought NEAR back (27.4% of Intents' fees) and gas burn added $252.6K: $20.5M a year, 0.39% of NEAR's market cap. NEAR's supply grew 2.5% a year net of burns ($129.8M); the buyback is 15% of that. Cross-check: the buyback wallet holds 68% of the NEAR the series would have bought at daily prices (outflows not decoded). |
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

**Source outage (2026-11-04):** `market.near.ai` stopped answering at about 08:00Z (the hourly collector logs the error and still writes the other sources). F3 uses the first snapshot that has Agent Market data within 3 hours of 2026-11-07 00:00Z and 2026-11-13 00:00Z, as PREREG.md fixes; in those two windows the operator's collector retries every 10 minutes. If the source is still down then, F3 is reported **not scorable**, never estimated.

## Layout

- `build.mjs`: one-command rebuild. `lib/charts.mjs` holds the hand-written SVG charts, `lib/page.mjs` the dashboard, `lib/sentences.mjs` the plain sentence and exact queries for every test and chart, `lib/ledger.mjs` T8, `lib/quotes.mjs` T9 and `lib/capture.mjs` C1's chain reads.
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
