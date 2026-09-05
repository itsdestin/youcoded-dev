import React from 'react';
import { PHONE } from './layout';
// The phone frame for beat 6. `x` is overridable so the beat can slide it in
// from off-frame; everything else comes from layout.ts.
export const Phone: React.FC<{ x?: number; children: React.ReactNode }> = ({ x = PHONE.x, children }) => (
  <div style={{ position: 'absolute', left: x, top: PHONE.y, width: PHONE.w, height: PHONE.h,
    transform: `scale(${PHONE.scale})`, transformOrigin: 'left top',
    borderRadius: 44, overflow: 'hidden', background: '#000',
    boxShadow: '0 30px 80px rgba(0,0,0,.65), 0 0 0 10px #15171c, 0 0 0 12px rgba(255,255,255,.10)' }}>
    {children}
  </div>
);
