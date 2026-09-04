// Pose data lifted from the app's components/mascot/mascot-poses.ts, reduced to
// what the host uses. Rotations assume limbs drawn HANGING DOWN from their
// pivot (the rig contract): positive = clockwise, so the RIGHT arm raised
// outward is negative. PIVOT values are the rigs' own data-pivot attributes, in
// viewBox units — the same numbers MascotRig reads at runtime, and identical
// across the default rig and every theme rig (checked 2026-09-03).
export type Face = 'idle' | 'welcome' | 'curious' | 'shocked' | 'dizzy' | 'happy' | 'smug' | 'shutdown';   // happy/smug/shutdown: the warm set only
export type Pose = 'idle' | 'welcome' | 'curious' | 'shocked' | 'peek' | 'tuck' | 'cheer';
export const PIVOT = { 'rig-arm-left': '2.5px 9px', 'rig-arm-right': '21.5px 9px', 'rig-leg-left': '8.95px 17px', 'rig-leg-right': '15.05px 17px' } as const;
export const POSES: Record<Pose, { arms: [number, number]; legs: [number, number]; face: Face; wave?: boolean }> = {
  idle:    { arms: [0, 0],       legs: [0, 0],     face: 'welcome' },
  welcome: { arms: [0, -160],    legs: [0, 0],     face: 'welcome', wave: true },
  curious: { arms: [0, 0],       legs: [0, 0],     face: 'curious' },
  shocked: { arms: [130, -130],  legs: [-20, 20],  face: 'shocked' },
  peek:    { arms: [-160, 160],  legs: [0, 0],     face: 'welcome' },
  tuck:    { arms: [40, -40],    legs: [-35, 35],  face: 'welcome' },   // mid-hop: limbs pulled in
  cheer:   { arms: [150, -150],  legs: [0, 0],     face: 'welcome' },   // both arms up
};
