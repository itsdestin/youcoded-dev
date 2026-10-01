// gen.mjs — round-4 character-led app icon concepts (I1–I6).
// Each concept is a 512px vector icon, a deliberately simplified browser-tab version, and a
// one-colour 16px tray glyph drawn on whole pixels. Everything is rasterised at REAL size by
// rsvg-convert so 16/24px are judged as true pixels, never a CSS-shrunk picture.
// The mascot is the app's own (rounded-square head, side arms, two feet — the 24-unit rig body)
// redrawn with fuller lighting.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HERE = new URL('.', import.meta.url).pathname;
const SVG = HERE + 'svg/', PNG = HERE + 'png/';
mkdirSync(SVG, { recursive: true }); mkdirSync(PNG, { recursive: true });
const b64 = (f) => 'data:image/jpeg;base64,' + readFileSync(HERE + f).toString('base64');

// ---------------------------------------------------------------- the mascot
const HEAD = 'M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z';
const LIMB = (x, y, w, h, r) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;

// Gradients for a lit purple body. `light`: 'top' (day) or 'under' (lit from a screen below).
function botDefs(p, light = 'top') {
  const day = light === 'top';
  return `
  <linearGradient id="${p}b" x1="0" y1="0" x2="0" y2="1">
    ${day ? '<stop offset="0" stop-color="#B57AE4"/><stop offset=".5" stop-color="#8B47B8"/><stop offset="1" stop-color="#5C2689"/>'
          : '<stop offset="0" stop-color="#3A1A58"/><stop offset=".55" stop-color="#6A34A0"/><stop offset="1" stop-color="#A45BD8"/>'}
  </linearGradient>
  <radialGradient id="${p}h" cx=".3" cy=".18" r=".75">
    <stop offset="0" stop-color="#fff" stop-opacity="${day ? .5 : .12}"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${p}r" x1="0" y1="0" x2="0" y2="1">
    <stop offset=".62" stop-color="${day ? '#FF9BD6' : '#FFB36B'}" stop-opacity="0"/>
    <stop offset="1" stop-color="${day ? '#FF9BD6' : '#FFB36B'}" stop-opacity="${day ? .42 : .75}"/>
  </linearGradient>
  <linearGradient id="${p}l" x1="0" y1="0" x2="0" y2="1">
    ${day ? '<stop offset="0" stop-color="#A766D6"/><stop offset="1" stop-color="#6A2F9C"/>'
          : '<stop offset="0" stop-color="#4A2370"/><stop offset="1" stop-color="#B068E0"/>'}
  </linearGradient>`;
}

// The head with face. `look` shifts the pupils' sparkle; `big` scales the eyes up for small sizes.
function head(p, { blush = true, big = 1, mouth = true, eyeY = 0 } = {}) {
  const ex = 1.55 * big, ey = 2.15 * big;
  const eye = (cx, cy) => `<ellipse cx="${cx}" cy="${cy + eyeY}" rx="${ex}" ry="${ey}" fill="#23102F"/>
    <circle cx="${cx + .55 * big}" cy="${cy + eyeY - .7 * big}" r="${.42 * big}" fill="#fff"/>
    <circle cx="${cx - .35 * big}" cy="${cy + eyeY + .65 * big}" r="${.2 * big}" fill="#fff" fill-opacity=".75"/>`;
  return `<path d="${HEAD}" fill="url(#${p}b)" stroke="#3E1758" stroke-width=".55" stroke-linejoin="round"/>
    <path d="${HEAD}" fill="url(#${p}r)"/><path d="${HEAD}" fill="url(#${p}h)"/>
    <ellipse cx="9.4" cy="6" rx="3" ry="1.2" fill="#fff" fill-opacity=".38" transform="rotate(-12 9.4 6)"/>
    ${eye(9.4, 9.7)}${eye(14.6, 9.7)}
    ${blush ? `<ellipse cx="7.6" cy="12.5" rx="1.1" ry=".6" fill="#FF8FCB" fill-opacity=".55"/><ellipse cx="16.4" cy="12.5" rx="1.1" ry=".6" fill="#FF8FCB" fill-opacity=".55"/>` : ''}
    ${mouth ? `<path d="M10.9 13 Q12 14.3 13.1 13" fill="none" stroke="#23102F" stroke-width=".55" stroke-linecap="round"/>` : ''}`;
}
const limbs = (p, parts) => `<g fill="url(#${p}l)" stroke="#3E1758" stroke-width=".55">${parts}</g>`;
const ARM_L = LIMB(1, 9, 3, 4, .9), ARM_R = LIMB(20, 9, 3, 4, .9);
const ARM_R_WAVE = `<g transform="rotate(-150 21.5 9.4)">${LIMB(20, 9, 3, 4, .9)}</g>`;
const ARM_L_UP = `<g transform="rotate(150 2.5 9.4)">${LIMB(1, 9, 3, 4, .9)}</g>`;
const FEET = LIMB(7.2, 16.6, 3.5, 4.2, 1.2) + LIMB(13.3, 16.6, 3.5, 4.2, 1.2);
// Full standing bot, waving.
const bot = (p, o = {}) => `${limbs(p, ARM_L + (o.cheer ? ARM_R_WAVE.replace('-150', '-150') : ARM_R_WAVE) + (o.cheer ? '' : '') + FEET)}${o.cheer ? limbs(p, ARM_L_UP) : ''}${head(p, o)}`;

const tileClip = (id, r = 115) => `<clipPath id="${id}"><rect width="512" height="512" rx="${r}"/></clipPath>`;
const svg = (defs, body, vb = '0 0 512 512') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="512" height="512"><defs>${defs}</defs>${body}</svg>`;
const blur = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

// ---------------------------------------------------------------- tray glyphs (16x16 pixel grids)
// '#' = ink. Drawn by hand on whole pixels so the clock-area icon is crisp by construction.
const grid = (rows) => {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return r;
};
const traySvg = (rows) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><g fill="#000">${grid(rows)}</g></svg>`;
const TRAY = {
  // I1: the face fills the glyph
  i1: ['............##..', '...........##...', '..##########....', '.############...', '.############...', '.##..####..##...', '.##..####..##...', '.##..####..##...', '.############...', '.#####..#####...', '.######.#####...', '..##########....', '................', '...###..###.....', '...###..###.....', '................'],
  // I2: bot leaning on a window ledge
  i2: ['..############..', '..#..........#..', '..#..######..#..', '..#.########.#..', '..#.#..##..#.#..', '..#.#..##..#.#..', '..#.########.#..', '..##########.#..', '################', '################', '................', '................', '................', '................', '................', '................'],
  // I3: eyes peeking over an edge, two hands gripping
  i3: ['................', '................', '...##########...', '..############..', '..###..##..###..', '..###..##..###..', '.##############.', '###.##########.#', '################', '################', '################', '################', '################', '################', '################', '................'],
  // I4: bot on a cloud
  i4: ['....########....', '...##########...', '...##..##..##...', '.#.##..##..##.#.', '.#.##########.#.', '...##########...', '....##....##....', '....##....##....', '................', '...###..####....', '.##############.', '################', '################', '.##############.', '................', '................'],
  // I5: glowing face (outline style with lit lower half)
  i5: ['................', '..############..', '.##############.', '.##..######..##.', '.##..######..##.', '.##############.', '.#####....#####.', '.##############.', '..############..', '................', '.#.##########.#.', '...#........#...', '...##########...', '................', '................', '................'],
  // I6: cheering, both arms up
  i6: ['.##..........##.', '.##..........##.', '..##........##..', '...##########...', '..############..', '..###..##..###..', '..###..##..###..', '..############..', '..####....####..', '..############..', '...##########...', '................', '....###..###....', '....###..###....', '................', '................'],
};

// ---------------------------------------------------------------- concepts
const C = {};

// I1 — the head IS the icon. The tile is the mascot's own rounded-square head; a little arm
// waves off the top-right corner and two feet stand under the bottom edge.
C.i1 = {
  label: 'The head is the icon',
  note: 'The whole icon is the mascot\'s face — its square head is already the shape of an app icon — with a little arm waving off the corner.',
  icon: () => {
    const p = 'a';
    // head geometry scaled up: 24-unit head (14x12) mapped to ~452 x 388
    return svg(botDefs(p) + blur('sh', 10), `
      <ellipse cx="248" cy="490" rx="150" ry="14" fill="#3E1758" opacity=".28" filter="url(#sh)"/>
      <g transform="translate(-60 -78) scale(29)">
        ${limbs(p, LIMB(7.2, 15.2, 3.5, 3.6, 1.2) + LIMB(13.3, 15.2, 3.5, 3.6, 1.2))}
        <g transform="rotate(-38 18.4 6.4)">${limbs(p, LIMB(17.4, 2.6, 2.6, 3.4, .9))}</g>
        ${head(p, { big: 1.12, eyeY: .2 })}
      </g>`);
  },
  tab: () => svg(botDefs('t'), `<g transform="translate(-96 -96) scale(34.1)"><path d="${HEAD}" fill="url(#tb)" stroke="#3E1758" stroke-width=".6"/>
     <ellipse cx="9.5" cy="10" rx="1.9" ry="2.6" fill="#23102F"/><ellipse cx="14.5" cy="10" rx="1.9" ry="2.6" fill="#23102F"/>
     <circle cx="10.1" cy="9.1" r=".6" fill="#fff"/><circle cx="15.1" cy="9.1" r=".6" fill="#fff"/></g>`),
};

// I2 — window to your world. A glass window frame onto the Cotton Candy sky; the mascot leans
// out over the bottom sill, arms resting on (in front of) the frame, one waving.
C.i2 = {
  label: 'Window to your world',
  note: 'The icon is a window onto your theme\'s world; the mascot leans out over the sill to say hi, and the view changes with your theme.',
  themes: ['sky.jpg', 'golden-sunbreak.jpg', 'strawberry-kitty.jpg', 'meadow-mist.jpg'],
  icon: (wall = 'sky.jpg') => {
    const p = 'w';
    return svg(botDefs(p) + tileClip('tc') + blur('sh', 8) + `
      <linearGradient id="fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4D0F2"/></linearGradient>
      <linearGradient id="sill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#EBDDF6"/><stop offset="1" stop-color="#C9A9E2"/></linearGradient>
      <clipPath id="pane"><rect x="44" y="44" width="424" height="380" rx="78"/></clipPath>`, `
      <g clip-path="url(#tc)">
        <rect width="512" height="512" fill="url(#fr)"/>
        <g clip-path="url(#pane)"><image href="${b64(wall)}" x="-200" y="0" width="900" height="507" preserveAspectRatio="xMidYMid slice"/>
          <rect x="44" y="44" width="424" height="380" fill="#fff" opacity=".06"/>
          <g transform="translate(28 112) scale(19)">${head(p)}</g>
        </g>
        <rect x="44" y="44" width="424" height="380" rx="78" fill="none" stroke="#B691D4" stroke-width="3" opacity=".7"/>
        <ellipse cx="256" cy="404" rx="170" ry="12" fill="#3E1758" opacity=".35" filter="url(#sh)"/>
        <rect x="0" y="400" width="512" height="112" fill="url(#sill)"/>
        <rect x="0" y="400" width="512" height="4" fill="#fff"/>
      </g>
      <g transform="translate(28 112) scale(19)">
        ${limbs(p, LIMB(4.2, 14.4, 5, 2.6, 1.1) + LIMB(14.8, 14.4, 5, 2.6, 1.1))}
        <g transform="rotate(-28 20.2 8.6)">${limbs(p, LIMB(19.3, 4.4, 3, 4, .9))}</g>
      </g>`);
  },
  tab: () => svg(botDefs('t') + `<clipPath id="c"><rect width="512" height="512" rx="120"/></clipPath>`, `<g clip-path="url(#c)"><image href="${b64('sky.jpg')}" x="-260" y="-20" width="1000" height="563" preserveAspectRatio="xMidYMid slice"/>
     <g transform="translate(-50 40) scale(25.5)"><path d="${HEAD}" fill="url(#tb)" stroke="#3E1758" stroke-width=".6"/>
     <ellipse cx="9.6" cy="10" rx="1.8" ry="2.5" fill="#23102F"/><ellipse cx="14.4" cy="10" rx="1.8" ry="2.5" fill="#23102F"/></g>
     <rect y="430" width="512" height="82" fill="#fff"/></g>`),
};

// I3 — peekaboo. The tile is a rich purple→pink slab; the mascot hides behind it, eyes
// peeking over the top edge, two hands gripping the edge IN FRONT of the slab.
C.i3 = {
  label: 'Peekaboo',
  note: 'The mascot is hiding behind the icon, peeking over the top with both hands gripping the edge — playful and still clear when tiny.',
  icon: () => {
    const p = 'k';
    return svg(botDefs(p) + blur('sh', 6) + `
      <linearGradient id="slab" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F6ECFB"/><stop offset="1" stop-color="#E6D2F2"/></linearGradient><clipPath id="slabc"><rect x="0" y="198" width="512" height="314" rx="104"/></clipPath>
      <radialGradient id="glow" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#FFB3E2" stop-opacity=".7"/><stop offset=".6" stop-color="#FFB3E2" stop-opacity="0"/></radialGradient>
      <clipPath id="above"><rect x="0" y="0" width="512" height="222"/></clipPath>`, `
      <g clip-path="url(#above)"><g transform="translate(-32 -40) scale(24)">${head(p, { blush: false, mouth: false, big: 1.05, eyeY: -.4 })}</g></g>
      <g clip-path="url(#slabc)"><image href="${b64('sky.jpg')}" x="-240" y="120" width="1000" height="563" preserveAspectRatio="xMidYMid slice" opacity=".55"/></g>
      <rect x="0" y="198" width="512" height="314" rx="104" fill="url(#slab)" opacity=".86"/>
      <rect x="1.5" y="199.5" width="509" height="311" rx="103" fill="none" stroke="#C9A6E4" stroke-width="3"/>
      <rect x="40" y="206" width="432" height="5" rx="2.5" fill="#fff" opacity=".9"/>
      <g fill="#B98AD6" opacity=".55"><rect x="96" y="330" width="230" height="22" rx="11"/><rect x="96" y="372" width="320" height="22" rx="11"/><rect x="96" y="414" width="180" height="22" rx="11"/></g>
      <ellipse cx="130" cy="252" rx="52" ry="12" fill="#5A2A86" opacity=".4" filter="url(#sh)"/>
      <ellipse cx="382" cy="252" rx="52" ry="12" fill="#5A2A86" opacity=".4" filter="url(#sh)"/>
      <g transform="translate(-32 -40) scale(24)">${limbs(p, LIMB(5.4, 9.4, 4, 3, 1.3) + LIMB(14.6, 9.4, 4, 3, 1.3))}
        <g fill="#3E1758" opacity=".55"><rect x="6.7" y="9.9" width=".3" height="1.4" rx=".15"/><rect x="7.7" y="9.9" width=".3" height="1.4" rx=".15"/><rect x="16" y="9.9" width=".3" height="1.4" rx=".15"/><rect x="17" y="9.9" width=".3" height="1.4" rx=".15"/></g></g>
      <text x="256" y="420" text-anchor="middle" font-family="DM Sans, sans-serif" font-weight="800" font-size="0" fill="#fff"></text>`);
  },
  tab: () => svg(botDefs('t') + `<linearGradient id="slab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3CCF2"/></linearGradient><clipPath id="ab"><rect width="512" height="240"/></clipPath>`,
    `<g clip-path="url(#ab)"><g transform="translate(-30 -10) scale(23.8)"><path d="${HEAD}" fill="url(#tb)" stroke="#3E1758" stroke-width=".6"/>
     <ellipse cx="9.6" cy="8.6" rx="1.9" ry="2.4" fill="#23102F"/><ellipse cx="14.4" cy="8.6" rx="1.9" ry="2.4" fill="#23102F"/></g></g>
     <rect y="230" width="512" height="282" rx="110" fill="url(#slab)" stroke="#B48ADB" stroke-width="16"/>`),
};

// I4 — floating island. Soft dawn-gradient tile, a puffy cloud, the mascot standing on it
// waving, with a contact shadow and a couple of sparkles.
const cloud = (fill, stroke) => `<g fill="${fill}" stroke="${stroke}" stroke-width="5">
  <path d="M86 410 C60 410 52 372 80 360 C76 326 118 310 140 330 C150 292 210 286 228 318 C246 290 300 292 312 326 C334 306 380 314 380 348 C414 342 434 380 410 402 C404 408 396 410 388 410 Z"/></g>`;
C.i4 = {
  label: 'On a cloud',
  note: 'The mascot stands waving on a soft cloud in the Cotton Candy dawn colours — the website\'s sky turned into a little scene.',
  icon: () => {
    const p = 'c';
    return svg(botDefs(p) + tileClip('tc') + blur('sh', 7) + blur('sh2', 30) + `
      <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C6BE0"/><stop offset=".55" stop-color="#D99BE6"/><stop offset="1" stop-color="#FFC9DE"/></linearGradient>
      <radialGradient id="sun" cx=".72" cy=".26" r=".3"><stop offset="0" stop-color="#FFF4E0" stop-opacity=".95"/><stop offset="1" stop-color="#FFF4E0" stop-opacity="0"/></radialGradient>
      <linearGradient id="cloudg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1DDF5"/></linearGradient>`, `
      <g clip-path="url(#tc)">
        <rect width="512" height="512" fill="url(#dawn)"/><rect width="512" height="512" fill="url(#sun)"/>
        <g opacity=".5" fill="#fff"><ellipse cx="70" cy="140" rx="60" ry="14"/><ellipse cx="450" cy="210" rx="70" ry="12"/></g>
        <g fill="#fff"><path d="M420 92 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z"/><path d="M96 230 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" opacity=".85"/></g>
        <g transform="translate(16 440)" opacity=".35" filter="url(#sh2)"><rect x="40" width="400" height="40" rx="20" fill="#6A2F9C"/></g>
        ${cloud('url(#cloudg)', '#E2C6EE')}
        <ellipse cx="244" cy="352" rx="70" ry="10" fill="#7A4AA6" opacity=".38" filter="url(#sh)"/>
        <g transform="translate(86 68) scale(13.6)">${bot(p)}</g>
      </g>`);
  },
  tab: () => svg(botDefs('t') + `<linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C6BE0"/><stop offset="1" stop-color="#FFC0DA"/></linearGradient><clipPath id="c"><rect width="512" height="512" rx="120"/></clipPath>`,
    `<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#dawn)"/><ellipse cx="256" cy="470" rx="300" ry="90" fill="#fff"/>
     <g transform="translate(-48 -40) scale(25.4)"><path d="${HEAD}" fill="url(#tb)" stroke="#3E1758" stroke-width=".6"/>
     <ellipse cx="9.6" cy="10" rx="1.8" ry="2.5" fill="#23102F"/><ellipse cx="14.4" cy="10" rx="1.8" ry="2.5" fill="#23102F"/></g></g>`),
};

// I5 — night glow. A deep night tile; the mascot looks down at a small glowing screen it holds,
// lit warm from below with a purple-pink rim, stars behind.
C.i5 = {
  label: 'Night glow',
  note: 'Late at night, the mascot is lit up by the little screen in its hands — warm, cosy, and it pops on a dark taskbar.',
  icon: () => {
    const p = 'n';
    return svg(botDefs(p, 'under') + tileClip('tc') + blur('sh', 22) + blur('g2', 40) + `
      <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1033"/><stop offset=".7" stop-color="#2E1650"/><stop offset="1" stop-color="#4A1F66"/></linearGradient>
      <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFC27A" stop-opacity=".95"/><stop offset=".45" stop-color="#FF8FC6" stop-opacity=".55"/><stop offset="1" stop-color="#FF8FC6" stop-opacity="0"/></radialGradient>
      <linearGradient id="scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6E6"/><stop offset="1" stop-color="#FFD39A"/></linearGradient>
      <filter id="halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".9"/></filter><linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF7AC8"/><stop offset="1" stop-color="#9F7BFF"/></linearGradient>`, `
      <g clip-path="url(#tc)">
        <rect width="512" height="512" fill="url(#night)"/>
        <g fill="#fff"><circle cx="70" cy="80" r="3"/><circle cx="430" cy="70" r="4"/><circle cx="380" cy="140" r="2.2"/><circle cx="110" cy="170" r="2"/><circle cx="460" cy="250" r="2.5"/><circle cx="40" cy="290" r="2"/>
          <path d="M410 100 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" opacity=".8"/></g>
        <ellipse cx="256" cy="430" rx="230" ry="130" fill="url(#pool)" filter="url(#g2)"/>
        <g transform="translate(64 48) scale(16)">
          <path d="${HEAD}" fill="none" stroke="#FF8FCB" stroke-width="2.2" opacity=".35" filter="url(#halo)"/>
          ${limbs(p, FEET)}
          ${head(p, { eyeY: .9, mouth: false, blush: true })}
          <path d="M10.9 13.7 Q12 14.6 13.1 13.7" fill="none" stroke="#23102F" stroke-width=".5" stroke-linecap="round"/>
          <rect x="7.6" y="14.2" width="8.8" height="5.4" rx="1" fill="#2B1840" stroke="#3E1758" stroke-width=".4"/>
          <rect x="8.2" y="14.7" width="7.6" height="4.3" rx=".6" fill="url(#scr)"/>
          <rect x="9" y="15.6" width="4.2" height=".55" rx=".27" fill="#C98B4A" opacity=".55"/><rect x="9" y="16.6" width="5.6" height=".55" rx=".27" fill="#C98B4A" opacity=".45"/>
          ${limbs(p, LIMB(5.4, 14.6, 3, 3.6, 1) + LIMB(15.6, 14.6, 3, 3.6, 1))}
        </g>
      </g>`);
  },
  tab: () => svg(botDefs('t', 'under') + `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1033"/><stop offset="1" stop-color="#4A1F66"/></linearGradient>
     <radialGradient id="pool" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#FFC27A"/><stop offset="1" stop-color="#FFC27A" stop-opacity="0"/></radialGradient><clipPath id="c"><rect width="512" height="512" rx="120"/></clipPath>`,
    `<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#night)"/><rect width="512" height="512" fill="url(#pool)" opacity=".8"/>
     <g transform="translate(-48 -60) scale(25.4)"><path d="${HEAD}" fill="url(#tb)" stroke="#3E1758" stroke-width=".5"/>
     <ellipse cx="9.6" cy="10.4" rx="1.8" ry="2.4" fill="#120820"/><ellipse cx="14.4" cy="10.4" rx="1.8" ry="2.4" fill="#120820"/></g></g>`),
};

// I6 — hooray. The mascot jumps with both arms up (its silhouette reads almost like a "Y"),
// on a purple→pink burst with confetti — the moment a task is done.
C.i6 = {
  label: 'Hooray',
  note: 'The mascot jumps with both arms up — the "done it!" moment — and its arms-up shape doubles as a Y for YouCoded.',
  icon: () => {
    const p = 'y';
    const rays = Array.from({ length: 16 }, (_, i) => `<path d="M256 250 L${256 + 520 * Math.cos((i + .5) * Math.PI / 8 - .08)} ${250 + 520 * Math.sin((i + .5) * Math.PI / 8 - .08)} L${256 + 520 * Math.cos((i + .5) * Math.PI / 8 + .08)} ${250 + 520 * Math.sin((i + .5) * Math.PI / 8 + .08)} Z"/>`).join('');
    return svg(botDefs(p) + tileClip('tc') + blur('sh', 8) + `
      <radialGradient id="burst" cx=".5" cy=".46" r=".7"><stop offset="0" stop-color="#FF9CD2"/><stop offset=".5" stop-color="#B061DA"/><stop offset="1" stop-color="#6A2B9E"/></radialGradient>`, `
      <g clip-path="url(#tc)">
        <rect width="512" height="512" fill="url(#burst)"/>
        <g fill="#fff" opacity=".1">${rays}</g>
        <g><rect x="74" y="96" width="18" height="10" rx="3" fill="#FFD84A" transform="rotate(-25 83 101)"/><rect x="420" y="120" width="18" height="10" rx="3" fill="#7CE3C3" transform="rotate(30 429 125)"/>
          <rect x="400" y="350" width="16" height="9" rx="3" fill="#FFD84A" transform="rotate(50 408 354)"/><rect x="88" y="330" width="16" height="9" rx="3" fill="#fff" transform="rotate(-40 96 334)"/>
          <circle cx="130" cy="210" r="7" fill="#7CE3C3"/><circle cx="390" cy="230" r="6" fill="#fff"/><circle cx="350" cy="80" r="5" fill="#FFD84A"/></g>
        <ellipse cx="256" cy="470" rx="96" ry="12" fill="#3E1758" opacity=".35" filter="url(#sh)"/>
        <g transform="translate(64 64) scale(16)">
          ${limbs(p, `<g transform="translate(1.2 0) rotate(156 2.6 9.6)">${LIMB(1, 9, 3, 4.4, .9)}</g><g transform="translate(-1.2 0) rotate(-156 21.4 9.6)">${LIMB(20, 9, 3, 4.4, .9)}</g>` + LIMB(7.4, 16.4, 3.4, 3.6, 1.2) + LIMB(13.2, 16.4, 3.4, 3.6, 1.2))}
          ${head(p, { big: .95 })}
          <path d="M9.4 12.6 Q12 15.6 14.6 12.6 Z" fill="#23102F"/><path d="M10.6 13.9 Q12 14.8 13.4 13.9 Q12 15 10.6 13.9Z" fill="#FF8FCB"/>
        </g>
      </g>`.replace(/<path d="M10.9 13 Q12 14.3 13.1 13"[^>]*\/>/, ''));
  },
  tab: () => svg(botDefs('t') + `<radialGradient id="burst" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#E77FCF"/><stop offset="1" stop-color="#6A2B9E"/></radialGradient><clipPath id="c"><rect width="512" height="512" rx="120"/></clipPath>`,
    `<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#burst)"/>
     <g transform="translate(16 58) scale(20)" fill="#fff"><g transform="rotate(156 2.6 9.6)"><rect x=".6" y="8.6" width="3.8" height="5" rx="1.2"/></g><g transform="rotate(-156 21.4 9.6)"><rect x="19.6" y="8.6" width="3.8" height="5" rx="1.2"/></g>
     <path d="${HEAD}"/><ellipse cx="9.6" cy="10" rx="1.6" ry="2.2" fill="#4A1F66"/><ellipse cx="14.4" cy="10" rx="1.6" ry="2.2" fill="#4A1F66"/></g></g>`),
};

// ---------------------------------------------------------------- write + rasterise
const r = (src, out, px) => execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), src, '-o', out]);
const out = [];
for (const [id, c] of Object.entries(C)) {
  writeFileSync(`${SVG}${id}.svg`, c.icon());
  for (const px of [512, 256, 128, 64, 32, 24, 16]) r(`${SVG}${id}.svg`, `${PNG}${id}-${px}.png`, px);
  writeFileSync(`${SVG}${id}-tab.svg`, c.tab());
  for (const px of [64, 32, 16]) r(`${SVG}${id}-tab.svg`, `${PNG}${id}-tab-${px}.png`, px);
  writeFileSync(`${SVG}${id}-tray.svg`, traySvg(TRAY[id]));
  writeFileSync(`${SVG}${id}-tray-w.svg`, traySvg(TRAY[id]).replace('fill="#000"', 'fill="#fff"'));
  r(`${SVG}${id}-tray.svg`, `${PNG}${id}-tray-16.png`, 16); r(`${SVG}${id}-tray-w.svg`, `${PNG}${id}-tray-w-16.png`, 16);
  if (c.themes) c.themes.forEach((w, i) => { writeFileSync(`${SVG}${id}-th${i}.svg`, c.icon(w)); r(`${SVG}${id}-th${i}.svg`, `${PNG}${id}-th${i}-256.png`, 256); });
  out.push({ id, label: c.label, note: c.note, themes: c.themes ? c.themes.length : 0 });
}
writeFileSync(HERE + 'options.json', JSON.stringify(out, null, 1));
console.log('ok', out.map(o => o.id).join(' '));
// The cards read this (classic script; file:// pages cannot fetch JSON).
writeFileSync(HERE + 'data.js', 'window.OPTS = ' + JSON.stringify(out) + ';');
