import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Dev-only visual fixture: keep the sample/derivation readable in its own file,
// rather than hiding it inside one long escaped JSON eval string.
const folder = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(folder, 'wallpaper-ink-tuner.js'), 'utf8');
const expression = `(async () => {
  // Session status arrives after theme paint; sample the finished strip, not
  // the first half-hydrated frame (which lacks the seven inactive dots).
  await new Promise((resolve, reject) => {
    if (document.querySelector('.session-dot[data-status="gray"]')) return resolve();
    const observer = new MutationObserver(() => {
      if (document.querySelector('.session-dot[data-status="gray"]')) { observer.disconnect(); clearTimeout(timer); resolve(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('inactive sessions never mounted')); }, 5000);
  });
  return await ${source};
})()`;
const plan = {
  base: 'http://127.0.0.1:5233/?mode=workbench&child=1&scenario=default&chrome=float&pop=bordered',
  width: 1440, height: 900, boot: 2800, sameThreshold: 0.001,
  shots: [{
    name: 'tuned-ink',
    actions: [{ eval: expression }],
    expect: "js:window.__inkPreview?.sampled === true && !!document.querySelector('#wallpaper-ink-preview')",
    probe: false,
    sameAsBaseline: false,
  }],
};
writeFileSync(join(folder, 'wallpaper-ink-tuned.shots.json'), JSON.stringify(plan, null, 2) + '\n');
