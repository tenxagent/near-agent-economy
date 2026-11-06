// C1 reconciliation (added 2026-11-06, after re-screen 4): every receipt of the buyback wallet, from NearBlocks' public API,
// trimmed to what a balance needs, so build.mjs can close the wallet's balance instead of stopping at "holds 68%":
// what came in and from whom, what went out and to whom, and whether that sums to the balance archival RPC reports.
//   fetchReceipts(account, { prev })  pages forward from the newest receipt in `prev` (cursor = NearBlocks row id), ~11 s apart
//   reconcile(rows, balanceYocto)     pure: totals in yoctoNEAR (BigInt), by counterparty and by month, and the residual
// NearBlocks returns deposits as JSON numbers (doubles); each is kept as the integer string of that double. At ~3k rows the
// rounding is below 1e-9 NEAR in total, far under the gas the wallet pays, so the residual is a real check, not noise.
const NB = 'https://api.nearblocks.io/v1/account';
const UA = 'near-agent-economy-thesis/0.1 (+https://github.com/tenxagent)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a double prints as its shortest round-trip decimal ("7.1414637504e+23"); expand that text rather than the binary value
const dec = (n) => { const m = String(n).match(/^(\d+)(?:\.(\d+))?e\+(\d+)$/); if (!m) return /^\d+$/.test(String(n)) ? String(n) : BigInt(Math.round(n)).toString();
  const [, a, b = '', e] = m; return BigInt(a + b + '0'.repeat(Number(e) - b.length)).toString(); };
const int = (x) => (x === null || x === undefined ? '0' : typeof x === 'number' ? dec(x) : BigInt(x).toString());

export function trim(x) {
  return {
    id: String(x.id), receipt: x.receipt_id, tx: x.transaction_hash, block: x.receipt_block?.block_height ?? null,
    ts: String(x.receipt_block?.block_timestamp ?? x.block_timestamp), from: x.predecessor_account_id, to: x.receiver_account_id,
    ok: x.receipt_outcome?.status !== false,
    actions: (x.actions ?? []).map((a) => ({ a: a.action, ...(a.method ? { m: a.method } : {}), d: int(a.deposit) })),
  };
}

async function page(account, cursor, { tries = 4, gapMs }) {
  const url = `${NB}/${account}/receipts?per_page=100&order=asc${cursor ? `&cursor=${cursor}` : ''}`;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 429) { last = 'HTTP 429'; await sleep(gapMs * (i + 3)); continue; }
      if (!r.ok) { last = `HTTP ${r.status}`; await sleep(gapMs); continue; }
      return await r.json();
    } catch (e) { last = String(e.message || e); await sleep(gapMs); }
  }
  throw new Error(`${url}: ${last}`);
}

export async function fetchReceipts(account, { prev = [], gapMs = 11_000, log = () => {}, onPage = () => {} } = {}) {
  const rows = [...prev];
  const seen = new Set(rows.map((r) => r.id));
  let cursor = rows.length ? rows.at(-1).id : null;
  for (let first = true; ; first = false) {
    if (!first) await sleep(gapMs);
    const d = await page(account, cursor, { gapMs });
    const got = (d.txns ?? []).map(trim).filter((r) => !seen.has(r.id));
    for (const r of got) { seen.add(r.id); rows.push(r); }
    log(`page after ${cursor ?? 'start'}: +${got.length} (total ${rows.length})`);
    onPage(rows);
    if (!d.cursor || (d.txns ?? []).length < 100 || !got.length) break;
    cursor = d.cursor;
  }
  return rows;
}

// The balance is read at the block of the newest receipt NearBlocks returned, so receipts the indexer has not reached yet
// cannot break the closure: everything up to that block is in `rows`, everything after it is outside the balance too.
export async function balanceAt(account, blockHeight, urls = ['https://archival-rpc.mainnet.fastnear.com', 'https://archival-rpc.mainnet.near.org']) {
  let last;
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', block_id: blockHeight, account_id: account } }) });
      const j = await r.json();
      if (!j.result) throw new Error(JSON.stringify(j.error ?? j).slice(0, 160));
      return { rpc: url, block: j.result.block_height, yocto: j.result.amount };
    } catch (e) { last = e; }
  }
  throw last;
}

export async function receiptCount(account) {
  const r = await fetch(`${NB}/${account}/receipts/count`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`receipts/count: HTTP ${r.status}`);
  const n = Number((await r.json()).txns?.[0]?.count);
  if (!Number.isFinite(n)) throw new Error('receipts/count: no count in the response');
  return n;
}

const month = (ts) => new Date(Number(BigInt(ts) / 1_000_000n)).toISOString().slice(0, 7);
const add = (m, k, v) => m.set(k, (m.get(k) ?? 0n) + v);

// Value in = deposits of successful receipts sent TO the wallet by someone else. Value out = deposits the wallet sent to
// others. Gas refunds from `system` are listed apart and NOT added: they hand back part of what was deducted when the
// wallet signed its own transactions (a deduction no receipt shows), so the residual in - out - balance is the wallet's
// net fees for those transactions, less the contract reward it earns on its own method calls. Both are small, so a large
// residual means receipts are missing or misread. (A failed outgoing transfer comes back as a `system` refund too; the
// buyback wallet has none, and the test on the committed file would show one as a negative residual.)
export function reconcile(rows, balanceYocto, { account, uptoBlock = Infinity }) {
  let inn = 0n, out = 0n, refunds = 0n;
  const bySender = new Map(), byReceiver = new Map(), inByMonth = new Map(), firstIn = new Map(), maxIn = new Map(), outs = [];
  let used = 0;
  for (const r of rows) {
    if (r.block > uptoBlock) continue;
    used++;
    const d = r.actions.reduce((a, x) => a + BigInt(x.d), 0n);
    if (!d) continue;
    if (r.to === account && r.from !== account) {
      if (!r.ok) continue;
      if (r.from === 'system') { refunds += d; continue; }
      inn += d; add(bySender, r.from, d); add(inByMonth, month(r.ts), d);
      if (!firstIn.has(r.from)) firstIn.set(r.from, new Date(Number(BigInt(r.ts) / 1_000_000n)).toISOString());
      if (!maxIn.has(r.from) || d > BigInt(maxIn.get(r.from).yocto)) maxIn.set(r.from, { yocto: d.toString(), at: new Date(Number(BigInt(r.ts) / 1_000_000n)).toISOString(), tx: r.tx });
    } else if (r.from === account && r.to !== account) {
      out += d; add(byReceiver, r.to, d); outs.push({ ts: r.ts, to: r.to, yocto: d.toString(), tx: r.tx });
    }
  }
  const balance = BigInt(balanceYocto), residual = inn - out - balance;
  const sorted = (m) => [...m].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).map(([k, v]) => [k, v.toString()]);
  return { rows: used, in_yocto: inn.toString(), refunds_yocto: refunds.toString(), out_yocto: out.toString(),
    balance_yocto: balance.toString(), residual_yocto: residual.toString(),
    in_by_sender: sorted(bySender), first_in_by_sender: Object.fromEntries(firstIn), largest_in_by_sender: Object.fromEntries(maxIn), out_by_receiver: sorted(byReceiver), outs,
    in_by_month: [...inByMonth].sort().map(([k, v]) => [k, v.toString()]) };
}
