// Pose data lifted from the app's components/mascot/mascot-poses.ts, reduced to
// the six poses the host uses. Rotations assume limbs drawn HANGING DOWN from
// their pivot (the rig contract): positive = clockwise, so the RIGHT arm raised
// outward is negative. PIVOT values are the rig's own data-pivot attributes, in
// viewBox units — the same numbers MascotRig reads at runtime.
export type Face = 'idle' | 'welcome' | 'curious' | 'shocked' | 'dizzy';
export type Pose = 'idle' | 'welcome' | 'curious' | 'shocked' | 'flap' | 'peek';
export const PIVOT = { 'rig-arm-left': '2.5px 9px', 'rig-arm-right': '21.5px 9px' } as const;
export const POSES: Record<Pose, { arms: [number, number]; face: Face; wave?: boolean }> = {
  idle:    { arms: [0, 0],       face: 'welcome' },
  welcome: { arms: [0, -160],    face: 'welcome', wave: true },
  curious: { arms: [0, 0],       face: 'curious' },
  shocked: { arms: [130, -130],  face: 'shocked' },
  flap:    { arms: [150, -150],  face: 'welcome' },
  peek:    { arms: [-160, 160],  face: 'welcome' },
};
