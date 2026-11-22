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
// WHY --files (round 6): add a few new stills without re-shooting (and so changing) the ones the wall already uses
const filesOnly = argv.includes('--files') ? argv[argv.indexOf('--files') + 1].split(',') : null;
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
  // WHY "wake" (round 7 reviewer BLOCKER: the hero close-up at "something wonderful" showed "Qwen3 Coder 30b A3b Instruct", jargon in a hero shot):
  // the same untouched empty window, with a short, friendly local model chosen in the app's own picker (brand guide 8: choose what is IN the app, never hide it)
  wake:    { screen: null, what: 'empty conversation, before anyone asks (friendly model in the picker)', empty: true, model: 'qwen36-27b' },
  typing:  { screen: null, what: 'empty conversation, message box focused', empty: true, focusBox: true },
  // WHY "clean" (round 5): the film types the request into the real box, so the placeholder words and the empty-chat
  // greeting are hidden by CSS in the real renderer: the app after a first message would not show them either
  clean:      { screen: null, what: 'empty conversation, greeting and placeholder hidden (film types into it)', empty: true, clean: true },
  cleanfocus: { screen: null, what: 'same, message box focused (its own caret)', empty: true, focusBox: true, clean: true },
  // WHY "typed" (round 6): the film types a request into a real laptop / tablet window. This picture has the whole sentence typed into
  // the app's own message box (real font, size, colour); the film reveals it letter by letter, and the measured x of every letter's end is kept in rows.json
  typed:      { screen: null, what: 'empty conversation, request typed in the message box (film reveals it)', empty: true, clean: true, typed: true },
  // WHY "working" (round 8 reviewers BLOCKER: the page came back 0.6 s after send with no sign of the app making it): the same window
  // a moment after the request is SENT, really sent through the app's own box, so its own sent bubble and its own working line are
  // on screen. The reply is slowed right down (replySpeed) so the picture is taken while the app is still working on it.
  working:    { screen: null, what: 'request just sent: its own sent bubble and the app working on it', empty: true, clean: true, working: true },
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
  creme:                [['phone', 'wake'], ['phone', 'money'], ['tablet', 'chat'], ['laptop', 'paint'], ['tv', 'chat']],
  light:                [['phone', 'wake'], ['phone', 'lights'], ['tablet', 'money'], ['laptop', 'chat'], ['tv', 'home']],
  dark:                 [['phone', 'home'], ['tablet', 'chat'], ['laptop', 'money'], ['tv', 'paint']],
  midnight:             [['phone', 'chat'], ['tablet', 'climate'], ['laptop', 'home'], ['tv', 'chat']],
  'halftone-dimension': [['phone', 'wake'], ['phone', 'home'], ['tablet', 'chat'], ['laptop', 'money'], ['tv', 'media'], ['tablet', 'clean'], ['tablet', 'cleanfocus'], ['tablet', 'typed'], ['tablet', 'paint']],
  'golden-sunbreak':    [['phone', 'wake'], ['phone', 'empty'], ['phone', 'typing'], ['phone', 'clean'], ['phone', 'cleanfocus'], ['phone', 'chat'], ['phone', 'home'], ['tablet', 'money'], ['laptop', 'lights'], ['tv', 'chat']],
  'devils-garden':      [['phone', 'climate'], ['tablet', 'chat'], ['laptop', 'chat'], ['tv', 'home'], ['laptop', 'clean'], ['laptop', 'cleanfocus'], ['laptop', 'typed'], ['laptop', 'lights']],
  'kuromi-dreamer':     [['phone', 'chat'], ['tablet', 'paint'], ['laptop', 'climate'], ['tv', 'chat']],
  'strawberry-kitty':   [['phone', 'money'], ['tablet', 'chat'], ['laptop', 'media'], ['tv', 'paint']],
  'morning-rounds':     [['phone', 'wake'], ['phone', 'chat'], ['tablet', 'home'], ['laptop', 'chat'], ['tv', 'money']],
};

// the sentences typed into the real boxes (what a person asks for; the page that arrives matches)
const TYPED = { laptop: 'a page to run my lights', tablet: 'a paint studio' };
// what each "working" picture was asked (its own sent bubble shows it). WHY per look: every person asks for something of their own
const WORKING = {
  'golden-sunbreak-phone': 'a page for my flat?',
  'devils-garden-laptop': 'a page to run my lights',
  'halftone-dimension-tablet': 'a paint studio',
  'light-phone': 'something for my lamps',
  'creme-tablet': 'a paint page for the kids?',
};
// WHY round 8 additions (reviewers: the wall after the turn was "a few dark dashboards" repeated; the shared page wiped the
// neighbour's own theme; asks came back with no sign of work): more pages in more light looks, a Home page in the two share
// targets' own looks, and a "working" picture for every device that is seen asking. Shot with --files so nothing old changes.
const PLAN8 = {
  'golden-sunbreak':    [['phone', 'working'], ['laptop', 'paint'], ['tablet', 'climate']],
  'devils-garden':      [['laptop', 'working'], ['tablet', 'paint'], ['phone', 'lights']],
  'halftone-dimension': [['tablet', 'working'], ['tablet', 'home'], ['phone', 'paint']],
  light:                [['phone', 'working'], ['laptop', 'paint'], ['tablet', 'climate'], ['tv', 'media']],
  creme:                [['tablet', 'working'], ['tablet', 'paint'], ['phone', 'lights'], ['laptop', 'home']],
  'morning-rounds':     [['laptop', 'home'], ['phone', 'home'], ['laptop', 'paint'], ['tablet', 'media']],
};
for (const [k, v] of Object.entries(PLAN8)) PLAN[k] = [...PLAN[k], ...v];

// ---------------------------------------------------------------------------------------------------
// Round 6 (the agreed picture plan): the hero phone's request, typed for real one character at a time; the
// app working on it; and the thing it made, a pickup board, inside the real window. Then the same board in two
// neighbours' own windows, each filled with that neighbour's own life.
// ---------------------------------------------------------------------------------------------------
// WHY a plain, unsure, lower-case sentence with no "page" in it (plan): it must sound like a real person and be
// understood by someone who has never used the app. The short form is the fallback if the long one would wrap.
// WHY these three (measured 2026-11-21): the Golden Sunbreak phone's real box has room for about 194 css px of its
// 16 px mono type, about 20 letters, so the longer sentences the plan hoped for would wrap to two lines.
const ASK = ['something for mia\'s pickups?', 'help with mia\'s pickups?', 'plan mia\'s pickups?'];
let ASK_USED = ASK[0];   // set by the typechars shot after measuring the real box; the "asked" shot sends the same words
FOCI.typechars = { screen: null, what: 'request typed one character at a time (one strip per character)', empty: true, clean: true, focusBox: true, model: 'qwen36-27b', typechars: true };
FOCI.asked = { screen: null, what: 'request just sent (friendly model): its own sent bubble and the app working on it', empty: true, clean: true, working: true, model: 'qwen36-27b' };
FOCI.mine = { screen: 'pages/focus/page-home#site', what: 'Page: the pickup board the person asked for (staged inside the real window)', pages: true, mine: true };
// What each board holds. WHY three different lives (plan): what one person made, others use with their OWN things;
// the hero's private three things (their photos, Sam, Mia at 3:15) never appear on anyone else's screen.
const BOARDS = {
  'golden-sunbreak-phone': { time: '3:15', who: 'Mia', where: 'school gate', from: 'Sam', msg: 'running late, save me a seat', av: '#E7B7A3', photos: [0, 1, 2] },
  'kuromi-dreamer-laptop': { time: '4:00', who: 'Leo', where: 'football, back field', from: 'Priya', msg: 'can you grab his PE bag?', av: '#9FC3E6', photos: [3, 4, 5] },
  'morning-rounds-phone': { time: '5:30', who: 'swim', where: 'leisure centre', from: 'nan', msg: "i'll bring the towels", av: '#C9B3E8', photos: [6, 7, 8] },
};
// The person's photos, drawn as soft little landscapes: the same pictures the film's phone shows before the turn
// (take1b-screens.tsx PhotoThumb), so the board is visibly built from THEIR things. 3..8 are other people's.
const PHOTO = (v) => {
  const skies = [['#F6C9A8', '#E79B9B'], ['#BFD8EE', '#E6D7F2'], ['#F3DFA2', '#EFB49A'], ['#CFE3C8', '#F1E6C9'], ['#F2C6D8', '#C9B8EE'], ['#B9DCE8', '#F5E3C4'], ['#F7D9B0', '#E9A7A0'], ['#D6E4F5', '#B9D1C9'], ['#EAD3F2', '#F6C9A8']][v % 9];
  const hills = ['#7E9C7A', '#6F8FB0', '#B4826E', '#5F8F6A', '#8E6FA8', '#4F8FA0', '#C08A5A', '#6E8F8A', '#9A7AA8'][v % 9];
  const sun = v % 2 ? 72 : 30;
  return `<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%"><defs><linearGradient id="k${v}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skies[0]}"/><stop offset="1" stop-color="${skies[1]}"/></linearGradient></defs><rect width="100" height="70" fill="url(#k${v})"/><circle cx="${sun}" cy="26" r="9" fill="#FFF5E4" opacity="0.9"/><path d="${v % 2 ? 'M0 52 Q25 38 50 50 T100 44 V70 H0Z' : 'M0 48 Q30 30 60 46 T100 40 V70 H0Z'}" fill="${hills}"/><path d="M0 60 Q40 50 100 58 V70 H0Z" fill="${hills}" opacity="0.7"/></svg>`;
};
// The board itself: written with the page kit's own classes and the theme's own tokens, so each window draws it in
// its own look. WHY so few parts, the time huge (plan): a stranger reads "3:15 · Mia" from across the room.
// WHY the photos as one big picture over two small (round 6 look check): three small squares left the lower half of
// the phone empty, and tall cells cropped the pictures oddly; landscape cells keep each picture whole.
const photoGrid = (b, h) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start;${h}">${b.photos.map((v, i) => `<div style="${i === 0 ? 'grid-column:1 / span 2;' : ''}aspect-ratio:10 / 7;border-radius:var(--radius-md,10px);overflow:hidden">${PHOTO(v)}</div>`).join('')}</div>`;
const msgCard = (b) => `<div class="yc-card" style="display:flex;align-items:center;gap:12px;padding:14px 16px"><span style="width:40px;height:40px;border-radius:40px;background:${b.av};flex:none"></span><span style="min-width:0"><span style="display:block;font-weight:700;font-size:16px">${b.from}</span><span class="yc-muted" style="display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.msg}</span></span></div>`;
const head = (b, wide) => `<div class="yc-eyebrow" style="font-size:${wide ? 16 : 14}px">pickups · today</div>
  <div style="display:flex;align-items:baseline;gap:${wide ? 18 : 12}px;line-height:0.92;margin-top:-2px"><span style="font-size:${wide ? 128 : 96}px;font-weight:800;letter-spacing:-0.04em;font-variant-numeric:tabular-nums">${b.time}</span><span style="font-size:${wide ? 68 : 46}px;font-weight:700;letter-spacing:-0.03em;color:var(--accent)">${b.who}</span></div>
  <div class="yc-muted" style="font-size:${wide ? 18 : 15}px;margin-top:-4px">${b.where}</div>`;
const boardHtml = (b, wide) => `<div id="yc-film-board" style="position:fixed;inset:0;z-index:2147483647;overflow:hidden;background:var(--canvas);color:var(--fg);font-family:var(--font-sans,system-ui);padding:${wide ? '30px 34px' : '18px 16px 20px'};display:flex;flex-direction:${wide ? 'row' : 'column'};gap:${wide ? 30 : 14}px">
  ${wide
    ? `<div style="flex:1;display:flex;flex-direction:column;gap:16px;min-width:0">${head(b, true)}<div style="flex:1"></div>${msgCard(b)}</div>${photoGrid(b, 'flex:1;min-width:0')}`
    : `${head(b, false)}${msgCard(b)}${photoGrid(b, 'flex:1;min-height:0')}`}
</div>`;
const PLAN6 = {
  'golden-sunbreak': [['phone', 'typechars'], ['phone', 'asked'], ['phone', 'mine']],
  'kuromi-dreamer': [['laptop', 'mine']],
  'morning-rounds': [['phone', 'mine']],
};
for (const [k, v] of Object.entries(PLAN6)) PLAN[k] = [...PLAN[k], ...v];
/** Runs `expression` inside the Page's sandboxed iframe (its own Chrome target; same route as shoot.mjs waitForFrame). */
async function inFrame(tab, expression, ms = 12000) {
  let session = null;
  const off = tab.on((m) => { if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'iframe') session = m.params.sessionId; });
  try {
    await tab.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) {
      if (!session) continue;
      const r = await tab.browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session).catch(() => null);
      if (r && !r.exceptionDetails) return r.result?.value;
    }
    throw new Error('could not reach the page frame');
  } finally { off(); }
}
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
  if (filesOnly && !filesOnly.includes(file)) return;
  const tab = await browser.newTab();
  try {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: z.w, height: z.h, deviceScaleFactor: z.dpr, mobile: false });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(slug)})}catch{}` });
    const q = new URLSearchParams({ mode: 'workbench', child: '1', latency: '0', scenario: f.scenario ?? 'site', theme: slug, ...(z.platform ? { platform: z.platform } : {}), ...(f.params ?? {}) });
    if (f.empty) { q.set('seed', 'none'); q.set('title', 'new chat'); }
    if (f.working) q.set('replySpeed', '0.02');   // WHY: the reply crawls, so the app is caught mid-work, never mid-answer
    if (f.model) q.set('model', f.model);
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
    if (f.clean) await tab.evaluate(`(() => { const st = document.createElement('style'); st.textContent = "[placeholder^='Message']::placeholder{color:transparent!important;opacity:0!important}"; document.head.appendChild(st);
      for (const e of document.querySelectorAll('div,p,span')) if (e.children.length === 0 && /^Start a conversation/.test((e.textContent || '').trim())) e.style.visibility = 'hidden';
      const m = document.querySelector("[placeholder^='Message']"); const c = getComputedStyle(m); console.log('FONT', c.fontFamily, c.fontSize, c.color, c.fontWeight, c.letterSpacing); })()`);
    let typed = null;
    if (f.typed) {
      const text = TYPED[shapeKey];
      typed = await tab.evaluate(`(async () => { const text = ${JSON.stringify(text)}; const m = document.querySelector("[placeholder^='Message']"); m.focus();
        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(m), 'value').set; set.call(m, text); m.dispatchEvent(new Event('input', { bubbles: true }));
        m.style.caretColor = 'transparent'; await new Promise((r) => setTimeout(r, 400));
        const c = getComputedStyle(m); const ctx = document.createElement('canvas').getContext('2d'); ctx.font = c.fontStyle + ' ' + c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
        const r = m.getBoundingClientRect(); const pl = parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth); const ls = parseFloat(c.letterSpacing) || 0;
        const prefix = []; for (let i = 0; i <= text.length; i++) prefix.push(r.left + pl + ctx.measureText(text.slice(0, i)).width + ls * i);
        return { text, prefix, ink: c.color, rect: [r.left, r.top, r.width, r.height], fs: parseFloat(c.fontSize), font: c.fontFamily, tag: m.tagName }; })()`, 10000);
    }
    if (f.working) {
      // type the request into the real box and press Enter, exactly as a person would; then wait just long enough for the app's
      // own bubble and working line to draw (the reply itself is held back by replySpeed, set on the address below)
      const text = f.model ? ASK_USED : WORKING[`${slug}-${shapeKey}`] ?? TYPED[shapeKey] ?? 'a page for my flat?';
      await tab.evaluate(`(() => { const m = document.querySelector("[placeholder^='Message']"); m.focus();
        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(m), 'value').set; set.call(m, ${JSON.stringify(text)}); m.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(300);
      await tab.evaluate(`(() => { const m = document.querySelector("[placeholder^='Message']"); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); })()`);
    }
    if (f.focusBox && !f.typed) await tab.evaluate(`document.querySelector("[placeholder^='Message']").focus()`);
    // WHY wait on the theme font: a late web font would change the picture's typeface between shots
    await waitFor(tab, `(() => { const l = document.getElementById('theme-google-font'); if (l && !l.sheet) return false; return document.fonts.status === 'loaded'; })()`, 10000);
    if (f.mine) {
      // WHY staged inside the frame (brand guide 8: what a person makes may be staged; the app around it never is): the
      // board covers the practice page inside the Page's own frame, drawn with the page kit and the theme's tokens
      const b = BOARDS[`${slug}-${shapeKey}`];
      await sleep(1500);
      await inFrame(tab, `(() => { document.getElementById('yc-film-board')?.remove(); document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(boardHtml(b, shapeKey !== 'phone'))}); return true; })()`);
      // the page's name, where the window shows it (title bar, the pages list): the person named their page
      await tab.evaluate(`(() => { for (const e of document.querySelectorAll('span,div,button,a,p')) { if (e.children.length === 0 && (e.textContent || '').trim() === 'Home' && !e.closest('iframe')) e.textContent = 'Pickups'; } })()`);
    }
    if (f.typechars) {
      // Real typing (plan): one character at a time into the app's own box through the browser's own text input, and a
      // picture of the box after every character. WHY strips: only the box changes, so each picture is the band from just
      // above the box to the bottom of the window; the film lays it over the first full picture at exactly this place.
      await sleep(1500);
      const pick = await tab.evaluate(`(() => { const m = document.querySelector("[placeholder^='Message']"); const c = getComputedStyle(m); const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = c.fontStyle + ' ' + c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily; const avail = m.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - 4;
        return { avail, widths: ${JSON.stringify(ASK)}.map((s) => ctx.measureText(s).width + (parseFloat(c.letterSpacing) || 0) * s.length), fs: c.fontSize }; })()`);
      ASK_USED = ASK.find((s, i) => pick.widths[i] <= pick.avail) ?? ASK[ASK.length - 1];
      console.log('ASK fit', JSON.stringify(pick), '->', ASK_USED);
      const form = await tab.evaluate(`(() => { const e = document.querySelector("[placeholder^='Message']"); const r = (e.closest('form') || e.parentElement).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      const y0 = Math.max(0, Math.floor(form[1] - 12));
      const clip = { x: 0, y: y0, width: z.w, height: z.h - y0, scale: 1 };
      const base = `${slug}-${shapeKey}-type`;
      writeFileSync(join(OUT, `${base}-base.png`), await tab.png());
      const lines = [];
      for (let i = 0; i <= ASK_USED.length; i++) {
        if (i > 0) await tab.send('Input.insertText', { text: ASK_USED[i - 1] });
        // WHY 140 ms: long enough for the app to draw the letter, short enough that the caret's blink (which restarts on
        // every keystroke) is still in its "on" half, so every strip shows the real caret, solid, as typing looks
        await sleep(140);
        writeFileSync(join(OUT, `${base}-${String(i).padStart(2, '0')}.png`), await tab.png({ clip }));
        const h = await tab.evaluate(`document.querySelector("[placeholder^='Message']").scrollHeight`);
        lines.push(h);
      }
      if (new Set(lines).size > 1) throw new Error(`the request wrapped onto a second line (${[...new Set(lines)]}); shorten ASK`);
      writeFileSync(join(OUT, `${base}.json`), JSON.stringify({ text: ASK_USED, n: ASK_USED.length, y0: y0 * z.dpr, full: [z.w * z.dpr, z.h * z.dpr], box: form.map((v) => Math.round(v * z.dpr)), scrollHeights: [...new Set(lines)] }, null, 1));
      rows.push({ file: `${base}-base.png`, shape: shapeKey, px: `${z.w * z.dpr}x${z.h * z.dpr}`, theme: label, kind, focus: f.what, box: form.map((v) => Math.round(v * z.dpr)).join(','), applied: '' });
      console.log('ok typed', base, ASK_USED.length, 'strips, heights', [...new Set(lines)]);
      return;
    }
    await sleep(2200);
    const info = await tab.evaluate(`(() => { const e = document.querySelector("[placeholder^='Message']"); const r = e ? (e.closest('form') || e.parentElement).getBoundingClientRect() : null;
      return { theme: document.documentElement.dataset.theme || '', box: r ? [r.left, r.top, r.width, r.height].map((n) => Math.round(n * ${z.dpr})) : null, w: innerWidth, h: innerHeight, font: e ? (() => { const c = getComputedStyle(e); return [c.fontFamily, c.fontSize, c.color, c.fontWeight, c.letterSpacing, c.paddingLeft].join(' | '); })() : '' }; })()`);
    writeFileSync(join(OUT, file), await tab.png());
    rows.push({ file, shape: shapeKey, px: `${z.w * z.dpr}x${z.h * z.dpr}`, theme: label, kind, focus: f.what, typed: typed ? { ...typed, dpr: z.dpr } : undefined, box: info.box && (['empty','wake','typing','chat','clean','cleanfocus','typed'].includes(focusKey)) ? info.box.join(',') : '', applied: info.theme });
    console.log('ok', file, info.theme, info.font, JSON.stringify(info.box), tab.takeErrors().join(' | '));
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
