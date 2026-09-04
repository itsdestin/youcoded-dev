// Renders every face style × expression of the default rig into one sheet
// (docs/…/faces-styles.png) so Destin can pick eyes without a video render.
// Usage: node faces-sheet.mjs <out.png> [style ...]   (default: classic warm)
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { DEFAULT_BUDDY_RIG } = await import('./src/rig.ts');
const { withFaces } = await import('./src/host/faces.ts');
const out = process.argv[2];
const styles = process.argv.length > 3 ? process.argv.slice(3) : ['classic', 'warm'];
const dir = mkdtempSync(join(tmpdir(), 'faces-'));
const faces = ['welcome', 'shocked', 'curious', 'happy', 'smug', 'blink', 'dizzy', 'shutdown'];
// every tint the film's default rig wears, with the ink the host really uses
// (the same 22 %-of-the-body shade as themes.ts inkFor; inlined because themes.ts
// imports the generated module without an extension, which Node's loader rejects)
const ACCENT = { 'golden-sunbreak': '#ffc030', 'cotton-candy-sky': '#8B47B8', midnight: '#B1BAC4' };
const ink = (hex) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * 0.32).toString(16).padStart(2, '0')).join('');
const tints = Object.fromEntries(Object.entries(ACCENT).map(([s, a]) => [s, [a, ink(a)]]));
const rows = [];
for (const style of styles) {
  for (const [slug, [accent, on]] of Object.entries(tints)) {
    const cells = [];
    for (const face of faces) {
      let svg = withFaces(DEFAULT_BUDDY_RIG, style).replaceAll('var(--rig-accent, #f0a828)', accent).replaceAll('var(--rig-accent, #ffc030)', accent)
        .replaceAll('var(--rig-accent, #ffe090)', accent).replaceAll('var(--rig-accent, #ffd060)', accent).replaceAll('var(--rig-on-accent, #2a1004)', on);
      const tuck = face === 'shutdown' ? '#rig-arm-left{transform-box:view-box;transform-origin:2.5px 9px;transform:rotate(70deg)}#rig-arm-right{transform-box:view-box;transform-origin:21.5px 9px;transform:rotate(-70deg)}#rig-leg-left{transform-box:view-box;transform-origin:8.95px 17px;transform:rotate(95deg)}#rig-leg-right{transform-box:view-box;transform-origin:15.05px 17px;transform:rotate(-95deg)}' : '';
      const css = '<style>' + ['idle', 'welcome', 'curious', 'shocked', 'dizzy', 'blink', 'happy', 'smug', 'shutdown'].map((g) => `#rig-face-${g}{display:${g === face ? 'inline' : 'none'} !important}`).join('') + '#rig-hand-peek-left,#rig-hand-peek-right{display:none !important}' + tuck + '</style>';
      svg = svg.replace(/(<svg[^>]*>)/, `$1${css}`);
      const p = join(dir, `${style}-${slug}-${face}.png`);
      writeFileSync(join(dir, 't.svg'), svg);
      execFileSync('rsvg-convert', ['-w', '220', '-h', '220', '-b', '#2e2e36', join(dir, 't.svg'), '-o', p]);
      execFileSync('magick', [p, '-gravity', 'south', '-fill', '#cfd3da', '-pointsize', '17', '-annotate', '+0+3', face === 'shocked' ? 'surprised' : face, p]);
      cells.push(p);
    }
    const row = join(dir, `row-${style}-${slug}.png`);
    execFileSync('magick', [...cells, '+append', row]);
    execFileSync('magick', [row, '-gravity', 'northwest', '-fill', '#ffd166', '-pointsize', '17', '-annotate', '+6+3', `${style === 'classic' ? 'BEFORE (classic)' : 'AFTER (warm)'}  ·  ${slug}`, row]);
    rows.push(row);
  }
}
execFileSync('magick', [...rows, '-append', out]);
console.log('wrote', out);
