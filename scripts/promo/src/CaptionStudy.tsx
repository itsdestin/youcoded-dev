import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadComfortaa } from '@remotion/google-fonts/Comfortaa';
import { Window } from './Window';
import { Backdrop } from './Backdrop';
import { CLIP, CAPTION, windowRect } from './layout';
import { THEMES, type Slug } from './themes';
const inter = loadInter().fontFamily, comfortaa = loadComfortaa().fontFamily;

// Three caption treatments on the same frame, for Destin to pick from
// (2026-09-04: "they still just look like a half-assed add"). Stills only.
export type CaptionDesign = 'A' | 'B' | 'C';
const R = windowRect();
const Head: React.FC<{ design: CaptionDesign; slug: Slug; head: string; sub: string }> = ({ design, slug, head, sub }) => {
  const t = THEMES[slug];
  const fam = t.font === 'Comfortaa' ? comfortaa : inter;
  const words = head.split(' ');
  const payoff = words.length - 1;
  if (design === 'A') {
    // A — the lower-third card: a panel in the theme's ink at the window's bottom-left,
    // a thick accent bar, headline + sub inside; reads as titling, not a subtitle.
    return (
      <div style={{ position: 'absolute', left: R.x, top: CAPTION.top - 6, display: 'flex', alignItems: 'stretch', borderRadius: 14, overflow: 'hidden',
        background: t.dark ? 'rgba(10,10,16,.78)' : 'rgba(255,255,255,.86)', boxShadow: '0 10px 30px rgba(0,0,0,.25)', backdropFilter: 'blur(12px)' }}>
        <div style={{ width: 10, background: t.accent }} />
        <div style={{ padding: '12px 22px 12px 18px' }}>
          <div style={{ fontFamily: fam, fontWeight: 800, fontSize: 40, letterSpacing: '-0.02em', color: t.fg, lineHeight: 1.05 }}>
            {words.map((w, i) => <span key={i} style={{ color: i === payoff ? t.accent : undefined, marginRight: i < payoff ? '0.26em' : 0 }}>{w}</span>)}
          </div>
          <div style={{ fontFamily: fam, fontWeight: 500, fontSize: 21, color: t.fg, opacity: 0.8, marginTop: 4 }}>{sub}</div>
        </div>
      </div>
    );
  }
  if (design === 'B') {
    // B — big kinetic type: an oversized headline overlapping the window's bottom
    // edge on a blurred pill, the sub-line in small caps under it. Poster energy.
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, top: R.y + R.h - 34, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ padding: '10px 34px', borderRadius: 999, background: t.dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.7)', backdropFilter: 'blur(14px)',
          boxShadow: `0 0 0 2px ${t.accent}55, 0 14px 40px rgba(0,0,0,.35)`, fontFamily: fam, fontWeight: 900, fontSize: 60, letterSpacing: '-0.035em', color: t.fg, lineHeight: 1 }}>
          {words.map((w, i) => <span key={i} style={{ color: i === payoff ? t.accent : undefined, marginRight: i < payoff ? '0.24em' : 0 }}>{w}</span>)}
        </div>
        <div style={{ marginTop: 14, fontFamily: inter, fontWeight: 600, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.fg, opacity: 0.85,
          textShadow: t.dark ? '0 2px 12px rgba(0,0,0,.6)' : `0 2px 12px ${t.canvas}` }}>{sub}</div>
      </div>
    );
  }
  // C — editorial: a numbered accent tag in small caps, a hairline rule the width
  // of the window, the headline left-aligned to the window, the sub-line right.
  return (
    <div style={{ position: 'absolute', left: R.x, width: R.w, top: CAPTION.top - 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <span style={{ fontFamily: inter, fontWeight: 700, fontSize: 13, letterSpacing: '0.2em', color: t.onAccent, background: t.accent, padding: '4px 10px', borderRadius: 4 }}>04 · GAMES</span>
        <div style={{ flex: 1, height: 1, background: t.fg, opacity: 0.35 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ fontFamily: fam, fontWeight: 800, fontSize: 44, letterSpacing: '-0.025em', color: t.fg, lineHeight: 1, textShadow: t.dark ? '0 2px 16px rgba(0,0,0,.5)' : 'none' }}>
          {words.map((w, i) => <span key={i} style={{ color: i === payoff ? t.accent : undefined, marginRight: i < payoff ? '0.26em' : 0 }}>{w}</span>)}
        </div>
        <div style={{ fontFamily: fam, fontWeight: 500, fontSize: 20, color: t.fg, opacity: 0.8, textAlign: 'right', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
    </div>
  );
};

// The frame is a PNG (public/stills/), not a trimmed video: a Still seeking
// into a WebM landed on the clip's last frame ("You Lose!").
export const CaptionStudy: React.FC<{ design: CaptionDesign; slug: Slug; still: string; head: string; sub: string }> = ({ design, slug, still, head, sub }) => (
  <AbsoluteFill>
    <Backdrop themes={[{ at: 0, slug }]} total={100} />
    <Window light={!THEMES[slug].dark}><Img src={staticFile(`stills/${still}.png`)} style={{ width: CLIP.w, height: CLIP.h }} /></Window>
    <Head design={design} slug={slug} head={head} sub={sub} />
  </AbsoluteFill>
);
