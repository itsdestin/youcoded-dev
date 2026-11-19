// Posters and web adverts: four ideas, each drawn once and laid out by the shape of the frame,
// so a new size is a new row in Root.tsx rather than a new design. Left-aligned throughout
// (brand §7: one alignment per piece), nothing inside the outer 8%, one purple word per headline.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { C, DMSANS, MONO, OUTFIT } from './brand';
import { Icon, Lockup, Wordmark } from './kit';

export type PosterProps = { idea: 'own' | 'ask' | 'quote' | 'everyone' };
type Shape = 'tall' | 'square' | 'wide';
const useFrame = () => {
  const { width: W, height: H } = useVideoConfig();
  const r = W / H;
  const shape: Shape = r < 0.9 ? 'tall' : r < 1.35 ? 'square' : 'wide';
  return { W, H, r, shape, u: Math.min(W, H) / 60, m: Math.min(W, H) * 0.085 };
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
  const { W, H, shape, u, m } = useFrame();
  const head = shape === 'wide' ? 'software you *own,* / not rent.' : 'software / you *own,* / not rent.';
  const size = shape === 'tall' ? (W - 2 * m) / 4.75 : shape === 'square' ? (W - 2 * m) / 5.9 : Math.min((W - 2 * m) / 8.2, (H - 2 * m) / 3.6);   // WHY 5.9 on a square: at 4.5 the headline and body pushed the footer off the bottom edge
  return (
    <AbsoluteFill><BgDay />
      <div style={{ position: 'absolute', left: m, right: m, top: m, bottom: m, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="free · open source" size={1.5 * u} />
        <div style={{ height: (shape === 'tall' ? 5 : 3) * u }} />
        <Head text={head} size={size} />
        <div style={{ height: (shape === 'tall' ? 4 : 3) * u }} />
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
  const { W, H, shape, u, m } = useFrame();
  const wide = shape === 'wide';
  const footH = shape === 'square' ? 6.2 : FOOT_H;      // a square uses the one-row foot, so the picture is not a thin strip
  const rows = wide ? ['build me a page', 'that runs', 'my house'] : ['build me a page', 'that runs my house'];
  const colW = wide ? W * 0.46 - m : W - 2 * m;
  const longest = Math.max(...rows.map((r) => r.length)) + 0.6;          // + the caret
  const bodySize = 2.3 * u;
  const size = Math.min(colW / (longest * EM), wide ? (H - 2 * m - (FOOT_H + 12) * u) / rows.length : H * 0.085);
  const caret = <span style={{ display: 'inline-block', width: size * 0.075, height: size * 0.9, marginLeft: size * 0.07, borderRadius: size, background: C.purple, verticalAlign: '-0.1em' }} />;
  const top = m + textH(u, size, rows.length, 1, bodySize) + 3.5 * u, bottom = m + footH * u + 3.5 * u;
  const img = 'stills/page-home--youcoded.png';
  return (
    <AbsoluteFill><BgDay />
      {wide
        ? <Shot u={u} src={img} style={{ left: W * 0.5, top: m, width: W * 0.5 - m, height: H - 2 * m }} />
        : <Shot u={u} src={img} style={{ left: m, right: m, top, bottom }} />}
      <div style={{ position: 'absolute', left: m, width: colW, top: m, bottom: m, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="you asked" size={1.5 * u} />
        <div style={{ height: 3 * u }} />
        <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1.0, whiteSpace: 'nowrap', color: C.plum }}>
          {rows.map((r, i) => <div key={i}>{r}{i === rows.length - 1 && caret}</div>)}
        </div>
        <div style={{ height: 2.4 * u }} />
        <Body size={bodySize}>Ask for it. It builds it. It's yours.</Body>
        <div style={{ flex: 1 }} />
        <Foot u={u} row={shape === 'square'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 3. quote: the founder, in his own words ----
const Quote: React.FC = () => {
  const { W, H, shape, u, m } = useFrame();
  const size = shape === 'tall' ? (W - 2 * m) / 10.6 : shape === 'square' ? (W - 2 * m) / 12.4 : Math.min((W - 2 * m) / 18.5, (H - 2 * m) / 7.2);
  const q = shape === 'wide'
    ? '“anything that a private company / can make, an open source community / of passionate people can now / make *better.*”'
    : '“anything that a / private company can / make, an open source / community of / passionate people / can now make *better.*”';
  return (
    <AbsoluteFill><BgNight />
      <div style={{ position: 'absolute', left: m, right: m, top: m, bottom: m, display: 'flex', flexDirection: 'column' }}>
        {/* WHY "from the founder": "time to fight back" is also his phrase, but above this sentence it read as a caption he never gave it, and it was the one place the campaign shouted (two reviews). */}
        <Eyebrow dark text="from the founder" size={1.5 * u} />
        {/* WHY: on a 9:16 story the quote sat at the top over a large empty lower half; a flexible gap centres it instead. */}
        <div style={H / W > 1.5 ? { flex: 1, minHeight: 5 * u } : { height: (shape === 'tall' ? 5 : 3) * u }} />
        <Head dark text={q} size={size} />
        <div style={{ height: 3 * u }} />
        <Body dark size={2.2 * u} width={shape === 'wide' ? '60%' : '90%'}>Destin Moss, who built youcoded without writing a line of code.</Body>
        <div style={{ flex: 1, minHeight: 4 * u }} />
        <Foot u={u} dark row={shape !== 'tall'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 4. everyone: the same app, as many different people made it ----
const WALL = ['page-home--golden-sunbreak', 'chat--meadow-mist', 'page-money--midnight', 'office-doc--youcoded', 'page-home--cotton-candy-sky', 'market-themes--youcoded',
  'page-money--halftone-dimension', 'chat--golden-sunbreak', 'page-home--midnight', 'page-money--meadow-mist', 'chat--cotton-candy-sky', 'page-money--cotton-candy-sky'].map((n) => `stills/${n}.png`);
const Everyone: React.FC = () => {
  const { W, H, shape, u, m } = useFrame();
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
    : { left: -W * 0.04, top: m + textH(u, size * 0.98, rowsT.length, bodyLines, bodySize) + 3.5 * u, width: W * 1.08, height: 0 };
  if (!wide) area.height = H - area.top - m - (footH + 3.5) * u;
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
      <div style={{ position: 'absolute', left: m, width: colW, top: m, bottom: m, display: 'flex', flexDirection: 'column' }}>
        <Eyebrow text="built together" size={1.5 * u} />
        <div style={{ height: 3 * u }} />
        <Head text={rowsT.join(' / ')} size={size} />
        <div style={{ height: 2.4 * u }} />
        <Body size={bodySize} width="94%">A new look, a new page, a fix for something that annoys you. Ask for it, then share it.</Body>
        <div style={{ flex: 1 }} />
        <Foot u={u} row={shape === 'square'} tight={shape === 'square'} />
      </div>
    </AbsoluteFill>
  );
};

export const Poster: React.FC<PosterProps> = ({ idea }) => idea === 'own' ? <Own /> : idea === 'ask' ? <Ask /> : idea === 'quote' ? <Quote /> : <Everyone />;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: H * 0.08, flex: 'none' }}><Icon size={H * 0.32} /><Wordmark size={H * 0.22} /></div>
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
        <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: hs * 0.27, lineHeight: 1.3, color: C.plum2, letterSpacing: '-0.01em' }}>One open app that becomes what you ask for.</div>
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
