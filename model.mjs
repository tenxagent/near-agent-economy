// Re-run the value-capture model with your own assumptions (no network, no keys; reads dist/results.json from `node build.mjs`).
//   node model.mjs                                   the default run (measured start, growth fades with a 2-quarter half-life)
//   node model.mjs --half-life 4 --capture 0.5       slower fade, half of Intents' fees bought back
//   node model.mjs --half-life inf --price-q 0.1     measured growth forever, NEAR price +10 % a quarter
//   node model.mjs --json                            the full projection as JSON
// Flags: --half-life <quarters|inf> (0 = no growth) · --capture <share of Intents fees, 0–1> · --price-q <price change per quarter>
//        --resold <share of bought-back NEAR that returns to market, 0–1; default 0> · --quarters <horizon, default 40>. Formulas: lib/model.mjs.
//        --issuance hsp029 (NEAR governance HSP-029: max issuance 2.5% → 1.6% over 24 months; start not scheduled) · --ramp-start-q <quarters from now, default 0>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, baseFrom, project, quarterLabel, grid } from './lib/model.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const num = (k) => { const v = arg(k); if (v === undefined) return undefined; if (/^inf/i.test(v)) return Infinity; const n = Number(v); if (!Number.isFinite(n)) { console.error(`--${k} needs a number`); process.exit(2); } return n; };
const results = JSON.parse(fs.readFileSync(path.join(DIR, 'dist', 'results.json'), 'utf8'));
const T = Object.fromEntries(results.tests.map((t) => [t.id, t.value]));
const base = baseFrom(T.C1, T.T2);
const iss = arg('issuance') ?? 'current';
if (!['current', 'hsp029'].includes(iss)) { console.error('--issuance must be current or hsp029'); process.exit(2); }
const p = { halfLife: num('half-life'), capture: num('capture'), priceQ: num('price-q'), resold: num('resold'), quarters: num('quarters'), issuance: iss, rampStartQ: num('ramp-start-q') };
const run = project(base, p);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ base, ...run }, null, 1)); process.exit(0); }

const pct = (x) => `${(100 * x).toFixed(1)}%`, usd = (x) => `$${(x / 1e6).toFixed(1)}M`, hl = (h) => (h === Infinity ? 'never fades' : h === 0 ? 'no growth' : `half-life ${h} q`);
console.log(`Start (data through ${results.last_day}): buyback ${usd(base.captured_usd_per_year)}/yr = ${pct(base.captured_share)} of Intents fees; net new supply ${(base.net_issuance_near_per_year / 1e6).toFixed(1)}M NEAR/yr; NEAR $${base.near_price_usd}; Intents volume ×${base.growth_90d.toFixed(2)} over the last 90 days.`);
if (iss === 'hsp029') console.log(`Issuance: HSP-029 ramp, gross issuance × 1.6/2.5 over 8 quarters from quarter ${run.params.rampStartQ} (start not scheduled; https://gov.near.org/t/42644)`);
console.log(`Assumptions: growth ${hl(run.params.halfLife)}, buyback share ${pct(run.params.capture)}, price ${run.params.priceQ >= 0 ? '+' : ''}${pct(run.params.priceQ)}/quarter, resold ${pct(run.params.resold)} of the bought-back NEAR.`);
const hist = results.model?.history;
if (hist) console.log(`Measured fade: Intents volume per 90 days vs the 90 before, oldest first: ${hist.quarters.map((q) => '×' + q.ratio.toFixed(2)).join(' → ')}; implied half-life ≈ ${hist.impliedHalfLife ? hist.impliedHalfLife.toFixed(1) + ' quarters' : 'n/a'} (the default assumes 2).`);
console.log('\n quarter  growth   buyback/yr   coverage (bought-back NEAR ÷ net new NEAR)');
for (const r of run.rows.filter((r) => r.q <= 12)) console.log(` ${quarterLabel(base.window_end, r.q).padEnd(8)} ×${r.growth.toFixed(3)}  ${usd(r.captured_usd_per_year).padStart(10)}   ${pct(r.coverage)}${r.coverage >= 1 ? '  ≥ all of it' : r.coverage >= BAR ? '  ≥ half (the bar)' : ''}`);
const when = (q) => (q === null ? `not within ${run.params.quarters} quarters` : `${quarterLabel(base.window_end, q)} (${q} quarters)`);
console.log(`\nHalf of net issuance (THESIS.md's bar): ${when(run.quartersToHalf)}. All of it: ${when(run.quartersToFull)}.`);
const { priceQ, resold, issuance, rampStartQ } = run.params;
console.log(`\nSensitivity (quarters until ½ / all; "–" = not within 10 years; same settings as above: price ${priceQ >= 0 ? '+' : ''}${pct(priceQ)}/q, resold ${pct(resold)}, issuance ${issuance}${issuance === 'hsp029' ? ` from quarter ${rampStartQ}` : ''}):`);
const g = grid(base, { priceQ, resold, issuance, rampStartQ });
console.log(`  growth fade        ${g[0].cells.map((c) => `share ${pct(c.capture)}`.padEnd(16)).join('')}`);
for (const row of g) console.log(`  ${hl(row.halfLife).padEnd(18)} ${row.cells.map((c) => `${c.quartersToHalf ?? '–'} / ${c.quartersToFull ?? '–'}`.padEnd(16)).join('')}`);
