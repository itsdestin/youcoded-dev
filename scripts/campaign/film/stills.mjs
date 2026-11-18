// Quick review frames: node stills.mjs <compositionId> <scale> <sec> [sec…] → out/review/<id>-<sec>.png
// WHY: bundling once and rendering only the frames that matter is ~10x faster than a draft
// render when checking framing.
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
const [id, scale, ...secs] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: new URL('./src/index.ts', import.meta.url).pathname });
const browserExecutable = '/usr/bin/google-chrome-stable';
const composition = await selectComposition({ serveUrl, id, browserExecutable });
mkdirSync('out/review', { recursive: true });
for (const sec of secs) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(sec) * composition.fps));
  await renderStill({ serveUrl, composition, frame, output: `out/review/${id}-${String(sec).padStart(6, '0')}.png`, scale: Number(scale), browserExecutable });
}
console.log('done');
