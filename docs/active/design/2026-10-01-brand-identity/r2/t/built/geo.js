// geo.js — the "Built by you" geometry: one rounded-block part, five of them make the mascot,
// the same blocks (with seams) spell the wordmark. Shared by gen.mjs (Node, writes the icon
// SVGs) and boards.js (browser). Plain script that hangs everything off globalThis.BUILT.
(function () {
  const f = (n) => +(+n).toFixed(3);
  const C = {
    purple: '#7B3FE4', deep: '#4A1FA6', tang: '#FF7A2F', cream: '#FFF6EC', ink: '#16121F',
    lilac: '#CDB8FF', line: '#EADFCC', kraft: '#D9A56C', mint: '#5CF2C0', pink: '#FF8FB1', sun: '#FFD23F', blue: '#1F4FD1', coral: '#FF5A5F',
  };

  // Rounded rect with per-corner radii [tl, tr, br, bl].
  function rrp(x, y, w, h, [a, b, c, d]) {
    return `M${f(x + a)} ${f(y)}H${f(x + w - b)}${b ? `A${b} ${b} 0 0 1 ${f(x + w)} ${f(y + b)}` : ''}V${f(y + h - c)}${c ? `A${c} ${c} 0 0 1 ${f(x + w - c)} ${f(y + h)}` : ''}H${f(x + d)}${d ? `A${d} ${d} 0 0 1 ${f(x)} ${f(y + h - d)}` : ''}V${f(y + a)}${a ? `A${a} ${a} 0 0 1 ${f(x + a)} ${f(y)}` : ''}Z`;
  }
  const rr = (x, y, w, h, r) => rrp(x, y, w, h, [r, r, r, r]);

  // ---------- Mascot: five modules on a 24 grid, 0.7 seams between them ----------
  const PART = {
    head: [5, 3.6, 14, 12.2, 3.6],
    armL: [1.3, 8.2, 3, 5, 1.3], armR: [19.7, 8.2, 3, 5, 1.3],
    footL: [7.3, 16.5, 3.8, 4.6, 1.3], footR: [12.9, 16.5, 3.8, 4.6, 1.3],
  };
  function face(kind, col, w = 1.25) {
    switch (kind) {
      case 'happy': return `<path d="M8.5 10.6Q9.75 7.6 11 10.6M13 10.6Q14.25 7.6 15.5 10.6" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      case 'visor': return `<path d="${rr(7.1, 7.3, 9.8, 3.8, 1.9)}" fill="${col}"/><path d="M9 8.5H11.6" stroke="#fff" stroke-opacity=".7" stroke-width=".6" stroke-linecap="round"/>`;
      case 'dot': return `<circle cx="9.75" cy="9.4" r="1.3" fill="${col}"/><circle cx="14.25" cy="9.4" r="1.3" fill="${col}"/>`;
      case 'wink': return `<path d="${rr(8.7, 7.4, 2.1, 3.8, 1.05)}" fill="${col}"/><path d="M13 10.2Q14.25 7.8 15.5 10.2" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      case 'sleepy': return `<path d="M8.6 9.8H11M13 9.8H15.4" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      default: return `<path d="${rr(8.7, 7.4, 2.1, 3.8, 1.05)}" fill="${col}"/><path d="${rr(13.2, 7.4, 2.1, 3.8, 1.05)}" fill="${col}"/>`;
    }
  }
  function accessory(kind, col) {
    if (kind === 'ears') return `<path d="M6.1 2.9L7.4 .5Q7.75 -.1 8.2 .4L10.5 2.9Z M17.9 2.9L16.6 .5Q16.25 -.1 15.8 .4L13.5 2.9Z" fill="${col}"/>`;
    if (kind === 'antenna') return `<path d="${rr(11.55, .5, .9, 2.4, .45)}" fill="${col}"/><circle cx="12" cy="-.4" r="1.25" fill="${col}"/>`;
    if (kind === 'sprout') return `<path d="M12 2.9V1.2" stroke="${col}" stroke-width=".8" stroke-linecap="round"/><path d="M12 1.4C10.6 1.6 9.4 .9 9.2 -.6C10.8 -.8 11.9 .1 12 1.4ZM12 1.2C12.2 -.3 13.4 -1.1 15 -.9C14.8 .6 13.5 1.4 12 1.2Z" fill="${col}"/>`;
    if (kind === 'cap') return `<path d="${rrp(6.2, .6, 11.6, 2.4, [1.2, 1.2, 0, 0])}" fill="${col}"/>`;
    return '';
  }
  let uid = 0;
  // c: { head, arm, foot (colours), eye, face, finish: solid|outline|halftone|gloss, acc, accColor,
  //      ex: {part: [dx,dy]} exploded offsets, show: [parts], ghost: colour for unbuilt parts }
  function mascot(c = {}) {
    c = Object.assign({ head: C.purple, arm: C.purple, foot: C.purple, eye: C.cream, face: 'pill', finish: 'solid', acc: null, accColor: null, ex: {}, show: null, ghost: null, sw: .8 }, c);
    const id = 'bm' + (++uid);
    const tr = (k) => c.ex[k] ? ` transform="translate(${c.ex[k][0]} ${c.ex[k][1]})"` : '';
    const vis = (k) => !c.show || c.show.includes(k);
    const paint = (col) => c.finish === 'outline' ? `fill="none" stroke="${col}" stroke-width="${c.sw}"` : `fill="${col}"`;
    const part = (k, col) => {
      const [x, y, w, h, r] = PART[k];
      if (!vis(k)) return c.ghost ? `<path d="${rr(x, y, w, h, r)}" fill="none" stroke="${c.ghost}" stroke-width=".35" stroke-dasharray=".7 .5"${tr(k)}/>` : '';
      const ins = c.finish === 'outline' ? c.sw / 2 : 0;
      let s = `<path d="${rr(x + ins, y + ins, w - 2 * ins, h - 2 * ins, r - ins)}" ${paint(col)}${tr(k)}/>`;
      if (k === 'head' && c.finish === 'halftone') s += `<path d="${rr(x, y, w, h, r)}" fill="url(#${id}ht)"${tr(k)}/>`;
      if (c.finish === 'gloss') s += `<path d="${rrp(x + .9, y + .7, w * .45, 1.2, [.6, .6, .6, .6])}" fill="#fff" fill-opacity=".35"${tr(k)}/>`;
      return s;
    };
    const defs = c.finish === 'halftone' ? `<defs><pattern id="${id}ht" width="1.1" height="1.1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx=".55" cy=".55" r=".26" fill="${C.coral}" fill-opacity=".55"/></pattern></defs>` : '';
    const hx = c.ex.head || [0, 0], fx = c.ex.face || [0, 0];
    const faceT = ` transform="translate(${hx[0] + fx[0]} ${hx[1] + fx[1]})"`;
    return defs + part('armL', c.arm) + part('armR', c.arm) + part('footL', c.foot) + part('footR', c.foot) + part('head', c.head) +
      (vis('face') ? `<g${faceT}>${face(c.face, c.eye)}</g>` : '') +
      (c.acc && vis('acc') ? `<g${tr('head')}>${accessory(c.acc, c.accColor || c.head)}</g>` : '');
  }

  // ---------- Wordmark: "youcoded" built from 1-unit strokes, x-height 5, seams of 0.28 ----------
  const S = 1, H = 5, R = 1.75, r = .75, G = .28, ASC = -2.7, DESC = 7.7;
  // inner corners that sit against a cut are square, so no sliver of the counter's curve is left behind.
  const ring = (x, w, radii = [R, R, R, R], inner = [r, r, r, r]) => rrp(x, 0, w, H, radii) + rrp(x + S, S, w - 2 * S, H - 2 * S, inner);
  const L = {
    o: (x, eyes) => ({ w: 4.3, p: [ring(x, 4.3)], e: eyes ? [rr(x + 1.62, 2, .42, 1.1, .21), rr(x + 2.26, 2, .42, 1.1, .21)] : [] }),
    c: (x) => ({ w: 4.0, p: [ring(x, 4.0, [R, 1, 1, R], [r, 0, 0, r])], cut: [[x + 2.9, S, 1.3, H - 2 * S]] }),
    e: (x) => ({ w: 4.2, p: [ring(x, 4.2, [R, R, 1, R], [r, r, 0, r]), rrp(x + S - .01, 2.05, 4.2 - 2 * S + .02, .9, [0, 0, 0, 0])], cut: [[x + 3.1, 2.95, 1.3, 1.1]] }),
    u: (x) => ({ w: 4.1, p: [rrp(x, 0, 4.1, H, [.35, .35, R, R]) + rr(x + S, S, 2.1, 3, r)], cut: [[x + S, -.2, 2.1, 2.3]] }),
    // y: a bowl module seamed against one long right stem that hooks into the descender.
    y: (x) => ({
      w: 4.1, p: [rrp(x, 0, 4.1, H, [.35, 0, 0, R]) + rrp(x + S, S, 2.1, 3, [r, r, 0, r]),
        rrp(x + 3.1, 0, 1, DESC, [.35, .35, .9, 0]), rrp(x + .5, DESC - 1, 3.6, 1, [.5, 0, .9, .5])],
      cut: [[x + S, -.2, 2.1, 2.3]],
    }),
    d: (x) => ({ w: 4.3, p: [ring(x, 4.3, [R, 0, 0, R], [r, 0, 0, r]), rrp(x + 3.3, ASC, 1, H - ASC, [.5, .5, .25, 0])] }),
  };
  // Optical spacing: a letter open on its right (c) sits closer to what follows.
  const ADV = { c: .5 };
  function wordmark({ you = C.purple, coded = C.ink, eyes = true, eyeCol = null } = {}) {
    const id = 'bw' + (++uid);
    let x = 0, paths = '', cuts = '';
    [...'youcoded'].forEach((ch, i) => {
      const g = L[ch](x, eyes && i === 1);
      const col = i < 3 ? you : coded;
      paths += g.p.map(d => `<path d="${d}" fill="${col}" fill-rule="evenodd"/>`).join('');
      if (g.e) paths += g.e.map(d => `<path d="${d}" fill="${eyeCol || col}"/>`).join('');
      (g.cut || []).forEach(([cx, cy, cw, ch2]) => { cuts += `<rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch2)}" fill="#000"/>`; });
      x += g.w + (ADV[ch] ?? .72);
    });
    const w = x - .72;
    const vb = [-.2, ASC - .2, f(w + .4), f(DESC - ASC + .4)];
    const inner = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>${cuts}</mask></defs><g mask="url(#${id})">${paths}</g>`;
    return { inner, vb };
  }

  globalThis.BUILT = { C, rr, rrp, mascot, wordmark, PART, face, f };
})();
