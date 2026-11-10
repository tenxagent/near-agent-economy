#!/usr/bin/env node
// P3 (2026-11-10, post-lock REPORT): NEAR Intents (1Click) vs Relay on mainstream corridors at $100 / $1,000 / $10,000.
//   node quote-corridors.mjs [--dry]
// One-off, separate from the hourly collector (collect.mjs is not touched). Dry quotes on public APIs, no keys; nothing is sent.
// Writes data/raw/corridor-quotes.json; build.mjs reports it as P3. Corridors, cost method and what is left out: lib/corridors.mjs.
// Also records where 1Click's "Temporary swap limits: minimum swap amount is $1,000" applies: one dry $100 1Click quote per probe
// route (into and out of BSC, two other chains bridged the same way (HOT Omni), and the agent's own Robinhood Chain origin).
import fs from 'node:fs';
import path from 'node:path';
import { CORRIDORS, TICKETS_USD, units, quote1Click, quoteRelay, summarizeCorridors } from './lib/corridors.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'data', 'raw', 'corridor-quotes.json');
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (p) => p.catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));

const tokens = await (await fetch('https://1click.chaindefuser.com/v0/tokens', { signal: AbortSignal.timeout(20_000) })).json();
const price = (assetId) => Number(tokens.find((t) => t.assetId === assetId)?.price);

const corridors = [];
for (const c of CORRIDORS) {
  const p = price(c.from.intents), rows = [];
  for (const usd of TICKETS_USD) {
    const amount = units(usd, p, c.from.decimals);   // the same raw input for both APIs
    const i = await safe(quote1Click(c, amount)); await sleep(1200);
    const x = await safe(quoteRelay(c, amount)); await sleep(1200);
    rows.push({ usd, amount_in: amount.toString(), near_intents_1click: i, relay: x });
    console.error(`${c.id} $${usd}: 1Click ${i.ok ? i.cost_pct + '%' : 'refused: ' + (i.message ?? i.error)} · Relay ${x.ok ? x.cost_pct + '%' : 'refused: ' + (x.message ?? x.error)}`);
  }
  corridors.push({ id: c.id, route: c.route, origin_price_usd: p, rows });
}

const PROBES = [
  ['into BSC (USDC)', 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r'],
  ['into BSC (BNB)', 'nep141:eth.omft.near', 'nep245:v2_1.omni.hot.tg:56_11111111111111111111'],
  ['out of BSC (USDC)', 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r', 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near'],
  ['into Optimism (USDC, HOT Omni)', 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', tokens.find((t) => t.blockchain === 'op' && t.symbol === 'USDC')?.assetId],
  ['into Polygon (USDC, HOT Omni)', 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', tokens.find((t) => t.blockchain === 'pol' && t.symbol === 'USDC')?.assetId],
  ['out of Robinhood Chain (ETH -> Ethereum ETH)', 'nep141:hood.omft.near', 'nep141:eth.omft.near'],
];
const minimum_probe = [];
for (const [name, from, to] of PROBES) {
  const f = tokens.find((t) => t.assetId === from), dec = f?.decimals;
  if (!f || !to) { minimum_probe.push({ route: name, usd: 100, ok: false, message: 'asset not listed by /v0/tokens' }); continue; }
  const q = await safe(quote1Click({ from: { intents: from, decimals: dec }, to: { intents: to, decimals: tokens.find((t) => t.assetId === to)?.decimals ?? dec } }, units(100, Number(f.price), dec)));
  minimum_probe.push({ route: name, usd: 100, origin: from, destination: to, ok: q.ok, message: q.ok ? null : (q.message ?? q.error) });
  console.error(`probe ${name}: ${q.ok ? 'quoted' : 'refused: ' + (q.message ?? q.error)}`);
  await sleep(1200);
}

const out = { fetched_at: new Date().toISOString(), sources: ['https://1click.chaindefuser.com/v0/quote (dry: true)', 'https://api.relay.link/quote'],
  method: 'same raw input amount to both; cost = 1 - out/in in token units (same asset each side); expected output, not minimum; origin-chain deposit gas excluded from both (Relay origin_gas_usd recorded)',
  corridors, minimum_probe };
if (!DRY) fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ written: !DRY, ...summarizeCorridors(corridors), minimum_probe: minimum_probe.map((p) => `${p.route}: ${p.ok ? 'quoted' : 'refused'}`) }, null, 1));
