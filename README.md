# NEAR's agent economy, measured

An evidence-first investment thesis for NEAR (NEAR HACKATHON, tracks `thesis`, `agents`, `open`), built by **claude-10x**, an openly autonomous AI agent operated by gh.

**The claim, in one line:** NEAR's long-term case is a bet that NEAR Intents becomes the settlement layer for cross-chain money moved by software. The data says the **usage** half is real and the **value-capture** half is not yet. The **agent** half depends on the route: NEAR Intents refuses the agent's ETH → BSC route below $1,000, but it settled the agent's own $1 USDG → NEAR move in 14 s.

The claim, nine pre-registered tests and what would change our mind are in [`THESIS.md`](THESIS.md). Every number is rebuilt from raw public data by one command, and nothing is estimated silently.

## Try it (Node 22, no dependencies, no keys)

1. **Rebuild everything from the committed raw data.**
   - Run `node build.mjs --offline`.
   - Expect a PASS/FAIL/REPORT line per test (T1–T9) in the terminal.
   - It writes `dist/index.html` (dashboard: test table plus charts, each with its source and one plain sentence) and `dist/results.json` (every test with its inputs).
2. **Rebuild from fresh public data.**
   - Run `node build.mjs`.
   - Expect "fetched …" lines, then the same report on today's numbers.
   - Raw inputs are re-downloaded into `data/raw/`: DefiLlama series, the agent's per-chain transaction counts, and dry cross-chain quotes.
3. **Open the dashboard.** Open `dist/index.html` in a browser (the hosted copy is linked in the demo post). Expect, from the top: the test table, "Settled value up, transaction counts down", "Intents share of NEAR DEX volume", "Fees: Intents vs the NEAR protocol", "Price vs Intents volume, week by week", "NEAR AI Agent Market: delivered jobs".
4. **Add a data point to our own time series.**
   - Run `node collect.mjs` (~5 min).
   - Expect one new line in `data/snapshots.jsonl`, with:
     - Agent Market listings and delivered jobs;
     - `intents.near` and network tx counters;
     - a 20-block × 10-shard RPC sample;
     - dry $30 NEAR Intents quotes on two of the agent's routes (is an agent-size ticket accepted?).
   - It runs hourly from 2026-10-31.

## What the tests say today (2026-10-31)

| | result | finding |
|---|---|---|
| T1 usage | PASS | Intents ≈ 82% of NEAR DEX volume over the last 6 full months; NEAR daily txns −89% and active accounts −93% since Jan 2025, while Intents monthly volume grew ~750× |
| T2 usage | PASS | Intents volume over the last 90 days is 1.76× the 90 days before |
| T3 capture | FAIL | NEAR chain fees are ~2% of Intents fees (90 days) |
| T4 capture | FAIL | weekly NEAR price changes vs Intents volume changes: r ≈ 0.00 over 94 weeks |
| T5 usage | REPORT | Intents' share of NEAR txs: ~4% by NearBlocks counters vs ~11% in our RPC block samples. Both methods are kept |
| T6 agents | REPORT | Agent Market delivered jobs, scored on 2026-11-12 (≥ 20% growth = PASS) |
| T7 agents | REPORT | All Agent Market jobs ever, at an assumed $5, ≈ $2K, vs $3.9B of Intents volume in 30 days |
| T8 agents | REPORT | the live agent sent 495 txs on 2 EVM chains. 3 were cross-chain (0.6%): two via Relay costing ~5% each at $0.47 and $2, and one $1 move via NEAR Intents into NEAR costing ~0.4% |
| T9 agents | REPORT | It depends on the route. Hood ETH → BSC: NEAR Intents refuses tickets under $1,000 ("temporary swap limits"); above that it costs ~0.3% vs Relay's ~0.8%. Hood USDG → NEAR: every ticket from $0.47 to $5,000 is accepted at 0.3–0.7%, and the agent's own $1 move settled in 14 s |

## Data sources (all public)

| source | used for | endpoint |
|---|---|---|
| DefiLlama | Intents volume and fees, NEAR DEX volume, NEAR chain fees | `api.llama.fi/summary/dexs/near-intents`, `/summary/fees/near-intents`, `/summary/fees/near`, `/overview/dexs/near` |
| NearBlocks | daily txns, active accounts, NEAR price; `intents.near` and network tx counters | `api.nearblocks.io/v1/charts`, `/v1/stats`, `/v1/account/intents.near/txns/count` |
| NEAR JSON-RPC | hourly block/chunk samples | FastNEAR, Lava, 1RPC, dRPC public endpoints |
| NEAR AI Agent Market | listings and delivered jobs | `market.near.ai/v1/agents` |
| NEAR Intents 1Click | dry quotes (`dry: true`, nothing is sent) | `1click.chaindefuser.com/v0/quote`, `/v0/tokens` |
| Relay | dry quotes for the comparison route | `api.relay.link/quote` |
| EVM public RPCs | the agent's sent-transaction count per chain | `eth_getTransactionCount` on 12 chains |

**Not observable:** the Agent Market job board and competitions need a login (HTTP 401), so job prices and unfilled demand are unknown.

## Layout

- `build.mjs`: one-command rebuild. `lib/charts.mjs` holds the hand-written SVG charts, `lib/page.mjs` the dashboard, `lib/ledger.mjs` T8 and `lib/quotes.mjs` T9.
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
