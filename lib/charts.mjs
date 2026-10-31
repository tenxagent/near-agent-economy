// Minimal hand-written SVG charts (no dependencies): line charts with linear or log y, and a scatter plot.
const W = 760, H = 320, M = { l: 70, r: 20, t: 16, b: 56 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toX = (x) => (typeof x === 'number' ? x : Date.parse(/^\d{4}-\d{2}$/.test(x) ? `${x}-01T00:00:00Z` : x));
function siFmt(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return `${+v.toFixed(a < 1 ? 2 : 0)}`;
}

export function svgLine({ series, log = false, pct = false, yMax = null, time = false }) {
  const pts = series.flatMap((s) => s.points.filter(([, y]) => Number.isFinite(y) && (!log || y > 0)).map(([x, y]) => [toX(x), y]));
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = log ? Math.floor(Math.log10(Math.min(...ys))) : 0;
  let y1 = log ? Math.ceil(Math.log10(Math.max(...ys))) : (yMax ?? Math.max(...ys) * 1.05);
  if (y1 === y0) y1 = y0 + 1;
  const sx = (x) => M.l + ((x - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const sy = (y) => { const v = log ? Math.log10(y) : y; return H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b); };
  let g = '';
  const yt = log ? Array.from({ length: y1 - y0 + 1 }, (_, i) => 10 ** (y0 + i)) : Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  for (const v of yt) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e5e7eb"/><text x="${M.l - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${pct ? `${Math.round(v * 100)}%` : siFmt(v)}</text>`;
  const xt = 6;
  for (let i = 0; i <= xt; i++) {
    const x = x0 + ((x1 - x0) * i) / xt, d = new Date(x).toISOString();
    g += `<text x="${sx(x)}" y="${H - M.b + 16}" text-anchor="middle" font-size="11" fill="#6b7280">${time ? d.slice(5, 16).replace('T', ' ') : d.slice(0, 7)}</text>`;
  }
  series.forEach((s, i) => {
    const p = s.points.filter(([, y]) => Number.isFinite(y) && (!log || y > 0)).map(([x, y]) => `${sx(toX(x)).toFixed(1)},${sy(y).toFixed(1)}`);
    g += `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${p.join(' ')}"/>`;
    g += `<rect x="${M.l + i * 230}" y="${H - 18}" width="12" height="3" fill="${s.color}"/><text x="${M.l + i * 230 + 16}" y="${H - 13}" font-size="11" fill="#374151">${esc(s.name)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">${g}</svg>`;
}

export function svgScatter({ points, xLabel, yLabel }) {
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const mx = Math.max(...xs.map(Math.abs)) * 1.05, my = Math.max(...ys.map(Math.abs)) * 1.05;
  const sx = (x) => M.l + ((x + mx) / (2 * mx)) * (W - M.l - M.r), sy = (y) => H - M.b - ((y + my) / (2 * my)) * (H - M.t - M.b);
  let g = `<line x1="${sx(-mx)}" x2="${sx(mx)}" y1="${sy(0)}" y2="${sy(0)}" stroke="#9ca3af"/><line x1="${sx(0)}" x2="${sx(0)}" y1="${sy(-my)}" y2="${sy(my)}" stroke="#9ca3af"/>`;
  for (const [x, y] of points) g += `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="3" fill="#2563eb" fill-opacity="0.6"/>`;
  g += `<text x="${(M.l + W - M.r) / 2}" y="${H - 20}" text-anchor="middle" font-size="12" fill="#374151">${esc(xLabel)}</text>`;
  g += `<text x="16" y="${(M.t + H - M.b) / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 16 ${(M.t + H - M.b) / 2})">${esc(yLabel)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">${g}</svg>`;
}
