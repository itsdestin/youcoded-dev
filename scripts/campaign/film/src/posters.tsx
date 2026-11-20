// Posters and web adverts: four ideas, each drawn once and laid out by the shape of the frame,
// so a new size is a new row in Root.tsx rather than a new design. Left-aligned throughout
// (brand §7: one alignment per piece), nothing inside the outer 8%, one purple word per headline.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { C, DMSANS, MONO, OUTFIT } from './brand';
import { Icon, Lockup, Wordmark } from './kit';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
// WHY a handwriting face here only: the "everything" on the crossed-out poster has to read as written
// in by a person over the printed line (Destin, 2026-11-19). It appears nowhere else.
const HAND = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

export type PosterProps = { idea: 'own' | 'ask' | 'quote' | 'everyone' | 'nothing' | 'own-data' | 'own-intelligence' | 'own-software' | 'own-everything' | 'own-all'; fill?: 'buddy' | 'ghost' | 'tile' | 'list' | 'app' | 'wash' };
type Shape = 'tall' | 'square' | 'wide';
const useFrame = () => {
  const { width: W, height: H } = useVideoConfig();
  const r = W / H;
  const shape: Shape = r < 0.9 ? 'tall' : r < 1.35 ? 'square' : 'wide';
  const m = Math.min(W, H) * 0.085;
  // WHY mt/mb: a 9:16 story is shown under the phone app's own buttons, so the guide keeps the top 12% and
  // bottom 20% clear there. Every other shape uses the ordinary margin top and bottom.
  const story = H / W > 1.6;
  return { W, H, r, shape, u: Math.min(W, H) / 60, m, mt: story ? H * 0.125 : m, mb: story ? H * 0.2 : m };
};
/** A headline: "/" breaks lines, *word* is the purple one. */
const Head: React.FC<{ text: string; size: number; dark?: boolean }> = ({ text, size, dark }) => (
  <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 0.98, whiteSpace: 'nowrap', color: dark ? C.nightText : C.plum }}>
    {text.split('/').map((row, i) => (
      <div key={i}>{row.trim().split(/(\*[^*]+\*)/).map((part, j) => part.startsWith('*')
        ? <span key={j} style={{ color: dark ? C.purpleNight : C.purple }}>{part.slice(1, -1)}</span> : <span key={j}>{part}</span>)}</div>
    ))}
  </div>
);
const Eyebrow: React.FC<{ text: string; size: number; dark?: boolean }> = ({ text, size, dark }) => (
  <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: size, letterSpacing: '0.2em', textTransform: 'uppercase', color: dark ? C.purpleNight : C.purple }}>{text}</div>
);
const Body: React.FC<{ children: React.ReactNode; size: number; dark?: boolean; width?: string }> = ({ children, size, dark, width = '100%' }) => (
  <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: size, lineHeight: 1.36, letterSpacing: '-0.012em', color: dark ? C.nightText2 : C.plum2, maxWidth: width }}>{children}</div>
);
/** The foot of every poster: the icon + name lockup, then where to get it. */
// `tight` (square posters): the address sits above the platforms beside the lockup, because one row is too wide there.
const Foot: React.FC<{ u: number; dark?: boolean; row?: boolean; tight?: boolean }> = ({ u, dark, row, tight }) => (
  <div style={{ display: 'flex', flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : 'flex-start', gap: row ? 3 * u : 1.5 * u }}>
    <Lockup icon={5.2 * u} dark={dark} />
    <div style={{ display: 'flex', flexDirection: tight ? 'column' : 'row', alignItems: tight ? 'flex-start' : 'baseline', gap: tight ? 0.3 * u : 1.4 * u, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: 2.1 * u, color: dark ? C.nightText : C.plum, letterSpacing: '-0.01em' }}>youcoded.ai</span>
      <span style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: 1.45 * u, color: dark ? C.nightText2 : C.plum2 }}>Free · Windows · Mac · Linux · Android</span>
    </div>
  </div>
);
const Shot: React.FC<{ src: string; style: React.CSSProperties; u: number; pos?: string }> = ({ src, style, u, pos = '0% 0%' }) => (
  <div style={{ position: 'absolute', borderRadius: 1.5 * u, overflow: 'hidden', background: C.lilac,
    boxShadow: `0 ${1.8 * u}px ${5.5 * u}px rgba(74,38,110,0.24), 0 ${0.3 * u}px ${1 * u}px rgba(74,38,110,0.16), 0 0 0 1px rgba(201,176,219,0.7)`, ...style }}>
    <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos }} />
  </div>
);
const BgDay = () => <AbsoluteFill style={{ background: `linear-gradient(180deg, #FBF6FD 0%, ${C.lavender} 45%, #F1E6F8 100%)` }} />;
const BgNight = () => <AbsoluteFill style={{ background: C.night }} />;

// ---- 1. own: the campaign line, type only ----
const Own: React.FC = () => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const head = shape === 'wide' ? 'software you *own,* / not rent.' : 'software / you *own,* / not rent.';
  const size = shape === 'tall' ? (W - 2 * m) / 4.75 : shape === 'square' ? (W - 2 * m) / 6.9 : Math.min((W - 2 * m) / 8.2, (H - 2 * m) / 3.6);   // WHY 5.9 on a square: at 4.5 the headline and body pushed the footer off the bottom edge, and at 5.9 the gaps were squeezed shut
  return (
    <AbsoluteFill><BgDay />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="free · open source" size={1.5 * u} />
        <div style={{ height: (shape === 'tall' ? 5 : 3) * u }} />
        <Head text={head} size={size} />
        <div style={{ height: (shape === 'wide' ? 3 : 4.5) * u }} />
        <Body size={(shape === 'wide' ? 2.2 : 2.5) * u} width={shape === 'wide' ? '58%' : '88%'}>
          One open app that becomes what you ask for. A page that runs your house. A new look. A feature nobody has built yet. No code.
        </Body>
        <div style={{ flex: 1, minHeight: 4 * u }} />
        <Foot u={u} row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// WHY measured, not flowed (Ask and Everyone): the first versions sized the headline by guess and pinned the
// picture at a fixed height, so on several sizes the headline re-wrapped INTO the picture. Now the headline is
// sized from its longest line, the text block's height is worked out from that, and the picture gets exactly
// the space left between the text and the foot.
const EM = 0.535;                                    // average letter width of DM Sans 900 at -5% tracking, in em
const FOOT_H = 10.2;                                 // the stacked foot (lockup + address row), in base units
const textH = (u: number, size: number, lines: number, bodyLines: number, bodySize: number) =>
  1.5 * u * 1.3 + 3 * u + lines * size + 2.4 * u + bodyLines * bodySize * 1.36;

// ---- 2. ask: the sentence, and the thing it made ----
const Ask: React.FC = () => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const wide = shape === 'wide';
  const footH = shape === 'square' ? 6.2 : FOOT_H;      // a square uses the one-row foot, so the picture is not a thin strip
  const rows = wide ? ['build me a page', 'that runs', 'my house'] : ['build me a page', 'that runs my house'];
  const colW = wide ? W * 0.46 - m : W - 2 * m;
  const longest = Math.max(...rows.map((r) => r.length)) + 0.6;          // + the caret
  const bodySize = 2.3 * u;
  const sq = shape === 'square';                       // a square has the least room: smaller headline, no sub-line, so the picture stays a useful size
  const size = Math.min(colW / (longest * EM), wide ? (H - 2 * m - (FOOT_H + 12) * u) / rows.length : H * (sq ? 0.072 : 0.085));
  const caret = <span style={{ display: 'inline-block', width: size * 0.075, height: size * 0.9, marginLeft: size * 0.07, borderRadius: size, background: C.purple, verticalAlign: '-0.1em' }} />;
  const top = mt + textH(u, size, rows.length, sq ? 0 : 1, bodySize) + (sq ? 1 : 3.5) * u, bottom = mb + footH * u + 3.5 * u;
  const img = 'stills/page-home--youcoded.png';
  // WHY the picture keeps its own 16:10 shape: filling a differently shaped box cut pills and the thermostat dial
  // in half. It is now the whole page, as large as the space allows, left-aligned with the text (or centred in
  // its half on wide posters).
  const fit = (w: number, h: number) => { const iw = Math.min(w, h * 1.6); return { width: iw, height: iw / 1.6 }; };
  const wideBox = fit(W * 0.5 - m, H - 2 * m), tallBox = fit(W - 2 * m, H - top - bottom);
  return (
    <AbsoluteFill><BgDay />
      {wide
        ? <Shot u={u} src={img} style={{ left: W * 0.5, top: (H - wideBox.height) / 2, ...wideBox }} />
        : <Shot u={u} src={img} style={{ left: m, top: top + (H - top - bottom - tallBox.height) / 2, ...tallBox }} />}
      <div style={{ position: 'absolute', left: m, width: colW, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="you asked" size={1.5 * u} />
        <div style={{ height: 3 * u }} />
        <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1.0, whiteSpace: 'nowrap', color: C.plum }}>
          {rows.map((r, i) => <div key={i}>{r}{i === rows.length - 1 && caret}</div>)}
        </div>
        {!sq && <div style={{ height: 2.4 * u }} />}
        {!sq && <Body size={bodySize}>Ask for it. It's yours.</Body>}
        <div style={{ flex: 1 }} />
        <Foot u={u} row={shape === 'square'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 3. quote: the founder, in his own words ----
const Quote: React.FC = () => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const size = shape === 'tall' ? (W - 2 * m) / 10.6 : shape === 'square' ? (W - 2 * m) / 12.4 : Math.min((W - 2 * m) / 18.5, (H - 2 * m) / 7.2);
  const q = shape === 'wide'
    ? '“anything that a private company / can make, an open source community / of passionate people can now / make *better.*”'
    : '“anything that a / private company can / make, an open source / community of / passionate people / can now make *better.*”';
  return (
    <AbsoluteFill><BgNight />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        {/* WHY "from the founder": "time to fight back" is also his phrase, but above this sentence it read as a caption he never gave it, and it was the one place the campaign shouted (two reviews). */}
        <Eyebrow dark text="from the founder" size={1.5 * u} />
        {/* WHY: on a 9:16 story the quote sat at the top over a large empty lower half; a flexible gap centres it instead. */}
        <div style={H / W > 1.5 ? { flex: 1, minHeight: 5 * u } : { height: (shape === 'tall' ? 5 : 3) * u }} />
        <Head dark text={q} size={size} />
        <div style={{ height: 3 * u }} />
        <Body dark size={2.2 * u} width={shape === 'wide' ? '60%' : '90%'}>Destin Moss, who built youcoded without writing code.</Body>
        <div style={{ flex: 1, minHeight: 4 * u }} />
        <Foot u={u} dark row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 4. everyone: the same app, as many different people made it ----
const WALL = ['page-home--golden-sunbreak', 'chat--meadow-mist', 'page-home--meadow-mist', 'office-doc--youcoded', 'page-home--cotton-candy-sky', 'market-themes--youcoded',
  'chat--halftone-dimension', 'chat--golden-sunbreak', 'page-home--midnight', 'page-home--halftone-dimension', 'chat--cotton-candy-sky', 'chat--midnight'].map((n) => `stills/${n}.png`);
const Everyone: React.FC = () => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const wide = shape === 'wide';
  const footH = shape === 'square' ? 6.2 : FOOT_H;      // a square uses the one-row foot, so the picture is not a thin strip
  const rowsT = wide ? ['everyone who', 'installs it can', '*change* it.'] : ['everyone who installs it', 'can *change* it.'];
  const colW = wide ? W * 0.46 - m : W - 2 * m;
  const longest = Math.max(...rowsT.map((r) => r.replace(/\*/g, '').length));
  const bodySize = 2.3 * u, bodyLines = wide ? 3 : 2;
  const size = Math.min(colW / (longest * EM), wide ? (H - 2 * m - (FOOT_H + 12 + bodyLines * 3.2) * u) / rowsT.length : H * 0.085);
  const gap = 1.3 * u;
  // The wall fills exactly the space the text leaves: whole rows top to bottom, bleeding off the sides.
  const area = wide
    ? { left: W * 0.5, top: m, width: W * 0.5 + gap, height: H - 2 * m }
    : { left: -W * 0.04, top: mt + textH(u, size * 0.98, rowsT.length, bodyLines, bodySize) + 3.5 * u, width: W * 1.08, height: 0 };
  if (!wide) area.height = H - area.top - mb - (footH + 3.5) * u;
  const want = wide ? 2 : 3;                                              // tiles across before the bleed
  const rows = Math.max(1, Math.round(area.height / ((area.width / want) * 0.625 + gap)));
  const tileH = (area.height - gap * (rows - 1)) / rows, tileW = tileH * 1.6;
  const cols = Math.ceil(area.width / (tileW + gap)) + 1;
  const offX = wide ? 0 : (area.width - (cols * (tileW + gap) - gap)) / 2;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}><BgDay />
      <div style={{ position: 'absolute', ...area }}>
        {Array.from({ length: rows * cols }).map((_, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          return (
            <div key={i} style={{ position: 'absolute', left: offX + c * (tileW + gap), top: r * (tileH + gap), width: tileW, height: tileH, borderRadius: 0.9 * u, overflow: 'hidden',
              boxShadow: `0 ${0.7 * u}px ${2.2 * u}px rgba(74,38,110,0.2), 0 0 0 1px rgba(201,176,219,0.6)` }}>
              <Img src={staticFile(WALL[(r * 5 + c) % WALL.length])} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 0%' }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: m, width: colW, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="built together" size={1.5 * u} />
        <div style={{ height: 3 * u }} />
        <Head text={rowsT.join(' / ')} size={size} />
        <div style={{ height: 2.4 * u }} />
        <Body size={bodySize} width="94%">A new look, a new page, a feature you wish it had. Ask for it, then share it.</Body>
        <div style={{ flex: 1 }} />
        <Foot u={u} row={shape === 'square'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};


// ---- round two: "you'll own nothing" corrected by hand, and the "own your ..." set ----
// WHY sized from the longest line AND the height left over: the same four lines must fit a tall
// poster, a square and a wide advert without re-wrapping (the earlier posters overflowed when guessed).
// `em` is the measured average letter width of that text (narrow letters like l and i pull it down).
const fitLines = (W: number, H: number, m: number, mt: number, mb: number, u: number, lines: string[], extraEm: number, em = EM) =>
  Math.min((W - 2 * m) / (Math.max(...lines.map((l) => l.length)) * em * 1.04), (H - mt - mb - FOOT_H * u - 3 * u) / (lines.length * 0.98 + extraEm));

/** The printed word, faded and struck through twice with a marker, with the correction written above it. */
// `anchorRight`: on the wide shape the struck word ends the line, so handwriting starting at its left edge ran off the poster.
const Struck: React.FC<{ word: string; fix: string; size: number; anchorRight?: boolean }> = ({ word, fix, size, anchorRight }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    <span style={{ color: C.nightText2, opacity: 0.55 }}>{word}</span>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', left: '-4%', width: '106%', top: '34%', height: '44%', overflow: 'visible' }}>
      <path d="M1,24 C18,14 40,27 62,17 S90,13 99,18" fill="none" stroke={C.purpleNight} strokeWidth={size * 0.075} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d="M3,30 C25,22 48,33 72,24 S92,23 98,26" fill="none" stroke={C.purpleNight} strokeWidth={size * 0.05} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
    </svg>
    <span style={{ position: 'absolute', ...(anchorRight ? { right: '-2%' } : { left: '1%' }), bottom: '80%', fontFamily: HAND, fontWeight: 700, fontSize: size * 1.2, letterSpacing: '-0.01em', lineHeight: 1,
      color: C.purpleNight, transform: 'rotate(-5deg)', transformOrigin: '0% 100%', whiteSpace: 'nowrap' }}>{fix}</span>
  </span>
);
// WHY one size for the whole family (Destin, 2026-11-19: "posters should look consistent... why is data so
// damn big"): every poster of one shape uses the SAME headline size, the same top edge, margins and foot.
// The size is the largest at which the longest line of ANY poster in the family still fits that shape.
const GAP = 0.98;                                    // room above the struck word for the handwriting, in em
const NOTHING_LINES = (wide: boolean) => wide ? ["you'll own nothing.", "and you'll be happy."] : ["you'll own", 'nothing.', "and you'll", 'be happy.'];
const familySize = (W: number, H: number, m: number, mt: number, mb: number, u: number, wide: boolean) => Math.min(
  fitLines(W, H, m, mt, mb, u, NOTHING_LINES(wide), GAP, wide ? 0.47 : 0.45),
  fitLines(W, H, m, mt, mb, u, ['own your', 'intelligence.'], GAP, 0.41));
// Something for the empty space under a short headline (Destin, 2026-11-19). The SAME element, size and
// place on every poster of a shape, so it adds to the family's look instead of breaking it.
const Fill: React.FC<{ kind?: PosterProps['fill']; dark?: boolean; word: string }> = ({ kind, dark, word }) => {
  const { width: W, height: H } = useVideoConfig();
  const s = Math.min(W, H);
  if (!kind || kind === 'list' || kind === 'app') return null;   // those two are laid out inside the poster, not behind it
  if (kind === 'wash') return (    // a deeper colour field: the paper warms toward the bottom corner instead of staying flat
    <AbsoluteFill style={{ background: dark
      // wider and dimmer on night: the first try read as a glowing ball in the corner, which the brand guide rules out
      ? `radial-gradient(170% 120% at 100% 100%, #55236A 0%, #3A1A52 30%, #24113A 58%, ${C.night} 90%)`
      : `radial-gradient(120% 90% at 100% 100%, #F1B9DC 0%, #E2C6F2 40%, #FBF6FD 82%)` }} />
  );
  if (kind === 'buddy') return (   // the mascot's tile, large, leaning in from the bottom-right corner
    <div style={{ position: 'absolute', right: -0.1 * s, bottom: -0.16 * s, width: 0.62 * s, height: 0.62 * s, transform: 'rotate(-10deg)' }}><Icon size={0.62 * s} /></div>
  );
  if (kind === 'tile') return (    // the icon's rounded-square shape in the logo gradient: the piece's one bold moment
    <div style={{ position: 'absolute', right: -0.16 * s, bottom: -0.24 * s, width: 0.7 * s, height: 0.7 * s, borderRadius: 0.16 * s, background: GRADIENT_DIAG, transform: 'rotate(-12deg)', opacity: dark ? 0.9 : 1 }} />
  );
  return (                         // the poster's own word, very large and barely darker than the paper, running off the edge
    <div style={{ position: 'absolute', left: -0.03 * W, bottom: -0.085 * s, fontFamily: DMSANS, fontWeight: 900, fontSize: 0.5 * s, letterSpacing: '-0.06em', lineHeight: 1, whiteSpace: 'nowrap',
      color: dark ? '#1E122B' : '#EBDDF4' }}>{word}</div>
  );
};
const GRADIENT_DIAG = `linear-gradient(135deg, ${C.gradA}, ${C.gradB})`;
const Nothing: React.FC<{ fill?: PosterProps['fill'] }> = ({ fill }) => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const wide = shape === 'wide';
  const size = familySize(W, H, m, mt, mb, u, wide);
  const row: React.CSSProperties = { fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 0.98, whiteSpace: 'nowrap', color: C.nightText };
  return (
    <AbsoluteFill><BgNight /><Fill kind={fill} dark word="everything." />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        {wide ? (<>
          <div style={{ ...row, marginTop: GAP * size }}>you'll own<span style={{ display: 'inline-block', width: 0.26 * size }} /><Struck word="nothing." fix="everything." size={size} anchorRight /></div>
          <div style={row}>and you'll be happy.</div>
        </>) : (<>
          <div style={row}>you'll own</div>
          <div style={{ ...row, marginTop: GAP * size }}><Struck word="nothing." fix="everything." size={size} /></div>
          <div style={row}>and you'll</div>
          <div style={row}>be happy.</div>
        </>)}
        <div style={{ flex: 1, minHeight: 3 * u }} />
        <Foot u={u} dark row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};
const NOUNS = ['data', 'intelligence', 'software', 'everything'];
const APP_SHOT: Record<string, string> = { data: 'stills/chat--meadow-mist.png', intelligence: 'stills/chat--cotton-candy-sky.png', software: 'stills/chat--golden-sunbreak.png', everything: 'stills/chat--midnight.png' };
const OwnSet: React.FC<{ noun: string; fill?: PosterProps['fill'] }> = ({ noun, fill }) => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const wide = shape === 'wide';
  const dark = noun === 'everything';               // WHY: the last of the four is the closer, so it alone is on night
  const size = familySize(W, H, m, mt, mb, u, wide);
  const first = noun === 'everything' ? 'own' : 'own your';
  // 'list': all four words of the set on every poster, this poster's one in purple. Five lines is exactly the height
  // of the crossed-out poster's headline, so the whole family lines up.
  const listSize = wide ? Math.min(size, (H - mt - mb - FOOT_H * u - 3 * u) / 4.95) : size;
  const pale = dark ? '#3A2A49' : '#DECDEB';
  return (
    <AbsoluteFill>{dark ? <BgNight /> : <BgDay />}<Fill kind={fill} dark={dark} word={`${noun}.`} />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        {fill === 'list' ? (
          <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: listSize, letterSpacing: '-0.05em', lineHeight: 0.98, whiteSpace: 'nowrap', color: dark ? C.nightText : C.plum }}>
            <div>{first}</div>
            {NOUNS.map((n) => <div key={n} style={{ color: n === noun ? (dark ? C.purpleNight : C.purple) : pale }}>{n}.</div>)}
          </div>
        ) : (<>
          {/* On the wide shape the struck poster starts one handwriting-gap down; match it so the first lines sit level. */}
          {wide && fill !== 'app' && <div style={{ height: GAP * size }} />}
          <Head text={`${first} / *${noun}.*`} size={size} dark={dark} />
        </>)}
        {fill === 'app' ? (
          // the real app, in a different look on each poster, filling exactly the space between the words and the foot
          <div style={{ flex: 1, position: 'relative', marginTop: 4 * u, marginBottom: 4 * u, minHeight: 3 * u }}>
            <Shot src={APP_SHOT[noun]} u={u} style={{ left: 0, top: 0, right: wide ? '30%' : 0, bottom: 0 }} />
          </div>
        ) : <div style={{ flex: 1, minHeight: 3 * u }} />}
        <Foot u={u} dark={dark} row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// ONE poster for the whole "own your ..." idea (Destin, 2026-11-20: "i didn't want to create 5 different posters...
// the various 'own your x/y/z' should just be a single poster"). Same headline size, edges and foot as the
// crossed-out poster it hangs beside; five lines is exactly that poster's headline height.
const OwnAll: React.FC = () => {
  const { W, H, shape, u, m, mt, mb } = useFrame();
  const wide = shape === 'wide';
  const size = wide ? Math.min(familySize(W, H, m, mt, mb, u, wide), (H - mt - mb - FOOT_H * u - 3 * u) / 4.95) : familySize(W, H, m, mt, mb, u, wide);
  return (
    <AbsoluteFill><BgDay /><Fill kind="wash" word="" />
      <div style={{ position: 'absolute', left: m, right: m, top: mt, bottom: mb, display: 'flex', flexDirection: 'column' }}>
        <Head text="own your / data. / intelligence. / software. / *everything.*" size={size} />
        <div style={{ flex: 1, minHeight: 3 * u }} />
        <Foot u={u} row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// WHY 'wash' by default: Destin picked the colour field to fill the space under short headlines (2026-11-20).
export const Poster: React.FC<PosterProps> = ({ idea, fill = 'wash' }) => idea === 'own-all' ? <OwnAll /> : idea === 'nothing' ? <Nothing fill={fill} /> : idea.startsWith('own-') ? <OwnSet noun={idea.slice(4)} fill={fill} />
  : idea === 'own' ? <Own /> : idea === 'ask' ? <Ask /> : idea === 'quote' ? <Quote /> : <Everyone />;

// ---- web display adverts: the campaign line at the standard banner sizes ----
/** One design for every standard slot: the line, the lockup, the address. Tiny slots drop the address. */
export const Banner: React.FC = () => {
  const { width: W, height: H } = useVideoConfig();
  const r = W / H;
  const strip = r > 2.6, tower = r < 0.6;
  const pad = Math.min(W, H) * (strip ? 0.16 : 0.085);
  // WHY: a billboard (970x250) is too short for one line at a readable size, so it stacks the headline in two
  // lines beside a smaller lockup; only true leaderboards (728x90, 320x50) keep the single line.
  if (strip && r < 5) {
    const hs = Math.min((H - 2 * pad) / 2.1, (W - 2 * pad - H * 0.2 - H * 1.32) / 7.9);
    return (
      <AbsoluteFill style={{ background: C.lavender, boxShadow: `inset 0 0 0 ${Math.max(1, H * 0.008)}px ${C.border}` }}>
        <div style={{ position: 'absolute', left: pad, right: pad, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: H * 0.2 }}>
          <Head text="software you *own,* / not rent." size={hs} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: H * 0.06, flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: H * 0.08 }}><Icon size={H * 0.32} /><Wordmark size={H * 0.22} /></div>
            <span style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: H * 0.1, color: C.plum }}>youcoded.ai</span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  if (strip) {
    const hs = Math.min(H * 0.36, (W - 2 * pad - H * 0.3 - H * 2.1) / 12.6);
    return (
      <AbsoluteFill style={{ background: C.lavender, boxShadow: `inset 0 0 0 ${Math.max(1, H * 0.008)}px ${C.border}` }}>
        <div style={{ position: 'absolute', left: pad, right: pad, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: H * 0.3 }}>
          <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: hs, letterSpacing: '-0.05em', color: C.plum, whiteSpace: 'nowrap' }}>software you <span style={{ color: C.purple }}>own,</span> not rent.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: H * 0.12, flex: 'none' }}><Icon size={H * 0.5} /><Wordmark size={H * 0.34} /></div>
        </div>
      </AbsoluteFill>
    );
  }
  const hs = tower ? (W - 2 * pad) / 4.4 : Math.min((W - 2 * pad) / 4.5, (H - 2 * pad) / 5.4);
  const icon = Math.min(W, H) * (tower ? 0.2 : 0.13);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #FBF6FD 0%, ${C.lavender} 45%, #F1E6F8 100%)`, boxShadow: `inset 0 0 0 ${Math.max(1, Math.min(W, H) * 0.004)}px ${C.border}` }}>
      <div style={{ position: 'absolute', left: pad, right: pad, top: pad, bottom: pad, display: 'flex', flexDirection: 'column' }}>
        <Head text="software / you *own,* / not rent." size={hs} />
        <div style={{ height: hs * 0.32 }} />
        {/* the narrowest slot drops the sentence: at 160 px wide it would be about 8 px tall */}
        {r > 0.4 && <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: hs * 0.27, lineHeight: 1.3, color: C.plum2, letterSpacing: '-0.01em' }}>One open app that becomes what you ask for.</div>}
        {/* WHY: tall "skyscraper" slots had a blank middle third; the Home page (a real frame from the film) fills it. */}
        {tower && r > 0.4          /* the narrowest slot (160 wide) shows only an unreadable sliver, so it stays type-only */
          ? <div style={{ flex: 1, margin: `${hs * 0.45}px 0`, borderRadius: W * 0.03, overflow: 'hidden', boxShadow: `0 ${W * 0.02}px ${W * 0.06}px rgba(74,38,110,0.22), 0 0 0 1px rgba(201,176,219,0.7)` }}>
              <Img src={staticFile('stills/page-home--youcoded.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '34% 30%' }} />
            </div>
          : <div style={{ flex: 1 }} />}
        <div style={{ display: 'flex', flexDirection: tower ? 'column' : 'row', alignItems: tower ? 'flex-start' : 'center', justifyContent: 'space-between', gap: icon * 0.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: icon * 0.25 }}><Icon size={icon} /><Wordmark size={icon * 0.72} /></div>
          <span style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: icon * 0.42, color: C.plum }}>youcoded.ai</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
