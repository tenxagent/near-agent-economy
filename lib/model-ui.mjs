// Pure helpers for the dashboard's "Try your own assumptions" controls (11-09). dist/index.html imports this file in the browser,
// so the page runs the same lib/model.mjs as `node model.mjs` and test/model.test.mjs; nothing in the page re-implements a formula.
// No DOM, no network: the page passes in the control values, these return the run, the words and the matching terminal command.
import { project, quarterLabel } from './model.mjs';

/** The CLI's default run (model.mjs with no flags) for this build's measured start. */
export const defaults = (base) => ({ halfLife: 2, capture: base.captured_share, priceQ: 0, resold: 0, issuance: 'current', rampStartQ: 0 });

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const num = (x) => String(Number(x.toFixed(4)));

/** The `node model.mjs` command that prints the same run; flags only where a value differs from the default. */
export function cliCommand(base, p) {
  const d = defaults(base), f = [];
  if (p.halfLife !== d.halfLife) f.push(`--half-life ${p.halfLife === Infinity ? 'inf' : num(p.halfLife)}`);
  if (Math.abs(p.capture - d.capture) > 5e-4) f.push(`--capture ${num(p.capture)}`);
  if (p.priceQ) f.push(`--price-q ${num(p.priceQ)}`);
  if (p.resold) f.push(`--resold ${num(p.resold)}`);
  if (p.issuance === 'hsp029') { f.push('--issuance hsp029'); if (p.rampStartQ) f.push(`--ramp-start-q ${num(p.rampStartQ)}`); }
  return ['node model.mjs', ...f].join(' ');
}

/** Run the model with the page's values and word the answer the way model.mjs does. */
export function describe(base, p) {
  const r = project(base, p), horizon = r.params.quarters;
  const when = (q) => (q === null ? `not within ${horizon / 4} years` : `${quarterLabel(base.window_end, q)} (${q} quarter${q === 1 ? '' : 's'} from the data's end)`);
  const now = r.rows[0].coverage, in4 = r.rows[4].coverage, in8 = r.rows[8].coverage;
  return {
    quartersToHalf: r.quartersToHalf, quartersToFull: r.quartersToFull, coverage_now: now, coverage_in_4q: in4, coverage_in_8q: in8,
    text: `Half of net new supply bought back: ${when(r.quartersToHalf)}. All of it: ${when(r.quartersToFull)}. Coverage now ${pct(now)}, in 4 quarters ${pct(in4)}, in 8 quarters ${pct(in8)}.`,
    command: cliCommand(base, p),
  };
}
