// The re-runnable model (track: "live dashboards and models anyone can re-run"). One question, from THESIS.md's own bar:
// WHEN does the NEAR bought back with Intents revenue reach HALF of NEAR's net new supply (and when all of it)?
//
// Start = measured values in this build (C1, T2): buyback per year, net issuance per year, Intents' volume growth over the
// last 90 days vs the 90 before. Every assumption is a parameter (model.mjs flags); the defaults are the measured values plus one
// stated guess, the growth fade:
//   volume (and so fees and buyback) grows each quarter by an excess e_q = e0 × 0.5^(q / halfLife), e0 = measured 90-day ratio − 1
//   (halfLife = Infinity keeps the measured growth forever; 0 = no growth from today);
//   the captured share of Intents fees and the fees-per-volume rate stay as measured unless `capture` overrides the share;
//   net issuance stays at the measured NEAR per year (a fixed protocol inflation, net of burns), so its USD value moves with the price;
//   the NEAR price changes by `priceQ` per quarter (default 0 = flat). Coverage = NEAR bought back per year ÷ net new NEAR per year.
// Pure functions; no network, no randomness. Tested in test/model.test.mjs.

export const BAR = 0.5;   // THESIS.md: "we would call it made when the buyback reaches half of net issuance over a 90-day window"

/** Measured starting point from this build's C1 and T2 values. */
export function baseFrom(c1, t2) {
  return {
    window_end: c1.window[1],
    captured_usd_per_year: (c1.buyback_90d * 365) / 90,               // the BUYBACK only (THESIS.md's bar; gas burn is excluded), annualized from 90 days
    captured_share: c1.buyback_share_of_intents_fees,                 // of Intents' fees
    net_issuance_near_per_year: c1.net_issuance_near_per_year,
    near_price_usd: c1.near_price_usd,
    growth_90d: t2.ratio,                                             // Intents volume, last 90 days ÷ the 90 before
  };
}

/** Quarter-by-quarter projection. p = { halfLife (quarters, default 2), capture (share of fees, default measured), priceQ (default 0), quarters (default 40) } */
export function project(base, p = {}) {
  const halfLife = p.halfLife ?? 2, priceQ = p.priceQ ?? 0, quarters = p.quarters ?? 40;
  const shareMult = (p.capture ?? base.captured_share) / base.captured_share;
  const e0 = base.growth_90d - 1;
  let captured = base.captured_usd_per_year * shareMult, price = base.near_price_usd;
  const rows = [{ q: 0, growth: 1, captured_usd_per_year: captured, near_price_usd: price, coverage: captured / price / base.net_issuance_near_per_year }];
  for (let q = 1; q <= quarters; q++) {
    const e = halfLife === 0 ? 0 : e0 * Math.pow(0.5, q / halfLife);   // halfLife Infinity ⇒ 0.5^0 = 1 ⇒ constant growth
    captured *= 1 + e; price *= 1 + priceQ;
    rows.push({ q, growth: 1 + e, captured_usd_per_year: captured, near_price_usd: price, coverage: captured / price / base.net_issuance_near_per_year });
  }
  const first = (bar) => rows.find((r) => r.coverage >= bar)?.q ?? null;
  return { params: { halfLife, capture: p.capture ?? base.captured_share, priceQ, quarters }, rows, quartersToHalf: first(BAR), quartersToFull: first(1) };
}

/** Calendar label for "q quarters after the window end", e.g. 2027-Q2. */
export function quarterLabel(windowEnd, q) {
  if (q === null) return null;
  const d = new Date(windowEnd + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 3 * q);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Sensitivity grid: growth fade × captured share ⇒ quarters until coverage ≥ BAR. */
export const GRID = { halfLives: [0, 1, 2, 4, Infinity], captures: [null, 0.5, 1] };   // null = the measured share
export function grid(base, priceQ = 0) {
  return GRID.halfLives.map((halfLife) => ({ halfLife, cells: GRID.captures.map((c) => {
    const r = project(base, { halfLife, capture: c ?? base.captured_share, priceQ });
    return { capture: c ?? base.captured_share, quartersToHalf: r.quartersToHalf, quartersToFull: r.quartersToFull };
  }) }));
}

/** The default run as a short summary for the README / dashboard (values only; build.mjs words it). */
export function summary(base) {
  const d = project(base), never = project(base, { halfLife: 0 }), keep = project(base, { halfLife: Infinity });
  return { base, default: { params: d.params, quartersToHalf: d.quartersToHalf, quartersToFull: d.quartersToFull,
      half_at: quarterLabel(base.window_end, d.quartersToHalf), full_at: quarterLabel(base.window_end, d.quartersToFull),
      coverage_now: d.rows[0].coverage, coverage_in_4q: d.rows[4].coverage, coverage_in_8q: d.rows[8].coverage },
    no_growth: { quartersToHalf: never.quartersToHalf, coverage: never.rows[0].coverage },
    measured_growth_forever: { quartersToHalf: keep.quartersToHalf, half_at: quarterLabel(base.window_end, keep.quartersToHalf) },
    grid: grid(base) };
}
