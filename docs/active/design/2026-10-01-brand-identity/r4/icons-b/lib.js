// lib.js — round-4 app icon concepts J1–J6 (name- and personality-led), as SVG strings.
// Every icon is drawn on a 100-unit tile; tab icons and tray glyphs are drawn SEPARATELY on a
// 16-unit pixel grid (WHY: a 16px tab icon shrunk from a 512 master turns to mush — it must be
// its own simplified drawing). Built from the current app mascot's geometry (r3/assets/icon-mascot.svg).
// Classic script: works in the browser (window.J) and in node via vm.
(function (root) {
  const PURPLE = '#8B47B8', DEEP = '#4A1F66', INK = '#2c173b', PINK = '#E36FB8';
  const HEAD = 'M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z';
  const ARM = (x) => `M${x + .8} 9 L${x + 2.2} 9 A0.8 0.8 0 0 1 ${x + 3} 9.8 L${x + 3} 12.2 A0.8 0.8 0 0 1 ${x + 2.2} 13 L${x + .8} 13 A0.8 0.8 0 0 1 ${x} 12.2 L${x} 9.8 A0.8 0.8 0 0 1 ${x + .8} 9 Z`;
  const WAVE = 'rotate(-160 21.5 9)';
  const LEG = (x) => `<rect x="${x}" y="17" width="3.5" height="4" rx="1.2"/>`;
  const SHAPES = (wave) => `<path d="${ARM(1)}"/><g transform="${wave ? WAVE : ''}"><path d="${ARM(20)}"/></g>${LEG(7.2)}${LEG(13.3)}<path d="${HEAD}"/>`;

  // The original sparkle face (verbatim geometry from icon-mascot.svg).
  const FACE = `<ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="${INK}"/><circle cx="10" cy="10.25" r="0.3" fill="#fff"/><circle cx="9.35" cy="10.85" r="0.2" fill="#fff" fill-opacity=".8"/><circle cx="10.3" cy="10.85" r="0.14" fill="#fff" fill-opacity=".65"/>
    <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="${INK}"/><circle cx="15.4" cy="9.95" r="0.3" fill="#fff"/><circle cx="14.75" cy="10.55" r="0.2" fill="#fff" fill-opacity=".8"/><circle cx="15.7" cy="10.55" r="0.14" fill="#fff" fill-opacity=".65"/>
    <g transform="rotate(-2 12 13.3)"><path d="M10.8 13.3 Q10.8 13 12 13 Q13.2 13 13.2 13.3 A1.1 1 0 0 1 10.8 13.3 Z" fill="${INK}"/></g>`;

  // The glossy mascot, as in the app icon today, with an optional white die-cut border.
  // `uid` keeps gradient ids unique when several mascots share a page.
  function mascot({ wave = true, sticker = 0, uid = 'm' } = {}) {
    const under = sticker ? `<g fill="#fff" stroke="#fff" stroke-width="${sticker * 2}" stroke-linejoin="round">${SHAPES(wave)}<rect x="8.5" y="14" width="7" height="5"/></g>` : '';
    return `<defs>
      <radialGradient id="${uid}hi" cx="33%" cy="20%" r="80%"><stop offset="0" stop-color="#B98AD6" stop-opacity=".45"/><stop offset=".55" stop-color="#B98AD6" stop-opacity="0"/></radialGradient>
      <linearGradient id="${uid}lo" x1="0" y1="0" x2=".22" y2="1"><stop offset=".52" stop-color="#5E2A82" stop-opacity="0"/><stop offset="1" stop-color="#5E2A82" stop-opacity=".4"/></linearGradient>
      <radialGradient id="${uid}sp" cx="30%" cy="16%" r="26%"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      ${under}
      <g fill="${DEEP}" stroke="${DEEP}" stroke-width=".75" stroke-linejoin="round">${SHAPES(wave)}</g>
      <g fill="${PURPLE}">${SHAPES(wave)}</g>
      <path d="${HEAD}" fill="url(#${uid}lo)"/><path d="${HEAD}" fill="url(#${uid}hi)"/>
      <ellipse cx="9.6" cy="6.4" rx="3.4" ry="1.9" fill="url(#${uid}sp)" transform="rotate(-14 9.6 6.4)"/>${FACE}`;
  }
  // One-colour mascot with the face knocked out (for silhouette marks).
  function silhouette({ fill = '#fff', wave = true, uid = 's' } = {}) {
    return `<defs><mask id="${uid}k"><rect x="-5" y="-5" width="34" height="34" fill="#fff"/>
      <ellipse cx="9.4" cy="9.6" rx="1.55" ry="2.15" fill="#000"/><ellipse cx="14.6" cy="9.6" rx="1.55" ry="2.15" fill="#000"/>
      <path d="M10.7 12.9 Q12 14.6 13.3 12.9" fill="none" stroke="#000" stroke-width=".9" stroke-linecap="round"/></mask></defs>
      <g fill="${fill}" stroke="${fill}" stroke-width=".7" stroke-linejoin="round" mask="url(#${uid}k)">${SHAPES(wave)}</g>`;
  }

  const GRAD = (id, a = '#9550CC', b = '#C85FC0', c = '#F08BB4') => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  const SHEEN = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  const TILE = 'x="0" y="0" width="100" height="100" rx="22.5"';
  const svg = (body, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="100%" height="100%">${body}</svg>`;
  // Place a 24-grid drawing so its box [x0..x1]x[y0..y1] (grid units) lands at (cx,cy) with width w.
  const place = (inner, cx, cy, w, rot = 0, box = [1, 1, 23, 21]) => {
    const s = w / (box[2] - box[0]); const bx = (box[0] + box[2]) / 2, by = (box[1] + box[3]) / 2;
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(${-bx} ${-by})">${inner}</g>`;
  };

  const ICONS = {
    // J1 — the mascot drawn as a chunky white "o": its head is a letter stroke, eyes in the counter.
    j1: () => svg(`<defs>${GRAD('g1')}${SHEEN('sh1')}<filter id="ds1" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2" flood-color="#3a0f55" flood-opacity=".38"/></filter></defs>
      <rect ${TILE} fill="url(#g1)"/><rect ${TILE} fill="url(#sh1)"/>
      <g filter="url(#ds1)" fill="#fff">
        <path fill-rule="evenodd" d="M38 19 H62 A18 18 0 0 1 80 37 V53 A18 18 0 0 1 62 71 H38 A18 18 0 0 1 20 53 V37 A18 18 0 0 1 38 19 Z M41 31 H59 A9 9 0 0 1 68 40 V50 A9 9 0 0 1 59 59 H41 A9 9 0 0 1 32 50 V40 A9 9 0 0 1 41 31 Z"/>
        <rect x="8" y="38" width="9" height="15" rx="4.5"/>
        <rect x="83" y="22" width="9" height="15" rx="4.5" transform="rotate(25 87.5 29.5)"/>
        <rect x="34" y="74" width="11" height="13" rx="5"/><rect x="55" y="74" width="11" height="13" rx="5"/>
      </g>
      <ellipse cx="42" cy="42.5" rx="4.6" ry="6.4" fill="#fff"/><ellipse cx="58" cy="42.5" rx="4.6" ry="6.4" fill="#fff"/>
      <ellipse cx="43" cy="44" rx="2.6" ry="3.8" fill="#2c173b"/><ellipse cx="59" cy="44" rx="2.6" ry="3.8" fill="#2c173b"/>
      <circle cx="44" cy="42.4" r="1.1" fill="#fff"/><circle cx="60" cy="42.4" r="1.1" fill="#fff"/>
      <path d="M46 52.5 Q50 55.5 54 52.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`),

    // J2 — a huge chunky gradient "y"; the mascot sits in its fork and waves.
    j2: () => svg(`<defs>${GRAD('g2', '#C084F5', '#E070CF', '#FF9CC4')}${SHEEN('sh2')}
        <linearGradient id="bg2" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#3B1E57"/><stop offset="1" stop-color="#1E1030"/></linearGradient><radialGradient id="gw2" cx="50%" cy="62%" r="55%"><stop offset="0" stop-color="#C85FC0" stop-opacity=".45"/><stop offset="1" stop-color="#C85FC0" stop-opacity="0"/></radialGradient>
        <linearGradient id="gl2" x1="0" y1="0" x2="0" y2="1"><stop offset=".08" stop-color="#fff" stop-opacity=".55"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="ds2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#5a1f7a" flood-opacity=".3"/></filter></defs>
      <clipPath id="c2"><rect ${TILE}/></clipPath>
      <rect ${TILE} fill="url(#bg2)"/><rect ${TILE} fill="url(#gw2)"/>
      <g clip-path="url(#c2)"><g filter="url(#ds2)"><text x="50" y="88" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="118" fill="url(#g2)">y</text>
      <text x="50" y="88" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="118" fill="url(#gl2)">y</text></g></g>
      ${place(mascot({ uid: 'm2', sticker: 1 }), 51, 27, 46, -4)}`),

    // J3 — the waving mascot as a thick die-cut sticker, slapped on at an angle, one corner peeling.
    j3: () => {
      const peel = `<defs><clipPath id="cp3"><path d="M-10 -10 H40 V40 H-10 Z M-10 -10 L-10 7.6 L3.4 7.6 L21 -10 Z" clip-rule="evenodd"/></clipPath>
        <linearGradient id="fl3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8CCE6"/></linearGradient>
        <filter id="fs3" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx=".35" dy=".45" stdDeviation=".35" flood-color="#2a0a40" flood-opacity=".45"/></filter></defs>`;
      // The removed corner is the cap beyond x+y=10.2; the flap is that cap folded back across the line.
      const sticker = `${peel}<g clip-path="url(#cp3)">${mascot({ uid: 'm3', sticker: 1.4 })}</g>
        <path d="M3.6 7.4 Q7.64 6.64 8.4 2.6 Z" fill="url(#fl3)" filter="url(#fs3)"/>`;
      return svg(`<defs>${GRAD('g3', '#7E3FB0', '#B551BF', '#F08AB3')}${SHEEN('sh3')}
        <radialGradient id="lt3" cx="25%" cy="15%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <filter id="ds3" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1.2" dy="3.2" stdDeviation="2.4" flood-color="#2a0a40" flood-opacity=".42"/></filter></defs>
        <rect ${TILE} fill="url(#g3)"/><rect ${TILE} fill="url(#lt3)"/>
        <g filter="url(#ds3)">${place(sticker, 50, 52, 84, -9, [-1, -1, 25, 23])}</g>`);
    },

    // J4 — the website's frosted glass, with the mascot pressed right up against it: blurred
    // body, crisp face where it touches the glass.
    j4: () => {
      const big = (uid) => place(mascot({ uid, wave: true }), 50, 55, 96, 0);
      return svg(`<defs>
        <clipPath id="tc4"><rect ${TILE}/></clipPath>
        <filter id="bl4" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
        <filter id="bm4" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
        <radialGradient id="fm4" cx="50%" cy="46%" r="24%"><stop offset=".6" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
        <mask id="mk4"><rect x="0" y="0" width="100" height="100" fill="url(#fm4)"/></mask>
        <linearGradient id="gl4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".35" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient></defs>
        <g clip-path="url(#tc4)">
          <image href="cotton-candy-sky.webp" x="-40" y="-10" width="190" height="120" preserveAspectRatio="xMidYMid slice" filter="url(#bl4)"/>
          <rect x="0" y="0" width="100" height="100" fill="#F3E4FA" fill-opacity=".28"/>
          <g filter="url(#bm4)" opacity=".95">${big('m4a')}</g>
          <g mask="url(#mk4)">${big('m4b')}</g>
          <rect x="0" y="0" width="100" height="100" fill="url(#gl4)"/>
          <path d="M-10 38 L38 -10 L50 -10 L-10 50 Z" fill="#fff" fill-opacity=".22"/><path d="M-10 56 L56 -10 L60 -10 L-10 60 Z" fill="#fff" fill-opacity=".16"/>
        </g>
        <rect x="1" y="1" width="98" height="98" rx="21.5" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2"/>
        <rect x=".4" y=".4" width="99.2" height="99.2" rx="22.1" fill="none" stroke="#8B47B8" stroke-opacity=".35" stroke-width=".8"/>`);
    },

    // J5 — the mascot's head IS a chat bubble; its left arm swings down to become the tail.
    j5: () => svg(`<defs>
        <linearGradient id="b5" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#A866D6"/><stop offset="1" stop-color="#7637A6"/></linearGradient>
        <radialGradient id="h5" cx="28%" cy="18%" r="45%"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <filter id="ds5" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#3a0f55" flood-opacity=".35"/></filter></defs>
      <g filter="url(#ds5)">
        <g fill="#4A1F66" stroke="#4A1F66" stroke-width="5" stroke-linejoin="round">
          <rect x="7" y="9" width="80" height="70" rx="24"/><rect x="13" y="66" width="16" height="27" rx="8" transform="rotate(32 21 79.5)"/>
          <rect x="80" y="4" width="13" height="22" rx="6.5" transform="rotate(28 86.5 15)"/></g>
        <g fill="url(#b5)"><rect x="13" y="66" width="16" height="27" rx="8" transform="rotate(32 21 79.5)"/>
          <rect x="80" y="4" width="13" height="22" rx="6.5" transform="rotate(28 86.5 15)"/><rect x="7" y="9" width="80" height="70" rx="24"/></g>
        <rect x="7" y="9" width="80" height="70" rx="24" fill="url(#h5)"/>
        <ellipse cx="34" cy="40" rx="7.2" ry="10" fill="#2c173b"/><ellipse cx="60" cy="38.5" rx="7.2" ry="10" fill="#2c173b"/>
        <circle cx="37" cy="43" r="2.2" fill="#fff"/><circle cx="33.5" cy="46.5" r="1.3" fill="#fff" fill-opacity=".8"/>
        <circle cx="63" cy="41.5" r="2.2" fill="#fff"/><circle cx="59.5" cy="45" r="1.3" fill="#fff" fill-opacity=".8"/>
        <path d="M40 57 Q47 55.5 54 57 Q53 66 47 66 Q41 66 40 57 Z" fill="#2c173b"/><path d="M43 62.5 Q47 60.5 51 62.5 Q49 65.5 47 65.5 Q45 65.5 43 62.5 Z" fill="#E36FB8"/>
      </g>`),

    // J6 — a clean white silhouette of the waving mascot on the site's purple→pink gradient.
    j6: () => svg(`<defs>${GRAD('g6')}${SHEEN('sh6')}<filter id="ds6" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#3a0f55" flood-opacity=".35"/></filter></defs>
      <rect ${TILE} fill="url(#g6)"/><rect ${TILE} fill="url(#sh6)"/>
      <g filter="url(#ds6)">${place(silhouette({ uid: 's6' }), 49, 53, 78)}</g>`),
  };

  // ---------- 16px tab icons, drawn on the pixel grid ----------
  const G16 = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9550CC"/><stop offset=".6" stop-color="#C85FC0"/><stop offset="1" stop-color="#F08BB4"/></linearGradient>`;
  const TAB = {
    j1: () => svg(`<defs>${G16('t')}</defs><rect width="16" height="16" rx="4" fill="url(#t)"/>
      <path fill="#fff" fill-rule="evenodd" d="M5.5 2 H10.5 A3.5 3.5 0 0 1 14 5.5 V7.5 A3.5 3.5 0 0 1 10.5 11 H5.5 A3.5 3.5 0 0 1 2 7.5 V5.5 A3.5 3.5 0 0 1 5.5 2 Z M6 4 H10 A2 2 0 0 1 12 6 V7 A2 2 0 0 1 10 9 H6 A2 2 0 0 1 4 7 V6 A2 2 0 0 1 6 4 Z"/>
      <rect x="6" y="5" width="1" height="3" fill="#fff"/><rect x="9" y="5" width="1" height="3" fill="#fff"/>
      <rect x="5" y="12" width="2" height="2" rx=".5" fill="#fff"/><rect x="9" y="12" width="2" height="2" rx=".5" fill="#fff"/>`, '0 0 16 16'),
    j2: () => svg(`<defs>${G16('t')}</defs><rect width="16" height="16" rx="4" fill="#2E1846"/>
      <path d="M3.6 3.5 L8.2 10 M12.4 3.5 L6.8 14" fill="none" stroke="url(#t)" stroke-width="3.1" stroke-linecap="round"/>`, '0 0 16 16'),
    j3: () => svg(`<g fill="#fff"><rect x="1" y="1" width="14" height="11" rx="4"/><rect x="0" y="5" width="16" height="4" rx="2"/><rect x="3" y="10" width="10" height="6" rx="2"/></g>
      <rect x="2" y="2" width="12" height="9" rx="3" fill="#8B47B8"/><rect x="1" y="6" width="1" height="3" fill="#8B47B8"/><rect x="14" y="2" width="1" height="4" fill="#8B47B8"/>
      <rect x="5" y="11" width="2" height="4" rx=".6" fill="#8B47B8"/><rect x="9" y="11" width="2" height="4" rx=".6" fill="#8B47B8"/>
      <rect x="5" y="5" width="2" height="3" rx=".5" fill="#2c173b"/><rect x="9" y="5" width="2" height="3" rx=".5" fill="#2c173b"/>
      <rect x="2" y="2" width="12" height="9" rx="3" fill="none" stroke="#4A1F66" stroke-width=".6"/>`, '0 0 16 16'),
    j4: () => svg(`<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7EEFC"/><stop offset="1" stop-color="#F2C9E2"/></linearGradient></defs>
      <rect width="16" height="16" rx="4" fill="url(#t)"/><rect x=".5" y=".5" width="15" height="15" rx="3.5" fill="none" stroke="#C9A6E0"/>
      <rect x="2" y="3" width="12" height="11" rx="3.5" fill="#8B47B8"/><rect x="4.5" y="6" width="2.5" height="4" rx="1.2" fill="#2c173b"/><rect x="9" y="6" width="2.5" height="4" rx="1.2" fill="#2c173b"/>
      <rect x="5.5" y="6.5" width="1" height="1" fill="#fff"/><rect x="10" y="6.5" width="1" height="1" fill="#fff"/>`, '0 0 16 16'),
    j5: () => svg(`<g fill="#7E3DB0"><rect x="0.5" y="0.5" width="15" height="12" rx="4.5"/><path d="M2 10 L1.5 15.5 L7 11.5 Z"/></g>
      <rect x="4" y="4" width="2.2" height="4" rx="1.1" fill="#fff"/><rect x="9.8" y="4" width="2.2" height="4" rx="1.1" fill="#fff"/>`, '0 0 16 16'),
    j6: () => svg(`<defs>${G16('t')}<mask id="k"><rect width="16" height="16" fill="#fff"/><rect x="5" y="5" width="2" height="3" fill="#000"/><rect x="9" y="5" width="2" height="3" fill="#000"/></mask></defs>
      <rect width="16" height="16" rx="4" fill="url(#t)"/>
      <g fill="#fff" mask="url(#k)"><rect x="3" y="3" width="10" height="7.5" rx="2.5"/><rect x="1" y="6" width="1.5" height="3" rx=".7"/><rect x="13.5" y="2" width="1.5" height="3" rx=".7"/>
      <rect x="5" y="11" width="2" height="2.5" rx=".6"/><rect x="9" y="11" width="2" height="2.5" rx=".6"/></g>`, '0 0 16 16'),
  };

  // ---------- 16px one-colour tray glyphs (white; black is the same with fill swapped) ----------
  const TRAY = {
    j1: (c) => svg(`<path fill="${c}" fill-rule="evenodd" d="M5 2 H11 A3 3 0 0 1 14 5 V8 A3 3 0 0 1 11 11 H5 A3 3 0 0 1 2 8 V5 A3 3 0 0 1 5 2 Z M5.5 4 H10.5 A1.5 1.5 0 0 1 12 5.5 V7.5 A1.5 1.5 0 0 1 10.5 9 H5.5 A1.5 1.5 0 0 1 4 7.5 V5.5 A1.5 1.5 0 0 1 5.5 4 Z"/>
      <rect x="6" y="5" width="1" height="3" fill="${c}"/><rect x="9" y="5" width="1" height="3" fill="${c}"/><rect x="5" y="12" width="2" height="3" rx=".5" fill="${c}"/><rect x="9" y="12" width="2" height="3" rx=".5" fill="${c}"/>`, '0 0 16 16'),
    j2: (c) => svg(`<path d="M3.5 2.5 L8.2 10 M12.5 2.5 L6.6 14.2" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`, '0 0 16 16'),
    j3: (c) => TRAY.j6(c),
    j4: (c) => svg(`<defs><mask id="k"><rect width="16" height="16" fill="#fff"/><rect x="5" y="5" width="2" height="4" fill="#000"/><rect x="9" y="5" width="2" height="4" fill="#000"/></mask></defs>
      <rect x="1" y="2" width="14" height="12" rx="4" fill="${c}" mask="url(#k)"/>`, '0 0 16 16'),
    j5: (c) => svg(`<defs><mask id="k"><rect width="16" height="16" fill="#fff"/><rect x="4" y="4" width="2" height="4" fill="#000"/><rect x="10" y="4" width="2" height="4" fill="#000"/></mask></defs>
      <g fill="${c}" mask="url(#k)"><rect x="0.5" y="1" width="15" height="11" rx="4"/><path d="M2 9.5 L1.5 15 L7 11.5 Z"/></g>`, '0 0 16 16'),
    j6: (c) => svg(`<defs><mask id="k"><rect width="16" height="16" fill="#fff"/><rect x="5" y="5" width="2" height="3" fill="#000"/><rect x="9" y="5" width="2" height="3" fill="#000"/></mask></defs>
      <g fill="${c}" mask="url(#k)"><rect x="3" y="3" width="10" height="8" rx="2.5"/><rect x="0.5" y="6" width="2" height="3.5" rx=".8"/><rect x="13.5" y="1" width="2" height="3.5" rx=".8"/>
      <rect x="4.5" y="12" width="2.5" height="3" rx=".7"/><rect x="9" y="12" width="2.5" height="3" rx=".7"/></g>`, '0 0 16 16'),
  };

  const OPTIONS = [
    { id: 'j1', label: 'The "o"', note: 'The mascot drawn as a chunky white letter "o" with eyes, arms and feet, so the icon is both a letter of our name and our character.' },
    { id: 'j2', label: 'Chunky "y"', note: 'A big glossy purple-to-pink "y" (the name\'s chunky lettering) with the mascot sitting in its fork, waving.' },
    { id: 'j3', label: 'Die-cut sticker', note: 'The waving mascot as a thick white sticker stuck on at an angle, with one corner peeling up.' },
    { id: 'j4', label: 'Pressed to the glass', note: 'The website\'s frosted glass with the mascot pressed right up against it: its body blurred, its face sharp.' },
    { id: 'j5', label: 'Speech bubble', note: 'The mascot\'s head is a chat bubble and its arm swings down to become the bubble\'s tail, mouth open mid-hello.' },
    { id: 'j6', label: 'Clean silhouette', note: 'A simple white cut-out of the waving mascot on the purple-to-pink gradient: the boldest at small sizes.' },
  ];
  root.J = { ICONS, TAB, TRAY, OPTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
