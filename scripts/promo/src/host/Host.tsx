import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { PIVOT, type Face } from '../poses';
import { THEMES, rigFor, companionsFor, inkFor, type Slug } from '../themes';
import { evaluate, type Action, type HostState } from './engine';
import { withFaces, type FaceStyle } from './faces';

const FACES: Face[] = ['idle', 'welcome', 'curious', 'shocked', 'dizzy', 'happy', 'smug', 'shutdown', 'asleep', 'dozy'];
const DEFAULT_RIG_SLUGS: Slug[] = ['midnight', 'creme', 'light', 'meadow-mist', 'devils-garden', 'cotton-candy-sky', 'golden-sunbreak'];

/** One rig, posed from a HostState. `scope` keeps its style rules from leaking into another rig on screen. */
const Rig: React.FC<{ s: HostState; style: FaceStyle; scope: string }> = ({ s, style, scope }) => {
  const t = THEMES[s.costume];
  // Golden Sunbreak's rig shares the default face geometry, so the new faces fit it too.
  const svg = DEFAULT_RIG_SLUGS.includes(s.costume) ? withFaces(rigFor(s.costume), style) : rigFor(s.costume);
  const blink = s.blink > 0.5;
  // A theme's own rig has only the contract's five faces; the warm set's happy/smug/shutdown (and
  // a rig may skip dizzy) do not exist there, and a face the rig lacks drew NOTHING — Kuromi went
  // blank for a few frames in the draft (Destin, 2026-09-04). Fall back to a face the rig has.
  const has = (f: Face) => svg.includes(`id="rig-face-${f}"`);
  const face: Face = has(s.face) ? s.face : s.face === 'dizzy' ? (has('shocked') ? 'shocked' : 'welcome') : s.face === 'shutdown' || s.face === 'asleep' || s.face === 'dozy' ? (has('idle') ? 'idle' : 'welcome') : 'welcome';
  return (
    <div className={scope} style={{ width: '100%', height: '100%',
      ['--rig-accent' as string]: t.accent, ['--rig-on-accent' as string]: inkFor(s.costume), ['--rig-line' as string]: t.fg }}>
      <style>{`
.${scope} svg { width: 100%; height: 100%; display: block; overflow: visible; }
.${scope} #rig-arm-left { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-left']}; transform: rotate(${s.armL.toFixed(2)}deg); }
.${scope} #rig-arm-right { transform-box: view-box; transform-origin: ${PIVOT['rig-arm-right']}; transform: rotate(${s.armR.toFixed(2)}deg); }
.${scope} #rig-leg-left { transform-box: view-box; transform-origin: ${PIVOT['rig-leg-left']}; transform: rotate(${s.legL.toFixed(2)}deg); }
.${scope} #rig-leg-right { transform-box: view-box; transform-origin: ${PIVOT['rig-leg-right']}; transform: rotate(${s.legR.toFixed(2)}deg); }
.${scope} #rig-hand-peek-left, .${scope} #rig-hand-peek-right { display: none !important; }
${s.peek > 0
    // The app's side peek hides the rig's OWN arms (the edge mittens are the hands; a 75°-leaning body would show a
    // stray third arm — mascot-poses.ts 'peek-left') — crossfaded by `peek`, so the arms fade in as it steps out and
    // are never switched on in one frame. The rig's own peek-hand stubs (at the body's side) stay off: Host draws the
    // mittens on the frame edge instead, the way BuddyMascot's PeekHands does.
    ? `.${scope} #rig-arm-left, .${scope} #rig-arm-right { opacity: ${Math.min(1, (1 - s.peek) * 2).toFixed(3)}; }`
    : ''}
.${scope} .pupil { transform: translate(${s.lookX.toFixed(2)}px, ${s.lookY.toFixed(2)}px); }
.${scope} #rig-face-blink { display: ${blink ? 'inline' : 'none'} !important; }
${FACES.map((n) => `.${scope} #rig-face-${n} { display: ${n === face && !blink ? 'inline' : 'none'} !important; }`).join('\n')}
`}</style>
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
};

/** Particles for a poof: a dozen soft dots flung outward and fading over 16 frames. */
const Poof: React.FC<{ at: number; cx: number; cy: number; color: string; size: number }> = ({ at, cx, cy, color, size }) => {
  const f = useCurrentFrame();
  const t = (f - at) / 16;
  if (t < 0 || t > 1) return null;
  const e = 1 - Math.pow(1 - t, 3);
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
        const r = size * (0.35 + 0.65 * e) * (0.8 + (i % 3) * 0.12);
        const d = size * (0.09 - 0.07 * e) * (0.7 + (i % 4) * 0.15);
        return <div key={i} style={{ position: 'absolute', left: cx + Math.cos(a) * r - d / 2, top: cy + Math.sin(a) * r * 0.85 - d / 2, width: d, height: d, borderRadius: '50%',
          background: i % 3 === 0 ? '#ffffff' : color, opacity: (1 - t) * 0.95 }} />;
      })}
    </>
  );
};

/**
 * The host: its state on this frame from the action list, drawn as the rig in
 * the current costume, leaning and squashing about its feet, with a contact
 * shadow that shrinks when it is in the air, the theme's companions trailing
 * it, and a poof on costume changes. `base` sets where it starts.
 */
// 'warm' is the film's face set since 2026-09-04 (faces.ts): the welcome eyes on every expression.
export const Host: React.FC<{ actions: Action[]; base: HostState; faceStyle?: FaceStyle }> = ({ actions, base, faceStyle = 'warm' }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = evaluate(actions, base, f);
  if (s.hidden) return null;
  const t = THEMES[s.costume];
  // breathing: a 1.5 % chest rise on a 3.2 s cycle, always on
  const breathe = 1 + Math.sin((f / fps) * Math.PI * 2 / 3.2) * 0.015;
  const feetX = s.x + s.size / 2, feetY = s.y + s.size * 0.86;   // the rig's feet sit ~86 % down its box
  const lag = evaluate(actions, base, f - 4);
  // The twirl: a turn about the vertical axis is drawn as a horizontal squeeze
  // (cos of the angle; negative = we see its back, which for this rig is its
  // mirror image). Once it turns faster than ~25° a frame, five fainter copies
  // spread evenly over the angle it turned since the last frame are drawn
  // under it — a motion blur, so the fast middle of the spin reads as a
  // translucent spinning column and not a 15 Hz strobe (the first review saw
  // full-sprite / sliver alternating frames).
  const prev = evaluate(actions, base, f - 1);
  const dSpin = s.spin - prev.spin;
  const ghosts = Math.abs(dSpin) > 25 ? [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] : [];
  const blur = ghosts.length > 0;
  const turn = (deg: number) => Math.cos((deg * Math.PI) / 180);
  const comps = companionsFor(s.costume).filter((c) => !c.ghost);
  const shadowW = s.size * 0.62 * (1 - 0.45 * s.air), shadowA = 0.35 * s.shadow * (1 - 0.6 * s.air);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: s.alpha }}>
      {/* contact shadow on the ground under the feet */}
      {s.shadow > 0 && (
        <div style={{ position: 'absolute', left: feetX - shadowW / 2, top: feetY - s.size * 0.045, width: shadowW, height: s.size * 0.11, borderRadius: '50%',
          background: `radial-gradient(ellipse at center, rgba(0,0,0,${shadowA.toFixed(3)}) 0%, rgba(0,0,0,0) 70%)` }} />
      )}
      {comps.map((c, i) => {
        const w = c.size * s.size, hh = w / c.aspect;
        const period = (c.floatMs / 1000) * fps;
        const fl = Math.sin(((f + i * 17) / period) * Math.PI * 2) * c.float * s.size;
        const lx = lag.x + lag.size / 2 + c.dx * lag.size - w / 2;
        const ly = lag.y + lag.size / 2 + c.dy * lag.size - hh / 2 + fl;
        const born = s.poof != null ? interpolate(f - s.poof, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
        return <div key={i} style={{ position: 'absolute', left: lx, top: ly, width: w, height: hh, transform: `scale(${born})`, opacity: born }}
          dangerouslySetInnerHTML={{ __html: c.svg.replace('<svg', '<svg style="width:100%;height:100%;display:block;overflow:visible"') }} />;
      })}
      {/* The edge peek's MITTENS (Destin, 2026-09-04: "like the existing rig for hanging off the edge when the buddy
          is docked"): the rig's own peek-hand art (rig-hand-peek-left, a 2.6×3.4 rounded rect), pinned ON the frame
          edge exactly as the app's PeekHands pins them — 15 % wide, 17 % tall, centred at 0.46 ± 0.34 of the box,
          tilted ∓4° — OUTSIDE the body's transforms, so the hands stay planted on the edge while the body leans
          between them. They slide on from behind the edge by `mittens` (and back off as it steps out). */}
      {s.peekHand === 'L' && s.mittens > 0 && [0.46 - 0.34, 0.46 + 0.34].map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: 0, top: s.y + (c - 0.085) * s.size, width: s.size * 0.15, height: s.size * 0.17,
          transform: `translateX(${(-100 * (1 - s.mittens)).toFixed(1)}%) rotate(${i === 0 ? 4 : -4}deg)`,
          filter: t.dark ? `drop-shadow(0 0 3px ${t.fg}cc) drop-shadow(0 4px 10px rgba(0,0,0,.5))` : 'drop-shadow(0 4px 10px rgba(40,10,40,.35))' }}
          dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.3 7.9 3.4 4.2" width="100%" height="100%" style="display:block"><rect x="0.7" y="8.3" width="2.6" height="3.4" rx="1.17" fill="${t.accent}" stroke="#000000" stroke-opacity="0.4" stroke-width="0.34"/></svg>` }} />
      ))}
      {s.poof != null && <Poof at={s.poof} cx={s.x + s.size / 2} cy={s.y + s.size / 2} color={t.accent} size={s.size * s.poofScale} />}
      {ghosts.map((g) => (
        <div key={g} style={{ position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size, opacity: 0.3,
          transform: `rotate(${s.rot.toFixed(2)}deg) scale(${(s.sx * turn(s.spin - dSpin * g)).toFixed(3)}, ${(s.sy * breathe).toFixed(3)})`, transformOrigin: '50% 86%' }}>
          <Rig s={s} style={faceStyle} scope={`host-${s.costume}-g${Math.round(g * 6)}`} />
        </div>
      ))}
      <div style={{ position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size,
        transform: `rotate(${s.rot.toFixed(2)}deg) scale(${(s.sx * turn(s.spin)).toFixed(3)}, ${(s.sy * breathe).toFixed(3)})`, transformOrigin: '50% 86%',
        // the app's side-peek lean: 75° about the box's CENTRE (buddy.css `rotate: 75deg` on .mascot-lean), blended by `peek`
        ...(s.peek > 0 ? { transform: `rotate(${(75 * s.peek).toFixed(2)}deg)`, transformOrigin: '50% 50%' } : {}),
        opacity: blur ? 0.75 : 1,
        // dark themes: a thin light rim plus the accent glow — the Halftone hood on the plum backdrop was
        // invisible for the whole games beat in the draft review
        filter: t.dark ? `drop-shadow(0 0 3px ${t.fg}cc) drop-shadow(0 6px 14px rgba(0,0,0,.5)) drop-shadow(0 0 26px ${t.accent}99)` : 'drop-shadow(0 6px 14px rgba(40,10,40,.35))' }}>
        <Rig s={s} style={faceStyle} scope={`host-${s.costume}`} />
      </div>
    </div>
  );
};
