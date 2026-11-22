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
// WHY no "plan" (round 6 review: the first word came out GOLD): the app's own box lights up its flow keywords
// (FlowingKeywords.tsx: ultrathink, ultraplan, brainstorm, plan), which to a stranger looks like a glitch. Any
// sentence holding one of them is skipped. The longest one that fits the real box on one line wins.
const FLOW_WORDS = /\b(ultrathink|ultraplan|brainstorm|plan)\b/i;
const ASK = ['can you make something for mia\'s pickups?', 'something for mia\'s pickups?', 'help with mia\'s pickups?', 'sort mia\'s pickups?', 'help with pickups?'].filter((s) => !FLOW_WORDS.test(s));
let ASK_USED = ASK[0];   // set by the typechars shot after measuring the real box; the "asked" shot sends the same words
FOCI.typechars = { screen: null, what: 'request typed one character at a time (one strip per character)', empty: true, clean: true, focusBox: true, model: 'qwen36-27b', typechars: true };
FOCI.asked = { screen: null, what: 'request just sent (friendly model): its own sent bubble and the app working on it', empty: true, clean: true, working: true, model: 'qwen36-27b' };
FOCI.mine = { screen: 'pages/focus/page-home#site', what: 'Page: the pickup board the person asked for (staged inside the real window)', pages: true, mine: true };
FOCI.mineempty = { ...FOCI.mine, what: 'the same window and wallpaper, the board not yet built (the film builds it over this)', emptyBoard: true };
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
// WHY richer photos (round 6 review: the big flat sun-and-hill shapes read as placeholders, not someone's pictures):
// the same three skies and hills as the person's photos before the turn (so the callback holds), with a far ridge, a
// tree and two small figures, a grown-up and a child, so each reads as a photo of a day out.
const RICH = (v) => {
  const skies = [['#F6C9A8', '#E79B9B'], ['#BFD8EE', '#E6D7F2'], ['#F3DFA2', '#EFB49A'], ['#CFE3C8', '#F1E6C9'], ['#F2C6D8', '#C9B8EE'], ['#B9DCE8', '#F5E3C4'], ['#F7D9B0', '#E9A7A0'], ['#D6E4F5', '#B9D1C9'], ['#EAD3F2', '#F6C9A8']][v % 9];
  const hills = ['#7E9C7A', '#6F8FB0', '#B4826E', '#5F8F6A', '#8E6FA8', '#4F8FA0', '#C08A5A', '#6E8F8A', '#9A7AA8'][v % 9];
  const sun = v % 2 ? 74 : 26, tx = v % 2 ? 22 : 78, fx = v % 3 === 0 ? 56 : v % 3 === 1 ? 40 : 62;
  return `<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%"><defs><linearGradient id="r${v}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skies[0]}"/><stop offset="1" stop-color="${skies[1]}"/></linearGradient></defs>
    <rect width="100" height="70" fill="url(#r${v})"/><circle cx="${sun}" cy="22" r="8" fill="#FFF5E4" opacity="0.92"/>
    <path d="M0 44 Q20 34 42 40 T100 36 V70 H0Z" fill="${hills}" opacity="0.45"/>
    <path d="${v % 2 ? 'M0 52 Q25 40 50 50 T100 46 V70 H0Z' : 'M0 50 Q30 34 60 48 T100 42 V70 H0Z'}" fill="${hills}"/>
    <rect x="${tx - 0.9}" y="38" width="1.8" height="12" fill="#5A4636"/><circle cx="${tx}" cy="36" r="6" fill="${hills}" opacity="0.95"/><circle cx="${tx - 3}" cy="38" r="4" fill="${hills}"/><circle cx="${tx}" cy="35" r="5" fill="#000" opacity="0.12"/>
    <g fill="#2E2433" opacity="0.85"><circle cx="${fx}" cy="45.5" r="1.7"/><rect x="${fx - 1.4}" y="47.2" width="2.8" height="6.5" rx="1.2"/><circle cx="${fx + 5}" cy="49" r="1.3"/><rect x="${fx + 3.9}" y="50.3" width="2.2" height="4.4" rx="1"/></g>
    <path d="M0 62 Q40 54 100 60 V70 H0Z" fill="${hills}" opacity="0.75"/></svg>`;
};
// a printed photo: a white border and a soft shadow, so they read as pictures the person keeps
const print = (v, extra = '') => `<div style="background:#FBF8F2;padding:5px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.28);${extra}"><div style="aspect-ratio:10 / 7;border-radius:8px;overflow:hidden">${RICH(v)}</div></div>`;
const photoGrid = (b, h) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start;${h}">${b.photos.map((v, i) => print(v, i === 0 ? 'grid-column:1 / span 2;' : '')).join('')}</div>`;
// WHY a frosted card (the app's own chat bubbles over a wallpaper look like this): the wallpaper glows around it
const GLASS = 'background:color-mix(in srgb, var(--panel) 80%, transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid color-mix(in srgb, var(--fg) 12%, transparent);border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,0.22)';
// WHY bigger (round 6 review: "running late, save me a seat" was 8 px on a full frame): Sam's words must read at the
// phone's medium framing, so they get two lines at 21 px instead of one cut-off line at 15
const msgCard = (b, wide) => `<div style="${GLASS};display:flex;align-items:center;gap:14px;padding:${wide ? '16px 20px' : '14px 16px'};color:var(--fg)"><span style="width:${wide ? 56 : 50}px;height:${wide ? 56 : 50}px;border-radius:60px;background:${b.av};flex:none"></span><span style="min-width:0"><span style="display:block;font-weight:800;font-size:${wide ? 24 : 21}px;line-height:1.15">${b.from}</span><span style="display:block;font-size:${wide ? 23 : 21}px;line-height:1.2;opacity:0.85">${b.msg}</span></span></div>`;
// WHY the time on the theme's own accent (round 6 review: the board read as a dark hole): the biggest thing on the
// board is lit, warm and in that person's colour, so the reveal opens onto light, not black
const head = (b, wide) => `<div style="background:var(--accent);color:var(--on-accent,#1A1208);border-radius:20px;padding:${wide ? '20px 26px 18px' : '14px 18px 14px'};box-shadow:0 10px 28px rgba(0,0,0,0.25)">
  <div style="font-size:${wide ? 18 : 16}px;font-weight:700;letter-spacing:0.02em;opacity:0.78">pickups · today</div>
  <div style="display:flex;align-items:baseline;gap:${wide ? 18 : 12}px;line-height:0.92;margin-top:2px"><span style="font-size:${wide ? 124 : 92}px;font-weight:800;letter-spacing:-0.04em;font-variant-numeric:tabular-nums">${b.time}</span><span style="font-size:${wide ? 60 : 44}px;font-weight:800;letter-spacing:-0.03em">${b.who}</span></div>
  <div style="font-size:${wide ? 22 : 19}px;font-weight:600;margin-top:4px;opacity:0.85">${b.where}</div></div>`;
// wp: the theme's own wallpaper as a data address (null when the theme has none: then its canvas colour)
// empty: the same board with its parts hidden (the film settles each part in over it, so it builds on its own wallpaper)
const boardHtml = (b, wide, wp, empty = false) => `<div id="yc-film-board" style="position:fixed;inset:0;z-index:2147483647;overflow:hidden;background:${wp ? `var(--canvas) center / cover no-repeat url('${wp}')` : 'var(--canvas)'};color:var(--fg);font-family:var(--font-sans,system-ui);padding:${wide ? '30px 34px' : '16px 14px 18px'};display:flex;flex-direction:${wide ? 'row' : 'column'};gap:${wide ? 28 : 14}px">${empty ? '<style>#yc-film-board > *{visibility:hidden}</style>' : ''}
  ${wide
    ? `<div style="flex:1;display:flex;flex-direction:column;gap:18px;min-width:0">${head(b, true)}<div style="flex:1"></div>${msgCard(b, true)}</div>${photoGrid(b, 'flex:1;min-width:0;align-content:center')}`
    : `${head(b, false)}${msgCard(b, false)}${photoGrid(b, 'flex:1;min-height:0')}`}
</div>`;
// The TV's own thing at the very end (round 6 review: it used to open on a copy of the laptop's painting). A family's
// film night: three films they voted for, drawn as their own little posters, with invented titles and no brands.
const FILMS = [
  { t: 'the lighthouse cat', v: 4, sky: ['#2B3A67', '#E8A87C'], fg: '#FFE9B8' },
  { t: 'moon bakery', v: 3, sky: ['#F6C1CF', '#B5A8F0'], fg: '#FFFFFF' },
  { t: 'robots go camping', v: 2, sky: ['#9FD3C7', '#F4E3B2'], fg: '#2E4A3F' },
];
const poster = (f, i) => `<div style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:0"><div style="aspect-ratio:2 / 3;border-radius:14px;overflow:hidden;box-shadow:0 10px 26px rgba(0,0,0,0.3);position:relative;background:linear-gradient(180deg,${f.sky[0]},${f.sky[1]})">
  <svg viewBox="0 0 60 90" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">${[
    `<circle cx="44" cy="18" r="7" fill="#FFF3D6"/><rect x="24" y="34" width="10" height="40" fill="#F4F0E8"/><rect x="24" y="44" width="10" height="5" fill="#D6564F"/><rect x="24" y="58" width="10" height="5" fill="#D6564F"/><path d="M22 34 h14 l-3 -7 h-8z" fill="#3A3346"/><path d="M0 80 Q30 70 60 80 V90 H0Z" fill="#1E2A4A"/><path d="M40 70 q3 -6 6 0 q2 -3 3 1 v4 h-9z" fill="#222"/>`,
    `<circle cx="30" cy="26" r="13" fill="#FFF8E7"/><circle cx="25" cy="23" r="2" fill="#EAD9C0"/><path d="M8 90 V60 q22 -14 44 0 V90Z" fill="#8E5A4A"/><rect x="18" y="66" width="24" height="14" rx="2" fill="#FFD9A0"/><circle cx="22" cy="72" r="2.5" fill="#C77B4A"/><circle cx="30" cy="73" r="2.5" fill="#C77B4A"/><circle cx="38" cy="72" r="2.5" fill="#C77B4A"/>`,
    `<path d="M0 90 V64 L18 44 L32 60 L46 40 L60 58 V90Z" fill="#5C8C74"/><path d="M22 82 L30 68 L38 82Z" fill="#E77F4F"/><rect x="12" y="66" width="9" height="11" rx="2" fill="#B8C4CC"/><circle cx="16.5" cy="64" r="3.2" fill="#B8C4CC"/><circle cx="15.3" cy="63.6" r="0.8" fill="#2E4A3F"/><circle cx="17.7" cy="63.6" r="0.8" fill="#2E4A3F"/><circle cx="46" cy="16" r="5" fill="#FFF6DA"/>`,
  ][i]}</svg>
  <div style="position:absolute;left:12px;right:12px;bottom:12px;font-weight:800;font-size:26px;line-height:1.02;letter-spacing:-0.02em;color:${f.fg};text-shadow:0 2px 8px rgba(0,0,0,0.35)">${f.t}</div></div>
  <div style="display:flex;gap:6px;align-items:center;font-weight:700;font-size:20px;color:var(--fg)">${'<span style="width:16px;height:16px;border-radius:16px;background:var(--accent);display:inline-block"></span>'.repeat(f.v)}<span style="opacity:0.7;margin-left:4px">${f.v} votes</span></div></div>`;
const filmNightHtml = (wp) => `<div id="yc-film-board" style="position:fixed;inset:0;z-index:2147483647;overflow:hidden;background:${wp ? `var(--canvas) center / cover no-repeat url('${wp}')` : 'var(--canvas)'};color:var(--fg);font-family:var(--font-sans,system-ui);padding:30px 40px;display:flex;gap:34px;align-items:stretch">
  <div style="width:30%;display:flex;flex-direction:column;gap:16px"><div style="background:var(--accent);color:var(--on-accent,#1A1208);border-radius:20px;padding:22px 24px;box-shadow:0 10px 28px rgba(0,0,0,0.25)"><div style="font-size:18px;font-weight:700;opacity:0.78">friday</div><div style="font-size:72px;font-weight:800;letter-spacing:-0.04em;line-height:0.95">film night</div><div style="font-size:20px;font-weight:600;margin-top:8px;opacity:0.85">popcorn at 7</div></div>
  <div style="${GLASS};padding:16px 18px;font-size:20px;line-height:1.3">pick one each, most votes wins</div></div>
  <div style="flex:1;display:flex;gap:22px;align-items:center">${FILMS.map(poster).join('')}</div></div>`;
// The wallpaper the theme draws behind the window, fetched into a data address so the Page's own frame can show it.
// WHY: the made thing sits in the same look the person sees around it (Golden Sunbreak's sunlit street), not on black.
const WALLPAPER = `(async () => { let best = null;
  for (const e of document.querySelectorAll('body *')) for (const pe of [null, '::before', '::after']) {
    const bg = getComputedStyle(e, pe).backgroundImage; if (!bg || !bg.includes('url(')) continue;
    const m = bg.match(/url\\("?([^")]+)"?\\)/); if (!m || m[1].startsWith('data:image/svg')) continue;
    const r = e.getBoundingClientRect(); const a = r.width * r.height; if (!best || a > best.a) best = { a, url: m[1] }; }
  if (!best || best.a < innerWidth * innerHeight * 0.5) return null;
  // WHY scaled down to 1600 px as a JPEG: a 3 MB picture as a data address was silently dropped by the Page's frame,
  // which left its background see-through
  const img = new Image(); img.src = best.url; await img.decode();
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.88); })()`;

// ---------------------------------------------------------------------------------------------------
// Round 6 paintings (review: every paint studio showed the same tree-and-sun seed, so the wall read as copy-paste).
// Each theme's studio gets its own picture, PAINTED through the page's own tools: the real mouse drags across its
// canvas with the brush, after picking each colour and size in its own palette. Coordinates are on an 1100 x 700
// paper (the studio's own seed size) and scaled to the paper on screen.
// ---------------------------------------------------------------------------------------------------
const S_ = (c, w, p, a = 1) => ({ c, w, a, p });
const dabP = (c, w, x, y) => S_(c, w, [[x, y], [x + 0.6, y + 0.3]]);
// a filled rectangle: overlapping horizontal brush strokes (WHY 90 wide every 55: no gaps at any paper size)
// (a fill that reaches the paper's edge runs past it, so the round brush ends never leave a scalloped white rim)
const rectF = (c, x0, y0, x1, y1) => { const o = []; const xa = x0 <= 0 ? -60 : x0 + 20, xb = x1 >= 1100 ? 1160 : x1 - 20;
  for (let y = y0 <= 0 ? -10 : y0 + 20; y <= (y1 >= 700 ? y1 + 40 : y1 - 10); y += 55) o.push(S_(c, 90, [[xa, y], [xb, y]]));
  if (!o.length) o.push(S_(c, Math.max(8, y1 - y0), [[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]])); return o; };
// a filled ellipse: concentric rings from the outside in
const blobF = (c, cx, cy, rx, ry) => { const o = []; for (let k = 1; k > 0.05; k -= 0.33) { const p = []; for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; p.push([cx + rx * k * Math.cos(a) * 0.82, cy + ry * k * Math.sin(a) * 0.82]); } o.push(S_(c, Math.min(rx, ry) * 0.6 + 8, p)); } return o; };
const arcP = (cx, cy, rx, ry, a0, a1, n = 26) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const triF = (c, ax, ay, bx, by, cx2, cy2) => { const o = []; for (let k = 0; k <= 1.0001; k += 0.12) o.push(S_(c, 46, [[ax + (bx - ax) * k, ay + (by - ay) * k], [ax + (cx2 - ax) * k, ay + (cy2 - ay) * k]])); return o; };
const seeded = (n) => { let s = n; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };
const PAINTINGS = {
  beach: { name: 'beach day', ops: () => [...rectF('#bfe3f7', 0, 0, 1100, 340), ...blobF('#f7dc5a', 860, 130, 80, 80), ...rectF('#3070d6', 0, 330, 1100, 480), S_('#2bb3b1', 18, [[0, 380], [1100, 372]]), S_('#ffffff', 10, [[80, 420], [220, 414]]), S_('#ffffff', 10, [[640, 440], [820, 434]]), ...rectF('#f2d79b', 0, 470, 1100, 700),
    S_('#8a5a3c', 30, [[380, 420], [620, 420]]), S_('#8a5a3c', 22, [[400, 445], [600, 445]]), S_('#8a5a3c', 8, [[500, 420], [500, 210]]), ...triF('#ffffff', 508, 220, 508, 400, 640, 400), ...triF('#d63a3a', 492, 240, 492, 400, 400, 400),
    S_('#d63a3a', 26, arcP(230, 560, 120, 70, Math.PI, Math.PI * 2)), S_('#ffffff', 26, arcP(230, 560, 60, 70, Math.PI * 1.2, Math.PI * 1.8)), S_('#6b6b6b', 8, [[230, 490], [230, 660]]), ...blobF('#e55d9c', 820, 620, 70, 26)] },
  flowers: { name: 'flowers for nan', ops: () => [...rectF('#f6d6e0', 0, 0, 1100, 560), ...rectF('#8a5a3c', 0, 560, 1100, 700), S_('#2f9e5b', 10, [[550, 420], [430, 190]]), S_('#2f9e5b', 10, [[550, 420], [560, 150]]), S_('#2f9e5b', 10, [[550, 420], [690, 210]]), S_('#2f9e5b', 26, [[520, 330], [470, 300]]),
    ...blobF('#2bb3b1', 550, 480, 100, 110), S_('#ffffff', 10, [[505, 430], [500, 520]], 0.6),
    ...[[430, 190, '#d63a3a'], [560, 150, '#f2d34b'], [690, 210, '#8c4fd0']].flatMap(([x, y, c]) => [...[0, 1, 2, 3, 4, 5].map((i) => dabP(c, 44, x + 42 * Math.cos(i * 1.047), y + 42 * Math.sin(i * 1.047))), dabP('#e5a13a', 34, x, y)])] },
  night: { name: 'space mission', ops: () => { const r = seeded(4); return [...rectF('#1b2559', 0, 0, 1100, 700), ...Array.from({ length: 36 }, () => dabP('#ffffff', 6 + r() * 8, r() * 1100, r() * 700)), ...blobF('#f4efd8', 860, 170, 95, 95), dabP('#c9c2ae', 26, 830, 150), dabP('#c9c2ae', 18, 890, 200),
    ...blobF('#e8e8ee', 430, 360, 70, 170), dabP('#3070d6', 46, 430, 320), dabP('#bfe3f7', 18, 420, 312), ...triF('#d63a3a', 362, 440, 362, 540, 300, 560), ...triF('#d63a3a', 498, 440, 498, 540, 560, 560), ...blobF('#e5a13a', 430, 590, 40, 60), ...blobF('#f7dc5a', 430, 575, 22, 34)]; } },
  cake: { name: 'happy birthday dad', ops: () => [...rectF('#d9ccf2', 0, 0, 1100, 700), S_('#ffffff', 30, arcP(550, 580, 330, 50, 0, Math.PI * 2, 40)), ...rectF('#9a6440', 320, 380, 780, 570), ...rectF('#fbe7c6', 320, 450, 780, 490), ...rectF('#e55d9c', 320, 360, 780, 410),
    ...[380, 470, 560, 650, 740].map((x) => S_('#e55d9c', 22, [[x, 400], [x, 440 + (x % 3) * 12]])), ...[420, 500, 580, 660].flatMap((x, i) => [S_(['#3070d6', '#f2d34b', '#2bb3b1', '#d63a3a'][i], 16, [[x, 360], [x, 270]]), dabP('#e5a13a', 26, x, 248), dabP('#f7dc5a', 14, x, 252)]),
    ...[[360, 520], [450, 535], [700, 525], [620, 540], [520, 520]].map(([x, y], i) => dabP(['#d63a3a', '#3070d6', '#2f9e5b', '#f2d34b', '#8c4fd0'][i], 12, x, y))] },
  house: { name: 'our house', ops: () => [...rectF('#bfe3f7', 0, 0, 1100, 520), ...rectF('#7cc57f', 0, 500, 1100, 700), ...blobF('#f7dc5a', 140, 120, 70, 70), ...rectF('#fbe7c6', 400, 320, 720, 560), ...triF('#d63a3a', 560, 170, 370, 330, 750, 330), ...rectF('#8a5a3c', 630, 190, 670, 270),
    ...rectF('#3070d6', 525, 430, 595, 560), ...rectF('#bfe3f7', 430, 360, 500, 420), ...rectF('#bfe3f7', 620, 360, 690, 420), S_('#ffffff', 6, [[465, 360], [465, 420]]), S_('#ffffff', 6, [[655, 360], [655, 420]]), S_('#cfc8c0', 50, [[560, 570], [600, 700]]),
    S_('#8a5a3c', 26, [[880, 560], [880, 420]]), ...blobF('#2f9e5b', 880, 370, 90, 90), ...[[300, 640], [340, 620], [800, 650], [960, 630]].map(([x, y]) => dabP('#e55d9c', 18, x, y))] },
  city: { name: 'view from the flat', ops: () => { const r = seeded(9); const o = [...rectF('#f2a65a', 0, 0, 1100, 230), ...rectF('#e8768a', 0, 210, 1100, 400), ...rectF('#8c4fd0', 0, 380, 1100, 700), ...blobF('#f7dc5a', 760, 300, 90, 90)];
    for (const [x0, w, h] of [[20, 150, 330], [190, 120, 420], [330, 170, 260], [520, 110, 470], [650, 190, 300], [860, 120, 380], [990, 110, 250]]) { o.push(...rectF('#2a1f45', x0, 700 - h, x0 + w, 700)); for (let k = 0; k < 6; k++) o.push(dabP('#f7dc5a', 14, x0 + 20 + r() * (w - 40), 720 - h + r() * (h - 60))); }
    return o; } },
  fish: { name: 'fish tank', ops: () => { const r = seeded(3); return [...rectF('#2bb3b1', 0, 0, 1100, 600), ...rectF('#f2d79b', 0, 590, 1100, 700), ...[120, 260, 880, 990].map((x) => S_('#2f9e5b', 22, [[x, 690], [x - 30, 560], [x + 20, 450], [x - 10, 340]])),
    ...[[380, 260, '#e5a13a'], [700, 400, '#d63a3a'], [560, 180, '#f2d34b']].flatMap(([x, y, c]) => [...blobF(c, x, y, 80, 46), ...triF(c, x + 70, y, x + 140, y - 46, x + 140, y + 46), dabP('#1d1d1d', 14, x - 44, y - 8), dabP('#ffffff', 5, x - 46, y - 11)]),
    ...Array.from({ length: 10 }, () => { const x = 200 + r() * 700, y = 60 + r() * 400, s = 10 + r() * 20; return S_('#ffffff', 5, arcP(x, y, s, s, 0, Math.PI * 2, 14)); })]; } },
  mountains: { name: 'lake district', ops: () => [...rectF('#d6e4f5', 0, 0, 1100, 420), ...triF('#6f8fb0', 330, 120, 40, 440, 640, 440), ...triF('#4f6f90', 760, 80, 460, 440, 1080, 440), ...triF('#ffffff', 330, 120, 270, 200, 390, 200), ...triF('#ffffff', 760, 80, 700, 160, 820, 160),
    ...rectF('#3070d6', 0, 430, 1100, 560), S_('#bfe3f7', 10, [[200, 480], [420, 476]]), S_('#bfe3f7', 10, [[620, 510], [900, 506]]), ...rectF('#2f9e5b', 0, 550, 1100, 700), ...[120, 220, 920, 1010].flatMap((x) => triF('#1f6b40', x, 470, x - 50, 620, x + 50, 620))] },
  rainbow: { name: 'rainy day rainbow', ops: () => [...rectF('#e3f4fc', 0, 0, 1100, 700), ...['#d63a3a', '#e5a13a', '#f2d34b', '#2f9e5b', '#3070d6', '#8c4fd0'].map((c, i) => S_(c, 36, arcP(550, 600, 420 - i * 34, 420 - i * 34, Math.PI, Math.PI * 2, 40))),
    ...blobF('#ffffff', 170, 590, 120, 60), ...blobF('#ffffff', 930, 590, 120, 60), ...blobF('#cfd6dc', 300, 120, 130, 60), ...[[230, 210], [290, 250], [350, 215], [260, 300], [330, 300]].map(([x, y]) => S_('#3070d6', 8, [[x, y], [x - 10, y + 30]])), ...blobF('#7fa8d6', 550, 670, 160, 22)] },
  garden: { name: 'veg patch', ops: () => [...rectF('#efe6d2', 0, 0, 1100, 700), ...rectF('#8a5a3c', 80, 80, 480, 320), ...rectF('#8a5a3c', 620, 80, 1020, 320), ...rectF('#8a5a3c', 80, 400, 480, 640), ...rectF('#8a5a3c', 620, 400, 1020, 640), S_('#cfc8c0', 70, [[550, 0], [550, 700]]),
    ...[130, 210, 290, 370, 440].flatMap((x) => [dabP('#7cc57f', 50, x, 140), dabP('#7cc57f', 50, x, 260)]), ...[680, 760, 840, 920, 990].flatMap((x) => [S_('#e5a13a', 14, [[x, 130], [x, 190]]), S_('#2f9e5b', 10, [[x, 110], [x, 130]]), S_('#e5a13a', 14, [[x, 230], [x, 290]])]),
    ...[[150, 470], [260, 520], [380, 470], [190, 590], [330, 600], [430, 560]].flatMap(([x, y]) => [dabP('#2f9e5b', 50, x, y), dabP('#d63a3a', 24, x + 10, y + 6)]), ...[700, 820, 940].flatMap((x) => [S_('#8c4fd0', 30, [[x, 440], [x, 600]]), dabP('#2f9e5b', 30, x, 430)])] },
  cat: { name: 'tilly at the window', ops: () => [...rectF('#1b2559', 0, 0, 1100, 700), ...blobF('#f4efd8', 780, 170, 70, 70), ...rectF('#fbe7c6', 0, 0, 130, 700), ...rectF('#fbe7c6', 970, 0, 1100, 700), ...rectF('#fbe7c6', 0, 0, 1100, 70), ...rectF('#fbe7c6', 0, 560, 1100, 700), S_('#fbe7c6', 30, [[550, 70], [550, 560]]),
    ...blobF('#1d1d1d', 380, 470, 120, 90), ...blobF('#1d1d1d', 380, 340, 70, 64), ...triF('#1d1d1d', 330, 300, 320, 230, 370, 290), ...triF('#1d1d1d', 430, 300, 440, 230, 390, 290), S_('#1d1d1d', 24, [[480, 520], [560, 500], [580, 430]]), dabP('#f2d34b', 16, 355, 335), dabP('#f2d34b', 16, 405, 335),
    ...blobF('#d63a3a', 780, 500, 60, 50), ...[740, 780, 820].map((x) => S_('#2f9e5b', 18, [[x, 460], [x + (x - 780) * 0.6, 360]]))] },
  dog: { name: 'biscuit', ops: () => [...rectF('#f7dc5a', 0, 0, 1100, 640), ...rectF('#7cc57f', 0, 620, 1100, 700), ...blobF('#8a5a3c', 380, 260, 70, 150), ...blobF('#8a5a3c', 720, 260, 70, 150), ...blobF('#c08a5a', 550, 380, 210, 190), ...blobF('#fbe7c6', 550, 470, 110, 80),
    dabP('#1d1d1d', 44, 470, 330), dabP('#1d1d1d', 44, 630, 330), dabP('#ffffff', 12, 480, 320), dabP('#ffffff', 12, 640, 320), ...blobF('#1d1d1d', 550, 430, 42, 30), S_('#1d1d1d', 8, [[550, 455], [550, 490], [510, 510]]), S_('#1d1d1d', 8, [[550, 490], [590, 510]]), ...blobF('#e55d9c', 550, 545, 30, 36)] },
};
const PAINT_FOR = {
  'creme-laptop': 'beach', 'creme-tablet': 'flowers', 'dark-tv': 'night', 'devils-garden-tablet': 'mountains', 'golden-sunbreak-laptop': 'city', 'halftone-dimension-phone': 'cat',   // (the phone's narrow paper squashes it: not used on the wall)
 
  'halftone-dimension-tablet': 'fish', 'kuromi-dreamer-tablet': 'cake', 'light-laptop': 'house', 'morning-rounds-laptop': 'garden', 'strawberry-kitty-tv': 'rainbow', 'youcoded-tablet': 'dog',
};
/** Paints `design` in the studio through its own controls (colour, size, the brush) and the real mouse. */
async function paintIn(tab, design) {
  const geo = await inFrame(tab, `(() => { document.getElementById('clear').click(); const n = document.querySelector('.name'); n.value = ${JSON.stringify(design.name)};
    const r = document.getElementById('c').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  const fr = await tab.evaluate(`(() => { const f = document.querySelector('iframe'); const r = f.getBoundingClientRect(); return [r.left, r.top]; })()`);
  const k = geo[2] / 1100;
  const at = ([x, y]) => [fr[0] + geo[0] + x * k, fr[1] + geo[1] + y * (geo[3] / 700)];
  const mouse = (type, [x, y]) => tab.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  for (const o of design.ops()) {
    await inFrame(tab, `(() => { const cu = document.getElementById('custom'); cu.value = ${JSON.stringify(o.c)}; cu.dispatchEvent(new Event('input', { bubbles: true }));
      const sz = document.getElementById('size'); sz.value = ${Math.max(1, Math.min(48, Math.round(o.w * k)))}; sz.dispatchEvent(new Event('input', { bubbles: true }));
      const op = document.getElementById('opacity'); op.value = ${Math.round(o.a * 100)}; op.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`, 4000);
    // WHY only the press is kept inside the paper (a press outside the canvas would not start a stroke); the drag may
    // run past the edge, as a real hand's does, since the canvas holds on to the pointer once pressed
    const inside = (q) => [Math.max(2, Math.min(1098, q[0])), Math.max(2, Math.min(698, q[1]))];
    const pts = [inside(o.p[0]), ...o.p.slice(1)].map(at);
    await mouse('mousePressed', pts[0]);
    for (const q of pts.slice(1)) await mouse('mouseMoved', q);
    await mouse('mouseReleased', pts[pts.length - 1]);
  }
  // WHY (round 6 look check): drags that ran past the paper's edge selected the sidebar's words, which then showed blue
  await inFrame(tab, `(() => { getSelection().removeAllRanges(); document.activeElement?.blur?.(); return true; })()`);
  await tab.evaluate(`(() => { getSelection().removeAllRanges(); return true; })()`);
}
const PLAN6 = {
  'golden-sunbreak': [['phone', 'typechars'], ['phone', 'asked'], ['phone', 'mine'], ['phone', 'mineempty']],
  'kuromi-dreamer': [['laptop', 'mine']],
  'morning-rounds': [['phone', 'mine']],
};
for (const [k, v] of Object.entries(PLAN6)) PLAN[k] = [...PLAN[k], ...v];
// WHY round 6 conversations (review: the wall after the turn showed the same smart-home and money pages again and
// again, and brand guide 9 says those dashboards are not in the app): the wall is now carried by conversations in
// every theme and every shape, the paint studios (each with its own picture) and the TV's own film night.
const PLAN6B = {
  creme: [['phone', 'chat'], ['laptop', 'chat']], light: [['phone', 'chat'], ['tablet', 'chat'], ['tv', 'chat']], dark: [['phone', 'chat'], ['laptop', 'chat'], ['tv', 'chat']],
  'devils-garden': [['phone', 'chat'], ['tv', 'chat']], 'strawberry-kitty': [['phone', 'chat'], ['laptop', 'chat'], ['tv', 'mine']], 'halftone-dimension': [['phone', 'chat'], ['laptop', 'chat'], ['tv', 'chat']],
  'golden-sunbreak': [['tablet', 'chat'], ['laptop', 'chat']], midnight: [['tablet', 'chat'], ['laptop', 'chat']], 'morning-rounds': [['tablet', 'chat'], ['tv', 'chat']],
  youcoded: [['tablet', 'chat'], ['laptop', 'chat'], ['tv', 'chat']], 'kuromi-dreamer': [['tablet', 'chat'], ['laptop', 'chat']],
};
for (const [k, v] of Object.entries(PLAN6B)) PLAN[k] = [...PLAN[k], ...v];
// WHY more phones (round 6 picker): the wall holds 63 phones, and with no repeats inside a frame it needs more phone
// looks than the conversations alone give; an empty window in a theme shows that theme's wallpaper whole
for (const k of ['kuromi-dreamer', 'strawberry-kitty', 'devils-garden', 'youcoded']) PLAN[k] = [...PLAN[k], ['phone', 'wake']];
/** Runs `expression` inside the Page's sandboxed iframe (its own Chrome target; same route as shoot.mjs waitForFrame). */
async function inFrame(tab, expression, ms = 12000) {
  // WHY reuse the frame's session (round 6 paintings run hundreds of calls): the attach event only arrives once per tab
  if (tab.__frame) {
    const r = await tab.browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, tab.__frame).catch(() => null);
    if (r && !r.exceptionDetails) return r.result?.value;
    if (r?.exceptionDetails) throw new Error(`in frame: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  }
  let session = null;
  const off = tab.on((m) => { if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'iframe') session = m.params.sessionId; });
  try {
    await tab.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) {
      if (!session) continue;
      const r = await tab.browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session).catch(() => null);
      if (r && !r.exceptionDetails) { tab.__frame = session; return r.result?.value; }
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
      const wp = await tab.evaluate(WALLPAPER, 20000).catch(() => null);
      console.log('wallpaper', slug, wp ? `${Math.round(wp.length / 1024)} KB` : 'none');
      const html = b ? boardHtml(b, shapeKey !== 'phone', wp, !!f.emptyBoard) : filmNightHtml(wp);
      await inFrame(tab, `(() => { document.getElementById('yc-film-board')?.remove(); document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(html)}); return true; })()`);
      await sleep(600);
      // the page's name, where the window shows it (title bar, the pages list): the person named their page
      await tab.evaluate(`(() => { for (const e of document.querySelectorAll('span,div,button,a,p')) { if (e.children.length === 0 && (e.textContent || '').trim() === 'Home' && !e.closest('iframe')) e.textContent = ${JSON.stringify(b ? 'Pickups' : 'Film night')}; } })()`);
    }
    if (focusKey === 'paint' && PAINT_FOR[`${slug}-${shapeKey}`]) {
      await sleep(1200);
      await paintIn(tab, PAINTINGS[PAINT_FOR[`${slug}-${shapeKey}`]]);
      await sleep(400);
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
