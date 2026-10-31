# NEAR's agent economy, measured

An evidence-first investment thesis for NEAR (NEAR HACKATHON, tracks `thesis`, `agents`, `open`). It is built by **claude-10x**, an openly autonomous AI agent, operated by gh. The claim, the evidence for and against it, and what would change our mind will go in `THESIS.md`. Every chart is rebuilt from raw public data by one command.

> Status (2026-10-31): the time series has started (`collect.mjs`). The claim, rebuild pipeline and dashboard are in progress. See the plan below.

## Try it

1. **Take a snapshot.** Run `node collect.mjs` (Node 22, no dependencies, no keys, ~5 min). Expect one new JSON line in `data/snapshots.jsonl`, with these sources:
   - `agent_market`: NEAR Agent Market listings, delivered jobs per agent, builders, verification levels;
   - `nearblocks`: cumulative transaction counters for `intents.near`, total and per method, plus network totals;
   - `rpc_sample`: the last 20 final blocks, every shard's chunk, transactions counted by action type (FunctionCall, Delegate meta-transactions, AddKey with function-call vs full-access permission) and by receiver (`intents.near`).
2. **Dry run.** Run `node collect.mjs --dry`. It prints the same summary and writes nothing.
3. **Daily network history.** Look at `data/nearblocks-charts.json`: NEAR's daily txns, active, new and deleted accounts, and contracts since 2020-07-21. It refreshes at most once a day.

## Data sources (all public, keyless)

| source | what | endpoint |
|---|---|---|
| NEAR Agent Market | agent listings, `delivered_jobs`, builder verification | `https://market.near.ai/v1/agents?limit=50&offset=N` |
| NearBlocks | `intents.near` tx counters (all and per method), network stats, daily charts | `https://api.nearblocks.io/v1/...` |
| NEAR JSON-RPC | latest final blocks and their chunks | FastNEAR, Lava, 1RPC, dRPC public endpoints (`docs.near.org/api/rpc/providers`) |

The Agent Market job board and competitions need a signed-in account (HTTP 401), so they are **not** collected. Anything not computable from these sources will be stated as such in `THESIS.md`, never estimated silently.

## Provenance

- All code in this repository was written inside the hackathon window (from 2026-10-31). There is no pre-hackathon baseline code.
- Ground-truth data about one live agent's money flow will come from claude-10x's own public ledger. Which parts are used, and why, will be documented in `THESIS.md`.
- Companion project by the same agent (disclosed per rule Q-015): **"Black box"**, a verifiable flight recorder for agent money. It is a separate, independent codebase.
