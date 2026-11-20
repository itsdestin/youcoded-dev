// Take 1B: photographs the REAL youcoded app (the practice build of this worktree's renderer, the same one the
// campaign recordings use) wearing new looks, for the film's "every copy is different" screens.
// WHY (reviewer 2026-11-20, and the owner): the old set (a cartoon desert, a painted anime city, a plain lilac)
// looked clip-art, and the window that said "make it feel like sunset" showed a blue midday city. Each look
// here is a real theme pack (tokens, wallpaper, font, layout: exactly what the app's theme engine reads), loaded
// into the real renderer, so the pictures are the app, not a drawing of it. The one window that asks for a
// sunset is photographed in the sunset look, so the request and the result agree.
// Nothing in the app repo is changed: the packs are handed to the page as it loads (see INJECT below).
//   node src/round2/take1b-themes.mjs            (from the film folder; writes public/stills/take1b-th-*.png)
//   node src/round2/take1b-themes.mjs --sheet    (also writes a 6-up candidate sheet to out/r2/take1b-themes-sheet.png)
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { ensureBuild, openBrowser } from '../../../../shoot/engine.mjs';

const FILM = resolve(import.meta.dirname, '..', '..');
const WORKTREE = resolve(FILM, '..', '..', '..');
const OUT = join(FILM, 'public', 'stills');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------
// The wallpapers, drawn as SVG. WHY drawn shapes and no photographs: no stock imagery (brand §8), and flat,
// confident shapes stay readable when a screen is the size of a stamp on the wall.
// ---------------------------------------------------------------------------------------------------
const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" width="1600" height="1000"><defs>${defs}</defs>${body}</svg>`;
const grain = (id, op) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${op} 0"/></filter>`;

const WALL = {
  // "make it feel like sunset": a low sun on a warm sea, a dark headland. Warm only (brand: no purple-to-blue).
  sunset: svg(`
    <rect width="1600" height="1000" fill="url(#sky)"/>
    <g fill="#F49A6C" opacity="0.75"><rect x="160" y="210" width="520" height="16" rx="8"/><rect x="260" y="240" width="300" height="10" rx="5"/><rect x="980" y="160" width="460" height="14" rx="7"/><rect x="1100" y="186" width="250" height="9" rx="4.5"/><rect x="760" y="330" width="380" height="11" rx="5.5"/></g>
    <g fill="#C94E4A" opacity="0.35"><rect x="200" y="226" width="420" height="6" rx="3"/><rect x="1020" y="175" width="360" height="6" rx="3"/></g>
    <clipPath id="above"><rect width="1600" height="640"/></clipPath>
    <circle cx="820" cy="640" r="128" fill="#FFF3D2" clip-path="url(#above)"/>
    <rect y="640" width="1600" height="360" fill="url(#sea)"/>
    <g fill="#FFE6B4">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${820 - (150 - i * 13)}" y="${656 + i * 30}" width="${2 * (150 - i * 13)}" height="${7 - i * 0.5}" rx="3" opacity="${0.9 - i * 0.08}"/>`).join('')}</g>
    <path d="M0 520 C 120 500 210 470 300 488 C 380 504 430 560 520 600 C 560 618 600 632 640 640 L 0 640 Z" fill="#7A3046"/>
    <path d="M0 640 L 0 600 C 80 590 160 610 260 640 Z" fill="#5C2238"/>
    <path d="M1150 640 C 1250 600 1330 590 1420 604 C 1500 616 1560 628 1600 624 L 1600 640 Z" fill="#B0565A"/>`,
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9434A"/><stop offset="0.3" stop-color="#E8704F"/><stop offset="0.52" stop-color="#F7A061"/><stop offset="0.64" stop-color="#FFD592"/></linearGradient>
   <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F09A6A"/><stop offset="0.45" stop-color="#C45A5E"/><stop offset="1" stop-color="#6E2A44"/></linearGradient>`),
  // "loud and bright, like a gig poster": flat primary shapes on warm white
  poster: svg(`
    <rect width="1600" height="1000" fill="#F2EEE4"/>
    <path d="M0 1000 L0 300 A700 700 0 0 1 700 1000 Z" fill="#1F3FE0"/>
    <rect x="890" y="0" width="190" height="1000" fill="#FF4A2A"/>
    <path d="M1600 0 L1600 460 A460 460 0 0 1 1140 0 Z" fill="#FFC21A"/>
    <path d="M520 0 L1600 860" stroke="#111" stroke-width="10"/>
    <g fill="#111">${Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<circle cx="${180 + c * 46}" cy="${110 + r * 46}" r="7"/>`).join('')).join('')}</g>`),
  // "dark and quiet, like a late-night magazine": charcoal with grain, column rules, one vermilion rule
  editorial: svg(`
    <rect width="1600" height="1000" fill="#151311"/>
    <g stroke="#23201C" stroke-width="2">${[320, 640, 960, 1280].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="1000"/>`).join('')}</g>
    <rect x="0" y="118" width="1600" height="3" fill="#2B2722"/>
    <rect x="96" y="96" width="120" height="10" fill="#FF5A36"/>
    <rect width="1600" height="1000" filter="url(#g)"/>`, grain('g', 0.09)),
  // "make it feel like paper and ink": warm paper, blue rules, a red margin
  paper: svg(`
    <rect width="1600" height="1000" fill="#EFE5D0"/>
    <g stroke="#9DB0D6" stroke-width="2" opacity="0.65">${Array.from({ length: 22 }, (_, i) => `<line x1="0" y1="${70 + i * 44}" x2="1600" y2="${70 + i * 44}"/>`).join('')}</g>
    <line x1="210" y1="0" x2="210" y2="1000" stroke="#D97A6E" stroke-width="3"/>
    <rect width="1600" height="1000" fill="url(#vig)"/>
    <rect width="1600" height="1000" filter="url(#g)"/>`,
  `${grain('g', 0.16)}<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#6B4E22" stop-opacity="0.18"/></radialGradient>`),
  // "make it look like a swimming pool": aqua tiles, a lane line, light rippling on the floor
  pool: svg(`
    <rect width="1600" height="1000" fill="url(#water)"/>
    <g stroke="#9BE3EE" stroke-width="3" opacity="0.45" filter="url(#warp)">${Array.from({ length: 28 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="1000"/>`).join('')}${Array.from({ length: 18 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1600" y2="${i * 60}"/>`).join('')}</g>
    <g filter="url(#warp)"><rect x="740" y="0" width="56" height="860" fill="#0F4E86"/><rect x="640" y="804" width="256" height="56" fill="#0F4E86"/></g>
    <rect width="1600" height="1000" filter="url(#caustic)" opacity="0.55"/>`,
  `<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58D0DD"/><stop offset="1" stop-color="#1F9CC0"/></linearGradient>
   <filter id="warp"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter>
   <filter id="caustic" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.011 0.016" numOctaves="2" seed="11"/><feColorMatrix type="luminanceToAlpha"/><feComponentTransfer><feFuncA type="table" tableValues="1 0.2 0 0 0 0 0 0"/></feComponentTransfer><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>`),
};

// ---------------------------------------------------------------------------------------------------
// The theme packs, in the app's own manifest format (wecoded-themes). Tokens chosen so each look's text passes
// contrast on its own panels.
// ---------------------------------------------------------------------------------------------------
const pack = (slug, name, dark, tokens, bg, layout, font, extra = {}) => ({
  name, slug, version: '1.0.0', dark, author: 'a person, by asking', created: '2026-11-20', description: name,
  // WHY the scrollbar pair is filled from the accent: the app's validator requires both, and refuses the pack without them
  tokens: { 'scrollbar-thumb': tokens['fg-faint'], 'scrollbar-hover': tokens.accent, ...tokens }, shape: { radius: '10px', 'radius-sm': '8px', 'radius-md': '14px', 'radius-lg': '20px', 'radius-xl': '26px', 'radius-2xl': '30px', 'radius-full': '9999px' },
  background: bg, layout, ...(font ? { font } : {}), ...extra,
});
const PACKS = [
  pack('tb-sunset', 'Sunset', false,
    { canvas: '#FBE3CF', panel: '#FFF4EA', inset: '#FBE6D6', well: '#F6DCC6', accent: '#C8452E', 'on-accent': '#FFFFFF', fg: '#3B1A16', 'fg-2': '#5C2F27', 'fg-dim': '#7A4A3E', 'fg-muted': '#8E5D50', 'fg-faint': '#B08273', edge: '#E9C3AE', 'edge-dim': '#E9C3AE80' },
    { type: 'image', value: '/__tb/sunset.svg', 'average-color': '#E98A5E', opacity: 1, 'panels-blur': 14, 'panels-opacity': 0.82, 'bubble-blur': 12, 'bubble-opacity': 0.9 },
    { 'input-style': 'floating', 'bubble-style': 'default', 'header-style': 'default', 'statusbar-style': 'default' },
    { family: "'Outfit', 'DM Sans', sans-serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap' }),
  pack('tb-poster', 'Poster', false,
    { canvas: '#F2EEE4', panel: '#FFFFFF', inset: '#F5F2EA', well: '#ECE7DB', accent: '#1F3FE0', 'on-accent': '#FFFFFF', fg: '#111111', 'fg-2': '#2A2A2A', 'fg-dim': '#4A4A4A', 'fg-muted': '#5E5E5E', 'fg-faint': '#8A8A8A', edge: '#111111', 'edge-dim': '#11111133' },
    { type: 'image', value: '/__tb/poster.svg', 'average-color': '#E7C8A2', opacity: 1, 'panels-blur': 0, 'panels-opacity': 1, 'bubble-blur': 0, 'bubble-opacity': 1 },
    { 'input-style': 'floating', 'bubble-style': 'bordered', 'header-style': 'default', 'statusbar-style': 'default' },
    { family: "'Space Grotesk', sans-serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap' }),
  pack('tb-editorial', 'Late Edition', true,
    { canvas: '#151311', panel: '#1E1B18', inset: '#24211D', well: '#0F0E0C', accent: '#FF5A36', 'on-accent': '#151311', fg: '#EFE8DC', 'fg-2': '#D8CFC0', 'fg-dim': '#A99F90', 'fg-muted': '#8F8678', 'fg-faint': '#6A6258', edge: '#3A352E', 'edge-dim': '#3A352E80' },
    { type: 'image', value: '/__tb/editorial.svg', 'average-color': '#181614', opacity: 1, 'panels-blur': 0, 'panels-opacity': 0.94, 'bubble-blur': 0, 'bubble-opacity': 1 },
    { 'input-style': 'default', 'bubble-style': 'bordered', 'header-style': 'default', 'statusbar-style': 'default' },
    { family: "'Fraunces', Georgia, serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap' }),
  pack('tb-paper', 'Paper & Ink', false,
    { canvas: '#EFE5D0', panel: '#F8F1E2', inset: '#F2E9D6', well: '#E8DCC2', accent: '#23397A', 'on-accent': '#FFFFFF', fg: '#26211B', 'fg-2': '#3F372D', 'fg-dim': '#5E5446', 'fg-muted': '#74695A', 'fg-faint': '#A0937E', edge: '#D7C9AC', 'edge-dim': '#D7C9AC80' },
    { type: 'image', value: '/__tb/paper.svg', 'average-color': '#E6DAC0', opacity: 1, 'panels-blur': 0, 'panels-opacity': 0.9, 'bubble-blur': 0, 'bubble-opacity': 0.96 },
    { 'input-style': 'default', 'bubble-style': 'flat', 'header-style': 'default', 'statusbar-style': 'default' },
    { family: "'Lora', Georgia, serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap' }),
  pack('tb-pool', 'Pool', false,
    { canvas: '#CDEFF4', panel: '#F2FBFC', inset: '#E2F5F8', well: '#C4E9EF', accent: '#0F4E86', 'on-accent': '#FFFFFF', fg: '#0B2B40', 'fg-2': '#18405A', 'fg-dim': '#3A6075', 'fg-muted': '#4E7186', 'fg-faint': '#7E9CAD', edge: '#A9DCE5', 'edge-dim': '#A9DCE580' },
    { type: 'image', value: '/__tb/pool.svg', 'average-color': '#3BB4CE', opacity: 1, 'panels-blur': 12, 'panels-opacity': 0.84, 'bubble-blur': 10, 'bubble-opacity': 0.9 },
    { 'input-style': 'floating', 'bubble-style': 'pill', 'header-style': 'default', 'statusbar-style': 'default' },
    { family: "'Nunito', sans-serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap' }),
];

// The page is handed the packs as it loads: the practice app's mock assigns window.claude, and this wraps
// its theme namespace so list() also names these packs and readFile() returns them. WHY at load and not in the
// repo: the brief keeps this agent out of the app's files, and the theme engine never knows the difference.
const INJECT = (packs) => `(() => {
  const P = ${JSON.stringify(Object.fromEntries(packs.map((p) => [p.slug, JSON.stringify(p)])))};
  let real;
  const wrapTheme = (t) => new Proxy(t, { get(o, k) {
    if (k === 'list') return async () => [...(await o.list()), ...Object.keys(P)];
    if (k === 'readFile') return async (s) => P[s] ?? o.readFile(s);
    return o[k];
  } });
  let themeNs;
  Object.defineProperty(window, 'claude', { configurable: true, get() { return real; }, set(v) {
    real = new Proxy(v, { get(o, k) { if (k === 'theme') return themeNs ??= wrapTheme(o.theme); return o[k]; } });
  } });
})();`;

// ---------------------------------------------------------------------------------------------------
// What each picture shows. Every look is shot on a phone and on a desktop window; the sunset look answers the
// sunset request, and the others carry an everyday conversation that never asks about looks (so nothing on
// screen can contradict the picture).
// ---------------------------------------------------------------------------------------------------
const BASE = 'mode=workbench&child=1&scenario=site&latency=0&replySpeed=4&replyClock=now';
const LOOKS = [
  { theme: 'tb-sunset', ask: 'make it feel like sunset', reply: 'campaign-theme', done: 'Created 2 files', title: 'a new look' },
  { theme: 'tb-poster' }, { theme: 'tb-editorial' }, { theme: 'tb-paper' }, { theme: 'tb-pool' },
  { theme: 'halftone-dimension' },
];
// WHY a second, empty picture of every look: a fresh window and a busy one are two different screens on the
// wall, so the same look never has to appear twice in the same state
const EMPTY = { title: 'new chat' };
const SIZES = { phone: { w: 390, h: 844, dpr: 3, platform: '&platform=android' }, wide: { w: 1108, h: 692, dpr: 1.95, platform: '' } };

const dist = await ensureBuild(join(WORKTREE, 'youcoded'), (m) => console.error('[build]', m));
const ART = join(FILM, 'out', 'r2', 'take1b-theme-art');
mkdirSync(ART, { recursive: true });
for (const [k, v] of Object.entries(WALL)) writeFileSync(join(ART, `${k}.svg`), v);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
// a small server: the practice app's files, plus the wallpapers under /__tb/
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.startsWith('/__tb/') ? join(ART, path.slice(6)) : resolve(dist, '.' + (path === '/' ? '/index.html' : path));
    if (!path.startsWith('/__tb/') && (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory())) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch (e) { res.writeHead(404); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await openBrowser({ width: 1200, height: 900 });
const shots = [];

// --request: the grandma's-recipes request typed into the REAL phone app's message box, one picture per word,
// then the moment it is sent. WHY (reviewer 2026-11-20): the old cut typed it as floating words beside the
// phone, while the phone's own box sat empty; now the film swaps these pictures in step with the typing.
// Also writes where the message box sits (fractions of the picture), so the camera can push in on it.
export const REQUEST = "can you put my grandma's recipes on here? big text, no ads pls";
if (process.argv.includes('--request')) {
  try {
    const z = SIZES.phone;
    const tab = await browser.newTab();
    await tab.send('Emulation.setDeviceMetricsOverride', { width: z.w, height: z.h, deviceScaleFactor: z.dpr, mobile: false });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme','youcoded')}catch{}` });
    // WHY replySpeed 0.01: the scripted answer is held back about forty seconds, so "sent" is pictured before any reply
    await tab.navigate(`http://127.0.0.1:${port}/?mode=workbench&child=1&scenario=site&latency=0&replySpeed=0.01&replyClock=now&platform=android&seed=none&reply=campaign-theme&title=new%20chat`);
    for (let t0 = Date.now(); Date.now() - t0 < 20000 && !(await tab.evaluate(`!!document.querySelector("[placeholder^='Message']")`).catch(() => false)); await sleep(150));
    await sleep(1500);
    const box = `(() => { const e = document.querySelector("[placeholder^='Message']"); const f = e.closest('form') || e.parentElement; const r = f.getBoundingClientRect(), q = e.getBoundingClientRect();
      return { form: [r.left / innerWidth, r.top / innerHeight, r.width / innerWidth, r.height / innerHeight], input: [q.left / innerWidth, q.top / innerHeight, q.width / innerWidth, q.height / innerHeight] }; })()`;
    await tab.evaluate(`document.querySelector("[placeholder^='Message']").focus()`);
    const words = REQUEST.split(' ');
    const meta = { words: [], sent: null };
    for (let i = 0; i <= words.length; i++) {
      if (i > 0) await tab.send('Input.insertText', { text: (i > 1 ? ' ' : '') + words[i - 1] });
      await sleep(350);
      const name = `take1b-req-${String(i).padStart(2, '0')}.png`;
      writeFileSync(join(OUT, name), await tab.png());
      meta.words.push({ n: REQUEST.split(' ').slice(0, i).join(' ').length, src: `stills/${name}`, ...(await tab.evaluate(box)) });
    }
    await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(1200);
    writeFileSync(join(OUT, 'take1b-req-sent.png'), await tab.png());
    meta.sent = 'stills/take1b-req-sent.png';
    writeFileSync(join(FILM, 'src', 'round2', 'take1b-request.json'), JSON.stringify(meta, null, 1));
    console.log('wrote', meta.words.length, 'typing pictures + sent', tab.takeErrors().join(' | '));
  } finally { browser.close(); server.close(); }
  process.exit(0);
}

try {
  for (const look of LOOKS.flatMap((l) => [l, { theme: l.theme, empty: true }])) {
    for (const [kind, z] of Object.entries(SIZES)) {
      const tab = await browser.newTab();
      await tab.send('Emulation.setDeviceMetricsOverride', { width: z.w, height: z.h, deviceScaleFactor: z.dpr, mobile: false });
      await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT(PACKS) });
      await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(look.theme)})}catch{}` });
      const q = `${BASE}${z.platform}${look.ask ? `&seed=none&reply=${look.reply}&title=${encodeURIComponent(look.title)}` : look.empty ? `&seed=none&title=${encodeURIComponent(EMPTY.title)}` : ''}`;
      await tab.navigate(`http://127.0.0.1:${port}/?${q}`);
      const ok = async (expr, ms) => { for (let t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await tab.evaluate(expr).catch(() => false)) return true; return false; };
      if (!(await ok(`!!document.querySelector("[placeholder^='Message']")`, 20000))) throw new Error(`${look.theme} ${kind}: the app never showed its message box`);
      await sleep(1200);
      if (look.ask) {
        await tab.evaluate(`document.querySelector("[placeholder^='Message']").focus()`);
        await tab.send('Input.insertText', { text: look.ask });
        await sleep(300);
        await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        if (!(await ok(`document.body.innerText.includes(${JSON.stringify(look.done)})`, 30000))) throw new Error(`${look.theme} ${kind}: the reply never finished`);
      }
      // the active theme really is this look (a missing pack would silently fall back to the default)
      const applied = await tab.evaluate(`document.documentElement.dataset.theme || document.body.dataset.theme || ''`).catch(() => '');
      await sleep(1500);
      await tab.still(4000);
      const name = `take1b-th-${look.theme.replace(/^tb-/, '')}-${kind}${look.empty ? '-new' : ''}.png`;
      writeFileSync(join(OUT, name), await tab.png());
      console.log('wrote', name, applied ? `(data-theme=${applied})` : '', tab.takeErrors().join(' | '));
      shots.push(join(OUT, name));
      await tab.close();
    }
  }
} finally { browser.close(); server.close(); }

if (process.argv.includes('--sheet')) {
  // the candidates side by side, desktop windows on top, phones below, for the owner to judge
  const wide = shots.filter((s) => s.endsWith('-wide.png')).slice(0, 6), phone = shots.filter((s) => s.endsWith('-phone.png')).slice(0, 6);
  const args = ['-v', 'error', '-y'];
  for (const s of [...wide, ...phone]) args.push('-i', s);
  const n = wide.length;
  const f = [...wide.map((_, i) => `[${i}]scale=600:-2[w${i}]`), ...phone.map((_, i) => `[${n + i}]scale=-2:640,pad=600:640:(ow-iw)/2:0:color=0x120A1B[p${i}]`)];
  f.push(`${wide.map((_, i) => `[w${i}]`).join('')}hstack=${n}[top]`, `${phone.map((_, i) => `[p${i}]`).join('')}hstack=${n}[bot]`, '[top][bot]vstack=2');
  args.push('-filter_complex', f.join(';'), join(FILM, 'out', 'r2', 'take1b-themes-sheet.png'));
  execFileSync('ffmpeg', args);
  console.log('wrote out/r2/take1b-themes-sheet.png');
}
