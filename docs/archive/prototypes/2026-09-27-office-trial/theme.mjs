// Theming trial: open a file, then repaint OnlyOffice's interface with a YouCoded
// theme's colours (and, for wallpaper themes, see-through glass panels over the
// wallpaper). Screenshots land in out/theme-<theme>-<file>.png.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad';
const require = createRequire(path.join(S, 'document/package.json'));
const { chromium } = require('@playwright/test');
const EXE = fs.readdirSync(`${process.env.HOME}/.cache/ms-playwright/chromium-1243`).map((d) => `${process.env.HOME}/.cache/ms-playwright/chromium-1243/${d}/chrome`).find(fs.existsSync);
const THEMES = JSON.parse(fs.readFileSync(path.join(S, 'rig/themes.json'), 'utf8'));
const [themeName, file, sizeArg] = process.argv.slice(2);
const T = THEMES[themeName];
const [W, H] = (sizeArg || '1440x900').split('x').map(Number);

const hexA = (hex, a) => {
  const h = hex.replace('#', '').slice(0, 6);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const glass = T.wallpaper ? T.panelOpacity : 1;
const panel = hexA(T.tokens.panel, glass);
const vars = {
  '--toolbar-header-document': panel, '--toolbar-header-spreadsheet': panel,
  '--toolbar-header-presentation': panel, '--toolbar-header-pdf': panel, '--toolbar-header-visio': panel,
  '--text-toolbar-header': T.tokens.fg, '--text-toolbar-header-on-background-document': T.tokens.fg,
  '--text-toolbar-header-on-background-spreadsheet': T.tokens.fg, '--text-toolbar-header-on-background-presentation': T.tokens.fg,
  '--background-toolbar': panel, '--background-toolbar-additional': panel,
  '--background-normal': T.tokens.panel, '--background-pane': panel,
  '--background-primary-dialog-button': T.tokens.accent, '--text-inverse': T.tokens['on-accent'],
  '--background-accent-button': T.tokens.accent, '--background-notification-popover': T.tokens.inset,
  '--highlight-button-hover': hexA(T.tokens.inset, 0.9), '--highlight-button-pressed': T.tokens.inset,
  '--highlight-button-pressed-hover': T.tokens.inset, '--highlight-header-button-hover': hexA(T.tokens.inset, 0.9),
  '--highlight-header-button-pressed': T.tokens.inset, '--highlight-toolbar-tab-underline': T.tokens.accent,
  '--highlight-toolbar-tab-underline-document': T.tokens.accent, '--highlight-toolbar-tab-underline-spreadsheet': T.tokens.accent,
  '--highlight-toolbar-tab-underline-presentation': T.tokens.accent,
  '--text-normal': T.tokens.fg, '--text-normal-pressed': T.tokens.fg, '--text-secondary': T.tokens['fg-dim'],
  '--text-tertiary': T.tokens['fg-muted'], '--text-link': T.tokens.link || T.tokens.accent,
  '--icon-normal': T.tokens.fg, '--icon-normal-pressed': T.tokens.fg, '--icon-toolbar-header': T.tokens.fg,
  '--border-toolbar': T.tokens.edge, '--border-divider': T.tokens.edge, '--border-regular-control': T.tokens.edge,
  '--border-sidemenu': T.tokens.edge, '--border-toolbar-active-panel-top': panel, '--border-control-focus': T.tokens.accent,
  '--background-scrim': 'rgba(0,0,0,0.3)', '--canvas-background': T.wallpaper ? 'transparent' : T.tokens.canvas,
  '--canvas-content-background': '#fff', '--canvas-page-border': T.tokens.edge,
  '--canvas-ruler-background': panel, '--canvas-ruler-border': T.tokens.edge, '--canvas-ruler-margins-background': T.tokens.inset,
  '--canvas-high-contrast': T.tokens.fg, '--canvas-scroll-thumb': T.tokens['scrollbar-thumb'],
  '--canvas-scroll-thumb-hover': T.tokens['scrollbar-hover'], '--canvas-scroll-arrow': T.tokens['fg-muted'],
  '--canvas-background-tabs': panel,
  '--background-fill-input': hexA(T.tokens.canvas, T.wallpaper ? 0.7 : 1), '--border-fill-input': T.tokens.edge,
  '--text-contrast-background': T.tokens.fg,
};
const decl = Object.entries(vars).map(([k, v]) => `${k}:${v} !important;`).join('');
const fontRule = T.font ? `body, .btn, .form-control, .dropdown-menu, .ribtab, .input-field input, label { font-family: ${T.font} !important; }` : '';
const css = `
  :root, body, body[class], body.theme-light, body.theme-classic-light, body.theme-white { ${decl} }
  /* YouCoded owns tabs and the file title, so OnlyOffice's own title row goes. */
  #header, #app-title, .header-logo, #box-document-title { display: none !important; }
  ${T.wallpaper ? `html, body, #viewport, #editor-container, .layout-region, #id_main, #editor_sdk, #ws-canvas-outer, .ws-canvas-area, #id_panel_left, #left-menu, #right-menu, .statusbar, #statusbar, #toolbar, .toolbar, .box-tabs, .box-controls, .toolbar-mask { background-color: transparent !important; }
     #toolbar, .toolbar, .statusbar, #statusbar, #left-menu, .left-menu, #right-menu, .right-panel, .box-tabs, .box-controls { backdrop-filter: blur(${T.blur}px); }
     #toolbar .box-tabs, #toolbar .box-controls, .statusbar, #left-menu, #right-menu { background: ${panel} !important; }` : ''}
  ${fontRule}
  .asc-window, .dropdown-menu { font-family: inherit; }
  .synch-tip, .tip-arrow, .ttip, [class*="tip"].popover, .tooltip.new-feature, .asc-tooltip, .notification-popover { display: none !important; }
`;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: W, height: H }, locale: 'en-US', colorScheme: T.dark ? 'dark' : 'light', deviceScaleFactor: W < 600 ? 2 : 1 });
const hostUrl = `http://127.0.0.1:4718/host.html?bg=${encodeURIComponent(T.wallpaper || T.tokens.canvas)}${W < 600 ? '&mobile=1' : ''}`;
await page.goto(hostUrl);
await page.evaluate(({ T, W }) => {
  const bar = document.getElementById('bar');
  bar.textContent = `YouCoded — ${T.label}   ·   [ Chat ]  [ Files ]  [ Office ]`;
  bar.style.background = T.wallpaper ? 'transparent' : T.tokens.panel;
  bar.style.color = T.tokens.fg; bar.style.fontFamily = T.font || 'sans-serif';
  document.body.style.background = T.wallpaper ? `url(${T.wallpaper}) center/cover` : T.tokens.canvas;
  document.querySelector('iframe').style.background = 'transparent';
  document.querySelector('iframe').setAttribute('allowtransparency', 'true');
  document.documentElement.style.colorScheme = T.dark ? 'dark' : 'light';
}, { T, W });
await page.waitForFunction(() => window.__events.some((e) => e.type === 'document:ready'), null, { timeout: 120000 });
const bytes = fs.readFileSync(path.join(S, 'samples', file));
await page.evaluate(async ({ b64, name }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return window.send('document:open-buffer', { fileName: name, buffer: bin.buffer });
}, { b64: bytes.toString('base64'), name: file });
await page.waitForTimeout(9000);
for (const f of page.frames()) {
  if (f === page.mainFrame()) continue;
  await f.addStyleTag({ content: css + (T.wallpaper ? 'html{color-scheme:' + (T.dark ? 'dark' : 'light') + '}' : '') }).catch(() => {});
  if (T.fontUrl) await f.addStyleTag({ url: T.fontUrl }).catch(() => {});
}
await page.waitForTimeout(2500);
const shot = path.join(S, `rig/out/theme-${themeName}-${file}${W < 600 ? '-phone' : ''}.png`);
await page.screenshot({ path: shot });
console.log(shot);
await browser.close();
