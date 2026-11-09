// 11-09: the dashboard's "Try your own assumptions" controls run lib/model.mjs through lib/model-ui.mjs. These tests pin that the
// page's words and its printed terminal command give the SAME run as `node model.mjs`, on the committed build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaults, cliCommand, describe } from '../lib/model-ui.mjs';
import { page } from '../lib/page.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(fs.readFileSync(path.join(DIR, 'dist', 'results.json'), 'utf8'));
const base = results.model.base;

test('the default controls are the CLI default run: no flags, same answer as the build', () => {
  assert.equal(cliCommand(base, defaults(base)), 'node model.mjs');
  const r = describe(base, defaults(base));
  assert.equal(r.quartersToHalf, results.model.default.quartersToHalf);
  assert.equal(r.quartersToFull, results.model.default.quartersToFull);
  assert.ok(Math.abs(r.coverage_in_4q - results.model.default.coverage_in_4q) < 1e-12);
});

test('changed controls print only the flags that differ', () => {
  const p = { ...defaults(base), halfLife: Infinity, capture: 0.5, priceQ: 0.1 };
  assert.equal(cliCommand(base, p), 'node model.mjs --half-life inf --capture 0.5 --price-q 0.1');
  assert.equal(cliCommand(base, { ...defaults(base), issuance: 'hsp029', rampStartQ: 2, resold: 0.25 }), 'node model.mjs --resold 0.25 --issuance hsp029 --ramp-start-q 2');
  assert.equal(cliCommand(base, { ...defaults(base), rampStartQ: 3 }), 'node model.mjs', 'a ramp start without the HSP-029 path changes nothing');
});

test('the printed command, run for real, gives the page\'s answer', () => {
  for (const p of [{ halfLife: 4, capture: 0.5 }, { halfLife: Infinity, priceQ: 0.05 }, { halfLife: 0 }, { issuance: 'hsp029', rampStartQ: 2, halfLife: 1 }]) {
    const run = { ...defaults(base), ...p }, ui = describe(base, run);
    const args = ui.command.split(' ').slice(2);
    const cli = JSON.parse(execFileSync('node', ['model.mjs', ...args, '--json'], { cwd: DIR, encoding: 'utf8' }));
    assert.equal(cli.quartersToHalf, ui.quartersToHalf, ui.command);
    assert.equal(cli.quartersToFull, ui.quartersToFull, ui.command);
    assert.ok(Math.abs(cli.rows[8].coverage - ui.coverage_in_8q) < 1e-12, ui.command);
  }
});

test('the dashboard embeds the build\'s model start and imports the shared module (no copied formula)', () => {
  const html = page({ results, charts: [] });
  assert.match(html, /id="try-model"/);
  assert.match(html, /import\('\.\.\/lib\/model-ui\.mjs'\)/);
  const json = html.match(/<script type="application\/json" id="tm-base">([^<]*)<\/script>/)[1];
  assert.deepEqual(JSON.parse(json), base);
  const script = html.slice(html.indexOf('id="tm-base"'));
  assert.doesNotMatch(script.slice(0, script.indexOf('</div>')), /Math\.pow|0\.5 \*\*|coverage =/, 'the page must not re-implement the model');
});
