#!/usr/bin/env node
// make-avatar.mjs — the app icon as a social profile picture: the face on the frosted surface, with that
// surface filling the whole square instead of stopping at the app tile's rounded corners.
//
//   node scripts/campaign/make-avatar.mjs <out.png> [px=800] [face width, of 100 = 62]
//
// WHY (Destin, 2026-11-27): "a version of our app icon that has a bigger background surface instead of being
// fitted to the current app square so it'll fit/fill the linkedin profile icon space". LinkedIn, and most
// social sites, crop the picture themselves (square or circle), so the tile's own corners and shadow showed
// as a box inside a box.
// WHY it reads the app's drawing instead of copying it: the icon has ONE drawing
// (youcoded/scripts/icons/brand-icons.html, brand guide section 4). This adds one extra layout to that page
// in memory, so the face, colours and glass can never drift from the real icon.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [out, px = '800', w = '62'] = process.argv.slice(2);
if (!out) throw new Error('usage: make-avatar.mjs <out.png> [px] [face width]');
const here = path.dirname(fileURLToPath(import.meta.url));
// the app repo sits beside the workspace's worktrees; YOUCODED=… overrides
const icons = process.env.YOUCODED_ICONS || ['../../youcoded', '../../../../../youcoded'].map((p) => path.resolve(here, p, 'scripts/icons')).find((p) => fs.existsSync(p));
if (!icons) throw new Error('cannot find youcoded/scripts/icons — set YOUCODED_ICONS');
let html = fs.readFileSync(path.join(icons, 'brand-icons.html'), 'utf8');
// the frosted tile's own fill and highlight, square-cornered, with no rim or shadow (the site crops the edge)
const avatar = "avatar: () => `<div class=\"glass\" style=\"inset:0;border-radius:0;box-shadow:none;background:linear-gradient(165deg,#FBF6FD,#E9DCF2)\">` + face({ w: " + Number(w) + " }) + `</div>`,";
if (!html.includes('const ICONS = {')) throw new Error('the icon drawing changed shape: update make-avatar.mjs');
html = html.replace('const ICONS = {', 'const ICONS = {\n  ' + avatar).replace('<meta charset="utf-8">', `<meta charset="utf-8"><base href="file://${icons}/">`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-avatar-'));
const page = path.join(tmp, 'avatar.html');
fs.writeFileSync(page, html);
const chrome = process.env.CHROME || ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']
  .find((b) => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!chrome) throw new Error('no Chrome found — set CHROME=/path/to/chrome');
execFileSync(chrome, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${px},${px}`,
  '--virtual-time-budget=5000', '--allow-file-access-from-files', `--user-data-dir=${path.join(tmp, 'chrome')}`,
  `--screenshot=${path.resolve(out)}`, `file://${page}?i=avatar&px=${px}`], { stdio: 'ignore' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(path.resolve(out));
