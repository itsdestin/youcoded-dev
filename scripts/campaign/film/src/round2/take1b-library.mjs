// Take 1B library: a shelf of real pictures of the youcoded app (this worktree's practice build, never the
// owner's running app) for the film's wall of devices: "youcoded windows with different themes and pages in focus".
// WHY one script: every picture is the app's own renderer, in a real shipped theme, on a real sample page, cut to
// the exact screen shape of the film's phone / tablet / laptop / TV (take1b-world.tsx SIZE), so a still fills its
// screen edge to edge: no letterbox, no crop of the app's interface.
//   node src/round2/take1b-library.mjs                 (from the film folder; writes public/stills/r4/ + INDEX.md)
//   node src/round2/take1b-library.mjs --only slug,..  (re-shoot a few looks; INDEX.md is rebuilt from the files kept)
// Themes: the ones the app ships (built-in) and the community registry's, minus Cotton Candy Sky and Meadow Mist
// (the owner dislikes them). Pages are the app's practice pages in the public-demo ("site") scenario: fictional data.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureBuild, openBrowser, serve } from '../../../../shoot/engine.mjs';

const FILM = resolve(import.meta.dirname, '..', '..');
const WORKTREE = resolve(FILM, '..', '..', '..');
const OUT = join(FILM, 'public', 'stills', 'r4');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;

// ---------------------------------------------------------------------------------------------------
// Device shapes. Ratios are the film's screens (take1b-world.tsx): phone 136x284, tablet 360x250,
// laptop 400x250, tv 1000x560. WHY these CSS sizes: a phone is the app's narrow layout (390 wide, mobile
// platform); the others are real desktop windows wide enough that the app draws its full interface. The pixel
// size is css x dpr, and the css height is chosen so the picture's ratio matches the screen to under 0.3%.
// ---------------------------------------------------------------------------------------------------
const SHAPES = {
  phone:  { w: 390,  h: 814, dpr: 3, platform: 'android' },  // 1170x2442  = 0.479 (136/284 = 0.479)
  tablet: { w: 1000, h: 694, dpr: 2 },                         // 2000x1388  = 1.441 (360/250 = 1.44)
  laptop: { w: 1120, h: 700, dpr: 2 },                         // 2240x1400  = 1.600 (400/250 = 1.60)
  tv:     { w: 1280, h: 717, dpr: 2 },                         // 2560x1434  = 1.785 (1000/560 = 1.786)
};

// ---------------------------------------------------------------------------------------------------
// Looks: [slug, label, kind]. Built-in = ships inside the app; community = the theme registry.
// ---------------------------------------------------------------------------------------------------
const LOOKS = [
  ['youcoded', 'YouCoded (default)', 'built-in'],
  ['youcoded-night', 'YouCoded Night', 'built-in'],
  ['creme', 'Creme', 'built-in'],
  ['light', 'Light', 'built-in'],
  ['dark', 'Dark', 'built-in'],
  ['midnight', 'Midnight', 'built-in'],
  ['halftone-dimension', 'Halftone Dimension', 'community'],
  ['golden-sunbreak', 'Golden Sunbreak', 'community'],
  ['devils-garden', "Devil's Garden", 'community'],
  ['kuromi-dreamer', 'Kuromi Dreamer', 'community'],
  ['strawberry-kitty', 'Strawberry Kitty', 'community'],
  ['morning-rounds', 'Morning Rounds', 'community'],
];

// ---------------------------------------------------------------------------------------------------
// Foci: what is in the window (scenario: the paint studio only exists in the default practice data, which has no personal content for it).
//  screen = the app's own screen name (window.__youcodedScreens.open);
// params = practice-backend switches; fun = what a person would see.
// ---------------------------------------------------------------------------------------------------
const FOCI = {
  chat:    { screen: null, what: 'chat mid-conversation', seed: true },
  empty:   { screen: null, what: 'empty conversation, before anyone asks', empty: true },
  typing:  { screen: null, what: 'empty conversation, message box focused', empty: true, focusBox: true },
  home:    { screen: 'pages/focus/page-home#site', what: 'Page: Home (lights, media, climate)', pages: true },
  money:   { screen: 'pages/focus/page-money#site', what: 'Page: Finance', pages: true },
  paint:   { screen: 'pages/focus/page-paint', what: 'Page: Paint studio', pages: true, scenario: 'default' },
  lights:  { screen: 'pages/page/page-home#lights', what: 'Page: Home, lights', pages: true, params: { pagesHome: 'view-lights' } },
  climate: { screen: 'pages/page/page-home#climate', what: 'Page: Home, climate', pages: true, params: { pagesHome: 'view-climate' } },
  media:   { screen: 'pages/page/page-home#media', what: 'Page: Home, media', pages: true, params: { pagesHome: 'view-media' } },
};

// WHY this table, written out by hand: the wall must show no two neighbours alike, so every look appears in
// four different shapes, each with a different thing in focus, and the pairings rotate from look to look.
const PLAN = {
  youcoded:             [['phone', 'empty'], ['tablet', 'empty'], ['laptop', 'empty'], ['tv', 'empty'], ['phone', 'typing'], ['tablet', 'typing'], ['laptop', 'typing'], ['tv', 'typing'], ['phone', 'chat'], ['laptop', 'home'], ['tv', 'money'], ['tablet', 'paint']],
  'youcoded-night':     [['phone', 'chat'], ['tablet', 'home'], ['laptop', 'chat'], ['tv', 'lights']],
  creme:                [['phone', 'money'], ['tablet', 'chat'], ['laptop', 'paint'], ['tv', 'chat']],
  light:                [['phone', 'lights'], ['tablet', 'money'], ['laptop', 'chat'], ['tv', 'home']],
  dark:                 [['phone', 'home'], ['tablet', 'chat'], ['laptop', 'money'], ['tv', 'paint']],
  midnight:             [['phone', 'chat'], ['tablet', 'climate'], ['laptop', 'home'], ['tv', 'chat']],
  'halftone-dimension': [['phone', 'home'], ['tablet', 'chat'], ['laptop', 'money'], ['tv', 'media']],
  'golden-sunbreak':    [['phone', 'chat'], ['tablet', 'money'], ['laptop', 'lights'], ['tv', 'chat']],
  'devils-garden':      [['phone', 'climate'], ['tablet', 'chat'], ['laptop', 'chat'], ['tv', 'home']],
  'kuromi-dreamer':     [['phone', 'chat'], ['tablet', 'paint'], ['laptop', 'climate'], ['tv', 'chat']],
  'strawberry-kitty':   [['phone', 'money'], ['tablet', 'chat'], ['laptop', 'media'], ['tv', 'paint']],
  'morning-rounds':     [['phone', 'chat'], ['tablet', 'home'], ['laptop', 'chat'], ['tv', 'money']],
};

const dist = await ensureBuild(join(WORKTREE, 'youcoded'), (m) => console.error('[build]', m));
const srv = await serve(dist);
const base = `http://127.0.0.1:${srv.port}/`;
const browser = await openBrowser({ width: 1200, height: 900 });
const rows = [];
const problems = [];

async function waitFor(tab, expr, ms) { for (let t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await tab.evaluate(expr).catch(() => false)) return true; return false; }

async function shoot(look, shapeKey, focusKey) {
  const [slug, label, kind] = look; const z = SHAPES[shapeKey]; const f = FOCI[focusKey];
  const file = `${slug}-${shapeKey}-${focusKey}.png`;
  const tab = await browser.newTab();
  try {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: z.w, height: z.h, deviceScaleFactor: z.dpr, mobile: false });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(slug)})}catch{}` });
    const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: '0', scenario: f.scenario ?? 'site', theme: slug, ...(z.platform ? { platform: z.platform } : {}), ...(f.params ?? {}) });
    if (f.empty) { q.set('seed', 'none'); q.set('title', 'new chat'); }
    else if (f.seed) { q.set('replyClock', 'now'); }
    await tab.navigate(`${base}?${q}`);
    if (!(await waitFor(tab, `window.__youcodedScreens && document.body.innerText.trim().length > 20`, 25000))) throw new Error('the app never started');
    if (f.screen) {
      for (let i = 0; i < 3; i++) {
        const o = await tab.evaluate(`window.__youcodedScreens.open(${JSON.stringify(f.screen)})`, 20000);
        if (!o?.ok) throw new Error(o?.reason ?? 'open failed');
        const mark = f.screen.replace(/#.*/, '');
        if (await waitFor(tab, `!!document.querySelector('[data-screen="${f.screen}"]') || !!document.querySelector('[data-screen="${mark}"]')`, 6000)) break;
      }
      // WHY wait for the page's own frame to have drawn something: the app's frame appears before the Page inside it
      await waitFor(tab, `(() => { const fr = document.querySelector('iframe'); try { return !!fr && fr.contentDocument && fr.contentDocument.body && fr.contentDocument.body.innerText.trim().length > 20; } catch { return true; } })()`, 15000);
    } else {
      if (!(await waitFor(tab, `!!document.querySelector("[placeholder^='Message']")`, 25000))) throw new Error('no message box');
    }
    if (f.focusBox) await tab.evaluate(`document.querySelector("[placeholder^='Message']").focus()`);
    // WHY wait on the theme font: a late web font would change the picture's typeface between shots
    await waitFor(tab, `(() => { const l = document.getElementById('theme-google-font'); if (l && !l.sheet) return false; return document.fonts.status === 'loaded'; })()`, 10000);
    await sleep(2200);
    const info = await tab.evaluate(`(() => { const e = document.querySelector("[placeholder^='Message']"); const r = e ? (e.closest('form') || e.parentElement).getBoundingClientRect() : null;
      return { theme: document.documentElement.dataset.theme || '', box: r ? [r.left, r.top, r.width, r.height].map((n) => Math.round(n * ${z.dpr})) : null, w: innerWidth, h: innerHeight }; })()`);
    writeFileSync(join(OUT, file), await tab.png());
    rows.push({ file, shape: shapeKey, px: `${z.w * z.dpr}x${z.h * z.dpr}`, theme: label, kind, focus: f.what, box: info.box && (focusKey === 'empty' || focusKey === 'typing' || focusKey === 'chat') ? info.box.join(',') : '', applied: info.theme });
    console.log('ok', file, info.theme, tab.takeErrors().join(' | '));
  } catch (e) { problems.push(`${file}: ${e.message}`); console.log('FAIL', file, e.message); }
  finally { await tab.close?.(); }
}

try {
  for (const look of LOOKS) {
    if (only && !only.includes(look[0])) continue;
    for (const [shapeKey, focusKey] of PLAN[look[0]]) await shoot(look, shapeKey, focusKey);
  }
} finally { browser.close(); }

// INDEX.md is rebuilt from the rows of this run merged with the previous rows file (so --only keeps the rest)
const rowsFile = join(OUT, 'rows.json');
let all = [];
try { all = JSON.parse(readFileSync(rowsFile, 'utf8')); } catch { /* first run */ }
const keep = new Map(all.map((r) => [r.file, r]));
for (const r of rows) keep.set(r.file, r);
all = [...keep.values()].filter((r) => existsSync(join(OUT, r.file)));
writeFileSync(rowsFile, JSON.stringify(all, null, 1));
const md = ['# r4 screen stills', '', 'Real app renderer (this worktree, practice build, public-demo sample data), 2x pixel density or better, cut to the film device shapes (take1b-world.tsx).',
  'Box = message box pixel rectangle as x,y,w,h within the picture (blank where the box is not on screen).', '',
  '| file | device shape | pixel size | theme | in focus | message box x,y,w,h |', '|---|---|---|---|---|---|',
  ...all.map((r) => `| ${r.file} | ${r.shape} | ${r.px} | ${r.theme} (${r.kind}) | ${r.focus} | ${r.box} |`)].join('\n');
writeFileSync(join(OUT, 'INDEX.md'), md + '\n');
console.log(`${all.length} stills; problems: ${problems.length}`); problems.forEach((p) => console.log(' -', p));
process.exit(0);
