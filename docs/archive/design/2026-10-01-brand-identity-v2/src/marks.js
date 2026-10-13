// marks.js — every name style, app icon and installer icon in this round, as SVG strings.
// WHY one file: the same drawing has to appear big, in a site header, on a taskbar and in a
// browser tab; drawing it once and placing it everywhere means the small versions are the
// real thing shrunk, not a separate idealised picture.

// ---------- the mascot, on its own 24-unit grid (same numbers as the app's rig) ----------
// body x5–19 y4–16, arms 3×4 beside it, legs 3.5×4 below. Keeping the real proportions is
// what makes every mark read as THIS character rather than a generic blob.
const BODY = 'M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z';
const SQUINT = 'M8.5 8 L10.5 10 L8.5 12 L9.5 12 L11.5 10 L9.5 8 Z M15.5 8 L13.5 10 L15.5 12 L14.5 12 L12.5 10 L14.5 8 Z';
const ARM_L = '<rect x="1" y="9" width="3" height="4" rx="0.8"/>';
const ARM_R = '<rect x="20" y="9" width="3" height="4" rx="0.8"/>';
const ARM_WAVE = '<rect x="20" y="9" width="3" height="4" rx="0.8" transform="rotate(-150 21.5 9.4)"/>';
const LEGS = '<rect x="7.2" y="17" width="3.5" height="4" rx="1.2"/><rect x="13.3" y="17" width="3.5" height="4" rx="1.2"/>';

// A solid buddy. face: 'cut' knocks the squint out (see-through), 'ink' paints it in faceColor.
function buddy({ fill = '#8B47B8', face = 'ink', faceColor = '#fff', wave = false, legs = true, arms = true } = {}) {
  const body = face === 'cut'
    ? `<path fill-rule="evenodd" d="${BODY} ${SQUINT}"/>`
    : `<path d="${BODY}"/>` + (face === 'ink' ? `<path d="${SQUINT}" fill="${faceColor}"/>` : '');
  return `<g fill="${fill}">${arms ? ARM_L + (wave ? ARM_WAVE : ARM_R) : ''}${legs ? LEGS : ''}${body}</g>`;
}

// Mix a #rrggbb colour toward white by t (0–1). SVG gradient stops can't use color-mix().
const lighten = (hex, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 255 * t).toString(16).padStart(2, '0')).join('');

// ---------- palette (Cotton Candy Sky, the site's own theme) ----------
const C = { purple: '#8B47B8', deep: '#4A1F66', ink: '#21152C', night: '#1B1128', lav: '#ECDDF0', pink: '#E2679A', canvas: '#FBF5FC' };

// =====================================================================================
// NAME STYLES
// =====================================================================================

// N1 — letters built from the mascot's body. Every round letter is the body's rounded
// square; the stroke is as thick as the mascot's legs are wide. Drawn by hand as paths
// (centre-lines, stroked) because no font has these shapes.
function squircleWord({ you = C.purple, coded = C.ink, grad = true, id = 'n1' } = {}) {
  const s = 26, w = 92, g = 16, r = 26, h0 = s / 2, h1 = 100 - s / 2; // x-height 100
  const L = (x) => ({
    o: `M${x + h0 + r} ${h0} H${x + w - h0 - r} A${r} ${r} 0 0 1 ${x + w - h0} ${h0 + r} V${h1 - r} A${r} ${r} 0 0 1 ${x + w - h0 - r} ${h1} H${x + h0 + r} A${r} ${r} 0 0 1 ${x + h0} ${h1 - r} V${h0 + r} A${r} ${r} 0 0 1 ${x + h0 + r} ${h0} Z`,
    c: `M${x + w - h0 + 2} ${h0} H${x + h0 + r} A${r} ${r} 0 0 0 ${x + h0} ${h0 + r} V${h1 - r} A${r} ${r} 0 0 0 ${x + h0 + r} ${h1} H${x + w - h0 + 2}`,
    e: `M${x + h0} 52 H${x + w - h0} V${h0 + r} A${r} ${r} 0 0 0 ${x + w - h0 - r} ${h0} H${x + h0 + r} A${r} ${r} 0 0 0 ${x + h0} ${h0 + r} V${h1 - r} A${r} ${r} 0 0 0 ${x + h0 + r} ${h1} H${x + w - h0 + 2}`,
    u: `M${x + h0} ${h0 - 13} V${h1 - r} A${r} ${r} 0 0 0 ${x + h0 + r} ${h1} H${x + w - h0} M${x + w - h0} ${h0 - 13} V${h1 + 13}`,
    d: `M${x + w - h0} ${h1} H${x + h0 + r} A${r} ${r} 0 0 1 ${x + h0} ${h1 - r} V${h0 + r} A${r} ${r} 0 0 1 ${x + h0 + r} ${h0} H${x + w - h0} M${x + w - h0} -62 V${h1 + 13}`,
    y: `M${x + h0} ${h0 - 13} V${h1 - r} A${r} ${r} 0 0 0 ${x + h0 + r} ${h1} H${x + w - h0} M${x + w - h0} ${h0 - 13} V${h1 + 50 - r} A${r} ${r} 0 0 1 ${x + w - h0 - r} ${h1 + 50} H${x + h0 - 2}`,
  });
  const word = 'youcoded'; let x = 0, pYou = '', rest = '';
  [...word].forEach((ch, i) => { const p = L(x)[ch]; (i < 3 ? (pYou += p + ' ') : (rest += p + ' ')); x += w + g; });
  const W = x - g;
  const fillYou = grad ? `url(#${id}g)` : you;
  return { w: W, h: 250, svg: (H) => `<svg viewBox="-14 -76 ${W + 28} 254" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="${you}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient></defs>
    <g fill="none" stroke-width="${s}" stroke-linecap="butt" stroke-linejoin="round">
      <path d="${pYou}" stroke="${fillYou}"/><path d="${rest}" stroke="${coded}"/></g></svg>` };
}

// N3 — the cursor. Typed in the site's own label font, ending in the block cursor from the
// old ">YC█" logo — except the cursor has the mascot's legs. On the site it blinks and hops.
function cursorWord({ ink = C.ink, accent = C.purple, size = 64, face = true }) {
  const bw = size * 0.56, bh = size * 0.78; // block cursor
  return `<span class="cw" style="--s:${size}px;color:${ink}"><span class="cw-p" style="color:${accent}">&gt;</span>youcoded<svg class="cw-b" width="${bw}" height="${bh * 1.18}" viewBox="0 0 14 19.5"><g fill="${accent}"><rect x="0" y="0" width="14" height="16" rx="2.6"/><rect x="2" y="16.6" width="3.6" height="2.9" rx="1"/><rect x="8.4" y="16.6" width="3.6" height="2.9" rx="1"/></g>${face ? `<path d="M3.6 6 L5.8 8 L3.6 10 L4.6 10 L6.8 8 L4.6 6 Z M10.4 6 L8.2 8 L10.4 10 L9.4 10 L7.2 8 L9.4 6 Z" transform="translate(0 0.4)" fill="#fff"/>` : ''}</svg></span>`;
}

// N4 — the sticker, with the "o" that stands. Chunky lowercase (your W6 pick); the first "o"
// is the mascot's body at exactly a letter's weight, face in its hole, legs dropping below the
// line the way a "y" tail does — a letter first, a character second.
function stickerWord({ fill = C.purple, size = 120 }) {
  // The "o" is drawn on a 20-wide grid: x-height box 0–20, legs hang to 25 (Baloo's descender).
  const o = size * 0.505;
  return `<span class="sw" style="--s:${size}px;--f:${fill}">y<svg class="sw-o" viewBox="0 0 20 25.5" width="${o}" height="${o * 25.5 / 20}"><g fill="${fill}"><path fill-rule="evenodd" d="M7 0 H13 A7 7 0 0 1 20 7 V13 A7 7 0 0 1 13 20 H7 A7 7 0 0 1 0 13 V7 A7 7 0 0 1 7 0 Z M7.4 4.4 H12.6 A3.6 3.6 0 0 1 16.2 8 V12 A3.6 3.6 0 0 1 12.6 15.6 H7.4 A3.6 3.6 0 0 1 3.8 12 V8 A3.6 3.6 0 0 1 7.4 4.4 Z"/><path d="M5.5 8.4 L7.4 10 L5.5 11.6 M14.5 8.4 L12.6 10 L14.5 11.6" fill="none" stroke="${fill}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.2" y="21" width="4.2" height="4.5" rx="1.5"/><rect x="11.6" y="21" width="4.2" height="4.5" rx="1.5"/></g></svg>ucoded</span>`;
}

// N6 — the name is the body. "you / coded" set tight in two lines inside the mascot's
// outline, arms and legs outside it: a badge that is both the name and the character.
function bodyBadge({ fill = C.purple, ink = '#fff', h = 120 }) {
  return `<svg viewBox="0 0 132 108" height="${h}" xmlns="http://www.w3.org/2000/svg"><g fill="${fill}">
    <rect x="0" y="34" width="11" height="22" rx="4"/><rect x="121" y="34" width="11" height="22" rx="4" transform="rotate(-140 121 38)"/>
    <rect x="15" y="0" width="102" height="86" rx="26"/>
    <rect x="34" y="90" width="20" height="18" rx="6"/><rect x="78" y="90" width="20" height="18" rx="6"/></g>
    <text x="66" y="40" text-anchor="middle" font-family="DM Sans" font-weight="900" font-size="32" letter-spacing="-1.4" fill="${ink}">you</text>
    <text x="66" y="70" text-anchor="middle" font-family="DM Sans" font-weight="900" font-size="32" letter-spacing="-1.4" fill="${ink}">coded</text></svg>`;
}

// =====================================================================================
// APP ICONS — each returns an SVG for a square canvas of `px`. `small` swaps in the hand-
// simplified drawing used at 16–24px (browser tab, taskbar), where detail turns to mud.
// =====================================================================================
const SQ = (n) => `M${n * .22} 0 H${n * .78} C${n * .95} 0 ${n} ${n * .05} ${n} ${n * .22} V${n * .78} C${n} ${n * .95} ${n * .95} ${n} ${n * .78} ${n} H${n * .22} C${n * .05} ${n} 0 ${n * .95} 0 ${n * .78} V${n * .22} C0 ${n * .05} ${n * .05} 0 ${n * .22} 0 Z`;

const ICONS = {
  // I1 — your wallpaper, our shape. The tile shows whatever theme you're on; the mascot is a
  // dark cut-out standing in front of it. The shape never changes, the scenery always does.
  i1: ({ px, wall = 'walls/cotton-candy-sky.jpg', small = false, uid = 'a' }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="c${uid}"><path d="${SQ(100)}"/></clipPath>
      <linearGradient id="v${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#2a1640" stop-opacity="0"/><stop offset="1" stop-color="#2a1640" stop-opacity=".28"/></linearGradient></defs>
    <g clip-path="url(#c${uid})"><image href="${wall}" x="-40" y="0" width="180" height="100" preserveAspectRatio="xMidYMid slice"/><rect width="100" height="100" fill="url(#v${uid})"/></g>
    <g transform="${small ? 'translate(4 3) scale(3.83)' : 'translate(14 12) scale(3)'}">
      ${small ? '' : `<g transform="translate(0.35 0.5)" opacity=".25">${buddy({ fill: '#2a1640', face: 'none' })}</g>`}
      ${buddy({ fill: C.night, face: 'ink', faceColor: small ? '#F6C3E0' : '#F3B6DA', wave: !small })}</g>
    <path d="${SQ(100)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/></svg>`,

  // I2 — the icon IS the mascot. No tile behind it: the body is the icon's shape, so on a
  // taskbar it's a silhouette, not another rounded square in a row of rounded squares.
  i2: ({ px, fill = C.purple, small = false }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="i2g${fill.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(fill, .24)}"/><stop offset="1" stop-color="${fill}"/></linearGradient></defs>
    <g fill="${small ? fill : `url(#i2g${fill.slice(1)})`}">
      <rect x="0" y="34" width="12" height="26" rx="5"/><rect x="88" y="34" width="12" height="26" rx="5"/>
      <rect x="22" y="80" width="20" height="20" rx="6"/><rect x="58" y="80" width="20" height="20" rx="6"/>
      <rect x="15" y="4" width="70" height="72" rx="24"/></g>
    ${small ? '' : '<path d="M27 10 H73" stroke="#fff" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/>'}
    <path d="M27 29 L39 40 L27 51" fill="none" stroke="#fff" stroke-width="${small ? 9 : 7.5}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M73 29 L61 40 L73 51" fill="none" stroke="#fff" stroke-width="${small ? 9 : 7.5}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // I3 — the cursor. A dark terminal tile, a prompt arrow, and a block cursor with legs and a
  // squint: the old >YC█ logo, come to life. Natural fit for help and technical pages.
  i3: ({ px, small = false, acc = '#C792EA' }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="i3g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B1A3F"/><stop offset="1" stop-color="#140C1F"/></linearGradient>
      <radialGradient id="i3h" cx=".68" cy=".5" r=".45"><stop offset="0" stop-color="#B87BE0" stop-opacity=".45"/><stop offset="1" stop-color="#B87BE0" stop-opacity="0"/></radialGradient></defs>
    <path d="${SQ(100)}" fill="url(#i3g)"/>${small ? '' : `<path d="${SQ(100)}" fill="url(#i3h)"/><path d="${SQ(100)}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.2"/>`}
    <path d="${small ? 'M14 30 L33 47 L14 64' : 'M17 34 L32 47 L17 60'}" fill="none" stroke="${acc}" stroke-width="${small ? 10 : 7}" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#F4E9FA">${small
      ? '<rect x="46" y="20" width="40" height="46" rx="8"/><rect x="50" y="70" width="12" height="14" rx="3"/><rect x="70" y="70" width="12" height="14" rx="3"/>'
      : '<rect x="44" y="23" width="34" height="40" rx="7"/><rect x="48" y="66" width="10" height="11" rx="3"/><rect x="64" y="66" width="10" height="11" rx="3"/>'}</g>
    ${small ? '' : '<path d="M51 37 L56 41.5 L51 46 M71 37 L66 41.5 L71 46" fill="none" stroke="#2B1A3F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'}</svg>`,

  // I4 — just the squint. The mascot's "> <" face is also a code bracket; on its own it becomes
  // a symbol, the way a smiley is. The most abstract of the five, and the boldest when tiny.
  i4: ({ px, a = C.purple, b = C.pink, small = false }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="i4g${a.slice(1)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <path d="${SQ(100)}" fill="url(#i4g${a.slice(1)})"/>
    ${small ? '' : `<path d="M20 9 H80" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>`}
    <path d="M${small ? '17 26 L35 42 L17 58' : '22 30 L37 43 L22 56'}" fill="none" stroke="#fff" stroke-width="${small ? 13 : 10}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${small ? '83 26 L65 42 L83 58' : '78 30 L63 43 L78 56'}" fill="none" stroke="#fff" stroke-width="${small ? 13 : 10}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${small ? '38 72 Q50 84 62 72' : '41 70 Q50 79 59 70'}" fill="none" stroke="#fff" stroke-width="${small ? 10 : 7}" stroke-linecap="round"/></svg>`,

  // I5 — peeking. The mascot climbs up from the bottom of a night-sky tile, mitts on the edge,
  // eyes wide. Character first: the most "cute app" of the five.
  i5: ({ px, small = false, sky = ['#2E1A52', '#7B3FA6', '#E58BB8'] }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="i5c${sky[1].slice(1)}"><path d="${SQ(100)}"/></clipPath>
      <linearGradient id="i5s${sky[1].slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".7" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
      <linearGradient id="i5b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3E6FA"/><stop offset="1" stop-color="#D8BDEB"/></linearGradient></defs>
    <g clip-path="url(#i5c${sky[1].slice(1)})"><rect width="100" height="100" fill="url(#i5s${sky[1].slice(1)})"/>
      ${small ? '' : '<g fill="#fff"><circle cx="18" cy="16" r="1.1"/><circle cx="80" cy="12" r="1.4"/><circle cx="68" cy="24" r=".8"/><circle cx="30" cy="30" r=".7"/><circle cx="88" cy="34" r=".9"/></g><circle cx="74" cy="22" r="7" fill="#FCE7F2" opacity=".9"/>'}
      <rect x="${small ? 12 : 20}" y="${small ? 30 : 38}" width="${small ? 76 : 60}" height="80" rx="${small ? 22 : 20}" fill="url(#i5b)"/>
      ${small
        ? '<rect x="30" y="50" width="11" height="16" rx="5.5" fill="#2C173B"/><rect x="59" y="50" width="11" height="16" rx="5.5" fill="#2C173B"/>'
        : '<ellipse cx="39" cy="60" rx="5.4" ry="7.2" fill="#2C173B"/><ellipse cx="61" cy="60" rx="5.4" ry="7.2" fill="#2C173B"/><circle cx="41" cy="57" r="1.8" fill="#fff"/><circle cx="63" cy="57" r="1.8" fill="#fff"/><ellipse cx="31" cy="70" rx="4" ry="2.2" fill="#F29CC4" opacity=".7"/><ellipse cx="69" cy="70" rx="4" ry="2.2" fill="#F29CC4" opacity=".7"/>'}
      <rect x="${small ? 4 : 12}" y="${small ? 80 : 84}" width="${small ? 22 : 17}" height="20" rx="7" fill="#D8BDEB" stroke="#2E1A52" stroke-opacity=".35" stroke-width="1"/>
      <rect x="${small ? 74 : 71}" y="${small ? 80 : 84}" width="${small ? 22 : 17}" height="20" rx="7" fill="#D8BDEB" stroke="#2E1A52" stroke-opacity=".35" stroke-width="1"/></g></svg>`,
};

// One-colour versions for places that only allow a single colour: the Mac menu bar, Linux
// system trays, Windows "monochrome" taskbars. `c` is the colour the OS paints it.
const MONO_SMILE = 1;
const MONO = {
  i1: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%">${buddy({ fill: c, face: 'cut' })}</svg>`,
  i2: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%">${buddy({ fill: c, face: 'cut' })}</svg>`,
  i3: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M2 7 L7 12 L2 17" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><g fill="${c}"><rect x="10" y="4" width="11" height="12.5" rx="2.4"/><rect x="11" y="17.6" width="3.4" height="3.6" rx="1"/><rect x="16.6" y="17.6" width="3.4" height="3.6" rx="1"/></g></svg>`,
  i4: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M3 4 L8.5 9 L3 14 M21 4 L15.5 9 L21 14 M8.5 18 Q12 21.5 15.5 18" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  i5: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill-rule="evenodd" fill="${c}" d="M8 4 H16 A6 6 0 0 1 22 10 V22 H2 V10 A6 6 0 0 1 8 4 Z M7.4 10 h2.6 v4.4 h-2.6 Z M14 10 h2.6 v4.4 h-2.6 Z"/></svg>`,
};

// =====================================================================================
// INSTALLER ICONS — the picture on the file you download ("YouCoded-Setup.exe" / ".dmg").
// =====================================================================================
const INSTALLERS = {
  // D1 — arriving in a box. The mascot pops out of an opened parcel, waving: "here I am".
  d1: ({ px, small = false }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="d1f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4D2F2"/><stop offset="1" stop-color="#CDB1E6"/></linearGradient>
      <linearGradient id="d1i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A1F66"/><stop offset="1" stop-color="#6A3290"/></linearGradient></defs>
    ${small ? '' : '<g fill="#F2B8D6"><path d="M14 22 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z"/><path d="M84 14 l1.1 2.8 2.8 1.1 -2.8 1.1 -1.1 2.8 -1.1 -2.8 -2.8 -1.1 2.8 -1.1z"/></g>'}
    <path d="M18 52 L50 46 L82 52 L82 56 L18 56 Z" fill="url(#d1i)"/>
    <g transform="${small ? 'translate(22 0) scale(2.35)' : 'translate(25 2) scale(2.1)'}">${buddy({ fill: C.purple, face: 'ink', faceColor: '#fff', wave: !small, legs: false })}</g>
    <path d="M18 52 L82 52 L82 90 Q82 94 78 94 L22 94 Q18 94 18 90 Z" fill="url(#d1f)" stroke="#B994D8" stroke-width="1"/>
    <path d="M18 52 L6 40 L40 34 L50 46 Z" fill="#F1E6F9" stroke="#B994D8" stroke-width="1" stroke-linejoin="round"/><path d="M82 52 L94 40 L60 34 L50 46 Z" fill="#DCC6EE" stroke="#B994D8" stroke-width="1" stroke-linejoin="round"/>
    ${small ? '' : '<rect x="44" y="52" width="12" height="42" fill="#8B47B8" opacity=".85"/><path d="M26 70 H38" stroke="#8B47B8" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>'}</svg>`,

  // D2 — the app icon plus a download badge. The conventional choice: the installer is
  // obviously "the thing that installs that app". Shown with I2; works with any icon.
  d2: ({ px, small = false, base = 'i2' }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(2 2) scale(.82)">${ICONS[base]({ px: 100, small }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
    <circle cx="76" cy="76" r="${small ? 24 : 21}" fill="#fff"/><circle cx="76" cy="76" r="${small ? 20 : 17.5}" fill="#2BA36B"/>
    <path d="M76 ${small ? 64 : 66} V${small ? 86 : 85} M${small ? 67 : 68} ${small ? 78 : 78} L76 ${small ? 87 : 86} L${small ? 85 : 84} ${small ? 78 : 78}" fill="none" stroke="#fff" stroke-width="${small ? 6 : 4.6}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // D3 — dropping in. The mascot floats down to your computer under a little parachute in the
  // theme's stripes. "Download" literally: coming down.
  d3: ({ px, small = false }) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="d3c"><path d="M10 38 Q10 6 50 6 Q90 6 90 38 Z"/></clipPath></defs>
    ${small ? '' : '<g fill="#fff" opacity=".9"><ellipse cx="16" cy="80" rx="12" ry="5"/><ellipse cx="25" cy="76" rx="8" ry="6"/><ellipse cx="86" cy="62" rx="9" ry="4"/></g>'}
    <g clip-path="url(#d3c)"><rect x="0" y="0" width="100" height="40" fill="#8B47B8"/>
      <path d="M30 0 h14 v40 h-14z M58 0 h14 v40 h-14z" fill="#F0A8CF"/>${small ? '' : '<path d="M44 0 h14 v40 h-14z" fill="#B07AD9"/>'}</g>
    <path d="M10 38 Q30 30 50 38 Q70 30 90 38" fill="none" stroke="#6A3290" stroke-width="${small ? 0 : 1.5}"/>
    <path d="M12 38 L37 64 M88 38 L63 64 M50 38 L50 58" stroke="#4A1F66" stroke-width="${small ? 2.4 : 1.2}" stroke-linecap="round"/>
    <g transform="translate(27 ${small ? 52 : 52}) scale(1.92)">${buddy({ fill: '#8B47B8', face: 'ink', faceColor: '#fff', wave: false })}</g></svg>`,
};

// The icon in use today, for comparison on every board.
const TODAY_ICON = 'today-icon.svg';
const TODAY_INSTALLER = 'today-installer.svg';
