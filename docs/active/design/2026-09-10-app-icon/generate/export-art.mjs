import fs from 'fs';
const { mascot, EYES } = await import('./r4lib.mjs');
const art = mascot(EYES.white, '#4A1F66');
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -5 30 30">
  <!-- The app icon's mascot, picked by Destin 2026-09-10 over four review rounds
       (youcoded-dev docs/active/design/2026-09-10-app-icon/, generator in its generate/ folder).
       Made once from the rig library's sticker skin (wecoded-themes mascots/skins/sticker.svg) and
       the face kit (theme-builder mascot-faces.mjs), in the app's "welcome" pose (the wave):
       body #8B47B8, white sparkle eyes, deep purple #4A1F66 die-cut edge.
       Every app, installer and Android icon is built from this file by scripts/build-icons.mjs.
       Change the drawing here, rerun the script, and never hand-edit the PNG/ICO/ICNS it writes. -->
${art.trim()}
</svg>
`;
fs.writeFileSync('/home/destin/youcoded-dev/worktrees/sessions/installer-rename-cleanup/youcoded/desktop/assets/icon-mascot.svg', out);
console.log('wrote icon-mascot.svg', out.length, 'bytes; faces:', (out.match(/rig-face-/g) || []).length);
