// Posters and display ads: one layout system, every size.
// WHY Remotion stills rather than a design tool: the posters reuse the films' exact fonts,
// wordmark, icon and colours (brand.tsx), so print, web and video can never drift apart.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { C, DMSANS, Ground, Icon, OUTFIT, Wordmark } from './brand';

export type PosterProps = {
  ask: string; // the request, as typed
  img: string; // file under public/stills
  imgAspect: number; // width / height of the still
  line?: string; // headline (default "you coded that.")
};

/** Static headline with one purple word ("you"). */
const Line: React.FC<{ text: string; size: number; align?: 'center' | 'left' }> = ({ text, size, align = 'center' }) => (
  <div style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: size, letterSpacing: '-0.05em', lineHeight: 0.95, color: C.plum, textAlign: align }}>
    {text.split(' ').map((w, i, a) => (
      <span key={i} style={{ color: w === 'you' ? C.purple : C.plum }}>
        {w}
        {i < a.length - 1 ? ' ' : ''}
      </span>
    ))}
  </div>
);

const Shot: React.FC<{ img: string; w: number; aspect: number; radius?: number }> = ({ img, w, aspect, radius }) => {
  const h = w / aspect;
  const r = radius ?? w * (aspect < 1 ? 0.06 : 0.014);
  return (
    <div
      style={{
        width: w, height: h, borderRadius: r, overflow: 'hidden', flex: 'none',
        boxShadow: [
          `0 ${w * 0.004}px ${w * 0.01}px rgba(33,21,44,.10)`,
          `0 ${w * 0.02}px ${w * 0.05}px rgba(33,21,44,.14)`,
          `0 ${w * 0.06}px ${w * 0.14}px rgba(60,20,100,.16)`,
        ].join(', '),
        outline: '1px solid rgba(33,21,44,.08)',
      }}
    >
      <Img src={staticFile(`stills/${img}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
};

/** Icon + name side by side, with the tagline tucked under the name (site recipe, .lockup-tag). */
const Lockup: React.FC<{ icon: number; tagline?: boolean }> = ({ icon, tagline = true }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: icon * 0.25 }}>
    <Icon size={icon} />
    <div style={{ position: 'relative', transform: `translateY(${tagline ? icon * 0.03125 : -icon * 0.035}px)`, height: tagline ? icon * 0.65625 * 1.44 : undefined }}>
      <Wordmark size={icon * (tagline ? 0.65625 : 0.71875)} />
      {tagline && (
        <div
          style={{
            position: 'absolute', left: icon * 0.65625 * 0.33 * 1.276, top: icon * 0.65625 * 0.33 * 2.545,
            fontFamily: OUTFIT, fontWeight: 400, fontSize: icon * 0.65625 * 0.33, letterSpacing: '-0.005em', color: C.tagline, whiteSpace: 'nowrap',
          }}
        >
          open source everything
        </div>
      )}
    </div>
  </div>
);

const Address: React.FC<{ size: number; platforms?: boolean }> = ({ size, platforms = true }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: size, color: C.plum, lineHeight: 1 }}>youcoded.ai</div>
    {platforms && (
      <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: size * 0.62, color: C.secondary, marginTop: size * 0.4, lineHeight: 1.3 }}>
        Free · Windows · Mac · Linux · Android
      </div>
    )}
  </div>
);

const Ask: React.FC<{ text: string; size: number }> = ({ text, size }) => (
  <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: size, color: C.secondary, textAlign: 'center', lineHeight: 1.25 }}>
    “{text}”
  </div>
);

/**
 * Tall posters (4:5, 9:16) and squares. Centred stack, slightly above middle (brand §7):
 * ask · shot · headline  —gap—  lockup · address.
 */
export const PosterTall: React.FC<PosterProps> = ({ ask, img, imgAspect, line = 'you coded that.' }) => {
  const { width, height } = useVideoConfig();
  const b = Math.min(width, height) / 60;
  const ratio = height / width;
  // WHY three classes: a square has a third less height than 4:5, so everything shrinks
  // there; 9:16 has spare height, so the shot and headline grow.
  const k = ratio > 1.5 ? { pad: 0.1, shot: 0.84, line: 8, lock: 5, gap: 6 } : ratio > 1.1 ? { pad: 0.08, shot: 0.84, line: 6.6, lock: 4.6, gap: 4 } : { pad: 0.08, shot: 0.66, line: 5.4, lock: 3.6, gap: 3 };
  const shotW = imgAspect < 1 ? Math.min(width * 0.62, height * 0.5 * imgAspect) : width * k.shot;
  return (
    <AbsoluteFill>
      <Ground />
      <AbsoluteFill style={{ padding: `${height * k.pad}px ${width * 0.08}px`, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Ask text={ask} size={(ratio > 1.1 ? 2.2 : 1.9) * b} />
          <div style={{ height: (ratio > 1.1 ? 3 : 2) * b }} />
          <Shot img={img} w={shotW} aspect={imgAspect} />
          <div style={{ height: k.gap * b }} />
          <Line text={line} size={k.line * b} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: (ratio > 1.1 ? 3 : 2) * b }}>
          <Lockup icon={k.lock * b} />
          <Address size={(ratio > 1.1 ? 2 : 1.7) * b} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Wide formats (landscape social, billboard 3:1, leaderboards). Left: words; right: shot. */
export const PosterWide: React.FC<PosterProps> = ({ ask, img, imgAspect, line = 'you coded that.' }) => {
  const { width, height } = useVideoConfig();
  const b = Math.min(width, height) / 60;
  const pad = height * 0.12;
  const colW = width * 0.4;
  const shotW = Math.min(width - colW - pad * 3, (height - pad * 2) * imgAspect);
  return (
    <AbsoluteFill>
      <Ground />
      <AbsoluteFill style={{ padding: `${pad}px ${pad * 1.1}px`, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: colW, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: DMSANS, fontWeight: 500, fontSize: 2.1 * b, color: C.secondary, lineHeight: 1.25 }}>“{ask}”</div>
            <div style={{ height: 3 * b }} />
            <Line text={line} size={8.5 * b} align="left" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * b }}>
            <Lockup icon={4.6 * b} />
            <div style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: 2.2 * b, color: C.plum }}>youcoded.ai</div>
          </div>
        </div>
        <Shot img={img} w={shotW} aspect={imgAspect} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
