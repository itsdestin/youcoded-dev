// The campaign's building blocks. Every film, short and poster is assembled from these, so
// they all share one look. All sizes are in `u` (short side / 60, the brand guide's base unit),
// which is how the same component serves a 1920x1080 film and a 1080x1920 short.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_OUT, FPS, GRADIENT, MONO, OUTFIT } from './brand';
import manifest from './footage.json';

export const useU = () => { const { width, height } = useVideoConfig(); return Math.min(width, height) / 60; };
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0→1 between two times (seconds), eased. */
export const ramp = (frame: number, t0: number, t1: number, easing = EASE_OUT) =>
  interpolate(frame, [t0 * FPS, t1 * FPS], [0, 1], { ...clamp, easing });
/** 1 while t is inside [at, out], with eased edges. */
export const window01 = (frame: number, at: number, out: number, fin = 0.5, fout = 0.35) =>
  Math.min(ramp(frame, at, at + fin), 1 - ramp(frame, out - fout, out, EASE_IN));

// ---------- backgrounds ----------
export const Night: React.FC = () => <AbsoluteFill style={{ background: C.night }} />;
/** Lavender, with the faintest lift toward the top so a full-screen field never reads as flat grey. */
export const Day: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, #FBF6FD 0%, ${C.lavender} 45%, #F1E6F8 100%)` }} />
);
/** The light arriving: lavender opens from a point over the night field. `at` in seconds. */
export const Bloom: React.FC<{ at: number; dur?: number; cx?: number; cy?: number; children?: React.ReactNode }> = ({ at, dur = 1.1, cx = 50, cy = 50, children }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, at + dur);
  if (p <= 0) return null;
  const r = p * 130;                       // % of the farthest corner
  const mask = `radial-gradient(circle farthest-corner at ${cx}% ${cy}%, #000 ${Math.max(0, r - 14)}%, transparent ${r}%)`;
  return <AbsoluteFill style={{ WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }}><Day />{children}</AbsoluteFill>;
};

// ---------- type ----------
type LineProps = {
  text: string;                // *word* marks the one purple word; "/" starts a new line
  at: number; out: number;     // seconds on screen
  size?: number;               // in u
  dark?: boolean;              // on the night field
  y?: number;                  // centre, % of frame height (default: slightly above the middle)
  weight?: number; maxWidth?: number; stagger?: number;
};
/** A headline that arrives word by word and leaves as one. DM Sans 900, -5% tracking (brand §6). */
export const Line: React.FC<LineProps> = ({ text, at, out, size = 5.4, dark, y = 47, weight = 900, maxWidth = 84, stagger = 0.055 }) => {
  const frame = useCurrentFrame(); const u = useU();
  if (frame < at * FPS - 1 || frame > out * FPS + 1) return null;
  const exit = ramp(frame, out - 0.35, out, EASE_IN);
  let i = 0;
  const rows = text.split('/').map((row) => row.trim().split(/\s+/));
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute', top: `${y}%`, transform: `translateY(-50%) translateY(${-exit * 0.6 * u}px)`, opacity: 1 - exit,
        width: `${maxWidth}%`, textAlign: 'center', fontFamily: DMSANS, fontWeight: weight, fontSize: size * u,
        letterSpacing: '-0.05em', lineHeight: 1.04, color: dark ? C.nightText : C.plum,
      }}>
        {rows.map((row, r) => (
          <div key={r}>
            {row.map((raw, w) => {
              const n = i++;
              const accent = raw.startsWith('*');
              const word = raw.replace(/\*/g, '');
              const p = ramp(frame, at + n * stagger, at + n * stagger + 0.6);
              return (
                <span key={w} style={{
                  display: 'inline-block', marginRight: '0.24em', opacity: p,
                  transform: `translateY(${(1 - p) * 0.38}em)`, filter: p < 1 ? `blur(${(1 - p) * 0.12}em)` : undefined,
                  color: accent ? (dark ? C.purpleNight : C.purple) : undefined,
                }}>{word}</span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** The 1-3 word label above a headline: the only place JetBrains Mono appears (brand §6). */
export const Label: React.FC<{ text: string; at: number; out: number; y: number; dark?: boolean }> = ({ text, at, out, y, dark }) => {
  const frame = useCurrentFrame(); const u = useU();
  const o = window01(frame, at, out);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: `${y}%`, transform: 'translateY(-50%)', opacity: o, fontFamily: MONO, fontWeight: 500,
        fontSize: 1.25 * u, letterSpacing: '0.22em', textTransform: 'uppercase', color: dark ? C.purpleNight : C.purple }}>{text}</div>
    </AbsoluteFill>
  );
};

/** A purple text cursor that blinks until typing starts, then stays lit. */
const Caret: React.FC<{ h: number; solid: boolean; dark?: boolean }> = ({ h, solid, dark }) => {
  const frame = useCurrentFrame();
  const on = solid || Math.floor(frame / (FPS * 0.5)) % 2 === 0;
  return <span style={{ display: 'inline-block', width: Math.max(3, h * 0.07), height: h * 0.92, marginLeft: h * 0.06, borderRadius: h,
    background: dark ? C.purpleNight : C.purple, opacity: on ? 1 : 0, verticalAlign: '-0.1em' }} />;
};

type TypingProps = {
  text: string; at: number;      // caret appears
  start: number; end: number;    // typing runs between these
  out: number;                   // the sentence is gone by here
  dark?: boolean; size?: number; y?: number; maxWidth?: number;
  /** from `dockAt` the sentence shrinks and rises to become the caption above the window */
  dockAt?: number; dockY?: number; dockSize?: number;
};
/** A sentence typed into empty space: the film's central image. Letters land at an even pace so
 *  the sound design can tick with them (cues are generated from the same numbers). */
export const Typing: React.FC<TypingProps> = ({ text, at, start, end, out, dark, size = 4.6, y = 47, maxWidth = 84, dockAt, dockY = 10.5, dockSize = 2.3 }) => {
  const frame = useCurrentFrame(); const u = useU();
  if (frame < at * FPS || frame > out * FPS) return null;
  const n = Math.round(interpolate(frame, [start * FPS, end * FPS], [0, text.length], clamp));
  const d = dockAt == null ? 0 : ramp(frame, dockAt, dockAt + 0.7, EASE_OUT);
  const appear = ramp(frame, at, at + 0.3);
  const exit = ramp(frame, out - 0.3, out, EASE_IN);
  const fs = interpolate(d, [0, 1], [size, dockSize]) * u;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{
        position: 'absolute', top: `${interpolate(d, [0, 1], [y, dockY])}%`, transform: 'translateY(-50%)', width: `${maxWidth}%`, textAlign: 'center',
        fontFamily: DMSANS, fontWeight: 900, fontSize: fs, letterSpacing: '-0.045em', lineHeight: 1.08,
        color: dark ? C.nightText : C.plum, opacity: appear * (1 - exit),
      }}>
        {/* the untyped remainder is laid out but invisible, so the line never reflows as it grows */}
        <span>{text.slice(0, n)}</span>
        <span style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - d }}><Caret h={fs} solid={frame >= start * FPS && frame <= (end + 0.25) * FPS} dark={dark} /></span>
          <span style={{ visibility: 'hidden' }}>{text.slice(n)}</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ---------- footage ----------
type ClipInfo = { file: string; duration: number; marks: Record<string, [number, number]> };
const CLIPS = manifest as unknown as Record<string, ClipInfo>;
/** Seconds into a clip where a labelled action starts (`end` = where it finishes). */
export const mark = (clip: string, label: string, edge: 'start' | 'end' = 'start') => {
  // A clip that has not been filmed yet reads as time 0 so the rest of a film can be previewed;
  // a filmed clip with a missing label is a real mistake and stops the render.
  if (!CLIPS[clip]) return 0;
  const m = CLIPS[clip].marks[label];
  if (!m) throw new Error(`footage: ${clip} has no mark "${label}"`);
  return edge === 'start' ? m[0] : m[1];
};
export type Shot = { clip: string; from: number; at: number; out: number; rate?: number;
  /** which part of the picture to keep when the frame is a different shape: 0 = top, 1 = bottom */ focusY?: number; zoom?: [number, number];
  /** join to the shot before with a near-cut instead of a 0.3 s dissolve. WHY: dissolving the chat into the Home page printed one screen's text over the other for a third of a second. */ cut?: boolean; };

/** Real app footage in a rounded, softly lit frame. `shots` play back to back; each fades over the last. */
export const Stage: React.FC<{
  shots: Shot[]; at: number; out: number;
  box: { x: number; y: number; w: number; h: number };   // % of frame
  radius?: number; enter?: 'rise' | 'fade';
}> = ({ shots, at, out, box, radius = 1.6, enter = 'rise' }) => {
  const frame = useCurrentFrame(); const u = useU(); const { width, height } = useVideoConfig();
  if (frame < at * FPS || frame > out * FPS) return null;
  const p = ramp(frame, at, at + 0.9);
  const exit = ramp(frame, out - 0.4, out, EASE_IN);
  const W = (box.w / 100) * width, H = (box.h / 100) * height;
  return (
    <div style={{
      position: 'absolute', left: (box.x / 100) * width, top: (box.y / 100) * height, width: W, height: H,
      borderRadius: radius * u, overflow: 'hidden', background: C.lilac,
      // one soft shadow in the brand's own plum, never grey or black (brand §5)
      boxShadow: `0 ${1.6 * u}px ${5 * u}px rgba(74, 38, 110, 0.22), 0 ${0.3 * u}px ${0.9 * u}px rgba(74, 38, 110, 0.16), 0 0 0 1px rgba(201,176,219,0.7)`,
      opacity: (enter === 'fade' ? p : Math.min(1, p * 1.6)) * (1 - exit),
      transform: `translateY(${(enter === 'rise' ? (1 - p) * 4 * u : 0) - exit * 1.2 * u}px) scale(${enter === 'rise' ? 0.965 + 0.035 * p : 1})`,
    }}>
      {shots.map((s, i) => {
        if (frame < s.at * FPS - 1 || frame > s.out * FPS + 12) return null;
        const o = i === 0 ? 1 : ramp(frame, s.at, s.at + (s.cut ? 0.1 : 0.3));
        const z = s.zoom ? interpolate(frame, [s.at * FPS, s.out * FPS], s.zoom, clamp) : 1;
        const info = CLIPS[s.clip];
        if (!info) return null;
        const origin = `50% ${(s.focusY ?? 0) * 100}%`;
        return (
          // WHY a Sequence: a video counts its own time from the Sequence it sits in, so each
          // shot starts at its `from` on the frame the shot begins, wherever that is in the film.
          <Sequence key={i} from={Math.round(s.at * FPS)} layout="none">
            <AbsoluteFill style={{ opacity: o }}>
              <OffthreadVideo src={staticFile(info.file)} muted playbackRate={s.rate ?? 1} trimBefore={Math.max(0, Math.round(s.from * FPS))}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: origin, transform: `scale(${z})`, transformOrigin: origin }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </div>
  );
};

// ---------- the wall: many people's versions of the same app ----------
export const Wall: React.FC<{ at: number; out: number; stills: string[]; cols: number; rows: number; dim?: [number, number][] }> = ({ at, out, stills, cols, rows, dim }) => {
  const frame = useCurrentFrame(); const u = useU(); const { width, height } = useVideoConfig();
  if (frame < at * FPS || frame > out * FPS) return null;
  const t = ramp(frame, at, out, (x) => x);
  const exit = ramp(frame, out - 0.5, out, EASE_IN);
  const gap = 1.4 * u;
  const tileW = (width * 1.16 - gap * (cols - 1)) / cols, tileH = tileW * 0.625;
  const totalH = rows * tileH + (rows - 1) * gap;
  const scale = interpolate(ramp(frame, at, at + 2.2), [0, 1], [1.5, 1]) * (1 + 0.035 * (1 - t));
  const veil = Math.max(0, ...(dim ?? []).map(([a, b]) => window01(frame, a, b, 0.5, 0.4)));
  return (
    <AbsoluteFill style={{ opacity: 1 - exit }}>
      <div style={{ position: 'absolute', left: -width * 0.08, top: (height - totalH) / 2, width: width * 1.16, transform: `scale(${scale})`, transformOrigin: '50% 50%' }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ display: 'flex', gap, marginBottom: gap, transform: `translateX(${(r % 2 ? 1 : -1) * (t - 0.5) * 3 * u + (r % 2 ? tileW * 0.5 : 0) - tileW * 0.25}px)` }}>
            {Array.from({ length: cols + 1 }).map((_, c) => {
              const n = r * (cols + 1) + c;
              const p = ramp(frame, at + 0.05 * ((n * 7) % 11), at + 0.05 * ((n * 7) % 11) + 0.8);
              return (
                <div key={c} style={{ flex: 'none', width: tileW, height: tileH, borderRadius: 0.9 * u, overflow: 'hidden', opacity: p,
                  transform: `translateY(${(1 - p) * 2 * u}px)`, boxShadow: `0 ${0.8 * u}px ${2.4 * u}px rgba(74,38,110,0.18), 0 0 0 1px rgba(201,176,219,0.6)` }}>
                  <Img src={staticFile(stills[n % stills.length])} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0%' }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ background: C.lavender, opacity: veil * 0.9 }} /> {/* WHY 0.9: at 0.8 a headline crossing a dark tile fell to about 3:1 contrast */}
    </AbsoluteFill>
  );
};

// ---------- logo and end card ----------
/** The typed logo (brand §3): Outfit 600, -3.5% tracking, "you" in the gradient, "coded" in plum. */
// WHY `ai`: Destin, 2026-11-27: "i want to stop putting "youcoded.ai" next to bare "youcoded"... a styled version that
// just combines the marketing name youcoded with the link into a single styled youcoded.ai". Optional, for pieces
// where the name and the address would otherwise sit side by side. 'soft' = quieter colour, 'same' = same as
// "coded", 'light' = same colour in a thinner weight.
export const Wordmark: React.FC<{ size: number; dark?: boolean; ai?: 'soft' | 'same' | 'light' }> = ({ size, dark, ai }) => (
  <span style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: size, letterSpacing: '-0.035em', lineHeight: 1, whiteSpace: 'nowrap', color: dark ? C.nightText : C.plum }}>
    <span style={{ paddingRight: '0.02em', background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>you</span>coded
    {ai && <span style={{ fontWeight: ai === 'light' ? 300 : 600, color: ai === 'soft' ? (dark ? '#8F8399' : C.tagGrey) : undefined }}>.ai</span>}
  </span>
);
export const Icon: React.FC<{ size: number }> = ({ size }) => (
  <Img src={staticFile('icon.png')} style={{ width: size, height: size, display: 'block', filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.08}px rgba(60,20,100,0.22))` }} />
);
/** Icon + name side by side (footer / poster lockup): gap a quarter of the icon, name 0.72 of it. */
export const Lockup: React.FC<{ icon: number; dark?: boolean }> = ({ icon, dark }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: icon * 0.25 }}>
    <Icon size={icon} />
    <div style={{ transform: `translateY(${-icon * 0.035}px)` }}><Wordmark size={icon * 0.71875} dark={dark} /></div>
  </div>
);

/** The brand guide's end card (§7), measured in u: icon 14 · gap 2 · name 7 · gap 6 · address 3 · gap 1 · platforms 2. */
// WHY no tagline by default (review, 2026-11-18): the guide's end card is icon, name, address, platforms. A second
// line under the name shrank the specified 6-unit gap and put small grey type where the guide allows grey only large.
export const EndCard: React.FC<{ at: number; tagline?: boolean }> = ({ at, tagline = false }) => {
  const frame = useCurrentFrame(); const u = useU();
  if (frame < at * FPS) return null;
  const a = (d: number) => ramp(frame, at + d * 0.45, at + d * 0.45 + 0.5);   // WHY quicker: on the 3 s end cards of the shorts the old 1.3 s build left under 2 s fully shown
  const rise = (p: number) => ({ opacity: p, transform: `translateY(${(1 - p) * 1.2 * u}px)` });
  const icon = a(0);
  return (
    <AbsoluteFill>
      <Day />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', paddingBottom: 3 * u }}>
        <div style={{ opacity: icon, transform: `scale(${0.86 + 0.14 * icon})` }}><Icon size={14 * u} /></div>
        <div style={{ height: 2 * u }} />
        <div style={rise(a(0.12))}><Wordmark size={7 * u} /></div>
        {tagline && <div style={{ ...rise(a(0.22)), marginTop: 0.5 * u, fontFamily: OUTFIT, fontWeight: 400, fontSize: 2.3 * u, color: C.tagGrey, letterSpacing: '-0.005em' }}>open source everything</div>}
        <div style={{ height: (tagline ? 3.2 : 6) * u }} />
        <div style={{ ...rise(a(0.36)), fontFamily: OUTFIT, fontWeight: 600, fontSize: 3 * u, color: C.plum, letterSpacing: '-0.01em' }}>youcoded.ai</div>
        <div style={{ height: 1 * u }} />
        <div style={{ ...rise(a(0.46)), fontFamily: DMSANS, fontWeight: 500, fontSize: 2 * u, color: C.plum2 }}>Free · Windows · Mac · Linux · Android</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The quiet list behind the opening: the things people rent. A graphic, not an interface. */
export const Ledger: React.FC<{ at: number; out: number; items: string[] }> = ({ at, out, items }) => {
  const frame = useCurrentFrame(); const u = useU(); const { height } = useVideoConfig();
  const o = window01(frame, at, out, 1.2, 0.6);
  if (o <= 0) return null;
  const drift = interpolate(frame, [at * FPS, out * FPS], [0, -9 * u]);
  const row = 4.3 * u;
  return (
    <AbsoluteFill style={{ opacity: o * 0.8, alignItems: 'center',   /* WHY 0.8: at 0.5 the list was too faint to read and looked like noise */
      WebkitMaskImage: 'linear-gradient(180deg, transparent 3%, #000 16%, #000 24%, transparent 36%, transparent 62%, #000 74%, #000 84%, transparent 97%)', maskImage: 'linear-gradient(180deg, transparent 3%, #000 16%, #000 24%, transparent 36%, transparent 62%, #000 74%, #000 84%, transparent 97%)' }}>
      <div style={{ position: 'absolute', top: height * 0.06 + drift, width: '62%' }}>
        {items.map((it, i) => (
          <div key={i} style={{ height: row, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid rgba(179,168,188,0.16)`,
            fontFamily: DMSANS, fontWeight: 500, fontSize: 1.5 * u, color: 'rgba(179,168,188,0.6)', letterSpacing: '-0.01em' }}>
            <span>{it}</span><span>billed monthly</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** The small print under filmed footage. WHY: the takes are shortened and use practice data, and the home page
 *  needs a Home Assistant connection; saying so on screen keeps the film honest (brand guide: claims must be true). */
export const Fine: React.FC<{ text: string; at: number; out: number; y: number }> = ({ text, at, out, y }) => {
  const frame = useCurrentFrame(); const u = useU();
  const o = window01(frame, at + 0.4, out, 0.5, 0.3);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: `${y}%`, transform: 'translateY(-50%)', opacity: o * 0.78, fontFamily: DMSANS, fontWeight: 500,
        fontSize: 1.35 * u, letterSpacing: '0', color: C.plum2 }}>{text}</div>
    </AbsoluteFill>
  );
};
