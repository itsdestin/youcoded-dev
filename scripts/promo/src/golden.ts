// The Golden Sunbreak theme mascot, pasted from the app theme's assets
// (themes/community/golden-sunbreak/assets/mascot-{welcome,shocked}.svg).
// WHY inline: Remotion bundles src/, not the app tree — the host swaps to this
// costume on beat 7's theme flip, and a copied string cannot go stale mid-render.
// These are stills, not rigs: they have no rig-* parts to pose.
export const GOLDEN_WELCOME = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ew-a" cx="25%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#2a1004" stop-opacity="1"/>
      <stop offset="100%" stop-color="#2a1004" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Sun on the left -->
  <circle cx="3" cy="5.5" r="4.5" fill="#ffc030" opacity="0.08"/>
  <circle cx="3" cy="5.5" r="2.8" fill="#ffc030" opacity="0.13"/>
  <circle cx="3" cy="5.5" r="1.4" fill="#ffc030"/>
  <line x1="4.6" y1="5.5" x2="6.2" y2="5.5"  stroke="#ffc030" stroke-width="0.55" stroke-linecap="round"/>
  <line x1="4.1" y1="4.1" x2="5.2" y2="3.2"  stroke="#ffc030" stroke-width="0.50" stroke-linecap="round"/>
  <line x1="4.1" y1="6.9" x2="5.2" y2="7.8"  stroke="#ffc030" stroke-width="0.50" stroke-linecap="round"/>
  <line x1="3"   y1="3.8" x2="3"   y2="2.4"  stroke="#ffc030" stroke-width="0.50" stroke-linecap="round"/>
  <line x1="3"   y1="7.2" x2="3"   y2="8.6"  stroke="#ffc030" stroke-width="0.45" stroke-linecap="round"/>
  <line x1="1.4" y1="5.5" x2="0.1" y2="5.5"  stroke="#ffc030" stroke-width="0.45" stroke-linecap="round"/>
  <line x1="1.4" y1="4.1" x2="0.4" y2="3.2"  stroke="#ffc030" stroke-width="0.40" stroke-linecap="round"/>
  <line x1="1.4" y1="6.9" x2="0.4" y2="7.8"  stroke="#ffc030" stroke-width="0.40" stroke-linecap="round"/>
  <!-- Warm light wash -->
  <rect x="4.5" y="4.0" width="5.5" height="9" rx="2" fill="#ffc030" opacity="0.05"/>
  <!-- Eye backgrounds -->
  <ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="#2a1004"/>
  <ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="url(#ew-a)"/>
  <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="#2a1004"/>
  <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="url(#ew-a)"/>
  <!-- Body with eye cutouts -->
  <path fill="#f0a828" fill-rule="evenodd" d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M9.3 7.35 A1.6 2.2 0 1 0 9.3 11.75 A1.6 2.2 0 1 0 9.3 7.35 Z M14.7 7.05 A1.6 2.2 0 1 0 14.7 11.45 A1.6 2.2 0 1 0 14.7 7.05 Z"/>
  <!-- Golden eye sparkles -->
  <circle cx="10.0" cy="10.25" r="0.28" fill="#ffc030"/>
  <circle cx="9.35" cy="10.85" r="0.20" fill="#ffe090"/>
  <circle cx="10.3" cy="10.85" r="0.14" fill="#ffd060"/>
  <circle cx="15.4" cy="9.95"  r="0.28" fill="#ffc030"/>
  <circle cx="14.75" cy="10.55" r="0.20" fill="#ffe090"/>
  <circle cx="15.65" cy="10.55" r="0.14" fill="#ffd060"/>
  <!-- Warm smile -->
  <g transform="rotate(-2 12 13.3)">
    <path d="M10.8 13.3 Q10.8 13 12 13 Q13.2 13 13.2 13.3 A1.1 1 0 0 1 10.8 13.3 Z" fill="#2a1004"/>
  </g>
  <!-- Left arm lowered -->
  <g transform="translate(0.3 1.0) rotate(-10 2.5 11)">
    <path fill="#f0a828" d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z"/>
  </g>
  <!-- Right arm waving up -->
  <g transform="translate(-0.1 0.8) rotate(-20 19.5 6)">
    <path fill="#f0a828" d="M20.8 2.5 L22.2 2.5 A0.8 0.8 0 0 1 23 3.3 L23 5.7 A0.8 0.8 0 0 1 22.2 6.5 L20.8 6.5 A0.8 0.8 0 0 1 20 5.7 L20 3.3 A0.8 0.8 0 0 1 20.8 2.5 Z"/>
  </g>
  <!-- Legs -->
  <rect fill="#f0a828" x="7.2" y="17" width="3.5" height="4" rx="1.2"/>
  <rect fill="#f0a828" x="13.3" y="17" width="3.5" height="4" rx="1.2"/>
  <!-- Dust motes -->
  <circle cx="3.5" cy="11"  r="0.45" fill="#ffc030" opacity="0.70"/>
  <circle cx="20.8" cy="8" r="0.38" fill="#ffe090" opacity="0.65"/>
  <circle cx="22"  cy="13" r="0.32" fill="#ffc030" opacity="0.50"/>
</svg>`;

export const GOLDEN_SHOCKED = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <!-- Warm light wash -->
  <rect x="4.5" y="4.0" width="5.5" height="9" rx="2" fill="#ffc030" opacity="0.05"/>
  <!-- Body with tall oval eye cutouts — wide-eyed surprise -->
  <path fill="#f0a828" fill-rule="evenodd" d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M9.5 7.8 A1.2 2.2 0 1 0 9.5 12.2 A1.2 2.2 0 1 0 9.5 7.8 Z M14.5 7.8 A1.2 2.2 0 1 0 14.5 12.2 A1.2 2.2 0 1 0 14.5 7.8 Z"/>
  <!-- O-shaped mouth -->
  <ellipse cx="12" cy="13.8" rx="0.9" ry="1.1" fill="#5a3800"/>
  <!-- Arms — raised outward -->
  <g transform="rotate(20 2.5 11)"><path fill="#f0a828" d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z"/></g>
  <g transform="rotate(-20 21.5 11)"><path fill="#f0a828" d="M20.8 9 L22.2 9 A0.8 0.8 0 0 1 23 9.8 L23 12.2 A0.8 0.8 0 0 1 22.2 13 L20.8 13 A0.8 0.8 0 0 1 20 12.2 L20 9.8 A0.8 0.8 0 0 1 20.8 9 Z"/></g>
  <!-- Legs -->
  <rect fill="#f0a828" x="7.2" y="17" width="3.5" height="4" rx="1.2"/>
  <rect fill="#f0a828" x="13.3" y="17" width="3.5" height="4" rx="1.2"/>
  <!-- Dust motes -->
  <circle cx="6.5" cy="6.0" r="0.40" fill="#ffc030" opacity="0.70"/>
  <circle cx="8.5" cy="4.5" r="0.30" fill="#ffe090" opacity="0.55"/>
  <circle cx="20.5" cy="11.5" r="0.28" fill="#ffe090" opacity="0.35"/>
</svg>`;
