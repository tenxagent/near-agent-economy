// The static dashboard: verdict by half, every test with one plain sentence and its exact queries, then every chart with its
// sentence, queries and source. Sentences come from lib/sentences.mjs (computed values, never typed by hand).
import { QUERIES, FILES, sentenceParts } from './sentences.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const badge = (t) => (t.pass === true ? '<b class="b pass">PASS</b>' : t.pass === false ? '<b class="b fail">FAIL</b>'
  : t.value?.status === 'not scorable' ? '<b class="b rep">NOT SCORABLE</b>' : t.value?.status ? '<b class="b pend">PENDING</b>' : '<b class="b rep">REPORT</b>');
const link = (q) => { const [u, ...rest] = q.split(' '); return /^https?:/.test(u) ? `<a href="${esc(u)}">${esc(u)}</a>${rest.length ? ' ' + esc(rest.join(' ')) : ''}` : esc(q); };
const queries = (id) => (QUERIES[id] || []).map((q) => `<li><code>${link(q)}</code></li>`).join('');
// 11-05: links to the committed files this card was computed from (the dashboard is dist/index.html ⇒ ../ = repo root)
const files = (id) => { const f = [...new Set((QUERIES[id] || []).map((q) => FILES[q]).filter(Boolean))]; return f.length ? `<p class="data">Data: ${f.map((x) => `<a href="../${esc(x)}">${esc(x.split('/').pop())}</a>`).join(' · ')}</p>` : ''; };
const HALVES = { usage: 'Usage', capture: 'Value capture', agents: 'Agents' };

// 11-09: "Try your own assumptions" — controls that run lib/model.mjs itself in the browser (via lib/model-ui.mjs), so the page and
// `node model.mjs` cannot disagree. Opened from disk (file://) the browser blocks the module; the note then says how to serve it.
const jsonForScript = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
function tryModel(m) {
  const cap = (100 * m.base.captured_share).toFixed(1);
  return `<div class="try" id="try-model"><h3>Try your own assumptions</h3>
<p class="mut" id="tm-status">These controls run <code>lib/model.mjs</code> in your browser: the same code as <code>node model.mjs</code> and its tests. Loading…</p>
<div class="ctl">
<label>Growth fade: half-life in quarters <span><input type="range" id="tm-hl" min="0" max="8" step="0.25" value="2" disabled> <output id="tm-hl-v">2</output></span></label>
<label class="chk"><input type="checkbox" id="tm-inf" disabled> growth never fades</label>
<label>Buyback share of Intents fees <span><input type="range" id="tm-cap" min="0" max="100" step="0.5" value="${cap}" disabled> <output id="tm-cap-v">${cap}%</output></span></label>
<label>NEAR price change per quarter <span><input type="range" id="tm-pq" min="-20" max="20" step="1" value="0" disabled> <output id="tm-pq-v">+0%</output></span></label>
<label>Bought-back NEAR sold again <span><input type="range" id="tm-rs" min="0" max="100" step="5" value="0" disabled> <output id="tm-rs-v">0%</output></span></label>
<label>Issuance <select id="tm-iss" disabled><option value="current">as now</option><option value="hsp029">HSP-029 ramp: max 2.5% → 1.6%</option></select></label>
<label>HSP-029 ramp starts in (quarters) <span><input type="range" id="tm-ramp" min="0" max="8" step="1" value="0" disabled> <output id="tm-ramp-v">0</output></span></label>
<label class="chk"><button type="button" id="tm-reset" disabled>Reset to the default run</button></label>
</div>
<p id="tm-out" aria-live="polite"></p><p class="mut">The same run in a terminal: <code id="tm-cmd">node model.mjs</code></p>
<script type="application/json" id="tm-base">${jsonForScript(m.base)}</script>
<script>(() => {
  const $ = (id) => document.getElementById(id), base = JSON.parse($('tm-base').textContent), ids = ['tm-hl', 'tm-inf', 'tm-cap', 'tm-pq', 'tm-rs', 'tm-iss', 'tm-ramp', 'tm-reset'];
  import('../lib/model-ui.mjs').then((ui) => {
    const d = ui.defaults(base), sign = (x) => (x > 0 ? '+' : '') + x + '%';
    const read = () => ({ halfLife: $('tm-inf').checked ? Infinity : Number($('tm-hl').value), capture: Number($('tm-cap').value) / 100,
      priceQ: Number($('tm-pq').value) / 100, resold: Number($('tm-rs').value) / 100, issuance: $('tm-iss').value, rampStartQ: Number($('tm-ramp').value) });
    const show = () => {
      const p = read(), r = ui.describe(base, p);
      $('tm-hl-v').textContent = $('tm-inf').checked ? 'never' : $('tm-hl').value; $('tm-hl').disabled = $('tm-inf').checked;
      $('tm-cap-v').textContent = $('tm-cap').value + '%'; $('tm-pq-v').textContent = sign(Number($('tm-pq').value));
      $('tm-rs-v').textContent = $('tm-rs').value + '%'; $('tm-ramp-v').textContent = $('tm-ramp').value; $('tm-ramp').disabled = p.issuance !== 'hsp029';
      $('tm-out').textContent = r.text; $('tm-cmd').textContent = r.command; $('tm-out').dataset.half = String(r.quartersToHalf);
    };
    const reset = () => { $('tm-hl').value = d.halfLife; $('tm-inf').checked = false; $('tm-cap').value = (100 * d.capture).toFixed(1); $('tm-pq').value = 0; $('tm-rs').value = 0; $('tm-iss').value = 'current'; $('tm-ramp').value = 0; show(); };
    ids.forEach((id) => { $(id).disabled = false; $(id).addEventListener(id === 'tm-reset' ? 'click' : 'input', id === 'tm-reset' ? reset : show); });
    $('tm-status').textContent = 'These controls run lib/model.mjs in your browser: the same code as node model.mjs and its tests. Price is flat unless you move it.';
    $('try-model').dataset.state = 'ready'; reset();
  }).catch(() => {
    $('try-model').dataset.state = 'blocked';
    $('tm-status').textContent = 'Your browser did not load lib/model.mjs (pages opened from disk cannot import modules). Use the hosted dashboard, or run python3 -m http.server in the repo folder and open http://localhost:8000/dist/. The grid above and node model.mjs give the same numbers.';
  });
})();</script></div>`;
}

export function page({ results, charts }) {
  const tests = results.tests;
  const strip = Object.entries(HALVES).map(([h, name]) => `<div class="half"><h3>${name}</h3>${tests.filter((t) => t.half === h)
    .map((t) => `<a href="#${t.id}" class="chip">${t.id} ${badge(t)}</a>`).join(' ')}</div>`).join('');
  const cards = tests.map((t) => `<article class="test" id="${t.id}"><header><span class="tid">${t.id}</span>${badge(t)}<span class="half-l">${esc(HALVES[t.half] || t.half)}</span></header>
<h3>${esc(t.question)}</h3>${sentenceParts(t).map(([id, s]) => `<p>${id !== t.id ? `<b>${esc(id.replace(/^C1 /, ''))}:</b> ` : ''}${esc(s)}</p>`).join('')}<p class="rule">Rule: ${esc(t.rule)}</p>${files(t.id)}
<details><summary>Queries and computed value</summary><ul>${queries(t.id)}</ul><pre>${esc(JSON.stringify(t.value, null, 1))}</pre></details></article>`).join('');
  const cs = charts.map((c) => `<section class="chart" id="${c.id}"><h3>${esc(c.title)}</h3><p>${esc(c.sentence)}</p>${c.svg}
<p class="src">Source: ${esc(c.source)}</p><details><summary>Queries</summary><ul>${queries(c.id)}</ul></details></section>`).join('');
  const conclusion = results.conclusion ? `<section class="concl"><h2>What it means for a NEAR holder</h2>${results.conclusion.map((p) => `<p>${esc(p)}</p>`).join('')}</section>` : '';
  // the re-runnable model (lib/model.mjs): default projection + sensitivity grid, and the command to re-run it with other assumptions
  const m = results.model, pc = (x) => `${(100 * x).toFixed(1)}%`, hl = (h) => (h === null || h === Infinity ? 'never fades' : h === 0 ? 'no growth' : `half-life ${h} q`);
  const model = m ? `<section class="concl" id="model"><h2>Model: when does the buyback reach half of new supply?</h2><p>${esc(m.sentence)}</p>
<p class="mut">Coverage = NEAR bought back per year ÷ net new NEAR per year. Now ${pc(m.default.coverage_now)}. The answer depends on how fast Intents' growth fades (the grid below). With the default flag (halving every 2 quarters): ${pc(m.default.coverage_in_4q)} in 4 quarters, ${pc(m.default.coverage_in_8q)} in 8.${m.measured ? ` At the faster fade a two-point fit to the measured quarters implies (halving every ${m.measured.half_life_q} quarters): ${pc(m.measured.coverage_in_4q)} in 4 quarters, ${pc(m.measured.coverage_in_8q)} in 8.` : ''}</p>
<table class="grid"><tr><th>growth fade</th>${m.grid[0].cells.map((c) => `<th>buyback share ${pc(c.capture)}</th>`).join('')}</tr>${m.grid.map((r) => `<tr><td>${hl(r.halfLife)}</td>${r.cells.map((c) => `<td>${c.quartersToHalf ?? '–'} / ${c.quartersToFull ?? '–'}</td>`).join('')}</tr>`).join('')}</table>
<p class="mut">Quarters until the buyback reaches half / all of net new supply (– = not within 10 years), NEAR price flat. Re-run with your own numbers: <code>node model.mjs --half-life 4 --capture 0.5 --price-q 0.1</code> (formulas in <code>lib/model.mjs</code>).</p>${tryModel(m)}</section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,">
<title>NEAR's agent economy, measured</title>
<style>
:root{--fg:#111827;--mut:#6b7280;--line:#e5e7eb;--bg:#fff;--card:#f9fafb;--pass:#15803d;--fail:#b91c1c;--pend:#1d4ed8}
*{box-sizing:border-box}body{font:15px/1.55 system-ui,-apple-system,sans-serif;max-width:920px;margin:24px auto;padding:0 16px;color:var(--fg);background:var(--bg)}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:28px 0 10px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:15px;margin:6px 0}
a{color:#1d4ed8;word-break:break-all}.lede{font-size:16px}.mut,.src,.rule{color:var(--mut);font-size:13px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.half{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.chip{display:inline-block;margin:2px 6px 2px 0;font-size:13px;color:var(--fg);text-decoration:none}
.b{font-size:11px;padding:1px 6px;border-radius:4px;color:#fff}.pass{background:var(--pass)}.fail{background:var(--fail)}.rep{background:var(--mut)}.pend{background:var(--pend)}
.test,.chart,.concl{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:10px 0}.concl{background:#eff6ff;border-color:#bfdbfe}
.test header{display:flex;gap:8px;align-items:center}.tid{font-weight:700}.half-l{color:var(--mut);font-size:12px;margin-left:auto}
details{margin-top:6px}summary{cursor:pointer;color:var(--mut);font-size:13px}ul{padding-left:18px;margin:6px 0}code,pre{font-size:12px}li code{word-break:break-all}
pre{white-space:pre-wrap;word-break:break-all;background:var(--card);padding:8px;border-radius:6px;max-height:320px;overflow:auto}
svg{width:100%;height:auto;border:1px solid #f3f4f6;border-radius:6px}
.try{margin-top:12px;border-top:1px solid #bfdbfe;padding-top:6px}.ctl{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px 18px;margin:8px 0}
.ctl label{display:flex;flex-direction:column;font-size:13px;gap:2px}.ctl label span{display:flex;align-items:center;gap:8px}.ctl input[type=range]{flex:1;min-width:0}.ctl label.chk{flex-direction:row;align-items:center;gap:6px}
#tm-out{font-weight:600}.grid{border-collapse:collapse;font-size:13px;margin:6px 0}.grid th,.grid td{border:1px solid var(--line);padding:3px 8px;text-align:left}
</style></head><body>
<h1>NEAR's agent economy, measured</h1>
<p class="lede">NEAR's long-term case is a bet that NEAR Intents becomes the settlement layer for cross-chain money moved by software, including autonomous agents. We test the three halves of that bet separately, from public data only.</p>
<p class="mut">Rebuilt by <code>node build.mjs</code> on ${esc(results.built_at)} (data through ${esc(results.last_day)}${results.offline ? ', offline rebuild from the committed raw files' : ''}). Claim and tests: <a href="https://github.com/tenxagent/near-agent-economy/blob/main/THESIS.md">THESIS.md</a>; forward tests: <a href="https://github.com/tenxagent/near-agent-economy/blob/main/PREREG.md">PREREG.md</a>; code and raw data: <a href="https://github.com/tenxagent/near-agent-economy">github.com/tenxagent/near-agent-economy</a>.</p>
<div class="strip">${strip}</div>
${conclusion}
${model}
<h2>Tests</h2>${cards}
<h2>Charts</h2>${cs}
<p class="src">Built by claude-10x, an autonomous AI agent operated by gh, for NEAR HACKATHON. Raw inputs: data/raw/*.json, data/nearblocks-charts.json, data/snapshots.jsonl, data/agent-ground-truth.json.</p>
</body></html>`;
}
