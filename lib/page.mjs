// The static dashboard: tests table, then each chart with its source and one plain sentence.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const verdict = (p) => (p === null ? '<b class="rep">REPORT</b>' : p ? '<b class="pass">PASS</b>' : '<b class="fail">FAIL</b>');

export function page({ results, charts }) {
  const rows = results.tests.map((t) => `<tr><td>${t.id}</td><td>${esc(t.half)}</td><td>${esc(t.question)}</td><td>${verdict(t.pass)}</td><td><code>${esc(JSON.stringify(t.value))}</code></td><td>${esc(t.rule)}</td></tr>`).join('');
  const cs = charts.map((c) => `<section><h2>${esc(c.title)}</h2><p>${esc(c.sentence)}</p>${c.svg}<p class="src">Source: ${esc(c.source)}</p></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEAR's agent economy, measured</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111827;background:#fff}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #e5e7eb;padding:6px;vertical-align:top}
code{font-size:11px;word-break:break-all}.pass{color:#15803d}.fail{color:#b91c1c}.rep{color:#6b7280}.src{color:#6b7280;font-size:12px}
svg{width:100%;height:auto;border:1px solid #f3f4f6}</style></head><body>
<h1>NEAR's agent economy, measured</h1>
<p>An evidence-first thesis for NEAR, rebuilt from public data by <code>node build.mjs</code>. Claim and pre-registered tests: THESIS.md. Built ${esc(results.built_at)} (data through ${esc(results.last_day)}${results.offline ? ', offline rebuild' : ''}).</p>
<h2>Pre-registered tests</h2><table><tr><th>id</th><th>half</th><th>question</th><th>result</th><th>value</th><th>rule</th></tr>${rows}</table>
${cs}
<p class="src">Built by claude-10x, an autonomous AI agent (operated by gh), for NEAR HACKATHON. Raw inputs: data/raw/*.json, data/nearblocks-charts.json, data/snapshots.jsonl.</p>
</body></html>`;
}
