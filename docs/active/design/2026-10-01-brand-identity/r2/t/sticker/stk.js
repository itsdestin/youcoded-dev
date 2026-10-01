// stk.js — the "Stick it anywhere" territory's drawing kit: palette, the waving sticker
// mascot, the peel-corner app tile and the die-cut wordmark. Shared by gen.mjs (which writes
// the SVG/PNG files) and boards.js (which draws dozens of variants inline), so a theme sticker
// on a board and the shipped icon are the SAME drawing, not two hand-copies that drift.
(function (root) {
  const C = {
    grape: '#7C3AED', grapeDeep: '#4C1D95', grapeLt: '#A78BFA',
    sun: '#FFD23F', coral: '#FF5A5F', sky: '#3EC1F3', mint: '#3DDC97', pink: '#FF8FC7',
    ink: '#17131F', paper: '#FFF6E9', kraft: '#E9D8BD', white: '#FFFFFF',
  };
  let uid = 0;
  const nid = (p) => `${p}${++uid}`;

  // ---- The mascot: geometry on a 24-unit grid. The silhouette (head, left arm, waving right
  // arm, two feet) is THE fixed brand shape; themes change fills, face and one accessory.
  const HEAD = '<rect x="4.6" y="3.6" width="14.8" height="12.6" rx="4.4"/>';
  const ARM_L = '<rect x="1" y="8.8" width="3.1" height="4.4" rx="1.25" transform="rotate(10 2.5 9)"/>';
  const ARM_R = '<rect x="20.05" y="2.2" width="3.1" height="4.7" rx="1.25" transform="rotate(26 21.6 4.55)"/>';
  const FEET = '<rect x="7.3" y="16.85" width="3.6" height="3.9" rx="1.3"/><rect x="13.1" y="16.85" width="3.6" height="3.9" rx="1.3"/>';
  const BODY = HEAD + ARM_L + ARM_R + FEET;

  // Accessories sit ON the silhouette (they never replace a part). {geom, paint}
  const ACC = {
    none: null,
    leaf: { geom: '<path d="M12 4.2 C10.4 1.2 8 1.6 7.6 2.6 C9.4 2.7 10.7 3.4 11.2 4.4 Z M12 4.2 C13.6 1.2 16 1.6 16.4 2.6 C14.6 2.7 13.3 3.4 12.8 4.4 Z M11.4 4.2 C11.4 2.4 11.9 1.3 12.6 0.7 L13 1.1 C12.5 1.8 12.3 2.8 12.4 4.2 Z"/>', paint: '#2FBF71' },
    sun: { geom: '<circle cx="4.2" cy="3.6" r="2.7"/>', paint: '#FFB020' },
    star: { geom: '<path d="M22.4 -1.6 l0.75 1.6 1.75 0.2 -1.3 1.2 0.35 1.75 -1.55 -0.85 -1.55 0.85 0.35 -1.75 -1.3 -1.2 1.75 -0.2 Z"/>', paint: '#FFD23F' },
    cap: { geom: '<path d="M6.2 5.2 C6.4 1.6 17.6 1.6 17.8 5.2 Z"/><circle cx="12" cy="1.55" r="1.15"/>', paint: '#FF5A5F' },
    horns: { geom: '<path d="M7 4.4 L6.2 0.9 L9.2 3.6 Z M17 4.4 L17.8 0.9 L14.8 3.6 Z"/>', paint: '#17131F' },
    antenna: { geom: '<rect x="11.45" y="0.9" width="1.1" height="3" rx="0.5"/><circle cx="12" cy="0.9" r="1.25"/>', paint: '#3EC1F3' },
  };

  function face(kind, eye = '#1B1030', cheek = C.coral, glow = C.sky) {
    const smile = `<path d="M10.9 12.55 Q12 13.75 13.1 12.55" fill="none" stroke="${eye}" stroke-width="0.72" stroke-linecap="round"/>`;
    const cheeks = cheek ? `<ellipse cx="7.3" cy="12.2" rx="1.05" ry="0.62" fill="${cheek}" opacity=".75"/><ellipse cx="16.7" cy="12.2" rx="1.05" ry="0.62" fill="${cheek}" opacity=".75"/>` : '';
    const oval = (cx) => `<ellipse cx="${cx}" cy="9.35" rx="1.5" ry="2.02" fill="${eye}"/><circle cx="${cx + 0.5}" cy="8.55" r="0.58" fill="#fff"/><circle cx="${cx - 0.45}" cy="10.35" r="0.26" fill="#fff"/>`;
    switch (kind) {
      case 'happy': return oval(9.7) + oval(14.3) + cheeks + smile;
      case 'wink': return oval(9.7) + `<path d="M12.9 9.6 Q14.3 8.2 15.7 9.6" fill="none" stroke="${eye}" stroke-width="0.85" stroke-linecap="round"/>` + cheeks + smile;
      case 'shades': return `<rect x="6.6" y="7.7" width="10.8" height="3.3" rx="1.5" fill="${eye}"/><path d="M8 8.6 L9.6 8.6 M13.4 8.6 L15 8.6" stroke="#fff" stroke-width="0.5" stroke-linecap="round" opacity=".8"/>` + smile;
      case 'glow': return `<rect x="8.3" y="8" width="2.6" height="3.1" rx="1" fill="${glow}"/><rect x="13.1" y="8" width="2.6" height="3.1" rx="1" fill="${glow}"/><rect x="8.3" y="8" width="2.6" height="3.1" rx="1" fill="${glow}" opacity=".45" transform="scale(1)" style="filter:blur(0.6px)"/><path d="M11 13 H13" stroke="${glow}" stroke-width="0.7" stroke-linecap="round"/>`;
      case 'sleepy': return `<path d="M8.3 9.5 Q9.7 10.9 11.1 9.5 M12.9 9.5 Q14.3 10.9 15.7 9.5" fill="none" stroke="${eye}" stroke-width="0.8" stroke-linecap="round"/>` + cheeks + `<ellipse cx="12" cy="12.9" rx="0.7" ry="0.5" fill="${eye}"/>`;
      case 'squint': return `<path d="M8.4 8.1 L10.6 9.6 L8.4 11.1 M15.6 8.1 L13.4 9.6 L15.6 11.1" fill="none" stroke="${eye}" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round"/>` + cheeks + smile;
      case 'heart': { const h = (cx) => `<path transform="translate(${cx} 9.4)" d="M0 1.6 C-2.4 0 -1.9 -2 -0.8 -2 C-0.3 -2 0 -1.6 0 -1.2 C0 -1.6 0.3 -2 0.8 -2 C1.9 -2 2.4 0 0 1.6 Z" fill="${C.coral}"/>`; return h(9.7) + h(14.3) + smile; }
      case 'stars': { const s = (cx) => `<path transform="translate(${cx} 9.4) scale(.95)" d="M0 -2 L0.55 -0.6 L2 -0.55 L0.85 0.35 L1.25 1.8 L0 0.95 L-1.25 1.8 L-0.85 0.35 L-2 -0.55 L-0.55 -0.6 Z" fill="${C.sun}" stroke="${eye}" stroke-width="0.35" stroke-linejoin="round"/>`; return s(9.7) + s(14.3) + cheeks + smile; }
    }
    return '';
  }

  // A full sticker mascot as an <svg>. `rim` = white die-cut width (0 = no sticker edge).
  function mascot(o = {}) {
    const {
      body = C.grape, line = C.grapeDeep, lineW = 0.9, rim = 2.3, rimColor = '#fff',
      kind = 'happy', eye, cheek = C.coral, acc = 'none', shadow = true, gloss = true,
      size = 200, pattern = null, tilt = 0, extraStyle = '', wave = true,
    } = o;
    const id = nid('m');
    const a = ACC[acc];
    const ARM_DOWN = '<rect x="19.9" y="8.8" width="3.1" height="4.4" rx="1.25" transform="rotate(-10 21.5 9)"/>';
    const B = wave ? BODY : HEAD + ARM_L + ARM_DOWN + FEET;
    const geomAll = B + (a ? a.geom : '');
    const sh = shadow ? `filter="url(#${id}s)"` : '';
    const pat = pattern === 'dots'
      ? `<pattern id="${id}p" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="1.6" height="1.6" fill="${body}"/><circle cx=".8" cy=".8" r=".42" fill="${C.ink}" opacity=".28"/></pattern>`
      : pattern === 'stripes'
      ? `<pattern id="${id}p" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.4" height="2.4" fill="${body}"/><rect width="1.1" height="2.4" fill="#fff" opacity=".35"/></pattern>`
      : '';
    const bodyFill = pattern ? `url(#${id}p)` : body;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3.6 -3.6 31.2 31.2" width="${size}" height="${size}" style="display:block;overflow:visible;transform:rotate(${tilt}deg);${extraStyle}">
  <defs>${pat}
    <filter id="${id}s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="0.55" stdDeviation="0.55" flood-color="#2A1A3D" flood-opacity=".28"/></filter>
    <radialGradient id="${id}g" cx="30%" cy="18%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}c">${HEAD}</clipPath>
  </defs>
  ${rim ? `<g ${sh} fill="${rimColor}" stroke="${rimColor}" stroke-width="${rim * 2}" stroke-linejoin="round">${geomAll}</g>` : ''}
  <g fill="${line}" stroke="${line}" stroke-width="${lineW * 2}" stroke-linejoin="round">${geomAll}</g>
  ${a ? `<g fill="${a.paint}">${a.geom}</g>` : ''}
  <g fill="${bodyFill}">${B}</g>
  ${gloss ? `<g clip-path="url(#${id}c)"><ellipse cx="9" cy="5.6" rx="5.2" ry="2.6" fill="url(#${id}g)"/></g>` : ''}
  ${face(kind, eye || (body === C.ink || body === '#17131F' ? '#fff' : '#1B1030'), cheek)}
</svg>`;
  }

  // ---- App tile (100-unit box): white die-cut rim, coloured face, the mascot as a sticker
  // ON the sticker, and the signature peeling corner bottom-right.
  function tile(o = {}) {
    const { face: faceColor = C.sun, face2 = '#FFC21A', peel = 24, mascotOpts = {}, size = 512, backing = false, small = false } = o;
    const id = nid('t');
    const p = small ? 0 : peel;
    const c = 192 - p; // cut line x + y = c
    const clip = p ? `<clipPath id="${id}k"><polygon points="0,0 100,0 100,${c - 100} ${c - 100},100 0,100"/></clipPath>` : '';
    const ck = p ? `clip-path="url(#${id}k)"` : '';
    const A = [96 - p, 96], B = [96, 96 - p], t = 7.5;
    // The flap: the cut-off corner reflected across the fold, with a rounded tip, so it reads
    // as the sticker's paper back curling toward you.
    const flap = p ? `<path d="M${A[0]} ${A[1]} L${96 - p} ${96 - p + t} Q${96 - p} ${96 - p} ${96 - p + t} ${96 - p} L${B[0]} ${B[1]} Z" fill="url(#${id}f)" filter="url(#${id}fs)"/>
      <path d="M${A[0]} ${A[1]} L${B[0]} ${B[1]}" stroke="#000" stroke-opacity=".08" stroke-width=".6"/>` : '';
    const m = mascot({ size: 100, rim: small ? 0 : 2.0, shadow: !small, gloss: !small, cheek: small ? null : C.coral, ...mascotOpts });
    const inner = m.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const mx = small ? 11 : 13, my = small ? 9 : 10, mw = small ? 78 : 70;
    const backingEl = backing ? `
      <rect x="1.5" y="1.5" width="97" height="97" rx="12" fill="${C.paper}" stroke="#D9C7A8" stroke-width=".8"/>
      <rect x="1.5" y="1.5" width="97" height="97" rx="12" fill="url(#${id}bk)"/>
      <g transform="translate(84.5 84.5)"><circle r="7.2" fill="${C.grape}"/><path d="M0 -3.8 V3.2 M-3 0.4 L0 3.4 L3 0.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block">
  <defs>${clip}
    <linearGradient id="${id}fc" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${faceColor}"/><stop offset="1" stop-color="${face2}"/></linearGradient>
    <linearGradient id="${id}f" x1="${(A[0] + B[0]) / 2}" y1="${(A[1] + B[1]) / 2}" x2="${96 - p}" y2="${96 - p}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#DCD5CA"/><stop offset=".55" stop-color="#F6F2EC"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
    <filter id="${id}fs" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="-1.2" dy="-1.2" stdDeviation="1.6" flood-color="#3B2A12" flood-opacity=".32"/></filter>
    <filter id="${id}ts" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#2A1A3D" flood-opacity=".3"/></filter>
    <pattern id="${id}bk" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="none"/><rect width="0.6" height="4" fill="#C9B48F" opacity=".35"/></pattern>
  </defs>
  ${backingEl}
  <g ${ck}>
    <rect x="4" y="4" width="92" height="92" rx="22" fill="#fff" ${small ? '' : `filter="url(#${id}ts)"`}/>
    <rect x="${small ? 8 : 9.5}" y="${small ? 8 : 9.5}" width="${small ? 84 : 81}" height="${small ? 84 : 81}" rx="${small ? 18 : 17}" fill="url(#${id}fc)"/>
    ${small ? '' : `<path d="M9.5 40 Q 40 30 90.5 12 L90.5 9.5 L9.5 9.5 Z" fill="#fff" opacity=".12"/>`}
    <svg x="${mx}" y="${my}" width="${mw}" height="${mw}" viewBox="-3.6 -3.6 31.2 31.2" overflow="visible">${inner}</svg>
  </g>
  ${flap}
</svg>`;
  }

  // ---- Tray glyphs, drawn ON the pixel grid (16 or 24) so every edge lands on a pixel.
  // Hand-placed pixel grids (16 and 24), one '#' per ink pixel: rounded head (corner pixels
  // knocked out), big low eye holes, a left arm 1px off the head, the waving arm as a stepped
  // diagonal, and two centred feet. Drawn on the grid, never the sticker shrunk.
  const TRAY = { 16: ["................","...............#","....#######...##","...#########..##","...#########.##.","...#########.#..","##.##..#..##....","##.##..#..##....","##.#########....","...#########....","....#######.....","................","....##...##.....","....##...##.....","....##...##.....","................"], 24: ["........................",".....................##.",".....................##.","....................##..",".....##########.....##..","....############...##...","...##############..##...","...##############.##....","...##############.##....","##.###..####..###.......","##.###..####..###.......","##.###..####..###.......","##.##############.......","...##############.......","....############........",".....##########.........","........................",".....###....###.........",".....###....###.........",".....###....###.........",".....###....###.........","........................","........................","........................"] };
  function tray(px, color) {
    let r = '';
    TRAY[px].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" shape-rendering="crispEdges"><g fill="${color}">${r}</g></svg>`;
  }

  // ---- Wordmark: Rubik Black, letters bounced on the baseline, wrapped in a white die-cut
  // edge with an ink keyline. Three stacked copies (rim, keyline, fill) because CSS draws only
  // one stroke per glyph.
  function wordmark(size = 96, o = {}) {
    const { you = C.grape, coded = C.ink, rim = size * 0.16, line = size * 0.0, tilt = -3, shadow = true, rimColor = '#fff' } = o;
    const letters = 'YouCoded'.split('');
    const bounce = [0, -0.035, 0.02, -0.02, 0.03, -0.03, 0.015, -0.025];
    const rot = [-3, 2, -2, 3, -1, 2, -3, 1];
    const span = (fillFn, strokeW, strokeC, extra = '') => `<span style="display:inline-block;${extra}">${letters.map((ch, i) =>
      `<span style="display:inline-block;transform:translateY(${bounce[i] * size}px) rotate(${rot[i]}deg);color:${fillFn(i)};-webkit-text-stroke:${strokeW}px ${strokeC};paint-order:stroke fill;margin-right:${-size * 0.012}px">${ch}</span>`).join('')}</span>`;
    const base = `font:900 ${size}px/1 'Rubik',sans-serif;letter-spacing:-.02em;white-space:nowrap`;
    return `<span style="position:relative;display:inline-block;${base};transform:rotate(${tilt}deg)">
      <span style="position:relative;display:inline-block;${shadow ? 'filter:drop-shadow(0 ' + size * 0.04 + 'px ' + size * 0.05 + 'px rgba(42,26,61,.28))' : ''}">${span(() => rimColor, rim, rimColor)}</span>
      ${line ? `<span style="position:absolute;left:0;top:0">${span(() => C.ink, line, C.ink)}</span>` : ''}
      <span style="position:absolute;left:0;top:0">${span(i => (i < 3 ? you : coded), 0, 'transparent')}</span>
    </span>`;
  }

  // A plain die-cut sticker of any html (badges, labels): white rim + shadow + tilt.
  const badge = (html, { bg = C.sun, fg = C.ink, tilt = -6, r = 999, pad = '10px 18px', font = "800 18px/1 'Rubik'", rim = 6, extra = '' } = {}) =>
    `<span style="display:inline-block;background:${bg};color:${fg};padding:${pad};border-radius:${r}px;font:${font};box-shadow:0 0 0 ${rim}px #fff,0 ${rim / 2 + 3}px ${rim + 8}px rgba(42,26,61,.28);transform:rotate(${tilt}deg);white-space:nowrap;${extra}">${html}</span>`;

  // The paper the whole territory sits on: warm off-white with a fine grain.
  const grain = (op = 0.35) => `<svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none;opacity:${op};mix-blend-mode:multiply"><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 .22 0"/></filter><rect width="100%" height="100%" filter="url(#gr)"/></svg>`;

  root.STK = { C, mascot, tile, tray, wordmark, badge, grain, face, ACC };
})(typeof window !== 'undefined' ? window : globalThis);
