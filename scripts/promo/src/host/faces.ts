// src/host/faces.ts — alternate face sets for the DEFAULT rig (and Golden
// Sunbreak, which shares its face geometry). Destin, 2026-09-04: the big empty
// black eyes are what reads as "weird"; new eyes and mouths are welcome and can
// live on as real alternate styles. Each set is the inner SVG of the five face
// groups the rig contract names; pupils sit in `.pupil` groups so the host's
// `look` can move them. Coordinates are the rig's viewBox (-3 -5 30 30): eyes
// around (9.3, 9.5) and (14.7, 9.3), the mouth near (12, 13.3).
export type FaceStyle = 'classic' | 'soft' | 'dot';
// Destin, 2026-09-04, on seeing soft/dot in the study: "holy shit those eyes are
// significantly worse" — the Golden Sunbreak and Strawberry Kitty eyes (the
// rigs' own big dark eyes with sparkle highlights) are the model. 'classic' is
// the style the film uses; soft/dot stay only as the record of what was tried.
type Set = Record<'idle' | 'welcome' | 'curious' | 'shocked' | 'blink', string>;
// The new styles draw their ink in a FIXED dark, not the theme's on-accent:
// on a light theme the on-accent is white, and a white iris in a white eye is
// no eye at all (the first sheet, Cotton Candy row).
const ON = '#1b1220';

// "Soft": almond eyes with a white sclera, a dark iris with a highlight, an
// upper lid line and brows that can lift. The mouth is a line, not a blob.
const softEye = (cx: number, cy: number, open = 1, r = 1.55) => `
  <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * 1.2 * open).toFixed(2)}" fill="#ffffff" fill-opacity="0.96"/>
  <g class="pupil"><circle cx="${cx + 0.15}" cy="${cy + 0.15}" r="${(r * 0.62).toFixed(2)}" fill="${ON}"/>
    <circle cx="${cx - 0.2}" cy="${cy - 0.35}" r="${(r * 0.2).toFixed(2)}" fill="#ffffff"/></g>
  <path d="M${cx - r} ${cy - 0.1} Q${cx} ${cy - r * 1.35 * open - 0.15} ${cx + r} ${cy - 0.1}" fill="none" stroke="${ON}" stroke-width="0.34" stroke-linecap="round"/>`;
const brow = (cx: number, y: number, lift = 0, tilt = 0) => `<path d="M${cx - 1.3} ${y - lift + tilt} Q${cx} ${y - lift - 0.55} ${cx + 1.3} ${y - lift - tilt}" fill="none" stroke="${ON}" stroke-width="0.42" stroke-linecap="round"/>`;
const SOFT: Set = {
  idle: `${softEye(9.3, 9.6, 0.72)}${softEye(14.7, 9.4, 0.72)}
    <path d="M10.9 13.2 Q12 13.7 13.1 13.2" fill="none" stroke="${ON}" stroke-width="0.42" stroke-linecap="round"/>`,
  welcome: `${softEye(9.3, 9.6, 0.9)}${softEye(14.7, 9.4, 0.9)}${brow(9.3, 6.9, 0.1)}${brow(14.7, 6.7, 0.1)}
    <path d="M10.4 13 Q12 14.6 13.6 13" fill="none" stroke="${ON}" stroke-width="0.5" stroke-linecap="round"/>`,
  curious: `${softEye(9.3, 9.6, 0.95)}${softEye(14.7, 9.4, 1.05, 1.65)}${brow(9.3, 7.0, 0)}${brow(14.7, 6.6, 0.55, 0.2)}
    <ellipse cx="12.1" cy="13.3" rx="0.5" ry="0.6" fill="${ON}"/>`,
  shocked: `${softEye(9.3, 9.7, 1.2, 1.8)}${softEye(14.7, 9.5, 1.2, 1.8)}${brow(9.3, 6.4, 0.5)}${brow(14.7, 6.2, 0.5)}
    <ellipse cx="12" cy="13.6" rx="0.95" ry="1.2" fill="${ON}"/>`,
  blink: `<path d="M7.9 9.9 Q9.3 10.8 10.7 9.9" fill="none" stroke="${ON}" stroke-width="0.6" stroke-linecap="round"/>
    <path d="M13.3 9.7 Q14.7 10.6 16.1 9.7" fill="none" stroke="${ON}" stroke-width="0.6" stroke-linecap="round"/>
    <path d="M10.9 13.2 Q12 13.7 13.1 13.2" fill="none" stroke="${ON}" stroke-width="0.42" stroke-linecap="round"/>`,
};

// "Dot": small round eyes with a single glint, soft cheeks, a tiny mouth —
// the friendly-toy look. Reads at every size because there is almost nothing
// to read; expression comes from the brows and the mouth.
const dotEye = (cx: number, cy: number, r = 0.85) => `<g class="pupil"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${ON}"/><circle cx="${cx - r * 0.35}" cy="${cy - r * 0.4}" r="${(r * 0.33).toFixed(2)}" fill="#ffffff"/></g>`;
const cheeks = `<ellipse cx="8.1" cy="11.5" rx="0.95" ry="0.5" fill="#ffffff" fill-opacity="0.28"/><ellipse cx="15.9" cy="11.3" rx="0.95" ry="0.5" fill="#ffffff" fill-opacity="0.28"/>`;
const DOT: Set = {
  idle: `${dotEye(9.4, 9.8)}${dotEye(14.6, 9.6)}${cheeks}<path d="M11.2 12.9 Q12 13.35 12.8 12.9" fill="none" stroke="${ON}" stroke-width="0.4" stroke-linecap="round"/>`,
  welcome: `${dotEye(9.4, 9.8)}${dotEye(14.6, 9.6)}${cheeks}<path d="M10.7 12.7 Q12 14.2 13.3 12.7" fill="none" stroke="${ON}" stroke-width="0.48" stroke-linecap="round"/>`,
  curious: `${dotEye(9.4, 9.8)}${dotEye(14.6, 9.6, 1.0)}${cheeks}${brow(14.6, 7.4, 0.5, 0.2)}<ellipse cx="12.1" cy="13.1" rx="0.45" ry="0.55" fill="${ON}"/>`,
  shocked: `${dotEye(9.4, 9.8, 1.15)}${dotEye(14.6, 9.6, 1.15)}${brow(9.4, 7.0, 0.5)}${brow(14.6, 6.8, 0.5)}<ellipse cx="12" cy="13.5" rx="0.85" ry="1.05" fill="${ON}"/>`,
  blink: `<path d="M8.4 9.9 Q9.4 10.5 10.4 9.9" fill="none" stroke="${ON}" stroke-width="0.55" stroke-linecap="round"/><path d="M13.6 9.7 Q14.6 10.3 15.6 9.7" fill="none" stroke="${ON}" stroke-width="0.55" stroke-linecap="round"/>${cheeks}
    <path d="M11.2 12.9 Q12 13.35 12.8 12.9" fill="none" stroke="${ON}" stroke-width="0.4" stroke-linecap="round"/>`,
};

const SETS: Record<Exclude<FaceStyle, 'classic'>, Set> = { soft: SOFT, dot: DOT };
/**
 * The classic welcome and shocked faces paint their sparkle highlights as bare
 * circles; wrapping each eye's highlights in a `.pupil` group lets the host's
 * `look` slide them, so the eyes glance around without changing expression
 * (only the curious face has pupil groups in the rig itself).
 */
function withTrackingHighlights(rigSvg: string): string {
  return rigSvg.replace(/(<g id="rig-face-(?:welcome|shocked)"[^>]*>)([\s\S]*?)(\n\s*<(?:g transform|ellipse cx="12")[^>]*>[\s\S]*?<\/g>|\n\s*<ellipse cx="12"[^>]*\/>)/, (_m, open, eyes, mouth) => {
    // group the highlight circles that follow each eye ellipse
    const grouped = eyes.replace(/((?:\s*<circle[^>]*\/>){2,3})/g, '<g class="pupil">$1</g>');
    return `${open}${grouped}${mouth}`;
  });
}
/** Replace the rig's five face groups with a style's; 'classic' returns the rig untouched. */
export function withFaces(rigSvg: string, style: FaceStyle): string {
  if (style === 'classic') return withTrackingHighlights(rigSvg);
  const set = SETS[style];
  let out = rigSvg;
  for (const face of Object.keys(set) as (keyof Set)[]) {
    // Replace the group's INNER content. A face group can hold nested <g>
    // (the classic curious face's pupils), so walk to the balanced close tag
    // rather than the first </g>.
    const m = new RegExp(`<g id="rig-face-${face}"[^>]*>`).exec(out);
    if (!m) continue;
    const from = m.index + m[0].length;
    let depth = 1, i = from;
    const tag = /<g\b|<\/g>/g; tag.lastIndex = from;
    for (let t = tag.exec(out); t; t = tag.exec(out)) {
      depth += t[0] === '</g>' ? -1 : 1;
      if (depth === 0) { i = t.index; break; }
    }
    out = out.slice(0, from) + set[face] + out.slice(i);
  }
  // the dizzy face stays the rig's own; unused by the host
  return out;
}
