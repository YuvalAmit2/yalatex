// tools/shot.mjs -- check a built page in Chrome: screenshots and a few probes.
//   node tools/shot.mjs <page.html> <out dir> [light|dark]
// Needs playwright-core in the cache folder (not installed by setup.sh):
//   cd ~/.cache/yalatex-html && npm install --no-save playwright-core@1.64.1
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
const CACHE = process.env.YA_HTML_CACHE || path.join(os.homedir(), '.cache', 'yalatex-html');
const {chromium} = createRequire(path.join(CACHE, 'package.json'))('playwright-core');
const [page_, outDir, scheme = 'light'] = process.argv.slice(2);
const b = await chromium.launch({channel: 'chrome'});
const p = await b.newPage({viewport: {width: 1400, height: 900}, colorScheme: scheme});
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('file://' + path.resolve(page_));
await p.waitForTimeout(800);
const shot = async (name) => p.screenshot({path: path.join(outDir, name + '.png')});
await shot('top');
// a section with a diagram
await p.evaluate(() => { const i = document.querySelector('.ya-pic-row img'); i.scrollIntoView({block: 'center'}); });
await p.waitForTimeout(300); await shot('diagram');
// hover a reference to a theorem
const ref = p.locator('a[href="#thm:riemann-extension"]').first();
await ref.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -200));
await ref.hover(); await p.waitForTimeout(600); await shot('preview-ref');
// hover a defined word
await p.mouse.move(5, 5); await p.waitForTimeout(500);
const term = p.locator('a.ya-tl').nth(40);
await term.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -250));
await term.hover(); await p.waitForTimeout(600); await shot('preview-term');
// hover an equation reference
await p.mouse.move(5, 5); await p.waitForTimeout(500);
const eq = p.locator('a[href^="#eq:"]').first();
await eq.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -250));
await eq.hover(); await p.waitForTimeout(600); await shot('preview-eq');
await p.mouse.move(5, 5);
// search
const res = await p.evaluate(() => ['\\C^n', 'holomorphic function', '$\\mathcal O_X$', 'sheaf $\\cF$'].map(q => q + ': ' + window.yaNotes.find(q).length));
await p.fill('#ya-find', '\\C^n'); await p.waitForTimeout(600); await shot('search');
const notation = await p.evaluate(() => document.querySelectorAll('.ya-ntl').length);
const atomsOk = await p.evaluate(() => { let ok = 0, all = 0; document.querySelectorAll('.ya-math mjx-container').forEach(m => { all++; const a = window.yaNotes.atoms(m); if (a.tex.length === a.chtml.length) ok++; }); return ok + '/' + all; });
await p.setViewportSize({width: 390, height: 844}); await p.waitForTimeout(300);
const phone = await p.evaluate(() => document.documentElement.scrollWidth);
await shot('phone');
console.log(JSON.stringify({errs, search: res, notationLinked: notation, formulasAligned: atomsOk, phoneScrollWidth: phone}, null, 1));
await b.close();
