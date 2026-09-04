import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Window } from './Window';
import { Backdrop } from './Backdrop';
import { CLIP, CAPTION, windowRect } from './layout';
import { THEMES, type Slug } from './themes';
import { family } from './Caption';

// Caption variants for Destin (2026-09-04: "i don't like the underline, and i'd like to see
// a few more variants/options for the main caption"). Stills on the same frame.
//   G · glow only            P · a soft plate (blurred pill) behind the words
//   O · outlined (knockout)  K · a small-caps kicker over a bigger headline
//   S · stacked accent: the payoff word bigger and in the accent, on its own baseline
export type LabelDesign = 'G' | 'P' | 'O' | 'K' | 'S';
const R = windowRect();
export const LabelStudy: React.FC<{ design: LabelDesign; slug: Slug; still: string; head: string; kicker?: string }> = ({ design, slug, still, head, kicker = 'Just ask' }) => {
  const t = THEMES[slug];
  const words = head.split(' ');
  const last = words.length - 1;
  const fam = family(t);
  const base: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: CAPTION.top - 6, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: fam, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, whiteSpace: 'nowrap', color: t.fg };
  const Words = ({ size, accent = true }: { size: number; accent?: boolean }) => (
    <div style={{ fontSize: size }}>{words.map((w, i) => <span key={i} style={{ marginRight: i < last ? '0.26em' : 0, color: accent && i === last && words.length > 1 ? t.accent : undefined }}>{w}</span>)}</div>
  );
  let body: React.ReactNode;
  if (design === 'G') body = <div style={{ ...base, textShadow: t.dark ? `0 0 22px ${t.accent}aa, 0 3px 18px rgba(0,0,0,.6)` : `0 0 18px ${t.accent}66, 0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.3)` }}><Words size={48} /></div>;
  else if (design === 'P') body = (
    <div style={{ ...base, top: CAPTION.top - 12 }}>
      <div style={{ padding: '8px 30px', borderRadius: 999, background: t.dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.55)', backdropFilter: 'blur(14px)', boxShadow: `0 0 0 1.5px ${t.accent}44, 0 10px 30px rgba(0,0,0,.25)` }}><Words size={46} /></div>
    </div>);
  else if (design === 'O') body = (
    <div style={{ ...base, color: t.dark ? '#fff' : t.canvas, WebkitTextStroke: `1.5px ${t.dark ? t.accent : t.fg}`, textShadow: t.dark ? `0 0 18px ${t.accent}77` : `0 2px 12px ${t.fg}55` }}><Words size={50} accent={false} /></div>);
  else if (design === 'K') body = (
    <div style={{ ...base, top: CAPTION.top - 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.accent, marginBottom: 4 }}>{kicker}</div>
      <div style={{ textShadow: t.dark ? '0 3px 18px rgba(0,0,0,.6)' : `0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.25)` }}><Words size={46} accent={false} /></div>
    </div>);
  else body = (
    <div style={{ ...base, top: CAPTION.top - 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: '0.28em', textShadow: t.dark ? '0 3px 18px rgba(0,0,0,.6)' : `0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.25)` }}>
      <span style={{ fontSize: 40, fontWeight: 600, opacity: 0.85 }}>{words.slice(0, last).join(' ')}</span>
      <span style={{ fontSize: 60, color: t.accent, textShadow: t.dark ? `0 0 22px ${t.accent}99` : undefined }}>{words[last]}</span>
    </div>);
  return (
    <AbsoluteFill>
      <Backdrop themes={[{ at: 0, slug }]} total={1} />
      <Window light={!t.dark}><Img src={staticFile(`stills/${still}.png`)} style={{ width: CLIP.w, height: CLIP.h }} /></Window>
      {body}
      <div style={{ position: 'absolute', right: 28, bottom: 14, fontFamily: 'system-ui', fontSize: 22, color: t.dark ? '#fff' : t.fg, opacity: 0.6 }}>{design}</div>
    </AbsoluteFill>
  );
};
