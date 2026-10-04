// Measure (1) time until a document is actually on screen and (2) memory the
// editor adds on top of an empty browser. Cold = fresh browser profile, so the
// editor's ~60 MB of code is read from the local server each time; warm = second
// open in the same browser (code cached), which is what a second tab would feel like.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad';
const require = createRequire(path.join(S, 'document/package.json'));
const { chromium } = require('@playwright/test');
const EXE = fs.readdirSync(`${process.env.HOME}/.cache/ms-playwright/chromium-1243`).map((d) => `${process.env.HOME}/.cache/ms-playwright/chromium-1243/${d}/chrome`).find(fs.existsSync);
const rss = () => Math.round(Number(execSync(`for p in $(pgrep -f chromium-1243); do awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null; done | awk '{s+=$1} END {print s+0}'`, { shell: '/bin/bash' }).toString().trim()) / 1024);
const byType = () => execSync(`for p in $(pgrep -f chromium-1243); do t=$(tr '\\0' ' ' < /proc/$p/cmdline | grep -oE -- '--type=[a-z-]+|--utility-sub-type=[a-zA-Z.]+' | tail -1); [ -z "$t" ] && t=browser; echo "$t $(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null)"; done | awk '{a[$1]+=$2} END {for (k in a) printf "%s=%dMB ", k, a[k]/1024}'`, { shell: '/bin/bash' }).toString().trim();

async function visible(page, t0) {
  // Poll every frame until OnlyOffice's loading mask is gone and its canvas area exists.
  for (;;) {
    for (const f of page.frames()) {
      if (!/web-apps\/apps/.test(f.url())) continue;
      const ok = await f.evaluate(() => {
        const mask = [...document.querySelectorAll('.asc-loadmask, .loadmask, .loading-mask')].some((m) => m.offsetParent !== null);
        return !mask && !!document.querySelector('#editor_sdk, #ws-canvas-outer, #id_main_view');
      }).catch(() => false);
      if (ok) return Date.now() - t0;
    }
    if (Date.now() - t0 > 120000) return -1;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function openIn(page, name) {
  const bytes = fs.readFileSync(path.join(S, 'samples', name));
  const t0 = Date.now();
  await page.evaluate(async ({ b64, name }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return window.send('document:open-buffer', { fileName: name, buffer: bin.buffer });
  }, { b64: bytes.toString('base64'), name });
  return visible(page, t0);
}

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await page.goto('about:blank');
await page.waitForTimeout(1500);
const base = rss();
const t0 = Date.now();
await page.goto('http://127.0.0.1:4718/host.html');
await page.waitForFunction(() => window.__events.some((e) => e.type === 'document:ready'), null, { timeout: 120000 });
const shellMs = Date.now() - t0;
await page.waitForTimeout(1500);
const shell = rss();
const out = { baseMB: base, editorShellMB: shell - base, shellMs, files: [] };
for (const name of process.argv.slice(2)) {
  const coldOrWarm = out.files.length === 0 ? 'first' : 'later';
  const ms = await openIn(page, name);
  await page.waitForTimeout(1500);
  out.files.push({ name, [coldOrWarm + 'VisibleMs']: ms, totalAboveBaseMB: rss() - base, byType: byType() });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
