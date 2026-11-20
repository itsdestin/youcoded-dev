#!/usr/bin/env node
// Builds ../../../footage/r2-tokyo.js: the page-side script the take 2 scenes run (`evalFile`) to give the
// practice app the two "rainy tokyo" looks the person asks for. WHY a script and not a vendored theme:
// the look is what youcoded makes in the film, so it is handed to the app's own theme engine exactly
// as a theme the assistant wrote would be (readFile → validate → apply, through the same appearance-sync
// path the landing page uses). Everything the viewer sees of the app (frame, chat, rain, glass) is then
// drawn by the real renderer; only the theme file itself is ours.
//   node take2-make-theme.mjs   (after rendering wp-pink.png / wp-cool.png from take2-wallpaper.html)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FOOT = join(HERE, '..', '..', '..', 'footage');
const html = join(HERE, 'take2-wallpaper.html');
const jpg = (variant) => {
  const png = join(tmpdir(), `take2-wp-${variant}.png`), out = join(tmpdir(), `take2-wp-${variant}.jpg`);
  execFileSync('google-chrome-stable', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(tmpdir(), 'take2-wp-chrome-' + variant)}`,
    `--screenshot=${png}`, '--window-size=1920,1200', '--virtual-time-budget=3000', `file://${html}#${variant}`], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', out]);
  writeFileSync(join(FOOT, `r2-wallpaper-${variant}.jpg`), readFileSync(out));   // kept beside the footage so the film can show the same picture
  return 'data:image/jpeg;base64,' + readFileSync(out).toString('base64');
};

// Both looks share everything but colour: "less pink tho" re-lights the same street.
const base = (slug, wallpaper, t) => ({
  name: 'Rainy Tokyo', slug, dark: true, author: 'youcoded', created: '2026-11-20',
  tokens: {
    canvas: t.canvas, panel: t.panel, inset: t.inset, well: '#07040F', accent: t.accent, 'on-accent': t.onAccent,
    fg: '#F4ECFB', 'fg-2': '#DCD0EA', 'fg-dim': '#B9AACD', 'fg-muted': '#988AB0', 'fg-faint': '#71648C',
    edge: t.edge, 'edge-dim': t.edge + '80', 'scrollbar-thumb': t.accent + '70', 'scrollbar-hover': t.accent,
  },
  // WHY Space Grotesk: a clean, slightly technical face that reads as "night city" without the
  // eye strain of a monospace for whole conversations; loaded the way any community theme loads its font.
  font: { family: "'Space Grotesk', system-ui, sans-serif", 'google-font-url': 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap', mono: "'Cascadia Mono', 'Cascadia Code', monospace" },
  shape: { radius: '10px', 'radius-sm': '8px', 'radius-md': '14px', 'radius-lg': '18px', 'radius-xl': '22px', 'radius-2xl': '28px', 'radius-full': '9999px' },
  background: { 'average-color': t.canvas, type: 'image', value: wallpaper, opacity: 1, 'panels-blur': 18, 'panels-opacity': 0.88, 'bubble-blur': 12, 'bubble-opacity': 0.82 },
  layout: { 'chrome-style': 'floating', 'input-style': 'default', 'bubble-style': 'bordered', 'header-style': 'default', 'statusbar-style': 'default' },
  // WHY the app's own rain: the person asked for rain, and the theme engine already draws it, moving.
  effects: { particles: 'rain', 'particle-count': 110, 'particle-speed': 1.25, 'particle-drift': 0.25, vignette: 0.22 },
});
const pink = base('rainy-tokyo', jpg('pink'), { canvas: '#0B0618', panel: '#160B26', inset: '#251339', edge: '#5A2470', accent: '#FF3FA4', onAccent: '#14051C' });
const cool = base('rainy-tokyo-blue', jpg('cool'), { canvas: '#060A18', panel: '#0D1428', inset: '#16213D', edge: '#24447A', accent: '#2B7FFF', onAccent: '#FFFFFF' });

// The page-side part. WHY a wrapper around the theme namespace: the shim's namespaces are Proxies that
// ignore assignment, so readFile cannot be patched in place; a Proxy over the old one answers these two
// slugs and passes every other member through untouched.
const js = `(() => {
  const T = ${JSON.stringify({ [pink.slug]: JSON.stringify(pink), [cool.slug]: JSON.stringify(cool) })};
  const old = window.claude && window.claude.theme; if (!old) return 'no theme api';
  if (window.__r2theme) return 'already';
  const readFile = async (slug) => T[slug] ?? old.readFile(slug);
  window.claude.theme = new Proxy(old, { get: (_t, p) => (p === 'readFile' ? readFile : old[p]) });
  window.__r2theme = true;
  return 'ok';
})()`;
writeFileSync(join(FOOT, 'r2-tokyo.js'), js);
console.log(`r2-tokyo.js ${(js.length / 1024).toFixed(0)} KB`);
