# Forward tests F1–F3 (registered 2026-10-31, before any of their window data exists)

T1–T9 in [`THESIS.md`](THESIS.md) were written after we had explored the data, and most of them describe the past. The three tests below are scored only on data from **2026-11-02 00:00Z to 2026-11-12 23:59Z**, which did not exist when this file was written. Each one compares that window with the period just before it, so we cannot know the outcome in advance.

This file does not change after registration. Its SHA-256 is anchored on NEAR mainnet; the transaction and a one-line check are in the README. Any later correction goes in THESIS.md, not here.

## Windows (UTC calendar days)

- **Window W:** 2026-11-02 → 2026-11-12 (11 days).
- **Baseline B:** 2026-10-22 → 2026-11-01 (the 11 days before W).

## Tests

| id | half | question | measure (source) | PASS if |
|---|---|---|---|---|
| F1 | usage | Does settled value keep growing? | Sum of NEAR Intents daily volume over W vs over B (DefiLlama `summary/dexs/near-intents`, daily series) | volume(W) ≥ volume(B) |
| F2 | usage | Does NEAR's traffic keep shifting to Intents? | Σ daily `intents.near` txns ÷ Σ daily NEAR network txns, over W vs over B (NearBlocks `/v3/accounts/intents.near/stats/txns` ÷ NearBlocks `/v1/charts` `txns`) | share(W) ≥ share(B) |
| F3 | agents | Is agent demand accelerating, not just present? | NEAR AI Agent Market delivered jobs per day, second part of W vs first part. Jobs delivered between two times = the sum over listings in the later snapshot of (delivered jobs then − delivered jobs in the earlier snapshot, 0 if absent). Snapshots: the first `collect.mjs` snapshot at or after 11-02 00:00Z, 11-07 00:00Z and 11-13 00:00Z | rate(11-07 → 11-13, 6 days) ≥ rate(11-02 → 11-07, 5 days), and rate(11-07 → 11-13) > 0 |

## Rules fixed now

- **Scoring:** `build.mjs` scores F1 and F2 once every day of W and B is present in each test's inputs, and F3 once all three snapshots exist (normally 2026-11-13). Until then each test is reported as pending.
- **Missing data:** a series day that is absent, or a snapshot more than 3 hours after its time, is never estimated. If any input is still missing at the submission deadline (2026-11-14 23:59Z), the test is reported as **not scorable**. If data is missing because our collector stopped, we say so in THESIS.md.
- **Revisions:** if a source revises past days, we score on the data as fetched on the scoring day and keep the raw files in `data/raw/`.
- **F3 counts listings, not the published total.** Listings are identified by their Agent Market `agent_id`. A listing that is removed during the window stops counting, so a delisting cannot fake a drop in demand. A listing that is new during the window counts all of its delivered jobs.
- **Why these thresholds:** each test asks only whether the window is at least as high as the period just before it. On the data we had at registration, all three could go either way (Intents daily volume ranged $89M–$192M in the last week of October; Agent Market jobs arrive in bursts, 4 in the 8 hours we had sampled).
