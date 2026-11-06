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

export const BAR = 0.5;
/** NEAR governance HSP-029 (11-05, post-lock REPORT): max annual issuance 2.5% → 1.6% on a 24-month per-epoch ramp.
 *  Text: https://gov.near.org/t/42644 (Status: Succeeded). On chain: vote.dao get_proposal({proposal_id: 29}) — the build stores it
 *  in data/raw/hsp029-vote.json. No on-chain action is attached, so the ramp needs a protocol upgrade and its start date is not set. */
export const HSP029 = { fromPct: 2.5, toPct: 1.6, rampQuarters: 8, source: 'https://gov.near.org/t/42644' };   // THESIS.md: "we would call it made when the buyback reaches half of net issuance over a 90-day window"

/** Measured starting point from this build's C1 and T2 values. */
export function baseFrom(c1, t2) {
  return {
    window_end: c1.window[1],
    captured_usd_per_year: (c1.buyback_90d * 365) / 90,               // the BUYBACK only (THESIS.md's bar; gas burn is excluded), annualized from 90 days
    captured_share: c1.buyback_share_of_intents_fees,                 // of Intents' fees
    net_issuance_near_per_year: c1.net_issuance_near_per_year,
    burn_near_per_year: (c1.burn_90d * 365) / 90 / c1.near_price_usd,   // gas burn in NEAR; gross issuance = net supply growth + burn
    near_price_usd: c1.near_price_usd,
    growth_90d: t2.ratio,                                             // Intents volume, last 90 days ÷ the 90 before
  };
}

/** Quarter-by-quarter projection. p = { halfLife (quarters, default 2), capture (share of fees, default measured), priceQ (default 0),
 *  resold (share of bought-back NEAR that comes back to market, default 0: the buyback wallet is a multisig that holds, not burns), quarters (default 40) } */
export function project(base, p = {}) {
  const halfLife = p.halfLife ?? 2, priceQ = p.priceQ ?? 0, quarters = p.quarters ?? 40, keep = 1 - (p.resold ?? 0);
  // issuance 'current' (default): net new NEAR stays at the measured rate. 'hsp029': gross issuance (net + gas burn) ramps down by
  // 1.6/2.5 over 8 quarters from quarter rampStartQ (default 0 = 'if the ramp started now'); the burn is held at its measured level.
  const issuance = p.issuance ?? 'current', rampStartQ = p.rampStartQ ?? 0, burn = base.burn_near_per_year ?? 0, gross0 = base.net_issuance_near_per_year + burn;
  const netAt = (q) => issuance !== 'hsp029' ? base.net_issuance_near_per_year
    : gross0 * (1 - (1 - HSP029.toPct / HSP029.fromPct) * Math.min(1, Math.max(0, (q - rampStartQ) / HSP029.rampQuarters))) - burn;
  const shareMult = (p.capture ?? base.captured_share) / base.captured_share;
  const e0 = base.growth_90d - 1;
  let captured = base.captured_usd_per_year * shareMult, price = base.near_price_usd;
  const rows = [{ q: 0, growth: 1, captured_usd_per_year: captured, near_price_usd: price, coverage: keep * captured / price / netAt(0) }];
  for (let q = 1; q <= quarters; q++) {
    const e = halfLife === 0 ? 0 : e0 * Math.pow(0.5, q / halfLife);   // halfLife Infinity ⇒ 0.5^0 = 1 ⇒ constant growth
    captured *= 1 + e; price *= 1 + priceQ;
    rows.push({ q, growth: 1 + e, captured_usd_per_year: captured, near_price_usd: price, coverage: keep * captured / price / netAt(q) });
  }
  const first = (bar) => rows.find((r) => r.coverage >= bar)?.q ?? null;
  return { params: { halfLife, capture: p.capture ?? base.captured_share, priceQ, resold: p.resold ?? 0, quarters, issuance, rampStartQ }, rows, quartersToHalf: first(BAR), quartersToFull: first(1) };
}

/** The measured fade (11-04, re-screen): Intents volume, each 90 days ÷ the 90 before, stepping back one quarter at a time from the
 *  window end. impliedHalfLife = the half-life that takes the OLDEST measured excess growth down to the average excess of the latest
 *  four quarters, over the quarters between them (null if either is ≤ 0). daily = [[YYYY-MM-DD, usd], …]. */
export function growthHistory(daily, lastDay) {
  const t = (d) => Date.parse(d + 'T00:00:00Z'), end = t(lastDay), day = 864e5;
  const sum = (a, b) => daily.reduce((s, [d, v]) => (t(d) > a && t(d) <= b ? s + v : s), 0);
  const quarters = [];
  for (let k = 0; ; k++) {
    const e = end - k * 90 * day, last = sum(e - 90 * day, e), prev = sum(e - 180 * day, e - 90 * day);
    if (!(prev > 0) || e - 180 * day < t(daily[0][0])) break;
    quarters.push({ to: new Date(e).toISOString().slice(0, 10), ratio: last / prev });
  }
  quarters.reverse();   // oldest first
  const ex = quarters.map((q) => q.ratio - 1), first = ex[0], recent = ex.slice(-4), avg = recent.reduce((s, x) => s + x, 0) / (recent.length || 1);
  const gap = quarters.length - 1 - (recent.length - 1) / 2;   // quarters from the oldest to the middle of the latest four
  const impliedHalfLife = first > 0 && avg > 0 && gap > 0 ? gap * Math.log(0.5) / Math.log(avg / first) : null;
  return { quarters, impliedHalfLife };
}

/** Calendar label for "q quarters after the window end", e.g. 2027-Q2. */
export function quarterLabel(windowEnd, q) {
  if (q === null) return null;
  const d = new Date(windowEnd + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 3 * q);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Sensitivity grid: growth fade × captured share ⇒ quarters until coverage ≥ BAR. */
export const GRID = { halfLives: [0, 1, 2, 4, Infinity], captures: [null, 0.5, 1] };   // null = the measured share
// 11-06 (re-screen 4 Y-11): every setting of the run (price, resold, issuance path, ramp start) goes into every cell, so the grid
// under a headline answers the same question as the headline. A bare number is still read as priceQ (older callers).
export function grid(base, opts = {}) {
  const o = typeof opts === 'number' ? { priceQ: opts } : opts;
  return GRID.halfLives.map((halfLife) => ({ halfLife, cells: GRID.captures.map((c) => {
    const r = project(base, { ...o, halfLife, capture: c ?? base.captured_share });
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
