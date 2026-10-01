// defs.js — round-3 brand options, built ONLY from what YouCoded already has: the site's
// theme palette and wallpapers (copied from youcoded/docs/index.html THEMES), the theme
// mascots (docs/mascots/*.rig.svg) and the app icon mascot. WHY: Destin asked for name styles
// and name/mascot/icon combinations that fit the current website and app, not new brands.
// Classic script: Chrome refuses module scripts over file://.
window.D = (() => {
  // A subset of the site's own themes, values verbatim from index.html.
  const TH = {
    cotton:  { name: 'Cotton Candy Sky', dark: false, panel: '236,221,240', op: .7, accent: '#8B47B8', fg: '#21152C', muted: '#695775', edge: '#B597C6', wall: 'assets/cotton-candy-sky.webp', mascot: 'assets/cotton-candy-sky.rig.svg', font: "'Comfortaa'" },
    midnight:{ name: 'Midnight', dark: true, panel: '22,27,34', op: .72, accent: '#88B4D8', fg: '#E6EDF3', muted: '#8B949E', edge: '#30363D', bg: 'radial-gradient(900px 500px at 20% -10%, #17283a 0%, transparent 60%), linear-gradient(#0D1117,#0A0E14)', mascot: 'assets/icon-mascot.svg' },
    golden:  { name: 'Golden Sunbreak', dark: true, panel: '20,14,26', op: .72, accent: '#ffc030', fg: '#F8E8C8', muted: '#917950', edge: '#3C3223', wall: 'assets/golden-sunbreak.webp', mascot: 'assets/golden-sunbreak.rig.svg' },
    straw:   { name: 'Strawberry Kitty', dark: false, panel: '252,228,233', op: .55, accent: '#CC4060', fg: '#3A1420', muted: '#A26179', edge: '#E09AA8', wall: 'assets/strawberry-kitty.webp', mascot: 'assets/strawberry-kitty.rig.svg' },
    meadow:  { name: 'Meadow Mist', dark: false, panel: '221,233,218', op: .58, accent: '#2F7D55', fg: '#041008', muted: '#465B4E', edge: '#8FB191', wall: 'assets/meadow-mist.webp', mascot: 'assets/meadow-mist.rig.svg' },
  };
  const bgOf = (t) => t.wall ? `url(${t.wall}) center/cover` : t.bg;
  // The site's glass panel (same recipe as .nav in index.html: panel colour at its opacity, blur, hairline edge).
  const glass = (t, r = 22) => `background:rgba(${t.panel},${t.op});backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,${t.dark ? .1 : .5});border-radius:${r}px;box-shadow:0 8px 30px rgba(0,0,0,${t.dark ? .35 : .08})`;
  const M = (src, w, style = '') => `<img src="${src}" width="${w}" height="${w}" style="display:block;${style}">`;

  // ---------------- Ways to write the name ----------------
  // Each returns html for the name at font-size `s`, coloured from theme `t`.
  const W = [
    { id: 'w1', label: 'DM Sans, bold', note: 'Today\'s site font, cleaned up: "You" in the theme colour.',
      f: (t, s) => `<span style="font:800 ${s}px 'DM Sans';letter-spacing:-.035em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
    { id: 'w2', label: 'DM Sans, lowercase', note: 'Same font, softer in lowercase.',
      f: (t, s) => `<span style="font:700 ${s}px 'DM Sans';letter-spacing:-.04em;color:${t.fg}"><span style="color:${t.accent}">you</span>coded</span>` },
    { id: 'w3', label: 'Comfortaa', note: 'The Cotton Candy theme\'s own font: round, airy.',
      f: (t, s) => `<span style="font:700 ${s}px 'Comfortaa';letter-spacing:-.03em;color:${t.fg}"><span style="color:${t.accent}">you</span>coded</span>` },
    { id: 'w4', label: 'Nunito, extra bold', note: 'The Meadow Mist theme\'s font: rounded but sturdy.',
      f: (t, s) => `<span style="font:900 ${s}px 'Nunito';letter-spacing:-.02em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
    { id: 'w5', label: 'Fredoka', note: 'Bubbly, matches the mascot\'s soft corners.',
      f: (t, s) => `<span style="font:600 ${s}px 'Fredoka';letter-spacing:-.01em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
    { id: 'w6', label: 'Baloo, lowercase', note: 'Chunky and friendly, like a sticker.',
      f: (t, s) => `<span style="font:800 ${s}px 'Baloo 2';letter-spacing:-.02em;line-height:1;color:${t.fg}"><span style="color:${t.accent}">you</span>coded</span>` },
    { id: 'w7', label: 'Quicksand', note: 'Light and rounded; the quietest option.',
      f: (t, s) => `<span style="font:700 ${s}px 'Quicksand';letter-spacing:-.02em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
    { id: 'w8', label: 'Bricolage', note: 'A bit of quirk in the letter shapes; still clean.',
      f: (t, s) => `<span style="font:800 ${s}px 'Bricolage Grotesque';letter-spacing:-.04em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
    { id: 'w9', label: 'Serif "You"', note: '"You" in a soft italic serif, "Coded" in the site font: the "yours" message, written in.',
      f: (t, s) => `<span style="color:${t.fg};white-space:nowrap"><span style="font:italic 800 ${s * 1.08}px 'Fraunces';font-variation-settings:'SOFT' 100,'opsz' 144;letter-spacing:-.02em;color:${t.accent}">You</span><span style="font:800 ${s}px 'DM Sans';letter-spacing:-.035em">Coded</span></span>` },
    { id: 'w10', label: 'Wide capitals', note: 'Today\'s header idea (all caps), redone in one wide font.',
      f: (t, s) => `<span style="font:700 ${s * .72}px 'Unbounded';letter-spacing:.02em;color:${t.fg}"><span style="color:${t.accent}">YOU</span>CODED</span>` },
    { id: 'w11', label: 'Gradient', note: 'DM Sans with a fill that runs from the theme colour into pink.',
      f: (t, s) => `<span style="font:900 ${s}px 'DM Sans';letter-spacing:-.045em;background:linear-gradient(100deg,${t.accent} 10%,#E36FB8 60%,${t.accent} 100%);-webkit-background-clip:text;background-clip:text;color:transparent">YouCoded</span>` },
    { id: 'w12', label: 'Pixel', note: 'For game-style themes; reads as playful.',
      f: (t, s) => `<span style="font:700 ${s}px 'Pixelify Sans';letter-spacing:.01em;color:${t.fg}"><span style="color:${t.accent}">You</span>Coded</span>` },
  ];

  // ---------------- Name + mascot combinations ----------------
  // Shown with W1's lettering so only the combination changes. `t.mascot` is the theme's own
  // mascot, because on the site the logo would wear whichever theme is on.
  const name = (t, s) => W[0].f(t, s);
  const eyeO = (t, s) => `<span style="display:inline-block;position:relative;width:${s * .56}px;height:${s * .56}px;border:${s * .12}px solid ${t.accent};border-radius:${s * .2}px;vertical-align:${-s * .02}px;margin:0 ${s * .015}px"><span style="position:absolute;left:22%;top:20%;width:18%;height:42%;border-radius:40%;background:${t.accent}"></span><span style="position:absolute;right:22%;top:20%;width:18%;height:42%;border-radius:40%;background:${t.accent}"></span></span>`;
  const L = [
    { id: 'l1', label: 'Mascot tile + name', note: 'Today\'s header, simplified: the theme\'s mascot in a glass tile, then the name. No "Assistant" or tagline.',
      f: (t, s) => `<div style="display:flex;align-items:center;gap:${s * .45}px"><div style="width:${s * 1.6}px;height:${s * 1.6}px;display:grid;place-items:center;${glass(t, s * .45)}">${M(t.mascot, s * 1.45)}</div>${name(t, s)}</div>` },
    { id: 'l2', label: 'Mascot + name, no tile', note: 'The mascot stands free next to the name.',
      f: (t, s) => `<div style="display:flex;align-items:center;gap:${s * .2}px">${M(t.mascot, s * 1.75)}${name(t, s)}</div>` },
    { id: 'l3', label: 'Mascot is the "o"', note: 'The mascot\'s body takes the place of the first "o".',
      f: (t, s) => `<div style="display:flex;align-items:baseline;font:800 ${s}px 'DM Sans';letter-spacing:-.035em;color:${t.fg}"><span style="color:${t.accent}">Y</span><span style="display:inline-block;width:${s * .78}px;height:${s * .6}px;position:relative;margin:0 ${-s * .02}px"><img src="${t.mascot}" style="position:absolute;width:${s * 1.3}px;height:${s * 1.3}px;left:${-s * .26}px;top:${-s * .5}px"></span><span style="color:${t.accent}">u</span>Coded</div>` },
    { id: 'l4', label: 'Eyes in both "o"s', note: 'Both "o"s become the mascot\'s rounded head with its two eyes.',
      f: (t, s) => `<div style="font:800 ${s}px 'DM Sans';letter-spacing:-.035em;color:${t.fg};white-space:nowrap"><span style="color:${t.accent}">Y</span>${eyeO(t, s)}<span style="color:${t.accent}">u</span>C${eyeO({ ...t, accent: t.fg }, s)}ded</div>` },
    { id: 'l5', hs: .8, label: 'Peeking over', note: 'The mascot peeks over the top of the name.',
      f: (t, s) => `<div style="position:relative;padding-top:${s * .78}px"><div style="position:absolute;left:${s * 2.05}px;top:0;width:${s * 1.7}px;height:${s * 1.0}px;overflow:hidden">${M(t.mascot, s * 1.7)}</div><div style="position:relative">${name(t, s)}</div></div>` },
    { id: 'l6', hs: .75, label: 'Sitting on the name', note: 'The mascot sits on top of the "C", feet on the letter.',
      f: (t, s) => `<div style="position:relative;padding-top:${s * 1.2}px">${M(t.mascot, s * 1.55, `position:absolute;left:${s * 1.86}px;top:${-s * .08}px`)}${name(t, s)}</div>` },
    { id: 'l7', hs: .55, label: 'Stacked', note: 'Mascot above, name below. For the app\'s welcome screen, splash and social posts.',
      f: (t, s) => `<div style="display:flex;flex-direction:column;align-items:center;gap:${s * .05}px">${M(t.mascot, s * 2)}${name(t, s * .9)}</div>` },
    { id: 'l8', label: 'Name in a glass pill', note: 'The name sits in a glass pill, with the mascot popping out of its left end.',
      f: (t, s) => `<div style="position:relative;padding-left:${s * 1.05}px"><div style="padding:${s * .28}px ${s * .55}px ${s * .28}px ${s * .95}px;${glass(t, 999)}">${name(t, s * .9)}</div>${M(t.mascot, s * 1.6, `position:absolute;left:${-s * .1}px;top:50%;transform:translateY(-52%)`)}</div>` },
  ];

  // ---------------- App icon ideas ----------------
  // Every icon is a function of its box size; tile radius ~22.5% like Windows/Mac tiles.
  const MAS = 'assets/icon-mascot.svg';
  const tile = (bg, inner, extra = '') => (S) => `<div style="width:${S}px;height:${S}px;border-radius:${S * .225}px;overflow:hidden;position:relative;background:${bg};${extra}">${inner(S)}</div>`;
  const center = (src, k, dy = 0) => (S) => `<img src="${src}" style="position:absolute;width:${S * k}px;height:${S * k}px;left:${S * (1 - k) / 2}px;top:${S * (1 - k) / 2 + S * dy}px">`;
  const LILAC = 'linear-gradient(160deg,#F1E6F7,#E1CDEE)';
  const PURPLE = 'linear-gradient(160deg,#A260D3,#6E2FA0)';
  const A = [
    { id: 'a1', label: 'Today', note: 'The current icon, for comparison.', f: (S) => `<img src="assets/icon.svg" width="${S}" height="${S}" style="display:block">` },
    { id: 'a2', label: 'Purple tile', note: 'Same mascot, on the site\'s purple instead of pale lilac: easier to spot in a taskbar.',
      f: tile(PURPLE, center(MAS, .92, .02), 'box-shadow:inset 0 1px 0 rgba(255,255,255,.35)') },
    { id: 'a3', label: 'Sky tile', note: 'The website\'s Cotton Candy sky as the background.',
      f: tile('url(assets/cotton-candy-sky.webp) 62% 30%/260%', center(MAS, .92, .02)) },
    { id: 'a4', label: 'Close-up face', note: 'Zoomed in on the mascot\'s face so its eyes stay clear when the icon is small.',
      f: tile(PURPLE, (S) => `<img src="${MAS}" style="position:absolute;width:${S * 1.75}px;height:${S * 1.75}px;left:${-S * .375}px;top:${-S * .3}px">`) },
    { id: 'a5', label: 'Peeking up', note: 'The mascot rises from the bottom edge and waves.',
      f: tile(LILAC, (S) => `<img src="${MAS}" style="position:absolute;width:${S * 1.12}px;height:${S * 1.12}px;left:${-S * .06}px;top:${S * .22}px">`, 'border:1px solid #D6C0E2') },
    { id: 'a6', label: '"Y" with mascot', note: 'A big "Y" for YouCoded, the mascot sitting in its fork.',
      f: tile(PURPLE, (S) => `<div style="position:absolute;inset:0;display:grid;place-items:center;font:800 ${S * .86}px/1 'DM Sans';color:#fff;padding-top:${S * .1}px;letter-spacing:-.04em">Y</div><img src="${MAS}" style="position:absolute;width:${S * .55}px;height:${S * .55}px;left:${S * .225}px;top:${S * -.02}px">`) },
    { id: 'a7', label: '"yc" + mascot', note: 'Lowercase "yc" with the mascot peeking over the letters.',
      f: tile(LILAC, (S) => `<div style="position:absolute;left:0;right:0;bottom:${S * .1}px;text-align:center;font:800 ${S * .5}px/1 'DM Sans';letter-spacing:-.05em;color:#6E2FA0">yc</div><div style="position:absolute;left:${S * .22}px;top:${S * .06}px;width:${S * .56}px;height:${S * .36}px;overflow:hidden"><img src="${MAS}" style="width:${S * .56}px;height:${S * .56}px;display:block"></div>`, 'border:1px solid #D6C0E2') },
    { id: 'a8', label: 'Glass tile', note: 'A frosted glass tile, like the mascot tiles across the top of the website.',
      f: tile('linear-gradient(160deg,rgba(255,255,255,.85),rgba(232,214,244,.75))', center(MAS, .86, .02), 'border:1.5px solid rgba(139,71,184,.55);box-shadow:inset 0 0 0 3px rgba(255,255,255,.6)') },
    { id: 'a9', label: 'No tile', note: 'Just the mascot, no square behind it.',
      f: (S) => `<div style="width:${S}px;height:${S}px;position:relative">${center(MAS, 1.12, 0)(S)}</div>` },
    { id: 'a10', label: 'Follows your theme', note: 'The icon swaps to your theme\'s mascot and colours. The default is the purple tile; these are other themes.',
      f: tile(PURPLE, center(MAS, .92, .02)),
      variants: [['url(assets/golden-sunbreak.webp) center/300%', 'assets/golden-sunbreak.rig.svg'], ['linear-gradient(160deg,#2a2240,#0e0b18)', 'assets/halftone-dimension.rig.svg'], ['linear-gradient(160deg,#FCE4E9,#F3B6C4)', 'assets/strawberry-kitty.rig.svg'], ['linear-gradient(160deg,#E8F2E4,#B9D6B3)', 'assets/meadow-mist.rig.svg']] },
  ];

  // ---------------- Website (browser tab) icon ideas ----------------
  const F = [
    { id: 'f1', label: 'Today', note: 'Purple square with the flat white mascot (squint eyes).', f: (S) => `<img src="assets/favicon.svg" width="${S}" height="${S}" style="display:block">` },
    { id: 'f2', label: 'Same as app icon', note: 'The app icon\'s purple tile, so the tab and the taskbar match.', f: A[1].f },
    { id: 'f3', label: 'Mascot, no tile', note: 'Just the glossy mascot.', f: (S) => `<div style="width:${S}px;height:${S}px;position:relative">${center(MAS, 1.2, 0)(S)}</div>` },
    { id: 'f4', label: 'Face only', note: 'The mascot\'s face filling a purple circle: two eyes read even at tab size.',
      f: (S) => `<div style="width:${S}px;height:${S}px;border-radius:50%;overflow:hidden;position:relative;background:${PURPLE}"><img src="${MAS}" style="position:absolute;width:${S * 2.3}px;height:${S * 2.3}px;left:${-S * .65}px;top:${-S * .5}px"></div>` },
    { id: 'f5', label: '"Y" in purple', note: 'A white "Y" on the purple tile.',
      f: (S) => `<div style="width:${S}px;height:${S}px;border-radius:${S * .26}px;background:${PURPLE};display:grid;place-items:center;font:800 ${S * .74}px/1 'DM Sans';color:#fff;letter-spacing:-.04em;padding-top:${S * .04}px">Y</div>` },
    { id: 'f6', label: '"yc" in purple', note: 'Lowercase "yc" on the purple tile.',
      f: (S) => `<div style="width:${S}px;height:${S}px;border-radius:${S * .26}px;background:${PURPLE};display:grid;place-items:center;font:800 ${S * .56}px/1 'DM Sans';color:#fff;letter-spacing:-.06em;padding-bottom:${S * .06}px">yc</div>` },
    { id: 'f7', label: 'Follows the site theme', note: 'The tab icon changes with the site\'s theme, using that theme\'s mascot.', f: (S) => `<div style="width:${S}px;height:${S}px;border-radius:${S * .26}px;overflow:hidden;position:relative;background:url(assets/cotton-candy-sky.webp) 62% 30%/400%">${center('assets/cotton-candy-sky.rig.svg', 1.15, .03)(S)}</div>`,
      variants: [['url(assets/golden-sunbreak.webp) center/400%', 'assets/golden-sunbreak.rig.svg'], ['url(assets/strawberry-kitty.webp) center/400%', 'assets/strawberry-kitty.rig.svg'], ['url(assets/meadow-mist.webp) center/400%', 'assets/meadow-mist.rig.svg']] },
  ];
  return { TH, bgOf, glass, M, W, L, A, F, tile, center };
})();
